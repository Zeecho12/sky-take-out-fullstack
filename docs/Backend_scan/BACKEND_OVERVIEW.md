# sky-take-out（苍穹外卖） BACKEND_OVERVIEW
<!-- 由 backend-scan-7a-brief 生成，读者为下游 AI Skill；审计状态由 backend-scan-7b-audit 回填 -->

## META

| 字段 | 值 |
|---|---|
| project_name | sky-take-out（苍穹外卖） |
| project_type | 多模块单体（Multi-Module Monolith）—— 基于 Spring Boot 的 Maven 聚合工程 |
| project_purpose | 外卖 / 餐饮点餐系统后端服务（商家管理端 + 顾客 C 端） |
| base_package | com.sky（三个子模块统一 `src/main/java/com/sky/`） |
| active_profile | dev（`application.yml` 中 `spring.profiles.active: dev`，唯一环境） |
| module_count | 3 个子模块（sky-common / sky-pojo / sky-server）+ 1 个根聚合父工程（sky-take-out，`packaging=pom`，不产出运行制品） |
| module_names | sky-common, sky-pojo, sky-server（父工程 sky-take-out） |
| core_business | C 端「用户下单」submitOrder（购物车 → 正式订单，价值产出点主链）；另有员工/分类/菜品/套餐/订单管理、报表统计、微信支付（遗留待 mock）、WebSocket 来单提醒 |
| port | 8080（`server.port`） |
| context_path | 无（未配置 `server.servlet.context-path`，Controller 的 `@RequestMapping` 即完整路径） |
| base_url_example | `http://localhost:8080/admin/employee/login`、`http://localhost:8080/user/user/login` |
| spring_boot_version | 2.7.3（根 pom `<parent>` 继承 `spring-boot-starter-parent`） |
| java_version | 未在 SECTION-1~5 中找到（S2 仅提及 `jaxb-api` 为兼容 JDK 9+ 补回，未给出确切 Java 版本） |
| database_type | MySQL（`0001-migration.sql` 注释确认 MySQL 5.7；引擎 InnoDB，默认字符集 utf8mb3，部分列 utf8mb4） |
| default_db_url | `jdbc:mysql://localhost:3306/sky_take_out?...&useSSL=false&allowPublicKeyRetrieval=true`（含 `serverTimezone=Asia/Shanghai`）；username=`root` / password=`123456`（Druid 连接池） |
| table_count | 11（address_book / category / dish / dish_flavor / employee / order_detail / orders / setmeal / setmeal_dish / shopping_cart / user；取自 S4B） |
| entity_count | 11（与 11 张表一一对应；取自 S4B） |
| tech_summary | Spring Boot 2.7.3 单体；Spring MVC + WebSocket + Spring Cache；MyBatis 2.2.0 + MySQL + Druid 1.2.1 + PageHelper 1.3.0；Redis（Lettuce）；Spring Security + JJWT 0.9.1；Lombok / Jackson / Fastjson / AspectJ(AOP) / Knife4j / Aliyun OSS SDK / Apache POI / WeChat Pay SDK |
| has_gateway | 否（无 Spring Cloud Gateway / Nacos / Eureka / OpenFeign；启动类无 `@EnableDiscoveryClient`/`@EnableFeignClients`） |
| has_es | 否（S2 技术栈未见 Elasticsearch 依赖） |
| has_mq | 否（未引入 RabbitMQ / Kafka，无 `@RabbitListener` / `@KafkaListener`） |
| has_security_framework | 是（Spring Security + JJWT，功能 0001「C 端认证改造」引入） |
| has_docker | 否（全局搜索 `**/Dockerfile`、`**/docker-compose.y*ml`、`**/.dockerignore` 均无结果） |
| merge_audit_status | PASS |
| generated_at | 2026-07-22 |

---

## AI 导航
- **快速查询**：META（项目元信息）/ `FILE_INDEX.md`（按类型批量定位 .java 与配置，独立文件）
- **核心信息**：SECTION-5（真实代码片段）/ SECTION-6（数据模型）/ SECTION-7（项目约定与陷阱）
- **完整保真**：SECTION-1~4（定性、技术栈、模块地图、入口配置，为 AI 重排、信息不减）
- **允许回源**：本文件未展开的细节，读扫描目录里的 `PROJECT_SN_*.md` 或源码
- **质量审计**：见同目录 `MERGE_AUDIT.md`（由 7b 生成；META 顶部 merge_audit_status 是信任度速览）

---

## SECTION-1: 项目定性
> SOURCE: docs/Backend_scan/PROJECT_S1_PROFILE.md

### 项目基本信息
- 项目名称：`sky-take-out`（`pom.xml` 第 12 行 `<artifactId>sky-take-out</artifactId>`，第 11 行 `<groupId>com.sky</groupId>`，第 14 行 `<version>1.0-SNAPSHOT</version>`）；中文名「苍穹外卖」。
- 项目用途：外卖 / 餐饮点餐系统后端服务（商家管理端 + 顾客 C 端）。依据：
  - 根 `pom.xml` 第三方依赖透露业务特征——`wechatpay-apache-httpclient`（微信支付，POM 第 119-124 行）、`aliyun-sdk-oss`（阿里云 OSS 文件上传，第 96-100 行）、`poi`/`poi-ooxml`（Excel 报表导出，第 108-118 行）、`pagehelper`（分页查询，第 66-70 行）。
  - CODE_ROOT `NOTE/` 笔记文件名涉及「新增员工 / 员工分页查询 / 启用禁用员工账户 / 编辑员工信息 / C 端菜品查询」等，指向「后台管理端 + C 端顾客点餐」典型外卖形态。
- 项目类型：多模块单体（Multi-Module Monolith）。判断依据：
  1. 根 `pom.xml` 第 13 行 `<packaging>pom</packaging>`，第 15-19 行 `<modules>` 聚合三个子模块（`sky-common`/`sky-pojo`/`sky-server`）——本身不产出可运行制品，是聚合/父工程（Aggregator/Parent POM）。
  2. depth=2 目录结构显示三个子文件夹各带独立 `pom.xml`，符合 Maven 多模块划分。
  3. 父工程继承 `spring-boot-starter-parent` 2.7.3（第 6-10 行），根 `pom.xml` 未见任何 Spring Cloud / 注册中心 / 网关依赖（无 Eureka/Nacos/Gateway/OpenFeign），三模块同属一套构建、共享一个父 POM，故为「多模块**单体**」而非微服务。

### 构建与部署
- 构建工具：Maven（各层均 `pom.xml`，无 `build.gradle`）；`modelVersion` 4.0.0；父工程继承 `spring-boot-starter-parent` **2.7.3**（即 Spring Boot 2.7.3）。`pom.xml` 未声明 Maven 自身版本，CODE_ROOT 下无 Maven Wrapper（`mvnw`/`.mvn`）。
- 容器化：**没有**。全局搜索 `**/Dockerfile`、`**/docker-compose.y*ml`、`**/.dockerignore` 均无结果；`.env`/`.env.example` 亦未发现。
- 部署方式：推测直接 jar 部署——可运行模块 `sky-server` 经 `spring-boot-maven-plugin` 打成可执行 fat jar 后 `java -jar` 运行。
- SQL 脚本索引（仅登记位置）：全局搜索 `**/*.sql` 命中两处，均**不在 CODE_ROOT 内**——`D:\CQWM2\sky.sql`（仓库根，主建表脚本）、`D:\CQWM2\docs\features\0001-cend-auth-jwt\0001-migration.sql`（功能 0001 迁移脚本）。CODE_ROOT (`sky-take-out/`) 内无 `.sql`。

### 模块列表
- `sky-take-out`：`D:\CQWM2\sky-take-out\`（根聚合/父工程，`packaging=pom`，不产出运行制品）
- `sky-common`：`D:\CQWM2\sky-take-out\sky-common\`（公共模块：通用工具类、常量、统一返回结果、全局异常等）
- `sky-pojo`：`D:\CQWM2\sky-take-out\sky-pojo\`（数据模型模块：Entity / DTO / VO 等纯数据对象）
- `sky-server`：`D:\CQWM2\sky-take-out\sky-server\`（主服务/启动模块：Controller / Service / Mapper 等业务代码，唯一可运行、对外提供接口的部署单元）

---

## SECTION-2: 技术栈全景
> SOURCE: docs/Backend_scan/PROJECT_S2_TECHSTACK.md
> 版本约定：Spring 全家桶 starter 未显式写版本，由根 pom `<parent>` 继承的 `spring-boot-starter-parent` 2.7.3 统一管理（标「父 pom 管理（2.7.3）」）；其余第三方库版本来自根 pom `<properties>` + `<dependencyManagement>`（标「根 pom 管理」）。

### 核心框架
| 技术名称 | 版本 | 在项目中的作用 |
|---|---|---|
| Spring Boot | 2.7.3（根 pom `<parent>`） | 整个后端的启动与自动配置底座，`sky-server` 靠一个 main 方法拉起全站 |
| Spring MVC（`spring-boot-starter-web`） | 父 pom 管理（2.7.3） | Controller 接收 HTTP 请求、返回 JSON，对外 REST 接口实现基础 |
| Spring WebSocket（`spring-boot-starter-websocket`） | 父 pom 管理（2.7.3） | 浏览器与服务器长连接，供服务端主动推送（商家端实时订单提醒类推送） |
| Spring Cache（`spring-boot-starter-cache`） | 父 pom 管理（2.7.3） | `@Cacheable` 等缓存注解，配合 Redis 缓存菜品/套餐等热点数据 |

### 数据层
| 技术名称 | 版本 | 在项目中的作用 |
|---|---|---|
| MyBatis（`mybatis-spring-boot-starter`） | 2.2.0（根 pom 管理） | 持久层框架，SQL 写在 Mapper，负责与 MySQL 交互 |
| MySQL Connector/J（`mysql-connector-java`） | 父 pom 管理（2.7.3 BOM，runtime） | JDBC 驱动，连 MySQL |
| Druid（`druid-spring-boot-starter`） | 1.2.1（根 pom 管理） | 数据库连接池，管理复用连接，自带监控 |
| PageHelper（`pagehelper-spring-boot-starter`） | 1.3.0（根 pom 管理） | 分页插件，自动拼 `limit`，支撑后台分页列表 |

> 微服务基础设施：全部 pom 未见 Spring Cloud Gateway / Nacos / Eureka / Dubbo / OpenFeign / Sentinel 等任何微服务组件依赖（S1 已定性为多模块单体），该分类省略。

### 中间件
| 技术名称 | 版本 | 在项目中的作用 |
|---|---|---|
| Redis（`spring-boot-starter-data-redis`） | 父 pom 管理（2.7.3） | 内存数据库，做缓存（配合 Spring Cache 缓存菜品/套餐）、存登录态/验证码等临时数据 |

### 安全与认证
| 技术名称 | 版本 | 在项目中的作用 |
|---|---|---|
| Spring Security（`spring-boot-starter-security`） | 父 pom 管理（2.7.3） | 全站认证授权框架（功能 0001 引入）：拦截 `/admin/**`=ADMIN、`/user/**`=USER，未登录 401 / 无权限 403，BCrypt 加密密码 |
| JJWT（`jjwt`，io.jsonwebtoken） | 0.9.1（根 pom 管理） | 生成/校验 JWT 令牌，承载登录用户身份，配合 Spring Security 做无状态认证 |

### 实用工具与第三方库
| 技术名称 | 版本 | 在项目中的作用 |
|---|---|---|
| Lombok | 1.18.30（根 pom 管理） | 注解自动生成 getter/setter/构造器，精简 Entity/DTO/VO 样板代码 |
| Jackson（`jackson-databind` + `spring-boot-starter-json`） | jackson-databind 2.9.2（sky-pojo 显式）；starter-json 父 pom 管理（2.7.3） | Java 对象 ↔ JSON 互转，REST 接口序列化默认实现 |
| Fastjson | 1.2.76（根 pom 管理） | 阿里 JSON 库，做部分 JSON 序列化/反序列化 |
| Apache Commons Lang（`commons-lang`） | 2.6（根 pom 管理） | 通用工具类（字符串判空、日期处理等） |
| AspectJ（`aspectjrt` + `aspectjweaver`） | 1.9.4（根 pom 管理） | 支撑 Spring AOP，做横切逻辑（如公共字段 createTime/updateTime 自动填充） |
| Knife4j（`knife4j-spring-boot-starter`） | 3.0.2（根 pom 管理） | 基于 Swagger 生成在线 API 文档与调试页面 |
| Aliyun OSS SDK（`aliyun-sdk-oss`） | 3.10.2（根 pom 管理） | 对接阿里云对象存储，上传/存放菜品图片等文件 |
| Apache POI（`poi` + `poi-ooxml`） | 3.16（根 pom 管理） | 读写 Excel（.xls/.xlsx），营业数据报表导出 |
| WeChat Pay SDK（`wechatpay-apache-httpclient`） | 0.4.8（根 pom 管理） | 对接微信支付 API v3（下单/回调验签）；原始项目遗留，功能 0002 计划替换为支付 mock |
| JAXB API（`jaxb-api`） | 2.3.1（根 pom 管理） | 提供 `javax.xml.bind` XML 绑定 API；JDK 9+ 移除，此处补回兼容 |
| spring-boot-configuration-processor | 父 pom 管理（2.7.3，optional） | 为 `@ConfigurationProperties` 配置类生成元数据（yml 提示配置项） |
| spring-boot-starter-test | 父 pom 管理（2.7.3，test） | 测试脚手架（JUnit/Mockito/AssertJ），供 `sky-server` 写单元/集成测试 |

---

## SECTION-3: 模块地图
> SOURCE: docs/Backend_scan/PROJECT_S3_MODULES.md
> spring.application.name：未声明（`application.yml` 只设 `server.port: 8080`）。启动类：`com.sky.SkyApplication`（`D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\SkyApplication.java`）。基础包：`com.sky`。
> 粒度：Part A 每 Maven 子模块一卡片（打包结构）；Part B 对 `sky-server` 按内部顶层分层包各一卡片（分层架构，均借用主启动类 `SkyApplication`）。各卡片「完整文件清单」已移至 `FILE_INDEX.md`。

### 启动类注解分析
`com.sky.SkyApplication` 类声明上的全部注解（读自文件头部，未读方法体）：
```
@SpringBootApplication
@EnableTransactionManagement
@Slf4j
@EnableCaching
@EnableScheduling
public class SkyApplication
```

| 注解 | 含义 | 开启的能力 |
|---|---|---|
| `@SpringBootApplication` | 复合注解（`@Configuration` + `@EnableAutoConfiguration` + `@ComponentScan`） | 标准启动类；开启自动配置，以 `com.sky` 为根扫描组件 |
| `@EnableTransactionManagement` | 开启声明式事务管理 | 让 `@Transactional` 生效，Service 层可用注解划事务边界 |
| `@Slf4j` | Lombok 注解（非 Spring） | 编译期生成 `log` 字段 |
| `@EnableCaching` | 开启 Spring Cache 抽象 | 让 `@Cacheable`/`@CacheEvict` 生效；结合 `RedisConfiguration`，缓存后端为 Redis |
| `@EnableScheduling` | 开启定时任务调度 | 让 `@Scheduled` 生效，`task` 包定时任务运行 |

**未发现的注解（排除可能性）：**
- 无 `@EnableDiscoveryClient` / `@EnableEurekaClient` / `@EnableNacosDiscovery` → 不注册注册中心，印证单体。
- 无 `@EnableFeignClients` → 不通过 Feign 做远程 RPC；跨系统交互（微信支付、阿里云 OSS）走普通 HTTP 客户端。
- 无 `@MapperScan(...)` 标注在启动类上 → Mapper 接口推断各自用 `@Mapper` 被扫描（推断）。
- 无 `@EnableAsync` → 未开启 Spring 异步执行器（`@Async` 不生效）。
- 无 `@EnableCircuitBreaker` / `@EnableHystrix` → 无熔断降级。
- 无 `@ServletComponentScan` → WebSocket 端点由 `WebSocketConfiguration` 注册 `ServerEndpointExporter` 承载（推断）。

### Part A — Maven 子模块（打包结构）

**sky-common**（`D:\CQWM2\sky-take-out\sky-common\src\main\java\com\sky\`）
- 职责：公共基础模块——跨层复用工具类（JWT、阿里云 OSS、微信支付、HTTP 客户端）、统一返回封装（`Result`/`PageResult`）、自定义业务异常、常量、`@ConfigurationProperties` 属性绑定类、`ThreadLocal` 上下文（`BaseContext`）、Jackson 序列化定制。
- 启动类：无（被 `sky-server` 依赖，不独立运行）。
- 对外暴露：无 HTTP 入口，供 `sky-server` 依赖调用。
- 依赖谁：不依赖任何内部模块——grep 确认 `sky-common` 下无 `import com.sky.entity/dto/vo`（0 处），故不依赖 `sky-pojo`；仅依赖第三方库（JWT、aliyun-sdk-oss、wechatpay、httpclient，推断）。
- 文件清单见 FILE_INDEX.md 对应分类。

**sky-pojo**（`D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\`）
- 职责：数据模型模块——纯数据对象。`entity/` 与表映射的实体（PO），`dto/` 接收请求参数，`vo/` 返回给前端的视图对象。只描述数据形状，无业务逻辑。
- 启动类：无（被 `sky-server` 依赖，不独立运行）。
- 对外暴露：无 HTTP 入口，作为参数/返回类型被 `sky-server` 各层引用。
- 依赖谁：不依赖任何内部模块——grep 确认 `sky-pojo` 下无 `import com.sky.properties/utils/result/exception/...`（0 处），故不依赖 `sky-common`；仅依赖 Lombok 等第三方注解库（推断）。
- 文件清单见 FILE_INDEX.md 对应分类。

**sky-server**（`D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\`）
- 职责：主服务/启动模块——唯一可运行、对外提供 HTTP 接口的部署单元。承载全部业务分层（Controller → Service → Mapper）、Spring Security JWT 认证、AOP 公共字段自动填充、全局异常处理、定时任务与 WebSocket 推送。
- 启动类：有——`com.sky.SkyApplication`。
- 对外暴露：有 HTTP 入口。三大 Controller 分组：`controller/admin`（后台管理端）、`controller/user`（C 端顾客）、`controller/notify`（`PayNotifyController` 支付回调）。另有 `websocket/WebSocketServer`（`@ServerEndpoint` 长连接）。
- 依赖谁：依赖 `sky-common`（`Result`/`PageResult`、`JwtUtil`/`AliOssUtil`/`WeChatPayUtil`、异常、常量、`BaseContext`、`@ConfigurationProperties`）与 `sky-pojo`（`entity`/`dto`/`vo`）（推断）。不依赖其他内部模块。
- 文件清单见 FILE_INDEX.md 对应分类。

### Part B — sky-server 内部分层包（分层架构）
> 均位于 `D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\` 下，无独立启动类。文件清单见 FILE_INDEX.md。

- **controller**（`...\com\sky\controller\`）
  - 职责：HTTP 请求入口层（表现层）——接收请求、参数绑定校验、调 Service、封装 `Result` 返回。按端拆三组：`admin`（后台管理端，路径推断 `/admin/**`）、`user`（C 端顾客，`/user/**`）、`notify`（第三方支付异步回调）。
  - 对外暴露：**本单体的唯一 HTTP 入口**。管理端 API：员工/分类/菜品/套餐/订单/报表/店铺/工作台/通用上传；C 端 API：用户/分类/菜品/套餐/购物车/地址簿/订单/店铺；回调端：支付通知。
  - 依赖谁：依赖 `service`；用 `sky-pojo` 的 `dto`/`vo`、`sky-common` 的 `Result`/`PageResult`；请求进入前先经 `security` JWT 过滤器鉴权（推断）。

- **service**（`...\com\sky\service\`）
  - 职责：业务逻辑层——接口（`service/`）+ 实现（`service/impl/`）分离。承载核心业务规则（下单、支付、菜品/套餐管理、报表统计、工作台聚合），通过 `@Transactional`（由 `@EnableTransactionManagement` 支撑）管理事务边界。
  - 对外暴露：无 HTTP 入口，被 `controller`、`task` 调用。
  - 依赖谁：依赖 `mapper`；用 `sky-pojo` 的 `entity`/`dto`/`vo`、`sky-common` 的工具/异常/常量/`BaseContext`；推断可能调 `websocket/WebSocketServer` 推送来单提醒（S5 已核实）。

- **mapper**（`...\com\sky\mapper\`）
  - 职责：数据访问层（持久层）——MyBatis Mapper 接口，与 `resources/mapper/*.xml`（同名 11 个 XML）配合，对 MySQL 各表执行 CRUD。
  - 对外暴露：无 HTTP 入口，被 `service` 调用。
  - 依赖谁：向下依赖 **MySQL 数据库**（`mybatis.mapper-locations` 指向 `classpath:mapper/*.xml`、Druid 数据源，推断）；用 `sky-pojo` 的 `entity`；被 `aspect/AutoFillAspect` 经 `@AutoFill` 拦截自动填充公共字段（推断）。

- **config**（`...\com\sky\config\`）
  - 职责：配置装配层——`SecurityConfig`（过滤器链、密码编码器、鉴权规则）、`WebMvcConfiguration`（MVC 消息转换器/静态资源/Swagger）、`RedisConfiguration`（RedisTemplate/缓存）、`OssConfiguration`（阿里云 OSS 工具 Bean）、`WebSocketConfiguration`（WebSocket 端点导出器）。
  - 对外暴露：无 HTTP 入口，以 `@Configuration` Bean 装配全局基础设施能力。
  - 依赖谁：`SecurityConfig` 依赖 `security` 包（装配 `JwtAuthenticationFilter`、`UserDetailsServiceImpl`）；`OssConfiguration`/`RedisConfiguration` 依赖 `sky-common` 的 `properties` 与外部 **Redis**；`WebSocketConfiguration` 依赖 `websocket/WebSocketServer`（推断）。

- **security**（`...\com\sky\security\`）
  - 职责：认证授权层——Spring Security 定制组件。`JwtAuthenticationFilter` 解析请求头 JWT 放入 SecurityContext；`UserDetailsServiceImpl` 按用户名查库加载账号；`LoginUser` 为 `UserDetails` 实现。功能 0001「C 端认证改造」引入的统一 JWT 鉴权组件。
  - 对外暴露：无 HTTP 入口，作为过滤器/组件嵌入 Security 过滤器链，对所有请求前置生效。
  - 依赖谁：依赖 `mapper`（查 Employee/User 表加载账号）；依赖 `sky-common` 的 `JwtUtil`/`JwtProperties`/`JwtClaimsConstant`；用 `sky-pojo` 的 `Employee`/`User`（推断）。由 `config/SecurityConfig` 装配进过滤器链。

- **aspect**（`...\com\sky\aspect\`）
  - 职责：AOP 切面层——`AutoFillAspect` 拦截标注 `@AutoFill` 的 Mapper 方法，在 insert/update 前自动填充 `createTime`/`updateTime`/`createUser`/`updateUser` 等公共字段。
  - 对外暴露：无 HTTP 入口，以切面横切增强 `mapper` 层方法。
  - 依赖谁：依赖 `annotation`（`@AutoFill` 切点标记）；依赖 `sky-common` 的 `BaseContext`（当前登录用户 id）、`enumeration/OperationType`、`constant/AutoFillConstant`（推断）；横切目标为 `mapper` 包。

- **annotation**（`...\com\sky\annotation\`）
  - 职责：自定义注解定义——`@AutoFill` 标记「需自动填充公共字段」的 Mapper 方法，供 `AutoFillAspect` 识别切点。
  - 对外暴露：无 HTTP 入口，作为元数据被 AOP 切面消费。
  - 依赖谁：依赖 `sky-common` 的 `enumeration/OperationType`（标识 INSERT/UPDATE 操作类型，推断）。

- **handler**（`...\com\sky\handler\`）
  - 职责：全局异常处理层——`@RestControllerAdvice` 统一捕获 Controller/Service 抛出的异常（尤其 `sky-common` 自定义业务异常），转成规范化 `Result` 错误响应。
  - 对外暴露：无 HTTP 入口，以全局 advice 横切所有 Controller 异常出口。
  - 依赖谁：依赖 `sky-common` 的 `exception`（捕获 `BaseException` 及子类）与 `result/Result`（推断）。

- **task**（`...\com\sky\task\`）
  - 职责：定时任务层——`@EnableScheduling` 驱动的 `@Scheduled` 任务。`OrderTask` 处理超时未支付/派送中订单状态流转，`WebSocketTask` 维持 WebSocket 心跳，`MyTask` 示例任务。
  - 对外暴露：无 HTTP 入口，由调度器按 cron 周期触发。
  - 依赖谁：`OrderTask` 依赖 `mapper`/`service`；`WebSocketTask` 依赖 `websocket/WebSocketServer`；依赖 `sky-common`/`sky-pojo` 常量与实体（推断）。

- **websocket**（`...\com\sky\websocket\`）
  - 职责：WebSocket 推送层——`WebSocketServer`（`@ServerEndpoint`）维护与前端长连接会话，向管理端推送「来单提醒 / 客户催单」。
  - 对外暴露：WebSocket 端点（长连接，非普通 HTTP REST），由 `config/WebSocketConfiguration` 注册。
  - 依赖谁：不主动依赖其他内部业务包（叶子节点）；被 `service`（下单成功推送）、`task/WebSocketTask`（心跳）、`config/WebSocketConfiguration`（注册端点）调用。向外连接前端 WebSocket 客户端。

### 依赖矩阵

Part A — Maven 子模块：
| 模块 | 依赖的下游 | 被哪些上游依赖 |
|---|---|---|
| sky-server | sky-common, sky-pojo, MySQL, Redis, 阿里云 OSS, 微信支付, 前端 WebSocket 客户端 | （无，唯一可运行入口模块） |
| sky-common | （无内部模块，仅第三方库） | sky-server |
| sky-pojo | （无内部模块，仅第三方库） | sky-server |

Part B — sky-server 内部分层包：
| 包 | 依赖的下游 | 被哪些上游依赖 |
|---|---|---|
| controller | service, security(前置鉴权), sky-pojo(dto/vo), sky-common(Result) | （无，外部 HTTP 请求入口） |
| service | mapper, websocket(推断), sky-pojo(entity/dto/vo), sky-common(utils/异常/常量/context) | controller, task |
| mapper | MySQL, sky-pojo(entity) | service, security, task；被 aspect 横切增强 |
| config | security, websocket, sky-common(properties), Redis | （无，装配基础设施 Bean） |
| security | mapper, sky-common(JwtUtil/JwtProperties), sky-pojo(Employee/User) | config(装配), controller(前置生效) |
| aspect | annotation, mapper(横切目标), sky-common(BaseContext/OperationType/AutoFillConstant) | （无，AOP 自动织入） |
| annotation | sky-common(enumeration/OperationType) | aspect |
| handler | sky-common(exception/Result) | （无，全局 advice 横切 controller） |
| task | mapper, service, websocket, sky-common/sky-pojo | （无，由调度器触发） |
| websocket | 前端 WebSocket 客户端 | config(注册), service(推送), task(心跳) |

### 模块关系图（结构化边列表）
> 由 S3 ASCII 图重排；信息全留，去掉画给人眼的形状。格式 `节点 → 下游[职责]`。

- 外部请求（浏览器 / 管理端与 C 端前端 / 微信支付回调） → security:JwtAuthenticationFilter [进业务前解析 JWT、鉴权：`/admin/**`=ADMIN，`/user/**`=USER；由 config/SecurityConfig 装配进过滤器链]
- security:JwtAuthenticationFilter → controller(admin / user / notify) [唯一 HTTP 入口：参数校验、调 Service、封装 Result]
- controller → service(+impl) [核心业务逻辑，`@Transactional` 事务边界]
- controller → handler/GlobalExceptionHandler [`@RestControllerAdvice` 统一捕获异常 → Result 错误响应]
- service(+impl) → mapper [MyBatis 持久层，配合 resources/mapper/*.xml]
- service(+impl) → websocket/WebSocketServer → 前端 WebSocket 客户端 [来单提醒 / 催单实时推送]
- mapper → MySQL(员工/分类/菜品/套餐/订单/购物车/地址簿/用户等表)
- aspect/AutoFillAspect → mapper（横切增强）[借 @AutoFill(annotation) 自动填充公共字段]
- task(OrderTask / WebSocketTask / MyTask) → service / mapper [订单超时状态流转]；task → websocket/WebSocketServer [心跳]（由 @EnableScheduling 定时驱动）
- config(Security / WebMvc / Redis / Oss / WebSocket) → Redis [@EnableCaching 缓存后端]；config → 阿里云 OSS [图片上传，借 sky-common/AliOssUtil]
- 跨层基础模块（被各层普遍引用）：sky-common（Result/PageResult、JwtUtil/AliOssUtil/WeChatPayUtil、异常、常量、BaseContext、@ConfigurationProperties）；sky-pojo（entity 表映射 / dto 入参 / vo 出参）

---

## SECTION-4: 核心入口配置
> SOURCE: docs/Backend_scan/PROJECT_S4_ENTRYPOINT.md
> 默认激活 Profile：`dev`。配置文件：`sky-server/src/main/resources/application.yml`（骨架 + 占位符 + 少量直填）、`application-dev.yml`（为占位符提供实际值）；无 `bootstrap.yml`；`sky-common`/`sky-pojo` 无 `application.yml`。

### 配置组织模式（关键机制）
- **占位符填值（placeholder / indirection）为主 + 少量直填**。`application.yml` 里 datasource/redis/alioss/wechat 四大块写成 `${sky.xxx}` 占位符，实际值定义在 `application-dev.yml` 的 `sky.xxx` 节点下，是「骨架 + 填值」关系（**非**「默认值 + 覆盖」）。两份文件必须**同时存在**才能拼出完整配置——只有 `application.yml` 时 `${sky.datasource.host}` 等无法解析，启动失败。
- 直接写死在 `application.yml`（不走占位符）：`server.port`、`spring.profiles.active`、`spring.main.allow-circular-references`、`mybatis.*`、`logging.*`、`sky.jwt.*`、`sky.shop.address`、`sky.baidu.ak`。两份配置文件之间**不存在同名 key 相互覆盖**。

### 启动顺序
1. **MySQL 数据库（必需）**：核心数据存储（员工/用户/菜品/套餐/订单/购物车/地址簿等全部业务表）。连接信息由 `application-dev.yml` 的 `sky.datasource.*` 填入 Druid 占位符，地址 `jdbc:mysql://localhost:3306/sky_take_out`。所有持久层依赖它，MySQL 未就绪业务几乎完全不可用，必须最先拉起。
2. **Redis（可选依赖）**：缓存与临时状态，`@EnableCaching` 后端（`config/RedisConfiguration`）。连接信息由 `sky.redis.*` 填入（`localhost:6379`，`database: 10`，无密码）。Lettuce 客户端连接**懒建立**——Redis 没起 `sky-server` 也能启动成功，但运行时走 Redis 的功能（店铺营业状态 SET/GET、`@Cacheable` 缓存的分类/菜品）在**首次调用时**报错。
3. **应用本身 sky-server（可执行 jar）**：唯一可运行、对外提供 HTTP + WebSocket 服务的部署单元，启动类 `com.sky.SkyApplication`。启动时以 `com.sky` 为根扫描装配全部 Bean，并建连接池。依赖 MySQL（强）与 Redis（弱），排在基础设施之后，就绪后监听 `8080`。

> **第三方 SaaS（运行时可选外部依赖，无需你"启动"，只需凭证有效）：**
> - **阿里云 OSS**：图片/文件上传。凭证在 `sky.alioss.*`（endpoint `oss-cn-hangzhou.aliyuncs.com`、bucket `sky-take-out`、AK/SK 见索引表）。失效时管理端「通用上传」（`CommonController`）失败，其余不受影响。
> - **微信支付**：C 端下单支付 + 回调。凭证在 `sky.wechat.*`。当前 `privateKeyFilePath`、`weChatPayCertFilePath` 指向本机 `D:\...pem`，`notifyUrl` 是占位 URL——待改造微信遗留（功能 0002「支付 mock」）。凭证/证书缺失时真实支付链路不可用。
> - **百度地图**：`sky.baidu.ak: EFEEFFEFEFE`（占位假值，直填）。用于配送距离/地址解析校验；ak 无效时相关校验失败，核心下单流程通常仍可跑通。

### 关键配置项索引 — 一、公共骨架（`sky-server/src/main/resources/application.yml`）
| 配置项 | 值 | 作用说明 |
|---|---|---|
| `server.port` | `8080` | 对外 HTTP 监听端口 |
| `spring.profiles.active` | `dev` | 决定加载 `application-dev.yml`（当前唯一 profile） |
| `spring.main.allow-circular-references` | `true` | 允许 Bean 循环依赖（Spring Boot 2.6+ 默认禁止，这里放开） |
| `spring.datasource.druid.driver-class-name` | `${sky.datasource.driver-class-name}` → `com.mysql.cj.jdbc.Driver` | 数据库驱动类（连接池 Druid） |
| `spring.datasource.druid.url` | `jdbc:mysql://${sky.datasource.host}:${sky.datasource.port}/${sky.datasource.database}?...&useSSL=false&allowPublicKeyRetrieval=true` → `jdbc:mysql://localhost:3306/sky_take_out?...` | JDBC 连接串；含 `serverTimezone=Asia/Shanghai`、`useSSL=false`、`allowPublicKeyRetrieval=true` |
| `spring.datasource.druid.username` | `${sky.datasource.username}` → `root` | 数据库用户名 |
| `spring.datasource.druid.password` | `${sky.datasource.password}` → `123456` | 数据库密码 |
| `spring.redis.host` | `${sky.redis.host}` → `localhost` | Redis 主机 |
| `spring.redis.port` | `${sky.redis.port}` → `6379` | Redis 端口 |
| `spring.redis.password` | `${sky.redis.password}` → （空） | Redis 密码（dev 未设） |
| `spring.redis.database` | `${sky.redis.database}` → `10` | Redis 逻辑库编号（第 10 号库） |
| `mybatis.mapper-locations` | `classpath:mapper/*.xml` | MyBatis XML 映射文件位置（`resources/mapper/*.xml` 共 11 个） |
| `mybatis.type-aliases-package` | `com.sky.entity` | 实体类型别名包 |
| `mybatis.configuration.map-underscore-to-camel-case` | `true` | 下划线列名 ↔ 驼峰字段自动映射 |
| `logging.level.com.sky.mapper` | `debug` | Mapper 层日志（打印 SQL） |
| `logging.level.com.sky.service` | `info` | Service 层日志 |
| `logging.level.com.sky.controller` | `info` | Controller 层日志 |
| `sky.jwt.secret-key` | `sky-take-out-cend-auth-unified-secret-2026` | JWT 签名密钥（功能 0001 统一 JWT，直填非占位符） |
| `sky.jwt.ttl` | `7200000` | JWT 有效期，毫秒（7200000ms = 2 小时） |
| `sky.shop.address` | `湖北省武汉市洪山区徐东大街18号` | 店铺地址（配送距离计算，直填） |
| `sky.baidu.ak` | `EFEEFFEFEFE` | 百度地图凭证（占位假值，直填） |

### 关键配置项索引 — 二、dev 填值（`sky-server/src/main/resources/application-dev.yml`）
| 配置项 | 值 | 作用说明 |
|---|---|---|
| `sky.datasource.driver-class-name` | `com.mysql.cj.jdbc.Driver` | 填 Druid 驱动占位符 |
| `sky.datasource.host` | `localhost` | 填数据库主机占位符 |
| `sky.datasource.port` | `3306` | 填数据库端口占位符 |
| `sky.datasource.database` | `sky_take_out` | 填数据库名占位符 |
| `sky.datasource.username` | `root` | 填数据库用户名占位符 |
| `sky.datasource.password` | `123456` | 填数据库密码占位符 |
| `sky.redis.host` | `localhost` | 填 Redis 主机占位符 |
| `sky.redis.port` | `6379` | 填 Redis 端口占位符 |
| `sky.redis.password` | （空） | 填 Redis 密码占位符（无密码） |
| `sky.redis.database` | `10` | 填 Redis 逻辑库占位符 |
| `sky.alioss.endpoint` | `oss-cn-hangzhou.aliyuncs.com` | 阿里云 OSS 服务地域端点 |
| `sky.alioss.access-key-id` | `LTAI5tPeFLzsPPT8gG3LPW64` | 阿里云 OSS AccessKeyId（原样输出） |
| `sky.alioss.access-key-secret` | `U6k1brOZ8gaOIXv3nXbulGTUzy6Pd7` | 阿里云 OSS AccessKeySecret（原样输出） |
| `sky.alioss.bucket-name` | `sky-take-out` | 阿里云 OSS 存储桶名 |
| `sky.wechat.appid` | `wx9e8dde9d2df9df58` | 微信支付 小程序 appid |
| `sky.wechat.secret` | `7a354c0cab2186281c18839acf453e37` | 微信支付 小程序密钥 |
| `sky.wechat.mchid` | `1561414331` | 微信支付 商户号 |
| `sky.wechat.mchSerialNo` | `4B3B3DC35414AD50B1B755BAF8DE9CC7CF407606` | 微信支付 商户证书序列号 |
| `sky.wechat.privateKeyFilePath` | `D:\apiclient_key.pem` | 微信支付 商户私钥文件路径（本机绝对路径，遗留待改造） |
| `sky.wechat.apiV3Key` | `CZBK51236435wxpay435434323FFDuv3` | 微信支付 APIv3 密钥 |
| `sky.wechat.weChatPayCertFilePath` | `D:\wechatpay_166D96F876F45C7D07CE98952A96EC980368ACFC.pem` | 微信支付 平台证书文件路径（本机绝对路径，遗留待改造） |
| `sky.wechat.notifyUrl` | `https://www.weixin.qq.com/wxpay/pay.php` | 微信支付 支付结果回调 URL（占位假值） |
| `sky.wechat.refundNotifyUrl` | `https://www.weixin.qq.com/wxpay/pay.php` | 微信支付 退款结果回调 URL（占位假值） |

> `application-dev.yml` **没有** `sky.jwt`、`sky.shop`、`sky.baidu` 节点——这三块直接写死在 `application.yml`。

### 对外入口
- 端口：`8080`；监听地址：默认 `0.0.0.0`（未配 `server.address`）；路径前缀：**无**（未配 `server.servlet.context-path`）。
- 完整访问地址示例：`http://localhost:8080/admin/employee/login`、`http://localhost:8080/user/user/login`。
- Gateway：**无**（单体应用，无网关模块）。
- 非 REST 入口：
  - **WebSocket 端点**：`websocket/WebSocketServer`（`@ServerEndpoint`，由 `config/WebSocketConfiguration` 注册 `ServerEndpointExporter`）。协议 `ws://`，路径 `ws://localhost:8080/ws/{sid}`（S4 原为推断，S5 实读确认）。
  - **第三方异步回调**：`controller/notify/PayNotifyController`——微信支付结果回调入口，由微信服务器**主动 POST**（对应 `sky.wechat.notifyUrl`），非前端调用。路径推断 `/notify/paySuccess`（推断）。
  - **消息队列监听器**：**无**（未引入 RabbitMQ/Kafka）。
  - **定时任务**（`@Scheduled`，`task` 包）：`OrderTask`（订单超时未支付/派送中状态流转）、`WebSocketTask`（WebSocket 心跳）、`MyTask`（示例）。由调度器按 cron 触发，非外部流量。

### 单环境运行摘要（仅 dev，无 prod/test）
| 配置维度 | 值（dev，唯一环境） |
|---|---|
| 激活 Profile | `dev` |
| HTTP 端口 | `8080` |
| 监听地址 / 路径前缀 | `0.0.0.0`（默认） / 无前缀 |
| 数据库 | Druid → `jdbc:mysql://localhost:3306/sky_take_out`（root / 123456，`useSSL=false`） |
| Redis | `localhost:6379`，database `10`，无密码 |
| SQL 日志 | `com.sky.mapper = debug`（打印 SQL），service / controller = info |
| ORM 行为 | 驼峰映射开启（`map-underscore-to-camel-case: true`） |
| 循环依赖 | 允许（`allow-circular-references: true`） |
| JWT | secret `sky-take-out-cend-auth-unified-secret-2026`，ttl 2 小时 |
| 阿里云 OSS | `oss-cn-hangzhou.aliyuncs.com` / bucket `sky-take-out` |
| 微信支付 | 证书指向本机 `D:\*.pem`，notifyUrl 为占位 URL（遗留，待功能 0002 mock 化） |

### API 路径概览
> context-path 为空，URL 前缀即 Controller 的 `@RequestMapping`。以下基于 S3 Controller 清单 + 命名惯例**推断**，精确路径待读源码确认。无 Gateway，全部标「（推断）」。

管理端（`controller/admin`，鉴权推断 ROLE ADMIN，`/admin/**`）：
| URL 前缀（推断） | Controller | 推断功能 |
|---|---|---|
| `/admin/employee` | admin/EmployeeController | 员工登录/增删改查/启停/改密 |
| `/admin/category` | admin/CategoryController | 分类（菜品/套餐分类）管理 |
| `/admin/dish` | admin/DishController | 菜品管理（含口味） |
| `/admin/setmeal` | admin/SetmealController | 套餐管理 |
| `/admin/order` | admin/OrderController | 订单管理（接单/拒单/派送/完成/查询） |
| `/admin/report` | admin/ReportController | 营业数据报表统计 |
| `/admin/shop` | admin/ShopController | 店铺营业状态设置/查询（走 Redis） |
| `/admin/workspace` | admin/WorkSpaceController | 工作台数据聚合 |
| `/admin/common` | admin/CommonController | 通用接口（文件上传到 OSS） |

C 端顾客（`controller/user`，鉴权推断 ROLE USER，`/user/**`）：
| URL 前缀（推断） | Controller | 推断功能 |
|---|---|---|
| `/user/user` | user/UserController | C 端登录/注册（功能 0001 本地账密 + JWT） |
| `/user/category` | user/CategoryController | 顾客侧分类浏览 |
| `/user/dish` | user/DishController | 顾客侧菜品浏览 |
| `/user/setmeal` | user/SetmealController | 顾客侧套餐浏览 |
| `/user/shoppingCart` | user/ShoppingCartController | 购物车增删改查 |
| `/user/addressBook` | user/AddressBookController | 地址簿管理 |
| `/user/order` | user/OrderController | 下单/支付/历史订单/催单 |
| `/user/shop` | user/ShopController | 顾客侧查询店铺营业状态 |

回调端（`controller/notify`，无鉴权，外部服务器 POST）：
| URL 前缀（推断） | Controller | 推断功能 |
|---|---|---|
| `/notify`（如 `/notify/paySuccess`，推断） | notify/PayNotifyController | 微信支付结果异步回调（微信服务器主动 POST） |

### 数据库 Schema 索引
> 项目**未发现独立 `sql/` 文件夹**。全仓库仅 2 个 `.sql`，均在 CODE_ROOT (`sky-take-out/`) 之外。

| 文件（完整路径） | 用途推断（据文件头注释） |
|---|---|
| `D:\CQWM2\sky.sql` | 全库建表脚本 / schema 源头。以 `CREATE DATABASE IF NOT EXISTS sky_take_out` + 一系列 `DROP TABLE / CREATE TABLE` 开头（address_book、category、dish、setmeal、orders、user、employee 等全部业务表）。字段含中文 COMMENT，引擎 InnoDB。 |
| `D:\CQWM2\docs\features\0001-cend-auth-jwt\0001-migration.sql` | 功能 0001「C 端认证改造」增量迁移脚本。对【正在运行的库】原地升级：① `user` 表新增 `username`(唯一索引)+`password`；② `employee` 表 admin 密码迁移为 BCrypt 哈希。用 information_schema 存在性守卫 + PREPARE/EXECUTE 动态 SQL 幂等可重跑（MySQL 5.7，库名以 `DATABASE()` 为准）。与 `sky.sql` 内容对齐。 |

> `sky-server/src/main/resources/mapper/*.xml`（11 个，与 Mapper 接口同名）是运行时查询 SQL（MyBatis 映射），非建表 schema。表结构 DDL 字段级精读见 SECTION-6。

---

## SECTION-5: 核心业务调用链
> SOURCE: docs/Backend_scan/PROJECT_S5_FLOW.md
> ⚠️ 代码片段是下游 codebase-annotate 的核心锚点，逐字锁死，严禁删改。

### 调用链清单
**主链（深追）**：C 端「用户下单」`submitOrder` —— 外卖系统的价值产出点（顾客把购物车变成正式订单）。业务语义最重的写操作：一次请求内串联「地址校验 → 配送范围校验（外部地图 API）→ 读购物车 → 写订单主表 → 批量写订单明细 → 清空购物车」，最能体现 Controller→Service→Mapper→MySQL 完整数据流。

**浅链（各点一个主链覆盖不到的独立机制）**：
- **浅链 1 · 鉴权**：Spring Security 无状态 JWT 认证过滤器（`JwtAuthenticationFilter`）——请求进业务前的统一身份识别，功能 0001 引入，主链默认在过滤器之后执行。
- **浅链 2 · 推送**：下单支付成功「来单提醒」/ 用户「催单」经 WebSocket 主动推送商家端（`WebSocketServer#sendToAllClient`）；入口在 `payment`/`reminder` 而非 `submit`，不与主链重复。
- **浅链 3 · 缓存**：C 端套餐浏览用 `@Cacheable` 缓存进 Redis（`user/SetmealController#list`）；主链是写路径，覆盖不到读缓存。

**未展开（divedeep 深读候选）**：
- 手动 Redis 缓存：`user/DishController#list` 用 `RedisTemplate.opsForValue()` 手写「查缓存→穿透查库→回填」，与浅链 3 声明式 `@Cacheable` 形成对照。
- 支付回调：`controller/notify/PayNotifyController`（微信支付服务器主动 POST 的异步回调入口）。
- 报表聚合：`ReportServiceImpl` 营业额 / 订单 / 销量 Top10 按日聚合统计。
- 定时任务：`task/OrderTask`（`@Scheduled` 扫描超时未支付 / 派送中订单做状态流转）。
- 缓存失效：`admin/SetmealController` 的 `@CacheEvict(cacheNames="setmealCache")`（管理端增删改套餐时清缓存，写侧配套）。

### 主链完整调用链（结构化编号列表）
> 完整 URL 拼接来源：`context-path`（空，无前缀）+ 类级 `@RequestMapping("/user/order")` + 方法级 `@PostMapping("/submit")` = **POST /user/order/submit**。
> 同步性：**全链路同步**，无 `@Async` / `CompletableFuture` / 线程池 / 消息队列，单线程一路走到底再原路返回，无异步分支。

1. **POST /user/order/submit** — C 端顾客发起「用户下单」，请求体 `OrdersSubmitDTO`（字段详见 SECTION-6）。前置：请求已先过浅链 1 的 `JwtAuthenticationFilter`，把 userId 填进 `BaseContext`。
2. **user/OrderController#submit** [`D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\controller\user\OrderController.java`] — 接收 `OrdersSubmitDTO`，调 Service，用 `Result.success` 包成统一响应。不含业务逻辑。
3. **OrderServiceImpl#submitOrder** [`D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\service\impl\OrderServiceImpl.java`] — 下单核心业务编排（`@Service`）。⚠ **本方法无 `@Transactional`**——3 次写库（insert orders / insertBatch order_detail / delete shopping_cart）不在同一事务内，中途失败可能「有订单无明细 / 购物车已清但订单回滚」。
   - 3.1 (同步①) **AddressBookMapper#getById** [`...\com\sky\mapper\AddressBookMapper.java`] → MySQL:address_book SELECT 地址（为空 → 抛 `AddressBookBusinessException`）
   - 3.2 (同步②) **外部依赖:百度地图 Web API** — 私有方法 `checkOutOfRange()` 用 `HttpClientUtil` 同步 GET 地理编码 + 路线规划（HTTP 阻塞，落在 `OrderServiceImpl` 内部），距离 >5000 米 → 抛 `OrderBusinessException("超出配送范围")`
   - 3.3 (同步③) **ShoppingCartMapper#list** [`...\com\sky\mapper\ShoppingCartMapper.java`] → MySQL:shopping_cart SELECT 购物车行（userId 取自 `BaseContext`；为空 → 抛 `ShoppingCartBusinessException`）
   - 3.4 (同步④) **OrderMapper#insert** [`...\com\sky\mapper\OrderMapper.java`] → MySQL:orders INSERT 1 行订单（status=PENDING_PAYMENT 待付款, payStatus=UN_PAID, number=时间戳），回填自增 id ★代表性 Mapper（详解见下）
   - 3.5 (同步⑤) **OrderDetailMapper#insertBatch** [`...\com\sky\mapper\OrderDetailMapper.java`] → MySQL:order_detail INSERT N 行明细（购物车每条转 OrderDetail，快照 name/image/amount）
   - 3.6 (同步⑥) **ShoppingCartMapper#deleteByUserId** → MySQL:shopping_cart DELETE 该用户所有购物车行
4. **OrderSubmitVO** — builder 组装 `{id, orderNumber, orderAmount, orderTime}`（字段详见 SECTION-6），主线程同步返回。
5. **HTTP 200 Result{code:1, data: OrderSubmitVO, msg:null}** — 本项目 Result 成功码为 1（见 `sky-common/result/Result`）；此处状态「待付款」，真正扣款在后续 `PUT /user/order/payment`。

### 节点详解

**节点 1：user/OrderController（C 端订单接口）**
- 文件路径：`D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\controller\user\OrderController.java`
- 类级注解：`@RestController("userOrderController")`（显式指定 Bean 名，因 admin 端另有同名 `OrderController`，避免 Bean 名冲突）、`@RequestMapping("/user/order")`、`@Slf4j`、`@Api(tags = "C端-订单接口")`（Swagger 分组）
- 做了什么：表现层入口，接收 `OrdersSubmitDTO`，转调 `orderService.submitOrder(...)`，把 `OrderSubmitVO` 用 `Result.success(...)` 包装。不含业务逻辑。
- 关键代码片段（LOCK）：
```java
@PostMapping("/submit")
@ApiOperation("用户下单")
public Result<OrderSubmitVO> submit(@RequestBody OrdersSubmitDTO ordersSubmitDTO) {
    log.info("用户下单：{}", ordersSubmitDTO);
    OrderSubmitVO orderSubmitVO = orderService.submitOrder(ordersSubmitDTO);
    return Result.success(orderSubmitVO);
}
```

**节点 2：OrderServiceImpl（下单核心业务实现）**
- 文件路径：`D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\service\impl\OrderServiceImpl.java`
- 类级注解：`@Service`、`@Slf4j`（注入 5 个 Mapper + `WeChatPayUtil` + `WebSocketServer`）
- 做了什么：下单业务编排中心。① `addressBookMapper.getById` 校验收货地址；② 私有方法 `checkOutOfRange(...)` 同步调百度地图 Web API（`HttpClientUtil.doGet`）配送范围校验，超 5000 米抛 `OrderBusinessException("超出配送范围")`；③ 从 `BaseContext.getCurrentId()` 取当前用户 id（由浅链 1 的 JWT 过滤器写入），`shoppingCartMapper.list` 查购物车，空则抛 `ShoppingCartBusinessException`；④ `BeanUtils.copyProperties` 组装 `Orders`（状态「待付款」`PENDING_PAYMENT`、支付状态「未支付」`UN_PAID`、订单号取 `System.currentTimeMillis()`），`orderMapper.insert` 落库；⑤ 遍历购物车转 `OrderDetail` 后 `orderDetailMapper.insertBatch` 批量落明细；⑥ `shoppingCartMapper.deleteByUserId` 清空购物车；最后 builder 出 `OrderSubmitVO`。**本方法无 `@Transactional`——多步写库不是原子操作，是可写进 ADR / divedeep 的真实观察点。**
- 关键代码片段（LOCK）：
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

**节点 3：OrderMapper（数据访问层，主链代表性 Mapper）**
- 文件路径：`D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\mapper\OrderMapper.java`
- 做了什么：**原生 MyBatis Mapper 接口**（类级 `@Mapper` 被扫描，**非 MyBatis-Plus**，不继承 `BaseMapper`）。接口只声明方法签名，真实 SQL 在同名 `sky-server/src/main/resources/mapper/OrderMapper.xml`（本步不读 XML）。主链用 `void insert(Orders order)`——插入订单主表并（由 XML 的 `useGeneratedKeys`/`keyProperty`）回填自增主键 id 供明细外键使用。链路另外 3 个 Mapper（`AddressBookMapper`/`ShoppingCartMapper`/`OrderDetailMapper`）职责同构，按「代表性 Mapper 取 1 个」规则不单独建卡。
- 关键代码片段（LOCK，接口签名，SQL 在 XML 中）：
```java
@Mapper
public interface OrderMapper {
    /** 插入订单数据 */
    void insert(Orders order);
    // 其余 getByNumberAndUserId / update / pageQuery / getById / countStatus 等略
}
```

**节点 4：MySQL（持久化终点）**
- 文件路径：外部数据库（`jdbc:mysql://localhost:3306/sky_take_out`，S4 确认）
- 做了什么：主链在此落三次写——`orders`（INSERT 1 行订单主表）、`order_detail`（INSERT N 行明细）、`shopping_cart`（DELETE 该用户购物车）。表结构与字段合法值（如 `orders.status`=1 待付款）详见 SECTION-6。

**节点 5：外部依赖·百度地图 Web API（配送范围校验，非本项目类）**
- 文件路径：无（HTTP 外部服务，调用代码在 `OrderServiceImpl#checkOutOfRange` 私有方法内，经 `sky-common` 的 `HttpClientUtil.doGet`）
- 做了什么：下单前**同步阻塞**调用百度地图「地理编码 v3 + 驾车路线规划 directionlite v1」，算店铺到收货地址的距离，>5000 米抛「超出配送范围」。ak 为占位假值时该校验会失败（S4 已登记）。
- 关键代码片段（LOCK）：
```java
String json = HttpClientUtil.doGet("https://api.map.baidu.com/directionlite/v1/driving", map);
jsonObject = JSON.parseObject(json);
Integer distance = (Integer)((JSONObject) jsonArray.get(0)).get("distance");
if (distance > 5000) {
    throw new OrderBusinessException("超出配送范围");
}
```

### 浅链追踪（3 条）

**浅链 1：鉴权 —— 无状态 JWT 认证过滤器**
- 入口：所有请求进入 Spring Security 过滤器链时前置执行（对 `/admin/**`、`/user/**` 生效；授权规则在 `config/SecurityConfig`，本步不读配置类，引用 S3/S4：`/admin/**`=ROLE_ADMIN、`/user/**`=ROLE_USER，未带/带无效 token 走 401/403）。功能 0001 引入的统一 JWT 组件。
- 精简调用链（结构化）：
  1. HTTP 任意请求
  2. `JwtAuthenticationFilter#doFilterInternal` — 读 `Authorization: Bearer`，解析 JWT
  3. `JwtUtil.parseJWT`（sky-common 工具）→ 取 sub(userId)/role
  4. 写入 SecurityContext（权限 `ROLE_<role>`）+ BaseContext（当前用户 id）→ 放行 `filterChain.doFilter`
- 有意思的节点：`JwtAuthenticationFilter` — `D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\security\JwtAuthenticationFilter.java`
- 关键代码片段（LOCK）：
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
- 一句话点透：无状态（stateless）认证——服务端不存 session，身份全靠请求头自带的 JWT 自证；过滤器把 token 里的 userId 塞进 `ThreadLocal`（`BaseContext`），主链的 `submitOrder` 才能用 `BaseContext.getCurrentId()` 拿到「当前是谁在下单」，`finally` 里 `removeCurrentId()` 防线程复用串号。继承 `OncePerRequestFilter` 保证每请求只过一次。

**浅链 2：推送 —— WebSocket 向商家端主动推「来单提醒 / 催单」**
- 入口：① 支付成功回调链 `OrderServiceImpl#paySuccess`（type=1 来单提醒）；② C 端 `GET /user/order/reminder/{id}` → `OrderServiceImpl#reminder`（type=2 催单）。二者都不在主链 `submit` 上（下单时只到「待付款」，尚未推送）。WebSocket 端点由 `config/WebSocketConfiguration` 注册。
- 精简调用链（结构化）：
  1. `GET /user/order/reminder/{id}`（或 `paySuccess` 回调）
  2. `OrderServiceImpl#reminder` — 查订单存在性 + 组装 `{type,orderId,content}` map
  3. `WebSocketServer#sendToAllClient` — 遍历 sessionMap 群发 JSON 文本
  4. 商家端浏览器 WebSocket 客户端 — 收到即弹「来单/催单」提醒
- 有意思的节点：`WebSocketServer` — `D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\websocket\WebSocketServer.java`
- 关键代码片段（LOCK）：
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
- 一句话点透：突破 HTTP「客户端问、服务端才答」的被动模型——用 `@ServerEndpoint` 建长连接、把所有会话存进静态 `sessionMap`，商家端不用轮询，服务端一有新单/催单就主动 `sendText` 群发。「服务器 → 客户端」主动推送的典型套路。

**浅链 3：缓存 —— C 端套餐浏览 Spring Cache（`@Cacheable` 读 Redis）**
- 入口：`GET /user/setmeal/list?categoryId=xxx`（`user/SetmealController#list`）
- 精简调用链（结构化）：
  1. `GET /user/setmeal/list`
  2. `user/SetmealController#list` `@Cacheable(cacheNames="setmealCache", key="#categoryId")`
     - 命中：Spring Cache 直接从 Redis 取 → 不进方法体、不查库
     - 未命中：执行方法体 `setmealService.list(...)` → 查库 → 返回值自动写回 Redis
- 有意思的节点：`user/SetmealController` — `D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\controller\user\SetmealController.java`
- 关键代码片段（LOCK）：
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
- 一句话点透：声明式缓存（Declarative Caching）——靠启动类 `@EnableCaching` + Redis 后端（`RedisConfiguration`），一个 `@Cacheable` 注解就把「查缓存→未命中查库→回填」的样板逻辑交给框架，key 用 SpEL `#categoryId` 按分类分桶。写侧配套是 `admin/SetmealController` 的 `@CacheEvict(cacheNames="setmealCache")`。

---

## SECTION-6: 核心数据模型快照
> 派生章节。SOURCE: PROJECT_S4B_DATAMODEL.md（主源）+ SECTION-3~5（回退）
> ORM：**MyBatis**（非 MyBatis-Plus——entity 上无 `@TableName`/`@TableId`/`@TableField`/`@TableLogic`，映射靠 mapper XML + 驼峰开关 `map-underscore-to-camel-case: true`）。schema 真相源：`D:\CQWM2\sky.sql` 的 `CREATE TABLE`；功能 0001 增量迁移 `0001-migration.sql`。
> 逻辑删除：**未发现**（全 11 表无 `is_deleted`/`deleted` 软删列，全 entity 无 `@TableLogic`）→ 推断物理删除。
> 公共字段：`create_time`/`update_time`/`create_user`/`update_user` 四件套仅 `category`/`dish`/`setmeal`/`employee` 四张管理端维护表；由 `aspect/AutoFillAspect` 拦截 `@AutoFill` Mapper 方法自动填充（`create_user`/`update_user` 取自 `BaseContext`）。`user`/`shopping_cart` 只有 `create_time`；`orders` 用业务语义时间字段；`address_book`/`dish_flavor`/`order_detail`/`setmeal_dish` 无公共时间字段。
> 初始化数据：无独立 `data.sql`；`sky.sql` 内联少量 INSERT（category 10 行、dish 24 行、dish_flavor 24 行、employee 1 行 admin）。`sky.sql` 已是功能 0001 改造后最终形态，与 `0001-migration.sql` 对齐无冲突。

### 6.1 实体清单（实体↔表映射）
> 全 11 实体，与 11 张表一一对应；无 MyBatis-Plus/JPA 映射注解，列名↔属性名靠驼峰开关自动转换。

| 实体类 | 对应表 | 文件路径 | 映射说明 |
|---|---|---|---|
| AddressBook | address_book | `sky-pojo\...\entity\AddressBook.java` | 表 14 列 = 实体 14 字段，完全对齐；`isDefault`↔`is_default`、`provinceCode`↔`province_code` |
| Category | category | `sky-pojo\...\entity\Category.java` | 一一对应；含公共四件套 |
| Dish | dish | `sky-pojo\...\entity\Dish.java` | 一一对应；含公共四件套。实体**无** `flavors` 字段（口味在 DishDTO/DishVO 组合） |
| DishFlavor | dish_flavor | `sky-pojo\...\entity\DishFlavor.java` | 一一对应（id/dishId/name/value 4 字段） |
| Employee | employee | `sky-pojo\...\entity\Employee.java` | 一一对应；含公共四件套 + 认证字段 username/password |
| OrderDetail | order_detail | `sky-pojo\...\entity\OrderDetail.java` | 一一对应（实体 image 在末尾，DDL image 在前，顺序差异不影响按列名映射） |
| Orders | orders | `sky-pojo\...\entity\Orders.java` | 一一对应（24 列↔24 字段）。定义 `status`/`payStatus` 静态常量（见 6.2 字段合法值）。⚠ `packAmount`/`tablewareNumber` 实体声明为原始类型 `int`，DDL 列 `pack_amount`/`tableware_number` 允许 NULL——查出 NULL 时 MyBatis 拆箱可能 NPE |
| Setmeal | setmeal | `sky-pojo\...\entity\Setmeal.java` | 一一对应；含公共四件套 |
| SetmealDish | setmeal_dish | `sky-pojo\...\entity\SetmealDish.java` | 一一对应（id/setmealId/dishId/name/price/copies 6 字段） |
| ShoppingCart | shopping_cart | `sky-pojo\...\entity\ShoppingCart.java` | 一一对应（实体 image 在末尾，DDL image 在前，顺序差异不影响） |
| User | user | `sky-pojo\...\entity\User.java` | 一一对应（10 列↔10 字段）；`idNumber`↔`id_number`。含功能 0001 的 username/password |

### 6.2 字段详情（逐表）
> 🔐 = 敏感字段。来源均为 `D:\CQWM2\sky.sql`。

**address_book —— 地址簿（用户收货地址）**
| 字段 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| id | bigint | 否 | AUTO_INCREMENT | 主键 |
| user_id | bigint | 否 | | 用户 id（逻辑关联 user.id） |
| consignee | varchar(50) | 是 | NULL | 收货人 |
| sex | varchar(2) | 是 | NULL | 性别 |
| 🔐 phone | varchar(11) | 否 | | 手机号 |
| province_code | varchar(12) | 是 | NULL | 省级区划编号 |
| province_name | varchar(32) | 是 | NULL | 省级名称 |
| city_code | varchar(12) | 是 | NULL | 市级区划编号 |
| city_name | varchar(32) | 是 | NULL | 市级名称 |
| district_code | varchar(12) | 是 | NULL | 区级区划编号 |
| district_name | varchar(32) | 是 | NULL | 区级名称 |
| 🔐 detail | varchar(200) | 是 | NULL | 详细地址 |
| label | varchar(100) | 是 | NULL | 标签（家/公司/学校等） |
| is_default | tinyint(1) | 否 | 0 | 是否默认地址 0 否 1 是 |

主键 `id`；无唯一键/索引（仅主键）；`user_id` → `user.id`（逻辑关联，无显式外键）。

**category —— 菜品及套餐分类**
| 字段 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| id | bigint | 否 | AUTO_INCREMENT | 主键 |
| type | int | 是 | NULL | 类型 1 菜品分类 2 套餐分类 |
| name | varchar(32) | 否 | | 分类名称 |
| sort | int | 否 | 0 | 顺序 |
| status | int | 是 | NULL | 分类状态 0 禁用 1 启用 |
| create_time | datetime | 是 | NULL | 创建时间（自动填充） |
| update_time | datetime | 是 | NULL | 更新时间（自动填充） |
| create_user | bigint | 是 | NULL | 创建人（→ employee.id，自动填充） |
| update_user | bigint | 是 | NULL | 修改人（→ employee.id，自动填充） |

主键 `id`；唯一键 `UNIQUE KEY idx_category_name (name)`；`create_user`/`update_user` → `employee.id`；被 `dish.category_id`、`setmeal.category_id` 逻辑引用；有内联 INSERT 10 行。

**dish —— 菜品**
| 字段 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| id | bigint | 否 | AUTO_INCREMENT | 主键 |
| name | varchar(32) | 否 | | 菜品名称 |
| category_id | bigint | 否 | | 菜品分类 id（→ category.id） |
| price | decimal(10,2) | 是 | NULL | 菜品价格 |
| image | varchar(255) | 是 | NULL | 图片 URL |
| description | varchar(255) | 是 | NULL | 描述信息 |
| status | int | 是 | 1 | 0 停售 1 起售 |
| create_time | datetime | 是 | NULL | 创建时间（自动填充） |
| update_time | datetime | 是 | NULL | 更新时间（自动填充） |
| create_user | bigint | 是 | NULL | 创建人（→ employee.id，自动填充） |
| update_user | bigint | 是 | NULL | 修改人（→ employee.id，自动填充） |

主键 `id`；唯一键 `UNIQUE KEY idx_dish_name (name)`；`category_id` → `category.id`；被 `dish_flavor.dish_id`、`setmeal_dish.dish_id`、`order_detail.dish_id`、`shopping_cart.dish_id` 逻辑引用；有内联 INSERT 24 行。

**dish_flavor —— 菜品口味关系表**
| 字段 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| id | bigint | 否 | AUTO_INCREMENT | 主键 |
| dish_id | bigint | 否 | | 菜品 id（→ dish.id） |
| name | varchar(32) | 是 | NULL | 口味名称（如「甜味」「辣度」） |
| value | varchar(255) | 是 | NULL | 口味数据 list（JSON 字符串，如 `["无糖","少糖"]`） |

主键 `id`；无唯一键/索引；`dish_id` → `dish.id`（一菜多口味）；有内联 INSERT 24 行。

**employee —— 员工信息（管理端账号）**
> admin 密码已是功能 0001 迁移后的 BCrypt 哈希。

| 字段 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| id | bigint | 否 | AUTO_INCREMENT | 主键 |
| name | varchar(32) | 否 | | 姓名 |
| username | varchar(32) | 否 | | 登录用户名 |
| 🔐 password | varchar(64) | 否 | | 登录密码（BCrypt 哈希，功能 0001 后） |
| 🔐 phone | varchar(11) | 否 | | 手机号 |
| sex | varchar(2) | 否 | | 性别 |
| 🔐 id_number | varchar(18) | 否 | | 身份证号 |
| status | int | 否 | 1 | 状态 0 禁用 1 启用 |
| create_time | datetime | 是 | NULL | 创建时间（自动填充） |
| update_time | datetime | 是 | NULL | 更新时间（自动填充） |
| create_user | bigint | 是 | NULL | 创建人（→ employee.id，自动填充） |
| update_user | bigint | 是 | NULL | 修改人（→ employee.id，自动填充） |

主键 `id`；唯一键 `UNIQUE KEY idx_username (username)`；`create_user`/`update_user` → `employee.id`（自引用）；被 `category`/`dish`/`setmeal` 的 `create_user`/`update_user` 逻辑引用；有内联 INSERT 1 行（admin，密码 BCrypt 哈希）。

**order_detail —— 订单明细表**
| 字段 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| id | bigint | 否 | AUTO_INCREMENT | 主键 |
| name | varchar(32) | 是 | NULL | 商品名字（下单时快照） |
| image | varchar(255) | 是 | NULL | 图片（下单时快照） |
| order_id | bigint | 否 | | 订单 id（→ orders.id） |
| dish_id | bigint | 是 | NULL | 菜品 id（→ dish.id，与 setmeal_id 二选一） |
| setmeal_id | bigint | 是 | NULL | 套餐 id（→ setmeal.id，与 dish_id 二选一） |
| dish_flavor | varchar(50) | 是 | NULL | 口味（下单时快照） |
| number | int | 否 | 1 | 数量 |
| amount | decimal(10,2) | 否 | | 金额 |

主键 `id`；无唯一键/索引；`order_id` → `orders.id`（一订单多明细）；`dish_id` → `dish.id` / `setmeal_id` → `setmeal.id`（快照式）。

**orders —— 订单表**
| 字段 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| id | bigint | 否 | AUTO_INCREMENT | 主键 |
| number | varchar(50) | 是 | NULL | 订单号（业务流水号，非主键） |
| status | int | 否 | 1 | 订单状态 1 待付款 2 待接单 3 已接单 4 派送中 5 已完成 6 已取消 7 退款 |
| user_id | bigint | 否 | | 下单用户（→ user.id） |
| address_book_id | bigint | 否 | | 地址 id（→ address_book.id） |
| order_time | datetime | 否 | | 下单时间 |
| checkout_time | datetime | 是 | NULL | 结账（支付）时间 |
| pay_method | int | 否 | 1 | 支付方式 1 微信 2 支付宝 |
| pay_status | tinyint | 否 | 0 | 支付状态 0 未支付 1 已支付 2 退款 |
| amount | decimal(10,2) | 否 | | 实收金额 |
| remark | varchar(100) | 是 | NULL | 备注 |
| 🔐 phone | varchar(11) | 是 | NULL | 手机号（下单快照） |
| 🔐 address | varchar(255) | 是 | NULL | 地址（下单快照，详细地址） |
| user_name | varchar(32) | 是 | NULL | 用户名称（快照） |
| consignee | varchar(32) | 是 | NULL | 收货人（快照） |
| cancel_reason | varchar(255) | 是 | NULL | 订单取消原因 |
| rejection_reason | varchar(255) | 是 | NULL | 订单拒绝原因 |
| cancel_time | datetime | 是 | NULL | 订单取消时间 |
| estimated_delivery_time | datetime | 是 | NULL | 预计送达时间 |
| delivery_status | tinyint(1) | 否 | 1 | 配送状态 1 立即送出 0 选择具体时间 |
| delivery_time | datetime | 是 | NULL | 送达时间 |
| pack_amount | int | 是 | NULL | 打包费 |
| tableware_number | int | 是 | NULL | 餐具数量 |
| tableware_status | tinyint(1) | 否 | 1 | 餐具数量状态 1 按餐量提供 0 选择具体数量 |

主键 `id`；无唯一键/索引（`number` 订单号未建唯一索引）；`user_id` → `user.id`、`address_book_id` → `address_book.id`；被 `order_detail.order_id` 逻辑引用。大量字段为「下单瞬间快照」（phone/address/consignee/user_name），反规范化设计。

**setmeal —— 套餐**
| 字段 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| id | bigint | 否 | AUTO_INCREMENT | 主键 |
| category_id | bigint | 否 | | 分类 id（→ category.id） |
| name | varchar(32) | 否 | | 套餐名称 |
| price | decimal(10,2) | 否 | | 套餐价格 |
| status | int | 是 | 1 | 售卖状态 0 停售 1 起售 |
| description | varchar(255) | 是 | NULL | 描述信息 |
| image | varchar(255) | 是 | NULL | 图片 URL |
| create_time | datetime | 是 | NULL | 创建时间（自动填充） |
| update_time | datetime | 是 | NULL | 更新时间（自动填充） |
| create_user | bigint | 是 | NULL | 创建人（→ employee.id，自动填充） |
| update_user | bigint | 是 | NULL | 修改人（→ employee.id，自动填充） |

主键 `id`；唯一键 `UNIQUE KEY idx_setmeal_name (name)`；`category_id` → `category.id`；被 `setmeal_dish.setmeal_id`、`order_detail.setmeal_id`、`shopping_cart.setmeal_id` 逻辑引用。

**setmeal_dish —— 套餐菜品关系（多对多连接表）**
| 字段 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| id | bigint | 否 | AUTO_INCREMENT | 主键 |
| setmeal_id | bigint | 是 | NULL | 套餐 id（→ setmeal.id） |
| dish_id | bigint | 是 | NULL | 菜品 id（→ dish.id） |
| name | varchar(32) | 是 | NULL | 菜品名称（冗余字段） |
| price | decimal(10,2) | 是 | NULL | 菜品单价（冗余字段） |
| copies | int | 是 | NULL | 菜品份数 |

主键 `id`；无唯一键/索引；`setmeal_id` → `setmeal.id`、`dish_id` → `dish.id`；本表是 `setmeal` ∞─∞ `dish` 连接表。

**shopping_cart —— 购物车**
| 字段 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| id | bigint | 否 | AUTO_INCREMENT | 主键 |
| name | varchar(32) | 是 | NULL | 商品名称（快照） |
| image | varchar(255) | 是 | NULL | 图片（快照） |
| user_id | bigint | 否 | | 用户 id（→ user.id）（COMMENT 误写为「主键」） |
| dish_id | bigint | 是 | NULL | 菜品 id（→ dish.id，与 setmeal_id 二选一） |
| setmeal_id | bigint | 是 | NULL | 套餐 id（→ setmeal.id，与 dish_id 二选一） |
| dish_flavor | varchar(50) | 是 | NULL | 口味 |
| number | int | 否 | 1 | 数量 |
| amount | decimal(10,2) | 否 | | 金额 |
| create_time | datetime | 是 | NULL | 创建时间 |

主键 `id`；无唯一键/索引；`user_id` → `user.id`（一用户一车多条）；`dish_id`/`setmeal_id` → `dish.id`/`setmeal.id`。

**user —— 用户信息（C 端顾客账号）**
> 已含功能 0001 新增的 username/password/idx_username；增量来自 `0001-migration.sql`。

| 字段 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| id | bigint | 否 | AUTO_INCREMENT | 主键 |
| openid | varchar(45) | 是 | NULL | 微信用户唯一标识（微信遗留，允许空以兼容本地账号） |
| username | varchar(32) | 是 | NULL | 登录用户名（功能 0001 新增） |
| 🔐 password | varchar(64) | 是 | NULL | 密码 BCrypt（功能 0001 新增） |
| name | varchar(32) | 是 | NULL | 姓名 |
| 🔐 phone | varchar(11) | 是 | NULL | 手机号 |
| sex | varchar(2) | 是 | NULL | 性别 |
| 🔐 id_number | varchar(18) | 是 | NULL | 身份证号 |
| avatar | varchar(500) | 是 | NULL | 头像 URL |
| create_time | datetime | 是 | NULL | 注册时间 |

主键 `id`；唯一键 `UNIQUE KEY idx_username (username)`（功能 0001 新增；允许多个 NULL，给「仅 openid / 社交登录」用户留空间）；被 `address_book.user_id`、`orders.user_id`、`shopping_cart.user_id` 逻辑引用。功能 0001 增量（`0001-migration.sql`）：① ADD COLUMN username；② ADD COLUMN password；③ ADD UNIQUE KEY idx_username。均带 information_schema 存在性守卫，幂等可重跑。

**字段合法值（取自 DDL COMMENT 与实体常量）：**
- `orders.status`（Orders 实体静态常量）：1 `PENDING_PAYMENT` 待付款 / 2 `TO_BE_CONFIRMED` 待接单 / 3 `CONFIRMED` 已接单 / 4 `DELIVERY_IN_PROGRESS` 派送中 / 5 `COMPLETED` 已完成 / 6 `CANCELLED` 已取消（DDL COMMENT 另列 7 退款，实体未定义 7 的常量）
- `orders.pay_status`（Orders 实体静态常量）：0 `UN_PAID` 未支付 / 1 `PAID` 已支付 / 2 `REFUND` 退款
- `orders.pay_method`：1 微信 / 2 支付宝（DDL COMMENT）
- `category.type`：1 菜品分类 2 套餐分类；`dish.status`/`setmeal.status`/`category.status`：0 停售/禁用 1 起售/启用（各表 COMMENT）

### 6.3 请求/响应类清单（DTO / Request / VO）
> DTO 23 个、VO 17 个，均 `implements Serializable` + `@Data`（Lombok）。路径前缀 `sky-pojo\...\dto\` 与 `sky-pojo\...\vo\`。

DTO / Query（入参，23 个）：
| 类名 | 路径 | 用途 | 关键字段 |
|---|---|---|---|
| OrdersSubmitDTO | dto\OrdersSubmitDTO.java | C 端下单入参 | addressBookId, payMethod, remark, estimatedDeliveryTime, deliveryStatus, tablewareNumber, tablewareStatus, packAmount, amount |
| OrdersPaymentDTO | dto\OrdersPaymentDTO.java | 支付入参 | orderNumber, payMethod |
| OrdersDTO | dto\OrdersDTO.java | 订单通用传输（含明细列表） | id, number, status, userId, addressBookId, orderTime, checkoutTime, payMethod, amount, remark, userName, phone, address, consignee, orderDetails:List\<OrderDetail\> |
| OrdersPageQueryDTO | dto\OrdersPageQueryDTO.java | 订单分页查询 | page, pageSize, number, phone, status, beginTime, endTime, userId |
| OrdersCancelDTO | dto\OrdersCancelDTO.java | 管理端取消订单 | id, cancelReason |
| OrdersConfirmDTO | dto\OrdersConfirmDTO.java | 管理端接单 | id, status |
| OrdersRejectionDTO | dto\OrdersRejectionDTO.java | 管理端拒单 | id, rejectionReason |
| ShoppingCartDTO | dto\ShoppingCartDTO.java | 购物车增删入参 | dishId, setmealId, dishFlavor |
| DishDTO | dto\DishDTO.java | 菜品新增/修改（含口味） | id, name, categoryId, price, image, description, status, flavors:List\<DishFlavor\> |
| DishPageQueryDTO | dto\DishPageQueryDTO.java | 菜品分页查询 | page, pageSize, name, categoryId, status |
| SetmealDTO | dto\SetmealDTO.java | 套餐新增/修改（含菜品关系） | id, categoryId, name, price, status, description, image, setmealDishes:List\<SetmealDish\> |
| SetmealPageQueryDTO | dto\SetmealPageQueryDTO.java | 套餐分页查询 | page, pageSize, name, categoryId, status |
| CategoryDTO | dto\CategoryDTO.java | 分类新增/修改 | id, type, name, sort |
| CategoryPageQueryDTO | dto\CategoryPageQueryDTO.java | 分类分页查询 | page, pageSize, name, type |
| EmployeeDTO | dto\EmployeeDTO.java | 员工新增/修改 | id, username, name, phone, sex, idNumber |
| EmployeeLoginDTO | dto\EmployeeLoginDTO.java | 管理端登录入参 | username, password（🔐）；带 Swagger `@ApiModel`/`@ApiModelProperty` |
| EmployeePageQueryDTO | dto\EmployeePageQueryDTO.java | 员工分页查询 | name, page, pageSize |
| UserLoginDTO | dto\UserLoginDTO.java | C 端登录入参（功能 0001 本地账密） | username, password（🔐） |
| UserRegisterDTO | dto\UserRegisterDTO.java | C 端注册入参（功能 0001） | username, password（🔐） |
| UserChangePasswordDTO | dto\UserChangePasswordDTO.java | C 端改密（功能 0001） | oldPassword, newPassword（🔐） |
| PasswordEditDTO | dto\PasswordEditDTO.java | 管理端员工改密 | empId, oldPassword, newPassword（🔐） |
| DataOverViewQueryDTO | dto\DataOverViewQueryDTO.java | 报表时间区间查询 | begin, end（LocalDateTime）；`@Builder` |
| GoodsSalesDTO | dto\GoodsSalesDTO.java | 销量统计中间对象 | name, number；`@Builder` |

VO（出参，17 个）：
| 类名 | 路径 | 用途 | 关键字段 |
|---|---|---|---|
| OrderSubmitVO | vo\OrderSubmitVO.java | 下单成功返回 | id, orderNumber, orderAmount, orderTime |
| OrderPaymentVO | vo\OrderPaymentVO.java | 微信支付预下单返回（遗留） | nonceStr, paySign, timeStamp, signType, packageStr |
| OrderVO | vo\OrderVO.java | 订单详情返回（**extends Orders**） | 继承 Orders 全部字段 + orderDishes, orderDetailList:List\<OrderDetail\> |
| OrderStatisticsVO | vo\OrderStatisticsVO.java | 管理端订单各状态计数 | toBeConfirmed, confirmed, deliveryInProgress |
| DishVO | vo\DishVO.java | 菜品详情返回 | id, name, categoryId, price, image, description, status, updateTime, categoryName, flavors:List\<DishFlavor\> |
| DishItemVO | vo\DishItemVO.java | 套餐内菜品项展示 | name, copies, image, description |
| SetmealVO | vo\SetmealVO.java | 套餐详情返回 | id, categoryId, name, price, status, description, image, updateTime, categoryName, setmealDishes:List\<SetmealDish\> |
| EmployeeLoginVO | vo\EmployeeLoginVO.java | 管理端登录返回 | id, userName, name, token；带 Swagger 注解 |
| UserLoginVO | vo\UserLoginVO.java | C 端登录返回（功能 0001） | id, username, token |
| BusinessDataVO | vo\BusinessDataVO.java | 工作台数据概览 | turnover, validOrderCount, orderCompletionRate, unitPrice, newUsers |
| DishOverViewVO | vo\DishOverViewVO.java | 工作台菜品总览 | sold, discontinued |
| SetmealOverViewVO | vo\SetmealOverViewVO.java | 工作台套餐总览 | sold, discontinued |
| OrderOverViewVO | vo\OrderOverViewVO.java | 工作台订单总览 | waitingOrders, deliveredOrders, completedOrders, cancelledOrders, allOrders |
| OrderReportVO | vo\OrderReportVO.java | 订单统计报表 | dateList, orderCountList, validOrderCountList, totalOrderCount, validOrderCount, orderCompletionRate |
| TurnoverReportVO | vo\TurnoverReportVO.java | 营业额报表 | dateList, turnoverList |
| UserReportVO | vo\UserReportVO.java | 用户统计报表 | dateList, totalUserList, newUserList |
| SalesTop10ReportVO | vo\SalesTop10ReportVO.java | 销量 Top10 报表 | nameList, numberList |

### 6.4 表关系（结构化边列表）
> 全部为**逻辑关联**（DDL 无任何显式 FOREIGN KEY，靠共享 `xxx_id` 列命名 + 应用层维护一致性）。

- user 1─∞ address_book（user.id ← address_book.user_id）
- user 1─∞ orders（user.id ← orders.user_id）
- user 1─∞ shopping_cart（user.id ← shopping_cart.user_id）
- address_book 1─∞ orders（address_book.id ← orders.address_book_id）
- orders 1─∞ order_detail（orders.id ← order_detail.order_id）
- category 1─∞ dish（category.id ← dish.category_id）
- category 1─∞ setmeal（category.id ← setmeal.category_id）
- dish 1─∞ dish_flavor（dish.id ← dish_flavor.dish_id）
- setmeal ∞─∞ dish（经连接表 setmeal_dish：setmeal.id ← setmeal_dish.setmeal_id，dish.id ← setmeal_dish.dish_id）
- order_detail ∞─1 dish / setmeal（order_detail.dish_id → dish.id，order_detail.setmeal_id → setmeal.id，二选一，快照式）
- shopping_cart ∞─1 dish / setmeal（shopping_cart.dish_id → dish.id，shopping_cart.setmeal_id → setmeal.id，二选一）
- employee 1─∞ {category, dish, setmeal}（employee.id ← 各表 create_user/update_user，公共字段逻辑关联；employee 独立表，无入向业务外键）

---

## SECTION-7: 项目约定与关键决策
> 派生章节。SOURCE: SECTION-1~5 散落约定汇总。
> 安全风险标注：🔴 高 / 🟡 中 / 🟢 良好实践 / ⚪ 未知（S1~5 无据，待源码确认）。只列 S1~5 确有依据的项。

### 7.1 响应 / 异常约定
- 统一响应封装：`Result{code, data, msg}`，**成功码为 1**（`sky-common/result/Result`；见 S5 主链尾节点 `Result{code:1, ...}`）；分页用 `PageResult`（`sky-common/result/PageResult`）。
- 全局异常处理：`handler/GlobalExceptionHandler`（`@RestControllerAdvice`）统一捕获 Controller/Service 抛出的异常（尤其 `sky-common` 自定义业务异常），转成规范化 `Result` 错误响应（S3）。
- 业务异常体系：`sky-common/exception` 下 12 个自定义异常，均继承 `BaseException`（S3；S5 主链实际抛出 `AddressBookBusinessException`、`OrderBusinessException`、`ShoppingCartBusinessException` 三者）。

### 7.2 安全相关约定
- 🟢 密码存储：BCrypt 哈希（`employee.password`/`user.password`，功能 0001 引入；S2/S4B）。
- 🟢 认证机制：无状态 JWT + Spring Security，`/admin/**`=ROLE_ADMIN、`/user/**`=ROLE_USER，未登录 401 / 无权限 403（S2/S5）。JWT 过滤器继承 `OncePerRequestFilter`，`finally` 里 `removeCurrentId()` 防 ThreadLocal 线程复用串号（S5）。
- 🟡 凭证明文入库配置：`application.yml`/`application-dev.yml` 明文存 DB 密码（`123456`）、JWT secret（`sky-take-out-cend-auth-unified-secret-2026`，可预测字符串）、阿里云 AK/SK、微信商户密钥/APIv3 密钥——仓库内明文凭证（S4，个人学习用途原样保留）。
- 🟡 JDBC `useSSL=false`：数据库连接不加密（S4 连接串）。
- 🟡 Redis 无密码：`spring.redis.password` 为空（dev，localhost；S4）。
- ⚪ 支付回调鉴权/验签：`controller/notify/PayNotifyController` S4 标「无鉴权，外部服务器 POST」；回调是否做签名验证在 S1~5 未确认，待源码确认。

### 7.3 数据约定
- ORM：**MyBatis**（非 MyBatis-Plus），Mapper 接口用 `@Mapper` 被扫描（启动类无 `@MapperScan`）+ `resources/mapper/*.xml` 手写 SQL（S3/S4B）。
- 命名映射：`map-underscore-to-camel-case: true`，下划线列名 ↔ Java 驼峰属性自动转换，无字段级映射注解（S4/S4B）。
- 主键：全 11 表 `id bigint AUTO_INCREMENT`（S4B）。
- 公共字段自动填充：`create_time`/`update_time`/`create_user`/`update_user` 四件套仅 `category`/`dish`/`setmeal`/`employee`；由 `aspect/AutoFillAspect` + `@AutoFill` + `BaseContext` 在 insert/update 前填充（S3/S4B）。
- 事务边界：`@EnableTransactionManagement` + `@Transactional`（S3）。🔴 **主链 `OrderServiceImpl#submitOrder` 无 `@Transactional`**——3 次写库（insert orders / insertBatch order_detail / delete shopping_cart）非原子，中途失败可能数据不一致（S5）。
- 🟡 逻辑删除：**无**（全表无软删列，全 entity 无 `@TableLogic`）→ 物理删除，删除不可恢复（S4B）。
- 外键约束：**无显式 FOREIGN KEY**，全部为 `xxx_id` 逻辑关联，靠应用层维护一致性（S4B）。
- 🟡 类型拆箱风险：`Orders.packAmount`/`tablewareNumber` 实体声明为原始 `int`，DDL 列 `pack_amount`/`tableware_number` 允许 NULL——查出 NULL 时 MyBatis 拆箱可能 NPE（S4B）。
- 反规范化快照：`orders` 与 `order_detail` 大量字段是下单瞬间快照（phone/address/consignee/name/image），与 user/address_book 当前值可能不同（S4B）。

### 7.4 URL 与接口约定
- context-path 为空，无前缀，Controller 的 `@RequestMapping` 即完整路径（S4）。
- 分端前缀：`/admin/**`（管理端）、`/user/**`（C 端）、`/notify`（支付回调）（S3/S4）。
- REST 方法语义：S5 实见 `@PostMapping`（下单 submit）、`@GetMapping`（套餐 list、催单 reminder）、后续支付为 `PUT /user/order/payment`（S5）。
- 完整 URL 拼接来源：context-path（空）+ 类级 `@RequestMapping` + 方法级映射（S5 主链示范：`/user/order` + `/submit` = `POST /user/order/submit`）。
- API 文档：Knife4j/Swagger 注解（`@Api`/`@ApiOperation`/`@ApiModel`；S2/S5）。
- Bean 名冲突处理：admin 与 user 两端同名 `OrderController`，C 端用 `@RestController("userOrderController")` 显式指定 Bean 名避免冲突（S5）。

### 7.5 构建 / 部署约定
- Maven 多模块聚合，父工程继承 `spring-boot-starter-parent` 2.7.3；无 Maven Wrapper（S1）。
- 🟢 无容器化（无 Dockerfile / docker-compose / .dockerignore）；推测 jar 部署，`sky-server` 打 fat jar 后 `java -jar`（S1）。
- 配置组织模式：**占位符填值**（`application.yml` 骨架 + `${sky.xxx}` 占位符，`application-dev.yml` 提供实际值）+ 少量直填；两份配置文件必须同时存在，否则占位符无法解析、启动失败（S4）。
- 单一 Profile：仅 `dev`，无 prod/test；无 `bootstrap.yml`（非 Spring Cloud）（S4）。
- 🟡 允许 Bean 循环依赖：`spring.main.allow-circular-references: true`（Spring Boot 2.6+ 默认禁止，此处放开——通常提示 Bean 依赖设计可优化；S4）。

### 7.6 启动能力清单（从 S3 启动类注解抄录）
已开启：
- `@SpringBootApplication` —— 自动配置 + 以 `com.sky` 为根扫描组件
- `@EnableTransactionManagement` —— `@Transactional` 声明式事务生效
- `@EnableCaching` —— Spring Cache 抽象（缓存后端 Redis）
- `@EnableScheduling` —— `@Scheduled` 定时任务生效（`task` 包）
- `@Slf4j` —— Lombok 生成 `log` 字段（非 Spring 能力）

未开启（排除项）：
- `@EnableDiscoveryClient` / `@EnableEurekaClient` / `@EnableNacosDiscovery` —— 不注册注册中心（单体）
- `@EnableFeignClients` —— 不做 Feign 远程 RPC（跨系统走普通 HTTP 客户端）
- `@MapperScan`（启动类上）—— Mapper 用 `@Mapper` 各自被扫描（推断）
- `@EnableAsync` —— 无 Spring 异步执行器（`@Async` 不生效）
- `@EnableCircuitBreaker` / `@EnableHystrix` —— 无熔断降级
- `@ServletComponentScan` —— WebSocket 端点由 `WebSocketConfiguration` 注册 `ServerEndpointExporter` 承载（推断）
