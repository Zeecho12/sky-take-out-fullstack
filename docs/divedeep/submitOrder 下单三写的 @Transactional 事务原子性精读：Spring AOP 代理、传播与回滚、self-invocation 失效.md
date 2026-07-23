# submitOrder 下单三写的 @Transactional 事务原子性精读：Spring AOP 代理、传播与回滚、self-invocation 失效

**关联**：feature 0003（地址簿 + 下单；0003 给 `submitOrder` 加了 `@Transactional`）
**关键词**：数据库事务（Transaction）、ACID 原子性（Atomicity）、声明式事务（Declarative Transaction）`@Transactional`、Spring AOP 动态代理（Dynamic Proxy，JDK Proxy / CGLIB）、传播行为（Propagation，默认 REQUIRED）、回滚规则（Rollback Rule，默认只回滚 `RuntimeException`/`Error`）、`rollbackFor`、self-invocation（自调用）失效、事务同步管理器（`TransactionSynchronizationManager`）与 ThreadLocal、`BaseContext`、MyBatis 批量插入 `<foreach>`、`useGeneratedKeys` 回填主键
**创建时间**：2026-07-23 10:25

---

## 〇、阅读这条链路前，先建立"全景地图"

我们要追的这条链，做的事情一句话说清：**用户在购物车点"去结算"→ 后端把一张订单落库、把购物车里每一行商品复制成订单明细落库、再把购物车清空 → 返回订单号**。

这里面藏着一个**必须原子（Atomic）完成的三连写**：

```
写库①  insert 一条 orders（主订单）
写库②  insert 多条 order_detail（订单明细，购物车有几行就几行）
写库③  delete 掉这个用户的整个购物车
```

**为什么这三步必须"要么全成、要么全不成"？**（先讲为什么——这是理解整篇的锚点）

想象一个失败场景：写库①成功了（订单已经进库），写库②执行到一半数据库崩了（明细没进去），程序抛异常中断。如果没有事务保护，结果是——库里躺着一张**没有任何菜品明细的空订单**，而用户的购物车可能还在、也可能被清了一半。这种"写了一半"的中间状态叫**部分提交（Partial Commit）**，是数据不一致的经典来源：用户付了钱却收不到菜，或者对账时订单金额和明细对不上。

`@Transactional` 就是用来堵这个洞的：它把这三步圈进**同一个数据库事务**，中途任何一步抛异常，已经执行的写库全部**回滚（Rollback）**，就像什么都没发生过。

用餐厅打比方，整条链上的角色分工：

| 角色 | 项目中的层 | 职责 | 类比 |
|---|---|---|---|
| 前台收银员 | `OrderController` | 收下单请求、调一次 Service、包装返回 | 只对接顾客，不下厨 |
| 厨师长 | `OrderServiceImpl.submitOrder` | 校验 + 编排三次写库 + **划定事务边界** | 一张订单从头管到尾，出任何岔子就"整单作废重来" |
| **事务管家（隐形）** | Spring AOP 代理 | 在厨师长动手**前** `begin`、干完**后** `commit`、砸锅就 `rollback` | 站在厨房门口的领班，进门开单、出门结账、翻车撕单 |
| 仓库管理员 | 三个 `Mapper` + XML | 只按指令读写数据库 | orders / order_detail / shopping_cart 三个货架 |
| 冷库 | MySQL | 真正存数据、真正支持事务的地方 | 事务的底层能力其实是数据库给的 |

**这里有个极其关键、初学者几乎都会忽略的点**：`@Transactional` 写在 `submitOrder` 方法上，但**真正执行 begin/commit/rollback 的不是 `submitOrder` 方法本身**，而是 Spring 在运行时给 `OrderServiceImpl` **套的一层"代理"**（上表里那个"事务管家"）。这层代理是整篇笔记的灵魂，后面第四节会专门拆。

**断点调试时，程序会按这个顺序在文件/角色间跳转**（把这张图记住，后面每一步都对应这里的一行）：

```
前端 POST /user/order/submit   （携带 JSON: {addressBookId, amount, remark, ...}）
   │
   ▼
① OrderController.submit()                         [sky-server] 接客
   │  orderService.submitOrder(dto)
   │  （注入的是接口 OrderService，运行时拿到的其实是【代理对象】，不是裸的 Impl）
   ▼
★ 事务代理.invoke()  ——【进方法前】开启事务 begin：
   │   向连接池借一个 Connection、setAutoCommit(false)、
   │   把这个 Connection 绑到当前线程（TransactionSynchronizationManager 的 ThreadLocal）
   ▼
② OrderServiceImpl.submitOrder()                   [sky-server] 厨师长（在事务包裹内运行）
   │  a. BaseContext.getCurrentId()          取当前用户 id（另一个 ThreadLocal）
   │  b. addressBookMapper.getById()         读：取地址 + 校验归属（越权即抛）
   │  c. 校验金额 > 0 / 购物车非空           防呆（不过就抛，此时【还没写库】）
   │  d. orderMapper.insert(order)           ── 写库① 主订单
   │  e. orderDetailMapper.insertBatch(...)  ── 写库② 订单明细（批量）
   │  f. shoppingCartMapper.deleteByUserId() ── 写库③ 清空购物车
   │  （三次写库都复用 ★ 那一步绑到线程上的【同一个 Connection】）
   ▼
★' 事务代理 ——【方法正常返回】提交事务 commit：三次写库一次性生效，解绑并归还 Connection
   │   （若②中途抛 RuntimeException → 改走 rollback：三次写库全部撤销）
   ▼
①' 回到 Controller：拿到 OrderSubmitVO
   │
   ▼
Result.success(vo)  →  以 JSON 返回前端
```

> **跨模块提示**：`OrderController / OrderServiceImpl / 三个 Mapper` 都在 **`sky-server`** 模块；`OrdersSubmitDTO`、`OrderSubmitVO`、`Orders`/`OrderDetail`/`ShoppingCart`/`AddressBook` 这些数据类在 **`sky-pojo`** 模块；`BaseContext`、`BaseException` 及各业务异常在 **`sky-common`** 模块。一次下单横跨三个 Maven 子模块。而**事务能力本身**既不在这三个模块的业务代码里，也不是我们手写的——它来自 Spring 框架的 AOP + 你在启动类上点的那一个开关 `@EnableTransactionManagement`。

下面进入断点逐步走读。**本篇重心是事务机制**，下单的业务校验（地址归属、金额防呆）只作为走读上下文一笔带过。

---

## 一、第 ① 步：请求落到 Controller（事务边界之外）

**文件**：`sky-server/src/main/java/com/sky/controller/user/OrderController.java`

```java
@RestController("userOrderController")
@RequestMapping("/user/order")
@Slf4j
@Api(tags = "C端-订单接口")
public class OrderController {

    @Autowired
    private OrderService orderService;   // 注入的是【接口】，运行时拿到的是代理对象

    @PostMapping("/submit")
    @ApiOperation("用户下单")
    public Result<OrderSubmitVO> submit(@RequestBody OrdersSubmitDTO ordersSubmitDTO) {
        log.info("用户下单：{}", ordersSubmitDTO);
        OrderSubmitVO orderSubmitVO = orderService.submitOrder(ordersSubmitDTO);
        return Result.success(orderSubmitVO);
    }
    // …… payment / historyOrders / cancel 等其他接口略
}
```

**断点观察 —— 注意 Controller 处在事务边界之外。**

- `@RequestBody` 把请求体 JSON 反序列化成 `OrdersSubmitDTO`（配角 A）。
- `orderService.submitOrder(...)` 这一行是**整篇的分水岭**：调用一发出，控制权并不是直接进到 `OrderServiceImpl.submitOrder` 的方法体，而是先经过 Spring 给它套的**事务代理**。事务的 `begin` 就发生在这一行"进门"的瞬间，`commit`/`rollback` 发生在"出门"的瞬间。**Controller 自己不碰事务，也不 try-catch**——它只负责把请求转进去、把结果拿出来。

**为什么事务边界要划在 Service、而不是 Controller？**（为什么 → 是什么 → 怎么用）

- *为什么*：事务代表"一个完整的业务操作单元"。"下单"这件事的完整性（三写全成或全不成）是**业务语义**，属于 Service 层的职责；Controller 只是 I/O 适配层，它不知道"下单"内部有几次写库。把 `@Transactional` 放 Controller 上还会因为掺入视图渲染、参数绑定等非业务动作而让事务范围失控。
- *是什么*：事务边界 = 一个 `@Transactional` 方法的进入点到退出点。
- *怎么用*：本项目把 `@Transactional` 精准打在 `submitOrder` 上——事务就从进这个方法开始、到出这个方法结束，正好圈住三次写库。

### 配角 A：`OrdersSubmitDTO`（前端 → 后端 的入参）

**文件**：`sky-pojo/src/main/java/com/sky/dto/OrdersSubmitDTO.java`

```java
@Data
public class OrdersSubmitDTO implements Serializable {
    private Long addressBookId;      // 地址簿 id
    private int payMethod;           // 付款方式
    private String remark;           // 备注
    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime estimatedDeliveryTime;
    private Integer deliveryStatus;  // 配送状态
    private Integer tablewareNumber; // 餐具数量
    private Integer tablewareStatus;
    private Integer packAmount;      // 打包费
    private BigDecimal amount;       // 总金额
}
```

- **注意里面没有 `userId`**。当前用户是谁，不信任前端传的字段，只从服务端的 `BaseContext`（配角 B）里取——这是 0003 的一条安全纪律（防止前端伪造 `userId` 替别人下单）。这一点和事务无关，但解释了 `submitOrder` 第一行为什么去读 ThreadLocal。

---

## 二、第 ② 步：进入 submitOrder —— 校验 + 编排三次写库

断点穿过事务代理，进入方法体。**此刻事务已经开好了**（一个 `Connection`、`autoCommit=false`、绑在当前线程上）。

**文件**：`sky-server/src/main/java/com/sky/service/impl/OrderServiceImpl.java`

```java
@Service
@Slf4j
public class OrderServiceImpl implements OrderService {

    @Autowired private OrderMapper orderMapper;
    @Autowired private OrderDetailMapper orderDetailMapper;
    @Autowired private ShoppingCartMapper shoppingCartMapper;
    @Autowired private AddressBookMapper addressBookMapper;
    @Autowired private WebSocketServer webSocketServer;

    @Override
    @Transactional                                          // ← 声明式事务：本方法整体是一个事务
    public OrderSubmitVO submitOrder(OrdersSubmitDTO ordersSubmitDTO) {
        // 当前登录用户 id（只能来自 ThreadLocal，绝不从请求体 DTO 取 userId）
        Long currentId = BaseContext.getCurrentId();

        // —— 校验区（都在写库之前，失败即抛，此时事务里还没有任何写操作）——
        AddressBook addressBook = addressBookMapper.getById(ordersSubmitDTO.getAddressBookId());
        // 地址不存在，或不属于当前用户（越权），都按地址非法处理
        if (addressBook == null || !currentId.equals(addressBook.getUserId())) {
            throw new AddressBookBusinessException(MessageConstant.ADDRESS_BOOK_IS_NULL);
        }
        // 订单金额合法性兜底（只防呆，不重算金额）
        BigDecimal amount = ordersSubmitDTO.getAmount();
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new OrderBusinessException("订单金额非法");
        }
        ShoppingCart shoppingCart = new ShoppingCart();
        shoppingCart.setUserId(currentId);                  // 只查当前用户的购物车
        List<ShoppingCart> shoppingCartList = shoppingCartMapper.list(shoppingCart);
        if (shoppingCartList == null || shoppingCartList.size() == 0) {
            throw new ShoppingCartBusinessException(MessageConstant.SHOPPING_CART_IS_NULL);
        }

        // —— 写库①：构造并插入主订单 ——
        Orders order = new Orders();
        BeanUtils.copyProperties(ordersSubmitDTO, order);   // DTO 同名字段拷进 Entity
        order.setPhone(addressBook.getPhone());
        order.setAddress(addressBook.getDetail());
        order.setConsignee(addressBook.getConsignee());
        order.setNumber(String.valueOf(System.currentTimeMillis())); // 订单号=当前毫秒
        order.setUserId(currentId);
        order.setStatus(Orders.PENDING_PAYMENT);            // 1 待付款
        order.setPayStatus(Orders.UN_PAID);                 // 0 未支付
        order.setOrderTime(LocalDateTime.now());
        orderMapper.insert(order);                          // ★ 写库① —— 见第三节

        // —— 写库②：把购物车每一行复制成订单明细 ——
        ArrayList<OrderDetail> orderDetailList = new ArrayList<>();
        shoppingCartList.forEach(cart -> {
            OrderDetail orderDetail = new OrderDetail();
            BeanUtils.copyProperties(cart, orderDetail);
            orderDetail.setOrderId(order.getId());          // 靠写库①回填的主键把明细挂到订单上
            orderDetailList.add(orderDetail);
        });
        orderDetailMapper.insertBatch(orderDetailList);     // ★ 写库② —— 见第三节

        // —— 写库③：清空该用户购物车 ——
        shoppingCartMapper.deleteByUserId(currentId);       // ★ 写库③ —— 见第三节

        // —— 组装返回 VO（纯内存操作，不写库）——
        OrderSubmitVO submitVO = OrderSubmitVO.builder()
                .id(order.getId())
                .orderNumber(order.getNumber())
                .orderAmount(order.getAmount())
                .orderTime(order.getOrderTime())
                .build();
        return submitVO;
    }
    // …… payment / details / userCancelById 等其他方法略
}
```

**断点单步走读（重点看事务视角，不纠缠业务）：**

1. **校验区（3 个 `throw`）全部发生在写库之前**。这有个微妙但重要的含义：这三个异常抛出时，事务里**还没有任何写操作**，所以"回滚"实际上是个空操作（no-op）——没写东西，回滚也就无东西可撤。**真正需要事务保护的是下面三次写库**：一旦进入写库①之后再抛异常，就有"已写的行"需要被撤销了。别把"校验抛异常"误当成"事务在发挥作用"。

2. **`order.setId(...)` 从哪来？** 代码里没手动 setId，但写库②要用 `order.getId()` 把明细挂到订单上。答案在写库①的 XML：`useGeneratedKeys="true" keyProperty="id"`——MyBatis 在 insert 后把数据库自增出来的主键**回填**进 `order` 对象。这是写库①和写库②之间的数据依赖，也是它们**必须在同一个事务、同一条连接、同一个线程**里顺序执行的原因之一。

3. **三次写库调用的是三个不同的 Mapper（不同的表），但它们用的是同一条数据库连接**。为什么？因为事务代理在进方法前已把一条 `Connection` 绑到当前线程；MyBatis 执行 SQL 时，会通过 Spring 的 `DataSourceUtils` 去"当前线程"上拿这条已绑定的连接，而不是自己从连接池另借一条。**同一条连接 + `autoCommit=false` = 同一个事务**。这就是"三写合一"在物理层面的实现。（连接与线程的关系，第六节展开。）

---

## 三、第 ③ 步：三次写库对应的 Mapper 接口 + XML

`Mapper` 只有接口没有实现类，是 **MyBatis 用动态代理在运行时生成实现**（原理见员工登录篇，这里只列本链路三条 SQL）。三个接口都在 `sky-server/src/main/java/com/sky/mapper/` 下。

### 写库①：`OrderMapper.insert` —— 插入主订单并回填主键

**接口**：`OrderMapper.java`

```java
@Mapper
public interface OrderMapper {
    /** 插入订单数据 */
    void insert(Orders order);
    // …… getByNumberAndUserId / updateToPaidIfUnpaid / update / pageQuery 等略
}
```

**XML**：`sky-server/src/main/resources/mapper/OrderMapper.xml`

```xml
<!-- useGeneratedKeys + keyProperty：拿数据库自增主键回填到 order.id -->
<insert id="insert" parameterType="Orders" useGeneratedKeys="true" keyProperty="id">
    insert into orders
    (number, status, user_id, address_book_id, order_time, checkout_time, pay_method, pay_status,
     amount, remark, phone, address, consignee, estimated_delivery_time, delivery_status,
     pack_amount, tableware_number, tableware_status)
    values (#{number}, #{status}, #{userId}, #{addressBookId}, #{orderTime}, #{checkoutTime},
            #{payMethod}, #{payStatus}, #{amount}, #{remark}, #{phone}, #{address}, #{consignee},
            #{estimatedDeliveryTime}, #{deliveryStatus}, #{packAmount}, #{tablewareNumber},
            #{tablewareStatus})
}
</insert>
```

- `useGeneratedKeys="true" keyProperty="id"`：insert 执行后，把自增主键写回 `order` 对象的 `id` 字段——上一节写库②依赖的就是它。

### 写库②：`OrderDetailMapper.insertBatch` —— 批量插入明细

**接口**：`OrderDetailMapper.java`

```java
@Mapper
public interface OrderDetailMapper {
    /** 批量插入订单明细数据 */
    void insertBatch(ArrayList<OrderDetail> orderDetailList);
    /** 查询订单明细 */
    List<OrderDetail> getByOrderId(Long ordersId);
}
```

**XML**：`sky-server/src/main/resources/mapper/OrderDetailMapper.xml`

```xml
<insert id="insertBatch">
    insert into order_detail (name, order_id, dish_id, setmeal_id, dish_flavor, number, amount, image)
    values
    <foreach collection="orderDetailList" item="od" separator=",">
        (#{od.name},#{od.orderId},#{od.dishId},#{od.setmealId},#{od.dishFlavor},
         #{od.number},#{od.amount},#{od.image})
    </foreach>
</insert>
```

- **`<foreach>`（MyBatis 动态 SQL 循环标签）**：把 List 里 n 个 `OrderDetail` 拼成一条 `insert ... values (…),(…),(…)` 的批量 SQL，一次网络往返写入多行。*为什么*：购物车有几行就要插几条明细，若一行发一条 SQL，n 次网络往返太慢；批量插入一次搞定，且天然处于同一事务内。

### 写库③：`ShoppingCartMapper.deleteByUserId` —— 清空购物车

**接口**：`ShoppingCartMapper.java`

```java
@Mapper
public interface ShoppingCartMapper {
    List<ShoppingCart> list(ShoppingCart shoppingCart);
    /** 清空购物车商品 */
    void deleteByUserId(Long currentId);
    // …… insert / insertBatch / deleteById / updateNumberById 略
}
```

**XML**：`sky-server/src/main/resources/mapper/ShoppingCartMapper.xml`

```xml
<delete id="deleteByUserId">
    delete
    from shopping_cart
    where user_id=#{id};
</delete>
```

- **一个"代码会撒谎"的教学点，要以代码为准**：接口方法的参数名叫 `currentId`，但 XML 占位符写的是 `#{id}`——**名字对不上，却能正常工作**。原因是这个方法**只有一个参数、且没加 `@Param`**：MyBatis 对"单个未命名参数"的绑定**不看名字**，`#{任意名}` 都会被解析成那唯一的实参。（对比 `OrderMapper.getByNumberAndUserId(@Param("orderNumber")..., @Param("userId")...)`——**多参数**就必须用 `@Param` 显式命名，否则 XML 里没法区分谁是谁。）读代码时别被"名字不一致"吓到，也别以为改个参数名就会崩。

**三次写库的上下游：**
- 上游：Service 在同一个事务里依次发出三条 SQL。
- 下游：MySQL（存储引擎必须是 **InnoDB** 才支持事务；MyISAM 不支持，`@Transactional` 会形同虚设——这是面试暗坑）。
- 三条 SQL 走的是"当前线程上那条 `autoCommit=false` 的连接"，在事务代理 `commit` 之前对外都不可见、可回滚。

---

## 四、事务核心机制之一：`@Transactional` 靠 Spring AOP 动态代理实现

这是本篇最该吃透的一节。前面反复说"进方法前 begin、出方法后 commit"，**这个"前"和"后"是谁加进去的？** 答案是 **Spring AOP 动态代理（Dynamic Proxy）**。

**① 为什么需要它（不用会怎样）**

如果没有声明式事务，你得手写"编程式事务"，每个方法长这样：

```java
Connection conn = dataSource.getConnection();
try {
    conn.setAutoCommit(false);
    // ... 三次写库 ...
    conn.commit();
} catch (Exception e) {
    conn.rollback();
    throw e;
} finally {
    conn.close();
}
```

这段 begin/commit/rollback 的样板会在**每个需要事务的方法里重复一遍**，把业务逻辑淹没在事务管理代码里，还极易漏写 `rollback` 或 `close`。**事务管理是一个横切关注点（Cross-Cutting Concern）**——它散落在很多方法里，但和具体业务无关。这正是 AOP（面向切面编程，Aspect-Oriented Programming）要解决的问题。

**② 它是什么（核心概念）**

- **AOP**：把"横切逻辑"（日志、事务、权限）从业务代码里抽出来，在运行时"织入（Weave）"到目标方法周围。
- **动态代理**：Spring 不修改你的 `OrderServiceImpl` 源码，而是在启动时**生成一个包装类**（代理对象），它包住真正的 `OrderServiceImpl`。外界（Controller）注入拿到的、调用的，其实都是这个代理。代理的逻辑是：

```
代理.submitOrder(dto):
    txManager.begin()                 // 进目标方法【前】：开事务
    try:
        result = 真实Impl.submitOrder(dto)   // 调你写的方法体
        txManager.commit()            // 正常返回【后】：提交
        return result
    catch (RuntimeException | Error e):
        txManager.rollback()          // 抛非受检异常：回滚
        throw e
```

用 MMORPG 类比：你的 `OrderServiceImpl` 是英雄本体，Spring 给它套了一件"事务装备"（代理）。装备提供"入场开团 / 团灭撤退"的被动，英雄本身的技能一行没改，但每次出手都被装备的被动包了一层。

- **两种代理实现**：目标类**实现了接口**（`OrderServiceImpl implements OrderService`）时可用 **JDK 动态代理**（基于接口生成）；没有接口时用 **CGLIB**（生成子类）。Spring Boot 2.x 起默认 `proxyTargetClass=true`，一律用 CGLIB。**对本篇结论没影响，但对下一节的 self-invocation 至关重要**。

**③ 在这个项目里怎么用**

两个前提，缺一不可：

1. **启动类开了总开关**——`sky-server/src/main/java/com/sky/SkyApplication.java`：

```java
@SpringBootApplication
@EnableTransactionManagement   // ← 开启注解驱动的声明式事务（Spring Boot 其实已自动配置，这里显式声明）
@EnableCaching
@EnableScheduling
public class SkyApplication { ... }
```

`@EnableTransactionManagement` 让 Spring 扫描 `@Transactional`、为带该注解的 Bean 生成事务代理。（Spring Boot 的 `DataSourceTransactionManagerAutoConfiguration` 通常已自动开启，此处显式写出更清晰。）

2. **方法上打了 `@Transactional`**——就是 `submitOrder` 那一行。于是 Spring 为 `OrderServiceImpl` 生成代理，Controller 里 `@Autowired private OrderService orderService` 注入的正是这个代理。所以第一节说"这一行是分水岭"——调用先进代理、再进方法体。

> **一句话记牢**：`@Transactional` 生效 = "**开关（`@EnableTransactionManagement`）+ 代理（AOP）+ 从代理外部进入被注解方法**" 三者同时满足。少任何一个都不生效。这也直接引出下一节的坑。

---

## 五、事务核心机制之二：传播行为（Propagation）与回滚规则（Rollback Rule）

`@Transactional` 括号里可以配一堆参数，最该懂的是 `propagation` 和回滚规则。`submitOrder` 用的是**全默认**（`@Transactional` 不带任何参数），我们就以"默认值是什么、够不够用"来讲。

### 5.1 传播行为 Propagation（默认 `REQUIRED`）

**① 为什么需要它**：一个事务方法可能被另一个事务方法调用（事务方法套事务方法）。这时**内层该新开一个独立事务，还是加入外层已有的事务？** 传播行为就是回答这个问题的策略。

**② 它是什么**：`submitOrder` 没写 `propagation`，取默认值 `Propagation.REQUIRED`，语义是——**"当前有事务就加入它，没有就新建一个"**。

因为 `submitOrder` 是被 Controller（无事务）直接调的，属于"当前没有事务"，所以它**新建**一个事务，成为外层。三次写库都跑在这个事务里。

**③ 常见取值**（面试要能说出前三个）：

| 传播行为 | 语义 | 典型场景 |
|---|---|---|
| `REQUIRED`（默认） | 有则加入，无则新建 | 绝大多数业务方法，如本例 |
| `REQUIRES_NEW` | **总是新开**独立事务，把外层挂起 | 记日志/发通知：不想被主业务回滚连累 |
| `NESTED` | 在外层事务里开**保存点（Savepoint）**，可局部回滚 | 主流程成功、子步骤失败只回子步骤 |
| `SUPPORTS` | 有事务就用，没有就非事务执行 | 查询类，可有可无 |
| `NOT_SUPPORTED` | 挂起事务、以非事务运行 | 耗时且无需事务的操作 |
| `MANDATORY` | 必须已有事务，否则抛异常 | 强制要求调用方开事务 |
| `NEVER` | 必须没有事务，否则抛异常 | 明确禁止事务的场景 |

> 本例三次写库要么全成全败，用默认 `REQUIRED` 正合适：它们共享一个事务，一荣俱荣一损俱损。

### 5.2 回滚规则（默认只回滚 `RuntimeException` 和 `Error`）

**这是最容易翻车的默认行为，务必记死。**

**① 为什么需要规则**：不是所有异常都该回滚。有些"异常"其实是可预期的业务分支，抛完还想让已做的事生效。Spring 于是定了个默认策略。

**② 默认规则是什么**：`@Transactional` 默认**只在抛出 `RuntimeException`（非受检异常）或 `Error` 时回滚**；抛出**受检异常（Checked Exception，即 `Exception` 但非 `RuntimeException`，如 `IOException`、`java.lang.Exception`）时，默认不回滚、照样提交**。

*为什么是这么个反直觉的默认？* 这是 Spring 沿袭的约定：受检异常常被当作"业务上可恢复、调用方需显式处理"的情况，未必意味着数据要作废；而运行时异常通常代表"程序出错了"，该回滚。你不一定认同，但**必须知道这是默认行为**。

**③ 在本项目里怎么落地——一个"恰好安全"和一个"埋着雷"的对比**：

- ✅ **`submitOrder` 恰好安全**：它抛的三个异常 `AddressBookBusinessException`、`OrderBusinessException`、`ShoppingCartBusinessException` 全都继承自 `BaseException`，而——

  **文件**：`sky-common/src/main/java/com/sky/exception/BaseException.java`
  ```java
  public class BaseException extends RuntimeException {   // ← 继承 RuntimeException（非受检）
      public BaseException() {}
      public BaseException(String msg) { super(msg); }
  }
  ```
  **文件**：`sky-common/src/main/java/com/sky/exception/OrderBusinessException.java`
  ```java
  public class OrderBusinessException extends BaseException {
      public OrderBusinessException(String msg) { super(msg); }
  }
  ```
  既然都是 `RuntimeException` 的子类，`submitOrder` 里任何一处 `throw` 都会**命中默认回滚规则** → 事务回滚。所以本项目下单方法**不需要额外配 `rollbackFor` 就能正确回滚**。这是"业务异常统一继承 `RuntimeException`"这个设计的隐藏红利。

- ⚠️ **同类里 `userCancelById` 是反面教材（对比记忆）**：同一个 `OrderServiceImpl` 里，`public void userCancelById(Long id) throws Exception` 方法签名声明抛**受检 `Exception`**。假设有人给它也加上 `@Transactional`（默认配置）并在里面真的抛了个受检 `Exception`，那么按默认规则**不会回滚**——已改的订单状态会被提交。要让受检异常也回滚，必须显式写 `@Transactional(rollbackFor = Exception.class)`。（`userCancelById` 当前**没加** `@Transactional`，此处只作规则演示。）

**④ `rollbackFor` / `noRollbackFor` 的作用**：

```java
@Transactional(rollbackFor = Exception.class)  // 把回滚范围扩大到所有异常（含受检）
@Transactional(noRollbackFor = OrderBusinessException.class)  // 反向：这个异常不回滚
```

- **工程建议**：很多团队直接给所有事务方法统一加 `rollbackFor = Exception.class`，避免"受检异常悄悄提交"的坑。本项目靠"业务异常都继承 RuntimeException"绕过了这个坑，但换个不这么规范的项目就未必安全。

---

## 六、事务核心机制之三：self-invocation（自调用）失效 + 事务边界与线程/连接的关系

### 6.1 self-invocation：同类内 `this.` 调用会让 `@Transactional` 失效

**这是面试问烂、线上事故高发的经典陷阱。先说结论：一个类里，方法 A 用 `this.` 直接调用同类的另一个 `@Transactional` 方法 B，B 的事务不会生效。**

**① 为什么会失效**（顺着第四节的代理往下想）：

`@Transactional` 靠**代理对象**加 begin/commit。只有"**从代理外部进来的调用**"才会经过代理那层包装。而同类内的 `this.methodB()`，这个 `this` 是**目标对象本体**（裸的 `OrderServiceImpl` 实例），**不是代理**——调用根本没经过代理那层，begin/commit 逻辑被整个跳过。

```
外部调用（经过代理，事务生效）：          自调用（绕过代理，事务失效）：
  Controller → [代理] → Impl.submitOrder      Impl.methodA
                 ↑ 在这里 begin/commit           └─ this.submitOrder()  // this=本体，不是代理
                                                       ↑ 没有任何 begin/commit 被触发
```

**② 在本项目里的实证与假想**：

- **实证（说明本篇为何"干净"）**：`submitOrder` 方法体从头到尾，只调用了**别的 Bean** 的方法——`addressBookMapper.*`、`shoppingCartMapper.*`、`orderMapper.*`、`orderDetailMapper.*`、`BaseContext.*`（静态工具）。它**没有调用本类 `this` 的任何其他方法**。所以本链路**不存在 self-invocation**，`@Transactional` 稳稳生效。（我逐行确认过：`submitOrder` 内无 `this.xxx()` 形式的自调用，也没调用同类里 `payment`、`details` 等方法。）

- **假想（帮你看清坑长什么样）**：假设有人在 `OrderServiceImpl` 里加一个"下单并支付"的便捷方法：

  ```java
  // ⚠️ 反模式示范：不要这样写
  public OrderSubmitVO submitAndPay(OrdersSubmitDTO dto, OrdersPaymentDTO pay) {
      OrderSubmitVO vo = this.submitOrder(dto);   // this. 自调用 → submitOrder 的 @Transactional 失效！
      this.payment(pay);
      return vo;
  }
  ```
  这里 `this.submitOrder(dto)` 绕过代理，`submitOrder` 上的 `@Transactional` **形同虚设**——三次写库不再受同一个事务保护，写库②失败时写库①不会回滚。**代码看起来一切正常、编译通过、注解也在，但事务就是没生效**，极难排查。

**③ 怎么避免/修复**（三种，从推荐到不推荐）：

1. **拆类**：把 B 方法移到另一个 Service，通过注入调用（跨 Bean = 经过代理）。最干净。
2. **自注入（Self-injection）**：把自己的代理注入进来，用 `self.submitOrder(dto)` 代替 `this.submitOrder(dto)`：
   ```java
   @Autowired private OrderService self;   // 注入的是代理
   ...
   self.submitOrder(dto);                  // 走代理，事务生效
   ```
3. **`AopContext.currentProxy()`**：`((OrderService) AopContext.currentProxy()).submitOrder(dto)`，需开 `@EnableAspectJAutoProxy(exposeProxy = true)`。能用但侵入性强，不优雅。

### 6.2 事务边界怎么和"线程 / 连接"绑在一起（简述，收束全篇）

前面多次说"三次写库用同一条连接"，这里补上机制，顺便和大家熟悉的 `BaseContext` 做个类比。

- **事务同步管理器 `TransactionSynchronizationManager`**：Spring 事务代理 `begin` 时，向连接池借一条 `Connection`、设 `autoCommit=false`，然后把这条连接**存进一个 `ThreadLocal`**（线程本地变量），键是数据源、值是连接。
- **MyBatis 取连接**：三次写库执行 SQL 时，MyBatis（经 Spring 的 `DataSourceUtils.getConnection`）会**先看当前线程的 ThreadLocal 里有没有已绑定的连接**，有就复用。于是三条 SQL 自然落在同一条连接、同一个事务里。
- **commit 时机**：方法正常返回 → 代理 `commit` → 从 ThreadLocal 解绑连接、`setAutoCommit(true)`、归还连接池；抛非受检异常 → `rollback`。

**和 `BaseContext` 的类比（都靠 ThreadLocal + "一次请求一个线程"）**：

**文件**：`sky-common/src/main/java/com/sky/context/BaseContext.java`
```java
public class BaseContext {
    public static ThreadLocal<Long> threadLocal = new ThreadLocal<>();
    public static void setCurrentId(Long id) { threadLocal.set(id); }
    public static Long getCurrentId() { return threadLocal.get(); }
    public static void removeCurrentId() { threadLocal.remove(); }
}
```

- `submitOrder` 第一行 `BaseContext.getCurrentId()` 取到的用户 id，是拦截器在**同一个线程**上早先 set 进去的。
- **关键共性**：Spring MVC 默认"**一个请求由一个线程从头处理到尾**"。正因如此，"事务连接绑在线程上"和"用户 id 绑在线程上"才都成立——`submitOrder` 里发的三条 SQL 和读到的 `currentId`，用的是同一个线程的两个 ThreadLocal。
- **反过来提醒一个坑**：如果在 `@Transactional` 方法里**另起线程**（如 `new Thread` 或线程池异步）去写库，新线程拿不到父线程 ThreadLocal 里的连接，会另借一条连接、开一个**独立事务**——不在原事务内，也回滚不了。所以"异步 + 事务"要格外小心。

---

## 七、总结与思考（比读懂源码更重要的部分）

> **学习心法**：`submitOrder` 这段代码换个项目就变样，但"三写要原子、事务靠代理、默认只回滚运行时异常、自调用会失效"这些**机制是通用的、可迁移的**。面试官不会问你"submitOrder 第几行 setStatus"，但一定会问"你项目里事务怎么保证的 / @Transactional 底层原理 / 为什么有时候不生效"。记机制，别记行号。

### 1. 必背套路一：多步写库必须放进同一个事务（原子性）

**口诀**：`一个业务动作里的多次写库，要么一起活、要么一起死，中间态不许存在。`

- 下单 = insert 订单 + insert 明细 + delete 购物车，三写缺一不可，用 `@Transactional` 圈成一个原子单元。
- **为什么必背**：这是 ACID 里的 **A（原子性 Atomicity）** 在业务代码里最直接的落地。识别"哪些操作必须原子"是后端设计的基本功——凡是"多张表一起改、且不允许改一半"的地方，就该有事务。
- **反模式**：把三次写库分散在三个没有共同事务的方法里各自提交；或误以为"加了 @Transactional 就万事大吉"而忽略下面几条前提。

### 2. 必背套路二：`@Transactional` = 开关 + AOP 代理 + 从外部进入

**口诀**：`注解只是声明，干活的是代理；进不了代理，注解就是废纸。`

- 生效三前提：① 启动类 `@EnableTransactionManagement`（Spring Boot 常自动开）；② 方法/类上有 `@Transactional`；③ **从代理外部**调用该方法。
- **为什么必背**：理解"代理"才能解释一切诡异现象——为什么自调用失效、为什么 `private` 方法上加 `@Transactional` 无效（代理拦不到 private）、为什么同类调用要自注入。这是把"会用注解"升级到"懂原理"的分水岭。

### 3. 必背套路三：默认只回滚 RuntimeException/Error，受检异常要 `rollbackFor`

**口诀**：`运行时异常自动回滚，受检异常默认放行；拿不准就 rollbackFor = Exception.class。`

- 本项目业务异常都继承 `BaseException extends RuntimeException`，所以下单抛异常能自动回滚，属于"设计得当而免踩坑"。
- **为什么必背**：这是 `@Transactional` **最反直觉、事故最多**的默认行为。面试高频，线上"事务没回滚"十有八九栽在这里。

### 4. 必背套路四：self-invocation 失效

**口诀**：`this. 调自家事务方法，等于没加注解；要么拆类，要么注入代理调自己。`

- **为什么必背**：代码正常、注解在位、却静默失效，是最难 debug 的一类问题。能主动讲清这个坑，面试官会认为你真的用过、踩过。

### 5. 生产同款 vs 教学简化（面试要能分辨）

**生产同款（直接保留）：** 声明式 `@Transactional`、多写原子化、业务异常继承 `RuntimeException` 让回滚自动生效、事务边界划在 Service 层。

**教学简化 / 需要注意：**
- ⚠️ 依赖 InnoDB 才有事务；建表引擎选错（MyISAM）事务直接失效，教程默认 InnoDB 没强调。
- ⚠️ 未显式配 `rollbackFor`，靠"异常都是 RuntimeException"兜底；换个不规范项目就不安全，生产建议统一 `rollbackFor = Exception.class`。
- ⚠️ 未考虑事务超时（`timeout`）、隔离级别（`isolation`，默认跟数据库）；高并发下单场景生产会结合库存扣减的行锁/乐观锁进一步设计（本篇不涉及库存）。
- ⚠️ WebSocket 推送、发短信等"副作用"若放进事务方法里，事务回滚时这些副作用**收不回来**（消息已发出）——生产会把它们移到事务提交之后（`@TransactionalEventListener(AFTER_COMMIT)`）。本例 `submitOrder` 没有这类副作用，但同类 `payment` 里的 WebSocket 推送就是刻意放在写库成功之后的。

---

## 八、面试官视角：这条链路我会怎么问（含口述答案）

> 假设我是 Java 后端面试官，看到你简历写了这个下单功能，针对事务这条线我大概率会问下面这些。答案按"面试时能直接口述、30~60 秒讲完"的口语化风格写。

**Q1：你这个下单接口为什么要加 `@Transactional`？它底层是怎么实现的？**
> 下单要连续做三次写库：插一条订单、批量插订单明细、清空购物车。这三步必须原子完成——不能出现"订单进了库但明细没进去"或者"购物车清了但订单没建成"这种中间状态。所以我用 `@Transactional` 把它们圈成一个事务。它底层不是方法自己在开事务，而是 Spring 用 AOP 动态代理给这个 Service 套了一层代理：调用进方法体之前代理先 begin，正常返回后 commit，中途抛异常就 rollback。我在启动类上开了 `@EnableTransactionManagement`，Spring 扫描到 `@Transactional` 就会为这个 Bean 生成代理，Controller 注入拿到的其实是代理对象。

**Q2：`@Transactional` 默认什么情况下会回滚？受检异常会回滚吗？**
> 默认只在抛出 `RuntimeException` 或 `Error` 时回滚，受检异常——就是继承 `Exception` 但不是 `RuntimeException` 的那些——默认不回滚，事务照样提交。这是个特别容易踩的坑。我这个项目里所有业务异常都继承了一个 `BaseException`，而 `BaseException` 继承 `RuntimeException`，所以下单里任何校验失败抛异常都能自动回滚，不用额外配置。但如果方法可能抛受检异常又想回滚，就得写 `@Transactional(rollbackFor = Exception.class)`。生产里我倾向于统一加 `rollbackFor = Exception.class` 避免这个默认行为坑人。

**Q3：什么是事务的传播行为？默认是哪个？举个 REQUIRES_NEW 的场景。**
> 传播行为是"一个事务方法被另一个事务方法调用时，内层该新开事务还是加入外层事务"的策略。默认是 `REQUIRED`：当前有事务就加入，没有就新建。我的 `submitOrder` 是被 Controller 直接调的、外面没有事务，所以它新建一个事务当外层，三次写库都在里面。`REQUIRES_NEW` 是不管外层有没有都自己新开一个独立事务、把外层挂起——典型场景是记操作日志：主业务失败要回滚，但"我尝试过、失败了"这条日志我希望独立提交、不被主业务连累，就给记日志的方法配 `REQUIRES_NEW`。

**Q4：听说 `@Transactional` 有时候会"不生效"，讲一个你知道的场景和原因。**
> 最经典的是 self-invocation，也就是同一个类里一个方法用 `this.` 直接调另一个带 `@Transactional` 的方法。因为事务是靠代理实现的，只有从代理外部进来的调用才会被代理包上 begin/commit，而 `this.` 调用用的是目标对象本体、不是代理，等于绕过了代理那一层，注解就失效了。代码看着完全正常、注解也在，但事务根本没开，特别难查。修的办法是把被调方法拆到另一个 Bean，或者把自己的代理注入进来用 `self.method()` 调。另外 private 方法、final 方法上加 `@Transactional` 也不生效，因为代理拦不到。

**Q5：为什么下单这三次写库能共用一个事务、一条数据库连接？和线程有什么关系？**
> 因为 Spring 事务代理 begin 的时候，会从连接池借一条连接、把 autoCommit 关掉，然后把这条连接存到一个跟线程绑定的 ThreadLocal 里（`TransactionSynchronizationManager`）。后面 MyBatis 执行每条 SQL 时，会先去当前线程上找有没有已经绑定的连接，有就复用。Spring MVC 默认一个请求由一个线程从头处理到尾，所以三条 SQL 都在同一个线程、拿到同一条连接、落在同一个事务里。这也解释了一个坑：如果在事务方法里另起线程去写库，新线程拿不到这条绑定的连接，会另开独立事务，不在原事务内，也回滚不了。我项目里取当前用户 id 的 `BaseContext` 也是同一个原理——靠 ThreadLocal，同一请求同一线程。

**Q6：如果写库②（插明细）执行到一半失败了，会发生什么？没有事务又会怎样？**
> 有事务的情况下：写库②抛出的是运行时异常，冒泡到事务代理那一层，代理执行 rollback，于是写库①已经插进去的那条订单也被一起撤销，数据库回到下单前的状态，就像没下过单。异常再继续往上冒泡，被全局异常处理器 `@RestControllerAdvice` 捕获，转成统一的失败 Result 返回前端。注意顺序是——回滚先在代理边界发生，然后异常才冒泡到全局处理器格式化响应。如果没有事务，写库①的订单就留在库里成了一条没有任何明细的脏数据，购物车可能也处于不确定状态，对账和用户体验都会出问题。这正是我给这个方法加 `@Transactional` 的原因。

**Q7（延伸）：下单成功后要发一条 WebSocket 来单提醒，你会把它放在事务里还是事务外？为什么？**
> 放事务外，也就是等事务提交成功之后再发。因为消息、通知这类是"发出去就收不回来"的副作用。如果放在事务方法内、在 commit 之前就推送，万一后面事务回滚了，订单其实没建成，但提醒已经发出去了，商家就收到一条幽灵订单。规范做法是用 Spring 的事务事件监听 `@TransactionalEventListener(phase = AFTER_COMMIT)`，确保事务真正提交后才触发推送。我们这个项目里下单方法本身没有这种副作用，但支付那个方法的 WebSocket 推送就是刻意放在写库成功判断之后才发的，思路一致。

---
