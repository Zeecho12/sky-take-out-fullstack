# PROJECT_S3_MODULES — 模块职责分析

> 项目名称：user-center-backend（用户中心后端）
> 项目类型：单体应用（Monolith）
> spring.application.name：未在 application.yml 中找到该字段（搜索无匹配结果）
> 启动类：com.yupi.usercenter.UserCenterApplication（src/main/java/com/yupi/usercenter/UserCenterApplication.java）
> 基础包路径：src/main/java/com/yupi/usercenter/

---

## 启动类注解分析

| 注解 | 含义 | 开启的能力 |
|---|---|---|
| @SpringBootApplication | Spring Boot 的"三合一"复合注解，包含 @SpringBootConfiguration + @EnableAutoConfiguration + @ComponentScan | 标准 Spring Boot 启动类，开启自动配置，自动扫描 `com.yupi.usercenter` 包及所有子包中的组件 |
| @MapperScan("com.yupi.usercenter.mapper") | MyBatis/MyBatis-Plus 的 Mapper 扫描注解 | 启动时自动扫描 `mapper` 包下的所有 Mapper 接口，为它们创建代理实现类并注册到 Spring 容器 |

**未发现的注解（用于排除可能性）：**
- 没有 `@EnableDiscoveryClient` → 不是微服务，未注册到注册中心（Service Registry）
- 没有 `@EnableFeignClients` → 不依赖远程 RPC（Remote Procedure Call）调用
- 没有 `@EnableCircuitBreaker` / `@EnableSentinel` → 没有熔断降级（Circuit Breaker）能力
- 没有 `@EnableScheduling` → 没有定时任务（Scheduled Task）
- 没有 `@EnableCaching` → 没有开启声明式缓存（Declarative Caching）
- 没有 `@EnableAsync` → 没有开启异步方法（Async Method）支持

---

## 模块卡片

📦 模块：common（路径：src/main/java/com/yupi/usercenter/common/）

完整文件清单：
- BaseResponse.java
- ErrorCode.java
- ResultUtils.java

├── 职责：提供全局通用的响应封装（Unified Response）——统一返回对象 `BaseResponse`、错误码枚举 `ErrorCode`、响应工具类 `ResultUtils`  
├── 启动类：没有  
├── 对外暴露：无 HTTP 入口，通过包间方法调用对外服务  
└── 依赖谁：无外部依赖（根据包名和文件名推断，该包为底层工具包，不依赖其他业务包）  

---

📦 模块：contant（路径：src/main/java/com/yupi/usercenter/contant/）

完整文件清单：
- UserConstant.java

├── 职责：存放用户相关的常量定义（Constant），如用户角色标识等（注：包名 `contant` 疑为 `constant` 的拼写错误）  
├── 启动类：没有  
├── 对外暴露：无 HTTP 入口，通过包间方法调用对外服务  
└── 依赖谁：无外部依赖（根据包名推断，该包为纯常量定义包，不依赖其他业务包）  

---

📦 模块：controller（路径：src/main/java/com/yupi/usercenter/controller/）

完整文件清单：
- UserController.java

├── 职责：用户中心的 HTTP 接口层（Controller Layer），接收前端发来的用户注册、登录、查询、管理等请求  
├── 启动类：没有  
├── 对外暴露：UserController.java — 暴露用户相关的 REST API（根据文件名推断，包含用户注册、登录、查询、注销、管理等接口）  
└── 依赖谁：service 包（根据标准分层架构推断，Controller 调用 Service 层处理业务逻辑）、model 包（根据目录结构推断，Controller 接收请求参数需要用到 request 对象）、common 包（根据目录结构推断，Controller 返回响应需要用到 BaseResponse/ResultUtils）  

---

📦 模块：exception（路径：src/main/java/com/yupi/usercenter/exception/）

完整文件清单：
- BusinessException.java
- GlobalExceptionHandler.java

├── 职责：全局异常处理（Global Exception Handling）——自定义业务异常类 `BusinessException` 和全局异常处理器 `GlobalExceptionHandler`，统一捕获并封装异常响应  
├── 启动类：没有  
├── 对外暴露：无 HTTP 入口，通过包间方法调用对外服务（但 `GlobalExceptionHandler` 通过 `@RestControllerAdvice` 注解全局拦截异常，根据文件名推断）  
└── 依赖谁：common 包（根据职责推断，异常处理器需要用 BaseResponse/ErrorCode 封装错误响应）  

---

📦 模块：mapper（路径：src/main/java/com/yupi/usercenter/mapper/）

完整文件清单：
- UserMapper.java

├── 职责：数据访问层（Data Access Layer / DAO），定义与数据库 `user` 表交互的 Mapper 接口，由 MyBatis-Plus 自动生成实现  
├── 启动类：没有（但被启动类的 `@MapperScan("com.yupi.usercenter.mapper")` 注解扫描）  
├── 对外暴露：无 HTTP 入口，通过包间方法调用对外服务  
└── 依赖谁：model 包（根据标准分层架构推断，Mapper 操作的实体类 `User` 定义在 model 包中）、MySQL 数据库（根据 Mapper 职责推断，实际 SQL 执行对象为 MySQL）  

---

📦 模块：model（路径：src/main/java/com/yupi/usercenter/model/）

完整文件清单：
- domain/
  - User.java
  - request/
    - UserLoginRequest.java
    - UserRegisterRequest.java

├── 职责：数据模型层（Model / Domain Layer），定义用户实体类 `User`（对应数据库表）和请求参数封装类（`UserLoginRequest`、`UserRegisterRequest`）  
├── 启动类：没有  
├── 对外暴露：无 HTTP 入口，通过包间方法调用对外服务  
└── 依赖谁：无外部依赖（根据职责推断，model 包为纯数据定义包，是被其他包依赖的底层包）  

---

📦 模块：service（路径：src/main/java/com/yupi/usercenter/service/）

完整文件清单：
- UserService.java
- impl/
  - UserServiceImpl.java

├── 职责：业务逻辑层（Service Layer），包含用户注册、登录、查询、注销等核心业务逻辑的接口定义 `UserService` 和具体实现 `UserServiceImpl`  
├── 启动类：没有  
├── 对外暴露：无 HTTP 入口，通过包间方法调用对外服务  
└── 依赖谁：mapper 包（根据标准分层架构推断，Service 层调用 Mapper 层执行数据库操作）、model 包（根据目录结构推断，Service 操作 User 实体和请求对象）、common 包（根据职责推断，Service 可能抛出 BusinessException 或使用 ErrorCode）、contant 包（根据职责推断，业务逻辑中可能使用用户常量如角色标识）、exception 包（根据职责推断，业务校验失败时抛出 BusinessException）

---

## 依赖矩阵

| 模块 | 依赖的下游 | 被哪些上游依赖 |
|---|---|---|
| controller | service, model, common | （无，是外部 HTTP 请求入口） |
| service | mapper, model, common, contant, exception | controller |
| mapper | model, MySQL 数据库 | service |
| exception | common | service, 全局拦截（Spring MVC 框架自动调用） |
| common | （无） | controller, service, exception |
| model | （无） | controller, service, mapper |
| contant | （无） | service |

---

## 模块关系图

[外部请求 / 浏览器]  
│  
▼  
[controller: UserController]  ── 职责：接收 HTTP 请求，路由到对应业务方法  
│  
├──▶ [service: UserService / UserServiceImpl]  ── 职责：核心业务逻辑（注册、登录、查询、注销）  
│&emsp;&emsp;&emsp;&emsp;│  
│&emsp;&emsp;&emsp;&emsp;├──▶ [mapper: UserMapper]  ── 职责：数据库访问，执行 SQL  
│&emsp;&emsp;&emsp;&emsp;│&emsp;&emsp;&emsp;&emsp;│  
│&emsp;&emsp;&emsp;&emsp;│&emsp;&emsp;&emsp;&emsp;└──▶ [MySQL: user 表]  
│&emsp;&emsp;&emsp;&emsp;│  
│&emsp;&emsp;&emsp;&emsp;├──▶ [model: User, UserLoginRequest, UserRegisterRequest]  ── 职责：数据实体和请求参数定义  
│&emsp;&emsp;&emsp;&emsp;│  
│&emsp;&emsp;&emsp;&emsp;├──▶ [contant: UserConstant]  ── 职责：用户常量定义  
│&emsp;&emsp;&emsp;&emsp;│  
│&emsp;&emsp;&emsp;&emsp;└──▶ [exception: BusinessException]  ── 职责：业务异常抛出  
│  
├──▶ [common: BaseResponse, ResultUtils, ErrorCode]  ── 职责：统一响应封装  
│  
└──▶ [exception: GlobalExceptionHandler]  ── 职责：全局异常捕获与统一错误响应（由 Spring MVC 框架自动调用）  

---

## 模块关系类比

这个项目的模块分工就像**英雄联盟（LOL）里一场团战的角色分工**：

- **controller（UserController）** 是 **辅助（Support）**——站在最前面接住敌人的技能（接收前端请求），然后把信息传递给队友（调用 Service）。
- **service（UserServiceImpl）** 是 **中单法师（Mid Laner）**——团队的核心输出，所有关键的判断和操作逻辑都由它完成（注册校验、密码加密、登录态管理）。
- **mapper（UserMapper）** 是 **打野（Jungler）**——默默在地图深处（数据库）刷资源、拿数据，Service 需要什么数据就去找它要。
- **model（User, Request 类）** 是 **装备和符文**——不是英雄本身，但每个英雄都要穿戴它们才能正常工作（每层代码都需要用到数据模型）。
- **common（BaseResponse, ErrorCode）** 是 **信号系统（Ping / 信号标记）**——统一了全队的沟通格式，让前端能看懂后端返回的每一条信息。
- **exception（GlobalExceptionHandler）** 是 **泉水（基地回血机制）**——当英雄出了意外（程序抛异常），它兜底处理，确保不会直接崩溃，而是返回一个友好的错误提示。
- **contant（UserConstant）** 是 **比赛规则手册**——定义了一些不变的规则常量（如管理员角色码），大家在做判断时都去查这本手册。

对应关系总结：前端请求进来后，controller（辅助）接球传给 service（中单），service 需要数据就找 mapper（打野）去数据库拿，所有角色共用 model（装备）和 common（信号系统），出了问题由 exception（泉水）兜底。
