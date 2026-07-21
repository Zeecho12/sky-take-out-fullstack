# 新增员工（Add Employee）全链路源码精读：DTO→Entity 转换、ThreadLocal 传参与 AOP 公共字段自动填充

**视频出处**：[在此处填写视频链接/出处]  
**关键词**：三层架构（Controller-Service-Mapper）、DTO/Entity 数据转换、`BeanUtils.copyProperties` 属性拷贝、默认值填充、MD5 单向哈希、ThreadLocal（线程本地变量）、拦截器（Interceptor）、AOP（面向切面编程，Aspect-Oriented Programming）、自定义注解（Custom Annotation）、`@Aspect` 切面 + `@Before` 前置通知、Java 反射（Reflection）、公共字段自动填充（Auto-Fill）、唯一约束冲突（Unique Constraint Violation）、全局异常处理器（Global Exception Handler）、统一返回结果 `Result<T>`  
**创建时间**：2026-06-07 13:33

---

## 〇、阅读这条链路前，先建立"全景地图"

我们要追的这条链是后台管理端最常见的"增"操作：**管理员在页面填好一个新员工的信息 → 点保存 → 后端补全字段后写进数据库**。

它和你已经读过的"员工登录"链路是同一套三层架构，但这条链路藏着两个登录链路里没有的"工业级"知识点，正是它值得单独精读的原因：

1. **公共字段自动填充（Auto-Fill）**——`createTime / updateTime / createUser / updateUser` 这四个"每张表都有、每次写库都要填"的字段，不是手写填的，而是用 **AOP 切面 + 自定义注解 + 反射**自动填的。
2. **跨层传递"当前登录人是谁"**——Service 要填 `createUser`（谁创建的），但它手里只有 `EmployeeDTO`，并没有当前登录员工的 id。这个 id 是怎么"凭空"出现在 Service 里的？答案是 **ThreadLocal + 拦截器**。

还是用餐厅打比方，这条链上的角色比登录链多了两位"幕后人员"：

| 角色 | 项目中的层 | 职责 | 类比 |
|---|---|---|---|
| 门口验票员 | `Interceptor` | 请求进店前先验 token，并把"客人是几号会员"记在便签上 | 在你落座前就先认出你是谁 |
| 前台收银员 | `Controller` | 接客、收单、把成品端出去 | 不炒菜，只对接顾客和后厨 |
| 厨师长 | `Service` | 核心业务逻辑、补默认值、组装实体 | 真正"做判断、备料"的地方 |
| 后厨自动备料机 | `Aspect` | 每道菜下锅前，自动补上"出餐时间、出餐厨师"等公共信息 | 厨师不用每次手写，机器统一盖章 |
| 仓库管理员 | `Mapper` | 按账本把货入库 | 只和数据库打交道 |
| 冷库 | `Database` | 存放原始数据 | MySQL |

**断点调试时，程序会按这个顺序在文件间跳转**（把这张图记在脑子里，后面每一步都对应这里的一行）：

```
前端 POST /admin/employee   （JSON: {username,name,phone,sex,idNumber}；请求头 token 带着登录态）
   │
   ▼
⓪ JwtTokenAdminInterceptor.preHandle()        [sky-server] 验票员
   │   解析 token → 取出 empId → BaseContext.setCurrentId(empId)   （把"我是谁"存进 ThreadLocal）
   ▼
① EmployeeController.save(employeeDTO)         [sky-server] 接客
   │   employeeService.save(dto)
   ▼
② EmployeeServiceImpl.save()                   [sky-server] 厨师长
   │   new Employee() + BeanUtils.copyProperties(dto, employee)   （DTO → Entity 拷贝同名字段）
   │   补默认值：status = ENABLE(1)、password = MD5("123456")
   │   手动填充：createTime/updateTime/createUser/updateUser   （← 注意：稍后会被 ④ 再次覆盖）
   │   employeeMapper.insert(employee)
   ▼
③ EmployeeMapper.insert()   ← 方法上挂着 @AutoFill(INSERT)        [sky-server] 仓库管理员
   │   这次调用被 AOP 切面"截胡"，先转去执行 ④
   ▼
④ AutoFillAspect.autoFill()   @Before 前置通知                    [sky-server] 自动备料机
   │   用反射调用实体的 setCreateTime/User、setUpdateTime/User（再次赋值，盖过 ② 手填的值）
   │   （备料完毕，放行回 ③ 真正执行 SQL）
   ▼
⑤ EmployeeMapper.xml  <insert>                 [sky-server] 账本
   │   insert into employee (name,username,password,...,status) values (#{name},...)
   ▼
MySQL 写入一行
   ├─ 正常 → 一路 void 返回
   └─ 若 username 撞唯一索引 → 抛 SQLIntegrityConstraintViolationException
   │
   ▼
①’ 回到 Controller：return Result.success()
   │
   ├─ 正常：{ "code":1, "msg":null, "data":null }  以 JSON 返回前端
   └─ 异常：被 GlobalExceptionHandler 捕获 → Result.error("xxx已存在")
```

> 跨模块细节（和登录链一样横跨三个 Maven 子模块，但分布略有不同）：
> - **`sky-server`**：`Interceptor`、`Controller`、`ServiceImpl`、`Mapper` 接口、`AutoFillAspect` 切面、`@AutoFill` 注解本体、`GlobalExceptionHandler`、`EmployeeMapper.xml`。
> - **`sky-pojo`**：`EmployeeDTO`（入参）、`Employee`（实体）。
> - **`sky-common`**：`BaseContext`（ThreadLocal 容器）、`OperationType`（枚举）、`AutoFillConstant`、`PasswordConstant`、`StatusConstant`、`MessageConstant`、`Result`。
>
> 一个有意思的依赖关系：`@AutoFill` 注解定义在 `sky-server`，但它引用的 `OperationType` 枚举在 `sky-common`——所以 `sky-server` 依赖 `sky-common`。

下面进入断点逐步走读。

---

## 一、第 ⓪ 步：请求还没进 Controller，拦截器先"认人"

这一步在登录链路里没讲，但它是本条链路能跑通的**前提**，必须先交代。

**为什么需要它**：待会儿 Service 要填 `createUser`（这条记录是谁创建的）。但 `save(EmployeeDTO)` 的入参里**根本没有"当前登录员工 id"这个字段**（你总不能让前端自己上报"我是谁"，那能伪造）。那这个 id 从哪来？——它在请求刚进门、还没到 Controller 时，就被拦截器从 token 里解析出来、悄悄存好了。

**文件**：`sky-server/src/main/java/com/sky/interceptor/JwtTokenAdminInterceptor.java`

```java
@Component
@Slf4j
public class JwtTokenAdminInterceptor implements HandlerInterceptor {

    @Autowired
    private JwtProperties jwtProperties;

    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        // 只拦截 Controller 方法，静态资源等直接放行
        if (!(handler instanceof HandlerMethod)) {
            return true;
        }

        // 1、从请求头里取出 token
        String token = request.getHeader(jwtProperties.getAdminTokenName());

        // 2、校验并解析 token
        try {
            Claims claims = JwtUtil.parseJWT(jwtProperties.getAdminSecretKey(), token);
            Long empId = Long.valueOf(claims.get(JwtClaimsConstant.EMP_ID).toString());

            // ★关键：把当前登录员工 id 存进 ThreadLocal
            BaseContext.setCurrentId(empId);

            return true;   // 3、放行
        } catch (Exception ex) {
            response.setStatus(401);   // 4、token 无效 → 401 未授权
            return false;
        }
    }
}
```

**断点观察**：请求 `POST /admin/employee` 到达服务器后，**Spring MVC 先执行所有匹配的拦截器的 `preHandle`，再进 Controller**。这一帧里：

1. 从请求头读出登录链路签发的那个 JWT。
2. `JwtUtil.parseJWT(...)` 验签 + 解析，拿回 `claims`，从中取出登录时塞进去的 `empId`（还记得登录链路里 `claims.put(JwtClaimsConstant.EMP_ID, employee.getId())` 吗？这里就是把它取回来）。
3. **`BaseContext.setCurrentId(empId)`**——把这个 id 存进一个叫 `BaseContext` 的"线程便签"里。这一步是后面 Service 能拿到 `createUser` 的唯一原因。

> 这一步执行完，登录态就从"一串 token 文本"变成了"当前线程里随处可取的一个 Long"。具体怎么做到"随处可取"，见第三节的 `BaseContext`。

---

## 二、第 ① 步：请求落到 Controller

**文件**：`sky-server/src/main/java/com/sky/controller/admin/EmployeeController.java`

```java
@RestController
@RequestMapping("/admin/employee")   // 类级前缀
@Slf4j
@Api(tags = "员工相关接口")
public class EmployeeController {

    @Autowired
    private EmployeeService employeeService;

    /**
     * 新增员工
     */
    @PostMapping                       // 注意：没有写路径！完整路径 = /admin/employee
    @ApiOperation("新增员工")
    public Result save(@RequestBody EmployeeDTO employeeDTO) {
        log.info("新增员工：{}", employeeDTO);
        employeeService.save(employeeDTO);   // 调一次 Service，本方法的全部"业务"
        return Result.success();             // 不返回数据，只告诉前端"成功了"
    }
    // …… login / page / startOrStop / getById / update 等略
}
```

**断点观察 —— 进方法体前，框架已经做了三件事：**

1. **路由匹配**。`@RequestMapping("/admin/employee")` + `@PostMapping`（括号里**没有子路径**）拼出的完整路径就是 `POST /admin/employee`。
   - *容易踩的坑*：登录接口是 `@PostMapping("/login")`，新增接口是裸的 `@PostMapping`。两者方法名都可以叫别的，真正决定路由的是 **HTTP 方法 + 路径**。这里靠"同样是 `/admin/employee` 路径，但用 `POST` 且无子路径"和别的接口区分开——这正是 RESTful 风格："对同一资源 `employee`，用不同 HTTP 动词表达不同操作"（POST=新增、GET=查询、PUT=修改）。

2. **请求体反序列化**。`@RequestBody` 让 Jackson 把请求体 JSON（`{"username":"zhangsan","name":"张三","phone":"...","sex":"1","idNumber":"..."}`）反序列化成一个 `EmployeeDTO`。

3. **依赖注入**。`@Autowired private EmployeeService employeeService;` 由 Spring 容器注入实现类实例。

**这一层的职责边界**：和登录链路完全一致——Controller 只"收参 → 调一次 Service → 包装返回"，**没有任何业务判断**。注意它的返回类型是裸 `Result`（没写泛型 `Result<T>`），因为新增成功不需要给前端返回任何业务数据，`Result.success()` 里 `data` 就是 `null`。

### 配角 A：`EmployeeDTO`（前端 → 后端 的入参）

**文件**：`sky-pojo/src/main/java/com/sky/dto/EmployeeDTO.java`

```java
@Data
public class EmployeeDTO implements Serializable {
    private Long id;
    private String username;
    private String name;
    private String phone;
    private String sex;
    private String idNumber;
}
```

- **为什么是 DTO 而不是直接用 `Employee`（这条链路里这个区别尤其重要）**：对比一下马上要见到的 `Employee` 实体，它有 13 个字段（含 `password`、`status`、`createTime`、`createUser`…）。如果直接用 `Employee` 接参，前端就**能伪造** `status`、`password`、`createUser` 这些它本不该碰的字段——比如偷偷把自己设成"已禁用绕过"或指定别人当 `createUser`。这就是**过度提交漏洞（Mass Assignment）**。
- `EmployeeDTO` 只留 6 个"前端确实该填"的字段，从源头上堵死了越权。**注意：它没有 `password`、`status`、`createTime`、`createUser` 这些字段——这些"该由后端自己决定"的字段，正是第二步 Service 要补的。**

---

## 三、第 ① 行代码触发跳转：进入 Service，组装实体 + 补默认值

断点单步进入 `employeeService.login` 的兄弟方法——`save`。和登录一样，注入的是接口 `EmployeeService`，运行时执行的是 `EmployeeServiceImpl`。

**文件**：`sky-server/src/main/java/com/sky/service/impl/EmployeeServiceImpl.java`

```java
@Override
public void save(EmployeeDTO employeeDTO) {
    Employee employee = new Employee();

    // ① 对象属性拷贝：把 DTO 里同名字段一次性搬到 Entity
    BeanUtils.copyProperties(employeeDTO, employee);

    // ② 补默认值：账号状态，1=正常 0=锁定
    employee.setStatus(StatusConstant.ENABLE);

    // ③ 补默认值：默认密码 123456，存的是它的 MD5 密文
    employee.setPassword(DigestUtils.md5DigestAsHex(PasswordConstant.DEFAULT_PASSWORD.getBytes()));

    // ④ 手动填充审计字段（★这段稍后会被 AOP 切面再覆盖一遍，见第五节）
    employee.setCreateTime(LocalDateTime.now());
    employee.setUpdateTime(LocalDateTime.now());

    // 通过 ThreadLocal 取出"当前登录人是谁"
    Long currentId = BaseContext.getCurrentId();
    employee.setCreateUser(currentId);   // 这条记录谁创建的
    employee.setUpdateUser(currentId);   // 这条记录谁最后改的

    // ⑤ 入库
    employeeMapper.insert(employee);
}
```

**断点单步走读 —— 这一层在干一件核心的事：把"瘦 DTO"养成"胖 Entity"。**

`@RequestBody` 进来的 `EmployeeDTO` 只有 6 个字段，但要写进 `employee` 表得有 11 个列。缺的 5 类信息（status、password、时间、人）不能让前端给，必须**后端自己补**。这就是 Service 存在的价值——业务规则（"新员工默认启用、默认密码 123456"）写在这里。

逐行拆解：

- **① `BeanUtils.copyProperties(employeeDTO, employee)`**：见配角 B。一句话把 DTO 的 `username/name/phone/sex/idNumber/id` 拷到同名 `Employee` 字段。

- **② `setStatus(StatusConstant.ENABLE)`**：新员工默认"启用"。用常量 `ENABLE`（=1）而不是裸写 `1`，是为了可读性和防笔误。

- **③ `setPassword(...)`**：**新员工没有自己设密码，系统给个默认密码 `123456`**。注意**存进库的不是明文 `"123456"`，而是它的 MD5 密文**——`DigestUtils.md5DigestAsHex("123456".getBytes())`。这样这条记录将来才能和登录链路对上：登录时把用户输入的明文做同样的 MD5，再和这里存的密文比对。
  - *呼应登录链路*：还记得登录时 `password = DigestUtils.md5DigestAsHex(password.getBytes())` 吗？两条链用的是**同一个哈希函数**，所以默认密码 `123456` 能登录成功。

- **④ 手动填 `createTime/updateTime/createUser/updateUser`**：先记住这四行**做了和后面 AOP 切面一模一样的事**——这是本条链路最值得讲的"历史痕迹"，第五节专门展开。

- **`BaseContext.getCurrentId()`**：见配角 C。把第 ⓪ 步拦截器存进 ThreadLocal 的 `empId` 取出来。

### 配角 B：`BeanUtils.copyProperties`（Spring 的属性拷贝工具）

- **为什么需要它**：DTO → Entity 这种"把一个对象的字段搬到另一个对象"的活，如果手写就是 `employee.setUsername(dto.getUsername()); employee.setName(dto.getName()); ...` 一长串，又啰嗦又容易漏。
- **它是什么**：`org.springframework.beans.BeanUtils.copyProperties(source, target)` 用反射，把 `source` 和 `target` 中**名字相同、类型兼容**的属性逐个拷过去。
- **怎么用 / 注意点**：
  - 只拷**同名**属性。`EmployeeDTO` 没有 `password/status/createTime` 等字段，所以这些字段拷完仍是 `null`——这正是后面 ②③④ 要手动补的原因。
  - *面试常考的坑*：Spring 的 `BeanUtils.copyProperties(source, target)` 参数顺序是 **(源, 目标)**；而 Apache Commons 的同名方法是 **(目标, 源)**，顺序相反。用错方向会把数据拷反。本项目用的是 Spring 版。

### 配角 C：`BaseContext`（用 ThreadLocal 跨层传"当前登录人"）

**文件**：`sky-common/src/main/java/com/sky/context/BaseContext.java`

```java
public class BaseContext {

    public static ThreadLocal<Long> threadLocal = new ThreadLocal<>();

    public static void setCurrentId(Long id) { threadLocal.set(id); }
    public static Long getCurrentId() { return threadLocal.get(); }
    public static void removeCurrentId() { threadLocal.remove(); }
}
```

- **为什么需要它（这是本条链路的关键设计之一）**：拦截器（第 ⓪ 步）解析出了 `empId`，但 Service（第 ② 步）才需要用它。两者之间还隔着 Controller。难道要让 `empId` 一路当方法参数传下去——`save(dto, empId)`、`insert(employee, empId)`？那太脏了，每个方法签名都被"当前登录人"污染。
- **它是什么**：`ThreadLocal`（线程本地变量，Thread-Local Variable）是 JDK 提供的一个"**每个线程私有的储物柜**"。同一个 `ThreadLocal` 对象，A 线程存进去的值，B 线程读不到；A 线程在任何方法里都能读回自己存的值。
  - **为什么 ThreadLocal 在这里成立**：Tomcat 处理一个 HTTP 请求，**从拦截器到 Controller 到 Service 到 Mapper，全程是同一个线程**。所以拦截器在这个线程存的 `empId`，Service 在同一个线程取得到。
  - 用餐厅类比：验票员在你手背上盖了个"会员号"的隐形章（存进 ThreadLocal）。你在店里走到哪个柜台（哪一层），柜台一照都能看到这个章，不用你每次报号。但隔壁桌客人（另一个线程）的章和你的互不干扰。
- **怎么用**：拦截器 `setCurrentId(empId)` 存 → Service `getCurrentId()` 取。
- ⚠️ **生产必须注意的坑**：Tomcat 线程是**复用**的（线程池）。这次请求用完不 `remove()`，下次别的请求复用到这个线程时，会读到上一个人残留的 `empId`，造成**数据串台**。规范做法是在拦截器的 `afterCompletion` 里调 `BaseContext.removeCurrentId()` 清理。本教程项目提供了 `removeCurrentId()` 方法但**没有在请求结束时调用它**——这是教学简化，生产代码必须补上。

### 配角 D：`PasswordConstant` 与 `StatusConstant`

**文件**：`sky-common/src/main/java/com/sky/constant/PasswordConstant.java`、`StatusConstant.java`

```java
public class PasswordConstant {
    public static final String DEFAULT_PASSWORD = "123456";
}

public class StatusConstant {
    public static final Integer ENABLE = 1;    // 启用
    public static final Integer DISABLE = 0;   // 禁用
}
```

- **为什么需要它（魔法值，Magic Number）**：如果代码里到处直接写 `1`、`0`、`"123456"`，半年后没人记得 `1` 到底是"启用"还是"禁用"，改起来还容易漏改。抽成有名字的常量后，`StatusConstant.ENABLE` 一眼自解释，且改值只改一处。
- 这也呼应登录链路：登录时 `employee.getStatus() == StatusConstant.DISABLE` 判断账号是否被禁用，用的是同一个 `StatusConstant`。新增时设 `ENABLE`、登录时查 `DISABLE`，两端共用一套常量，语义才不会错位。

---

## 四、第 ③ 步：Mapper 的 insert——但它被 AOP "截胡"了

断点单步进入 `employeeMapper.insert(employee)`。

**文件**：`sky-server/src/main/java/com/sky/mapper/EmployeeMapper.java`

```java
@Mapper
public interface EmployeeMapper {

    /**
     * 插入员工数据
     */
    @AutoFill(OperationType.INSERT)   // ★这个注解是本节的主角
    void insert(Employee employee);
    // …… getByUsername / pageQuery / update / getById 略
}
```

**断点观察 —— 这里发生了一件"看不见的跳转"：**

普通情况下，调 `insert(employee)` 会直接去执行 XML 里的那条 `insert` SQL。但 `insert` 方法上挂着一个**自定义注解 `@AutoFill(OperationType.INSERT)`**，而项目里有一个切面专门"盯着"所有带这个注解的方法。于是断点不会直接进 SQL，而是**先跳到切面 `AutoFillAspect.autoFill()`**（第五节），执行完才回来执行真正的 insert。

这就是 **AOP（面向切面编程）** 的"无感拦截"：调用方（Service）完全不知道中间被插了一脚。

> 留意上一节 `pageQuery`、`getByUsername`、`getById` 这些方法**没有**挂 `@AutoFill`——因为查询不需要填写"创建时间/创建人"。只有 `insert`（挂 `INSERT`）和 `update`（挂 `UPDATE`）这种"写操作"才需要。

---

## 五、第 ④ 步：AutoFillAspect——本条链路的"主角"

这是整条链里**最该学的工业级套路**，单独重点展开。先讲清楚它要解决什么问题，再看它怎么实现。

**为什么需要它（不用会怎样）**：几乎每张业务表都有 `create_time / update_time / create_user / update_user` 这四个"审计字段"。如果不用切面，那么**每一个**新增/修改方法里都得手写第三节那 4~6 行 `setCreateTime(now)...setCreateUser(currentId)...`。表一多、方法一多，这些重复代码就散落在几十个 Service 里，**改一处规则（比如时间格式）要改几十个地方**，还容易漏填。这种"和核心业务无关、但到处都要做"的事，就叫**横切关注点（Cross-Cutting Concern）**。

**它是什么**：AOP 把这种横切逻辑抽出来，集中写在一个**切面（Aspect）**里，再用"切入点（Pointcut）"声明"哪些方法要被它管"。被管的方法执行前/后，切面逻辑自动插进去。

用餐厅类比：与其要求每个厨师炒完菜都自己手写一张"出餐时间 + 厨师工号"的标签贴盘子上（容易忘、格式还不统一），不如在出餐口装一台**自动盖章机**（切面），每盘菜经过时自动盖上统一的时间和工号章。厨师（Service）只管炒菜，盖章的事交给机器。

**文件**：`sky-server/src/main/java/com/sky/aspect/AutoFillAspect.java`

```java
@Aspect        // 声明这是一个切面
@Component     // 同时是 Spring Bean，才能被扫描到
@Slf4j
public class AutoFillAspect {

    /**
     * 切入点：com.sky.mapper 包下、且方法上带 @AutoFill 注解的所有方法
     */
    @Pointcut("execution(* com.sky.mapper.*.*(..)) && @annotation(com.sky.annotation.AutoFill)")
    public void autoFillPointCut() {}

    /**
     * 前置通知：在被切方法执行【之前】先跑这段
     */
    @Before("autoFillPointCut()")
    public void autoFill(JoinPoint joinPoint) {
        log.info("开始进行公共字段自动填充");

        // 1、拿到方法签名，进而拿到方法上的 @AutoFill 注解
        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        AutoFill autoFill = signature.getMethod().getAnnotation(AutoFill.class);
        OperationType operationType = autoFill.value();   // INSERT 还是 UPDATE

        // 2、拿到被拦截方法的参数（约定第 0 个就是实体对象）
        Object[] args = joinPoint.getArgs();
        if (args == null || args.length == 0) {
            return;
        }
        Object entity = args[0];

        // 3、准备要填的值
        LocalDateTime now = LocalDateTime.now();
        Long currentId = BaseContext.getCurrentId();   // ← 又用到了 ThreadLocal 里的登录人

        // 4、按操作类型，用【反射】调实体的 setter
        if (operationType == OperationType.INSERT) {
            try {
                // 新增：4 个字段全填
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
        } else if (operationType == operationType.UPDATE) {   // ← 注意这里有个小瑕疵，下面说
            try {
                // 修改：只填 2 个 update 字段
                Method setUpdateTime = entity.getClass().getDeclaredMethod(AutoFillConstant.SET_UPDATE_TIME, LocalDateTime.class);
                Method setUpdateUser = entity.getClass().getDeclaredMethod(AutoFillConstant.SET_UPDATE_USER, Long.class);

                setUpdateTime.invoke(entity, now);
                setUpdateUser.invoke(entity, currentId);
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        }
    }
}
```

**断点单步走读（这一帧发生在 SQL 执行之前）：**

1. **`@Pointcut("execution(* com.sky.mapper.*.*(..)) && @annotation(...AutoFill)")`**——这串表达式定义了"切哪里"：
   - `execution(* com.sky.mapper.*.*(..))`：`com.sky.mapper` 包下任意类的任意方法（任意返回值、任意参数）。
   - `&& @annotation(com.sky.annotation.AutoFill)`：并且方法上必须带 `@AutoFill`。
   - 两个条件**与**起来，精确锁定到 `insert`、`update` 这两个挂了注解的方法。

2. **`@Before`** 前置通知：在被切方法**执行之前**先跑。所以执行顺序是 `autoFill()` 先跑完 → 再执行 `EmployeeMapper.xml` 的 insert SQL。

3. **从注解里读出操作类型**：`signature.getMethod().getAnnotation(AutoFill.class).value()` 拿到 `INSERT`。这一步决定了"填 4 个字段还是 2 个字段"。

4. **`joinPoint.getArgs()[0]` 拿到实体对象**：这里有个**隐式约定**——所有挂 `@AutoFill` 的 Mapper 方法，第一个参数必须是待填充的实体（`insert(Employee employee)` 满足）。

5. **用反射调 setter**：见配角 E。

### 配角 E：Java 反射（Reflection）—— 为什么这里非用反射不可

- **为什么这里不能直接 `entity.setCreateTime(now)`**：因为切面要服务**所有**实体（`Employee`、`Category`、`Dish`、`Setmeal`……），它在编译期**根本不知道传进来的 `entity` 具体是哪个类**——参数类型声明的是 `Object`。`Object` 上没有 `setCreateTime` 方法，编译都过不了。
- **反射是什么**：反射让程序在**运行时**才去"问"一个对象："你这个类有没有名叫 `setCreateTime`、参数是 `LocalDateTime` 的方法？有的话帮我调用它。"
  - `entity.getClass().getDeclaredMethod("setCreateTime", LocalDateTime.class)` → 运行时找到那个 setter（`Method` 对象）。
  - `method.invoke(entity, now)` → 运行时调用它，等价于 `entity.setCreateTime(now)`。
- 方法名字符串 `"setCreateTime"` 等抽到了 `AutoFillConstant`（配角 F），避免手写拼错——反射里方法名拼错编译期不报错，只在运行时炸，所以用常量更稳。
- *代价*：反射比直接调用慢、且绕过了编译期检查。但它换来了**通用性**——一个切面通吃所有实体。这是典型的"用一点性能换巨大的可维护性"。

### 配角 F：`@AutoFill` 注解 + `OperationType` 枚举 + `AutoFillConstant`

**文件**：`sky-server/src/main/java/com/sky/annotation/AutoFill.java`

```java
@Target(ElementType.METHOD)            // 这个注解只能加在方法上
@Retention(RetentionPolicy.RUNTIME)    // ★运行时仍保留，否则切面在运行时读不到它
public @interface AutoFill {
    OperationType value();             // 注解的属性：操作类型
}
```

- **`@Retention(RUNTIME)` 是命门**：注解的保留策略有 SOURCE / CLASS / RUNTIME 三档。只有 `RUNTIME` 才能让注解信息保留到运行时，切面 `getAnnotation(AutoFill.class)` 才读得到。如果写成 `CLASS`（默认）或 `SOURCE`，编译后注解就没了，切面拿到的是 `null`，整套机制失效。
- **`@Target(METHOD)`**：限定它只能贴在方法上（贴在 Mapper 的 `insert`/`update` 上）。

**文件**：`sky-common/src/main/java/com/sky/enumeration/OperationType.java`

```java
public enum OperationType {
    UPDATE,    // 更新操作
    INSERT     // 插入操作
}
```

- 用**枚举**而不是字符串 `"insert"`/`"update"` 来表示操作类型，好处是**编译期就限定了取值范围**——你写不出 `@AutoFill("inset")` 这种拼错的字符串，IDE 会自动补全 `OperationType.INSERT`。

**文件**：`sky-common/src/main/java/com/sky/constant/AutoFillConstant.java`

```java
public class AutoFillConstant {
    public static final String SET_CREATE_TIME = "setCreateTime";
    public static final String SET_UPDATE_TIME = "setUpdateTime";
    public static final String SET_CREATE_USER = "setCreateUser";
    public static final String SET_UPDATE_USER = "setUpdateUser";
}
```

- 反射要用方法名的**字符串**。抽成常量，既防拼错，也保证实体类里的 setter 必须严格叫这几个名字（命名约定）。

### ★ 本节最重要的教学点：手动填充 与 AOP 自动填充"撞车"了

回头看第三节 Service 的 `save`，它**手动**写了：

```java
employee.setCreateTime(LocalDateTime.now());
employee.setUpdateTime(LocalDateTime.now());
employee.setCreateUser(currentId);
employee.setUpdateUser(currentId);
```

而本节的切面 `autoFill`，在 `insert` 执行前**又把这 4 个字段填了一遍**。也就是说，这条链路里这 4 个审计字段被**填了两次**：

```
② Service 手动 set  →  ③ 调 insert  →  ④ 切面 @Before 再 set 一遍（覆盖②）  →  ⑤ 真正写 SQL
                                          ↑ 最终入库的是切面填的值
```

- **谁的值最终入库**：切面在 `@Before` 阶段执行，**晚于** Service 的手动赋值、**早于** SQL。所以**切面后填的值会覆盖 Service 手填的值**，最终写进数据库的是切面那一版（两版的值其实几乎一样：都是 `now` 和同一个 `currentId`，只差几微秒，所以结果上看不出差别）。
- **为什么会这样（历史痕迹）**：这是教程典型的"分阶段教学留痕"。课程**前期**先教"在 Service 里手动填审计字段"；**后期**才引入"AOP 自动填充"这个进阶套路。引入切面后，`save` 里那 4 行手动代码**本应删掉**，但教程（或学生）没删，于是新旧两套并存。
- **读代码的纪律**：**功能上，Service 里那 4 行手动填充已经是冗余的死代码**——删掉它们，靠切面填，结果完全一样。真实项目里这种"新机制上线了、旧代码忘了清"的情况极其常见。读代码要看**实际运行效果**（切面会兜底），而不是被"看起来 Service 在认真填"迷惑。

> 顺带指出切面里一个小瑕疵（不影响功能，但面试官可能拿来考你眼力）：`else if (operationType == operationType.UPDATE)` 这里是**用实例引用 `operationType` 去访问静态枚举常量 `UPDATE`**，编译器会给警告。本意应写成 `operationType == OperationType.UPDATE`。它能正常工作，但属于不规范写法。

---

## 六、第 ⑤ 步：XML 真正写库 + 回到 Controller + 唯一约束兜底

断点从切面返回，回到 `insert`，执行真正的 SQL。

**文件**：`sky-server/src/main/resources/mapper/EmployeeMapper.xml`

```xml
<mapper namespace="com.sky.mapper.EmployeeMapper">   <!-- namespace = 接口全限定名 -->

    <!-- id = 接口方法名 insert -->
    <insert id="insert">
        insert into employee
            (name, username, password, phone, sex, id_number,
             create_time, update_time, create_user, update_user, status)
        values
            (#{name}, #{username}, #{password}, #{phone}, #{sex}, #{idNumber},
             #{createTime}, #{updateTime}, #{createUser}, #{updateUser}, #{status})
    </insert>
    <!-- …… 其他 SQL 略 -->
</mapper>
```

**数据流细节：**
- `namespace`（接口全限定名）+ `<insert>` 的 `id`（方法名 `insert`）两者一拼，MyBatis 就知道"调 `EmployeeMapper.insert` 时执行这条 SQL"——和登录链路里 `getByUsername` 的对接机制完全一样。
- `#{name}`、`#{idNumber}` 等占位符，MyBatis 用 `PreparedStatement` 把它们替换成 `employee` 对象对应属性的值（预编译占位符，天然防 SQL 注入）。注意 SQL 列名是下划线 `id_number`，实体属性是驼峰 `idNumber`，靠的是 `map-underscore-to-camel-case` 配置自动映射；但 `#{}` 里写的是**属性名**（`#{idNumber}`），不是列名。
- 这条 SQL 把 11 个列**全部显式列出**——因为此刻 `employee` 的这 11 个字段都已被填满（前 6 个来自 DTO，后 5 个来自 Service/切面），没有一个是 `null`。

执行成功后，`insert` 方法 `void` 返回 → Service `save` 返回 → 回到 Controller。

**第 ①’ 步：Controller 收尾**

```java
employeeService.save(employeeDTO);
return Result.success();   // data 为 null，只表示"成功"
```

最终 `@RestController` 把它序列化成 JSON 返回前端：

```json
{ "code": 1, "msg": null, "data": null }
```

整条"成功路径"结束。

### 配角 G：统一返回结果 `Result<T>`

**文件**：`sky-common/src/main/java/com/sky/result/Result.java`

```java
@Data
public class Result<T> implements Serializable {
    private Integer code; // 1 成功；0 和其它数字失败
    private String msg;   // 错误信息
    private T data;        // 业务数据

    public static <T> Result<T> success() {            // ← 新增接口用的就是这个无参版
        Result<T> result = new Result<T>();
        result.code = 1;
        return result;
    }
    public static <T> Result<T> success(T object) { /* 带数据，登录/查询用 */ }
    public static <T> Result<T> error(String msg)  { /* code=0, msg=... */ }
}
```

- 新增接口不需要回传数据，所以调的是**无参的 `success()`**——只把 `code` 设成 1，`data` 保持 `null`。这和登录接口的 `success(vo)`（带数据）形成对比：同一个 `Result` 壳，既能装数据也能不装。
- 前端无论调哪个接口，都先看 `code`：`1` 就当成功，`0` 就弹 `msg`。统一的返回结构让前端用一套逻辑应对所有接口。

### 配角 H：唯一约束冲突的兜底——`GlobalExceptionHandler`

这条链路有一个登录链路没有的"失败分支"：**如果新增的 `username` 和库里已有员工重名**（数据库 `employee.username` 上建了唯一索引），insert 会失败。

**为什么需要它**：Service 的 `save` 里**没有**先 `select` 查一遍"用户名是否已存在"。它把这个校验**交给数据库的唯一约束**来兜底。约束被触发时，JDBC 会抛出 `SQLIntegrityConstraintViolationException`。这个异常**不是** `BaseException` 的子类，所以登录链路里那个 `exceptionHandler(BaseException)` 接不住它——于是有了第二个处理方法专门接它。

**文件**：`sky-server/src/main/java/com/sky/handler/GlobalExceptionHandler.java`

```java
@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    // ① 接业务异常（登录链路用的那个）
    @ExceptionHandler
    public Result exceptionHandler(BaseException ex){
        log.error("异常信息：{}", ex.getMessage());
        return Result.error(ex.getMessage());
    }

    // ② 专门接 SQL 唯一约束冲突（本条链路的失败分支）
    @ExceptionHandler
    public Result exceptionHandler(SQLIntegrityConstraintViolationException ex){
        // 原始异常信息形如：Duplicate entry 'zhangsan' for key 'employee.idx_username'
        String message = ex.getMessage();
        if (message.contains("Duplicate entry")) {
            String[] split = message.split(" ");
            String username = split[2];                        // 取出 'zhangsan'
            String msg = username + MessageConstant.ALREADY_EXISTS;   // 拼成 "zhangsan已存在"
            return Result.error(msg);
        } else {
            return Result.error(MessageConstant.UNKNOWN_ERROR);
        }
    }
}
```

- **数据流**：DB 抛 `SQLIntegrityConstraintViolationException` → 一路冒泡，**Controller 的 `save` 被中断**（`Result.success()` 根本不会执行）→ 冒泡到最外层被这个方法捕获 → 解析出冲突的用户名 → 转成 `Result.error("zhangsan已存在")` 返回前端。
- **为什么用"约束兜底"而不是"先查再插"**：如果先 `select` 判重再 `insert`，在高并发下两个请求可能同时查到"不存在"然后都去插，造成竞态（race condition）。**让数据库的唯一约束做最终裁判**才是真正可靠的——它在数据库层面保证了原子性。先查只是"提前友好提示"，不能替代约束。
- ⚠️ *脆弱点（生产要改）*：这里靠 `message.split(" ")[2]` 从异常文本里截用户名，强依赖 MySQL 异常信息的具体格式。一旦数据库版本变、信息格式变，下标 `[2]` 就取错了。生产更稳妥的做法是先查重给友好提示 + 保留约束兜底，或捕获后只回一句"用户名已存在"而不去解析原文。

---

## 七、总结与思考（比读懂源码更重要的部分）

> **学习心法**：和登录链路一样，类名表名都会变，但下面这些**设计思想可迁移**。这条链路真正的"新知识"是后三条套路（DTO→Entity 转换、ThreadLocal 跨层传参、AOP 自动填充），它们在面试里出现的频率非常高——尤其是"你项目里 AOP 用在哪了"几乎是必问。记套路，不要记代码。

### 1. 必背套路一：Service 是"补全默认值"的地方（接口契约 vs 落库实体）

**口诀**：`前端只给该给的，后端补该补的，二者在 Service 汇合。`

- 入参 `EmployeeDTO` 只有 6 个字段，落库 `Employee` 要 11 个。缺的 `status / password / 审计字段` **绝不能让前端给**（防越权），必须由 **Service 按业务规则补**：新员工默认启用、默认密码 `123456`。
- 为什么必背：这是"业务逻辑该放哪一层"的标准答案——**默认值、状态初始化、业务规则属于 Service**，不属于 Controller（它只接客）、也不属于 Mapper（它只存取）。

### 2. 必背套路二：DTO → Entity 用 `BeanUtils.copyProperties`，别手写一堆 set

**口诀**：`同名字段一把梭，剩下的再手动补。`

- `BeanUtils.copyProperties(dto, entity)` 拷同名字段，省去十几行 `setXxx`。
- 面试坑：**Spring 版参数是 (源, 目标)，Apache 版是 (目标, 源)**，方向相反，记反了数据全丢。
- 它只拷同名属性，拷不到的字段（password/status…）仍是 null——这恰好和"套路一"衔接：拷完，Service 补剩下的。

### 3. 必背套路三：ThreadLocal + 拦截器，跨层传"当前登录人"

**口诀**：`进门盖个章（拦截器存），全程随地查（任意层取），出门记得擦（remove）。`

- HTTP 请求**全程同一个线程**（拦截器→Controller→Service→Mapper），所以拦截器存进 `ThreadLocal` 的 `empId`，Service 取得到，**不用把 empId 当参数一层层传**。
- 为什么必背：这是"获取当前登录用户"的工业标准实现，几乎所有后台系统都这么干。
- ⚠️ 面试必追问的反模式：**线程池复用线程，请求结束不 `remove()` 会导致数据串台**——这是 ThreadLocal 最经典的内存泄漏 + 脏数据陷阱。本项目提供了 `removeCurrentId()` 但没在请求结束时调用，是教学简化。

### 4. 必背套路四：AOP + 自定义注解 + 反射，统一处理"横切关注点"

**口诀**：`重复的、和业务无关的活，抽成切面自动盖章。`

这是本条链路的"皇冠"，拆成四块记：

| 组件 | 角色 | 关键点 |
|---|---|---|
| `@AutoFill` 自定义注解 | "贴在哪些方法上要自动填" 的标记 | 必须 `@Retention(RUNTIME)`，否则运行时读不到 |
| `OperationType` 枚举 | 区分 INSERT（填4个）/ UPDATE（填2个） | 用枚举不用字符串，编译期限定取值 |
| `@Aspect` + `@Pointcut` + `@Before` | 切面本体 | Pointcut 表达式精确锁定"mapper 包下带 @AutoFill 的方法"；`@Before` 在 SQL 前执行 |
| 反射 `getDeclaredMethod` + `invoke` | 通用赋值手段 | 切面不知道实体具体类型，只能运行时反射调 setter |

- 为什么必背：AOP 是 Spring 两大基石之一（另一个是 IoC/DI）。面试问"AOP 在你项目里用在哪"，"公共字段自动填充"是最好答的实例——能完整讲出"注解标记 → 切面拦截 → 反射赋值"这条链，就说明你真懂 AOP，而不只会背"切面是什么"。
- 它解决的本质问题：**横切关注点（Cross-Cutting Concern）** ——日志、事务、权限、审计字段填充，都是"散落在各处、和核心业务无关"的逻辑，AOP 把它们集中托管。

### 5. 必背套路五：能交给数据库约束的校验，就别在应用层"先查再写"

**口诀**：`唯一性交给唯一索引，应用层判重只是锦上添花。`

- 用户名查重，本项目**不先 select**，而是让 `username` 唯一索引在 insert 时兜底，冲突就抛 `SQLIntegrityConstraintViolationException`，由 `GlobalExceptionHandler` 转成"xxx已存在"。
- 为什么必背：高并发下"先查再插"有竞态（两个请求同时查到"不存在"都去插）。**约束是数据库层面的原子保证，才是最终防线。**

### 6. 哪些是"生产同款"、哪些是"教学简化"

**生产同款（直接保留）：** 三层架构、DTO/Entity 分离防越权、`BeanUtils` 拷贝、ThreadLocal+拦截器取登录人、AOP 公共字段自动填充、唯一约束兜底 + 全局异常、统一返回。这几样是规范 Spring Boot 项目的标配。

**教学简化（要知道怎么升级）：**
- ⚠️ **Service 里手动填审计字段的 4 行是冗余死代码**（已被 AOP 切面覆盖）→ 生产应删除，只留切面。
- ⚠️ **ThreadLocal 未 `remove()`** → 生产必须在拦截器 `afterCompletion` 清理，否则线程池复用导致脏数据。
- ⚠️ **默认密码 `123456` + 纯 MD5**（不加盐、抗不住彩虹表）→ 生产用 BCrypt，且首次登录强制改密。
- ⚠️ **`message.split(" ")[2]` 解析异常文本取用户名**，强依赖 MySQL 报错格式 → 脆弱，生产改为捕获后回固定友好提示，或先查重提示 + 约束兜底。
- ⚠️ 切面里 `operationType == operationType.UPDATE` 应为 `OperationType.UPDATE`（用实例访问静态成员，不规范但能跑）。

---

## 八、面试官视角：这条链路我会怎么问（含口述答案）

> 假设我是 Java 后端面试官，看到你简历写了这个项目，针对"新增员工"这条链路，我大概率会问下面这些。答案按"面试时能直接口述、30~60 秒讲完"的风格写。

**Q1：新增员工时，前端只传了 5 个字段，但数据库表有 11 个列，缺的字段是怎么补上的？**
> 缺的字段分两类，在 Service 层补。第一类是业务默认值，比如账号状态默认设成启用、密码默认是 123456 的 MD5 值，这些是后端按业务规则自己定的，绝不能让前端传，否则会有越权风险。第二类是 createTime、updateTime、createUser、updateUser 这四个审计字段，它们由 AOP 切面在写库前自动填，不用每个方法手写。前端传进来的 5 个字段我用 `BeanUtils.copyProperties` 从 DTO 拷到实体，剩下的后端补全，最后一起 insert。

**Q2：Service 里要填"创建人 createUser"，但入参 DTO 里没有当前登录员工的 id，这个 id 是从哪来的？**
> 来自 ThreadLocal。请求进 Controller 之前，有个 JWT 拦截器会先解析请求头里的 token，取出登录时存进去的员工 id，然后调 `BaseContext.setCurrentId` 把它存进一个 ThreadLocal。因为一个 HTTP 请求从拦截器到 Service 全程是同一个线程，所以 Service 里直接 `BaseContext.getCurrentId` 就能取回这个 id，不用把它当参数一层层传下去。要注意的是线程池会复用线程，请求结束必须 remove，否则会读到上一个请求残留的 id 造成串台。

**Q3：你项目里 AOP 用在哪了？讲讲公共字段自动填充是怎么实现的。**
> 用在审计字段的自动填充上。几乎每张表都有创建时间、创建人、修改时间、修改人这四个字段，如果每个新增修改方法都手写就太重复了，所以抽成一个切面。具体分四块：先定义一个自定义注解 `@AutoFill`，带一个 OperationType 参数区分是插入还是更新，注解的保留策略必须是 RUNTIME；然后在需要自动填充的 Mapper 方法上贴这个注解；再写一个 `@Aspect` 切面，用切入点表达式锁定"mapper 包下带 @AutoFill 的方法"，用 `@Before` 前置通知在 SQL 执行前介入；通知里从注解读出操作类型，拿到方法参数里的实体，因为切面不知道实体具体类型，所以用反射调它的 setCreateTime 这些 setter 完成赋值。插入填四个字段，更新只填两个。

**Q4：注解的 `@Retention` 为什么必须是 RUNTIME？写成默认的会怎样？**
> 注解的保留策略有 SOURCE、CLASS、RUNTIME 三档，分别是只在源码、保留到 class 文件、保留到运行时。我的切面是在运行时通过反射 `getAnnotation` 去读这个注解的，只有 RUNTIME 才能让注解信息保留到运行时被读到。如果用默认的 CLASS 或者 SOURCE，编译之后注解信息就没了，切面运行时拿到的是 null，整个自动填充机制就失效了，而且不会报编译错误，属于很隐蔽的坑。

**Q5：这里为什么用反射调 setter，不直接 `entity.setCreateTime()`？反射有什么代价？**
> 因为这个切面要服务所有实体——Employee、Dish、Category 等等，它在编译期不知道传进来的具体是哪个类，参数类型只能声明成 Object，而 Object 上没有 setCreateTime 方法，直接调编译都过不了。反射让我在运行时才去问这个对象有没有这个 setter 再调用，换来了"一个切面通吃所有实体"的通用性。代价是反射比直接调用慢，而且绕过了编译期检查，方法名拼错只在运行时才暴露——所以项目里把方法名抽成了常量来降低拼错风险。这是典型的拿一点性能换可维护性。

**Q6：新增员工时用户名重复了会怎样？你是怎么处理的？为什么不先查一遍再插？**
> username 上建了唯一索引，重复时 insert 会抛 `SQLIntegrityConstraintViolationException`。我用全局异常处理器专门接这个异常，从异常信息里解析出冲突的用户名，拼成"xxx已存在"返回前端。之所以不先 select 判重再插，是因为高并发下两个请求可能同时查到"不存在"然后都去插，会有竞态问题；让数据库的唯一约束做最终裁判才是原子可靠的。先查只能做友好提示，不能替代约束。不过我也知道现在靠字符串 split 取用户名比较脆弱，依赖 MySQL 报错格式，生产里我会改成回固定提示或者查重加约束双保险。

**Q7（眼力题）：我看 Service 的 save 里已经手动 setCreateTime、setCreateUser 了，切面里又填了一遍，这是不是 bug？最终存的是哪个值？**
> 这其实是冗余，不是功能 bug。切面是 `@Before`，在 Service 调 insert 之后、真正执行 SQL 之前才跑，所以切面填的值会覆盖 Service 手填的值，最终入库的是切面那一版——两版的值几乎一样，都是当前时间和同一个登录人 id，差几微秒，看不出区别。会出现这种重复，是因为教程前期先教手动填，后期才引入 AOP 自动填充，引入后那几行手动代码本该删掉但没删。功能上 Service 那几行已经是死代码，删掉只靠切面填，结果完全一样。这也提醒读代码要看实际运行效果，别被"看起来在认真填"误导。

---
