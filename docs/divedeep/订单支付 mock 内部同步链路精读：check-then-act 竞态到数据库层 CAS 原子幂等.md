# 订单支付 mock 内部同步链路精读：check-then-act 竞态到数据库层 CAS 原子幂等

**关联**：ADR-0004（mock 支付 · D1 + AD1）· feature 0004
**关键词**：三层架构（Controller-Service-Mapper）、mock 支付、幂等（Idempotence）、check-then-act 竞态（Race Condition）、TOCTOU（Time-Of-Check to Time-Of-Use）、CAS（Compare-And-Set，比较并置位）、乐观锁（Optimistic Lock）、悲观锁（Pessimistic Lock）/ `SELECT ... FOR UPDATE`、版本号（Version）乐观锁、ThreadLocal 请求上下文、归属校验（越权 / IDOR）、异常驱动 + 全局兜底、WebSocket 来单提醒
**创建时间**：2026-07-23 08:52

---

## 〇、阅读这条链路前，先建立"全景地图"

这条链解决的核心问题一句话：**顾客点"确认支付"，后端把这笔订单从「待付款」原子地翻成「待接单 / 已支付」，且无论前端点几次、并发打几次，都只会成功翻一次。**

它是苍穹外卖 C 端重建 ③（0004）的核心。原项目这里走的是**微信 JSAPI 支付**（要真商户证书、要 openid、支付结果靠微信异步回调），fresh 环境根本跑不通；0004 把它换成 **mock 内部同步支付**——不出网、不回调，`payment()` 在一次请求内直接把订单置为已支付。

用餐厅打比方，整条链上的角色和之前登录链一样各司其职，只是这次"厨师长"要做的判断变成了"这张单能不能付、会不会被付两次"：

| 角色 | 项目中的层 | 职责 | 类比 |
|---|---|---|---|
| 前台收银员 | `OrderController` | 接客、收单、把结果端出去 | 只对接顾客，不做支付判断 |
| 厨师长 | `OrderServiceImpl` | 取单、校验归属、原子置已支付、推来单提醒 | 真正"做判断"的地方 |
| 仓库管理员 | `OrderMapper` (+XML) | 按订单号去库里取单 / 执行那条"只在未支付时才置位"的 SQL | 只和数据库打交道 |
| 冷库 | MySQL `orders` 表 | 订单状态的唯一真相源 | 谁说了算，最终看这里 |

**断点调试时，程序会按这个顺序在文件间跳转**（记住这张图，后面每一步都对应这里的一行）：

```
前端 PUT /user/order/payment   （JSON: {orderNumber, payMethod:1}；请求头带 Authorization: Bearer <JWT>）
   │  [请求进 Controller 前，0001 的 JWT 拦截器已解析 token、把 userId 塞进 BaseContext(ThreadLocal)]
   ▼
① OrderController.payment()                       [sky-server] 接客
   │  orderService.payment(dto)
   ▼
② OrderServiceImpl.payment()                      [sky-server] 厨师长
   │  1. BaseContext.getCurrentId()  → 拿当前登录 userId（不信前端传的任何 id）
   │  2. orderMapper.getByNumberAndUserId(orderNumber, userId)   ← 取单 + 归属校验
   ▼
③ OrderMapper.getByNumberAndUserId → OrderMapper.xml   [sky-server] 取单
   │  select * from orders where number=? and user_id=?
   ▼
④ MySQL 返回一行 Orders（或 null）→ 原路回到 ②
   │  null → throw OrderBusinessException("订单不存在")   （不存在 / 不属于我，都在这拦）
   ▼
②’ orderMapper.updateToPaidIfUnpaid(orderNumber, userId)   ← 关键：一条原子 CAS
   ▼
⑤ OrderMapper.updateToPaidIfUnpaid → OrderMapper.xml   [sky-server] 置位
   │  update orders set status=2, pay_status=1, checkout_time=now()
   │  where number=? and user_id=? and pay_status=0     ← WHERE 里的 pay_status=0 就是"比较"
   ▼
⑥ MySQL 返回【影响行数】→ 原路回到 ②
   │  affected==0 → throw OrderBusinessException("该订单已支付")   （原子幂等：我没抢到，说明已被付过）
   │  affected==1 → 推 WebSocket 来单提醒（type=1 + orderId + 订单号）
   ▼
①’ 回到 Controller → return Result.success()
   │
   ▼
{ "code":1, "msg":null, "data":null }  →  JSON 返回前端，前端凭 code===1 跳支付成功页
```

> 跨模块细节：`OrderController` / `OrderServiceImpl` / `OrderMapper`(+XML) 都在 **`sky-server`** 模块；`OrdersPaymentDTO`、`Orders` 实体在 **`sky-pojo`**；`BaseContext`、`OrderBusinessException`、`BaseException`、`Result`、`MessageConstant` 在 **`sky-common`**；`WebSocketServer` 在 **`sky-server`**。一次支付请求横跨三个 Maven 子模块。

下面进入断点逐步走读。

---

## 一、第 ① 步：请求落到 Controller

**文件**：`sky-server/src/main/java/com/sky/controller/user/OrderController.java`

```java
@RestController("userOrderController")
@RequestMapping("/user/order")          // 这个类下所有接口的公共前缀
@Slf4j
@Api(tags = "C端-订单接口")
public class OrderController {

    @Autowired
    private OrderService orderService;   // 注入 Service 接口（不是实现类）

    @PutMapping("/payment")              // 完整路径 = PUT /user/order/payment
    @ApiOperation("订单支付")
    public Result payment(@RequestBody OrdersPaymentDTO ordersPaymentDTO) {
        log.info("订单支付：{}", ordersPaymentDTO);
        orderService.payment(ordersPaymentDTO);   // 只调一次 Service
        return Result.success();                  // 成功即可，不回传数据
    }
    // …… submit / historyOrders / cancel 等其他接口略
}
```

**断点观察 —— 进方法体第一行之前，框架已替我们做了三件事**（和登录链同理）：

1. **路由匹配**：`@RequestMapping("/user/order")` + `@PutMapping("/payment")` 拼出 `PUT /user/order/payment`，`DispatcherServlet` 据此找到本方法。
2. **请求体反序列化**：`@RequestBody` 把 JSON `{"orderNumber":"...","payMethod":1}` 用 Jackson 转成 `OrdersPaymentDTO`。
3. **认证已在更上游完成**：这是需登录接口，请求头带 `Authorization: Bearer <JWT>`。**在请求进到 Controller 之前**，0001 引入的 JWT 拦截器已经解析出用户 id 并存进了 `BaseContext`（见第二节的配角说明）。所以 Controller / Service 里都不用、也**不该**从请求体里读 userId。

**这一层的职责边界**：Controller 只"对接 I/O"——收参、调一次 Service、包装返回，**不写任何支付判断**。注意这次的返回签名是**裸 `Result`**（不是 `Result<某VO>`）：0004 mock 支付的响应"成功即可"，`data` 恒为 `null`。

> 对比一下改造前：原微信版这里是 `public Result<OrderPaymentVO> payment(...) throws Exception`，要把微信返回的预支付 5 个字段（`nonceStr`/`paySign`/`timeStamp`/`signType`/`packageStr`）包成 `OrderPaymentVO` 回给前端去唤起 `wx.requestPayment`。我们是 Web、没有 `wx.requestPayment`，这 5 个字段完全无用，所以 0004 把 `OrderPaymentVO` 整个删了、返回简化成 `Result.success()`。

### 配角 A：`OrdersPaymentDTO`（前端 → 后端 的入参）

**文件**：`sky-pojo/src/main/java/com/sky/dto/OrdersPaymentDTO.java`

```java
@Data
public class OrdersPaymentDTO implements Serializable {
    //订单号
    private String orderNumber;
    //付款方式
    private Integer payMethod;
}
```

- **为什么需要它（DTO，Data Transfer Object，数据传输对象）**：支付这个动作前端只需要告诉后端"付哪张单"（`orderNumber`）和"用什么方式"（`payMethod`）。用一个只含这两个字段的瘦类接参，而不是把整个 `Orders` 实体暴露给前端填。
- **`payMethod` 在 mock 里是"仪式性"字段**：前端定死传 `1`（"微信支付（模拟）"）。订单真正的 `payMethod` 在 0003 下单（`submitOrder`）时就已写库，`payment()` **不重复持久化它**——所以你会看到下面 Service 里压根没用到 `ordersPaymentDTO.getPayMethod()`。留着这个字段只是为了对齐 reference 的契约形状。
- **`@Data`** 是 Lombok 注解，编译期生成 getter/setter/toString，`log.info("订单支付：{}", ordersPaymentDTO)` 能打印靠的就是它生成的 `toString()`。

---

## 二、第 ① 行代码触发跳转：进入 Service

断点单步进入 `orderService.payment(ordersPaymentDTO)`。注入的是 `OrderService`**接口**，运行时执行的是 `OrderServiceImpl`（面向接口编程 + 依赖注入，理由同登录链，不重复）。

**文件**：`sky-server/src/main/java/com/sky/service/impl/OrderServiceImpl.java`

```java
/**
 * 订单支付(mock 内部同步支付)
 */
@Override
public void payment(OrdersPaymentDTO ordersPaymentDTO) {
//        当前登录用户id
    Long userId = BaseContext.getCurrentId();

//        根据订单号 + 当前用户id 取单，校验订单存在且归属当前用户（防越权）
    String orderNumber = ordersPaymentDTO.getOrderNumber();
    Orders orderDB = orderMapper.getByNumberAndUserId(orderNumber, userId);
    if (orderDB == null) {
        throw new OrderBusinessException(MessageConstant.ORDER_NOT_FOUND);
    }

//        原子 CAS 置已支付：仅当 pay_status=0 时置位，按影响行数判成败（0=已被支付过→拒；1=本次置位成功）
    int affected = orderMapper.updateToPaidIfUnpaid(orderNumber, userId);
    if (affected == 0) {
        throw new OrderBusinessException("该订单已支付");
    }

//        置位成功，通过WebSocket实现来单提醒，向客户端浏览器推送消息
    HashMap map = new HashMap();
    map.put("type", 1);
    map.put("orderId", orderDB.getId());
    map.put("content", "订单号：" + orderNumber);
    webSocketServer.sendToAllClient(JSON.toJSONString(map));
}
```

这段代码就是整条链的"心脏"。断点单步走读，一行一行看它在干什么、数据此刻是什么状态：

**（1）`Long userId = BaseContext.getCurrentId();` —— 我是谁，只认服务端**

拿到当前登录用户 id。**关键：来源是 `BaseContext`（服务端 ThreadLocal），不是请求体。** 这是安全的地基——后面取单和置位都会带上这个 `userId` 做归属过滤，前端伪造不了别人的身份。

**（2）`orderMapper.getByNumberAndUserId(orderNumber, userId)` —— 取单 + 归属校验，一步两用**

这行触发跳转进第三节（Mapper）。它按 `订单号 + 当前用户id` 双条件查库：
- 查不到 → 要么这张单**不存在**，要么它**不属于当前用户**（拿了别人的单号来付）。两种情况都返回 `null`，都在下一行被 `throw` 拦掉。
- 这就是**归属校验（防越权）**：不用单独写一句 `if (!order.userId.equals(userId))`，而是把"是我的单"直接编进查询条件。查不到即拒，既不泄露"这单是否存在"，也改不了别人的单。

`orderDB == null` → `throw new OrderBusinessException(MessageConstant.ORDER_NOT_FOUND)`（"订单不存在"）。这里用了**异常驱动**：不返回错误码，直接抛，后面的代码全部中断，由全局异常处理器兜底转成 `Result.error(...)`（配角 D）。

**（3）`int affected = orderMapper.updateToPaidIfUnpaid(orderNumber, userId);` —— 本篇的主角：原子 CAS**

**这一行是整条链最需要讲透的地方**，单独放到第四、五节展开。先记住它的形状：它**不是**"先查 payStatus 再决定要不要 update"，而是把"检查（还没付）"和"更新（置已支付）"压进**一条 SQL**，返回**影响了几行**。

**（4）`if (affected == 0) throw ... "该订单已支付";` —— 按影响行数判成败**

- `affected == 1`：这条 SQL 真的改动了 1 行 → **是我这次请求把它从未支付翻成了已支付**，我赢了。
- `affected == 0`：SQL 一行都没改 → 说明 `WHERE ... and pay_status=0` 没命中，也就是**这单此刻已经不是"未支付"了**（已被别的请求 / 上一次点击付掉了）→ 拒绝，抛"该订单已支付"。

**（5）`affected == 1` 才会走到的推送**：构造一个 `Map{type:1, orderId, content:"订单号：..."}`，`JSON.toJSONString` 序列化后 `webSocketServer.sendToAllClient(...)` 群发给商家端浏览器——就是商家后台"叮咚，来新订单了"的**来单提醒**。

**断点观察此刻的数据状态**：走到推送这行时，MySQL 里这张订单已经是 `status=2（待接单）、pay_status=1（已支付）、checkout_time=当前时刻`。`orderDB` 变量里存的还是**取单那一刻的旧值**（`pay_status=0`），但我们推送只用它的 `getId()`，不受影响。

> 一个容易忽略的正确性细节：推送代码在 `if (affected == 0) throw` **之后**。也就是说——**只有置位成功（affected==1）的那一次请求，才会推来单提醒**。重复支付（affected==0）会在 throw 处中断，**根本走不到推送**。所以"重复点击不会重复提醒商家"这个性质，是靠代码结构 + CAS 一起保证的。

---

## 三、第 ③ 步：取单 Mapper 接口 + XML

`OrderMapper` 只有接口、没有实现类，SQL 靠 MyBatis 动态代理按"接口全限定名 namespace + 方法名 id"匹配 XML 执行（原理同登录链，不重复）。

**文件**：`sky-server/src/main/java/com/sky/mapper/OrderMapper.java`

```java
@Mapper
public interface OrderMapper {

    /** 根据订单号和用户id查询订单 */
    Orders getByNumberAndUserId(@Param("orderNumber") String orderNumber, @Param("userId") Long userId);

    /**
     * 原子 CAS 置已支付:仅当订单存在、归属该用户、且当前未支付(pay_status=0)时,
     * 一条 SQL 置 status=待接单(2)/pay_status=已支付(1)/checkout_time=now()。
     * @return 影响行数(1=本次置位成功;0=不存在/非本人/已支付)
     */
    int updateToPaidIfUnpaid(@Param("orderNumber") String orderNumber, @Param("userId") Long userId);

    // …… insert / update / pageQuery / getById 等略
}
```

- **`@Param("orderNumber")` / `@Param("userId")`**：给参数命名，XML 里用 `#{orderNumber}` / `#{userId}` 引用。
- 注意 `updateToPaidIfUnpaid` 的返回类型是 **`int`**——这就是"影响行数"。MyBatis 对 `<update>` 标签默认返回受影响的行数（JDBC `PreparedStatement.executeUpdate()` 的返回值）。**这个 int 是整个原子幂等方案的判定依据**，返回类型选 `int` 而不是 `void`，是刻意的。

**文件**：`sky-server/src/main/resources/mapper/OrderMapper.xml`

```xml
<!-- 取单：按 订单号 + 用户id 双条件查 -->
<select id="getByNumberAndUserId" resultType="com.sky.entity.Orders">
    select *
    from orders
    where number = #{orderNumber}
      and user_id = #{userId};
</select>
```

- `#{}` 是**预编译占位符**（`PreparedStatement` 传参），天然防 SQL 注入。
- `resultType="com.sky.entity.Orders"`：把查到的那一行按"列名→驼峰属性"映射成 `Orders` 实体；查无则返回 `null`。
- **`and user_id = #{userId}` 就是归属校验的落点**：别人的单号配上我的 userId，查不到 → `null` → 上层拒。

---

## 四、CAS 是什么，先讲"不用它会出什么事"（check-then-act 竞态）

> 严格按"为什么需要它 → 它是什么 → 在项目里怎么用"来讲。这一节先讲"为什么"。

### 为什么需要 CAS：一个"看起来没问题"的两步式写法藏着竞态

设想我们**不用** CAS，用最直觉的写法（这也正是 0004 评审里被揪出来的原设计思路）：

```java
// ❌ 反面写法：check-then-act（先检查，再动作）
Orders o = orderMapper.getByNumberAndUserId(orderNumber, userId);
if (o.getPayStatus() == Orders.UN_PAID) {   // 第 1 步：检查"还没付"
    // …… 中间这段时间，别的线程可能也走到了这里 ……
    orderMapper.update(置已支付 + checkoutTime);   // 第 2 步：动作"置已支付"
    webSocketServer.sendToAllClient(来单提醒);       // 副作用：提醒商家
}
```

单线程跑，它完全正确。问题出在**并发**——顾客手抖**双击**"确认支付"，或网络重发，两个请求几乎同时到达：

```
时间线 →
线程 A: 查到 pay_status=0 ✔（检查通过）
线程 B:                     查到 pay_status=0 ✔（检查也通过！因为 A 还没来得及写库）
线程 A:                                        update 置已支付 + 推送提醒（第 1 次）
线程 B:                                                          update 又置一次 + 推送提醒（第 2 次！）
```

两个请求都在"检查"那一刻看到"还没付"，于是**都通过了检查、都执行了动作** → 订单被置位两次、**来单提醒推了两次**（商家听到两声叮咚，以为来了两单）。更糟的场景：一个"支付"线程和一个"取消"线程并发，可能出现"既支付又取消"的错乱状态。

这类 bug 有个正式名字：**check-then-act 竞态（Race Condition）**，也叫 **TOCTOU（Time-Of-Check to Time-Of-Use，检查时刻与使用时刻之间存在空隙）**。病根就是：**"检查"和"动作"是两步、中间有缝，多个线程能挤进这条缝同时通过检查。**

**类比（MMORPG 抢装备）**：Boss 掉了一件唯一装备，规则是"没人认领才能捡"。服务器如果这么写——"先查『这件装备还没人领吗？』→ 是 → 把它给你"，那么两个玩家同一帧点"拾取"，会**同时**查到"没人领"，于是服务器**给了两个人**同一件装备，凭空多出一件。正确做法是服务器一步到位地"**只有在无人认领时，才把它记到你名下**"——谁的那一步真正改动了归属记录，谁就得到，另一个人的操作自然落空。

### 补充：0004 为什么"恰好"要补这层幂等

有意思的一点：微信支付版**本来是有幂等的**——原 `payment()` 调 `weChatPayUtil.pay(...)`，如果这单已经付过，微信会返回错误码 `ORDERPAID`，代码据此抛"该订单已支付"。也就是说，那层"重复支付防护"是**微信平台帮我们做的**。

0004 把微信支付整个删掉后，`ORDERPAID` 这层幂等也**一起没了**。如果只是简单地"内部改个状态"，就等于把一个原本有防护的地方改成了裸奔。**CAS 正是用来把这层丢掉的幂等补回来**——而且补得比原来更干净（数据库层原子，不依赖外部平台）。这就是评审（ADR-0004 AD1）最终拍板"顺手上 CAS"的来龙去脉。

---

## 五、第 ⑤ 步：CAS 的"是什么"和"怎么用"——那条原子 SQL

**文件**：`sky-server/src/main/resources/mapper/OrderMapper.xml`

```xml
<!--    原子 CAS 置已支付:status=2(待接单) / pay_status=1(已支付) / checkout_time=now();
        仅当 number 匹配、user_id 归属、且 pay_status=0(未支付) 时才置位,按影响行数判成败-->
<update id="updateToPaidIfUnpaid">
    update orders
    set status = 2, pay_status = 1, checkout_time = now()
    where number = #{orderNumber} and user_id = #{userId} and pay_status = 0
</update>
```

### 它是什么：把"检查"焊进"动作"的一条 SQL

看这条 SQL 的 `WHERE`：`... and pay_status = 0`。这个条件就是"检查（还没付吗）"，而 `SET pay_status = 1` 就是"动作（置已支付）"。二者在**同一条 UPDATE 语句**里，由数据库**原子**执行——**不存在"检查完到动作前"的那条缝**。

这正是 **CAS（Compare-And-Set，比较并置位）** 的思想：
- **Compare（比较）**：`WHERE pay_status = 0` —— 期望它当前是"未支付"。
- **Set（置位）**：`SET pay_status = 1, status = 2, checkout_time = now()` —— 只有比较成立才真正写进去。

数据库对同一行的 UPDATE 会加行锁串行执行，所以两个并发请求里，**只有一个**能满足 `pay_status=0` 并改成 `pay_status=1`；等第二个请求执行到时，`pay_status` 已经是 1，`WHERE` 不命中，**它一行都改不动**。

### 怎么用：靠"影响行数"判断"我是不是那个赢家"

数据库执行完 UPDATE 会返回**影响了几行**，MyBatis 把它作为方法的 `int` 返回值交回 Service：

| 影响行数 | 含义 | Service 的动作 |
|---|---|---|
| `1` | `WHERE` 命中、这行被我改了 → **我是把它翻成已支付的那个人** | 推来单提醒，正常返回 |
| `0` | `WHERE` 没命中、一行没改 → 要么单不存在/非本人（已被取单拦掉），要么**已经是已支付** | 抛"该订单已支付" |

所以第二节里那句 `if (affected == 0) throw "该订单已支付"`，本质是在问数据库：**"刚才那下，是我抢到的吗？"** 抢到（1）才推送，没抢到（0）就拒。判定权完全交给数据库的原子性，Service 自己不做任何"先查后判"。

**回到 MMORPG 类比**：CAS 就是服务器那句"`UPDATE 装备 SET 归属=你 WHERE 归属 IS NULL`"。谁执行时归属还是空的，谁的这条语句 affected=1（抢到）；后到的人 affected=0（已被抢），系统据此告诉他"手慢了"。整个过程没有"先看一眼再决定"的空隙。

### 一个常被追问的点：为什么 `payment()` 不加 `@Transactional`？

你会注意到，隔壁 `submitOrder()`（0003 下单）加了 `@Transactional`，因为它要"建订单 + 建明细 + 清购物车"**三写要么全成要么全不成**。而 `payment()` **没加**——因为它的原子性**由单条 CAS SQL 自己保证**（单条 UPDATE 本身就是原子的），没有"多条写要捆在一起"的诉求。而且后面的 WebSocket 推送失败也**不应该**回滚"已支付"（钱都算付了，不能因为一条提醒没推成功就把订单打回未支付）。所以这里刻意不加事务。

---

## 六、第 ⑥ 步 → 回到 Service：推送 + 原路返回

CAS 返回 `affected==1`，断点回到 Service 最后三行——推来单提醒。

### 配角 B：`WebSocketServer.sendToAllClient`（来单提醒的出口）

**文件**：`sky-server/src/main/java/com/sky/websocket/WebSocketServer.java`

```java
@Component
@ServerEndpoint("/ws/{sid}")
public class WebSocketServer {
    //存放会话对象
    private static Map<String, Session> sessionMap = new HashMap();

    // …… onOpen / onMessage / onClose 略（维护 sessionMap）

    /** 群发 */
    public void sendToAllClient(String message) {
        Collection<Session> sessions = sessionMap.values();
        for (Session session : sessions) {
            try {
                session.getBasicRemote().sendText(message);   // 服务器主动向客户端推消息
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
    }
}
```

- **为什么需要 WebSocket**：普通 HTTP 是"前端问、后端答"，后端**没法主动**通知前端"来新订单了"。WebSocket（一种全双工长连接）让服务器能**主动 push** 消息给已连接的客户端——商家后台挂着这个连接，顾客一支付，后端就把"来单提醒"推过去。
- **在这条链里怎么用**：Service 把 `{type:1, orderId, content:"订单号：..."}` 序列化成 JSON，群发给所有连着的商家端。`type=1` 是"来单提醒"的约定类型码（另有催单等）。
- 注意 `sendToAllClient` 内部 `try-catch` 吞掉了异常（只打印堆栈）——一条连接推失败不影响主流程，也印证了"推送失败不该回滚已支付"。

### 配角 C：`BaseContext`（当前登录用户的 ThreadLocal 上下文）

**文件**：`sky-common/src/main/java/com/sky/context/BaseContext.java`

```java
public class BaseContext {
    public static ThreadLocal<Long> threadLocal = new ThreadLocal<>();

    public static void setCurrentId(Long id) { threadLocal.set(id); }
    public static Long getCurrentId() { return threadLocal.get(); }
    public static void removeCurrentId() { threadLocal.remove(); }
}
```

- **为什么需要它**：Service / Mapper 到处都要"当前是谁"，但总不能每个方法都从 Controller 一路把 userId 当参数传下来。用 **ThreadLocal（线程本地变量）** 把 userId 挂在"当前请求线程"上，链路上任何地方 `getCurrentId()` 就能拿到，像给这次请求配了个"随身工牌"。
- **它是什么 / 怎么填进去的**：`ThreadLocal` 让每个线程各有一份独立副本，互不干扰。Web 容器一个请求分配一个线程处理，所以"线程本地"约等于"请求本地"。**值是谁写进去的？** 是 0001 的 JWT 拦截器——请求进 Controller 前，拦截器解析 `Authorization: Bearer <token>`，取出里面的用户 id，`BaseContext.setCurrentId(id)`。请求结束再 `removeCurrentId()` 清理（否则线程被复用时会串号）。
- **在这条链里**：`payment()` 第一行 `BaseContext.getCurrentId()` 拿到的就是拦截器塞进来的 userId。**mock 同步支付的关键前提**：`payment()` 是在"有 JWT 的请求线程"里同步执行的，所以 ThreadLocal 里一定有值。（反观原微信版的异步回调 `PayNotifyController`，是微信服务器回调过来的、**没有 JWT、没有这个上下文**——那本是原实现的一个坑，随 0004 删掉回调一并消失了。）

### 配角 D：异常体系 + 全局兜底（这条链的两处 throw 谁接住）

`payment()` 里两处 `throw new OrderBusinessException(...)`。异常类很薄：

**文件**：`sky-common/src/main/java/com/sky/exception/OrderBusinessException.java`

```java
public class OrderBusinessException extends BaseException {
    public OrderBusinessException(String msg) { super(msg); }
}
```

**文件**：`sky-common/src/main/java/com/sky/exception/BaseException.java`

```java
/** 业务异常 */
public class BaseException extends RuntimeException {   // 继承 RuntimeException = 非受检异常
    public BaseException() {}
    public BaseException(String msg) { super(msg); }
}
```

- `OrderBusinessException extends BaseException extends RuntimeException`：是**非受检异常（Unchecked Exception）**，所以 `payment()` 方法签名上不用写 `throws`，不污染调用链（对比改造前微信版 `payment(...) throws Exception`，0004 去掉了 `throws`）。
- 抛出去谁接？——全局异常处理器 `@RestControllerAdvice` + `@ExceptionHandler`（`GlobalExceptionHandler`，机制同登录链）。它把 `BaseException` 转成 `Result.error(ex.getMessage())`。
- **数据流**：Service `throw OrderBusinessException("该订单已支付")` → 冒泡，`payment()` 后续（推送）不执行、Controller 的 `return Result.success()` 也不执行 → 最外层被全局处理器捕获 → 转成 `{code:0, msg:"该订单已支付"}` 返回前端。前端 `code!==1` 弹 toast、不跳成功页。

其中"订单不存在"用的是常量而非裸串：

**文件**：`sky-common/src/main/java/com/sky/constant/MessageConstant.java`（节选）

```java
public static final String ORDER_NOT_FOUND = "订单不存在";
```

> 一个口径细节：**"该订单已支付"这句是直接写的中文字面量，没进 `MessageConstant`**。这是既有代码风格的小不一致（"订单不存在"走了常量、"该订单已支付"没走），不影响功能；真要规范，应把它也提成常量。读代码时留意这种"同类信息有的走常量有的裸串"的历史痕迹即可。

### 配角 E：统一返回 `Result`（成功那条路）

**文件**：`sky-common/src/main/java/com/sky/result/Result.java`（节选）

```java
@Data
public class Result<T> implements Serializable {
    private Integer code; //编码：1成功，0和其它数字为失败
    private String msg;   //错误信息
    private T data;       //数据

    public static <T> Result<T> success() {          // ← 本链路用的就是这个无参重载
        Result<T> result = new Result<T>();
        result.code = 1;
        return result;
    }
    public static <T> Result<T> success(T object) { /* data=object, code=1 */ }
    public static <T> Result<T> error(String msg)  { /* msg=..., code=0 */ }
}
```

- Controller 成功时 `return Result.success()`（**无参重载**）：只设 `code=1`，`data` 保持 `null`。序列化成 `{"code":1,"msg":null,"data":null}`。
- 前端 `request.ts` 的拦截器拿到整个 `Result`，页面凭 `res.code === 1` 判成功、跳支付成功页；`code!==1` 则弹 `res.msg`。这就是"成功即可"契约在前后端两侧的对齐。

---

## 七、总结与思考（比读懂源码更重要的部分）

> **学习心法**：类名、表名换个项目就变，但"怎么在并发下安全地翻一个状态位"这个套路是通用的。面试官不会问"苍穹外卖 payment 第几行"，但很可能让你"设计一个防重复支付 / 防超卖的接口"。所以要内化的是下面这些**可迁移的套路**，不是背代码。

### 1. 必背套路一：check-then-act 有竞态，能压成一条原子操作就别分两步

**口诀**：`先查再改必有缝，一条 SQL 焊死它。`

- 反模式：`SELECT 查状态 → if 判断 → UPDATE 改状态`。检查和动作之间有时间窗，并发下多个线程一起通过检查 → 重复副作用（重复置位、重复提醒），甚至状态错乱。
- 正解：把检查写进 UPDATE 的 `WHERE`：`UPDATE ... SET x=新值 WHERE 主键=? AND x=旧值`，靠**影响行数**判成败。数据库对单行 UPDATE 天然串行+原子，天生无缝。
- 这就是**数据库层的 CAS（Compare-And-Set）**，等价于 Java 里 `AtomicInteger.compareAndSet(expect, update)` 的思路，只是搬到了持久层。

> ⚠️ 面试追问："那我给 `if` 那段加 `synchronized` 行不行？" → 单机可缓解，但**多实例部署下 `synchronized` 只锁得住本 JVM**，两台机器上的两个请求照样竞态。CAS（或分布式锁）才是跨实例安全的。

### 2. 必背套路二：删掉一个外部依赖，要盘点它"顺带提供了什么保证"

**口诀**：`拆依赖先问它替你挡了什么，别把防护一起拆没了。`

- 0004 删微信支付，顺手把微信 `ORDERPAID` 提供的"重复支付防护"也删了。如果没意识到，就会留下一个"看起来能跑、并发下出错"的隐患。
- 识别出来后用 CAS 主动补回。**"删外部依赖 = 要自己接管它隐含的职责"**——这个意识本身就是工程成熟度的体现，也是本功能最值钱的故事。

### 3. 必背套路三：归属校验编进查询条件，而非事后 if

**口诀**：`"是我的单"写进 WHERE，查不到即拒。`

- `getByNumberAndUserId(orderNumber, userId)` + CAS 的 `WHERE ... and user_id=#{userId}` —— **取单时拦一道、置位时再拦一道**，双保险。
- 好处：不泄露"这单是否存在"，也改不动别人的单。这是防**越权 / IDOR（Insecure Direct Object Reference，不安全的直接对象引用）** 的标准手法（0003 地址簿 D6 也是同一招）。
- ⚠️ 反面教材就在同一个类里：`userCancelById(id)` 用的是 `getById(id)`（**只按 id、不带 userId**），存在 IDOR，已记 0005 backlog。同一份代码里"有的防了、有的没防"，正好对照着学。

### 4. 必背套路四：ThreadLocal 请求上下文 —— "当前是谁"不靠层层传参

**口诀**：`身份挂线程，全链随手取，出门记得清。`

- JWT 拦截器把 userId 塞进 `BaseContext(ThreadLocal)`，Service/Mapper 随处 `getCurrentId()`。
- ⚠️ 两个必须知道的坑：①线程池复用线程 → 请求结束必须 `remove()`，否则下一个请求串到上一个人的身份；②异步/新线程里 ThreadLocal **取不到值**（原微信异步回调就踩过）——所以 mock 支付必须是"请求线程内同步"执行。

### 5. 生产同款 vs 教学简化（面试要能分辨）

| 点 | 本项目做法 | 生产该怎样 |
|---|---|---|
| ✅ 单节点原子幂等 | 数据库层 CAS（`WHERE pay_status=0`） | **同款思路**；分布式高并发再叠去重键 / 分布式锁 |
| ✅ 归属校验 | 编进查询条件 | 同款 |
| ⚠️ 支付本身 | mock 内部同步、点一下就"已支付" | 真实是**异步**：前端拿 prepay 唤起支付 → 支付平台**异步 webhook 回调**商户后端；回调要**验签防伪造 + 幂等抗重复投递** |
| ⚠️ 金额 | 前端算好传后端、后端信任存库 | 生产必须**服务端重算/核对**金额，绝不信前端 |
| ⚠️ 退款 | `log.info("模拟退款")` | 真实调支付平台退款 API + 退款回调 |

---

## 八、面试官视角：这条链路我会怎么问（含口述答案）

> 假设我是 Java 后端面试官，看到你项目里做了"支付 / 防重复支付"，针对这条链路，我大概率会这么问。答案按"面试时能直接口述、30~60 秒讲完"的口语风格写。

**Q1：讲一下你这个支付接口的流程，以及它怎么保证不会重复支付？**
> 支付接口是 `PUT /user/order/payment`，传订单号和支付方式。Controller 只负责收参、调 Service、返回。核心在 Service：先从 ThreadLocal 拿当前登录用户 id，用"订单号 + 用户 id"查单，查不到就抛"订单不存在"，这一步同时做了存在性和归属校验。然后调一个原子的 CAS 更新——一条 `UPDATE orders SET status=2, pay_status=1, checkout_time=now() WHERE number=? AND user_id=? AND pay_status=0`，按影响行数判成败：改了 1 行说明是我这次把它置成已支付的，就推来单提醒；改了 0 行说明它已经是已支付了，就抛"该订单已支付"。防重复支付靠的就是这条 SQL 的原子性，而不是"先查后改"。

**Q2：什么是 check-then-act 竞态？你项目里为什么会有、又怎么解的？（核心）**
> check-then-act 就是"先检查一个条件、条件成立再执行动作"，检查和动作分成两步、中间有时间窗。并发下两个请求可能同时通过检查、都去执行动作，导致重复副作用。我这里如果写成"先 SELECT 查 pay_status 是不是 0、是就 UPDATE 置已支付"，顾客双击支付时两个请求会同时查到未支付、都去置位、都推一次来单提醒，商家就收到两次提醒。我的解法是把检查焊进更新——`UPDATE ... WHERE pay_status=0`，检查条件放进 WHERE，靠数据库对单行更新的原子性保证只有一个请求能命中并改成功，再用影响行数判断自己是不是那个成功的，从根上消掉了那条缝。

**Q3：CAS 是什么？为什么用"影响行数"来判断成败？**
> CAS 是 compare-and-set，比较并置位：只有当前值等于我期望的旧值时，才把它改成新值。我这条 UPDATE 里，`WHERE pay_status=0` 是"比较"（期望它还没付），`SET pay_status=1` 是"置位"，两者在一条语句里原子执行。数据库执行完 UPDATE 会返回影响了几行，MyBatis 把它作为 int 返回。影响 1 行代表 WHERE 命中、这次是我改的，我赢了；影响 0 行代表条件没命中、别人已经改过了。所以用影响行数判成败，本质是问数据库"这下是不是我抢到的"，判定权交给数据库的原子性，代码自己不做先查后判。

**Q4：数据库层 CAS（乐观锁）、`SELECT ... FOR UPDATE`（悲观锁）、版本号乐观锁，这三者什么区别，你为什么选 CAS？**
> 三种都能解并发更新。悲观锁 `SELECT ... FOR UPDATE` 是"先把行锁住再改"，假设冲突常发生，适合高争用、临界区复杂的场景，但要开事务、持锁期间别的请求阻塞，吞吐低。乐观锁是"假设冲突很少，不先锁，改的时候用条件卡一下"，我用的 `WHERE pay_status=0` 就是一种乐观锁——用业务状态本身当判据。版本号乐观锁是它的通用版，加一个 version 列，`UPDATE ... SET version=version+1 WHERE id=? AND version=?`，适合"任意字段更新都要防覆盖"的通用场景。我这里选状态位 CAS，是因为支付本质就是一次"未支付→已支付"的状态迁移，用 `pay_status=0` 当条件最直接、零额外字段、单条 SQL 原子、并发也几乎不冲突（同一单重复支付是偶发），所以乐观锁最合适；用悲观锁反而重了。

**Q5：你说删微信支付会"丢掉幂等"，这话怎么讲？你怎么补回来的？**
> 原来的支付是调微信下单接口，如果这单在微信侧已经支付过，微信会返回一个 ORDERPAID 的错误码，我们据此挡住重复支付。也就是说那层"重复支付防护"其实是微信平台帮我们做的。0004 要把微信支付整个删掉换成 mock，如果只是简单地内部改个状态位，就等于把这层防护也一起删了、并发下会重复置位。我意识到这点后，用数据库层的 CAS 主动把这层幂等补回来，而且比原来更干净——不依赖外部平台、就在一条 UPDATE 里保证原子。这件事对我最大的提醒是：删一个外部依赖前，要先盘清它顺带替你提供了什么保证，别把防护一起拆没了。

**Q6：这个支付方法为什么没加 `@Transactional`，而旁边的下单方法加了？**
> 事务是为了"多条写要么全成要么全不成"。下单方法要建订单、建订单明细、清购物车三次写，必须捆在一个事务里，任一失败全回滚，所以加了 `@Transactional`。支付方法只有一条 UPDATE，单条 SQL 本身就是原子的，没有多写需要捆绑，加事务没意义。而且后面那步推来单提醒是 WebSocket 副作用，就算推失败也不该把"已支付"回滚掉——钱都算付了不能因为一条通知没发出去就打回未支付。所以这里刻意不加事务，让原子性由那条 CAS 语句自己保证。

**Q7：支付时怎么防止用别人的订单号支付别人的单（越权）？**
> 两道防线，都不信前端。第一，当前用户 id 只从服务端的 ThreadLocal 取，那是 JWT 拦截器解析 token 塞进去的，前端伪造不了。第二，取单用"订单号 + 用户 id"双条件查，别人的单号配我的 id 查不到，直接抛订单不存在；置位的 CAS 语句 WHERE 里也带了 user_id，等于再拦一道。这样既不会泄露这单是否存在，也改不动别人的单。这是防 IDOR 的标准做法——把"是我的资源"编进查询条件，而不是查出来再用 if 判断。顺带说，同一个类里的用户取消订单方法目前只按订单 id 查、没带 user_id，是有越权风险的，我已经记进了下一个功能的待办里一起修。
