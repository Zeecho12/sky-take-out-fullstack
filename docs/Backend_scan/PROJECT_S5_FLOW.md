# PROJECT_S5_FLOW — 核心业务流程追踪

> 项目名称：sky-take-out（苍穹外卖）
> 本步骤读取的真实 .java 源文件（仅列实际读过方法体/签名的文件，完整路径）：
> - `D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\controller\user\OrderController.java`（主链 Controller）
> - `D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\service\impl\OrderServiceImpl.java`（主链 Service；同时含浅链「推送」的 `reminder`/`paySuccess` 方法体）
> - `D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\mapper\OrderMapper.java`（主链代表性 Mapper 接口，原生 MyBatis）
> - `D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\security\JwtAuthenticationFilter.java`（浅链「鉴权」）
> - `D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\websocket\WebSocketServer.java`（浅链「推送」承载节点）
> - `D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\controller\user\SetmealController.java`（浅链「缓存」，`@Cacheable`）
> - `D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\controller\user\DishController.java`（为识别缓存机制而读，实为手动 RedisTemplate 缓存，列入「未展开」）
>
> 数据对象（DTO/VO/Entity）一律不在本步读取，按 skill 规则引用 `PROJECT_S4B_DATAMODEL.md`（下称 S4B）。

---

## 调用链清单

**主链（深追）**：C 端「用户下单」`submitOrder` —— 外卖系统的**价值产出点**（顾客把购物车变成一张正式订单）。它是整个项目里业务语义最重的写操作：一次请求内串联「地址校验 → 配送范围校验（外部地图 API）→ 读购物车 → 写订单主表 → 批量写订单明细 → 清空购物车」多步，最能体现分层架构里 Controller→Service→Mapper→MySQL 的完整数据流，也是面试最常被追问的链路，故选为主链。

**浅链（浅追，各点一个主链覆盖不到的独立机制，一条一机制、不与主链重复）**：
- **浅链 1 · 鉴权**：Spring Security 无状态 JWT 认证过滤器（`JwtAuthenticationFilter`）——请求进业务前的统一身份识别，是功能 0001「C 端认证改造」引入的项目特色组件，主链默认在过滤器之后执行、看不到它。
- **浅链 2 · 推送**：下单支付成功「来单提醒」/ 用户「催单」经 WebSocket 主动推送给商家端（`WebSocketServer#sendToAllClient`）——服务器→客户端的主动实时通信，突破了 HTTP「请求-响应」的被动模型；入口在 `payment`/`reminder` 而非 `submit`，不与主链重复。
- **浅链 3 · 缓存**：C 端套餐浏览用 Spring Cache 注解 `@Cacheable` 把结果缓存进 Redis（`user/SetmealController#list`）——高频只读接口的降压手段，声明式缓存；主链是写路径，覆盖不到读缓存。

**未展开**（更多候选机制，列出作为 divedeep 深读候选）：
- **手动 Redis 缓存**：`user/DishController#list` 用 `RedisTemplate.opsForValue()` 手写「查缓存→穿透查库→回填」，与浅链 3 的声明式 `@Cacheable` 形成对照（一手动一声明式），值得单独对比精读。
- **支付回调**：`controller/notify/PayNotifyController`（微信支付服务器主动 POST 的异步回调入口，非前端调用）。
- **报表聚合**：`ReportServiceImpl` 营业额 / 订单 / 销量 Top10 按日聚合统计。
- **定时任务**：`task/OrderTask`（`@Scheduled` 扫描超时未支付 / 派送中订单做状态流转）。
- **缓存失效**：`admin/SetmealController` 的 `@CacheEvict(cacheNames="setmealCache")`（管理端增删改套餐时按 categoryId 或全量清缓存，与浅链 3 的写侧配套）。

---

## 主链完整调用链

> 纯文字箭头格式（禁止 Mermaid）。
> **完整 URL 拼接来源**：`context-path`（空，S4 确认本项目未配置 `server.servlet.context-path`，无前缀）+ 类级 `@RequestMapping("/user/order")` + 方法级 `@PostMapping("/submit")` = **POST /user/order/submit**。
> **同步性说明**：本主链**全链路同步**，无 `@Async` / `CompletableFuture` / 线程池 / 消息队列，单线程一路走到底再原路返回，故无异步分支。

```
POST /user/order/submit  ──  C 端顾客发起「用户下单」，请求体 OrdersSubmitDTO（详见 S4B）
  │ 完整路径来源：context-path=（空，无前缀）+ 类级 @RequestMapping("/user/order") + 方法级 @PostMapping("/submit")
  │ （请求进入前已先过浅链 1 的 JwtAuthenticationFilter，把 userId 填进 BaseContext）
  ▼
[user/OrderController#submit]  ──  接收 OrdersSubmitDTO，调 Service，用 Result.success 包成统一响应
  D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\controller\user\OrderController.java
  │
  ▼
[OrderServiceImpl#submitOrder]  ──  下单核心业务：校验 → 组装订单 → 落库 → 清车（@Service，注意本方法无 @Transactional）
  D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\service\impl\OrderServiceImpl.java
  │
  ├──▶(同步①)[AddressBookMapper#getById]  ──  查收货地址，为空则抛 AddressBookBusinessException
  │         D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\mapper\AddressBookMapper.java
  │         │
  │         └──▶ [MySQL:address_book]  ──  SELECT 地址
  │
  ├──▶(同步②)[外部依赖:百度地图 Web API]  ──  私有方法 checkOutOfRange() 用 HttpClientUtil 同步 GET 地理编码+路线规划，>5km 抛「超出配送范围」
  │         （HTTP 阻塞调用，落在 OrderServiceImpl 内部，非本项目类）
  │
  ├──▶(同步③)[ShoppingCartMapper#list]  ──  查当前用户购物车（userId 取自 BaseContext），为空则抛 ShoppingCartBusinessException
  │         D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\mapper\ShoppingCartMapper.java
  │         │
  │         └──▶ [MySQL:shopping_cart]  ──  SELECT 购物车行
  │
  ├──▶(同步④)[OrderMapper#insert]  ──  写 orders 主表（status=PENDING_PAYMENT 待付款, payStatus=UN_PAID, number=时间戳），回填自增 id
  │         D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\mapper\OrderMapper.java  ★代表性 Mapper 节点（详解见下）
  │         │
  │         └──▶ [MySQL:orders]  ──  INSERT 一行订单
  │
  ├──▶(同步⑤)[OrderDetailMapper#insertBatch]  ──  把购物车每条转 OrderDetail（快照 name/image/amount），批量写 order_detail
  │         D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\mapper\OrderDetailMapper.java
  │         │
  │         └──▶ [MySQL:order_detail]  ──  INSERT 多行明细
  │
  ├──▶(同步⑥)[ShoppingCartMapper#deleteByUserId]  ──  下单成功后清空该用户购物车
  │         │
  │         └──▶ [MySQL:shopping_cart]  ──  DELETE 该用户所有购物车行
  │
  ▼(主线程同步返回)
[OrderSubmitVO]  ──  builder 组装 {id, orderNumber, orderAmount, orderTime}（详见 S4B）
  │
  ▼(原路返回)
HTTP 200  Result{code:1, data: OrderSubmitVO, msg:null}
（注：本项目 Result 成功码为 1，见 sky-common/result/Result；此处状态为「待付款」，真正扣款在后续 PUT /user/order/payment）
```

---

## 节点详解

📍 节点 1：[user/OrderController]（C 端订单接口）
   文件路径：`D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\controller\user\OrderController.java`
   类级别注解：`@RestController("userOrderController")`（显式指定 Bean 名，因 admin 端另有同名 `OrderController`，避免 Bean 名冲突）、`@RequestMapping("/user/order")`、`@Slf4j`、`@Api(tags = "C端-订单接口")`（Swagger 分组）
   在这里做了什么：表现层入口，接收下单请求体 `OrdersSubmitDTO`，转调 `orderService.submitOrder(...)`，把返回的 `OrderSubmitVO` 用 `Result.success(...)` 包成统一响应格式。不含任何业务逻辑。
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

📍 节点 2：[OrderServiceImpl]（下单核心业务实现）
   文件路径：`D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\service\impl\OrderServiceImpl.java`
   类级别注解：`@Service`、`@Slf4j`（本类注入了 5 个 Mapper + `WeChatPayUtil` + `WebSocketServer`）
   在这里做了什么：下单业务的编排中心。依次做：① `addressBookMapper.getById` 校验收货地址；② 私有方法 `checkOutOfRange(...)` 同步调**百度地图 Web API**（`HttpClientUtil.doGet`）做配送范围校验，超 5000 米抛 `OrderBusinessException("超出配送范围")`；③ 从 `BaseContext.getCurrentId()` 取当前用户 id（由浅链 1 的 JWT 过滤器写入），`shoppingCartMapper.list` 查购物车，空则抛 `ShoppingCartBusinessException`；④ `BeanUtils.copyProperties` 组装 `Orders`（状态置「待付款」`PENDING_PAYMENT`、支付状态「未支付」`UN_PAID`、订单号取 `System.currentTimeMillis()`），`orderMapper.insert` 落库；⑤ 遍历购物车转 `OrderDetail` 后 `orderDetailMapper.insertBatch` 批量落明细；⑥ `shoppingCartMapper.deleteByUserId` 清空购物车；最后 builder 出 `OrderSubmitVO` 返回。**注意：本 `submitOrder` 方法体上没有 `@Transactional`——一次请求里 3 次写库（insert orders / insertBatch order_detail / delete shopping_cart）不在同一事务内，中途失败可能产生「有订单无明细 / 购物车已清但订单回滚」的不一致；这是可写进 ADR / divedeep 的真实观察点，非生产级严谨。**（Orders 常量含义、OrdersSubmitDTO/OrderSubmitVO 字段详见 S4B）
   关键代码片段：
   ```java
   order.setNumber(String.valueOf(System.currentTimeMillis()));
   order.setUserId(currentId);
   order.setStatus(Orders.PENDING_PAYMENT);
   order.setPayStatus(Orders.UN_PAID);
   order.setOrderTime(LocalDateTime.now());
   orderMapper.insert(order);
   // ... 购物车逐条转 OrderDetail 后：
   orderDetailMapper.insertBatch(orderDetailList);
   shoppingCartMapper.deleteByUserId(currentId);   // 清理购物车
   ```

📍 节点 3：[OrderMapper]（数据访问层，主链代表性 Mapper）
   文件路径：`D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\mapper\OrderMapper.java`
   在这里做了什么：**原生 MyBatis Mapper 接口**（类级 `@Mapper` 被扫描注册，**非 MyBatis-Plus**，不继承 `BaseMapper`）。接口里只声明方法签名，真实 SQL 写在同名映射文件 `sky-server/src/main/resources/mapper/OrderMapper.xml` 里（本步按 skill 约定不读 XML）。主链用到的是 `void insert(Orders order)`——插入订单主表并（由 XML 的 `useGeneratedKeys`/`keyProperty` 配置）回填自增主键 id 供后续明细外键使用。链路另外 3 个 Mapper（`AddressBookMapper`/`ShoppingCartMapper`/`OrderDetailMapper`）职责同构，按「代表性 Mapper 取 1 个」规则不单独建卡，仅在主链箭头图中列出。
   关键代码片段（接口签名，SQL 在 XML 中）：
   ```java
   @Mapper
   public interface OrderMapper {
       /** 插入订单数据 */
       void insert(Orders order);
       // 其余 getByNumberAndUserId / update / pageQuery / getById / countStatus 等略
   }
   ```
   说明：本接口是原生 MyBatis 手写映射接口（非 MyBatis-Plus 空接口），每个方法都在 `OrderMapper.xml` 里有对应 `<insert>/<select>/<update>`；此处只展示与主链相关的 `insert` 签名。

📍 节点 4：[MySQL]（持久化终点）
   文件路径：外部数据库（`jdbc:mysql://localhost:3306/sky_take_out`，S4 确认）
   在这里做了什么：主链在此落三次写——`orders`（INSERT 1 行订单主表）、`order_detail`（INSERT N 行明细）、`shopping_cart`（DELETE 该用户购物车）。表结构与字段合法值（如 `orders.status`=1 待付款）详见 S4B。

📍 节点 5：[外部依赖·百度地图 Web API]（配送范围校验，非本项目类）
   文件路径：无（HTTP 外部服务，调用代码在 `OrderServiceImpl#checkOutOfRange` 私有方法内，经 `sky-common` 的 `HttpClientUtil.doGet`）
   在这里做了什么：下单前**同步阻塞**调用百度地图「地理编码 v3 + 驾车路线规划 directionlite v1」，算店铺到收货地址的距离，>5000 米抛「超出配送范围」。属主链上的外部依赖节点；ak 为占位假值时该校验会失败（S4 已登记）。
   关键代码片段：
   ```java
   String json = HttpClientUtil.doGet("https://api.map.baidu.com/directionlite/v1/driving", map);
   jsonObject = JSON.parseObject(json);
   Integer distance = (Integer)((JSONObject) jsonArray.get(0)).get("distance");
   if (distance > 5000) {
       throw new OrderBusinessException("超出配送范围");
   }
   ```

---

## 浅链追踪（3 条）

🔹 浅链 1：鉴权 —— 无状态 JWT 认证过滤器
   入口：所有请求进入 Spring Security 过滤器链时前置执行（对 `/admin/**`、`/user/**` 生效；放行/拒绝的授权规则在 `config/SecurityConfig`，按 skill 约定不读配置类，仅引用 S3/S4：`/admin/**`=ROLE_ADMIN、`/user/**`=ROLE_USER，未带/带无效 token 走 401/403）。这是功能 0001 引入的统一 JWT 组件。
   精简调用链：
   ```
   HTTP 任意请求
     ▼
   [JwtAuthenticationFilter#doFilterInternal]  ──  读 Authorization: Bearer，解析 JWT
     ▼
   [JwtUtil.parseJWT]（sky-common 工具）→ 取 sub(userId)/role
     ▼
   写入 SecurityContext（权限 ROLE_<role>）+ BaseContext（当前用户 id）→ 放行 filterChain.doFilter
   ```
   有意思的节点：`JwtAuthenticationFilter` —— `D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\security\JwtAuthenticationFilter.java`
   关键代码片段：
   ```java
   String header = request.getHeader("Authorization");
   if (header != null && header.startsWith("Bearer ")) {
       String token = header.substring(7);
       Claims claims = JwtUtil.parseJWT(jwtProperties.getSecretKey(), token);
       Long userId = Long.valueOf(String.valueOf(claims.get("sub")));
       String role = claims.get("role") == null ? null : claims.get("role").toString();
       // 组装 UsernamePasswordAuthenticationToken，权限 = new SimpleGrantedAuthority("ROLE_" + role)
       SecurityContextHolder.getContext().setAuthentication(authentication);
       BaseContext.setCurrentId(userId);   // 供下游 Service 取当前用户 id（主链就靠它拿 currentId）
   }
   ```
   一句话点透：无状态（stateless）认证——服务端不存 session，身份全靠请求头自带的 JWT 自证；过滤器把 token 里的 userId 塞进 `ThreadLocal`（`BaseContext`），主链的 `submitOrder` 才能用 `BaseContext.getCurrentId()` 拿到「当前是谁在下单」，`finally` 里 `removeCurrentId()` 防线程复用串号。继承 `OncePerRequestFilter` 保证每请求只过一次。

🔹 浅链 2：推送 —— WebSocket 向商家端主动推「来单提醒 / 催单」
   入口：① 支付成功回调链 `OrderServiceImpl#paySuccess`（type=1 来单提醒）；② C 端 `GET /user/order/reminder/{id}` → `OrderServiceImpl#reminder`（type=2 催单）。二者都不在主链 `submit` 上（下单时只到「待付款」，尚未推送），故不与主链重复。WebSocket 端点由 `config/WebSocketConfiguration` 注册。
   精简调用链：
   ```
   GET /user/order/reminder/{id}（或 paySuccess 回调）
     ▼
   [OrderServiceImpl#reminder]  ──  查订单存在性 + 组装 {type,orderId,content} map
     ▼
   [WebSocketServer#sendToAllClient]  ──  遍历 sessionMap 群发 JSON 文本
     ▼
   [商家端浏览器 WebSocket 客户端]  ──  收到即弹「来单/催单」提醒
   ```
   有意思的节点：`WebSocketServer` —— `D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\websocket\WebSocketServer.java`
   关键代码片段：
   ```java
   @ServerEndpoint("/ws/{sid}")   // 端点 ws://localhost:8080/ws/{sid}（本步实读确认，S4 原为推断）
   public class WebSocketServer {
       private static Map<String, Session> sessionMap = new HashMap();
       public void sendToAllClient(String message) {
           for (Session session : sessionMap.values()) {
               session.getBasicRemote().sendText(message);   // 服务器主动向客户端发消息
           }
       }
   }
   ```
   一句话点透：突破 HTTP「客户端问、服务端才答」的被动模型——用 `@ServerEndpoint` 建长连接、把所有会话存进静态 `sessionMap`，商家端不用轮询，服务端一有新单/催单就主动 `sendText` 群发。是「服务器 → 客户端」主动推送的典型套路。

🔹 浅链 3：缓存 —— C 端套餐浏览 Spring Cache（`@Cacheable` 读 Redis）
   入口：`GET /user/setmeal/list?categoryId=xxx`（`user/SetmealController#list`）
   精简调用链：
   ```
   GET /user/setmeal/list
     ▼
   [user/SetmealController#list] @Cacheable(cacheNames="setmealCache", key="#categoryId")
     ├──▶ 命中：Spring Cache 直接从 Redis 取 → 不进方法体、不查库
     └──▶ 未命中：执行方法体 setmealService.list(...) → 查库 → 返回值自动写回 Redis
   ```
   有意思的节点：`user/SetmealController` —— `D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\controller\user\SetmealController.java`
   关键代码片段：
   ```java
   @GetMapping("/list")
   @Cacheable(cacheNames = "setmealCache", key = "#categoryId")
   public Result<List<Setmeal>> list(Long categoryId) {
       Setmeal setmeal = new Setmeal();
       setmeal.setCategoryId(categoryId);
       setmeal.setStatus(StatusConstant.ENABLE);
       List<Setmeal> list = setmealService.list(setmeal);
       return Result.success(list);
   }
   ```
   一句话点透：声明式缓存（Declarative Caching）——靠启动类 `@EnableCaching` + Redis 后端（`RedisConfiguration`），一个 `@Cacheable` 注解就把「查缓存→未命中查库→回填」的样板逻辑交给框架，key 用 SpEL `#categoryId` 按分类分桶，减少高频只读打到 MySQL。写侧配套是 `admin/SetmealController` 的 `@CacheEvict(cacheNames="setmealCache")`（管理端改套餐时清缓存，见「未展开」）。

---

## 流程类比（主链）

把「用户下单」`submitOrder` 想象成**在一家外卖餐厅的点餐台完成一次正式下单**：

- 你（顾客）走到**点餐台（`OrderController`）**，把写好的点餐单（`OrdersSubmitDTO`）递进去。点餐台不自己做菜，只负责收单、转交、最后把回执递还给你。
- 单子转到**大堂经理（`OrderServiceImpl`）**手里，他按固定 SOP 一步步办：先翻你的**会员档案里的收货地址**确认地址真实（`addressBookMapper.getById`）；再打电话问**地图外包公司（百度地图 API）**「这地址离店多远、能不能送」（`checkOutOfRange`，>5km 直接拒单）；确认没问题后，去**取餐篮（购物车 `shoppingCartMapper.list`）**把你选的东西全拿出来；然后在**订单总账（`orders` 表）**上开一张新单、状态先记「待付款」，并给每样菜在**订单明细账（`order_detail` 表）**登一行；最后把你的**取餐篮清空**（`deleteByUserId`），因为东西已经变成正式订单了。
- 大堂经理办事的**仓库管理员（`OrderMapper` 等）**只管照单进出冷库（`MySQL`），账怎么记（SQL）写在他随身的**操作手册（`OrderMapper.xml`）**里。
- 全程你**一直站在台前等**（同步），经理不办完不放你走；办完把**下单回执（`OrderSubmitVO`：订单号、金额、时间）**递还给你，你才拿着回执去下一个窗口付款（后续 `payment` 接口）。

**类比角色 ↔ 调用链节点对应**：
1. 顾客递单的**点餐台** = `user/OrderController#submit`（表现层，只收发不干活）。
2. 按 SOP 办事的**大堂经理** = `OrderServiceImpl#submitOrder`（业务编排，全部逻辑在这层；他手册上「没盖事务章」= 本方法无 `@Transactional`，多步写库不是一个原子操作）。
3. 打电话问路的**地图外包公司** = 百度地图 Web API（主链上的同步外部依赖）。
4. 取货入账的**仓库管理员 + 冷库** = `OrderMapper`/`OrderDetailMapper`/`ShoppingCartMapper` + `MySQL`。
5. 你手里的**会员卡** = 进门时（浅链 1 JWT 过滤器）就验过，经理才知道「这单是谁的」（`BaseContext.getCurrentId()`）——这正是鉴权浅链与主链的衔接点。
