# PROJECT_S3_MODULES — 模块职责分析

> 项目名称：sky-take-out（苍穹外卖）
> 项目类型：多模块单体应用（Multi-module Monolith）
> spring.application.name：**未设置**（`application.yml` 中无该字段；单体项目只有一个运行进程，无需服务名做注册/发现）
> 启动类：`com.sky.SkyApplication`，路径 `sky-server/src/main/java/com/sky/SkyApplication.java`
> 基础包路径：三个模块统一使用 `src/main/java/com/sky/`

---

## 启动类注解分析

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

## 模块卡片

> 说明：本项目是"多模块单体"，存在**两个粒度**的"模块"：
> - **粗粒度**：3 个 Maven 子模块（`sky-common` / `sky-pojo` / `sky-server`）——见 Part A。
> - **细粒度**：`sky-server` 内部的分层业务包（controller / service / mapper / ...）——这才是真正的分层架构所在，见 Part B。
> 两个粒度都出卡片，才能既反映"打包结构"又反映"业务分层"。

---

### Part A：Maven 子模块卡片（3 张）

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

### Part B：sky-server 内部分层业务包卡片

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

## 依赖矩阵

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

## 模块关系图

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

## 模块关系类比

把这套系统想象成一支正在打团的**英雄联盟战队**（LOL team），每个模块对应一个明确分工的角色：

- **interceptor（JWT 拦截器）= 出生点的门禁/买装备检查**：你想上路参战，得先证明"你是这一方的、买了合法装备"。令牌不对直接挡在泉水里，不让进战场。
- **controller = 上单/中单/ADC 等台前输出位**：直接面对"敌方英雄"（前端请求），接收指令、把活儿派下去、把结果打出来。admin 和 user 就像两条不同的路（分别面对管理端和顾客端两拨敌人）。
- **service = 打野**：真正做决策、串联全场的核心。什么时候 gank、先打哪条龙（先写哪张表、要不要开事务）、多个资源怎么协调，都是它编排的。它自己不直接"补刀"（不碰数据库），而是指挥 mapper 去做。
- **mapper = 补兵/清野的执行手 + 兵线（MySQL）**：真正把"钱"（数据）从野怪和小兵身上拿到手，只跟"经济来源"（数据库）打交道。
- **aspect + annotation（AOP 自动填充）= 后台自动结算的助攻/经济分成系统**：你只要参与击杀（在方法上贴个 `@AutoFill`），系统自动帮你把"经济、时间戳、操作人"记好账，不用每个人手动算。
- **handler（全局异常）= 复活机制 / 团队播报**：任何位置"阵亡"（抛异常），不会让整局崩盘，而是统一播报一条清晰的死亡信息（统一错误 `Result`），队伍继续。
- **websocket = 语音/信号系统**：让"指挥部"（管理端）不用一直刷新也能实时收到"有新订单/催单"的信号，是主动推送而非被动查询。
- **task（定时任务）= 自动刷新的野怪/大龙计时器**：不需要有人下指令，到点自动触发（如"超时订单自动取消"），像野区资源到时间自动刷新。
- **config = 赛前 BP 与装备配置台**：开局前把 Redis、OSS、拦截器、接口文档、WebSocket 端点都装配好，队伍才能正常运转。
- **sky-pojo = 战队的数据面板/英雄属性表**：定义"一个英雄有哪些属性""一条战报包含哪些字段"，谁都照这张表读写，但它本身不参战。
- **sky-common = 团队共享的装备库与规则手册**：JWT 校验、图片上传、支付、统一返回、异常规范都放这儿，全队随时取用。

**类比与真实模块的对应关系**：这支"战队"最终是**一个整体出战、共用一套泉水和补给**（= 多模块单体，所有包打包进 `sky-server` 一个进程运行）；打野（service）指挥补兵手（mapper）去兵线（MySQL）拿经济，输出位（controller）在台前接敌，门禁（interceptor）在泉水口验身份，而属性表（sky-pojo）和装备库（sky-common）是全队共享的后勤——它们不单独"出装上分"，只被 `sky-server` 依赖。这与"微服务"——每个位置是一支独立战队、各自开一局、之间靠语音（网络 RPC）沟通——形成鲜明对照。
