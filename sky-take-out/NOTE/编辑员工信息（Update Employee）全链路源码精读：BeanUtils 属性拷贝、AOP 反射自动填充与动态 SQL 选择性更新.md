 # 编辑员工信息（Update Employee）全链路源码精读：BeanUtils 属性拷贝、AOP 反射自动填充与动态 SQL 选择性更新

**视频出处**：[在此处填写视频链接/出处]  
**关键词**：三层架构（Controller-Service-Mapper）、`@PutMapping` 与 RESTful 语义、`@RequestBody` 参数绑定、BeanUtils.copyProperties 属性拷贝、DTO 安全边界（防过度提交 Mass Assignment）、ThreadLocal 跨层传参、AOP（面向切面编程 Aspect-Oriented Programming）、自定义注解 `@AutoFill`、反射（Reflection）、MyBatis 动态 SQL（`<set>` + `<if>` 条件更新）、统一返回结果 `Result<T>`  
**创建时间**：2026-07-14 19:28

---

## 〇、阅读这条链路前，先建立"全景地图"

我们要追的这条链，是后端最日常的操作之一：**管理员在前端编辑了某个员工的信息（姓名、手机号等），点保存 → 后端把修改写入数据库 → 返回成功**。

用餐厅打比方，整条链上有五类角色，各司其职、互不越权：

| 角色 | 项目中的层 / 组件 | 职责 | 类比 |
|---|---|---|---|
| 前台收银员 | `Controller` | 接客、收修改单、把结果告知顾客 | 不改菜谱，只转达 |
| 厨师长 | `Service` | 核心加工——把前端给的"修改单"翻译成"仓库能看懂的格式" | 做转换、做准备 |
| 质检盖章员 | `AOP AutoFillAspect` | 每张出库单自动盖上"经办人 + 时间"章 | 横切关注点，所有出库单都经过 |
| 仓库管理员 | `Mapper` + XML | 照着出库单更新对应货架 | 只和数据库打交道 |
| 冷库 | `Database` | 存放原始数据 | MySQL |

**断点调试时，程序会按这个顺序在文件间跳转**（请把这张图记在脑子里，后面每一步都对应这里的一行）：

```
前端 PUT /admin/employee   （携带 JSON: {id, username, name, phone, sex, idNumber}）
   │
   ▼
① EmployeeController.update()                    [sky-server] 接客
   │  employeeService.update(dto)
   ▼
② EmployeeServiceImpl.update()                   [sky-server] 厨师长
   │  new Employee() + BeanUtils.copyProperties(dto → entity)
   │  手动设 updateTime / updateUser
   │  employeeMapper.update(employee)
   ▼
③ AutoFillAspect.autoFill()  [@Before AOP 拦截]   [sky-server] 质检盖章
   │  反射调 setUpdateTime / setUpdateUser（覆盖②中的手动值）
   ▼
④ EmployeeMapper.update() → EmployeeMapper.xml   [sky-server] 仓库管理员
   │  动态 SQL: UPDATE employee SET [非空字段] WHERE id = ?
   ▼
⑤ MySQL 更新该行记录
   │  （沿原路返回①）
   ▼
①' 回到 Controller：Result.success()  →  以 JSON 返回前端
```

> **跨模块提示**：`Controller / ServiceImpl / Mapper / AOP Aspect / 拦截器` 都在 **`sky-server`** 模块；`Employee` 实体、`EmployeeDTO` 在 **`sky-pojo`** 模块；`BaseContext`、`Result`、`AutoFillConstant`、`OperationType` 枚举在 **`sky-common`** 模块。一次编辑操作，实际上横跨了三个 Maven 子模块。

> **前置步骤（不在本链路，但需要知道）**：用户点"编辑"按钮时，前端会先调 `GET /admin/employee/{id}` 把该员工当前信息加载到表单（Service 里还特意把 `password` 遮盖成 `"****"` 再返回）。用户改完后点"保存"，才触发本链路的 `PUT /admin/employee`。"先查后改"是编辑场景的标准两步。

下面进入断点逐步走读。

---

## 一、第 ① 步：请求落到 Controller

**文件**：`sky-server/src/main/java/com/sky/controller/admin/EmployeeController.java`

```java
@RestController
@RequestMapping("/admin/employee")   // 这个类下所有接口的公共前缀
@Slf4j
@Api(tags = "员工相关接口")
public class EmployeeController {

    @Autowired
    private EmployeeService employeeService;   // 注入 Service（接口，不是实现类）
    @Autowired
    private JwtProperties jwtProperties;

    // …… login / save / page / startOrStop / getById 等方法略

    @PutMapping                          // 完整路径 = PUT /admin/employee（注意：没有子路径）
    @ApiOperation("编辑员工信息")          // Swagger 文档注解，不影响运行
    public Result update(@RequestBody EmployeeDTO employeeDTO) {
        log.info("编辑员工信息：{}", employeeDTO);
        employeeService.update(employeeDTO);   // 调 Service，不写任何业务逻辑
        return Result.success();               // 编辑无需返回数据，只要一个"成功"信号
    }
}
```

**断点观察 —— 在进入方法体第一行之前，框架已经替我们做了三件事：**

1. **JWT 拦截器已运行**。在请求到达 Controller 之前，`JwtTokenAdminInterceptor` 已经从请求头里取出 JWT 令牌、解析出当前登录员工的 `empId`，并通过 `BaseContext.setCurrentId(empId)` 存入了 ThreadLocal。所以后续 Service 里调 `BaseContext.getCurrentId()` 才能拿到"是谁在操作"。（详见配角 D。）

2. **路由匹配**。`@PutMapping`（**注意不是 `@PostMapping`**）+ 类级 `@RequestMapping("/admin/employee")` 拼出 `PUT /admin/employee`。

   - *为什么是 PUT 而不是 POST*：这遵循 **RESTful（表述性状态转移）** 约定——`POST` 表示"**创建**新资源"（对应新增员工 `save`），`PUT` 表示"**更新**已有资源"（对应编辑员工 `update`）。同一个 URL `/admin/employee`，通过 **HTTP 方法**区分创建和更新，这就是 RESTful 的核心思想：**URL 定位资源，HTTP 方法定义操作**。
   - *不用会怎样*：如果创建和更新都用 POST，就必须靠不同的 URL（如 `/admin/employee/add` 和 `/admin/employee/update`）来区分——URL 变得冗长、语义不清晰，而且不符合行业规范。

3. **`@RequestBody` 反序列化**。把请求体里的 JSON（如 `{"id":2, "username":"zhangsan", "name":"张三", "phone":"13800138000", "sex":"1", "idNumber":"110101199001011234"}`）用 Jackson 反序列化成一个 `EmployeeDTO` 对象。

**注意两个设计细节：**
- 返回的是 `Result.success()`（**无参版**），只返回 `{code:1}`。编辑操作不需要返回数据，前端只关心"成没成功"。这和登录返回 `Result.success(vo)` 不同。
- Controller **只做了三件事**：打日志 → 调 Service → 返回成功。没有任何业务判断。这是三层架构的纪律：Controller 是"传话筒"，不该有 `if` 判断。

> 先看一眼前端传进来的数据载体。

### 配角 A：`EmployeeDTO`（前端 → 后端 的入参）

**文件**：`sky-pojo/src/main/java/com/sky/dto/EmployeeDTO.java`

```java
@Data
public class EmployeeDTO implements Serializable {

    private Long id;          // 要编辑的员工 ID（用于 WHERE 条件定位）

    private String username;  // 用户名
    private String name;      // 姓名
    private String phone;     // 手机号
    private String sex;       // 性别
    private String idNumber;  // 身份证号
}
```

**重点——DTO 的安全边界作用（面试高频考点）**：

对比一下 `Employee` 实体有 12 个字段（id、username、name、**password**、phone、sex、idNumber、**status**、createTime、updateTime、createUser、updateUser），而 `EmployeeDTO` 只有 6 个。

**缺少的字段就是前端"不该碰"的字段**：
- **没有 `password`**：编辑基本信息时不该改密码（改密码应该是单独的接口）。
- **没有 `status`**：启用/禁用员工有专门的 `startOrStop` 接口，不能让"编辑信息"的接口顺带改 status。
- **没有 `createTime` / `createUser` / `updateTime` / `updateUser`**：这些是系统自动维护的审计字段（Audit Fields），由后端自动填充，绝不允许前端传入。

这就是 DTO 的**防过度提交（Mass Assignment Prevention）**作用：前端就算恶意在 JSON 里加上 `"status": 0` 或 `"password": "hack"`，Jackson 反序列化到 `EmployeeDTO` 时会直接忽略它们（因为 DTO 里没有这些字段），从源头堵住了越权修改。

---

## 二、第 ② 步：进入 Service —— DTO→Entity 转换与公共字段准备

断点单步进入 `employeeService.update(employeeDTO)`。

Controller 里注入的是 `EmployeeService`（**接口**），但运行时真正执行的是它的实现类 `EmployeeServiceImpl`。这是 Spring 的依赖注入（Dependency Injection）+ 面向接口编程（Program to Interface）：Controller 不关心"谁来实现"，只认接口。

**文件**：`sky-server/src/main/java/com/sky/service/impl/EmployeeServiceImpl.java`

```java
@Service                                    // 声明这是一个 Service Bean，交给 Spring 管理
public class EmployeeServiceImpl implements EmployeeService {

    @Autowired
    private EmployeeMapper employeeMapper;   // 注入 Mapper，用来操作数据库

    // …… login / save / pageQuery / startOrStop / getById 等方法略

    @Override
    public void update(EmployeeDTO employeeDTO) {
        Employee employee = new Employee();                            // ① 创建空白 Entity
        BeanUtils.copyProperties(employeeDTO, employee);              // ② 把 DTO 字段拷贝到 Entity

        employee.setUpdateTime(LocalDateTime.now());                  // ③ 手动设"修改时间"
        employee.setUpdateUser(BaseContext.getCurrentId());           // ④ 手动设"修改人 ID"
        employeeMapper.update(employee);                              // ⑤ 调 Mapper 写入数据库
    }
}
```

**断点单步走读——五行代码，行行有讲究：**

### 第 ① 行：`new Employee()`

创建一个空白 `Employee` 实例。此刻所有字段都是默认值（`Long` 为 `null`、`String` 为 `null`、`Integer` 为 `null`）。它的 `@NoArgsConstructor` 注解（Lombok 生成的无参构造方法）让这个 `new` 能正常工作。

### 第 ② 行：`BeanUtils.copyProperties(employeeDTO, employee)` —— 属性拷贝

- **为什么需要它**：前端给的是 `EmployeeDTO`（6 个字段），数据库操作需要 `Employee`（12 个字段）。需要把 DTO 里的值"搬"到 Entity 上。如果一个个 `employee.setUsername(employeeDTO.getUsername())` 手写，6 个字段就要写 6 行——字段多了更痛苦。`BeanUtils.copyProperties` 一行搞定。

- **它是什么**：Spring 提供的工具方法（`org.springframework.beans.BeanUtils`），底层用**反射（Reflection）**扫描源对象和目标对象的所有属性，**属性名相同 + 类型兼容**的字段会被自动拷贝。注意参数顺序：`copyProperties(source, target)`——第一个是**源**、第二个是**目标**，写反了数据方向就反了。

- **在这里的效果**——拷贝后 `employee` 各字段的状态（**核心！必须搞清楚**）：

  | 字段 | 拷贝前（new 出来） | 拷贝后 | 原因 |
  |---|---|---|---|
  | `id` | `null` | `2`（前端传的） | DTO 有同名字段 ✓ 拷贝 |
  | `username` | `null` | `"zhangsan"` | DTO 有同名字段 ✓ 拷贝 |
  | `name` | `null` | `"张三"` | DTO 有同名字段 ✓ 拷贝 |
  | `phone` | `null` | `"13800138000"` | DTO 有同名字段 ✓ 拷贝 |
  | `sex` | `null` | `"1"` | DTO 有同名字段 ✓ 拷贝 |
  | `idNumber` | `null` | `"110101..."` | DTO 有同名字段 ✓ 拷贝 |
  | `password` | `null` | **仍是 `null`** | DTO 里没有 password 字段，**不拷贝** |
  | `status` | `null` | **仍是 `null`** | DTO 里没有 status 字段，**不拷贝** |
  | `createTime` | `null` | **仍是 `null`** | DTO 里没有，不拷贝 |
  | `createUser` | `null` | **仍是 `null`** | DTO 里没有，不拷贝 |
  | `updateTime` | `null` | **仍是 `null`** | DTO 里没有，不拷贝 |
  | `updateUser` | `null` | **仍是 `null`** | DTO 里没有，不拷贝 |

  **关键结论**：DTO 里没有的字段，Entity 里保持 `null`。这正是后面动态 SQL"只更新非空字段"的基础——`password`、`status` 等是 `null`，SQL 里就不会出现 `SET password = ...`，数据库里原来的值不受影响。**DTO 字段限制 + 动态 SQL 条件更新，形成了双重安全保障。**

### 第 ③④ 行：手动设 `updateTime` 和 `updateUser`

```java
employee.setUpdateTime(LocalDateTime.now());           // 当前时间
employee.setUpdateUser(BaseContext.getCurrentId());    // 当前登录员工的 ID（从 ThreadLocal 取）
```

此刻 `employee` 身上新增了两个非 null 字段。

**但这里有个后面会揭晓的"惊喜"**：这两行其实是**冗余的**——AOP 切面在 Mapper 执行前会再次设置这两个字段（覆盖这里的值）。先往下走，到第三节你就会看到为什么这两行多余。

### 第 ⑤ 行：调用 `employeeMapper.update(employee)`

断点即将跳出 Service——但它**不会直接**跳到 Mapper 实现，而是先经过 AOP 拦截。下一帧你会"意外"落在 `AutoFillAspect` 里。

> 在继续之前，先认识这条链上的几个重要配角。

### 配角 B：`Employee`（数据库实体）

**文件**：`sky-pojo/src/main/java/com/sky/entity/Employee.java`

```java
@Data                  // Lombok：自动生成 getter/setter/toString/equals/hashCode
@Builder               // Lombok：编译期生成建造者模式代码，支持 .id().name()...build() 链式调用
@NoArgsConstructor     // 生成无参构造方法（BeanUtils 和 MyBatis 反射创建实例需要）
@AllArgsConstructor    // 生成全参构造方法（Builder 内部需要）
public class Employee implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;
    private String username;
    private String name;
    private String password;         // ← DTO 里没有，前端改不到
    private String phone;
    private String sex;
    private String idNumber;
    private Integer status;          // ← DTO 里没有，前端改不到

    //@JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")   // 被注释掉了，说明日期格式化由其他方式处理
    private LocalDateTime createTime;    // 创建时间 ← 公共字段，由 AOP 自动填充
    //@JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;    // 修改时间 ← 公共字段，由 AOP 自动填充
    private Long createUser;             // 创建人 ID ← 公共字段
    private Long updateUser;             // 修改人 ID ← 公共字段
}
```

Entity 是数据库表 `employee` 的"Java 镜像"，字段和列一一对应。`@NoArgsConstructor` 让 `new Employee()` 和 MyBatis 反射创建实例都能正常工作。`@Builder` 支持链式构建——`startOrStop` 方法里的 `Employee.builder().status(status).id(id).build()` 用的就是它。

### 配角 C：`BaseContext`（ThreadLocal 工具类 —— 跨层传递"当前是谁在操作"）

**文件**：`sky-common/src/main/java/com/sky/context/BaseContext.java`

```java
public class BaseContext {

    public static ThreadLocal<Long> threadLocal = new ThreadLocal<>();

    public static void setCurrentId(Long id) {
        threadLocal.set(id);           // 往当前线程的"口袋"里放一个 Long 值
    }

    public static Long getCurrentId() {
        return threadLocal.get();      // 从当前线程的"口袋"里取出 Long 值
    }

    public static void removeCurrentId() {
        threadLocal.remove();          // 清空口袋，防止线程复用时残留
    }
}
```

- **为什么需要它**：Service 需要知道"是谁在做这次编辑"，好把这个 ID 记为 `updateUser`。但 `update(EmployeeDTO)` 的参数里没有"操作者 ID"。总不能让每个 Service 方法都多加一个 `Long operatorId` 参数吧？那得改遍所有 Controller 和 Service 的签名——侵入性太强。

- **它是什么（ThreadLocal，线程局部变量）**：想象每个服务员（线程）身上都有一个**私人口袋**。同一时刻可能有 100 个请求同时处理（100 个线程），每个线程的"口袋"里装着各自登录员工的 ID，互不干扰、互不串线。`set()` 往口袋里放，`get()` 从口袋里取。

- **数据从哪来**：看下面的拦截器。

### 配角 D：`JwtTokenAdminInterceptor`（BaseContext 的数据源头 —— 拦截器"验票 + 存身份"）

**文件**：`sky-server/src/main/java/com/sky/interceptor/JwtTokenAdminInterceptor.java`

```java
@Component
@Slf4j
public class JwtTokenAdminInterceptor implements HandlerInterceptor {

    @Autowired
    private JwtProperties jwtProperties;

    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        // 非 Controller 方法（如静态资源），直接放行
        if (!(handler instanceof HandlerMethod)) {
            return true;
        }

        // 1、从请求头中获取 JWT 令牌
        String token = request.getHeader(jwtProperties.getAdminTokenName());

        // 2、解析令牌，取出 empId
        try {
            log.info("jwt校验:{}", token);
            Claims claims = JwtUtil.parseJWT(jwtProperties.getAdminSecretKey(), token);
            Long empId = Long.valueOf(claims.get(JwtClaimsConstant.EMP_ID).toString());
            log.info("当前员工id：", empId);

            // ★★★ 关键一行 ★★★
            // 把 empId 存入 ThreadLocal，后续 Service / AOP 通过 BaseContext.getCurrentId() 取用
            BaseContext.setCurrentId(empId);

            return true;   // 验票通过，放行
        } catch (Exception ex) {
            response.setStatus(401);   // 令牌无效或过期，拒绝访问
            return false;
        }
    }
}
```

**数据流串联**（这是理解 ThreadLocal 的关键，一定要看懂）：

```
前端请求头: token = "xxx.yyy.zzz"
  → 拦截器解析出 empId = 1（假设管理员 ID 是 1）
  → BaseContext.setCurrentId(1)         ← 放入当前线程的"口袋"
  → Controller.update()                  （不需要知道 empId）
  → Service: BaseContext.getCurrentId()  ← 从口袋里取出 1，设为 updateUser
  → AOP: BaseContext.getCurrentId()      ← 同一个线程，取到同一个 1
```

ThreadLocal 让"当前操作者是谁"这个信息**穿透了整条调用链**，而不用每个方法都传参。代价是必须注意清理（`removeCurrentId()`），否则 Tomcat 线程池中的线程被复用时可能拿到上一次请求的残留值——这是 ThreadLocal 的经典坑。

---

## 三、第 ③ 步：AOP 拦截 —— 在 Mapper 执行前自动填充公共字段

断点从 Service 的 `employeeMapper.update(employee)` 跳出——但没有直接进 Mapper，而是**意外**落在了 `AutoFillAspect.autoFill()` 里。这就是 **AOP（Aspect-Oriented Programming，面向切面编程）** 在起作用。

**用餐厅打比方**：厨师长（Service）把加工好的出库单交给仓库管理员（Mapper）之前，经过一个"质检盖章窗口"（AOP Aspect）。质检员不管你做的是什么菜、改的是什么信息，统一在出库单上盖两个章——"经办人"和"时间戳"。厨师长不用操心盖章的事，仓库管理员拿到的单子上一定有章。**这种"所有出库单都要做的事"就叫横切关注点（Cross-Cutting Concern）**——它不属于任何一道菜的业务逻辑，但每道菜都要经过。

- *为什么需要 AOP*：`updateTime` / `updateUser` 这类公共字段，**每个写操作**（编辑员工、启用禁用员工、新增菜品、修改套餐……）都要设。如果每个 Service 方法都手写 `setUpdateTime(now)` / `setUpdateUser(currentId)`，不仅重复，还容易漏——漏了一处就是审计数据缺失。AOP 把这件事**集中托管**，一处编写、全局生效。
- *它是什么*：AOP 是 Spring 提供的"在方法执行前/后自动插入逻辑"的机制。你定义一个"切面（Aspect）"，声明"在哪些方法上（切入点 Pointcut）"、"在执行前还是执行后（通知类型 Advice）"、"做什么事（通知逻辑）"。Spring 在运行时通过动态代理拦截目标方法调用，自动执行切面逻辑。

### 配角 E：`@AutoFill` 自定义注解 + `OperationType` 枚举

**文件**：`sky-server/src/main/java/com/sky/annotation/AutoFill.java`

```java
@Target(ElementType.METHOD)          // 只能标注在方法上
@Retention(RetentionPolicy.RUNTIME)  // 运行时保留，AOP 才能通过反射读取
public @interface AutoFill {
    OperationType value();           // 必须指定操作类型：INSERT 还是 UPDATE
}
```

**文件**：`sky-common/src/main/java/com/sky/enumeration/OperationType.java`

```java
public enum OperationType {
    UPDATE,   // 更新操作：只填 updateTime、updateUser（2 个字段）
    INSERT    // 插入操作：填 createTime、createUser、updateTime、updateUser（4 个字段）
}
```

- **`@AutoFill` 是一个"信号灯"**——它自己不做任何事，只是在 Mapper 方法上打个标记：**"这个方法需要自动填充公共字段"**。真正干活的是切面。
- **在 Mapper 接口里的用法**（先看一眼，后面第四节会详细讲 Mapper）：
  ```java
  @AutoFill(OperationType.UPDATE)   // ← 标记：调用此方法前，自动填充 UPDATE 类型的公共字段
  void update(Employee employee);
  ```

### 配角 F：`AutoFillAspect`（AOP 切面 —— 真正的"质检盖章员"）

**文件**：`sky-server/src/main/java/com/sky/aspect/AutoFillAspect.java`

```java
@Aspect       // 声明这是一个 AOP 切面
@Component    // 交给 Spring 管理
@Slf4j
public class AutoFillAspect {

    /**
     * 切入点定义：拦截 com.sky.mapper 包下所有带 @AutoFill 注解的方法
     * "execution(* com.sky.mapper.*.*(..))" → mapper 包下所有类的所有方法
     * "&& @annotation(com.sky.annotation.AutoFill)" → 且方法上有 @AutoFill 注解
     */
    @Pointcut("execution(* com.sky.mapper.*.*(..)) && @annotation(com.sky.annotation.AutoFill)")
    public void autoFillPointCut() {}

    /**
     * 前置通知：在目标方法执行之【前】运行
     */
    @Before("autoFillPointCut()")
    public void autoFill(JoinPoint joinPoint) {
        log.info("开始进行公共字段自动填充");

        // 1. 获取当前方法上的 @AutoFill 注解，读取操作类型（INSERT 还是 UPDATE）
        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        AutoFill autoFill = signature.getMethod().getAnnotation(AutoFill.class);
        OperationType operationType = autoFill.value();   // → 这里是 OperationType.UPDATE

        // 2. 获取方法的第一个参数（约定：实体对象一定是第一个参数）
        Object[] args = joinPoint.getArgs();
        if (args == null || args.length == 0) {
            return;
        }
        Object entity = args[0];   // → 就是 Service 传过来的那个 Employee 对象

        // 3. 准备要填充的值
        LocalDateTime now = LocalDateTime.now();             // 当前时间（时间戳 T2，比 Service 里设的 T1 晚几微秒）
        Long currentId = BaseContext.getCurrentId();          // 当前操作者 ID（和 Service 里取的是同一个值）

        // 4. 根据操作类型，用反射调用 setter 赋值
        if (operationType == OperationType.INSERT) {
            // INSERT 操作：填 4 个字段
            try {
                Method setCreateTime = entity.getClass().getDeclaredMethod(AutoFillConstant.SET_CREATE_TIME, LocalDateTime.class);
                Method setCreateUser = entity.getClass().getDeclaredMethod(AutoFillConstant.SET_CREATE_USER, Long.class);
                Method setUpdateTime = entity.getClass().getDeclaredMethod(AutoFillConstant.SET_UPDATE_TIME, LocalDateTime.class);
                Method setUpdateUser = entity.getClass().getDeclaredMethod(AutoFillConstant.SET_UPDATE_USER, Long.class);

                setCreateTime.invoke(entity, now);
                setCreateUser.invoke(entity, currentId);
                setUpdateTime.invoke(entity, now);
                setUpdateUser.invoke(entity, currentId);
            } catch (Exception e) {
                throw new RuntimeException(e);
            }

        } else if (operationType == OperationType.UPDATE) {
            // UPDATE 操作：只填 2 个字段
            try {
                Method setUpdateTime = entity.getClass().getDeclaredMethod(AutoFillConstant.SET_UPDATE_TIME, LocalDateTime.class);
                Method setUpdateUser = entity.getClass().getDeclaredMethod(AutoFillConstant.SET_UPDATE_USER, Long.class);

                setUpdateTime.invoke(entity, now);        // ← 覆盖 Service 第 ③ 行设的值！
                setUpdateUser.invoke(entity, currentId);  // ← 覆盖 Service 第 ④ 行设的值！
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        }
    }
}
```

**断点观察 —— AOP 执行到这里时发生了什么：**

此刻 `entity` 就是 Service 传过来的那个 `Employee` 对象。它身上已经有了 Service 手动设的 `updateTime`（时间戳 T1）和 `updateUser`（比如 `1`）。AOP 现在用 `LocalDateTime.now()` 得到新的时间戳 T2（比 T1 晚了几微秒），通过反射把 `updateTime` **覆盖**成 T2、`updateUser` 设成同一个值 `1`。

**这里用到的关键技术——反射（Reflection）**：

- **为什么不直接 `((Employee) entity).setUpdateTime(now)`**：因为 AOP 切面是**通用的**——它不只服务于 `Employee`，项目里任何实体（`Category`、`Dish`、`SetMeal`……）只要 Mapper 上标了 `@AutoFill`，这个切面都要能填充。所以它不能写死类型为 `Employee`，只能用**反射**：`entity.getClass().getDeclaredMethod("setUpdateTime", LocalDateTime.class)` 意思是"不管你是什么类，只要你有个叫 `setUpdateTime` 且参数类型为 `LocalDateTime` 的方法，我就调它"。
- 反射的代价是比直接调用略慢（跳过了编译期类型检查），而且方法名拼错了编译器不报错、运行时才抛 `NoSuchMethodException`。但这个场景调用频率不高，性能影响可忽略。

- **`AutoFillConstant`** 把方法名定义为常量，避免到处硬编码字符串拼错：

  **文件**：`sky-common/src/main/java/com/sky/constant/AutoFillConstant.java`

  ```java
  public class AutoFillConstant {
      public static final String SET_CREATE_TIME = "setCreateTime";
      public static final String SET_UPDATE_TIME = "setUpdateTime";
      public static final String SET_CREATE_USER = "setCreateUser";
      public static final String SET_UPDATE_USER = "setUpdateUser";
  }
  ```

### 教学重点：Service 手动设置与 AOP 自动填充的"冗余"

回头看 Service 里的代码：
```java
employee.setUpdateTime(LocalDateTime.now());           // Service 手动设（时间 T1）
employee.setUpdateUser(BaseContext.getCurrentId());    // Service 手动设
employeeMapper.update(employee);                       // → AOP 的 @Before 在这里拦截，又设了一遍（时间 T2，覆盖 T1）
```

**这两行是冗余的**。AOP 的 `@Before` 会在 Mapper 方法实际执行前重新设置 `updateTime` 和 `updateUser`，覆盖 Service 手动设的值。Service 设了等于白设。

**为什么会出现这种冗余？** 这是项目**演进的痕迹**：
1. 最初版本没有 AOP，每个 Service 方法都手动设公共字段（和 `save` 方法里一模一样的写法）。
2. 后来引入了 `@AutoFill` AOP 机制，把"设公共字段"统一抽到了切面里。
3. 但 `update` 方法里的手动代码**没有清理掉**。

**对比 `startOrStop` 方法**（同样调用 `employeeMapper.update`）：
```java
public void startOrStop(Integer status, Long id) {
    Employee employee = Employee.builder()
            .status(status)
            .id(id)
            .build();           // 只设了 status 和 id
    employeeMapper.update(employee);  // → AOP 自动填充 updateTime / updateUser
}
```

`startOrStop` **没有手动设任何公共字段**，完全依赖 AOP——这才是引入 AOP 后的"正确写法"。

**这在真实项目里很常见——代码演进后旧逻辑没删干净。** 它不会导致 bug（AOP 覆盖了手动值，功能完全正确），但让阅读者困惑（"到底谁设的生效？两边都设有什么意义吗？"）。读代码时要有**"时间线意识"**——先写的代码可能已经被后来引入的机制替代了。`update` 里的 `setUpdateTime` / `setUpdateUser` 两行完全可以删掉。

---

## 四、第 ④ 步：Mapper 接口 + XML 动态 SQL —— 只更新非空字段

AOP 执行完毕，断点终于进入 Mapper。

### Mapper 接口（"目录页"）

**文件**：`sky-server/src/main/java/com/sky/mapper/EmployeeMapper.java`

```java
@Mapper   // 告诉 MyBatis：为这个接口生成动态代理实现
public interface EmployeeMapper {

    // …… getByUsername / insert / pageQuery / getById 等略

    /**
     * 启用禁用员工账户，编辑员工信息（两个场景共用一条 SQL）
     */
    @AutoFill(OperationType.UPDATE)   // ← 触发 AOP 自动填充公共字段
    void update(Employee employee);
}
```

- **注意**：`update` 方法上**没有 `@Update` 注解**写 SQL。这说明 SQL 写在 XML 里——MyBatis 根据 `namespace`（接口全限定名）+ `id`（方法名）去 XML 文件里找对应的 SQL 标签。

### XML 动态 SQL（"真正执行的 SQL"）

**文件**：`sky-server/src/main/resources/mapper/EmployeeMapper.xml`

```xml
<mapper namespace="com.sky.mapper.EmployeeMapper">

    <!-- …… getByUsername / insert / pageQuery 等略 -->

    <update id="update" parameterType="Employee">
        update employee
        <set>
            <if test="name != null">name = #{name},</if>
            <if test="username != null">username = #{username},</if>
            <if test="password != null">password = #{password},</if>
            <if test="phone != null">phone = #{phone},</if>
            <if test="sex != null">sex = #{sex},</if>
            <if test="idNumber != null">id_Number = #{idNumber},</if>
            <if test="updateTime != null">update_Time = #{updateTime},</if>
            <if test="updateUser != null">update_User = #{updateUser},</if>
            <if test="status != null">status = #{status},</if>
        </set>
        where id = #{id}
    </update>

    <!-- …… getById 等略 -->
</mapper>
```

**这段动态 SQL 是整条链的精华之一，逐行拆解：**

**1. `<set>` 标签：**
- *为什么需要它*：如果手写 `SET name = ..., phone = ..., status = ...`，字段列表是固定的。但编辑操作可能只改了 name 和 phone，而没改 status。如果把 `status = null` 也写进 SQL，就会把数据库里原本正常的 `status` 值改成 `null`——这是灾难。
- *它是什么*：MyBatis 的动态 SQL 标签。`<set>` 会自动生成 `SET` 关键字，并且**自动去除末尾多余的逗号**（最后一个成立的 `<if>` 行末尾的逗号会被自动清理，不用担心语法错误）。

**2. `<if test="xxx != null">`**：只有当该字段**不为 null** 时，这一行 SQL 才会出现在最终的 SQL 语句里。

**3. 结合前面的分析——此刻 Employee 各字段的状态 + SQL 生成结果：**

| 字段 | 当前值 | `<if>` 判断 | 是否进入 SQL |
|---|---|---|---|
| `name` | `"张三"` | `!= null` ✓ | ✅ `name = '张三'` |
| `username` | `"zhangsan"` | `!= null` ✓ | ✅ `username = 'zhangsan'` |
| `password` | `null` | `== null` | ❌ **跳过 → 数据库里原密码不变** |
| `phone` | `"13800138000"` | `!= null` ✓ | ✅ |
| `sex` | `"1"` | `!= null` ✓ | ✅ |
| `idNumber` | `"110101..."` | `!= null` ✓ | ✅ |
| `updateTime` | `2026-07-14T19:28:xx` | `!= null` ✓ | ✅ |
| `updateUser` | `1` | `!= null` ✓ | ✅ |
| `status` | `null` | `== null` | ❌ **跳过 → 数据库里原状态不变** |

**最终 MyBatis 生成并执行的 SQL**（去掉了 password 和 status）：
```sql
UPDATE employee
SET name = '张三', username = 'zhangsan', phone = '13800138000',
    sex = '1', id_Number = '110101...', 
    update_Time = '2026-07-14 19:28:xx', update_User = 1
WHERE id = 2
```

**4. `WHERE id = #{id}`**：`id` 是 DTO 的第一个字段（值为 `2`），通过 `BeanUtils.copyProperties` 拷贝到了 Entity 上。这个 `WHERE` 确保只更新 id=2 的那一行记录。

**5. 一条 SQL 复用多种场景**——这是动态 SQL 最强大的地方：

- **编辑员工信息**（本链路）：name/username/phone/sex/idNumber 非空 + updateTime/updateUser 非空 → SQL 更新这 8 个字段。
- **启用禁用员工**（`startOrStop`）：只有 status + id 非空（加 AOP 填的 updateTime/updateUser）→ SQL 只更新 `status`、`update_Time`、`update_User` 三个字段。

**同一条 XML、同一个 Mapper 方法，因为 Employee 对象上哪些字段非空不同，生成的 SQL 完全不同。**

> 这和英雄联盟里的**自适应伤害**有异曲同工之妙：同一个技能，根据你的装备（哪些字段非空），自动决定是物理伤害还是魔法伤害（生成不同的 SQL）。你不用写两个技能，一个自适应就够了。

**6. `#{xxx}` 占位符**：MyBatis 用 `PreparedStatement` 预编译 SQL，`#{idNumber}` 会被替换成 `?`，参数值通过安全通道传入——**天然防 SQL 注入**。

---

## 五、第 ①' 步：沿原路返回 Controller

MySQL 执行完 `UPDATE`，受影响行数返回给 MyBatis。断点沿调用栈回退：Mapper → AOP（`@Before` 已执行完毕，不会二次拦截）→ Service（`employeeMapper.update(employee)` 返回 void，方法结束）→ Controller。

```java
return Result.success();
```

### 配角 G：统一返回结果 `Result<T>`

**文件**：`sky-common/src/main/java/com/sky/result/Result.java`

```java
@Data
public class Result<T> implements Serializable {
    private Integer code;  // 1 成功；0 失败
    private String msg;    // 错误信息
    private T data;        // 业务数据（泛型）

    public static <T> Result<T> success() {    // ← 本链路用的是这个无参版
        Result<T> result = new Result<T>();
        result.code = 1;       // 只有 code=1，msg 和 data 都是 null
        return result;
    }

    public static <T> Result<T> success(T object) {   // 登录链路用的带参版
        Result<T> result = new Result<T>();
        result.data = object;
        result.code = 1;
        return result;
    }

    public static <T> Result<T> error(String msg) {
        Result result = new Result();
        result.msg = msg;
        result.code = 0;
        return result;
    }
}
```

- **为什么需要它**：所有接口统一返回 `{code, msg, data}` 格式，前端可以写一个**通用拦截器**：见 `code == 1` 就提示成功，否则弹 `msg` 报错。不用为每个接口单独写解析逻辑。
- 本链路调用的是**无参版** `Result.success()`——编辑操作不需要返回数据。`@RestController` 把它序列化成 JSON：

```json
{ "code": 1, "msg": null, "data": null }
```

前端看到 `code == 1`，弹出"修改成功"提示，刷新员工列表。整条链结束。

---

## 六、总结与思考（比读懂源码更重要的部分）

> **学习心法**：项目的源码会变（换个项目，类名、表名全不一样），但下面这些**设计思想是通用的、可迁移的**。面试官不会问"苍穹外卖的 update 方法第几行写了什么"，但一定会问"你项目里 DTO 和 Entity 为什么分开 / 公共字段怎么自动填充 / 动态 SQL 怎么写的"。所以这一节才是真正要内化的部分——**记套路，而不是记代码**。

### 必背套路一：DTO 作为安全边界——"前端能改什么，DTO 说了算"

**口诀**：`DTO 有什么字段，前端就只能改什么字段；DTO 没有的，前端再怎么传也白搭。`

**为什么必背**：
- **防过度提交（Mass Assignment）**：如果用 `Employee` Entity 直接接参，前端可以恶意传 `"password":"hack"` 或 `"status":0`，框架会自动绑定上去——这是真实的安全事故。DTO 只声明允许修改的字段，Jackson 反序列化时直接忽略 DTO 里没有的字段，从源头堵住越权。
- **接口语义清晰**：看 `EmployeeDTO` 的字段就知道"编辑接口允许改什么"，不用翻业务代码。
- **与动态 SQL 的联动**：DTO 没有的字段 → Entity 里是 `null` → 动态 SQL 跳过 → 数据库原值不变。**前端限制 + SQL 兜底，双保险。**

> ⚠️ 最常见的反模式：直接用 `@RequestBody Employee employee` 接参 → 前端就能注入任意字段 → 典型的 Mass Assignment 漏洞。

### 必背套路二：AOP + 自定义注解 = 横切关注点的优雅分离

**口诀**：`注解是信号灯，切面是执行者。业务代码打个标记就好，公共的脏活累活切面统一干。`

**为什么必背**：
- `updateTime` / `updateUser` 这类"每个写操作都要设"的字段，是**横切关注点（Cross-Cutting Concern）**——它横跨多个业务方法（`update`、`insert`、`save`……），但不属于任何一个方法的核心业务。如果每个 Service 方法都手写一遍，不仅重复，还容易漏。
- AOP 用 `@Before` 在 Mapper 执行前**统一拦截**、用**反射赋值**，Service 方法里一行都不用写。这是**声明式编程（Declarative Programming）** 的典型应用，和 Spring 的 `@Transactional`（事务管理）、`@Cacheable`（缓存）同一个思路——打个注解，框架帮你干。
- 用**反射**而非直接调 setter，是因为切面要通用于所有实体类型（Employee、Category、Dish……），不能写死某一种类。

> 面试追问："为什么用反射？反射有什么缺点？" → "通用性——同一套代码适配所有实体。缺点是编译器不检查方法名拼写，写错了运行时才报错。但这里调用频率不高，性能影响可忽略。"

### 必背套路三：MyBatis 动态 SQL —— `<set>` + `<if>` 实现"只改你传了的字段"

**口诀**：`字段非空才进 SQL，空的跳过不碰库里的值。一条 XML 适配多种更新场景。`

**为什么必背**：
- 写死 `SET name=?, phone=?, status=?` 意味着调用方必须传齐所有字段，否则漏传的就被写成 null。`<if test="xxx != null">` 让 SQL **按需生成**，只更新有值的字段。
- **一条 SQL 复用多个 Service 方法**：编辑基本信息（name/phone 非空）和启用禁用（status 非空）共用同一条 `<update>`，区别只在 Employee 对象上哪些字段非空。
- `<set>` 标签自动处理末尾多余逗号。手写 `SET` 可能出现 `SET name = '张三',  WHERE id = 2`（多逗号导致语法错误），`<set>` 帮你兜底。

> 面试追问："`#{}` 和 `${}` 有什么区别？" → "`#{}` 是预编译占位符，用 PreparedStatement 传参，防 SQL 注入，是默认选择。`${}` 是字符串拼接，有注入风险，只在动态传表名、排序字段等无法用占位符的场景用。"

### 必背套路四：ThreadLocal —— 请求级上下文的跨层透传

**口诀**：`拦截器存、Service 取、用完清。ThreadLocal 是当前线程的私人口袋。`

**为什么必背**：
- "当前操作者是谁"这个信息需要穿越 Controller → Service → AOP 多层使用，但不适合作为方法参数层层传递（改方法签名侵入性太强、且每个方法都要改）。ThreadLocal 提供**隐式的跨层通道**，拦截器写入、业务层读取，方法签名不用改。
- **必须注意的坑——线程复用导致的脏数据**：Tomcat 使用线程池，同一个线程会服务不同的请求。如果请求处理完不 `remove()`，下一个请求可能读到上一次的残留值。生产项目通常在拦截器的 `afterCompletion` 或过滤器的 `finally` 块里做清理。
- **Spring Security 同款思路**：Spring Security 的 `SecurityContextHolder` 底层也是 ThreadLocal，存的是当前登录用户的完整安全上下文。

### 必背套路五：代码演进中的冗余识别——"读代码要有时间线意识"

本条链路中，Service 手动设了 `updateTime` / `updateUser`，AOP 又设了一遍——这是引入 AOP 后旧代码没清理的结果。对比 `startOrStop`（只靠 AOP，不手动设）就能看出"正确写法"。

这类"冗余但不出错"的代码在真实项目里**非常常见**。它不导致 bug（AOP 覆盖了手动值，功能正确），但让阅读者困惑。**读代码时要习惯问自己：这段代码是"当前最佳实践"还是"历史遗留"？**

### 哪些是"生产同款"、哪些是"教学简化"

| 类别 | 内容 | 说明 |
|---|---|---|
| ✅ 生产同款 | DTO 安全边界防过度提交 | 所有规范项目都这么做 |
| ✅ 生产同款 | AOP 自动填充公共字段 | MyBatis-Plus 的 `MetaObjectHandler` 是同一思路 |
| ✅ 生产同款 | 动态 SQL 选择性更新 | 标配写法 |
| ✅ 生产同款 | ThreadLocal 传递操作者身份 | Spring Security 的 `SecurityContextHolder` 也是 ThreadLocal |
| ✅ 生产同款 | 统一返回 `Result<T>` | 前后端协作的基础约定 |
| ⚠️ 教学简化 | `update` 不校验记录是否存在 | 如果传了一个不存在的 id，SQL 更新 0 行也不报错。生产应先查后判空，或检查受影响行数 |
| ⚠️ 教学简化 | 没有乐观锁（Optimistic Lock） | 多人同时编辑同一员工可能互相覆盖。生产常用 `version` 字段 + `WHERE version = ?` 做乐观锁 |
| ⚠️ 教学简化 | Service 与 AOP 冗余设置公共字段 | 应删除 Service 中的手动设置，统一交给 AOP |
| ⚠️ 教学简化 | `getById` 返回的是 Entity 而非 VO | 虽然遮盖了 password，但 createUser、createTime 等内部字段也暴露了。生产应返回 VO |

---

## 七、面试官视角：这条链路我会怎么问（含口述答案）

> 假设我是 Java 后端面试官，看到你简历上写了这个项目，针对"编辑员工信息"这条链路，我大概率会问下面这些。答案按"**面试时能直接口述、30~60 秒讲完**"的口语化风格写。

**Q1：讲一下编辑员工信息的整体流程，数据是怎么从前端到数据库的？**

> 前端发 PUT 请求，JSON 通过 `@RequestBody` 反序列化成 `EmployeeDTO`。Controller 不做业务逻辑，直接调 Service。Service 里用 `BeanUtils.copyProperties` 把 DTO 的字段拷贝到新建的 `Employee` 实体上——DTO 没有的字段在 Entity 里保持 null。然后调 Mapper 的 `update` 方法。Mapper 上标了 `@AutoFill` 注解，所以 AOP 切面会在执行前通过反射自动填充 `updateTime` 和 `updateUser`。最后执行 XML 里的动态 SQL，用 `<if test="xxx != null">` 只更新非空字段，null 的字段不碰——所以密码、状态这些 DTO 里没有的字段不会被改。成功后返回统一的 `Result`。

**Q2：为什么 EmployeeDTO 没有 password 和 status 字段？直接用 Entity 接参不行吗？**

> 这是防过度提交。如果用 Entity 直接接收前端参数，前端恶意在 JSON 里加 `"status":0` 或 `"password":"xxx"`，框架会自动绑定到对象上，再写入数据库就出大问题了。DTO 只声明允许修改的字段，Jackson 反序列化时会忽略 DTO 里没有的字段，从源头堵住越权。再加上动态 SQL 只更新非空字段，就形成了双重保障。

**Q3：`BeanUtils.copyProperties` 是怎么工作的？用它有什么需要注意的？**

> 它是 Spring 提供的工具方法，底层用反射扫描源和目标对象的所有属性，属性名相同且类型兼容的字段会被自动拷贝。需要注意三点：第一，参数顺序是 `(source, target)`，写反了数据方向就反了。第二，它是浅拷贝——如果字段是引用类型，拷的是引用不是深拷贝。第三，属性名必须完全一致，比如一个叫 `name` 一个叫 `empName`，那这个字段不会被拷贝，需要手动补。

**Q4：你项目里公共字段是怎么自动填充的？AOP 具体怎么实现的？**

> 我们在 Mapper 方法上用自定义注解 `@AutoFill` 做标记，然后写了一个 AOP 切面 `AutoFillAspect`，切入点是"mapper 包下所有带 `@AutoFill` 注解的方法"。切面用 `@Before` 前置通知，在 Mapper 方法执行前拦截。它通过 `JoinPoint` 拿到方法的第一个参数——就是实体对象，再根据注解里的操作类型（INSERT 填 4 个字段、UPDATE 填 2 个字段），用反射调用实体的 setter 方法赋值。用反射是因为切面要通用于所有实体类型，不能写死某个类。时间用 `LocalDateTime.now()`，操作者 ID 从 `BaseContext.getCurrentId()` 取——它是 ThreadLocal，由拦截器在请求进来时从 JWT 里解析并存入的。

**Q5：ThreadLocal 在你项目里怎么用的？为什么不直接在方法参数里传 userId？**

> 我们用 ThreadLocal 存储当前登录用户的 ID。JWT 拦截器在请求进入 Controller 之前解析 token，取出 empId，存入 ThreadLocal。后续 Service 或 AOP 需要知道"谁在操作"时，调 `BaseContext.getCurrentId()` 就能拿到，不用改方法签名。如果用参数传递，Controller 每个方法都要加 userId 参数，再传给 Service，Service 再传给 AOP——侵入性太强，方法签名全得改。ThreadLocal 是隐式的跨层通道。但要注意线程池复用问题：请求处理完必须 remove，否则下个请求可能读到上一次的残留值。

**Q6：你这个 update 的 XML 用了动态 SQL，`<set>` 标签有什么好处？为什么不直接写 `SET ...`？**

> `<set>` 标签有两个好处。第一，它和 `<if test="xxx != null">` 配合，只把非空字段拼进 SQL。编辑信息时 password 和 status 是 null 就不会出现在 SQL 里，不碰数据库原值。第二，它自动处理末尾多余逗号——最后一个成立的 `<if>` 行末尾的逗号会被自动去掉，避免语法错误。另外一个很大的好处是 SQL 复用：同一条 `<update>` 我们在编辑信息和启用禁用两个场景都用，区别只在于 Employee 对象上哪些字段非空，动态 SQL 自动适配。

**Q7（设计追问）：如果两个管理员同时编辑同一个员工，会出什么问题？怎么解决？**

> 会出现"后提交覆盖先提交"的问题——A 和 B 同时打开张三的编辑页面，A 改了手机号、B 改了姓名，B 后提交就把 A 改的手机号覆盖了，因为 B 提交时带的还是旧手机号。解决方案是**乐观锁**：给表加一个 `version` 字段，每次更新时在 SQL 里加 `WHERE id = ? AND version = ?`，同时 `SET version = version + 1`。如果 A 先提交成功，version 从 1 变成 2；B 再提交时 `WHERE version = 1` 匹配不到数据，更新 0 行，就知道被别人抢先改了，可以提示用户重新加载。当前项目没做，属于教学简化。

---