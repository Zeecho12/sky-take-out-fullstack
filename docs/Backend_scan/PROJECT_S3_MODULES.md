# PROJECT_S3_MODULES — 模块职责分析

> 项目名称：sky-take-out（苍穹外卖）
> 项目类型：多模块单体（Multi-Module Monolith）—— Maven 聚合工程，仅 `sky-server` 可运行
> spring.application.name：未声明（`application.yml` 中只设置了 `server.port: 8080`，无 `spring.application.name` 字段）
> 启动类：`com.sky.SkyApplication`（`D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\SkyApplication.java`）
> 基础包路径：三个子模块统一使用 `com.sky`（即 `src/main/java/com/sky/`）

> 粒度说明（多模块单体双粒度）：
> - **Part A** 每个 Maven 子模块一张卡片（反映打包结构）：`sky-common` / `sky-pojo` / `sky-server`。
> - **Part B** 对唯一可运行子模块 `sky-server`，再按其内部顶层分层包各出一张卡片（反映真正的分层架构）。Part B 各包无独立启动类，统一借用主启动类 `SkyApplication`。

---

## 启动类注解分析

启动类 `com.sky.SkyApplication` 类声明上的全部注解（读取自文件头部，未读方法体）：

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
| `@SpringBootApplication` | Spring Boot 复合注解（= `@Configuration` + `@EnableAutoConfiguration` + `@ComponentScan`） | 标准启动类；开启自动配置，并以 `com.sky` 为根扫描组件（Controller / Service / Mapper / Config 等都被扫描注册） |
| `@EnableTransactionManagement` | 开启声明式事务管理（Declarative Transaction Management） | 让 `@Transactional` 注解生效，Service 层可用注解划定事务边界 |
| `@Slf4j` | Lombok 注解（非 Spring 能力） | 编译期生成 `log` 日志字段，供 `main` 方法打印启动日志 |
| `@EnableCaching` | 开启 Spring Cache 抽象（Caching Abstraction） | 让 `@Cacheable` / `@CacheEvict` 等缓存注解生效；结合 `RedisConfiguration`，缓存后端为 Redis |
| `@EnableScheduling` | 开启定时任务调度（Scheduled Task） | 让 `@Scheduled` 注解生效，`task` 包中的定时任务（如订单超时处理、WebSocket 心跳）得以运行 |

**未发现的注解（用于排除可能性）：**
- 没有 `@EnableDiscoveryClient` / `@EnableEurekaClient` / `@EnableNacosDiscovery` → 不注册到任何注册中心，印证这是**单体**而非微服务。
- 没有 `@EnableFeignClients` → 不通过 Feign 做远程 RPC 调用；跨系统交互（微信支付、阿里云 OSS）走的是普通 HTTP 客户端而非服务间 RPC。
- 没有 `@MapperScan(...)` 标注在启动类上 → Mapper 接口推断各自使用 `@Mapper` 注解被扫描（而非在启动类集中声明扫描包），本步未读方法体，仅作推断。
- 没有 `@EnableAsync` → 未开启 Spring 异步任务执行器（`@Async` 不生效）；有定时任务但无声明式异步。
- 没有 `@EnableCircuitBreaker` / `@EnableHystrix` → 无熔断降级，符合单体无远程依赖治理的定位。
- 没有 `@ServletComponentScan` → 未通过该注解扫描原生 Servlet 组件；WebSocket 端点由 `WebSocketConfiguration` 注册 `ServerEndpointExporter` 承载（推断）。

---

## 模块卡片

### Part A — Maven 子模块粒度（打包结构）

📦 模块：**sky-common**（路径：`D:\CQWM2\sky-take-out\sky-common\src\main\java\com\sky\`）

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

├── 职责：公共基础模块——提供跨层复用的通用工具类（JWT、阿里云 OSS、微信支付、HTTP 客户端）、统一返回结果封装（`Result` / `PageResult`）、自定义业务异常、常量、`@ConfigurationProperties` 配置属性绑定类、`ThreadLocal` 上下文（`BaseContext`）与 Jackson 序列化定制。
├── 启动类：没有（工具/基础模块，被 `sky-server` 依赖使用，不独立运行）。
├── 对外暴露：无 HTTP 入口，通过包间/模块间方法调用对外服务（供 `sky-server` 依赖调用）。
└── 依赖谁：不依赖任何内部模块——已 grep 确认 `sky-common` 下无 `import com.sky.entity/dto/vo`（0 处），故不依赖 `sky-pojo`；仅依赖第三方库（JWT、aliyun-sdk-oss、wechatpay、httpclient，依据 S1/S2 及 `utils/` `properties/` 目录内容推断）。

📦 模块：**sky-pojo**（路径：`D:\CQWM2\sky-take-out\sky-pojo\src\main\java\com\sky\`）

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
  - UserChangePasswordDTO.java
  - UserLoginDTO.java
  - UserRegisterDTO.java
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
  - UserReportVO.java
  - UserLoginVO.java

├── 职责：数据模型模块——纯数据对象定义。`entity/` 为与数据库表映射的实体（PO），`dto/` 为接收请求参数的数据传输对象（Data Transfer Object），`vo/` 为返回给前端的视图对象（View Object）。只描述数据形状，不含业务逻辑。
├── 启动类：没有（数据模型模块，被 `sky-server` 依赖使用，不独立运行）。
├── 对外暴露：无 HTTP 入口，通过包间/模块间方法调用对外服务（作为参数/返回类型被 `sky-server` 各层引用）。
└── 依赖谁：不依赖任何内部模块——已 grep 确认 `sky-pojo` 下无 `import com.sky.properties/utils/result/exception/...`（0 处），故不依赖 `sky-common`；仅依赖 Lombok 等第三方注解库（依据目录纯数据对象内容推断）。

📦 模块：**sky-server**（路径：`D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\`）

完整文件清单：
- SkyApplication.java（启动类，位于 `com.sky` 根包）
- annotation/
  - AutoFill.java
- aspect/
  - AutoFillAspect.java
- config/
  - OssConfiguration.java
  - RedisConfiguration.java
  - SecurityConfig.java
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
- security/
  - JwtAuthenticationFilter.java
  - LoginUser.java
  - UserDetailsServiceImpl.java
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

├── 职责：主服务/启动模块——唯一可运行、对外提供 HTTP 接口的部署单元。承载全部业务分层（Controller → Service → Mapper）、Spring Security JWT 认证、AOP 公共字段自动填充、全局异常处理、定时任务与 WebSocket 推送。
├── 启动类：有——`com.sky.SkyApplication`（`D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\SkyApplication.java`）。
├── 对外暴露：有 HTTP 入口。三大 Controller 分组：`controller/admin`（后台管理端，员工/分类/菜品/套餐/订单/报表/店铺/工作台/通用上传）、`controller/user`（C 端顾客，用户/分类/菜品/套餐/购物车/地址簿/订单/店铺）、`controller/notify`（`PayNotifyController` 支付回调）。另有 `websocket/WebSocketServer`（`@ServerEndpoint` WebSocket 长连接，推断）。详见 Part B `controller` 卡片。
└── 依赖谁：依赖 `sky-common`（`Result`/`PageResult`、`JwtUtil`/`AliOssUtil`/`WeChatPayUtil`、异常、常量、`BaseContext`、`@ConfigurationProperties`）与 `sky-pojo`（`entity`/`dto`/`vo` 作为各层参数与返回类型）——推断依据：`sky-server` 含 controller/service/mapper 业务代码，必然引用上述基础类型，且它是聚合工程中唯一装配业务的运行模块。不依赖其他内部模块（无第 4 个子模块）。

### Part B — sky-server 内部分层包粒度（分层架构）

> 以下各包均位于 `D:\CQWM2\sky-take-out\sky-server\src\main\java\com\sky\` 下；均无独立启动类，统一借用主启动类 `com.sky.SkyApplication`。

📦 包：**controller**（路径：`...\com\sky\controller\`）

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

├── 职责：HTTP 请求入口层（表现层）——接收前端请求、参数绑定校验、调用 Service、封装 `Result` 返回。按端拆三组：`admin`（后台管理端 API，路径推断 `/admin/**`）、`user`（C 端顾客 API，路径推断 `/user/**`）、`notify`（第三方支付异步回调入口）。
├── 启动类：借用主启动类，包本身无独立启动类。
├── 对外暴露：**是本单体的唯一 HTTP 入口**。暴露 API 大类：管理端有 员工(Employee)、分类(Category)、菜品(Dish)、套餐(Setmeal)、订单(Order)、报表(Report)、店铺(Shop)、工作台(WorkSpace)、通用上传(Common)；C 端有 用户(User)、分类、菜品、套餐、购物车(ShoppingCart)、地址簿(AddressBook)、订单、店铺；回调端有 支付通知(PayNotify)。
└── 依赖谁：依赖 `service`（向下调用业务接口，分层架构约定 + `service` 包并存推断）；使用 `sky-pojo` 的 `dto`/`vo` 接收与返回、`sky-common` 的 `Result`/`PageResult` 封装（推断依据：表现层标准职责）。请求进入前先经 `security` 的 JWT 过滤器鉴权（依据 `security/JwtAuthenticationFilter` 存在推断）。

📦 包：**service**（路径：`...\com\sky\service\`）

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

├── 职责：业务逻辑层——接口（`service/`）+ 实现（`service/impl/`）分离。承载核心业务规则（下单、支付、菜品/套餐管理、报表统计、工作台数据聚合等），并通过 `@Transactional`（由 `@EnableTransactionManagement` 支撑）管理事务边界。
├── 启动类：借用主启动类，包本身无独立启动类。
├── 对外暴露：无 HTTP 入口，通过包间方法调用对外服务（被 `controller`、`task` 调用）。
└── 依赖谁：依赖 `mapper`（数据持久化，`impl` 层标准职责 + `mapper` 包并存推断）；使用 `sky-pojo` 的 `entity`/`dto`/`vo`、`sky-common` 的工具类/异常/常量/`BaseContext`（推断依据：业务层需操作实体、抛业务异常、读线程上下文）；推断可能调用 `websocket/WebSocketServer` 推送来单提醒（依据 `websocket` 包存在 + 外卖场景，待 S5 核实）。

📦 包：**mapper**（路径：`...\com\sky\mapper\`）

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

├── 职责：数据访问层（持久层）——MyBatis Mapper 接口，与 `resources/mapper/*.xml`（同名 11 个 XML）配合，对 MySQL 各表执行 CRUD。
├── 启动类：借用主启动类，包本身无独立启动类。
├── 对外暴露：无 HTTP 入口，通过包间方法调用对外服务（被 `service` 调用）。
└── 依赖谁：向下依赖 **MySQL 数据库**（依据 `application.yml` `mybatis.mapper-locations` 指向 `classpath:mapper/*.xml`、Druid 数据源配置推断）；使用 `sky-pojo` 的 `entity` 作为映射对象；被 `aspect/AutoFillAspect` 通过 `@AutoFill` 注解拦截以自动填充公共字段（依据 `annotation/AutoFill` + `aspect` 存在推断）。不依赖其他内部业务包（持久层为最底层）。

📦 包：**config**（路径：`...\com\sky\config\`）

完整文件清单：
- OssConfiguration.java
- RedisConfiguration.java
- SecurityConfig.java
- WebMvcConfiguration.java
- WebSocketConfiguration.java

├── 职责：配置装配层——集中声明各类 `@Configuration` Bean：`SecurityConfig`（Spring Security 过滤器链、密码编码器、鉴权规则）、`WebMvcConfiguration`（MVC 消息转换器/静态资源/Swagger 等）、`RedisConfiguration`（RedisTemplate/缓存）、`OssConfiguration`（阿里云 OSS 工具 Bean）、`WebSocketConfiguration`（WebSocket 端点导出器）。
├── 启动类：借用主启动类，包本身无独立启动类。
├── 对外暴露：无 HTTP 入口，通过包间方法调用对外服务（以 `@Configuration` Bean 装配为全局提供基础设施能力）。
└── 依赖谁：`SecurityConfig` 依赖 `security` 包（装配 `JwtAuthenticationFilter`、`UserDetailsServiceImpl`，依据 Spring Security 装配约定推断）；`OssConfiguration`/`RedisConfiguration` 依赖 `sky-common` 的 `properties`（`AliOssProperties` 等）与外部 **Redis**（依据 `application.yml` redis 段推断）；`WebSocketConfiguration` 依赖 `websocket/WebSocketServer`（注册端点，依据包名推断）。

📦 包：**security**（路径：`...\com\sky\security\`）

完整文件清单：
- JwtAuthenticationFilter.java
- LoginUser.java
- UserDetailsServiceImpl.java

├── 职责：认证授权层——Spring Security 定制组件。`JwtAuthenticationFilter` 解析请求头 JWT 并放入 SecurityContext；`UserDetailsServiceImpl` 按用户名查库加载账号；`LoginUser` 为 `UserDetails` 实现（承载登录主体）。这是功能 0001「C 端认证改造」引入的统一 JWT 鉴权组件。
├── 启动类：借用主启动类，包本身无独立启动类。
├── 对外暴露：无 HTTP 入口，作为过滤器/组件嵌入 Security 过滤器链，对所有请求前置生效。
└── 依赖谁：依赖 `mapper`（`UserDetailsServiceImpl` 查 Employee/User 表加载账号，依据 UserDetailsService 标准职责推断）；依赖 `sky-common` 的 `JwtUtil`/`JwtProperties`/`JwtClaimsConstant`（解析/签发 JWT，依据 token 处理职责推断）；使用 `sky-pojo` 的 `Employee`/`User` 实体（推断）。由 `config/SecurityConfig` 装配进过滤器链。

📦 包：**aspect**（路径：`...\com\sky\aspect\`）

完整文件清单：
- AutoFillAspect.java

├── 职责：AOP 切面层——`AutoFillAspect` 拦截标注了 `@AutoFill` 的 Mapper 方法，在 insert/update 前自动填充 `createTime`/`updateTime`/`createUser`/`updateUser` 等公共字段，消除样板代码。
├── 启动类：借用主启动类，包本身无独立启动类。
├── 对外暴露：无 HTTP 入口，以切面形式横切增强 `mapper` 层方法。
└── 依赖谁：依赖 `annotation`（`@AutoFill` 作为切点标记，依据切面拦截自定义注解的模式推断）；依赖 `sky-common` 的 `BaseContext`（取当前登录用户 id）、`enumeration/OperationType`、`constant/AutoFillConstant`（依据自动填充职责推断）；横切目标为 `mapper` 包。

📦 包：**annotation**（路径：`...\com\sky\annotation\`）

完整文件清单：
- AutoFill.java

├── 职责：自定义注解定义——`@AutoFill` 标记「需自动填充公共字段」的 Mapper 方法，供 `aspect/AutoFillAspect` 识别切点。
├── 启动类：借用主启动类，包本身无独立启动类。
├── 对外暴露：无 HTTP 入口，作为元数据被 AOP 切面消费。
└── 依赖谁：依赖 `sky-common` 的 `enumeration/OperationType`（注解属性通常用其标识 INSERT/UPDATE 操作类型，依据自动填充配套模式推断）。不依赖其他内部业务包。

📦 包：**handler**（路径：`...\com\sky\handler\`）

完整文件清单：
- GlobalExceptionHandler.java

├── 职责：全局异常处理层——`@RestControllerAdvice` 统一捕获 Controller/Service 抛出的异常（尤其 `sky-common` 的自定义业务异常），转换为规范化的 `Result` 错误响应，避免异常直接暴露给前端。
├── 启动类：借用主启动类，包本身无独立启动类。
├── 对外暴露：无 HTTP 入口，以全局 advice 形式横切所有 Controller 的异常出口。
└── 依赖谁：依赖 `sky-common` 的 `exception`（捕获 `BaseException` 及其子类）与 `result/Result`（封装错误响应）（推断依据：全局异常处理标准职责）。横切目标为 `controller` 层。

📦 包：**task**（路径：`...\com\sky\task\`）

完整文件清单：
- MyTask.java
- OrderTask.java
- WebSocketTask.java

├── 职责：定时任务层——由 `@EnableScheduling` 驱动的 `@Scheduled` 任务。`OrderTask` 处理超时未支付/派送中订单的状态流转，`WebSocketTask` 维持 WebSocket 心跳，`MyTask` 为示例任务。
├── 启动类：借用主启动类，包本身无独立启动类。
├── 对外暴露：无 HTTP 入口，由 Spring 调度器按 cron 周期触发。
└── 依赖谁：`OrderTask` 依赖 `mapper`/`service`（扫描并更新订单，依据订单超时处理场景推断）；`WebSocketTask` 依赖 `websocket/WebSocketServer`（推送心跳，依据命名推断）；依赖 `sky-common`/`sky-pojo` 的常量与实体（推断）。

📦 包：**websocket**（路径：`...\com\sky\websocket\`）

完整文件清单：
- WebSocketServer.java

├── 职责：WebSocket 推送层——`WebSocketServer`（`@ServerEndpoint`，推断）维护与前端的长连接会话，向管理端推送「来单提醒 / 客户催单」等实时消息。
├── 启动类：借用主启动类，包本身无独立启动类。
├── 对外暴露：WebSocket 端点（长连接，非普通 HTTP REST），由 `config/WebSocketConfiguration` 注册对外可连。
└── 依赖谁：不主动依赖其他内部业务包（作为被调用的推送出口，属叶子节点）；被 `service`（下单成功推送）、`task/WebSocketTask`（心跳）、`config/WebSocketConfiguration`（注册端点）调用（依据外卖来单提醒场景与包并存推断）。向外连接 **前端 WebSocket 客户端**。

---

## 依赖矩阵

> 「被谁依赖」由各卡片「依赖谁」字段反向汇总，未引入新推断。

### Part A — Maven 子模块

| 模块 | 依赖的下游 | 被哪些上游依赖 |
|---|---|---|
| sky-server | sky-common, sky-pojo, MySQL, Redis, 阿里云 OSS, 微信支付, 前端 WebSocket 客户端 | （无，是唯一可运行入口模块） |
| sky-common | （无内部模块，仅第三方库） | sky-server |
| sky-pojo | （无内部模块，仅第三方库） | sky-server |

### Part B — sky-server 内部分层包

| 包 | 依赖的下游 | 被哪些上游依赖 |
|---|---|---|
| controller | service, security(前置鉴权), sky-pojo(dto/vo), sky-common(Result) | （无，是外部 HTTP 请求入口） |
| service | mapper, websocket(推断), sky-pojo(entity/dto/vo), sky-common(utils/异常/常量/context) | controller, task |
| mapper | MySQL, sky-pojo(entity) | service, security, task；被 aspect 横切增强 |
| config | security, websocket, sky-common(properties), Redis | （无，装配基础设施 Bean） |
| security | mapper, sky-common(JwtUtil/JwtProperties), sky-pojo(Employee/User) | config(装配), controller(前置生效) |
| aspect | annotation, mapper(横切目标), sky-common(BaseContext/OperationType/AutoFillConstant) | （无，AOP 自动织入） |
| annotation | sky-common(enumeration/OperationType) | aspect |
| handler | sky-common(exception/Result) | （无，全局 advice 自动生效，横切 controller） |
| task | mapper, service, websocket, sky-common/sky-pojo | （无，由调度器触发） |
| websocket | 前端 WebSocket 客户端 | config(注册), service(推送), task(心跳) |

---

## 模块关系图

[外部请求 / 浏览器 / 管理端与 C 端前端 / 微信支付回调]
  │
  ▼
[security：JwtAuthenticationFilter]  ── 职责：进入业务前解析 JWT、鉴权（/admin/** = ADMIN，/user/** = USER）
  │  （由 config/SecurityConfig 装配进过滤器链）
  ▼
[controller：admin / user / notify]  ── 职责：唯一 HTTP 入口，参数校验、调 Service、封装 Result
  │
  ├──▶ [service（+impl）]  ── 职责：核心业务逻辑，@Transactional 事务边界
  │         │
  │         ├──▶ [mapper]  ── 职责：MyBatis 持久层，配合 resources/mapper/*.xml
  │         │        │
  │         │        └──▶ [MySQL：员工/分类/菜品/套餐/订单/购物车/地址簿/用户 等表]
  │         │        ▲
  │         │        └── [aspect/AutoFillAspect] 借 @AutoFill(annotation) 横切增强，自动填充公共字段
  │         │
  │         └──▶ [websocket/WebSocketServer]  ── 职责：来单提醒 / 催单 实时推送 ──▶ [前端 WebSocket 客户端]
  │
  └──▶ [handler/GlobalExceptionHandler]  ── 职责：@RestControllerAdvice 统一捕获异常 → Result 错误响应

[task（OrderTask / WebSocketTask / MyTask）]  ── 职责：@EnableScheduling 定时驱动
  │
  ├──▶ [service / mapper]  ── 订单超时状态流转
  └──▶ [websocket/WebSocketServer]  ── WebSocket 心跳

[config：Security / WebMvc / Redis / Oss / WebSocket]  ── 职责：装配基础设施 Bean
  │
  ├──▶ [Redis]  ── @EnableCaching 缓存后端
  └──▶ [阿里云 OSS]  ── 图片文件上传（借 sky-common/AliOssUtil）

跨层基础模块（被上述各层普遍引用，非某一层专属）：
  [sky-common]  ── Result/PageResult、JwtUtil/AliOssUtil/WeChatPayUtil、异常、常量、BaseContext、@ConfigurationProperties
  [sky-pojo]    ── entity（表映射）/ dto（入参）/ vo（出参）

---

## 模块关系类比

把 `sky-server` 想象成一家**正在营业的外卖餐厅**，各分层包就是店里不同岗位：

- **security（门口保安 + 前台验证）**：客人（请求）进店前先在门口出示会员卡（JWT），保安核验身份、判断你是「后厨管理员」还是「普通食客」，无卡或假卡直接挡在门外（401/403）。
- **controller（点餐前台/服务员）**：验证通过后，服务员接单，把你的口头需求（HTTP 参数）记成标准工单，转交后厨，做好后端菜上桌（返回 Result）。前台按客群分区——`admin` 是店内管理窗口、`user` 是顾客点餐台、`notify` 是专收支付平台电话回执的分机。
- **service（后厨主厨/impl 是实际掌勺）**：真正做菜的地方，掌握所有配方与火候（业务规则），一道套餐涉及多步操作时用「一锅出」保证要么全成要么全废（`@Transactional` 事务）。
- **mapper（仓库管理员）**：主厨要食材就找仓管，仓管去冷库（MySQL）按单取货/入库；`aspect` 像仓库门口的**自动打标机**，每次进出库自动盖上时间和经手人（公共字段自动填充），仓管不用手写。
- **websocket（店内广播/传菜铃）**：来新订单时「叮——」实时响铃提醒后厨（推送），不用后厨反复跑出来问前台有没有新单。
- **task（定时巡店的店长助理）**：每隔一段时间自查——超时没付款的单作废、派送太久的单标记异常（`@Scheduled`）。
- **handler（危机公关）**：任何岗位出岔子（抛异常），公关统一对外话术，把「后厨着火了」翻译成客人能看懂的「该菜品暂时售罄」（`Result` 错误响应），不让内部混乱吓到客人。
- **config（店铺装修与水电工）**：开业前把保安制度、传菜通道、冷库电路、广播系统都接好通电（装配各 Bean）。

**类比与真实模块的对应关系**：
- 门口保安=`security`，点餐前台=`controller`，后厨主厨=`service`(+`impl`)，仓管=`mapper`、自动打标机=`aspect`(+`annotation`)，传菜铃=`websocket`，巡店助理=`task`，危机公关=`handler`，装修水电=`config`。
- 而 Part A 的三个 Maven 子模块是「餐厅的组织结构」：`sky-server` 是这家**真正开火营业的门店**（唯一可运行），`sky-common` 是**公共工具间**（刀具、量杯、统一话术——工具类/异常/返回封装），`sky-pojo` 是**标准餐盒与菜单模板**（规定订单和菜品长什么样——entity/dto/vo）。两个基础模块自己不营业，只被门店取用；这正是「多模块单体=同一家店、一次开张，内部按公共工具/数据模板/主业务分三个部门」的关键特征。
