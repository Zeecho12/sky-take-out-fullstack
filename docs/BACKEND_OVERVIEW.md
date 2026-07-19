# sky-take-out（苍穹外卖）BACKEND_OVERVIEW
<!-- 本文件由 backend-scan-7-merge 自动生成,读者为下游 AI Skill -->

## META

| 字段 | 值 |
|---|---|
| project_name | sky-take-out（苍穹外卖） |
| project_type | 多模块单体应用（Multi-module Monolith），基于 Spring Boot 2.7.3 |
| project_purpose | 外卖 / 餐饮点餐管理系统的后端服务（商家管理端 admin + 用户 C 端 user） |
| base_package | src/main/java/com/sky/（三个 Maven 模块统一使用此包路径） |
| active_profile | dev（唯一 profile，无 prod/test） |
| module_count | 3（Maven 子模块）；另 sky-server 内部有 10 个分层业务包 |
| module_names | sky-common、sky-pojo、sky-server（sky-server 内部分层包：controller / service / mapper / interceptor / config / aspect / annotation / handler / task / websocket） |
| core_business | 用户下单（submitOrder，POST /user/order/submit） |
| port | 8080（dev 唯一环境；application.yml 与 dev 均为 8080） |
| context_path | (无前缀)（未配置 server.servlet.context-path，Controller 的 @RequestMapping 即完整路径） |
| base_url_example | http://localhost:8080/user/order/submit（已知，来自 SECTION-5 核心调用链）；管理端登录 http://localhost:8080/admin/employee/login（推断） |
| spring_boot_version | 2.7.3 |
| java_version | 未在 SECTION-1~5 中明确找到，建议下游 AI 读 pom.xml 的 `<java.version>` / `maven.compiler` 确认（SECTION-2 引入 jaxb-api，通常出现在 JDK 9+ 移除 JAXB 后的兼容补齐场景） |
| database_type | MySQL（SECTION-2 mysql-connector-java + SECTION-4 jdbc:mysql://） |
| default_db_url | jdbc:mysql://localhost:3306/sky_take_out?serverTimezone=Asia/Shanghai&useUnicode=true&characterEncoding=utf-8&zeroDateTimeBehavior=convertToNull&useSSL=false&allowPublicKeyRetrieval=true（用户名 root / 密码 123456，来自 application-dev.yml；仅 dev 一套，无 prod 覆盖） |
| tech_summary | Spring Boot 2.7.3 + Spring MVC + Spring WebSocket + Spring Data Redis + Spring Cache + MyBatis + Druid |
| has_gateway | 否（单体应用，无任何网关模块） |
| has_es | 否（无 Elasticsearch 依赖与配置） |
| has_mq | 否（无 RabbitMQ / Kafka / RocketMQ） |
| has_security_framework | 是（JWT / jjwt 0.9.1，自实现拦截器鉴权；**无** Spring Security / Shiro / Sa-Token 框架，登录态靠 JwtTokenAdminInterceptor / JwtTokenUserInterceptor 自行校验） |
| has_docker | 否（全项目无 Dockerfile / docker-compose，推测直接 jar 包部署） |
| merge_audit_status | PASS |
| generated_at | 2026-07-17（HH:MM 未知：本环境 Date.now() 不可用） |

---

## AI 导航

- **快速查询**：META（项目元信息）/ APPENDIX-A（按类型批量定位 .java 与配置）
- **核心信息**：SECTION-5（真实代码片段）/ SECTION-6（数据模型）/ SECTION-7（项目约定与陷阱）
- **完整保真**：SECTION-1~4（项目定性、技术栈、模块地图、入口配置，原样保留）
- **允许回源**：本文件未展开的细节（如所有 Controller 方法、所有实体字段类型），可读取 `backend_scan/PROJECT_SN_*.md` 或源码
- **质量审计**：MERGE-AUDIT（文档末尾，通常无需阅读）

---

## SECTION-1: 项目定性
> SOURCE: backend_scan/PROJECT_S1_PROFILE.md

### 项目基本信息
- 项目名称：**sky-take-out**（苍穹外卖）
  - 依据：根目录 `pom.xml` 第 12 行 `<artifactId>sky-take-out</artifactId>`，groupId 为 `com.sky`。
- 项目用途：一套**外卖 / 餐饮点餐管理系统**的后端服务（商家端 + 用户 C 端）。
  - 依据：groupId `com.sky`、artifactId `sky-take-out`（外卖）；`NOTE/` 目录下的源码笔记涉及"C 端菜品查询""员工分页查询""新增/编辑员工""启用禁用员工账户"等业务；`pom.xml` 引入了阿里云 OSS（图片上传，第 96-100 行）、微信支付（`wechatpay-apache-httpclient`，第 120-124 行）、POI（导出 Excel 报表，第 108-118 行）等典型外卖业务依赖。
- 项目类型：**多模块单体应用（Multi-module Monolith）** —— 基于 Spring Boot 2.7.3 的单体 Web 应用，按职责拆成多个 Maven 子模块，但最终只有一个可运行部署单元。
- 判断依据：
  1. 根 `pom.xml` 第 13 行 `<packaging>pom</packaging>`，且第 15-19 行声明了 3 个 `<module>`（`sky-common`、`sky-pojo`、`sky-server`）—— 这是**聚合工程（Aggregator Project）**的典型结构，而非单一模块。
  2. 每个子模块目录下都有自己的 `pom.xml`（`sky-common/pom.xml`、`sky-pojo/pom.xml`、`sky-server/pom.xml`）。
  3. 父工程继承 `spring-boot-starter-parent` 2.7.3（第 6-10 行），**没有引入任何 Spring Cloud 依赖**（无 Eureka/Nacos/Gateway/OpenFeign），因此**不是微服务（Microservices）**，而是单体。
  4. 从模块命名看，只有 `sky-server` 是可运行的服务模块，`sky-common`（公共工具）与 `sky-pojo`（数据模型）是被依赖的支撑库 —— 符合"多模块打包成一个进程运行"的单体特征。

### 构建与部署
- 构建工具：**Maven**（根目录及各子模块均为 `pom.xml`，无 `build.gradle`）。
  - POM 模型版本 `modelVersion` 4.0.0；未发现 Maven Wrapper（无 `mvnw` / `.mvn`）。
  - 依赖统一由父工程 `spring-boot-starter-parent` **2.7.3** 管理版本。
- 容器化：**没有**。
  - 依据：全项目范围内未发现 `Dockerfile`、`docker-compose.yml`/`docker-compose.yaml`、`.dockerignore` 或 `.env` 文件（已用通配符全局搜索确认）。
- 部署方式：未发现容器化配置，推测为**直接 jar 包部署** —— 由 `sky-server` 模块通过 `spring-boot-maven-plugin` 打成可执行 jar（fat jar），用 `java -jar` 直接运行。

### 模块列表
- **sky-common**：`sky-common/` —— 公共模块（推测存放通用工具类、常量、统一返回结果、全局异常等，供其他模块依赖）。
- **sky-pojo**：`sky-pojo/` —— 数据模型模块（推测存放 Entity / DTO / VO 等纯数据对象定义）。
- **sky-server**：`sky-server/` —— 主服务模块（推测存放 Controller / Service / Mapper 等业务代码，是唯一可运行、对外提供接口的部署单元）。

> 说明：模块职责为基于模块命名的**初步推断**，用于建立整体印象；各模块内部的确切职责与依赖关系将在 scan-3-modules 步骤中进一步核实。

---

## SECTION-2: 技术栈全景
> SOURCE: backend_scan/PROJECT_S2_TECHSTACK.md

> 扫描范围：根 `pom.xml`（第 34-126 行 `dependencyManagement` + 第 20-33 行 `properties`）、`sky-common/pom.xml`、`sky-pojo/pom.xml`、`sky-server/pom.xml` 的依赖声明部分。
> 版本说明：本项目所有子模块继承 `spring-boot-starter-parent` **2.7.3**，Spring 官方 starter 的版本由父 pom 统一管理；第三方库版本大多在根 pom 的 `<properties>` 中集中定义。

### 核心框架
| 技术名称 | 版本 | 在项目中的作用 |
|---|---|---|
| Spring Boot | 2.7.3 | 整个后端的启动与运行底座，`sky-server` 靠它打成可执行 jar 并用 `java -jar` 跑起来 |
| Spring MVC（`spring-boot-starter-web`） | 父 pom 管理（Spring Boot 2.7.3） | `sky-server` 对外提供 HTTP 接口的 Web 层，负责接收商家端 / 用户端的请求并路由到对应 Controller |
| Spring WebSocket（`spring-boot-starter-websocket`） | 父 pom 管理（Spring Boot 2.7.3） | 为 `sky-server` 提供服务端主动推送能力（例如订单状态的实时通知，具体业务用途需在 scan-5-flow 读源码确认） |

### 数据层
| 技术名称 | 版本 | 在项目中的作用 |
|---|---|---|
| MyBatis（`mybatis-spring-boot-starter`） | 2.2.0（根 pom `properties`） | `sky-server` 访问数据库的持久层框架，把 Java 方法映射成 SQL 去查/改数据 |
| MySQL Connector/J（`mysql-connector-java`） | 父 pom 管理 | 连接 MySQL 数据库的官方驱动，`runtime` 作用域，程序运行时才需要 |
| Druid（`druid-spring-boot-starter`） | 1.2.1（根 pom `properties`） | 数据库连接池，负责管理和复用数据库连接，并附带监控能力 |
| PageHelper（`pagehelper-spring-boot-starter`） | 1.3.0（根 pom `properties`） | 配合 MyBatis 做物理分页，对应 S1 提到的"员工分页查询"等场景 |

> 微服务基础设施：本项目为多模块单体应用，根 pom 未引入任何 Spring Cloud / Nacos / Eureka / Gateway / OpenFeign / Dubbo / Sentinel 等依赖，该分类省略。

### 中间件
| 技术名称 | 版本 | 在项目中的作用 |
|---|---|---|
| Spring Data Redis（`spring-boot-starter-data-redis`） | 父 pom 管理（Spring Boot 2.7.3） | 为 `sky-server` 接入 Redis，用于缓存热点/临时数据以减轻数据库压力（具体缓存了哪些数据需在 scan-5-flow 读源码确认） |
| Spring Cache（`spring-boot-starter-cache`） | 父 pom 管理（Spring Boot 2.7.3） | 提供统一的缓存抽象，可配合 Redis 用注解方式给方法结果加缓存 |

### 安全与认证
| 技术名称 | 版本 | 在项目中的作用 |
|---|---|---|
| JWT（`jjwt`，io.jsonwebtoken） | 0.9.1（根 pom `properties`） | `sky-common` 引入，用于生成/校验登录令牌（配合 `JwtClaimsConstant`、`JwtTokenAdminInterceptor` 等，对应商家端/用户端登录鉴权） |

### 实用工具与第三方库
| 技术名称 | 版本 | 在项目中的作用 |
|---|---|---|
| Lombok | 1.18.30（根 pom `properties`） | 三个模块都在用，主要给 POJO / 实体类自动生成 getter/setter/构造器等样板代码 |
| Fastjson | 1.2.76（根 pom `properties`） | `sky-common` / `sky-server` 使用，做 JSON 与 Java 对象之间的转换 |
| Jackson（`spring-boot-starter-json` / `jackson-databind`） | starter 父 pom 管理（2.7.3）；`sky-pojo` 显式引入 `jackson-databind` 2.9.2 | Spring MVC 默认的 JSON 处理器，负责接口出入参的序列化/反序列化 |
| Apache Commons Lang（`commons-lang`） | 2.6（根 pom `properties`） | `sky-common` 引入，提供字符串等常用工具方法（未逐一核实具体调用点） |
| AspectJ（`aspectjrt` / `aspectjweaver`） | 1.9.4（根 pom `properties`） | `sky-server` 引入，用于 AOP 面向切面编程，把横切逻辑从业务代码抽离（例如公共字段自动填充/日志，具体切面需读源码确认） |
| Knife4j（`knife4j-spring-boot-starter`） | 3.0.2（根 pom `properties`） | `sky-pojo` / `sky-server` 引入，基于 Swagger 生成可视化的在线接口文档 |
| Aliyun OSS SDK（`aliyun-sdk-oss`） | 3.10.2（根 pom `properties`） | `sky-common` 引入，对接阿里云对象存储，对应 S1 提到的"菜品图片上传"功能 |
| Apache POI（`poi` / `poi-ooxml`） | 3.16（根 pom `properties`） | `sky-server` 引入，对应 S1 提到的"导出 Excel 报表"（营业数据报表导出） |
| WeChat Pay SDK（`wechatpay-apache-httpclient`） | 0.4.8（根 pom，直接写死版本） | `sky-common` 引入，对接微信支付 API v3，对应 S1 提到的"微信支付"下单收款 |
| JAXB API（`jaxb-api`） | 2.3.1（根 pom `properties`） | `sky-common` / `sky-server` 引入；通常是为高版本 JDK 补齐被移除的 XML 处理类，属兼容性支撑依赖（未发现独立业务使用迹象） |
| spring-boot-configuration-processor | 父 pom 管理 | `sky-common` 引入（`optional`），编译期为自定义配置属性类生成元数据 |
| Spring Boot Test（`spring-boot-starter-test`） | 父 pom 管理（Spring Boot 2.7.3） | `sky-server` 的 `test` 作用域依赖，提供单元/集成测试能力 |

---

## SECTION-3: 模块地图
> SOURCE: backend_scan/PROJECT_S3_MODULES.md

> 项目名称、项目类型、基础包路径：见 META
> spring.application.name：**未设置**（`application.yml` 中无该字段；单体项目只有一个运行进程，无需服务名做注册/发现）
> 启动类：`com.sky.SkyApplication`，路径 `sky-server/src/main/java/com/sky/SkyApplication.java`

---

### 启动类注解分析

启动类 `SkyApplication` 上共有 5 个注解（其中 `@Slf4j` 是 Lombok 日志注解，其余 4 个是 Spring 能力开关）。全项目**只有这一个启动类**（`sky-common`、`sky-pojo` 无启动类，是被依赖的支撑库），符合"多模块打包成单一进程运行"的单体特征。

| 注解 | 含义 | 开启的能力 |
|---|---|---|
| `@SpringBootApplication` | 标准 Spring Boot 启动类（等价于 `@Configuration` + `@EnableAutoConfiguration` + `@ComponentScan`） | 开启自动配置；默认扫描 `com.sky` 包及其子包下的所有 `@Component`/`@Service`/`@Controller`/`@RestController`/`@Configuration` |
| `@EnableTransactionManagement` | 开启声明式事务（Declarative Transaction） | 允许在 Service 方法上用 `@Transactional` 注解管理数据库事务（如下单、批量插入等需要原子性的操作） |
| `@Slf4j` | Lombok 提供的日志门面 | 在启动类内直接使用 `log` 对象打日志（如 `log.info("server started")`），与模块职责推断无关 |
| `@EnableCaching` | 开启 Spring Cache 缓存抽象（Cache Abstraction） | 允许用 `@Cacheable`/`@CacheEvict`/`@CachePut` 做方法级缓存（结合 `config/RedisConfiguration.java`，缓存后端大概率是 Redis） |
| `@EnableScheduling` | 开启定时任务调度（Scheduled Task） | 允许用 `@Scheduled` 声明定时任务——这正好对应 `task/` 包下的 `OrderTask`、`WebSocketTask`、`MyTask`（如定时取消超时未支付订单、定时推送心跳） |

**未发现的注解（用于排除可能性）：**
- 没有 `@EnableDiscoveryClient` / `@EnableEurekaClient` / `@EnableNacosDiscovery` → **不是微服务**，未注册到任何注册中心（Service Registry），与 S1 定性一致。
- 没有 `@EnableFeignClients` → **不依赖远程 RPC**，模块之间是**进程内方法调用**，不是跨服务网络调用。
- 没有 `@EnableCircuitBreaker` / `@EnableHystrix` → 没有熔断降级（Circuit Breaker）。
- 没有 `@MapperScan(...)` **标注在启动类上** → MyBatis 的 Mapper 接口扫描不是通过启动类完成的；推断由每个 Mapper 接口自带 `@Mapper` 注解（待 scan-5 读源码确认），本步骤不做定论。
- 没有 `@EnableAsync` → 未开启注解式异步方法（`@Async`）；异步能力主要靠 `@EnableScheduling` 的定时任务 + WebSocket。
- 没有 `@ServletComponentScan` → 未通过 Servlet 组件扫描注册原生 Servlet/Filter；拦截器走的是 Spring MVC 的 `WebMvcConfiguration`（推断）。

> 结论锚点：这几个注解共同说明——本项目是一个**开启了事务、缓存、定时任务**的**单体 Web 应用**，模块间全部是**进程内调用**，不存在任何远程服务依赖。后续所有模块卡片的"依赖谁"字段，都不会出现"远程服务"，只会是包间/模块间的本地调用。

---

### 模块卡片

> 说明：本项目是"多模块单体"，存在**两个粒度**的"模块"：
> - **粗粒度**：3 个 Maven 子模块（`sky-common` / `sky-pojo` / `sky-server`）——见 Part A。
> - **细粒度**：`sky-server` 内部的分层业务包（controller / service / mapper / ...）——这才是真正的分层架构所在，见 Part B。
> 两个粒度都出卡片，才能既反映"打包结构"又反映"业务分层"。

---

#### Part A：Maven 子模块卡片（3 张）

📦 模块：sky-common（路径：`sky-common/src/main/java/com/sky/`）

完整文件清单：
- constant/
  - AutoFillConstant.java
  - JwtClaimsConstant.java
  - MessageConstant.java
  - PasswordConstant.java
  - StatusConstant.java
- context/
  - BaseContext.java
- enumeration/
  - OperationType.java
- exception/
  - AccountLockedException.java
  - AccountNotFoundException.java
  - AddressBookBusinessException.java
  - BaseException.java
  - DeletionNotAllowedException.java
  - LoginFailedException.java
  - OrderBusinessException.java
  - PasswordEditFailedException.java
  - PasswordErrorException.java
  - SetmealEnableFailedException.java
  - ShoppingCartBusinessException.java
  - UserNotLoginException.java
- json/
  - JacksonObjectMapper.java
- properties/
  - AliOssProperties.java
  - JwtProperties.java
  - WeChatProperties.java
- result/
  - PageResult.java
  - Result.java
- utils/
  - AliOssUtil.java
  - HttpClientUtil.java
  - JwtUtil.java
  - WeChatPayUtil.java

（共 29 个 `.java` 文件）

├── 职责：**公共基础设施库**。提供全项目复用的常量（`constant`）、业务枚举（`enumeration`）、自定义异常体系（`exception`，以 `BaseException` 为根）、统一返回结果（`result` 下的 `Result`/`PageResult`）、配置属性绑定类（`properties`，对应 JWT/阿里云 OSS/微信支付）、工具类（`utils`，含 JWT 签发校验、阿里云 OSS 上传、HttpClient、微信支付）、以及 ThreadLocal 上下文（`context/BaseContext`，用于跨层传递当前登录用户 id）。
├── 启动类：**没有**（纯支撑库，不可独立运行）。
├── 对外暴露：**无 HTTP 入口，通过包间方法调用对外服务**（被 `sky-server` 以 Maven 依赖方式引入并直接调用其类）。
└── 依赖谁：
  - **无内部模块依赖**（不依赖 `sky-pojo`、`sky-server`）。依据：`sky-common` 目录下只有工具/常量/异常/属性类，无 controller/service/mapper，属于最底层的被依赖方。
  - **依赖外部 SDK**（阿里云 OSS、微信支付 SDK、JJWT、Apache HttpClient）。依据：`utils/AliOssUtil.java`、`utils/WeChatPayUtil.java`、`utils/JwtUtil.java`、`utils/HttpClientUtil.java` 文件名 + S1 已确认 `pom.xml` 引入了对应依赖。

📦 模块：sky-pojo（路径：`sky-pojo/src/main/java/com/sky/`）

完整文件清单：
- dto/
  - CategoryDTO.java
  - CategoryPageQueryDTO.java
  - DataOverViewQueryDTO.java
  - DishDTO.java
  - DishPageQueryDTO.java
  - EmployeeDTO.java
  - EmployeeLoginDTO.java
  - EmployeePageQueryDTO.java
  - GoodsSalesDTO.java
  - OrdersCancelDTO.java
  - OrdersConfirmDTO.java
  - OrdersDTO.java
  - OrdersPageQueryDTO.java
  - OrdersPaymentDTO.java
  - OrdersRejectionDTO.java
  - OrdersSubmitDTO.java
  - PasswordEditDTO.java
  - SetmealDTO.java
  - SetmealPageQueryDTO.java
  - ShoppingCartDTO.java
  - UserLoginDTO.java
- entity/
  - AddressBook.java
  - Category.java
  - Dish.java
  - DishFlavor.java
  - Employee.java
  - OrderDetail.java
  - Orders.java
  - Setmeal.java
  - SetmealDish.java
  - ShoppingCart.java
  - User.java
- vo/
  - BusinessDataVO.java
  - DishItemVO.java
  - DishOverViewVO.java
  - DishVO.java
  - EmployeeLoginVO.java
  - OrderOverViewVO.java
  - OrderPaymentVO.java
  - OrderReportVO.java
  - OrderStatisticsVO.java
  - OrderSubmitVO.java
  - OrderVO.java
  - SalesTop10ReportVO.java
  - SetmealOverViewVO.java
  - SetmealVO.java
  - TurnoverReportVO.java
  - UserLoginVO.java
  - UserReportVO.java

（共 49 个 `.java` 文件：dto 21 + entity 11 + vo 17）

├── 职责：**数据模型库（纯 POJO）**。定义三类数据对象——
  - `entity`：与数据库表一一对应的实体（Employee、Dish、Setmeal、Orders、User、Category、ShoppingCart、AddressBook 等），是持久层的数据载体。
  - `dto`（Data Transfer Object）：接收前端请求参数的传输对象（如分页查询 `*PageQueryDTO`、下单 `OrdersSubmitDTO`、登录 `EmployeeLoginDTO`/`UserLoginDTO`）。
  - `vo`（View Object）：返回给前端的展示对象（如 `EmployeeLoginVO` 带 token、报表类 `TurnoverReportVO`/`OrderReportVO`/`SalesTop10ReportVO`）。
├── 启动类：**没有**（纯数据模型库，不可独立运行）。
├── 对外暴露：**无 HTTP 入口，通过包间方法调用对外服务**（作为 Maven 依赖被 `sky-server` 引入，其类被 controller/service/mapper 各层直接引用）。
└── 依赖谁：
  - **无内部模块依赖**（不依赖 `sky-common`、`sky-server`）。依据：目录下只有 dto/entity/vo 三个存放纯数据类的包，无任何逻辑/工具引用，是最底层的数据定义方。
  - **依赖外部库**：Lombok（`@Data` 等注解生成 getter/setter）。依据：S1 已确认 `pom.xml` 引入 Lombok，POJO 是 Lombok 的典型使用场景（待 scan-5 确认注解）。

📦 模块：sky-server（路径：`sky-server/src/main/java/com/sky/`）

完整文件清单：
- SkyApplication.java  ← 启动类
- annotation/
  - AutoFill.java
- aspect/
  - AutoFillAspect.java
- config/
  - OssConfiguration.java
  - RedisConfiguration.java
  - WebMvcConfiguration.java
  - WebSocketConfiguration.java
- controller/
  - admin/
    - CategoryController.java
    - CommonController.java
    - DishController.java
    - EmployeeController.java
    - OrderController.java
    - ReportController.java
    - SetmealController.java
    - ShopController.java
    - WorkSpaceController.java
  - notify/
    - PayNotifyController.java
  - user/
    - AddressBookController.java
    - CategoryController.java
    - DishController.java
    - OrderController.java
    - SetmealController.java
    - ShopController.java
    - ShoppingCartController.java
    - UserController.java
- handler/
  - GlobalExceptionHandler.java
- interceptor/
  - JwtTokenAdminInterceptor.java
  - JwtTokenUserInterceptor.java
- mapper/
  - AddressBookMapper.java
  - CategoryMapper.java
  - DishFlavorMapper.java
  - DishMapper.java
  - EmployeeMapper.java
  - OrderDetailMapper.java
  - OrderMapper.java
  - SetmealDishMapper.java
  - SetmealMapper.java
  - ShoppingCartMapper.java
  - UserMapper.java
- service/
  - AddressBookService.java
  - CategoryService.java
  - DishService.java
  - EmployeeService.java
  - OrderService.java
  - ReportService.java
  - SetmealService.java
  - ShoppingCartService.java
  - UserService.java
  - WorkspaceService.java
  - impl/
    - AddressBookServiceImpl.java
    - CategoryServiceImpl.java
    - DishServiceImpl.java
    - EmployeeServiceImpl.java
    - OrderServiceImpl.java
    - ReportServiceImpl.java
    - SetmealServiceImpl.java
    - ShoppingCartServiceImpl.java
    - UserServiceImpl.java
    - WorkspaceServiceImpl.java
- task/
  - MyTask.java
  - OrderTask.java
  - WebSocketTask.java
- websocket/
  - WebSocketServer.java

（共 63 个 `.java` 文件：startup 1 + annotation 1 + aspect 1 + config 4 + controller 18 + handler 1 + interceptor 2 + mapper 11 + service 20 + task 3 + websocket 1）

├── 职责：**唯一可运行的主服务模块**。承载全部业务逻辑，采用标准 Spring MVC 三层架构（Controller → Service → Mapper），同时对外暴露管理端（admin）与用户 C 端（user）两套 HTTP 接口，另有支付回调（notify）、拦截器鉴权、AOP 自动填充、定时任务、WebSocket 推送等基础设施。它是整个单体应用最终打包成可执行 jar 的部署单元。
├── 启动类：**有**——`com.sky.SkyApplication`，路径 `sky-server/src/main/java/com/sky/SkyApplication.java`。
├── 对外暴露：**有大量 HTTP 入口**，集中在 `controller/` 下的三个子包（详见 Part B 的 controller 卡片）。管理端 9 个 + 用户端 8 个 + 支付回调 1 个，共 18 个 Controller。
└── 依赖谁：
  - **依赖 `sky-common`**：使用其 `Result`/`PageResult`（统一返回）、`exception`（自定义异常）、`JwtUtil`/`AliOssUtil`/`WeChatPayUtil`（工具）、`BaseContext`（当前用户上下文）、`properties`（配置绑定）。依据：`sky-server` 的 handler/interceptor/config 命名与 `sky-common` 的 exception/utils/properties 高度对应，且分层架构惯例中 server 必然依赖 common。
  - **依赖 `sky-pojo`**：controller 收 dto、service 转 entity、mapper 存 entity、返回 vo。依据：`application.yml` 第 24 行 `type-aliases-package: com.sky.entity` 指向 `sky-pojo` 的 entity 包，证明 server 直接使用 pojo 的实体。
  - **依赖外部中间件**：MySQL（Druid + MyBatis）、Redis（`RedisConfiguration`）。依据：`application.yml` 配置了 datasource/redis + `config/RedisConfiguration.java` 文件名。
  - **无远程服务依赖**。依据：启动类无 `@EnableFeignClients`/`@EnableDiscoveryClient`。

---

#### Part B：sky-server 内部分层业务包卡片

> 依据"单体项目按顶层业务包逐一分析"的规则，把 `sky-server` 内部的每个顶层包当作一个"模块"出卡片。这些包共享同一个进程、同一个启动类 `SkyApplication`，此处不再重复"启动类"字段（统一为：借用 `SkyApplication`，包本身无独立启动类）。

📦 包：controller（路径：`sky-server/.../com/sky/controller/`）

完整文件清单：
- admin/
  - CategoryController.java
  - CommonController.java
  - DishController.java
  - EmployeeController.java
  - OrderController.java
  - ReportController.java
  - SetmealController.java
  - ShopController.java
  - WorkSpaceController.java
- notify/
  - PayNotifyController.java
- user/
  - AddressBookController.java
  - CategoryController.java
  - DishController.java
  - OrderController.java
  - SetmealController.java
  - ShopController.java
  - ShoppingCartController.java
  - UserController.java

├── 职责：**HTTP 流量入口层**。按使用者拆成三组——`admin`（商家管理端）、`user`（顾客 C 端）、`notify`（第三方支付异步回调）。负责接收请求、参数绑定（dto）、调用 service、封装 `Result` 返回。
├── 启动类：无（借用 `SkyApplication`）。
├── 对外暴露：**这是全项目唯一的 HTTP 入口**，按 Controller 归类的 API 大类如下（大类由文件名推断，具体路径待 scan-4/scan-5 核实）：
  - **admin（管理端）**：CategoryController=分类管理；CommonController=通用/文件上传；DishController=菜品管理；EmployeeController=员工管理与登录；OrderController=订单管理（接单/拒单/派送）；ReportController=数据统计报表；SetmealController=套餐管理；ShopController=店铺营业状态设置；WorkSpaceController=工作台概览。
  - **user（C 端）**：AddressBookController=收货地址簿；CategoryController=分类查询；DishController=菜品查询；OrderController=下单/支付/历史订单；SetmealController=套餐查询；ShopController=店铺营业状态查询；ShoppingCartController=购物车；UserController=微信登录。
  - **notify**：PayNotifyController=微信支付结果异步回调（供微信服务器 POST 通知）。
└── 依赖谁：
  - **依赖 service 包**：controller 注入 service 接口完成业务。依据：三层架构惯例 + service 包内接口与 controller 一一对应（如 `EmployeeController`↔`EmployeeService`）。
  - **依赖 sky-pojo 的 dto/vo**：接收 dto、返回 vo。依据：dto/vo 是请求/响应载体。
  - **依赖 sky-common 的 Result/PageResult/BaseContext**：统一返回 + 取当前登录用户。依据：命名对应关系。

📦 包：service（路径：`sky-server/.../com/sky/service/`）

完整文件清单：
- AddressBookService.java
- CategoryService.java
- DishService.java
- EmployeeService.java
- OrderService.java
- ReportService.java
- SetmealService.java
- ShoppingCartService.java
- UserService.java
- WorkspaceService.java
- impl/
  - AddressBookServiceImpl.java
  - CategoryServiceImpl.java
  - DishServiceImpl.java
  - EmployeeServiceImpl.java
  - OrderServiceImpl.java
  - ReportServiceImpl.java
  - SetmealServiceImpl.java
  - ShoppingCartServiceImpl.java
  - UserServiceImpl.java
  - WorkspaceServiceImpl.java

├── 职责：**业务逻辑层**。采用"接口 + 实现"分离（interface 在 `service/`，实现在 `service/impl/`），10 组接口与实现一一对应。承载核心业务规则、事务边界（`@Transactional`）、多表编排（如下单要同时写 orders + order_detail + 清空购物车）。
├── 启动类：无（借用 `SkyApplication`）。
├── 对外暴露：无 HTTP 入口，通过包间方法调用对外服务（被 controller 与 task 调用）。
└── 依赖谁：
  - **依赖 mapper 包**：service 实现类注入 mapper 做持久化。依据：三层架构惯例 + mapper 与 service 命名对应（`OrderServiceImpl`↔`OrderMapper`/`OrderDetailMapper`）。
  - **依赖 sky-pojo（entity/dto/vo）**：做 dto→entity、entity→vo 的转换。依据：报表类 vo（`TurnoverReportVO` 等）显然由 `ReportServiceImpl` 组装。
  - **依赖 sky-common 的 utils/exception/constant**：如 `WeChatPayUtil`（下单支付）、`AliOssUtil`（图片）、各类业务异常、`StatusConstant`。依据：命名与业务对应。
  - **可能依赖 websocket 包**：`OrderServiceImpl` 支付成功后经 `WebSocketServer` 推送来单提醒。依据：`task/WebSocketTask.java` + `websocket/WebSocketServer.java` 的存在（待 scan-5 确认）。

📦 包：mapper（路径：`sky-server/.../com/sky/mapper/`）

完整文件清单：
- AddressBookMapper.java
- CategoryMapper.java
- DishFlavorMapper.java
- DishMapper.java
- EmployeeMapper.java
- OrderDetailMapper.java
- OrderMapper.java
- SetmealDishMapper.java
- SetmealMapper.java
- ShoppingCartMapper.java
- UserMapper.java

├── 职责：**数据持久层（DAO）**。MyBatis Mapper 接口，负责与 MySQL 交互（增删改查）。SQL 位于 `resources/mapper/*.xml`（依据 `application.yml` 第 23 行 `mapper-locations: classpath:mapper/*.xml`），部分简单 SQL 可能用注解写在接口上。
├── 启动类：无（借用 `SkyApplication`）。
├── 对外暴露：无 HTTP 入口，通过包间方法调用对外服务（被 service/impl 调用）。
└── 依赖谁：
  - **依赖 MySQL 数据库**：直接读写数据表。依据：`application.yml` 的 druid datasource 配置。
  - **依赖 sky-pojo 的 entity**：作为查询结果/入参类型。依据：`application.yml` 第 24 行 `type-aliases-package: com.sky.entity`。
  - **被 AOP 切面 `AutoFillAspect` 织入**：insert/update 方法上标注 `@AutoFill` 后被自动填充公共字段。依据：`annotation/AutoFill.java` + `aspect/AutoFillAspect.java` + `sky-common/constant/AutoFillConstant.java`（待 scan-5 确认切点表达式）。

📦 包：interceptor（路径：`sky-server/.../com/sky/interceptor/`）

完整文件清单：
- JwtTokenAdminInterceptor.java
- JwtTokenUserInterceptor.java

├── 职责：**JWT 鉴权拦截器**。请求进入 controller 前拦截，校验请求头里的 JWT 令牌——`JwtTokenAdminInterceptor` 管管理端 token，`JwtTokenUserInterceptor` 管 C 端 token；校验通过后把当前用户 id 放入 `BaseContext`。
├── 启动类：无（借用 `SkyApplication`）。
├── 对外暴露：无 HTTP 入口，作为 Spring MVC 拦截器在请求链路中生效（由 `config/WebMvcConfiguration` 注册）。
└── 依赖谁：
  - **依赖 sky-common 的 `JwtUtil` + `JwtProperties` + `JwtClaimsConstant` + `BaseContext`**：解析令牌、读密钥、写上下文。依据：文件名 `JwtToken*Interceptor` 与 `sky-common` 的 JWT 相关类强对应。
  - **被 `config/WebMvcConfiguration` 注册**：依据：Spring MVC 拦截器注册惯例。

📦 包：config（路径：`sky-server/.../com/sky/config/`）

完整文件清单：
- OssConfiguration.java
- RedisConfiguration.java
- WebMvcConfiguration.java
- WebSocketConfiguration.java

├── 职责：**Spring 配置装配层**。集中定义 Bean 与框架配置——`OssConfiguration`=装配阿里云 OSS 工具 Bean；`RedisConfiguration`=装配 RedisTemplate；`WebMvcConfiguration`=注册 JWT 拦截器 + 静态资源 + 消息转换器 + Swagger/Knife4j 接口文档；`WebSocketConfiguration`=装配 WebSocket 的 `ServerEndpointExporter`。
├── 启动类：无（借用 `SkyApplication`）。
├── 对外暴露：无 HTTP 入口，通过 `@Configuration`/`@Bean` 在启动时向容器注入 Bean。
└── 依赖谁：
  - **依赖 sky-common 的 properties/utils**：`OssConfiguration` 用 `AliOssProperties` + `AliOssUtil`。依据：命名对应。
  - **依赖 interceptor 包**：`WebMvcConfiguration` 注册 `JwtTokenAdminInterceptor`/`JwtTokenUserInterceptor`。依据：WebMvc 配置注册拦截器惯例。
  - **依赖 websocket 包**：`WebSocketConfiguration` 装配 `WebSocketServer` 所需的 exporter。依据：文件名对应。
  - **依赖 Redis 中间件**：`RedisConfiguration`。依据：`application.yml` redis 配置 + `@EnableCaching`。

📦 包：aspect（路径：`sky-server/.../com/sky/aspect/`）

完整文件清单：
- AutoFillAspect.java

├── 职责：**AOP 公共字段自动填充切面**。拦截 mapper 层被 `@AutoFill` 标注的 insert/update 方法，统一填充 `create_time`/`update_time`/`create_user`/`update_user` 等公共字段，避免每处手写。是"模板方法 + AOP"消除样板代码的典型实践。
├── 启动类：无（借用 `SkyApplication`）。
├── 对外暴露：无 HTTP 入口，以切面形式织入 mapper 方法调用。
└── 依赖谁：
  - **依赖 annotation 包的 `@AutoFill`**：作为切点匹配标记。依据：切面 + 自定义注解的标准搭配。
  - **依赖 sky-common 的 `AutoFillConstant` + `OperationType` 枚举 + `BaseContext`**：取字段名常量、区分 INSERT/UPDATE、取当前用户 id。依据：`sky-common/enumeration/OperationType.java` + `constant/AutoFillConstant.java` 命名对应。
  - **作用于 mapper 包**：依据：自动填充针对持久化方法。

📦 包：annotation（路径：`sky-server/.../com/sky/annotation/`）

完整文件清单：
- AutoFill.java

├── 职责：**自定义注解定义**。`@AutoFill` 是标记型注解，贴在 mapper 的 insert/update 方法上，配合 `AutoFillAspect` 触发公共字段自动填充，并通过枚举参数区分是新增还是修改。
├── 启动类：无（借用 `SkyApplication`）。
├── 对外暴露：无 HTTP 入口，作为元数据注解被 aspect 消费。
└── 依赖谁：
  - **依赖 sky-common 的 `OperationType` 枚举**：作为注解属性类型（`@AutoFill(OperationType.INSERT)`）。依据：`sky-common/enumeration/OperationType.java` 是本项目唯一的操作类型枚举。

📦 包：handler（路径：`sky-server/.../com/sky/handler/`）

完整文件清单：
- GlobalExceptionHandler.java

├── 职责：**全局异常处理器**。用 `@RestControllerAdvice` 统一捕获 controller 抛出的自定义业务异常（`BaseException` 家族）与框架异常，转换成统一的 `Result` 错误响应，避免异常直接暴露给前端。
├── 启动类：无（借用 `SkyApplication`）。
├── 对外暴露：无独立 HTTP 入口，以 AOP 环绕方式统一接管所有 controller 的异常出口。
└── 依赖谁：
  - **依赖 sky-common 的 `exception` 家族 + `Result` + `MessageConstant`**：捕获异常、封装错误码/消息。依据：`sky-common/exception/*` 与 `result/Result.java`、`constant/MessageConstant.java` 命名对应。

📦 包：task（路径：`sky-server/.../com/sky/task/`）

完整文件清单：
- MyTask.java
- OrderTask.java
- WebSocketTask.java

├── 职责：**定时任务层**。基于 `@EnableScheduling` + `@Scheduled`——`OrderTask`=定时处理超时订单（如超时未支付自动取消、派送中订单自动完成）；`WebSocketTask`=定时向前端 WebSocket 推送（如心跳/统计）；`MyTask`=演示/测试用定时任务。
├── 启动类：无（借用 `SkyApplication`，能力由启动类的 `@EnableScheduling` 开启）。
├── 对外暴露：无 HTTP 入口，由 Spring 调度器按 cron 触发。
└── 依赖谁：
  - **依赖 service / mapper 层**：`OrderTask` 需查询并更新订单状态。依据：定时任务处理订单必然经业务/持久层。
  - **依赖 websocket 包**：`WebSocketTask` 调用 `WebSocketServer` 推送。依据：命名对应。

📦 包：websocket（路径：`sky-server/.../com/sky/websocket/`）

完整文件清单：
- WebSocketServer.java

├── 职责：**WebSocket 服务端点**。维护与商家管理端浏览器的长连接，用于**服务端主动推送**——如顾客下单/催单时实时弹出提醒。是 HTTP 请求-响应模型之外的"服务端 → 客户端"通道。
├── 启动类：无（借用 `SkyApplication`）。
├── 对外暴露：**暴露 WebSocket 端点**（`ws://.../ws/{sid}` 之类，非普通 HTTP REST）。由 `config/WebSocketConfiguration` 装配的 `ServerEndpointExporter` 激活。
└── 依赖谁：
  - **依赖 config 的 `WebSocketConfiguration`**：需要 `ServerEndpointExporter` 才能生效。依据：Spring 原生 WebSocket 装配惯例。
  - **被 service/impl 与 task 调用**：作为推送出口。依据：`OrderServiceImpl`（来单提醒）+ `WebSocketTask`（定时推送）。

---

### 依赖矩阵

> 说明：本表综合"Maven 模块粒度"与"sky-server 内部分层包粒度"。"被哪些上游依赖"由各卡片"依赖谁"字段反向汇总而来，不引入新推断。外部中间件（MySQL/Redis）与第三方（阿里云 OSS/微信支付）列为终端下游。

| 模块 / 包 | 依赖的下游 | 被哪些上游依赖 |
|---|---|---|
| sky-common | 外部 SDK（阿里云 OSS、微信支付、JJWT、HttpClient） | sky-server 的几乎所有层（controller、service、mapper、interceptor、config、aspect、annotation、handler） |
| sky-pojo | 外部库（Lombok） | sky-server 的 controller、service、mapper |
| sky-server | sky-common、sky-pojo、MySQL、Redis | （无，是整个应用的运行容器/部署单元） |
| controller（含 admin/user/notify） | service、sky-pojo(dto/vo)、sky-common(Result/BaseContext) | 外部浏览器/微信服务器（HTTP 请求入口） |
| service（含 impl） | mapper、websocket、sky-pojo、sky-common(utils/exception/constant) | controller、task |
| mapper | MySQL、sky-pojo(entity) | service/impl、（被 aspect 织入） |
| interceptor | sky-common(JwtUtil/JwtProperties/JwtClaimsConstant/BaseContext) | config(WebMvcConfiguration) 注册后作用于所有 controller |
| config | interceptor、websocket、sky-common(properties/utils)、Redis | Spring 容器（启动时装配） |
| aspect | annotation(@AutoFill)、mapper（织入目标）、sky-common(AutoFillConstant/OperationType/BaseContext) | Spring AOP 容器 |
| annotation | sky-common(OperationType) | aspect、mapper（方法上标注 @AutoFill） |
| handler | sky-common(exception/Result/MessageConstant) | 所有 controller（统一异常出口） |
| task | service、mapper、websocket | Spring 调度器（@Scheduled 触发） |
| websocket | config(WebSocketConfiguration) | service/impl、task |
| MySQL（外部） | —（终端） | mapper |
| Redis（外部） | —（终端） | config(RedisConfiguration)、@EnableCaching |
| 阿里云 OSS / 微信支付（外部） | —（终端） | sky-common(utils) → service |

---

### 模块关系图

[外部浏览器：商家管理端 / 顾客 C 端]        [微信支付服务器（异步 POST）]
  │                                            │
  ▼                                            ▼
[interceptor：JWT 鉴权]  ── 职责：请求进 controller 前校验 token，写 BaseContext
  │  （由 config/WebMvcConfiguration 注册）
  ▼
[controller 层]  ── 职责：HTTP 入口，收 dto / 返 Result
  ├── admin/*   ── 商家管理端 API（员工/菜品/套餐/订单/报表/店铺/工作台/文件上传）
  ├── user/*    ── 顾客 C 端 API（登录/分类/菜品/套餐/购物车/地址/下单支付）
  └── notify/PayNotifyController ── 接收微信支付回调
  │
  │ （异常统一被 handler/GlobalExceptionHandler 接管 → 返回统一 Result）
  ▼
[service 层（接口 + impl）]  ── 职责：业务逻辑、事务、多表编排
  │
  ├──▶ [mapper 层]  ── 职责：MyBatis 持久化
  │        │  （insert/update 被 aspect/AutoFillAspect + annotation/@AutoFill 织入，自动填充公共字段）
  │        │
  │        └──▶ [MySQL：employee / dish / setmeal / orders / order_detail / user / category / shopping_cart / address_book 等表]
  │
  ├──▶ [websocket/WebSocketServer]  ── 职责：来单/催单实时推送给管理端浏览器
  │
  └──▶ [sky-common/utils]
           ├──▶ [阿里云 OSS]     ── 菜品/套餐图片上传
           └──▶ [微信支付 API]   ── 下单支付 / 退款

[task 层（@Scheduled 定时任务）]  ── 职责：旁路触发，不走 HTTP
  ├──▶ [service / mapper]  ── OrderTask：定时取消超时未支付订单、完成派送中订单
  └──▶ [websocket]         ── WebSocketTask：定时推送

[config 层]  ── 职责：启动时装配 Bean（OSS / RedisTemplate / WebMvc 拦截器与文档 / WebSocket 端点）
  └──▶ [Redis]  ── 缓存（@EnableCaching）

[底层被依赖库]
  sky-pojo（entity/dto/vo）── 被 controller / service / mapper 全程引用，描述数据形状
  sky-common（result/exception/utils/constant/properties/context）── 被 sky-server 各层复用

---

## SECTION-4: 核心入口配置
> SOURCE: backend_scan/PROJECT_S4_ENTRYPOINT.md

> 项目名称、项目类型、默认激活 Profile：见 META
> 配置文件一览：
> - `sky-server/src/main/resources/application.yml`（公共配置 + 占位符引用）
> - `sky-server/src/main/resources/application-dev.yml`（dev profile，提供占位符的实际值）
> - `sky-common`、`sky-pojo` 两个子模块**无 `application.yml`**（纯支撑库，不可独立运行，无需配置）
> - 无 `bootstrap.yml` / `bootstrap.properties`（本项目非微服务，不接配置中心）

> ⚠️ 关键机制说明（贯穿全文）：本项目的两份配置文件不是常见的"默认值 + profile 覆盖"关系，而是**占位符 + 填值**关系。`application.yml` 里大量字段写成 `${sky.datasource.host}` 这样的**占位符（Placeholder）**，真正的值定义在 `application-dev.yml` 的 `sky.*` 节点下。启动时 `spring.profiles.active: dev` 让 `application-dev.yml` 被加载，Spring 再用它的值去填充 `application.yml` 里的占位符。所以两份文件**必须同时存在**才能拼出一份完整可运行的配置。

---

### 启动顺序

本项目是单体应用，只有一个运行进程（`SkyApplication`），但它在启动/运行时依赖两个外部中间件（MySQL、Redis）和若干第三方 SaaS。合理的启动顺序如下：

1. **MySQL 数据库（必需）**：项目的核心数据存储，所有业务数据（employee / dish / setmeal / orders / user 等表）都持久化在名为 `sky_take_out` 的库里。必须**最先**就绪——`application-dev.yml` 指定了 `sky.datasource.host: localhost` / `port: 3306` / `database: sky_take_out`，应用启动时 Druid 连接池会按此配置建立连接，且 MyBatis 需要 `sky_take_out` 库存在；数据库未就绪时，Druid 初始化连接失败会直接导致启动报错，即使勉强启动，任何走 mapper 的接口也会立即抛异常。

2. **Redis 缓存（可选依赖）**：用作缓存后端，配合启动类的 `@EnableCaching` 与 `config/RedisConfiguration.java` 使用（如缓存菜品/套餐、店铺营业状态、验证码等）。放在 MySQL 之后、应用之前是**理想顺序**，但它对"应用能否启动"是**可选依赖**：Spring Boot 默认用 Lettuce 客户端，Redis 连接是**懒加载**的（首次使用才真正连接），所以即使 Redis 没起，`SkyApplication` 依然能启动成功。**未启动的影响**：所有依赖缓存的功能（如管理端设置/查询营业状态、走 `@Cacheable` 的菜品套餐查询）会在**首次调用时**抛出 Redis 连接异常，而不是启动时报错。配置见 `application-dev.yml` 的 `sky.redis.host: localhost` / `port: 6379` / `password: 空` / `database: 10`。

3. **sky-server 应用本身（`SkyApplication`）**：唯一的部署单元，打包成可执行 jar 后运行，监听 `8080` 端口对外提供 HTTP 服务。必须放在**最后**——它启动时要向 MySQL 建连接池、注册 JWT 拦截器、装配 Redis/OSS/WebSocket 等 Bean，因此依赖上面两个中间件先就位（至少 MySQL 必须先就位）。启动成功后，管理端与 C 端的全部 REST 接口、WebSocket 端点、定时任务（`@Scheduled`）才开始工作。

> 补充：第三方 SaaS 属于**运行时可选外部依赖**，不需要你"启动"，只需保证配置里的凭证有效，且仅影响特定功能，因此不列入上面的启动步骤：
> - **阿里云 OSS（可选）**：菜品/套餐图片上传。凭证在 `application-dev.yml` 的 `sky.alioss.*`。未配置/失效时，仅图片上传（`admin/CommonController`）失败，不影响启动与其它功能。
> - **微信支付 / 微信登录（可选）**：C 端下单支付与微信登录。凭证在 `sky.wechat.*`。未配置时，仅支付/微信登录失败。注意 `privateKeyFilePath: D:\apiclient_key.pem` 等是**本地绝对路径**，换机器需同步存在这些证书文件。
> - **百度地图（可选）**：`sky.baidu.ak: EFEEFFEFEFE`（明显是占位假值），用于地址解析/配送范围校验，未配置时相关校验失败。

---

### 对外入口

- 端口：**8080**（`application.yml` 第 2 行 `server.port: 8080`；dev profile 未覆盖，两个环境都是 8080）
- 监听地址：未配置，默认 `0.0.0.0`（`server.address` 未出现在任何配置文件中）
- 路径前缀：**无前缀**（未配置 `server.servlet.context-path`，Controller 的 `@RequestMapping` 路径即为完整路径）
- 完整访问地址示例：
  - 管理端登录（推断）：`http://localhost:8080/admin/employee/login`
  - C 端微信登录（推断）：`http://localhost:8080/user/user/login`
  - WebSocket 端点（推断）：`ws://localhost:8080/ws/{sid}`
- 如有 Gateway：**无。本项目是单体应用，当前仓库不含任何网关模块**（启动类无 `@EnableDiscoveryClient`/`@EnableFeignClients`，无 `spring.cloud.gateway` 配置）。所有流量直接打到 8080 端口的 Spring MVC。

---

### 关键配置项索引

> 本项目有两份配置文件，但**只有 `dev` 一个 profile**。下面按"公共配置（application.yml）"和"dev 配置（application-dev.yml，填充占位符）"两段组织。所有值按配置文件原始内容如实输出，不打码（本文档为个人学习用途）。

#### 公共配置（application.yml）

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

#### dev 配置覆盖（application-dev.yml）

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

### 环境差异对比

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

### API 路径概览

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

### 数据库 Schema 索引

**未发现独立的 SQL 脚本目录。**

- 项目根目录及各子模块（sky-server / sky-common / sky-pojo）下均**无 `sql/` 文件夹**，全仓库搜索 `**/*.sql` 无任何结果。
- 建表脚本未纳入本仓库——数据库表结构（`sky_take_out` 库）需从苍穹外卖官方配套资料单独导入，或由使用者手动建库建表。
- 与数据库交互的 SQL 存在于 MyBatis 的 XML 映射文件中：`sky-server/src/main/resources/mapper/*.xml`（由 `mybatis.mapper-locations: classpath:mapper/*.xml` 指定），但这是**运行时查询 SQL**，不是建表 schema，且本步骤不读其内容。
- 项目也**未使用** Elasticsearch，无 ES 索引映射文件（`*.json` mapping）。

---

## SECTION-5: 核心业务调用链
> SOURCE: backend_scan/PROJECT_S5_FLOW.md
> ⚠️ 本章的代码片段是下游 codebase-annotate 等 Skill 的核心锚点，严禁删除或压缩。

> 项目名称：sky-take-out（苍穹外卖）
> 项目类型：多模块单体应用（Multi-module Monolith）
> 本步骤读取的真实 `.java` 源文件：
> - `sky-server/src/main/java/com/sky/controller/user/OrderController.java`（类级注解 + 全部方法签名 + `submit` 方法体）
> - `sky-server/src/main/java/com/sky/service/impl/OrderServiceImpl.java`（字段声明 + `submitOrder` 方法体）
> - `sky-server/src/main/java/com/sky/mapper/OrderMapper.java`（全部方法签名，取 `insert` 作为代表）

---

### 核心功能识别

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

### 完整调用链

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

### 节点详解

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

## SECTION-6: 核心数据模型快照
> 派生章节。SOURCE: SECTION-3 sky-pojo 模块卡片 + SECTION-4 Schema 索引 + SECTION-5 节点详解
> ⚠️ 重要前提：SECTION-4 明确"全仓库搜索 `**/*.sql` 无结果"，本项目**无建表 schema 文件**。因此除下单链路（SECTION-5）暴露的字段外，绝大多数实体字段名与全部字段类型都**未在 SECTION-1~5 中出现**。下游若需准确字段，请读取源码 `sky-pojo/src/main/java/com/sky/entity/*.java` 与 `sky-server/src/main/resources/mapper/*.xml`。

### 6.1 实体清单（Entity / Domain / PO）

| 实体类 | 对应表 | 文件路径 | 来源章节 |
|---|---|---|---|
| AddressBook | address_book | sky-pojo/src/main/java/com/sky/entity/AddressBook.java | SECTION-3 sky-pojo 模块卡片 + SECTION-5 节点 4（address_book 表） |
| Category | category | sky-pojo/src/main/java/com/sky/entity/Category.java | SECTION-3 sky-pojo 模块卡片 + SECTION-3 模块关系图（category 表） |
| Dish | dish | sky-pojo/src/main/java/com/sky/entity/Dish.java | SECTION-3 sky-pojo 模块卡片 + SECTION-3 模块关系图（dish 表） |
| DishFlavor | dish_flavor（表名未明，推断） | sky-pojo/src/main/java/com/sky/entity/DishFlavor.java | SECTION-3 sky-pojo 模块卡片（对应 DishFlavorMapper） |
| Employee | employee | sky-pojo/src/main/java/com/sky/entity/Employee.java | SECTION-3 sky-pojo 模块卡片 + SECTION-3 模块关系图（employee 表） |
| OrderDetail | order_detail | sky-pojo/src/main/java/com/sky/entity/OrderDetail.java | SECTION-3 sky-pojo 模块卡片 + SECTION-5 节点 4（order_detail 表） |
| Orders | orders | sky-pojo/src/main/java/com/sky/entity/Orders.java | SECTION-3 sky-pojo 模块卡片 + SECTION-5 节点 2/3/4（orders 表） |
| Setmeal | setmeal | sky-pojo/src/main/java/com/sky/entity/Setmeal.java | SECTION-3 sky-pojo 模块卡片 + SECTION-3 模块关系图（setmeal 表） |
| SetmealDish | setmeal_dish（表名未明，推断） | sky-pojo/src/main/java/com/sky/entity/SetmealDish.java | SECTION-3 sky-pojo 模块卡片（对应 SetmealDishMapper） |
| ShoppingCart | shopping_cart | sky-pojo/src/main/java/com/sky/entity/ShoppingCart.java | SECTION-3 sky-pojo 模块卡片 + SECTION-5 节点 4（shopping_cart 表） |
| User | user | sky-pojo/src/main/java/com/sky/entity/User.java | SECTION-3 sky-pojo 模块卡片 + SECTION-3 模块关系图（user 表） |

### 6.2 字段详情（逐实体一张表）

> 字段类型在 SECTION-1~5 中均未明确出现（无 SQL schema、未读 entity 源码），统一标注"(类型未明)"——禁止编造类型。下游 AI 如需准确类型，请读取 `sky-pojo/entity/*.java` 或 `mapper/*.xml`。

##### 字段表：Orders（对应表：orders）—— 唯一有字段来源的实体（来自 SECTION-5 下单链路）

| 字段名 | 类型 | 敏感标注 | 备注/约定 |
|---|---|---|---|
| id | (类型未明) | | 主键，自增（SECTION-5 节点 2/3：MyBatis `useGeneratedKeys` 回写自增 id） |
| number | (类型未明) | | 订单号，代码用 `String.valueOf(System.currentTimeMillis())` 生成（SECTION-5 节点 2） |
| status | (类型未明) | | 订单状态，下单时置 `Orders.PENDING_PAYMENT`(待付款)（SECTION-5 节点 2） |
| payStatus | (类型未明) | | 支付状态，下单时置 `Orders.UN_PAID`(未支付)（SECTION-5 节点 2） |
| orderTime | (类型未明) | | 下单时间 `LocalDateTime.now()`（SECTION-5 节点 2） |
| userId | (类型未明) | | 下单用户 id，来自 `BaseContext`（SECTION-5 调用链） |
| addressBookId | (类型未明) | | 收货地址 id，由 `OrdersSubmitDTO` 通过 `BeanUtils.copyProperties` 拷入（SECTION-5 调用链/节点 2） |
| payMethod | (类型未明) | | 支付方式，来自 `OrdersSubmitDTO`（SECTION-5 调用链） |
| remark | (类型未明) | | 备注，来自 `OrdersSubmitDTO`（SECTION-5 调用链） |
| （收货人/电话/地址快照字段） | (类型未明) | 🔐 手机号 / 🔐 地址 | 下单时从 `address_book` 拷贝的收货信息快照（SECTION-5 节点 2 "补齐快照字段：收货人/电话/地址"）——具体字段名未在 SECTION-1~5 中出现，需读源码 |

> 公共字段约定（适用于本项目大部分实体，来源 SECTION-3 aspect 卡片）：`create_time` / `update_time` / `create_user` / `update_user` 由 AOP 切面 `AutoFillAspect` 在 insert/update 时自动填充，通常映射为 Java 端 `createTime` / `updateTime` / `createUser` / `updateUser`（下划线→驼峰自动映射，见 SECTION-7 7.3）。这些字段的具体存在与类型未在 SECTION-1~5 逐实体确认，需读源码。

##### 其余 10 个实体（AddressBook / Category / Dish / DishFlavor / Employee / OrderDetail / Setmeal / SetmealDish / ShoppingCart / User）

**无数据库 Schema 信息，字段细节需读取源码**（`sky-pojo/entity/*.java` 或 `mapper/*.xml`）。SECTION-1~5 未列出这些实体的字段清单。

基于 SECTION-1~3 的间接证据，可提示以下实体**很可能含敏感字段**（供下游漏洞扫描重点关注，但字段名未在 SECTION-1~5 确证，属推断）：
- **Employee** 🔐：sky-common 存在 `PasswordConstant`、sky-pojo 存在 `PasswordEditDTO`，且有 `LoginFailedException`/`PasswordErrorException`/`AccountLockedException`——强烈提示 Employee 含密码字段（加密方式未在 SECTION-1~5 出现，见 SECTION-7 7.2）。
- **User** 🔐：C 端为微信登录（`UserController`=微信登录，换取 openid），User 很可能含 openid / 手机号等字段（推断）。
- **AddressBook** 🔐：收货地址簿，很可能含收货人电话、详细地址等字段（推断，与 Orders 收货快照字段对应）。

### 6.3 请求/响应类清单（DTO / Request / VO）

> 用途列基于 SECTION-3 sky-pojo 卡片对 dto/vo 的描述与命名推断；关键字段列仅在 SECTION-1~5 明确暴露时填写，否则写"(未在 SECTION-1~5 中明确出现)"。

| 类名 | 文件路径 | 用途（推断/已知） | 关键字段（如已知） | 来源章节 |
|---|---|---|---|---|
| CategoryDTO | sky-pojo/src/main/java/com/sky/dto/CategoryDTO.java | 分类新增/修改请求体（推断） | (未在 SECTION-1~5 中明确出现) | SECTION-3 sky-pojo 卡片 |
| CategoryPageQueryDTO | sky-pojo/src/main/java/com/sky/dto/CategoryPageQueryDTO.java | 分类分页查询条件（推断） | (未在 SECTION-1~5 中明确出现) | SECTION-3 sky-pojo 卡片 |
| DataOverViewQueryDTO | sky-pojo/src/main/java/com/sky/dto/DataOverViewQueryDTO.java | 数据概览查询条件（推断，报表/工作台用） | (未在 SECTION-1~5 中明确出现) | SECTION-3 sky-pojo 卡片 |
| DishDTO | sky-pojo/src/main/java/com/sky/dto/DishDTO.java | 菜品新增/修改请求体（推断，含口味） | (未在 SECTION-1~5 中明确出现) | SECTION-3 sky-pojo 卡片 |
| DishPageQueryDTO | sky-pojo/src/main/java/com/sky/dto/DishPageQueryDTO.java | 菜品分页查询条件（推断） | (未在 SECTION-1~5 中明确出现) | SECTION-3 sky-pojo 卡片 |
| EmployeeDTO | sky-pojo/src/main/java/com/sky/dto/EmployeeDTO.java | 员工新增/修改请求体（推断） | (未在 SECTION-1~5 中明确出现) | SECTION-3 sky-pojo 卡片 |
| EmployeeLoginDTO | sky-pojo/src/main/java/com/sky/dto/EmployeeLoginDTO.java | 员工登录请求体（推断，SECTION-3 提到员工登录） | (未在 SECTION-1~5 中明确出现，推断含用户名/密码) | SECTION-3 sky-pojo 卡片 |
| EmployeePageQueryDTO | sky-pojo/src/main/java/com/sky/dto/EmployeePageQueryDTO.java | 员工分页查询条件（推断，SECTION-1 提到员工分页查询） | (未在 SECTION-1~5 中明确出现) | SECTION-3 sky-pojo 卡片 |
| GoodsSalesDTO | sky-pojo/src/main/java/com/sky/dto/GoodsSalesDTO.java | 商品销量数据（推断，销量 Top10 报表用） | (未在 SECTION-1~5 中明确出现) | SECTION-3 sky-pojo 卡片 |
| OrdersCancelDTO | sky-pojo/src/main/java/com/sky/dto/OrdersCancelDTO.java | 订单取消请求体（推断） | (未在 SECTION-1~5 中明确出现) | SECTION-3 sky-pojo 卡片 |
| OrdersConfirmDTO | sky-pojo/src/main/java/com/sky/dto/OrdersConfirmDTO.java | 订单确认(接单)请求体（推断） | (未在 SECTION-1~5 中明确出现) | SECTION-3 sky-pojo 卡片 |
| OrdersDTO | sky-pojo/src/main/java/com/sky/dto/OrdersDTO.java | 订单数据传输对象（推断） | (未在 SECTION-1~5 中明确出现) | SECTION-3 sky-pojo 卡片 |
| OrdersPageQueryDTO | sky-pojo/src/main/java/com/sky/dto/OrdersPageQueryDTO.java | 订单分页查询条件（推断） | (未在 SECTION-1~5 中明确出现) | SECTION-3 sky-pojo 卡片 |
| OrdersPaymentDTO | sky-pojo/src/main/java/com/sky/dto/OrdersPaymentDTO.java | 订单支付请求体（推断） | (未在 SECTION-1~5 中明确出现) | SECTION-3 sky-pojo 卡片 |
| OrdersRejectionDTO | sky-pojo/src/main/java/com/sky/dto/OrdersRejectionDTO.java | 订单拒单请求体（推断） | (未在 SECTION-1~5 中明确出现) | SECTION-3 sky-pojo 卡片 |
| OrdersSubmitDTO | sky-pojo/src/main/java/com/sky/dto/OrdersSubmitDTO.java | **用户下单请求体（已知）** | addressBookId、payMethod、remark、预估金额等（SECTION-5 调用链/节点 2） | SECTION-3 sky-pojo 卡片 + SECTION-5 调用链/节点 2 |
| PasswordEditDTO | sky-pojo/src/main/java/com/sky/dto/PasswordEditDTO.java | 修改密码请求体（推断，含旧/新密码） | (未在 SECTION-1~5 中明确出现，推断含旧密码/新密码) | SECTION-3 sky-pojo 卡片 |
| SetmealDTO | sky-pojo/src/main/java/com/sky/dto/SetmealDTO.java | 套餐新增/修改请求体（推断） | (未在 SECTION-1~5 中明确出现) | SECTION-3 sky-pojo 卡片 |
| SetmealPageQueryDTO | sky-pojo/src/main/java/com/sky/dto/SetmealPageQueryDTO.java | 套餐分页查询条件（推断） | (未在 SECTION-1~5 中明确出现) | SECTION-3 sky-pojo 卡片 |
| ShoppingCartDTO | sky-pojo/src/main/java/com/sky/dto/ShoppingCartDTO.java | 购物车增删请求体（推断） | (未在 SECTION-1~5 中明确出现) | SECTION-3 sky-pojo 卡片 |
| UserLoginDTO | sky-pojo/src/main/java/com/sky/dto/UserLoginDTO.java | C 端微信登录请求体（推断，含微信 code） | (未在 SECTION-1~5 中明确出现，推断含 code) | SECTION-3 sky-pojo 卡片 |
| BusinessDataVO | sky-pojo/src/main/java/com/sky/vo/BusinessDataVO.java | 营业数据概览（推断，工作台） | (未在 SECTION-1~5 中明确出现) | SECTION-3 sky-pojo 卡片 |
| DishItemVO | sky-pojo/src/main/java/com/sky/vo/DishItemVO.java | 套餐内菜品项（推断） | (未在 SECTION-1~5 中明确出现) | SECTION-3 sky-pojo 卡片 |
| DishOverViewVO | sky-pojo/src/main/java/com/sky/vo/DishOverViewVO.java | 菜品总览（推断，工作台） | (未在 SECTION-1~5 中明确出现) | SECTION-3 sky-pojo 卡片 |
| DishVO | sky-pojo/src/main/java/com/sky/vo/DishVO.java | 菜品展示对象（推断，含口味） | (未在 SECTION-1~5 中明确出现) | SECTION-3 sky-pojo 卡片 |
| EmployeeLoginVO | sky-pojo/src/main/java/com/sky/vo/EmployeeLoginVO.java | **员工登录响应（已知：带 token）** | 含 token（SECTION-3 sky-pojo 卡片："`EmployeeLoginVO` 带 token"） | SECTION-3 sky-pojo 卡片 |
| OrderOverViewVO | sky-pojo/src/main/java/com/sky/vo/OrderOverViewVO.java | 订单总览（推断，工作台） | (未在 SECTION-1~5 中明确出现) | SECTION-3 sky-pojo 卡片 |
| OrderPaymentVO | sky-pojo/src/main/java/com/sky/vo/OrderPaymentVO.java | 订单支付响应（推断） | (未在 SECTION-1~5 中明确出现) | SECTION-3 sky-pojo 卡片 |
| OrderReportVO | sky-pojo/src/main/java/com/sky/vo/OrderReportVO.java | 订单报表（推断） | (未在 SECTION-1~5 中明确出现) | SECTION-3 sky-pojo 卡片 |
| OrderStatisticsVO | sky-pojo/src/main/java/com/sky/vo/OrderStatisticsVO.java | 订单统计（推断） | (未在 SECTION-1~5 中明确出现) | SECTION-3 sky-pojo 卡片 |
| OrderSubmitVO | sky-pojo/src/main/java/com/sky/vo/OrderSubmitVO.java | **用户下单响应（已知）** | id、orderNumber、orderAmount、orderTime（SECTION-5 调用链/节点 2） | SECTION-3 sky-pojo 卡片 + SECTION-5 调用链/节点 2 |
| OrderVO | sky-pojo/src/main/java/com/sky/vo/OrderVO.java | 订单展示对象（推断） | (未在 SECTION-1~5 中明确出现) | SECTION-3 sky-pojo 卡片 |
| SalesTop10ReportVO | sky-pojo/src/main/java/com/sky/vo/SalesTop10ReportVO.java | 销量 Top10 报表（推断） | (未在 SECTION-1~5 中明确出现) | SECTION-3 sky-pojo 卡片 |
| SetmealOverViewVO | sky-pojo/src/main/java/com/sky/vo/SetmealOverViewVO.java | 套餐总览（推断，工作台） | (未在 SECTION-1~5 中明确出现) | SECTION-3 sky-pojo 卡片 |
| SetmealVO | sky-pojo/src/main/java/com/sky/vo/SetmealVO.java | 套餐展示对象（推断） | (未在 SECTION-1~5 中明确出现) | SECTION-3 sky-pojo 卡片 |
| TurnoverReportVO | sky-pojo/src/main/java/com/sky/vo/TurnoverReportVO.java | 营业额报表（推断，SECTION-3 提到报表类 vo） | (未在 SECTION-1~5 中明确出现) | SECTION-3 sky-pojo 卡片 |
| UserLoginVO | sky-pojo/src/main/java/com/sky/vo/UserLoginVO.java | C 端登录响应（推断，含 token/openid） | (未在 SECTION-1~5 中明确出现，推断带 token) | SECTION-3 sky-pojo 卡片 |
| UserReportVO | sky-pojo/src/main/java/com/sky/vo/UserReportVO.java | 用户统计报表（推断） | (未在 SECTION-1~5 中明确出现) | SECTION-3 sky-pojo 卡片 |

---

## SECTION-7: 项目约定与关键决策
> 派生章节。SOURCE: SECTION-1~5 的散落约定信息汇总

### 7.1 响应/异常约定

| 约定项 | 内容 | 来源 |
|---|---|---|
| 统一响应格式 | `Result<T>{code, msg, data}`，通过 `Result.success(...)` 构造成功响应；实际报文形如 `{code: 1, data: {...}, msg: null}`（code=1 表示成功） | SECTION-3 sky-common result 卡片 + SECTION-5 节点 1 + SECTION-5 调用链末尾 HTTP 200 |
| 分页响应格式 | `PageResult`（配合 PageHelper 物理分页） | SECTION-3 sky-common result 卡片 + SECTION-2 PageHelper |
| 全局异常拦截 | `GlobalExceptionHandler`（`@RestControllerAdvice`）统一捕获 controller 抛出的 `BaseException` 家族与框架异常，封装为统一 `Result` 错误响应 | SECTION-3 handler 卡片 |
| 业务异常体系 | 以 `BaseException` 为根，派生 11 个业务异常：`AccountLockedException`、`AccountNotFoundException`、`AddressBookBusinessException`、`DeletionNotAllowedException`、`LoginFailedException`、`OrderBusinessException`、`PasswordEditFailedException`、`PasswordErrorException`、`SetmealEnableFailedException`、`ShoppingCartBusinessException`、`UserNotLoginException` | SECTION-3 sky-common exception 清单 + SECTION-5（下单抛 `AddressBookBusinessException`/`OrderBusinessException`/`ShoppingCartBusinessException`） |
| 错误消息常量 | `MessageConstant` 集中定义错误提示文案 | SECTION-3 sky-common constant 卡片 + handler 卡片 |

### 7.2 安全相关约定 ⚠️

> 说明：SECTION-1~5 未出现任何密码加密实现关键词（无 `MD5`/`SHA1`/`DigestUtils`/固定盐/明文密码/`synchronized`/`intern()`/`Thread.sleep`/SQL 拼接），因此下表**不臆造**加密类风险；仅列出 SECTION-1~5 中**确有依据**的安全约定与风险。密码加密方式等需下游读源码确认。

| 约定项 | 内容 | 安全风险 | 来源 |
|---|---|---|---|
| 登录态管理 | JWT（jjwt 0.9.1）+ 自实现拦截器（`JwtTokenAdminInterceptor` / `JwtTokenUserInterceptor`），**无** Spring Security/Shiro/Sa-Token 框架 | 🟡 中风险：无框架级 CSRF/会话防护，鉴权逻辑全靠自实现拦截器，易漏校验；jjwt 0.9.1 版本较老，建议核对已知 CVE | SECTION-2 安全与认证 + SECTION-3 interceptor 卡片 |
| JWT 签名密钥硬编码 | `admin-secret-key: itcast`、`user-secret-key: itheima` 明文写死在 `application.yml`（未随 profile 外置） | 🟡 中风险：密钥进入版本库且为弱值/可猜词，泄露后可伪造任意用户 token；生产应外置为环境变量/配置中心并使用强随机密钥 | SECTION-4 关键配置项（sky.jwt.*） |
| JWT 过期时间 | 管理端与 C 端均 `7200000` ms（2 小时） | 🟢 低风险：符合常规配置 | SECTION-4 关键配置项 |
| 数据库密码明文 | `application-dev.yml` 明文存储 `sky.datasource.password: 123456` | 🟡 中风险：凭证明文入库；生产应使用环境变量/配置中心 | SECTION-4 dev 配置覆盖 |
| 第三方凭证明文 | 阿里云 OSS `access-key-secret`、微信 `secret`/`apiV3Key`/`mchSerialNo` 等均明文写死在 `application-dev.yml` | 🟡 中风险：AccessKey Secret / 支付密钥泄露风险高，明文入库不应用于生产 | SECTION-4 dev 配置覆盖 |
| 支付证书本地绝对路径 | `privateKeyFilePath: D:\apiclient_key.pem`、`weChatPayCertFilePath: D:\wechatpay_...pem` 写死本地绝对路径 | 🟡 中风险：部署强耦合本机路径，换机/容器化即失效，且证书管理不规范 | SECTION-4 dev 配置覆盖 + 启动顺序补充 |
| 密码加密方式 | SECTION-1~5 未出现具体加密实现；sky-common 有 `PasswordConstant`，sky-pojo 有 `PasswordEditDTO`，提示存在密码处理逻辑 | ⚪ 未知（待确认）：加密算法/盐策略需下游读 `EmployeeServiceImpl` 与 `PasswordConstant` 源码确认，本文件不臆断 | SECTION-3 sky-common constant + sky-pojo dto 卡片 |

### 7.3 数据约定

| 约定项 | 内容 | 来源 |
|---|---|---|
| ORM 框架 | **原生 MyBatis**（非 MyBatis-Plus）+ XML 映射文件（`resources/mapper/*.xml`）+ PageHelper 物理分页；Mapper 接口自带 `@Mapper` 注解 | SECTION-2 数据层 + SECTION-4 mybatis.mapper-locations + SECTION-5 节点 3 |
| 下划线↔驼峰映射 | `mybatis.configuration.map-underscore-to-camel-case: true` —— 数据库下划线命名（如 `create_time`）自动映射到 Java 驼峰（`createTime`） | SECTION-4 关键配置项 |
| 实体别名包 | `mybatis.type-aliases-package: com.sky.entity`（指向 sky-pojo 的 entity 包） | SECTION-4 关键配置项 |
| 主键策略 | 自增主键（SECTION-5 节点 3：`orders` 表 INSERT 后经 MyBatis `useGeneratedKeys` 回写自增 `id`） | SECTION-5 节点 2/3 |
| 公共字段自动填充 | `create_time` / `update_time` / `create_user` / `update_user` 由 AOP 切面 `AutoFillAspect` + `@AutoFill` 注解在 insert/update 时统一填充，区分 INSERT/UPDATE 由 `OperationType` 枚举控制，当前用户 id 取自 `BaseContext` | SECTION-3 aspect + annotation 卡片 |
| 事务边界 | 启动类 `@EnableTransactionManagement` 已开启，Service 层可用 `@Transactional`；**但** `OrderServiceImpl.submitOrder` 类上/方法上**未标注** `@Transactional`，下单的多次写操作（orders/order_detail/购物车删除）不在同一事务内，中途失败可能产生脏数据（实现瑕疵） | SECTION-3 启动类注解分析 + SECTION-5 完整调用链事务性说明 + 节点 2 |
| 逻辑删除 | SECTION-1~5 **未发现**逻辑删除字段或配置（本项目为原生 MyBatis，无 mybatis-plus logic-delete 配置）；是否存在逻辑删除需读源码/表结构确认 | SECTION-4（无相关配置） |

### 7.4 URL 与接口约定

| 约定项 | 内容 | 来源 |
|---|---|---|
| 完整 URL 拼接公式 | `context-path（无） + 类级 @RequestMapping + 方法级 @PostMapping/@GetMapping/etc.` | SECTION-5 调用链顶部路径来源说明 |
| 全局 URL 前缀 | **无前缀**（未配置 `server.servlet.context-path`） | SECTION-4 对外入口 |
| 双端鉴权分离 | `/admin/**` 由 `JwtTokenAdminInterceptor` 鉴权（token 头名 `token`，密钥 `itcast`）；`/user/**` 由 `JwtTokenUserInterceptor` 鉴权（token 头名 `authentication`，密钥 `itheima`） | SECTION-4 API 路径概览说明 + 关键配置项 |
| 同名 Controller 区分 | admin 与 user 包下存在多个同名 Controller（如两个 `OrderController`），靠 `/admin`、`/user` 路径前缀 + 显式 Bean 名区分（如 `@RestController("userOrderController")`） | SECTION-4 API 路径概览说明 + SECTION-5 节点 1 |
| 请求体反序列化 | 使用 `@RequestBody` 从 JSON 反序列化为 DTO | SECTION-5 节点 1 关键代码片段 |
| 已知具体 URL 锚点 | `POST /user/order/submit`（C 端下单，来自核心业务调用链） | SECTION-5 调用链 |
| 推断的 URL 前缀清单 | 见 SECTION-4 "API 路径概览"表（均标注"（推断）"） | SECTION-4 |
| 支付回调入口 | `notify/PayNotifyController`（供微信支付服务器 POST 异步通知，非前端调用） | SECTION-3 controller 卡片 + SECTION-4 API 路径概览 |
| WebSocket 端点 | `ws://localhost:8080/ws/{sid}`（推断，来单/催单实时推送到管理端，非 REST） | SECTION-4 对外入口/API 路径概览 |

### 7.5 构建/部署约定

| 约定项 | 内容 | 来源 |
|---|---|---|
| 构建工具 | Maven（聚合工程，版本由 `spring-boot-starter-parent:2.7.3` 统一管理；无 Maven Wrapper） | SECTION-1 构建与部署 |
| JDK 版本 | 见 META `java_version` 字段（SECTION-1~5 未明确，建议读 pom.xml 确认） | SECTION-1 / SECTION-2 |
| 容器化方式 | **无 Docker**（全项目无 Dockerfile/docker-compose），推测直接 `java -jar` 部署由 `sky-server` 打成的 fat jar | SECTION-1 构建与部署 |
| Profile 激活 | `spring.profiles.active: dev` 写死在 `application.yml`；仅 dev 一个环境，无 prod/test | SECTION-4 关键配置项 + 环境差异对比 |
| 配置文件机制 | **占位符 + 填值**：`application.yml` 用 `${sky.*}` 占位，`application-dev.yml` 提供实际值，两份文件必须同时存在才能拼出完整配置 | SECTION-4 关键机制说明 |
| 循环依赖开关 | `spring.main.allow-circular-references: true` 显式开启（Spring Boot 2.6+ 默认禁止）——说明项目存在 Bean 循环依赖 | SECTION-4 关键配置项 |
| 环境差异 | 见 SECTION-4 "环境差异对比"表（仅 dev，敏感凭证明文写死，未做多环境隔离） | SECTION-4 |

### 7.6 启动能力清单（从启动类 `SkyApplication` 注解推导）

**已开启的能力：**
| 注解 | 开启的能力 |
|---|---|
| `@SpringBootApplication` | 标准 Spring Boot 启动，组件扫描 `com.sky` 包及子包 |
| `@EnableTransactionManagement` | 声明式事务（`@Transactional`） |
| `@EnableCaching` | Spring Cache 缓存抽象（`@Cacheable`/`@CacheEvict`/`@CachePut`，后端大概率 Redis） |
| `@EnableScheduling` | 定时任务调度（`@Scheduled`，对应 task 包 OrderTask/WebSocketTask/MyTask） |
| `@Slf4j` | Lombok 日志门面（启动类内直接用 `log`） |

**未开启的能力（用于下游 AI 排除可能性）：**
- ❌ 无 `@EnableDiscoveryClient` / `@EnableEurekaClient` / `@EnableNacosDiscovery` → 不是微服务，未注册到注册中心
- ❌ 无 `@EnableFeignClients` → 无远程 RPC，模块间为进程内方法调用
- ❌ 无 `@EnableCircuitBreaker` / `@EnableHystrix` → 无熔断降级
- ❌ 无 `@MapperScan(...)` 标注在启动类上 → Mapper 扫描靠各接口自带 `@Mapper` 注解（SECTION-5 节点 3 已确认 `@Mapper`）
- ❌ 无 `@EnableAsync` → 无注解式异步方法（`@Async`），异步能力靠定时任务 + WebSocket
- ❌ 无 `@ServletComponentScan` → 未扫描原生 Servlet/Filter，拦截器走 `WebMvcConfiguration`