# PROJECT_S6_READINGPATH — 推荐阅读路线

> 项目名称：sky-take-out（苍穹外卖）
> 面向读者：没有实际项目经验的学生；目标是"从易到难读懂这个项目"
> 说明：本项目是标准分层单体（Layered Monolith）CRUD 项目，S5 只有一条深追主链（C 端下单 `submitOrder`）+ 三条浅链（鉴权 / 推送 / 缓存），**不存在** OJ 判题 / 支付对账这类"同时用多种设计模式的复杂子系统"，故不做"按设计模式拆分成多站"处理。
> 编排原则应用顺序：先静态后动态（站 1-2）→ 先数据后逻辑（站 3）→ 先底层后上层（站 4-6，Mapper→Service→Controller，仲裁规则优先于"先骨架后细节"）→ 核心链路优先、外围分支后置（站 7-9，三条浅链）。

---

## 推荐阅读路线

第 1 站：配置文件——看懂项目的出生点与外部连接点
  目标文件：
    - D:\CQWM2\sky-take-out\sky-server\src\main\resources\application.yml
    - D:\CQWM2\sky-take-out\sky-server\src\main\resources\application-dev.yml
  阅读重点：`server.port`(8080)、`spring.profiles.active: dev`；`spring.datasource.druid.*` 里的 `${sky.datasource.*}` 占位符如何由 `application-dev.yml` 的 `sky.datasource.*` 填值（连到 `jdbc:mysql://localhost:3306/sky_take_out`）；`spring.redis.*`；`mybatis.mapper-locations: classpath:mapper/*.xml`、`mybatis.type-aliases-package: com.sky.entity`、`map-underscore-to-camel-case: true`；`sky.jwt.secret-key` / `sky.jwt.ttl`。**重点是"占位符 + 填值"两份文件配合，不是同名 key 覆盖。**
  读完后你能理解：项目跑在哪个端口、连哪个 MySQL / Redis、配置是"骨架(application.yml) + dev 填值(application-dev.yml)"的组织方式、MyBatis 去哪里找 SQL 映射文件与实体别名。
  理由：
    - 使用原则：先静态后动态（原则 1）——配置是项目的"出生点"和"外部连接点"，先看它才知道整套程序在什么环境里跑。
    - 不按此顺序的代价：如果先扎进业务代码，读到 Mapper 时会不知道 `resources/mapper/*.xml` 为什么会被加载、下划线列名为什么能自动映射到驼峰属性、`orders` 表到底在哪个库；这些"底层默认行为"全由这两份 yml 的开关决定，跳过它们你会把框架行为误当成"魔法"。

第 2 站：启动类 SkyApplication——看懂全站能力开关
  目标文件：
    - D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\SkyApplication.java
  阅读重点：类上的 5 个注解及其开启的能力——`@SpringBootApplication`（以 `com.sky` 为根扫描 Controller/Service/Mapper/Config）、`@EnableTransactionManagement`（让 `@Transactional` 生效）、`@EnableCaching`（让 `@Cacheable`/`@CacheEvict` 生效，后端为 Redis）、`@EnableScheduling`（让 `task` 包的 `@Scheduled` 生效）、`@Slf4j`。只读类声明头，不读 `main` 方法体。
  读完后你能理解：整个项目开启了哪些框架能力（事务、缓存、定时任务）、Spring 从哪个包开始扫描并装配所有 Bean。
  理由：
    - 使用原则：先静态后动态（原则 1）——启动类是程序的静态总入口，是所有"能力开关"的集中地。
    - 不按此顺序的代价：如果不先看它，后面在 Service 上遇到 `@Transactional`、在 `SetmealController` 上遇到 `@Cacheable`、在 `task` 包遇到 `@Scheduled` 时，会不知道这些注解"凭什么生效"——它们的总开关都贴在这一个类上，先看一眼就免去后面反复困惑。

第 3 站：建表脚本 + 核心实体——看懂项目在处理什么"东西"
  目标文件：
    - D:\CQWM2\sky.sql
    - D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\entity\Orders.java
    - D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\entity\OrderDetail.java
    - D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\entity\ShoppingCart.java
    - D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\entity\AddressBook.java
    - D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\entity\User.java
  阅读重点：`sky.sql` 里 11 张表的字段与 COMMENT，尤其 `orders.status`（1 待付款…6 已取消）、`orders.pay_status`（0 未支付 / 1 已支付 / 2 退款）的合法值；表之间靠 `xxx_id` **逻辑关联、无物理外键**；`create_time/update_time/create_user/update_user` 公共四件套只在 category/dish/setmeal/employee 出现；`orders` 里 phone/address/consignee 等"下单快照"字段。实体侧对照 `Orders` 的 `PENDING_PAYMENT`/`UN_PAID` 等静态常量与列的对应。
  读完后你能理解：项目围绕哪 11 个数据实体运转、订单状态机有哪些合法值、表关系靠约定的 `xxx_id` 维系、为什么订单要冗余存地址/手机号快照。
  理由：
    - 使用原则：先数据后逻辑（原则 2）——先知道系统在搬运什么"东西"，再看操作这些东西的代码。
    - 不按此顺序的代价：如果先读 `OrderServiceImpl` 再读实体，Service 里到处是 `order.setStatus(Orders.PENDING_PAYMENT)`、`order.setPayStatus(Orders.UN_PAID)`，你不知道 status 有哪些合法值、这些常量对应数据库哪一列、`address_book` 与 `orders` 靠什么关联，只能一行一跳出去查表结构，认知不断被打断。

第 4 站：主链数据访问层 OrderMapper（+ 同名 XML）——看懂下单是怎么存取数据的
  目标文件：
    - D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\mapper\OrderMapper.java
    - D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\mapper\AddressBookMapper.java
    - D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\mapper\ShoppingCartMapper.java
    - D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\mapper\OrderDetailMapper.java
    - D:\CQWM2\sky-take-out\sky-server\src\main\resources\mapper\OrderMapper.xml
  阅读重点：这是**原生 MyBatis** 接口（类级 `@Mapper` 被扫描，非 MyBatis-Plus，不继承 BaseMapper），接口里只有方法签名，真实 SQL 在同名 XML 里。重点看主链要用的 `OrderMapper#insert`（配合 XML 的 `useGeneratedKeys`/`keyProperty` 回填自增 id）、`AddressBookMapper#getById`、`ShoppingCartMapper#list`/`deleteByUserId`、`OrderDetailMapper#insertBatch`。对照 `OrderMapper.xml` 看一条 `insert` 长什么样即可，其余 XML 按需查。
  读完后你能理解：下单链路每一步落到数据库上究竟做了哪种 CRUD、MyBatis "接口声明 + XML 写 SQL"的分工、insert 后自增主键怎么回填给后续明细当外键。
  理由：
    - 使用原则：先底层后上层（原则 3）+ 仲裁规则（"先底层后上层"优先于"先骨架后细节"）——数据访问层是认知链条的最底层，先看它才有后面各层的地基。
    - 不按此顺序的代价：如果按执行顺序先读 `OrderServiceImpl`，会在 Service 里连续撞见 `orderMapper.insert(order)`、`orderDetailMapper.insertBatch(...)`、`shoppingCartMapper.deleteByUserId(...)` 一串调用，却不知道每个方法在操作哪张表、insert 之后 id 从哪冒出来，业务逻辑读得磕磕绊绊；先读 Mapper 后，这些调用一看就懂在干嘛。

第 5 站：主链业务逻辑层 OrderServiceImpl#submitOrder——看懂下单的完整业务编排
  目标文件：
    - D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\service\impl\OrderServiceImpl.java
  阅读重点：只聚焦 `submitOrder` 一个方法的六步编排——① `addressBookMapper.getById` 校验收货地址（空则抛 `AddressBookBusinessException`）；② 私有方法 `checkOutOfRange` 同步调百度地图 API 做配送范围校验（>5km 抛"超出配送范围"）；③ `BaseContext.getCurrentId()` 取当前用户 id + `shoppingCartMapper.list` 查购物车；④ 组装 `Orders`（status=`PENDING_PAYMENT`、payStatus=`UN_PAID`、number=`System.currentTimeMillis()`）后 `orderMapper.insert`；⑤ 购物车逐条转 `OrderDetail` 后 `insertBatch`；⑥ `deleteByUserId` 清空购物车。**特别注意：本方法没有 `@Transactional`，三次写库不在同一事务内，中途失败会数据不一致——这是可写进 ADR / divedeep 的真实观察点。**
  读完后你能理解：一次"下单"的完整业务规则与数据流（校验→组装→落库→清车）、为什么下单后订单是"待付款"而非已支付、以及多步写库缺事务的一致性风险。
  理由：
    - 使用原则：先底层后上层（原则 3）+ 核心链路优先（原则 4）——Service 是业务最密集的一层，且 `submitOrder` 是全项目的价值产出点（主链主干），排在 Mapper 之后、Controller 之前。
    - 不按此顺序的代价：如果没先读第 3 站实体，这里的 `order.setStatus(Orders.PENDING_PAYMENT)` 你不懂常量含义；如果没先读第 4 站 Mapper，这里每个 `xxxMapper.xxx()` 你不知道在动哪张表——两块地基缺一，这一层就是一团看不懂的调用堆叠。

第 6 站：主链表现层 user/OrderController——看懂对外接口长什么样
  目标文件：
    - D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\controller\user\OrderController.java
  阅读重点：类级 `@RestController("userOrderController")`（**显式指定 Bean 名**，因为 admin 端另有同名 `OrderController`，避免 Bean 名冲突）、`@RequestMapping("/user/order")`；方法级 `@PostMapping("/submit")` + `@RequestBody OrdersSubmitDTO` 参数绑定；方法体只有一行转调 `orderService.submitOrder(...)` + `Result.success(...)` 封装。注意完整 URL = 空 context-path + `/user/order` + `/submit` = `POST /user/order/submit`。
  读完后你能理解：HTTP 请求怎么进入下单链路、URL 前缀怎么由类级+方法级注解拼出来、返回值怎么被统一封装成 `Result`、表现层为什么"很薄"。
  理由：
    - 使用原则：先底层后上层（原则 3，Controller 放最后）——仲裁规则明确 Controller 最后读。
    - 不按此顺序的代价：如果一上来先读 Controller，会觉得"就一行转调、没内容"而抓不到重点，真正的业务在 Service 里却还没读；反过来 Mapper→Service 读透后再看 Controller，只剩路由 + 参数绑定 + 封装，几乎一眼看穿，这一站变得非常轻松。

第 7 站：鉴权浅链 JwtAuthenticationFilter——看懂请求进业务前的身份识别
  目标文件：
    - D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\security\JwtAuthenticationFilter.java
  阅读重点：`doFilterInternal` 读请求头 `Authorization: Bearer`、截取 token、`JwtUtil.parseJWT` 解析出 `sub`(userId) 与 `role`，组装 `UsernamePasswordAuthenticationToken`（权限 `ROLE_<role>`）写入 `SecurityContext`，并 `BaseContext.setCurrentId(userId)` 塞进 ThreadLocal；继承 `OncePerRequestFilter` 保证每请求只过一次，`finally` 里 `removeCurrentId()` 防线程复用串号。（授权规则 `/admin/**`=ADMIN、`/user/**`=USER 在 `SecurityConfig`，本站不展开配置类。）
  读完后你能理解：无状态（stateless）JWT 认证怎么运作、主链第 5 站里凭空出现的 `BaseContext.getCurrentId()` 的 userId 到底是谁在什么时候塞进去的。
  理由：
    - 使用原则：核心链路优先、外围分支后置（原则 4）——鉴权是主链之外的独立机制（浅链 1），放主链之后读。
    - 不按此顺序的代价：这条浅链恰好补上主链的一个悬念——第 5 站 `submitOrder` 用 `BaseContext.getCurrentId()` 却没交代 userId 从哪来；若不放在主链后面读，你要么在主链中途被迫跳去读过滤器打断节奏，要么一直误以为 userId 是"下单请求里传来的"。

第 8 站：推送浅链 WebSocketServer——看懂服务端如何主动推送
  目标文件：
    - D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\websocket\WebSocketServer.java
  阅读重点：`@ServerEndpoint("/ws/{sid}")` 声明长连接端点（`ws://localhost:8080/ws/{sid}`）、用静态 `Map<String,Session> sessionMap` 保存所有会话、`sendToAllClient` 遍历群发 `sendText`。注意它的调用入口是 `OrderServiceImpl#paySuccess`（支付成功来单提醒 type=1）和 `#reminder`（C 端催单 type=2），**都不在主链 `submit` 上**（下单只到"待付款"，此时还没推送）。
  读完后你能理解：服务器怎么突破 HTTP"客户端问、服务端才答"的被动模型，一有新单/催单就主动把消息推给商家端浏览器，而不用商家端轮询。
  理由：
    - 使用原则：核心链路优先、外围分支后置（原则 4）——推送是主链覆盖不到的独立实时通信机制（浅链 2）。
    - 不按此顺序的代价：如果在读主链途中插进来看它，会误以为"下单就会推送"；实际上推送发生在支付/催单而非下单，放主链之后单独读，才能把"下单只到待付款、推送另有触发点"这条边界理清，不至于把两个阶段混为一谈。

第 9 站：缓存浅链 user/SetmealController——看懂声明式缓存
  目标文件：
    - D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\controller\user\SetmealController.java
  阅读重点：方法 `list` 上的 `@Cacheable(cacheNames = "setmealCache", key = "#categoryId")`——命中则直接从 Redis 取、不进方法体、不查库；未命中则执行 `setmealService.list(...)` 查库并把返回值自动写回 Redis；key 用 SpEL `#categoryId` 按分类分桶。写侧配套是 `admin/SetmealController` 的 `@CacheEvict(cacheNames="setmealCache")`（管理端改套餐时清缓存）。
  读完后你能理解：`@Cacheable` 声明式缓存（Declarative Caching）怎么用一个注解把"查缓存→未命中查库→回填"的样板逻辑交给框架，从而给高频只读接口降压、减少打到 MySQL 的请求。
  理由：
    - 使用原则：核心链路优先、外围分支后置（原则 4）——读缓存是主链（写路径）覆盖不到的旁路机制（浅链 3），放最后。
    - 不按此顺序的代价：这一站依赖第 2 站启动类的 `@EnableCaching` 和第 1 站的 Redis 配置——若不先读那两站，你会不明白一个注解凭什么就能缓存；放到最后读，正好把前面看过的"能力开关 + Redis 连接"落到一个具体用例上，形成闭环。

## 先跳过这些

| 文件/目录 | 跳过原因（40 字以内） | 什么时候再回来看 |
|---|---|---|
| D:\CQWM2\sky-take-out\sky-common\src\main\java\com\sky\utils\（AliOssUtil / HttpClientUtil / JwtUtil / WeChatPayUtil） | 工具类，脱离调用场景单独读没有上下文 | 读主线代码遇到不认识的工具方法（如 JwtUtil.parseJWT）时，再点进去看 |
| D:\CQWM2\sky-take-out\sky-common\src\main\java\com\sky\exception\ + sky-server\...\handler\GlobalExceptionHandler.java | 异常与全局兜底逻辑，格式固定，不影响业务流程理解 | 学完主线业务后，作为"统一错误响应规范"扩展阅读 |
| D:\CQWM2\sky-take-out\sky-common\src\main\java\com\sky\constant\ + enumeration\ | 常量与枚举，是被引用的值，无独立逻辑 | 主线代码引用到某常量（如 StatusConstant.ENABLE）时顺手点进去 |
| D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\dto\ + vo\ | 纯数据对象，字段已在 S4B 数据模型登记过 | 读 Service/Controller 遇到某 DTO/VO 想确认字段时，回 S4B 或点进去 |
| D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\aspect\AutoFillAspect.java + annotation\AutoFill.java | AOP 横切增强（自动填公共字段），非主线业务逻辑 | 读到 category/dish/setmeal 的 create_time 想知道谁填的时候 |
| D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\config\（Oss/Redis/WebMvc/Security/WebSocket Configuration） | Bean 装配类，属基础设施而非业务流程 | 学完鉴权浅链后回看 SecurityConfig 的过滤器链/授权规则 |
| D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\task\（OrderTask / WebSocketTask / MyTask） | 定时任务，由调度器触发，非请求主线 | 学完订单主链后，想了解超时订单如何自动流转时 |
| D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\controller\notify\PayNotifyController.java | 支付回调入口，微信遗留、待改造（功能 0002） | 做功能 0002「支付 mock」或研究异步回调时 |
| D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\controller\admin\（Report / WorkSpace / Shop / Common Controller）+ service\impl\ReportServiceImpl.java | 报表/工作台/店铺/上传等外围管理端功能，与核心下单链路无关 | 学完核心链路后，按兴趣挑报表聚合或 OSS 上传单独读 |
