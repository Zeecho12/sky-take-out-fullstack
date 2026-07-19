# PROJECT_S5_FLOW — 核心业务流程追踪

> 项目名称：sky-take-out（苍穹外卖）
> 项目类型：多模块单体应用（Multi-module Monolith）
> 本步骤读取的真实 `.java` 源文件：
> - `sky-server/src/main/java/com/sky/controller/user/OrderController.java`（类级注解 + 全部方法签名 + `submit` 方法体）
> - `sky-server/src/main/java/com/sky/service/impl/OrderServiceImpl.java`（字段声明 + `submitOrder` 方法体）
> - `sky-server/src/main/java/com/sky/mapper/OrderMapper.java`（全部方法签名，取 `insert` 作为代表）

---

## 核心功能识别

**选定功能：用户下单（submitOrder）**

**选择理由：** 外卖（takeout）系统的价值产出点就是「订单」，而"下单"是全项目跨表最多、业务编排最完整的写操作——一次调用要读收货地址、校验配送范围、读购物车、写 `orders` 主表、批量写 `order_detail` 明细表、清空购物车,是三层架构（Controller → Service → Mapper）编排能力的最佳样本。

**为什么它比其他功能更核心：**
1. **业务名称强信号**：项目名"外卖"的核心动作就是"点餐下单"，`/user/order/submit` 是 C 端最重的写接口。
2. **跨模块（跨表）最多**：一次 `submitOrder` 触及 `address_book`（读）、`shopping_cart`（读 + 删）、`orders`（写）、`order_detail`（批量写）四张表，还外呼百度地图 API 做配送范围校验，是全项目数据编排最密集的一条链路。
3. **数据流终点明确**：购物车（临时数据）在这一步被"固化"成正式订单（持久业务数据），是 C 端数据从"草稿"到"事实"的转折点。

**备选功能：**
- **订单支付 + 支付成功推送（`payment` / `PayNotifyController` → `WebSocketServer`）**：技术上更花哨（对接微信支付 APIv3 SDK + WebSocket 主动推送来单提醒），但支付依赖微信商户证书（`D:\apiclient_key.pem` 等本地绝对路径），本机环境难以完整跑通，且它是"下单"的后续步骤。作为进阶切入点很好，但不如"下单"干净、自洽、可通读。
- 其余（菜品/套餐 CRUD、员工登录、报表统计）均为常规单表或只读流程，代表性弱于"下单"。

---

## 完整调用链

> 本流程为**全同步**调用，无 `CompletableFuture` / `@Async` / 消息队列 / 线程池。
> 事务性：`OrderServiceImpl` 类上**未**显式标注 `@Transactional`（下方节点详解如实说明），下单涉及的多次写操作在当前代码中不保证原子性——这是一处值得留意的实现细节。

```
POST /user/order/submit  ──  C 端用户提交订单
  │ 完整路径来源：context-path=（无，未配置 server.servlet.context-path）
  │              + 类级 @RequestMapping("/user/order")
  │              + 方法级 @PostMapping("/submit")
  │ 请求体：OrdersSubmitDTO（含 addressBookId、payMethod、remark、预估金额等，DTO 不展开）
  │ 请求头 authentication 携带 C 端 JWT，先经 JwtTokenUserInterceptor 校验并把 userId 写入 BaseContext
  ▼
[OrderController(user)]  ──  接收 OrdersSubmitDTO，调用 service，封装 Result 返回
  sky-server/src/main/java/com/sky/controller/user/OrderController.java
  │
  ▼
[OrderServiceImpl.submitOrder]  ──  下单业务编排：校验 → 建单 → 写明细 → 清购物车
  sky-server/src/main/java/com/sky/service/impl/OrderServiceImpl.java
  │
  ├──▶(同步 1)[AddressBookMapper.getById]  ──  查收货地址，为空则抛 AddressBookBusinessException
  │         sky-server/src/main/java/com/sky/mapper/AddressBookMapper.java
  │         │
  │         └──▶ [MySQL: address_book 表]  ──  SELECT
  │
  ├──▶(同步 2)[checkOutOfRange → HttpClientUtil → 百度地图 API]  ──  配送范围校验（工具类，不单独建节点）
  │         调用百度地图 Geocoding/路线规划接口，超范围抛 OrderBusinessException("超出配送范围")
  │
  ├──▶(同步 3)[ShoppingCartMapper.list]  ──  查当前用户购物车，为空则抛 ShoppingCartBusinessException
  │         sky-server/src/main/java/com/sky/mapper/ShoppingCartMapper.java
  │         │
  │         └──▶ [MySQL: shopping_cart 表]  ──  SELECT (WHERE user_id = 当前用户)
  │
  ▼(主同步路径：构造 Orders 实体后落库)
[OrderMapper.insert]  ──  插入订单主表，MyBatis 回写自增主键 order.id
  sky-server/src/main/java/com/sky/mapper/OrderMapper.java
  │
  └──▶ [MySQL: orders 表]  ──  INSERT，返回自增 id
  │
  ▼(用 order.id 逐条构造 OrderDetail)
[OrderDetailMapper.insertBatch]  ──  批量插入订单明细
  sky-server/src/main/java/com/sky/mapper/OrderDetailMapper.java
  │
  └──▶ [MySQL: order_detail 表]  ──  批量 INSERT（购物车每一项 → 一条明细）
  │
  ▼(下单成功，清理购物车)
[ShoppingCartMapper.deleteByUserId]  ──  清空当前用户购物车
  sky-server/src/main/java/com/sky/mapper/ShoppingCartMapper.java
  │
  └──▶ [MySQL: shopping_cart 表]  ──  DELETE (WHERE user_id = 当前用户)
  │
  ▼(封装 OrderSubmitVO：id / orderNumber / orderAmount / orderTime)
  ▼(原路返回：ServiceImpl → Controller → Result.success)
HTTP 200  {code: 1, data: {id, orderNumber, orderAmount, orderTime}, msg: null}
```

---

## 节点详解

📍 节点 1：`OrderController`（C 端订单控制器）
   文件路径：`sky-server/src/main/java/com/sky/controller/user/OrderController.java`
   类级别注解：`@RestController("userOrderController")`、`@RequestMapping("/user/order")`、`@Slf4j`、`@Api(tags = "C端-订单接口")`
   （注：`@RestController("userOrderController")` 显式指定 Bean 名称，因为 admin 包下也有一个同名 `OrderController` 类，需靠 Bean 名区分，避免容器内 Bean 名冲突）
   在这里做了什么：接收前端 POST 的 `OrdersSubmitDTO`，转调 `orderService.submitOrder`，把返回的 `OrderSubmitVO` 用 `Result.success` 包装成统一响应。
   关键代码片段：
   ```java
   @PostMapping("/submit")
   @ApiOperation("用户下单")
   public Result<OrderSubmitVO> submit(@RequestBody OrdersSubmitDTO ordersSubmitDTO) {
       log.info("用户下单：{}", ordersSubmitDTO);
       OrderSubmitVO orderSubmitVO = orderService.submitOrder(ordersSubmitDTO);
       return Result.success(orderSubmitVO);
   }
   ```

📍 节点 2：`OrderServiceImpl`（下单业务编排，核心节点）
   文件路径：`sky-server/src/main/java/com/sky/service/impl/OrderServiceImpl.java`
   在这里做了什么：下单主流程的编排中心——先做三重校验（地址非空、配送范围、购物车非空），再用 `BeanUtils` 从 DTO 拷出 `Orders` 并补齐快照字段（收货人/电话/地址/订单号/用户 id/状态=待付款 `PENDING_PAYMENT`/支付状态=未支付 `UN_PAID`/下单时间），落库后按购物车逐项构造 `OrderDetail` 批量入库，最后清空购物车并封装 `OrderSubmitVO` 返回。类上标注 `@Service`、`@Slf4j`，**未见 `@Transactional`**（多次写操作不在同一事务内，如中途失败可能产生脏数据，属实现瑕疵）。
   关键代码片段：
   ```java
   Orders order = new Orders();
   BeanUtils.copyProperties(ordersSubmitDTO, order);
   order.setNumber(String.valueOf(System.currentTimeMillis()));  // 时间戳当订单号
   order.setStatus(Orders.PENDING_PAYMENT);                       // 待付款
   order.setPayStatus(Orders.UN_PAID);                            // 未支付
   order.setOrderTime(LocalDateTime.now());
   orderMapper.insert(order);                                     // 写 orders，回写自增 id
   // ... 遍历购物车构造 orderDetailList，setOrderId(order.getId()) ...
   orderDetailMapper.insertBatch(orderDetailList);                // 批量写 order_detail
   shoppingCartMapper.deleteByUserId(currentId);                  // 清空购物车
   ```

📍 节点 3：`OrderMapper`（订单主表持久层，代表性 Mapper）
   文件路径：`sky-server/src/main/java/com/sky/mapper/OrderMapper.java`
   在这里做了什么：MyBatis Mapper 接口（`@Mapper` 注解，非空接口，含自定义方法）。下单链路只用到 `insert(Orders order)`——把订单主数据写入 `orders` 表；对应 SQL 写在 XML 映射文件 `sky-server/src/main/resources/mapper/OrderMapper.xml` 中，并通过 `useGeneratedKeys` 回写自增主键到 `order.id`（供后续 `order_detail` 关联）。
   关键代码片段：
   ```java
   @Mapper
   public interface OrderMapper {
       /**
        * 插入订单数据
        * @param order
        */
       void insert(Orders order);
       // ... getByNumberAndUserId / update / pageQuery / getById /
       //     countStatus / getByStatusAndOrderTime / sumByMap 等其余方法与下单链路无关，此处省略
   }
   ```

📍 节点 4：`MySQL`（数据库 `sky_take_out`）
   文件路径：外部中间件（非源码文件；连接配置见 `application-dev.yml` 的 `sky.datasource.*`，库名 `sky_take_out`）
   在这里做了什么：承载下单涉及的四张表的读写——`address_book`（SELECT 校验地址）、`shopping_cart`（SELECT 读购物车 + DELETE 清空）、`orders`（INSERT 主订单，返回自增 id）、`order_detail`（批量 INSERT 明细）。执行结果沿原路返回给 Service。
   关键代码片段：无（外部数据库，非 `.java` 源码）。实际 SQL 由 `sky-server/src/main/resources/mapper/*.xml` 定义，本步骤不读 XML 内容。

---

## 流程类比

把"用户下单"想象成 **在一家餐厅点餐、由收银台开小票的完整过程**：

1. 你（顾客）走到**前台收银员**面前，把"我要点这些、送到这个地址"的单子递过去 —— 这就是 `POST /user/order/submit` 打到 **`OrderController`**，收银员只负责接单、传话、把结果递回给你，不亲自下厨也不亲自记账。
2. 收银员把单子交给**店长（大堂经理）** —— 也就是 **`OrderServiceImpl.submitOrder`**。店长是真正做决策、串全场的人：先核对"这个送货地址存在吗、在配送范围内吗、你的购物车（餐盘）是不是空的"（三重校验），再决定按什么顺序落单。
3. 店长不亲自碰"账本"，而是叫**记账员** —— 也就是各个 **`Mapper`**：让记账员在《订单总账》（`orders` 表）上开一条新记录并拿到流水号，再把你点的每一样菜逐条抄到《订单明细账》（`order_detail` 表），最后把你面前那张临时的《购物车草稿》（`shopping_cart` 表）撕掉清空。
4. 所有账本都存在**后仓的档案柜** —— 也就是 **MySQL 数据库**，记账员的每一笔增删改查最终都落在这里。
5. 全部记完，店长把一张写着"订单号、金额、下单时间"的**正式小票**（`OrderSubmitVO`）交回收银员，收银员再递回到你手上 —— 这就是 `HTTP 200 {code:1, data:{...}}`。

**角色对应关系（务必对齐）：**
- **前台收银员 = `OrderController`**：只做"收请求 / 调用 service / 返回 Result"，不含业务逻辑。
- **店长 = `OrderServiceImpl.submitOrder`**：真正的业务编排者，负责校验、构造订单、决定写表顺序、清购物车。
- **配送范围核对 = `checkOutOfRange` → 百度地图 API**：像店长打电话问"这个地址我们送不送得到"，属外呼第三方，不落自己的账本。
- **记账员 = `OrderMapper` / `OrderDetailMapper` / `ShoppingCartMapper` / `AddressBookMapper`**：只跟档案柜（数据库）打交道，执行具体 SQL。
- **后仓档案柜 = MySQL**：`orders` / `order_detail` / `shopping_cart` / `address_book` 四本账册的最终存放处，是数据的真正落点。
