# PROJECT_S4_ENTRYPOINT — 核心入口定位

> 项目名称：sky-take-out（苍穹外卖）
> 项目类型：多模块单体应用（Multi-module Monolith）
> 默认激活 Profile：`dev`（来自 `application.yml` 的 `spring.profiles.active: dev`）
> 配置文件一览：
> - `sky-server/src/main/resources/application.yml`（公共配置 + 占位符引用）
> - `sky-server/src/main/resources/application-dev.yml`（dev profile，提供占位符的实际值）
> - `sky-common`、`sky-pojo` 两个子模块**无 `application.yml`**（纯支撑库，不可独立运行，无需配置）
> - 无 `bootstrap.yml` / `bootstrap.properties`（本项目非微服务，不接配置中心）

> ⚠️ 关键机制说明（贯穿全文）：本项目的两份配置文件不是常见的"默认值 + profile 覆盖"关系，而是**占位符 + 填值**关系。`application.yml` 里大量字段写成 `${sky.datasource.host}` 这样的**占位符（Placeholder）**，真正的值定义在 `application-dev.yml` 的 `sky.*` 节点下。启动时 `spring.profiles.active: dev` 让 `application-dev.yml` 被加载，Spring 再用它的值去填充 `application.yml` 里的占位符。所以两份文件**必须同时存在**才能拼出一份完整可运行的配置。

---

## 启动顺序

本项目是单体应用，只有一个运行进程（`SkyApplication`），但它在启动/运行时依赖两个外部中间件（MySQL、Redis）和若干第三方 SaaS。合理的启动顺序如下：

1. **MySQL 数据库（必需）**：项目的核心数据存储，所有业务数据（employee / dish / setmeal / orders / user 等表）都持久化在名为 `sky_take_out` 的库里。必须**最先**就绪——`application-dev.yml` 指定了 `sky.datasource.host: localhost` / `port: 3306` / `database: sky_take_out`，应用启动时 Druid 连接池会按此配置建立连接，且 MyBatis 需要 `sky_take_out` 库存在；数据库未就绪时，Druid 初始化连接失败会直接导致启动报错，即使勉强启动，任何走 mapper 的接口也会立即抛异常。

2. **Redis 缓存（可选依赖）**：用作缓存后端，配合启动类的 `@EnableCaching` 与 `config/RedisConfiguration.java` 使用（如缓存菜品/套餐、店铺营业状态、验证码等）。放在 MySQL 之后、应用之前是**理想顺序**，但它对"应用能否启动"是**可选依赖**：Spring Boot 默认用 Lettuce 客户端，Redis 连接是**懒加载**的（首次使用才真正连接），所以即使 Redis 没起，`SkyApplication` 依然能启动成功。**未启动的影响**：所有依赖缓存的功能（如管理端设置/查询营业状态、走 `@Cacheable` 的菜品套餐查询）会在**首次调用时**抛出 Redis 连接异常，而不是启动时报错。配置见 `application-dev.yml` 的 `sky.redis.host: localhost` / `port: 6379` / `password: 空` / `database: 10`。

3. **sky-server 应用本身（`SkyApplication`）**：唯一的部署单元，打包成可执行 jar 后运行，监听 `8080` 端口对外提供 HTTP 服务。必须放在**最后**——它启动时要向 MySQL 建连接池、注册 JWT 拦截器、装配 Redis/OSS/WebSocket 等 Bean，因此依赖上面两个中间件先就位（至少 MySQL 必须先就位）。启动成功后，管理端与 C 端的全部 REST 接口、WebSocket 端点、定时任务（`@Scheduled`）才开始工作。

> 补充：第三方 SaaS 属于**运行时可选外部依赖**，不需要你"启动"，只需保证配置里的凭证有效，且仅影响特定功能，因此不列入上面的启动步骤：
> - **阿里云 OSS（可选）**：菜品/套餐图片上传。凭证在 `application-dev.yml` 的 `sky.alioss.*`。未配置/失效时，仅图片上传（`admin/CommonController`）失败，不影响启动与其它功能。
> - **微信支付 / 微信登录（可选）**：C 端下单支付与微信登录。凭证在 `sky.wechat.*`。未配置时，仅支付/微信登录失败。注意 `privateKeyFilePath: D:\apiclient_key.pem` 等是**本地绝对路径**，换机器需同步存在这些证书文件。
> - **百度地图（可选）**：`sky.baidu.ak: EFEEFFEFEFE`（明显是占位假值），用于地址解析/配送范围校验，未配置时相关校验失败。

---

## 对外入口

- 端口：**8080**（`application.yml` 第 2 行 `server.port: 8080`；dev profile 未覆盖，两个环境都是 8080）
- 监听地址：未配置，默认 `0.0.0.0`（`server.address` 未出现在任何配置文件中）
- 路径前缀：**无前缀**（未配置 `server.servlet.context-path`，Controller 的 `@RequestMapping` 路径即为完整路径）
- 完整访问地址示例：
  - 管理端登录（推断）：`http://localhost:8080/admin/employee/login`
  - C 端微信登录（推断）：`http://localhost:8080/user/user/login`
  - WebSocket 端点（推断）：`ws://localhost:8080/ws/{sid}`
- 如有 Gateway：**无。本项目是单体应用，当前仓库不含任何网关模块**（启动类无 `@EnableDiscoveryClient`/`@EnableFeignClients`，无 `spring.cloud.gateway` 配置）。所有流量直接打到 8080 端口的 Spring MVC。

---

## 关键配置项索引

> 本项目有两份配置文件，但**只有 `dev` 一个 profile**。下面按"公共配置（application.yml）"和"dev 配置（application-dev.yml，填充占位符）"两段组织。所有值按配置文件原始内容如实输出，不打码（本文档为个人学习用途）。

### 公共配置（application.yml）

| 配置项 | 值 | 所在文件路径 | 作用说明 |
|---|---|---|---|
| server.port | 8080 | sky-server/src/main/resources/application.yml | 服务监听端口 |
| spring.profiles.active | dev | sky-server/src/main/resources/application.yml | **默认激活的 profile**，决定加载 application-dev.yml |
| spring.main.allow-circular-references | true | sky-server/src/main/resources/application.yml | **行为开关**：允许 Bean 之间循环引用（Spring Boot 2.6+ 默认禁止，此处显式打开，说明项目存在循环依赖的 Bean） |
| spring.datasource.druid.driver-class-name | ${sky.datasource.driver-class-name} → com.mysql.cj.jdbc.Driver | application.yml | MySQL JDBC 驱动类（占位符，dev 填值） |
| spring.datasource.druid.url | jdbc:mysql://${sky.datasource.host}:${sky.datasource.port}/${sky.datasource.database}?serverTimezone=Asia/Shanghai&useUnicode=true&characterEncoding=utf-8&zeroDateTimeBehavior=convertToNull&useSSL=false&allowPublicKeyRetrieval=true → jdbc:mysql://localhost:3306/sky_take_out?... | application.yml | 数据库连接地址（占位符，dev 填值） |
| spring.datasource.druid.username | ${sky.datasource.username} → root | application.yml | 数据库用户名（占位符，dev 填值） |
| spring.datasource.druid.password | ${sky.datasource.password} → 123456 | application.yml | 数据库密码（占位符，dev 填值） |
| spring.redis.host | ${sky.redis.host} → localhost | application.yml | Redis 主机（占位符，dev 填值） |
| spring.redis.port | ${sky.redis.port} → 6379 | application.yml | Redis 端口（占位符，dev 填值） |
| spring.redis.password | ${sky.redis.password} → （空） | application.yml | Redis 密码（占位符，dev 填值，dev 为空） |
| spring.redis.database | ${sky.redis.database} → 10 | application.yml | Redis 逻辑库编号（占位符，dev 填值） |
| mybatis.mapper-locations | classpath:mapper/*.xml | application.yml | MyBatis XML 映射文件位置（`sky-server/src/main/resources/mapper/*.xml`） |
| mybatis.type-aliases-package | com.sky.entity | application.yml | 实体类别名包，指向 sky-pojo 的 entity 包 |
| mybatis.configuration.map-underscore-to-camel-case | true | application.yml | **行为开关**：开启下划线→驼峰自动映射（如 `create_time`→`createTime`） |
| logging.level.com.sky.mapper | debug | application.yml | mapper 层日志级别（会打印 SQL） |
| logging.level.com.sky.service | info | application.yml | service 层日志级别 |
| logging.level.com.sky.controller | info | application.yml | controller 层日志级别 |
| sky.jwt.admin-secret-key | itcast | application.yml | 管理端 JWT 签名密钥 |
| sky.jwt.admin-ttl | 7200000 | application.yml | 管理端 JWT 过期时间（毫秒，=2 小时） |
| sky.jwt.admin-token-name | token | application.yml | **行为开关**：管理端令牌的请求头名称（拦截器据此取 token） |
| sky.jwt.user-secret-key | itheima | application.yml | C 端 JWT 签名密钥 |
| sky.jwt.user-ttl | 7200000 | application.yml | C 端 JWT 过期时间（毫秒，=2 小时） |
| sky.jwt.user-token-name | authentication | application.yml | **行为开关**：C 端令牌的请求头名称（与管理端不同，用于区分两套鉴权） |
| sky.alioss.* | ${...} → 见 dev 表 | application.yml | 阿里云 OSS 四项配置（endpoint/access-key-id/access-key-secret/bucket-name，占位符） |
| sky.wechat.* | ${...} → 见 dev 表 | application.yml | 微信支付/登录九项配置（占位符） |
| sky.shop.address | 湖北省武汉市洪山区徐东大街18号 | application.yml | 店铺地址（用于百度地图配送范围校验，直接写死在公共配置） |
| sky.baidu.ak | EFEEFFEFEFE | application.yml | 百度地图 AK（明显是假占位值，直接写死在公共配置，dev 未覆盖） |

### dev 配置覆盖（application-dev.yml）

> 说明：本文件不是"覆盖默认值"，而是**为 application.yml 里的占位符 `${sky.*}` 提供实际值**。下表列出它定义的所有 `sky.*` 键。凡是 application.yml 里没有对应占位符的项（如 `sky.shop.address`、`sky.baidu.ak`、`sky.jwt.*`）**都不在本文件中**，仍取 application.yml 的写死值。

| 配置项 | 值 | 所在文件路径 | 作用说明 |
|---|---|---|---|
| sky.datasource.driver-class-name | com.mysql.cj.jdbc.Driver | sky-server/src/main/resources/application-dev.yml | 填充 datasource 驱动占位符 |
| sky.datasource.host | localhost | application-dev.yml | 填充数据库主机占位符 |
| sky.datasource.port | 3306 | application-dev.yml | 填充数据库端口占位符 |
| sky.datasource.database | sky_take_out | application-dev.yml | 填充数据库名占位符（库名 = sky_take_out） |
| sky.datasource.username | root | application-dev.yml | 填充数据库用户名占位符 |
| sky.datasource.password | 123456 | application-dev.yml | 填充数据库密码占位符 |
| sky.alioss.endpoint | oss-cn-hangzhou.aliyuncs.com | application-dev.yml | 阿里云 OSS 区域端点 |
| sky.alioss.access-key-id | LTAI5tPeFLzsPPT8gG3LPW64 | application-dev.yml | 阿里云 OSS AccessKey ID（第三方凭证，原样输出） |
| sky.alioss.access-key-secret | U6k1brOZ8gaOIXv3nXbulGTUzy6Pd7 | application-dev.yml | 阿里云 OSS AccessKey Secret（第三方凭证，原样输出） |
| sky.alioss.bucket-name | sky-take-out | application-dev.yml | 阿里云 OSS 存储桶名 |
| sky.redis.host | localhost | application-dev.yml | 填充 Redis 主机占位符 |
| sky.redis.port | 6379 | application-dev.yml | 填充 Redis 端口占位符 |
| sky.redis.password | （空） | application-dev.yml | 填充 Redis 密码占位符（dev 无密码） |
| sky.redis.database | 10 | application-dev.yml | 填充 Redis 逻辑库占位符（第 10 号库） |
| sky.wechat.appid | wx9e8dde9d2df9df58 | application-dev.yml | 微信公众号/小程序 AppID（第三方凭证） |
| sky.wechat.secret | 7a354c0cab2186281c18839acf453e37 | application-dev.yml | 微信 AppSecret（第三方凭证） |
| sky.wechat.mchid | 1561414331 | application-dev.yml | 微信支付商户号 |
| sky.wechat.mchSerialNo | 4B3B3DC35414AD50B1B755BAF8DE9CC7CF407606 | application-dev.yml | 微信支付商户证书序列号 |
| sky.wechat.privateKeyFilePath | D:\apiclient_key.pem | application-dev.yml | 微信支付商户私钥文件路径（**本地绝对路径**，换机需同步文件） |
| sky.wechat.apiV3Key | CZBK51236435wxpay435434323FFDuv3 | application-dev.yml | 微信支付 APIv3 密钥 |
| sky.wechat.weChatPayCertFilePath | D:\wechatpay_166D96F876F45C7D07CE98952A96EC980368ACFC.pem | application-dev.yml | 微信支付平台证书路径（**本地绝对路径**） |
| sky.wechat.notifyUrl | https://www.weixin.qq.com/wxpay/pay.php | application-dev.yml | 支付成功回调地址 |
| sky.wechat.refundNotifyUrl | https://www.weixin.qq.com/wxpay/pay.php | application-dev.yml | 退款回调地址 |

> 注意：`spring.profiles.active` 设置为 `dev`，且项目中**存在**对应的 `application-dev.yml`（本项目就靠它给占位符填值）。项目中**不存在** `application-prod.yml`、`application-test.yml`、`application-local.yml` 等其它 profile 文件——即除了 `dev`，没有任何其它可切换的运行环境。

---

## 环境差异对比

> 本项目**只有 `dev` 一个 profile**，不存在 prod/test 等其它环境文件，因此没有可供横向对比的第二列。下表以 dev 为唯一环境列出其关键运行维度，并显式标注缺失的环境，供后续扩展参考。

| 配置维度 | dev（唯一环境） | prod（不存在） | test（不存在） |
|---|---|---|---|
| 端口 | 8080 | —（无 application-prod.yml） | —（无 application-test.yml） |
| 数据库 | jdbc:mysql://localhost:3306/sky_take_out（root / 123456） | — | — |
| Redis | localhost:6379，无密码，database=10 | — | — |
| Redis 密码 | 空 | — | — |
| Elasticsearch | 未使用（项目无 ES 依赖与配置） | — | — |
| SQL 日志 | 启用（`logging.level.com.sky.mapper: debug` 会打印 SQL） | — | — |
| 循环依赖开关 | 启用（`spring.main.allow-circular-references: true`） | — | — |
| 阿里云 OSS | 启用（endpoint=oss-cn-hangzhou，桶=sky-take-out） | — | — |
| 微信支付 | 启用（含商户号、私钥/证书本地路径） | — | — |

> 结论：本项目是典型的"教学用单环境项目"——只维护 `dev` 一份可运行配置，敏感凭证（数据库密码、OSS Secret、微信商户密钥）**明文写死在 `application-dev.yml`**，未做多环境隔离，也未使用配置中心。若日后要上生产，需新增 `application-prod.yml` 并把凭证外置。

---

## API 路径概览

> 本步骤**不读 `.java` 源码**，路径前缀依据"Controller 类名 → RESTful 路径惯例"推断，且 `server.servlet.context-path` 无前缀，故完整 URL 前缀 = Controller 推断路径。所有路径均标注"（推断）"，精确路径待 backend-scan-5-flow 读源码确认。Controller 清单来自 PROJECT_S3_MODULES.md。

| URL 路径前缀（推断） | 对应 Controller | 推断功能 |
|---|---|---|
| /admin/category/** | admin/CategoryController | 管理端：分类（菜品分类/套餐分类）增删改查 |
| /admin/common/** | admin/CommonController | 管理端：通用接口，主要是文件上传（图片传阿里云 OSS） |
| /admin/dish/** | admin/DishController | 管理端：菜品 CRUD、起售停售 |
| /admin/employee/** | admin/EmployeeController | 管理端：员工登录、员工管理（新增/分页/启用禁用/改密码） |
| /admin/order/** | admin/OrderController | 管理端：订单管理（接单/拒单/派送/完成/取消） |
| /admin/report/** | admin/ReportController | 管理端：数据统计报表（营业额/用户/订单/销量 Top10） |
| /admin/setmeal/** | admin/SetmealController | 管理端：套餐 CRUD、起售停售 |
| /admin/shop/** | admin/ShopController | 管理端：设置/查询店铺营业状态（存 Redis） |
| /admin/workspace/** | admin/WorkSpaceController | 管理端：工作台概览（今日数据/订单/菜品套餐总览） |
| /user/user/** | user/UserController | C 端：微信登录（换取 openid + 签发 JWT） |
| /user/category/** | user/CategoryController | C 端：分类查询 |
| /user/dish/** | user/DishController | C 端：按分类查菜品（走 Redis 缓存） |
| /user/setmeal/** | user/SetmealController | C 端：套餐查询、套餐内菜品查询 |
| /user/shoppingCart/** | user/ShoppingCartController | C 端：购物车增删改查、清空 |
| /user/addressBook/** | user/AddressBookController | C 端：收货地址簿 CRUD、设置默认地址 |
| /user/order/** | user/OrderController | C 端：下单、支付、历史订单、再来一单、催单 |
| /user/shop/** | user/ShopController | C 端：查询店铺营业状态 |
| /notify/paySuccess（推断） | notify/PayNotifyController | 微信支付服务器**异步回调**入口（供微信 POST 支付结果，非前端调用） |
| ws://localhost:8080/ws/{sid}（推断） | websocket/WebSocketServer | WebSocket 长连接端点：来单/催单实时推送到管理端（非 REST） |

> 说明：管理端与 C 端存在多个同名 Controller（如 `admin/CategoryController` 与 `user/CategoryController`、`admin/DishController` 与 `user/DishController`、`admin/OrderController` 与 `user/OrderController`、`admin/ShopController` 与 `user/ShopController`），靠 `/admin` 与 `/user` 前缀区分，且分别由 `JwtTokenAdminInterceptor`（token 头名 `token`）与 `JwtTokenUserInterceptor`（token 头名 `authentication`）鉴权。

---

## 数据库 Schema 索引

**未发现独立的 SQL 脚本目录。**

- 项目根目录及各子模块（sky-server / sky-common / sky-pojo）下均**无 `sql/` 文件夹**，全仓库搜索 `**/*.sql` 无任何结果。
- 建表脚本未纳入本仓库——数据库表结构（`sky_take_out` 库）需从苍穹外卖官方配套资料单独导入，或由使用者手动建库建表。
- 与数据库交互的 SQL 存在于 MyBatis 的 XML 映射文件中：`sky-server/src/main/resources/mapper/*.xml`（由 `mybatis.mapper-locations: classpath:mapper/*.xml` 指定），但这是**运行时查询 SQL**，不是建表 schema，且本步骤不读其内容。
- 项目也**未使用** Elasticsearch，无 ES 索引映射文件（`*.json` mapping）。
