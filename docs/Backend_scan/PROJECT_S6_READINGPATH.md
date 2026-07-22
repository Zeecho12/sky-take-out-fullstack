# PROJECT_S6_READINGPATH — 推荐阅读路线

> 项目名称：user-center-backend（用户中心后端）
> 项目类型：单体应用（Monolith），标准分层架构（Layered Architecture）
> 核心业务链路：用户注册（User Registration）— Controller → Service → Mapper → MySQL

---

## 推荐阅读路线

第 1 站：配置文件——看懂项目的"出生证明"和外部连接点
  - 目标文件：  
    - src/main/resources/application.yml
    - src/main/resources/application-prod.yml
  - 阅读重点：重点看 4 样东西  
    - ① server.port 和 server.servlet.context-path（项目监听哪个端口、URL 前缀是什么）；    
    - ② spring.datasource.*（连接的是哪个数据库、用什么账号密码）；  
    - ③ mybatis-plus 的逻辑删除配置（isDelete 字段的 0/1 含义）；  
    - ④ prod 配置与默认配置的差异（数据库地址、账号密码在生产环境被覆盖）。
  读完后你能理解：项目启动后会在 8080 端口监听，所有接口以 /api 开头，连接的是 MySQL 的 yupi 库，逻辑删除用 isDelete 字段标记。
  - 理由：  
    - 使用原则：先静态后动态——配置文件是项目启动前就确定的"静态参数"，是理解一切动态代码行为的前提。  
    - 不按此顺序的代价：如果跳过配置文件直接读代码，你会在 Controller 里看到接口路径是 `/user/register`，却不知道完整 URL 其实是 `http://localhost:8080/api/user/register`（因为 context-path=/api 只写在配置文件里）；读到 Service 里的逻辑删除判断时，也不知道 isDelete=1 到底是"已删除"还是"未删除"。

---

第 2 站：数据库建表脚本——看懂项目在操作什么"东西"
  - 目标文件：
    - sql/create_table.sql
  - 阅读重点：重点看 user 表的字段定义——每个字段的名称、类型、默认值、注释。特别关注：
    - ① id 是自增主键（bigint）；
    - ② userAccount 和 planetCode 有什么业务含义；
    - ③ userPassword 存的是加密后的密文；
    - ④ isDelete 是逻辑删除标记（tinyint，默认 0）；
    - ⑤ userRole 是用户角色标识（0=普通用户 / 1=管理员）。
  - 读完后你能理解：整个项目只有一张 user 表，共 14 个字段，你会知道每个字段存什么、什么类型、有什么约束。
  - 理由：
    - 使用原则：先数据后逻辑——数据库表结构定义了项目操作的"对象"，是所有业务逻辑的根基。  
    - 不按此顺序的代价：如果跳过建表脚本直接读 Java 代码，你会在 Service 里看到 `user.setUserRole(0)`、`user.setPlanetCode(planetCode)` 这些操作，却不知道 userRole=0 代表什么角色、planetCode 是个什么概念、这些字段在数据库里是什么类型。每遇到一个字段都要回头查表结构，阅读节奏会被反复打断。

---

第 3 站：启动类——看懂项目怎么"跑起来"
  - 目标文件：
    - src/main/java/com/yupi/usercenter/UserCenterApplication.java
  - 阅读重点：重点看两样东西  
    - ① @SpringBootApplication 注解（它是三个注解的合体：自动配置 + 组件扫描 + 配置类声明）；
    - ② @MapperScan("com.yupi.usercenter.mapper") 注解（告诉 MyBatis-Plus 去哪个包下扫描 Mapper 接口并自动生成实现类）。这个文件很短，一般不超过 10 行。
  - 读完后你能理解：整个项目从这一个 main 方法启动，Spring Boot 会自动扫描 com.yupi.usercenter 包下所有组件，MyBatis-Plus 会为 mapper 包下的接口自动生成代理实现。
  - 理由：
    - 使用原则：先静态后动态——启动类是项目的"点火开关"，它的注解决定了 Spring 容器会加载哪些组件，是理解后续所有 Bean 如何被发现和注入的前提。
    - 不按此顺序的代价：如果跳过启动类直接读 Mapper，你会疑惑"UserMapper 只是一个接口，没有任何实现类，它是怎么工作的？"——答案就在启动类的 @MapperScan 注解里，它告诉 Spring 在启动时自动为这些接口生成代理。不看启动类，这个关键机制就成了黑箱。

---

第 4 站：数据模型——看懂代码里传来传去的"信封"长什么样
  - 目标文件：
    - src/main/java/com/yupi/usercenter/model/domain/User.java
    - src/main/java/com/yupi/usercenter/model/domain/request/UserRegisterRequest.java
    - src/main/java/com/yupi/usercenter/model/domain/request/UserLoginRequest.java
  - 阅读重点：
    - ① User.java 重点看字段与数据库表的映射关系（@TableId、@TableField、@TableLogic 等 MyBatis-Plus 注解），以及 Lombok 的 @Data 注解（自动生成 getter/setter）；
    - ② UserRegisterRequest 和 UserLoginRequest 重点看它们分别封装了哪些请求参数（这些类决定了前端注册/登录时要传什么字段）。 
  - 读完后你能理解：User 实体类的每个字段如何对应数据库表的列，前端注册时要传 userAccount + userPassword + checkPassword + planetCode，登录时要传 userAccount + userPassword。
  - 理由：
    - 使用原则：先数据后逻辑——数据模型是在 Controller、Service、Mapper 三层之间传递的"信封"，三层代码里到处都是 `User user`、`UserRegisterRequest request` 这些对象，不认识它们就读不懂任何一层。
    - 不按此顺序的代价：如果跳过数据模型直接读 Service，你会在 UserServiceImpl 里看到 `user.setUserAccount(userAccount)`、`user.setUserPassword(encryptPassword)` 等大量字段操作，却不知道 User 类一共有哪些字段、哪些是必填的、哪些有默认值。你还会看到方法参数 `UserRegisterRequest`，却不知道这个请求对象里装了什么。

---

第 5 站：Mapper 层——看懂数据怎么进出数据库
  - 目标文件：
    - src/main/java/com/yupi/usercenter/mapper/UserMapper.java
  - 阅读重点：这个文件非常简短——UserMapper 接口继承了 MyBatis-Plus 的 BaseMapper<User>，自身没有定义任何方法。重点理解：
    - ① 继承 BaseMapper<User> 意味着自动拥有了 insert、deleteById、selectById、selectList、selectCount 等十几个通用 CRUD 方法；
    - ② 泛型 <User> 告诉 MyBatis-Plus 这个 Mapper 操作的是 user 表（通过 User 实体类上的注解映射）。
  - 读完后你能理解：本项目的所有数据库操作都由 MyBatis-Plus 自动生成，不需要手写 SQL。UserMapper 虽然是个"空接口"，但通过继承 BaseMapper 获得了完整的 CRUD 能力。
  - 理由：
    - 使用原则：先底层后上层——Mapper 是分层架构中的最底层（直接与数据库交互），Service 层的所有数据操作最终都通过 Mapper 执行。
    - 不按此顺序的代价：如果跳过 Mapper 直接读 Service，你会在 UserServiceImpl 里看到 `this.count(queryWrapper)`、`this.save(user)` 这些调用，却不知道它们背后执行的是什么 SQL、操作的是哪张表。理解了 Mapper 层的"BaseMapper 自动提供 CRUD"机制后，Service 里的这些调用就一目了然了。

---

第 6 站：Service 层——看懂核心业务逻辑怎么运转
  - 目标文件：
    - src/main/java/com/yupi/usercenter/service/UserService.java
    - src/main/java/com/yupi/usercenter/service/impl/UserServiceImpl.java
  - 阅读重点：
    - ① 先看 UserService 接口，了解对外暴露了哪些业务方法（userRegister、userLogin、userLogout、getSafetyUser、searchUsers、deleteUser 等）；
    - ② 再看 UserServiceImpl 实现类，这是整个项目最核心的文件，重点读 userRegister 方法的完整逻辑——7 项参数校验（非空、长度、特殊字符正则、密码一致性）→ synchronized 块内的数据库唯一性检查 → MD5 加盐密码加密 → this.save() 写入数据库；
    - ③ 注意 UserServiceImpl 继承了 ServiceImpl<UserMapper, User>，所以 this.count()、this.save() 等方法来自 MyBatis-Plus 的 Service 基类。
  - 读完后你能理解：注册流程的每一步校验和处理逻辑，登录流程的密码比对和 Session 写入机制，以及为什么要用 synchronized 防止并发注册同名账号。
  - 理由：
    - 使用原则：先底层后上层——Service 是业务逻辑的核心层，位于 Mapper（已读）和 Controller（下一站）之间。读完 Mapper 后再读 Service，遇到 `this.count()` 和 `this.save()` 就能立刻理解它们是在通过 UserMapper 执行 SQL。
    - 不按此顺序的代价：如果先读 Controller 再读 Service，你在 Controller 里只能看到 `userService.userRegister(...)` 这样的方法调用，知道"调了注册方法"但不知道里面做了什么。而如果先读 Service 再读 Controller，到了 Controller 那一站就会发现它只是做了参数提取和非空检查，核心逻辑你在 Service 里已经全部看过了，理解起来毫不费力。

---

第 7 站：Controller 层——看懂外部请求怎么进来、怎么出去
  - 目标文件：
    - src/main/java/com/yupi/usercenter/controller/UserController.java
  - 阅读重点：
    - ① 类级别的 @RestController 和 @RequestMapping("/user") 注解（所有接口路径以 /user 开头，结合配置文件的 context-path=/api，完整路径为 /api/user/xxx）；
    - ② 每个方法的 HTTP 方法注解（@PostMapping("/register")、@PostMapping("/login")、@GetMapping("/current")、@PostMapping("/logout")、@GetMapping("/search")、@PostMapping("/delete")）；
    - ③ 参数接收方式（@RequestBody 接收 JSON 请求体、HttpServletRequest 获取 Session）；
    - ④ 返回值统一用 BaseResponse 包装（通过 ResultUtils.success() 和 ResultUtils.error()）。
  - 读完后你能理解：项目对外暴露了哪些 API 接口、每个接口的 URL 路径和 HTTP 方法、前端需要传什么参数、后端返回什么格式的响应。至此，从"请求进来"到"数据库操作"到"响应返回"的完整链路你已经全部走通。
  - 理由：
    - 使用原则：先底层后上层——Controller 是分层架构中的最上层（直接面向前端请求），也是阅读路线的"终点站"。前面 6 站已经打好了全部基础：配置文件告诉你端口和路径前缀，数据模型告诉你请求/响应长什么样，Mapper 告诉你数据怎么存取，Service 告诉你业务逻辑怎么运转——到了 Controller 这一站，你只需要关注"路由映射"和"参数校验"这两件轻量级的事。
    - 不按此顺序的代价：如果一上来就读 Controller（很多初学者的本能反应），你会遇到一连串看不懂的东西——`UserRegisterRequest` 是什么？`userService.userRegister()` 里面做了什么？`ResultUtils.success()` 返回的是什么格式？`request.getSession()` 的 Session 哪来的？每一行都要跳到别的文件去查，阅读体验就像在迷宫里乱走。

---

## 先跳过这些

| 文件/目录 | 跳过原因（40 字以内） | 什么时候再回来看 |
|---|---|---|
| src/main/java/com/yupi/usercenter/common/BaseResponse.java | 统一响应封装类，格式固定，不影响理解业务流程 | 读完第 7 站 Controller 后，想了解返回格式的细节时再看 |
| src/main/java/com/yupi/usercenter/common/ErrorCode.java | 错误码枚举，查表即可，无需提前通读 | 读 Service/Controller 时遇到 `ErrorCode.PARAMS_ERROR` 等引用，点进去对照一下即可 |
| src/main/java/com/yupi/usercenter/common/ResultUtils.java | 响应工具类，只有两三个静态方法，一眼能看懂 | 读 Controller 时遇到 `ResultUtils.success()` 调用，点进去瞄一眼即可 |
| src/main/java/com/yupi/usercenter/contant/UserConstant.java | 常量定义类，查表即可，无需提前通读 | 读 Service 时遇到角色常量引用（如 `ADMIN_ROLE`），点进去对照一下即可 |
| src/main/java/com/yupi/usercenter/exception/BusinessException.java | 自定义异常类，继承 RuntimeException 加了几个字段 | 读 Service 时遇到 `throw new BusinessException(...)` 想了解异常结构时再看 |
| src/main/java/com/yupi/usercenter/exception/GlobalExceptionHandler.java | 全局异常拦截器，是兜底逻辑而非主线逻辑 | 读完全部主线代码后，作为"Spring MVC 异常处理机制"的扩展阅读 |
| src/test/ | 测试代码，验证逻辑正确性，不影响理解业务本身 | 读完全部主线代码后，想了解如何编写单元测试时再看 |
| target/ | Maven 构建输出目录，是编译生成的产物，不是源码 | 无需阅读，除非你想了解 Maven 的构建产物结构 |
| Dockerfile | 容器化部署配置，与业务代码无关 | 想了解项目如何部署到 Docker 时再看 |
