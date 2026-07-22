# PROJECT_S4_ENTRYPOINT — 核心入口定位

> 项目名称：sky-take-out（苍穹外卖）
> 项目类型：多模块单体（Multi-Module Monolith）—— Maven 聚合工程，仅 `sky-server` 可运行
> 默认激活 Profile：`dev`（`application.yml` 中 `spring.profiles.active: dev`）
> 配置文件一览：
> - `sky-take-out/sky-server/src/main/resources/application.yml`（骨架 + 占位符，含直填的业务开关）
> - `sky-take-out/sky-server/src/main/resources/application-dev.yml`（为占位符提供实际值）
> - 无任何 `bootstrap.yml` / `bootstrap.properties`（本项目不是 Spring Cloud 应用，不需要引导上下文）
> - 支撑库子模块 `sky-common`、`sky-pojo` 均**无** `application.yml`（它们是被 `sky-server` 依赖的工具库/数据模型库，不独立运行，因此没有自己的配置文件）
> 配置组织模式：**占位符填值（placeholder / indirection）为主，混少量直填**

> ⚠ 关键机制说明：本项目 `application.yml` 里大量字段写成 `${sky.xxx}` 占位符（datasource、redis、alioss、wechat 四大块），实际值定义在 `application-dev.yml` 的 `sky.xxx` 节点下，是"骨架 + 填值"关系（**非**"默认值 + 覆盖"）。两份文件必须**同时存在**才能拼出完整配置——只有 `application.yml` 时，`${sky.datasource.host}` 等占位符无法解析，启动会失败。
>
> 另有少量键**直接写死在 `application.yml`**，不走占位符：`server.port`、`spring.profiles.active`、`spring.main.allow-circular-references`、`mybatis.*`、`logging.*`、`sky.jwt.*`、`sky.shop.address`、`sky.baidu.ak`。因此严格说是"占位符 + 直填"混用，但两份配置文件之间的关系是占位符填值，**不存在同名 key 相互覆盖**。

---

## 启动顺序

1. **MySQL 数据库（必需）**：项目的核心数据存储（员工 / 用户 / 菜品 / 套餐 / 订单 / 购物车 / 地址簿等全部业务表都在这里）。连接信息由 `application-dev.yml` 的 `sky.datasource.*` 填入 `application.yml` 的 Druid 数据源占位符，地址为 `jdbc:mysql://localhost:3306/sky_take_out`。所有持久层（`mapper` 包 + `resources/mapper/*.xml`）都依赖它，应用启动时 Druid 连接池会尝试连接，MySQL 未就绪时业务几乎完全不可用，因此必须最先拉起。

2. **Redis（可选依赖）**：缓存与临时状态存储，`@EnableCaching` 的缓存后端（见 `config/RedisConfiguration`）。连接信息由 `sky.redis.*` 填入（`localhost:6379`，`database: 10`，无密码）。Spring Data Redis 用的是 Lettuce 客户端，**连接是懒建立的**——即使 Redis 没起，`sky-server` 本身也能启动成功；但运行时凡是走 Redis 的功能（如店铺营业状态 SET/GET、`@Cacheable` 缓存的分类/菜品数据）会在**首次调用时**报错。**（可选依赖）**：未启动时不阻塞进程启动，只影响上述缓存相关功能。

3. **应用本身 sky-server（Spring Boot 可执行 jar）**：唯一可运行、对外提供 HTTP + WebSocket 服务的部署单元，启动类 `com.sky.SkyApplication`。启动时 Spring 以 `com.sky` 为根扫描并装配全部 Bean（Controller / Service / Mapper / Security 过滤器链 / 定时任务 / WebSocket 端点），并建立数据库连接池。它依赖上面的 MySQL（强）与 Redis（弱），因此排在基础设施之后、最后启动，就绪后监听 `8080` 端口对外放行流量。

> **第三方 SaaS（运行时可选外部依赖，无需你"启动"，只需凭证有效）——单列：**
> - **阿里云 OSS（对象存储）**：图片/文件上传。凭证在 `application-dev.yml` 的 `sky.alioss.*`（endpoint `oss-cn-hangzhou.aliyuncs.com`、bucket `sky-take-out`、AK/SK 见索引表）。凭证失效或网络不通时，管理端"通用上传"（`CommonController` 上传菜品/套餐图片）会失败，其余功能不受影响。
> - **微信支付（WeChat Pay）**：C 端下单支付 + 支付结果回调。凭证在 `sky.wechat.*`（appid / secret / mchid / 商户证书路径 / apiV3Key / notifyUrl 等）。**注意**：当前 `privateKeyFilePath`、`weChatPayCertFilePath` 指向本机 `D:\...pem`，`notifyUrl` 是占位 URL——这是待改造的微信遗留（对应功能 0002「支付 mock」）。凭证/证书缺失时，真实支付链路不可用（学习环境预期用 mock 绕过）。
> - **百度地图（Baidu Map）**：`sky.baidu.ak: EFEEFFEFEFE`（占位假值，直填在 `application.yml`）。用于配送距离/地址解析类校验；ak 无效时相关校验会失败，核心下单流程通常仍可跑通。

---

## 对外入口

- 端口：`8080`（`server.port`，全项目仅 `dev` 一个环境，端口即 8080）
- 监听地址：未配置 `server.address`，默认 `0.0.0.0`（监听所有网卡）
- 路径前缀：未配置 `server.servlet.context-path`，**无前缀**（Controller 的 `@RequestMapping` 路径即完整路径）
- 完整访问地址示例：`http://localhost:8080/admin/employee/login`、`http://localhost:8080/user/user/login`
- Gateway：**无**。本项目是单体应用（Multi-Module Monolith），当前仓库不含任何网关模块（启动类无 `@EnableDiscoveryClient`/`@EnableFeignClients`，印证无微服务网关）。
- 非 REST 入口：
  - **WebSocket 端点**：`websocket/WebSocketServer`（`@ServerEndpoint`，由 `config/WebSocketConfiguration` 注册 `ServerEndpointExporter` 承载）。协议 `ws://`，用途为向管理端推送"来单提醒 / 客户催单"实时消息。路径推断为 `ws://localhost:8080/ws/{sid}`（**推断**，精确路径待 backend-scan-5-flow 读源码确认）。
  - **第三方异步回调**：`controller/notify/PayNotifyController`——微信支付结果回调入口。由微信支付服务器**主动 POST**（对应 `sky.wechat.notifyUrl`），**不是前端调用**。路径推断为 `/notify/paySuccess`（**推断**）。
  - **消息队列监听器**：**无**（项目未引入 RabbitMQ / Kafka，无 `@RabbitListener` / `@KafkaListener`）。
  - **定时任务**（`@Scheduled`，由 `@EnableScheduling` 驱动，`task` 包）：`OrderTask`（订单超时未支付 / 派送中状态流转）、`WebSocketTask`（WebSocket 心跳）、`MyTask`（示例任务）。**由调度器按 cron 周期触发，非外部流量**，不是对外入口，仅作为"非 HTTP 执行触发点"一并登记。

---

## 关键配置项索引

配置为**占位符填值模式**，按"公共骨架（application.yml）"与"dev 填值（application-dev.yml）"两段呈现；占位符项写成"占位符 → 实际值"。

### 一、公共骨架（`sky-server/src/main/resources/application.yml`）

| 配置项 | 值 | 所在文件路径 | 作用说明 |
|---|---|---|---|
| `server.port` | `8080` | application.yml | 对外 HTTP 监听端口 |
| `spring.profiles.active` | `dev` | application.yml | **Profile 管理**：决定加载 `application-dev.yml`（当前唯一 profile 文件） |
| `spring.main.allow-circular-references` | `true` | application.yml | **框架行为开关**：允许 Bean 之间循环依赖（Spring Boot 2.6+ 默认禁止，这里放开） |
| `spring.datasource.druid.driver-class-name` | `${sky.datasource.driver-class-name}` → `com.mysql.cj.jdbc.Driver` | application.yml | 数据库驱动类（连接池为 **Druid**，键嵌套在 `spring.datasource.druid` 下） |
| `spring.datasource.druid.url` | `jdbc:mysql://${sky.datasource.host}:${sky.datasource.port}/${sky.datasource.database}?...&useSSL=false&allowPublicKeyRetrieval=true` → `jdbc:mysql://localhost:3306/sky_take_out?...` | application.yml | JDBC 连接串；含 `serverTimezone=Asia/Shanghai`、`useSSL=false`、`allowPublicKeyRetrieval=true` |
| `spring.datasource.druid.username` | `${sky.datasource.username}` → `root` | application.yml | 数据库用户名 |
| `spring.datasource.druid.password` | `${sky.datasource.password}` → `123456` | application.yml | 数据库密码 |
| `spring.redis.host` | `${sky.redis.host}` → `localhost` | application.yml | Redis 主机 |
| `spring.redis.port` | `${sky.redis.port}` → `6379` | application.yml | Redis 端口 |
| `spring.redis.password` | `${sky.redis.password}` → （空） | application.yml | Redis 密码（dev 未设，留空） |
| `spring.redis.database` | `${sky.redis.database}` → `10` | application.yml | Redis 逻辑库编号（第 10 号库） |
| `mybatis.mapper-locations` | `classpath:mapper/*.xml` | application.yml | MyBatis XML 映射文件位置（对应 `resources/mapper/*.xml` 共 11 个） |
| `mybatis.type-aliases-package` | `com.sky.entity` | application.yml | 实体类型别名包（XML 里可用短类名引用 `sky-pojo` 的 entity） |
| `mybatis.configuration.map-underscore-to-camel-case` | `true` | application.yml | **框架行为开关**：数据库下划线列名 ↔ Java 驼峰字段自动映射 |
| `logging.level.com.sky.mapper` | `debug` | application.yml | Mapper 层日志级别（打印 SQL，调试用） |
| `logging.level.com.sky.service` | `info` | application.yml | Service 层日志级别 |
| `logging.level.com.sky.controller` | `info` | application.yml | Controller 层日志级别 |
| `sky.jwt.secret-key` | `sky-take-out-cend-auth-unified-secret-2026` | application.yml | **JWT 签名密钥**（功能 0001 C 端认证改造引入的统一 JWT，直填非占位符） |
| `sky.jwt.ttl` | `7200000` | application.yml | JWT 有效期，单位毫秒（7200000ms = 2 小时） |
| `sky.shop.address` | `湖北省武汉市洪山区徐东大街18号` | application.yml | 店铺地址（配送距离计算用，直填） |
| `sky.baidu.ak` | `EFEEFFEFEFE` | application.yml | **百度地图凭证**（占位假值，直填） |

### 二、dev 填值（`sky-server/src/main/resources/application-dev.yml`，为上表占位符提供实际值）

| 配置项 | 值 | 所在文件路径 | 作用说明 |
|---|---|---|---|
| `sky.datasource.driver-class-name` | `com.mysql.cj.jdbc.Driver` | application-dev.yml | 填 Druid 驱动占位符 |
| `sky.datasource.host` | `localhost` | application-dev.yml | 填数据库主机占位符 |
| `sky.datasource.port` | `3306` | application-dev.yml | 填数据库端口占位符 |
| `sky.datasource.database` | `sky_take_out` | application-dev.yml | 填数据库名占位符 |
| `sky.datasource.username` | `root` | application-dev.yml | 填数据库用户名占位符 |
| `sky.datasource.password` | `123456` | application-dev.yml | 填数据库密码占位符 |
| `sky.redis.host` | `localhost` | application-dev.yml | 填 Redis 主机占位符 |
| `sky.redis.port` | `6379` | application-dev.yml | 填 Redis 端口占位符 |
| `sky.redis.password` | （空） | application-dev.yml | 填 Redis 密码占位符（无密码） |
| `sky.redis.database` | `10` | application-dev.yml | 填 Redis 逻辑库占位符 |
| `sky.alioss.endpoint` | `oss-cn-hangzhou.aliyuncs.com` | application-dev.yml | **阿里云 OSS** 服务地域端点 |
| `sky.alioss.access-key-id` | `LTAI5tPeFLzsPPT8gG3LPW64` | application-dev.yml | **阿里云 OSS** AccessKeyId（凭证，原样输出） |
| `sky.alioss.access-key-secret` | `U6k1brOZ8gaOIXv3nXbulGTUzy6Pd7` | application-dev.yml | **阿里云 OSS** AccessKeySecret（凭证，原样输出） |
| `sky.alioss.bucket-name` | `sky-take-out` | application-dev.yml | **阿里云 OSS** 存储桶名 |
| `sky.wechat.appid` | `wx9e8dde9d2df9df58` | application-dev.yml | **微信支付** 小程序 appid |
| `sky.wechat.secret` | `7a354c0cab2186281c18839acf453e37` | application-dev.yml | **微信支付** 小程序密钥 |
| `sky.wechat.mchid` | `1561414331` | application-dev.yml | **微信支付** 商户号 |
| `sky.wechat.mchSerialNo` | `4B3B3DC35414AD50B1B755BAF8DE9CC7CF407606` | application-dev.yml | **微信支付** 商户证书序列号 |
| `sky.wechat.privateKeyFilePath` | `D:\apiclient_key.pem` | application-dev.yml | **微信支付** 商户私钥文件路径（本机绝对路径，遗留待改造） |
| `sky.wechat.apiV3Key` | `CZBK51236435wxpay435434323FFDuv3` | application-dev.yml | **微信支付** APIv3 密钥 |
| `sky.wechat.weChatPayCertFilePath` | `D:\wechatpay_166D96F876F45C7D07CE98952A96EC980368ACFC.pem` | application-dev.yml | **微信支付** 平台证书文件路径（本机绝对路径，遗留待改造） |
| `sky.wechat.notifyUrl` | `https://www.weixin.qq.com/wxpay/pay.php` | application-dev.yml | **微信支付** 支付结果回调 URL（占位假值） |
| `sky.wechat.refundNotifyUrl` | `https://www.weixin.qq.com/wxpay/pay.php` | application-dev.yml | **微信支付** 退款结果回调 URL（占位假值） |

> 说明：`application-dev.yml` **没有** `sky.jwt`、`sky.shop`、`sky.baidu` 节点——这三块直接写死在 `application.yml`，不通过占位符引用。

---

## 环境差异对比

本项目只有 `dev` 一个环境配置文件（`application-dev.yml`），`spring.profiles.active` 也固定为 `dev`，**不存在 prod / test 等其它可切换环境**。故此处**不做多列横向对比**，改为单环境运行摘要：

| 配置维度 | 值（dev，唯一环境） |
|---|---|
| 激活 Profile | `dev` |
| HTTP 端口 | `8080` |
| 监听地址 / 路径前缀 | `0.0.0.0`（默认） / 无前缀 |
| 数据库 | Druid 连接池 → `jdbc:mysql://localhost:3306/sky_take_out`（root / 123456，`useSSL=false`） |
| Redis | `localhost:6379`，database `10`，无密码 |
| SQL 日志 | `com.sky.mapper = debug`（打印 SQL），service / controller = info |
| ORM 行为 | 驼峰映射开启（`map-underscore-to-camel-case: true`） |
| 循环依赖 | 允许（`allow-circular-references: true`） |
| JWT | secret `sky-take-out-cend-auth-unified-secret-2026`，ttl 2 小时 |
| 阿里云 OSS | `oss-cn-hangzhou.aliyuncs.com` / bucket `sky-take-out` |
| 微信支付 | 证书指向本机 `D:\*.pem`，notifyUrl 为占位 URL（遗留，待功能 0002 mock 化） |

---

## API 路径概览

context-path 为空（无前缀），故 URL 前缀即 Controller 的 `@RequestMapping`。以下基于 S3 Controller 清单 + 命名惯例**推断**，精确路径待 backend-scan-5-flow 读源码确认。无 Gateway，全部标"（推断）"。

### 管理端（`controller/admin`，鉴权推断为 ROLE ADMIN，`/admin/**`）

| URL 路径前缀（推断） | 对应 Controller | 推断功能 |
|---|---|---|
| `/admin/employee` | admin/EmployeeController | 员工登录 / 增删改查 / 启停 / 改密 |
| `/admin/category` | admin/CategoryController | 分类（菜品/套餐分类）管理 |
| `/admin/dish` | admin/DishController | 菜品管理（含口味） |
| `/admin/setmeal` | admin/SetmealController | 套餐管理 |
| `/admin/order` | admin/OrderController | 订单管理（接单/拒单/派送/完成/查询） |
| `/admin/report` | admin/ReportController | 营业数据报表统计 |
| `/admin/shop` | admin/ShopController | 店铺营业状态设置/查询（走 Redis） |
| `/admin/workspace` | admin/WorkSpaceController | 工作台数据聚合 |
| `/admin/common` | admin/CommonController | 通用接口（文件上传到 OSS） |

### C 端顾客（`controller/user`，鉴权推断为 ROLE USER，`/user/**`）

| URL 路径前缀（推断） | 对应 Controller | 推断功能 |
|---|---|---|
| `/user/user` | user/UserController | C 端登录 / 注册（功能 0001 本地账密 + JWT） |
| `/user/category` | user/CategoryController | 顾客侧分类浏览 |
| `/user/dish` | user/DishController | 顾客侧菜品浏览 |
| `/user/setmeal` | user/SetmealController | 顾客侧套餐浏览 |
| `/user/shoppingCart` | user/ShoppingCartController | 购物车增删改查 |
| `/user/addressBook` | user/AddressBookController | 地址簿管理 |
| `/user/order` | user/OrderController | 下单 / 支付 / 历史订单 / 催单 |
| `/user/shop` | user/ShopController | 顾客侧查询店铺营业状态 |

### 回调端（`controller/notify`，无鉴权，外部服务器 POST）

| URL 路径前缀（推断） | 对应 Controller | 推断功能 |
|---|---|---|
| `/notify`（如 `/notify/paySuccess`，推断） | notify/PayNotifyController | 微信支付结果异步回调（微信服务器主动 POST，非前端调用） |

---

## 数据库 Schema 索引

项目**未发现独立的 `sql/` 文件夹**（`sky-server` 及各模块 `resources/` 下均无 `sql/` 目录）。已用全局搜索 `**/*.sql` 坐实：全仓库只有 2 个 `.sql` 文件，且都在代码根 `sky-take-out/` 之外（仓库根 + docs），逐一登记如下：

| 文件（完整路径） | 用途推断（据文件头注释） |
|---|---|
| `D:\CQWM2\sky.sql` | **全库建表脚本 / schema 源头**。文件以 `CREATE DATABASE IF NOT EXISTS sky_take_out` + 一系列 `DROP TABLE / CREATE TABLE` 开头（address_book、category、dish、setmeal、orders、user、employee 等全部业务表），用于全新导入建库。字段含中文 COMMENT，引擎 InnoDB。 |
| `D:\CQWM2\docs\features\0001-cend-auth-jwt\0001-migration.sql` | **功能 0001「C 端认证改造」增量迁移脚本**。头注释明确：对【正在运行的库】做原地升级——① `user` 表新增 `username`(唯一索引)+`password` 两列；② `employee` 表 admin 密码迁移为 BCrypt 哈希。用 information_schema 存在性守卫 + PREPARE/EXECUTE 动态 SQL 实现幂等可重跑（MySQL 5.7，库名以 `DATABASE()` 为准）。与 `sky.sql` 内容对齐。 |

> 补充：`sky-server/src/main/resources/mapper/*.xml`（11 个，与 Mapper 接口同名）是**运行时查询 SQL**（MyBatis 映射），**非建表 schema**，本步骤不读其内容。表结构 DDL 的字段级精读留给 backend-scan-4b-datamodel（它会读取上面两个 `.sql` 的建表内容 + entity 字段）。
