# 启用禁用员工账户（Enable & Disable）全链路源码精读：@PathVariable 路径参数、AOP 公共字段自动填充与 MyBatis 动态 SQL

**视频出处**：[在此处填写视频链接/出处]  
**关键词**：三层架构（Controller-Service-Mapper）、`@PathVariable` 路径参数 vs 查询参数（Query Param）绑定、RESTful 路径设计、Builder 模式（建造者模式，Builder Pattern）构造"部分字段"对象、ThreadLocal（线程本地变量）、AOP（面向切面编程，Aspect-Oriented Programming）公共字段自动填充（Auto-Fill，UPDATE 分支）、自定义注解（Custom Annotation）、Java 反射（Reflection）、MyBatis 动态 SQL（Dynamic SQL：`<set>` + `<if>`）、空值不覆盖（避免 Null Overwrite）、SQL 复用、统一返回结果 `Result<T>`  
**创建时间**：2026-06-08 19:35

---

## 〇、阅读这条链路前，先建立"全景地图"

这条链是后台管理端的"改状态"操作：**管理员在员工列表点了一下"禁用/启用"开关 → 后端把这条员工记录的 `status` 字段从 1 改成 0（或反过来）→ 顺手记下"这次是谁、什么时候改的"**。

它和你已经读过的"员工登录""新增员工"是同一套三层架构，但这条链路最值得单独精读的，是它把三个登录链没怎么展开的知识点拧在了一起，而且彼此**环环相扣**：

1. **入参绑定的两种姿势**——`status` 走 URL 路径（`@PathVariable`），`id` 走查询字符串（不带注解）。一个接口里同时出现两种参数来源，正好拿来对比 `@RequestBody` / `@PathVariable` / 查询参数三者的区别。
2. **只改想改的字段**——Service 用 Builder 只往实体里装了 `id` 和 `status` 两个字段，其余 9 个字段全是 `null`。可数据库那条 `update` SQL 如果"无脑全字段更新"，就会把 `name`、`phone`、`password` 统统改成 `null`！它是怎么做到"只更新 status，不动其它列"的？答案是 **MyBatis 动态 SQL（`<set>` + `<if>`）**——这是本条链路的"皇冠"。
3. **AOP 公共字段自动填充的 UPDATE 分支**——`update_time`、`update_user` 这两个字段，Service 一行都没填，是 AOP 切面在写库前自动补的。（这个切面你在"新增员工"那条笔记里已从 INSERT 角度见过，本篇看它的 UPDATE 分支，并揭示它和动态 SQL 是怎么"打配合"的。）

> 如果你还没读过 `新增员工（Add Employee）...AOP 公共字段自动填充.md`，不要紧，本篇会把切面再完整讲一遍，可独立阅读。

还是用餐厅打比方，这条链上的角色和"新增员工"几乎一样：

| 角色 | 项目中的层 | 职责 | 类比 |
|---|---|---|---|
| 门口验票员 | `Interceptor` | 请求进店前先验 token，把"客人是几号会员"记在便签上 | 在你落座前就认出你是谁 |
| 前台收银员 | `Controller` | 接客、收单、把成品端出去 | 不炒菜，只对接顾客和后厨 |
| 厨师长 | `Service` | 组装一个"只含要改的字段"的实体 | 只备"要换的那味料"，别的不动 |
| 后厨自动盖章机 | `Aspect` | 每道"写库"的菜下锅前，自动补上"出餐时间、出餐厨师工号" | 厨师不用每次手写，机器统一盖章 |
| 仓库管理员 | `Mapper` | 按账本改库里的货 | 只和数据库打交道 |
| 智能账本 | `Mapper.xml` 动态 SQL | "你给了哪几样，我就改哪几样，没给的不动" | 看菜下单，绝不乱改没点的 |
| 冷库 | `Database` | 存放原始数据 | MySQL |

**断点调试时，程序会按这个顺序在文件间跳转**（把这张图记在脑子里，后面每一步都对应这里的一行）：

```
前端 POST /admin/employee/status/{status}?id=xxx
     （请求头 token 带登录态；status 在 URL 路径里，id 在查询字符串里）
   │
   ▼
⓪ JwtTokenAdminInterceptor.preHandle()        [sky-server] 验票员
   │   解析 token → 取出 empId → BaseContext.setCurrentId(empId)   （存进 ThreadLocal，供 ④ 用）
   ▼
① EmployeeController.startOrStop(status, id)   [sky-server] 接客
   │   @PathVariable 绑 status；id 作为"查询参数"按名字绑定
   │   employeeService.startOrStop(status, id)
   ▼
② EmployeeServiceImpl.startOrStop()            [sky-server] 厨师长
   │   Employee.builder().status(status).id(id).build()   （只装 2 个字段，其余 9 个全 null）
   │   employeeMapper.update(employee)
   ▼
③ EmployeeMapper.update()  ← 方法上挂着 @AutoFill(UPDATE)        [sky-server] 仓库管理员
   │   这次调用被 AOP 切面"截胡"，先转去执行 ④
   ▼
④ AutoFillAspect.autoFill()   @Before 前置通知                   [sky-server] 自动盖章机
   │   反射调 setUpdateTime(now)、setUpdateUser(empId)
   │   （现在实体有 4 个非 null 字段：id、status、updateTime、updateUser；备料完毕回 ③）
   ▼
⑤ EmployeeMapper.xml  <update> + <set>/<if>    [sky-server] 智能账本
   │   只把"非 null"的字段拼进 SQL：
   │   update employee set update_time=?, update_user=?, status=? where id=?
   ▼
MySQL 更新一行（name/phone/password 等没被碰，因为它们是 null 被 <if> 跳过了）
   │   （一路 void 返回）
   ▼
①’ 回到 Controller：return Result.success()  →  { "code":1, "msg":null, "data":null }  以 JSON 返回前端
```

> 跨模块细节（和前两条链一样横跨三个 Maven 子模块）：
> - **`sky-server`**：`Interceptor`、`Controller`、`ServiceImpl`、`Mapper` 接口、`AutoFillAspect` 切面、`@AutoFill` 注解本体、`EmployeeMapper.xml`。
> - **`sky-pojo`**：`Employee`（实体，这条链里没用到 DTO，因为入参就两个简单值）。
> - **`sky-common`**：`BaseContext`（ThreadLocal 容器）、`OperationType`（枚举）、`AutoFillConstant`、`StatusConstant`、`Result`。

下面进入断点逐步走读。

---

## 一、第 ⓪ 步：请求还没进 Controller，拦截器先"认人"

这一步本身不属于 `startOrStop` 的方法体，但它是后面第 ④ 步能填对 `update_user` 的**前提**，必须先交代。

**为什么需要它**：待会儿切面要填 `update_user`（这条记录是"谁"改的）。但 `startOrStop(status, id)` 的入参里**根本没有"当前登录员工 id"**——前端只告诉了你"把哪个员工(id)改成什么状态(status)"，没说"我是谁"（也不能让前端自己上报，能伪造）。那"操作人是谁"从哪来？它在请求刚进门、还没到 Controller 时，就被拦截器从 token 里解析出来、悄悄存进了 ThreadLocal。

**文件**：[JwtTokenAdminInterceptor.java](sky-server/src/main/java/com/sky/interceptor/JwtTokenAdminInterceptor.java)

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

            return true;   // 3、通过，放行
        } catch (Exception ex) {
            response.setStatus(401);   // 4、token 无效 → 401 未授权
            return false;
        }
    }
}
```

**断点观察**：请求到达服务器后，**Spring MVC 先执行所有匹配的拦截器的 `preHandle`，再进 Controller**。这一帧里：

1. 从请求头读出登录链路签发的那个 JWT。
2. `JwtUtil.parseJWT(...)` 验签 + 解析，拿回 `claims`，取出登录时塞进去的 `empId`。
3. **`BaseContext.setCurrentId(empId)`**——把这个 id 存进"线程便签"。这一步是第 ④ 步切面能填对 `update_user` 的唯一原因。

> 这一步执行完，登录态就从"一串 token 文本"变成了"当前线程里随处可取的一个 Long"。`BaseContext` 的细节见第四节配角 D。

---

## 二、第 ① 步：请求落到 Controller —— 两种入参绑定方式的对比课

**文件**：[EmployeeController.java](sky-server/src/main/java/com/sky/controller/admin/EmployeeController.java)

```java
@RestController
@RequestMapping("/admin/employee")   // 类级前缀
@Slf4j
@Api(tags = "员工相关接口")
public class EmployeeController {

    @Autowired
    private EmployeeService employeeService;

    /**
     * 启用禁用员工账户
     */
    @PostMapping("/status/{status}")          // 完整路径 = POST /admin/employee/status/{status}
    @ApiOperation("启用禁用员工账户")
    public Result startOrStop(@PathVariable Integer status, Long id) {
        log.info("启用禁用员工账户：{}，{}", status, id);
        employeeService.startOrStop(status, id);   // 调一次 Service，本方法的全部"业务"
        return Result.success();                   // 不返回数据，只告诉前端"成功了"
    }
    // …… login / save / page / getById / update 等略
}
```

**断点观察 —— 进方法体前，框架已经替我们绑好了两个来源完全不同的参数：**

这是本条链路第一个值得停下来的点。你已经在前两条链见过 `@RequestBody`（登录、新增都用它把 JSON 转成对象）。但这个接口的两个参数，**一个都没用 `@RequestBody`**，而是各走各的路：

1. **`status` —— `@PathVariable`（路径变量，Path Variable）**：
   - 路径模板里写了 `{status}` 这个占位段：`@PostMapping("/status/{status}")`。当请求是 `POST /admin/employee/status/0` 时，Spring 把 URL 里 `status` 段的值 `0` 取出来，绑定到同名方法参数 `status` 上。
   - *为什么把它放路径里*：`status` 是"对哪个资源做什么操作"里"操作"的一部分，放路径上符合 RESTful 风格——URL 本身就读得出语义：`.../status/0` = "把状态置为 0（禁用）"。
   - *绑定靠什么对上*：`{status}` 的名字和参数名 `status` 一致。若不一致，得写 `@PathVariable("status") Integer s`。

2. **`id` —— 没有任何注解的简单类型参数**：
   - 这里有个**初学者必踩的疑惑**："`id` 啥注解都没有，它从哪来？"答案是：Spring MVC 对于**没有注解、且是简单类型（如 `Long`/`Integer`/`String`）** 的方法参数，默认按 **查询参数（Query Parameter）** 处理，相当于隐式加了 `@RequestParam`。
   - 所以前端实际请求是 `POST /admin/employee/status/0?id=2`——`id=2` 在问号后面的查询字符串里。Spring 按"参数名 `id`"去查询串里找 `id` 的值，绑过来。
   - *和 `@PathVariable` 的区别一句话记牢*：`@PathVariable` 取的是 URL **路径段**里的值（`/status/0` 的 `0`）；查询参数取的是 URL **问号之后** `key=value` 里的值（`?id=2` 的 `2`）。

**三种入参绑定方式横向对比（这条链 + 前两条链凑齐了）：**

| 注解 / 写法 | 数据来自 | 适用场景 | 本项目实例 |
|---|---|---|---|
| `@RequestBody` | HTTP 请求体里的 JSON | 字段多、是个对象 | `login(@RequestBody EmployeeLoginDTO)`、`save(@RequestBody EmployeeDTO)` |
| `@PathVariable` | URL 路径段 `/{xxx}` | 标识"资源"或"操作"的关键值 | `startOrStop(@PathVariable status)`、`getById(@PathVariable id)` |
| 查询参数（裸参 / `@RequestParam`） | URL `?key=value` | 少量、零散的简单值 | `startOrStop(... , Long id)`、分页的 `EmployeePageQueryDTO`（对象按字段名从查询串绑） |

**这一层的职责边界**：和前两条链完全一致——Controller 只"收参 → 调一次 Service → 包装返回"，**没有任何业务判断**（"该不该禁用、status 合不合法"它一概不管）。返回类型是裸 `Result`（无泛型），因为"改状态"不需要回传业务数据，`Result.success()` 里 `data` 就是 `null`。

> 这条链路**没有 DTO 也没有 VO**——因为入参只有两个简单值（一个路径变量、一个查询参数），用不着专门定义一个对象来接；返回也不带数据。DTO/VO 是"字段多到值得封装成对象"时才用的，不是每个接口都必须有。

---

## 三、第 ① 行代码触发跳转：进入 Service —— 用 Builder 造一个"只含要改字段"的实体

断点单步进入 `employeeService.startOrStop(status, id)`。和前两条链一样，注入的是接口 `EmployeeService`，运行时执行的是 `EmployeeServiceImpl`（面向接口编程）。

**文件**：[EmployeeServiceImpl.java](sky-server/src/main/java/com/sky/service/impl/EmployeeServiceImpl.java)

```java
/**
 * 启用禁用员工账户
 */
@Override
public void startOrStop(Integer status, Long id) {
    Employee employee = Employee.builder()
            .status(status)   // 只装"要改的"状态
            .id(id)           // 和"改哪一行"的主键
            .build();
    employeeMapper.update(employee);
}
```

**断点单步走读 —— 这一层只干一件事，但藏着大学问：构造一个"残缺"的实体。**

注意 `Employee` 实体有 11 个业务字段（`id / username / name / password / phone / sex / idNumber / status / createTime / updateTime / createUser / updateUser`）。但这里用 Builder **只往里装了 `status` 和 `id` 两个**，其余 9 个字段全是 `null`。

此刻 `employee` 对象的状态：

```
id        = 2          ← 改哪一行
status    = 0          ← 要改成的值
username  = null
name      = null
password  = null   ← ★注意：这些全是 null
phone     = null
...
updateTime= null   ← 还没填（等第 ④ 步切面来填）
updateUser= null   ← 还没填（等第 ④ 步切面来填）
```

**这就埋下了本条链路最关键的伏笔**：一个只有 `id` 和 `status` 非 null、其余全 null 的实体，待会儿要交给一条 `update` SQL 去执行。如果那条 SQL 是"无脑全字段更新"（`set name=?, password=?, ... status=?`），那 `name`、`password` 这些 null 就会**把数据库里原本好好的数据冲成 null**——这是真实事故级的 bug。它最后没出事，全靠第五节的动态 SQL。先记住这个伏笔。

### 配角 A：`Employee` 实体 + Builder 模式

**文件**：[Employee.java](sky-pojo/src/main/java/com/sky/entity/Employee.java)

```java
@Data
@Builder                 // ← Lombok：编译期生成建造者，支持 .status().id().build() 链式构造
@NoArgsConstructor
@AllArgsConstructor
public class Employee implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;
    private String username;
    private String name;
    private String password;
    private String phone;
    private String sex;
    private String idNumber;
    private Integer status;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private Long createUser;
    private Long updateUser;
}
```

- **为什么这里用 Builder 而不是 `new Employee()` + 一串 set**：你在"新增员工"链路里见过 Service 用的是 `new Employee()` 再 `BeanUtils.copyProperties` + 若干 `setXxx`。这里换成了 `Employee.builder().status(s).id(i).build()`，本质都是"造对象"，但 Builder 的链式写法在"只想设其中几个字段"时**特别紧凑**——一行就说清楚"我只关心 status 和 id"，读代码的人一眼就知道"这次操作只动这两样"。
- **`@Builder`（建造者模式，Builder Pattern）是什么**：Lombok 在编译期为这个类生成一个内部建造者，让你能 `.字段名(值)` 一路点下去、最后 `.build()` 产出对象。没点到的字段保持默认值（对象类型就是 `null`）。
  - 餐厅类比：在赛百味点餐——"只要面包 + 火腿"（只点 `.status().id()`），没说要的生菜番茄（其它字段）默认就不放（`null`）。
- **关键认知**：Builder 没设的字段是 `null`，这"没设=null"的特性，正是下一步动态 SQL 能"认出哪些字段该改"的依据。Builder 和动态 SQL 在这条链里是**天作之合**。

---

## 四、第 ③ 步：Mapper 的 update —— 但它被 AOP "截胡"了

断点单步进入 `employeeMapper.update(employee)`。

**文件**：[EmployeeMapper.java](sky-server/src/main/java/com/sky/mapper/EmployeeMapper.java)

```java
@Mapper
public interface EmployeeMapper {

    /**
     * 启用禁用员工账户,编辑员工信息   ← 注意这行注释：这个 update 是"两用"的
     */
    @AutoFill(OperationType.UPDATE)   // ★这个注解让本次调用被切面拦截
    void update(Employee employee);
    // …… getByUsername / insert / pageQuery / getById 略
}
```

**断点观察 —— 这里发生了一件"看不见的跳转"：**

普通情况下，调 `update(employee)` 会直接去执行 XML 里那条 `update` SQL。但 `update` 方法上挂着自定义注解 **`@AutoFill(OperationType.UPDATE)`**，而项目里有一个切面专门"盯着"所有带这个注解的方法。于是断点不会直接进 SQL，而是**先跳到切面 `AutoFillAspect.autoFill()`**（第五节），执行完才回来执行真正的 update。这就是 **AOP（面向切面编程）** 的"无感拦截"：调用方（Service）完全不知道中间被插了一脚。

> **顺带读懂那行注释**：`@AutoFill(OperationType.UPDATE) void update(Employee employee)` 的注释写着"启用禁用员工账户,编辑员工信息"——说明这**同一个** `update` 方法被两个业务复用：本篇的 `startOrStop`（只改 status）和 `update(EmployeeDTO)`（改 name/phone 等一堆字段）都调它。一个 Mapper 方法、一条 SQL，服务两种"改"的需求——这正是下一节动态 SQL 的功劳。

---

## 五、第 ④ 步：AutoFillAspect 的 UPDATE 分支 + 第 ⑤ 步动态 SQL —— 本条链路的"皇冠"

这两步必须连起来看，因为它们一个"填值"、一个"挑字段"，是配合作战的。

### 5.1 切面：UPDATE 只填 2 个字段

**为什么需要它（不用会怎样）**：几乎每张业务表都有 `update_time / update_user` 这种"谁、什么时候改的"审计字段。如果不用切面，每个修改方法里都得手写 `setUpdateTime(now); setUpdateUser(currentId);`。方法一多，这些重复代码散落各处，改一处规则要改几十个地方，还容易漏。这种"和核心业务无关、却到处都要做"的事，叫**横切关注点（Cross-Cutting Concern）**。AOP 把它抽出来集中托管。

餐厅类比：与其要求每个厨师改完菜都自己手写"改动时间 + 工号"标签（容易忘、格式不统一），不如在出餐口装一台**自动盖章机**（切面），每盘"写库"的菜经过时自动盖章。厨师（Service）只管"改 status 这道菜"，盖章交给机器。

**文件**：[AutoFillAspect.java](sky-server/src/main/java/com/sky/aspect/AutoFillAspect.java)

```java
@Aspect        // 声明这是一个切面
@Component     // 同时是 Spring Bean，才能被扫描装配
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

        // 1、拿到方法签名 → 方法上的 @AutoFill 注解 → 操作类型
        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        AutoFill autoFill = signature.getMethod().getAnnotation(AutoFill.class);
        OperationType operationType = autoFill.value();   // 本链路是 UPDATE

        // 2、拿到被拦截方法的参数（约定第 0 个就是实体对象）
        Object[] args = joinPoint.getArgs();
        if (args == null || args.length == 0) {
            return;
        }
        Object entity = args[0];   // 就是 Service 里那个只含 id+status 的 employee

        // 3、准备要填的值
        LocalDateTime now = LocalDateTime.now();
        Long currentId = BaseContext.getCurrentId();   // ← 第 ⓪ 步拦截器存进 ThreadLocal 的 empId

        // 4、按操作类型，用【反射】调实体的 setter
        if (operationType == OperationType.INSERT) {
            // 新增：4 个字段全填（createTime/createUser/updateTime/updateUser）—— 本链路不走这里
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
        } else if (operationType == operationType.UPDATE) {   // ★本链路走这里（顺带：这里有个小瑕疵，见下）
            // 修改：只填 2 个字段
            try {
                Method setUpdateTime = entity.getClass().getDeclaredMethod(AutoFillConstant.SET_UPDATE_TIME, LocalDateTime.class);
                Method setUpdateUser = entity.getClass().getDeclaredMethod(AutoFillConstant.SET_UPDATE_USER, Long.class);
                setUpdateTime.invoke(entity, now);        // 等价于 employee.setUpdateTime(now)
                setUpdateUser.invoke(entity, currentId);  // 等价于 employee.setUpdateUser(empId)
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        }
    }
}
```

**断点单步走读（这一帧发生在 SQL 执行之前）：**

1. **切入点表达式** `execution(* com.sky.mapper.*.*(..)) && @annotation(...AutoFill)`：`com.sky.mapper` 包下、方法上带 `@AutoFill` 的方法才被切。`update`、`insert` 中招；`getByUsername`、`pageQuery`、`getById`（查询，没挂注解）不中招——因为查询不需要填审计字段。
2. **`@Before`**：在被切方法**之前**执行。所以顺序是 `autoFill()` 先跑完 → 再执行 XML 的 update SQL。
3. **读出操作类型 = `UPDATE`** → 走 `else if` 分支，**只填 2 个字段**（`updateTime`、`updateUser`），不碰 `createTime`/`createUser`（"创建"信息是新增时定的，修改时不该动）。
4. **`joinPoint.getArgs()[0]`** 拿到的，正是第三节 Service 里那个只含 `id`+`status` 的 `employee` 对象（同一个引用）。切面在它身上补了 `updateTime` 和 `updateUser`。
5. 填完，实体现在有 **4 个非 null 字段**：`id`、`status`、`updateTime`、`updateUser`。带着这个状态，断点回到 `update`，进入真正的 SQL。

> **顺带指出切面里一个小瑕疵**（不影响功能，但面试官可能拿来考眼力）：`else if (operationType == operationType.UPDATE)` 这里是**用实例引用 `operationType` 去访问静态枚举常量 `UPDATE`**，编译器会给警告。本意应写成 `operationType == OperationType.UPDATE`。它能正常工作，因为枚举常量本质是静态的，但属于不规范写法——**读代码以行为为准：它确实在判断"操作类型是不是 UPDATE"**。

### 5.2 动态 SQL：你给了哪几样，我就改哪几样

断点从切面返回，执行真正的 update SQL。**这是解开第三节那个"null 会不会冲掉数据"伏笔的地方。**

**文件**：[EmployeeMapper.xml](sky-server/src/main/resources/mapper/EmployeeMapper.xml)

```xml
<mapper namespace="com.sky.mapper.EmployeeMapper">   <!-- namespace = 接口全限定名 -->

    <!-- 启用禁用员工账户 / 编辑员工信息 共用这一条 -->
    <update id="update" parameterType="Employee">    <!-- id = 接口方法名 update -->
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
    <!-- …… 其他 SQL 略 -->
</mapper>
```

**为什么需要动态 SQL（Dynamic SQL，不用会怎样）**：回到伏笔——Service 传进来的 `employee` 大部分字段是 `null`。如果 SQL 写死成：

```sql
update employee set name=#{name}, username=#{username}, password=#{password}, ... status=#{status} where id=#{id}
```

那么 `name`、`password` 这些 `null` 会被**真的写进数据库**，把这个员工原本的姓名、密码全冲成 `null`——点一下"禁用"，结果把人家账号信息毁了。这显然不能接受。

**它是什么**：MyBatis 的动态 SQL 能在运行时根据参数值**拼出不同的 SQL**。这里两个标签配合：
- **`<if test="xxx != null">`**：只有当对象的 `xxx` 属性非 null 时，才把这段 SQL 片段拼进去。
- **`<set>`**：包住所有 `<if>`，自动做两件事：① 在前面补上 `SET` 关键字；② **自动去掉最后一个多余的逗号**（每个 `<if>` 片段结尾都带 `,`，若手写很容易拼出 `set status=?,  where` 这种语法错，`<set>` 帮你把末尾逗号抹掉）。

**怎么用 —— 本次请求真正执行的 SQL**：此刻 `employee` 只有 `status`、`updateTime`、`updateUser`、`id` 非 null，于是 9 个 `<if>` 里只有 3 个为真（`status`、`updateTime`、`updateUser`），`<set>` 拼出：

```sql
update employee set update_Time = ?, update_User = ?, status = ? where id = ?
```

- `name`、`password`、`phone` 等因为是 `null`，对应 `<if>` 为假，**根本没进 SQL**——所以它们在库里的原值毫发无伤。伏笔解除。
- `#{status}` 等是预编译占位符，MyBatis 用 `PreparedStatement` 传参（防 SQL 注入）。`#{}` 里写的是**实体属性名**（驼峰 `updateTime`），SQL 里的**列名**则是下划线/混合写法（`update_Time`）——两者通过属性名取值、列名落库各自对应。

**★ 串起来看：Builder + AOP + 动态 SQL 三者是怎么协同的（本条链路的精华）**

```
Service: Builder 只装 id+status        →  实体里"想改的"非 null，"不想动的"是 null
   ↓
切面:    UPDATE 分支补 updateTime/User  →  审计字段也变成非 null（业务要的，自动加）
   ↓
动态SQL: <if test="字段 != null">        →  非 null 的才拼进 SET，null 的全跳过
   ↓
结果:    只 UPDATE 了 status + 两个审计字段，其它列原值不动
```

三者环环相扣，缺一不可：Builder 负责"该 null 的就让它 null"，切面负责"业务要补的字段补上"，动态 SQL 负责"按 null/非 null 决定改哪些列"。**这套组合让同一条 `update` SQL 既能服务"只改 status"的 `startOrStop`，又能服务"改一堆字段"的 `update(EmployeeDTO)`**——传进来的实体含哪几个非 null 字段，就更新哪几列。这就是第四节那行注释"启用禁用/编辑员工 共用"的底层原理。

### 配角 B：`@AutoFill` 注解 + `OperationType` 枚举 + `AutoFillConstant`

**文件**：[AutoFill.java](sky-server/src/main/java/com/sky/annotation/AutoFill.java)

```java
@Target(ElementType.METHOD)            // 这个注解只能加在方法上
@Retention(RetentionPolicy.RUNTIME)    // ★运行时仍保留，否则切面在运行时读不到它
public @interface AutoFill {
    OperationType value();             // 注解的属性：操作类型
}
```

- **`@Retention(RUNTIME)` 是命门**：保留策略有 SOURCE / CLASS / RUNTIME 三档，只有 `RUNTIME` 能让注解信息保留到运行时，切面 `getAnnotation(AutoFill.class)` 才读得到。写成默认的 `CLASS` 或 `SOURCE`，编译后注解就没了，切面拿到 `null`，整套机制静默失效（还不报编译错），是很隐蔽的坑。
- **`@Target(METHOD)`**：限定它只能贴在方法上。

**文件**：[OperationType.java](sky-common/src/main/java/com/sky/enumeration/OperationType.java)

```java
public enum OperationType {
    UPDATE,    // 更新操作 ← 本链路用的就是它
    INSERT     // 插入操作
}
```

- 用**枚举**而非字符串 `"update"` 表示操作类型，编译期就限定了取值范围，写不出拼错的 `@AutoFill("updte")`，IDE 还能自动补全。

**文件**：[AutoFillConstant.java](sky-common/src/main/java/com/sky/constant/AutoFillConstant.java)

```java
public class AutoFillConstant {
    public static final String SET_CREATE_TIME = "setCreateTime";
    public static final String SET_UPDATE_TIME = "setUpdateTime";   // ← UPDATE 分支用这两个
    public static final String SET_CREATE_USER = "setCreateUser";
    public static final String SET_UPDATE_USER = "setUpdateUser";
}
```

- 反射要用方法名的**字符串**。抽成常量，既防拼错，也等于约定了"凡是要被自动填充的实体，setter 必须严格叫这几个名字"。

### 配角 C：Java 反射（Reflection）—— 为什么这里非用反射不可

- **为什么不能直接 `entity.setUpdateTime(now)`**：切面要服务**所有**实体（`Employee`、`Category`、`Dish`、`Setmeal`……），编译期它根本不知道传进来的 `entity` 是哪个类，参数类型只能声明成 `Object`。`Object` 上没有 `setUpdateTime` 方法，直接调编译都过不了。
- **反射是什么**：让程序在**运行时**才去"问"对象——"你这个类有没有名叫 `setUpdateTime`、参数是 `LocalDateTime` 的方法？有就帮我调用它。"
  - `entity.getClass().getDeclaredMethod("setUpdateTime", LocalDateTime.class)` → 运行时找到那个 setter（`Method` 对象）。
  - `method.invoke(entity, now)` → 运行时调用它，等价于 `entity.setUpdateTime(now)`。
- *代价*：反射比直接调用慢、且绕过编译期检查（方法名拼错只在运行时炸，所以才用 `AutoFillConstant` 常量降低风险）。但它换来**通用性**——一个切面通吃所有实体。典型的"用一点性能换巨大的可维护性"。

### 配角 D：`BaseContext`（用 ThreadLocal 跨层传"当前登录人"）

**文件**：[BaseContext.java](sky-common/src/main/java/com/sky/context/BaseContext.java)

```java
public class BaseContext {

    public static ThreadLocal<Long> threadLocal = new ThreadLocal<>();

    public static void setCurrentId(Long id) { threadLocal.set(id); }
    public static Long getCurrentId() { return threadLocal.get(); }
    public static void removeCurrentId() { threadLocal.remove(); }
}
```

- **为什么需要它**：拦截器（第 ⓪ 步）解析出了 `empId`，但真正用它的是切面（第 ④ 步），中间隔着 Controller、Service。难道把 `empId` 一路当参数传——`startOrStop(status, id, empId)`、`update(employee, empId)`？太脏了，每个方法签名都被"当前登录人"污染。
- **它是什么**：`ThreadLocal`（线程本地变量）是 JDK 提供的"**每个线程私有的储物柜**"。同一个 `ThreadLocal` 对象，A 线程存的值 B 线程读不到；A 线程在任何方法里都能读回自己存的值。
  - **为什么在这里成立**：Tomcat 处理一个 HTTP 请求，从拦截器→Controller→Service→Mapper→切面，**全程是同一个线程**。拦截器在这个线程存的 `empId`，切面在同一线程取得到。
  - 餐厅类比：验票员在你手背盖了个"会员号"的隐形章（存进 ThreadLocal）。你走到店里哪个柜台（哪一层），柜台一照都能看到，不用每次报号；隔壁桌客人（另一线程）的章和你的互不干扰。
- ⚠️ **生产必须注意的坑**：Tomcat 线程是**复用**的（线程池）。请求结束不 `remove()`，下次别的请求复用到这个线程，会读到上一个人残留的 `empId`，造成**数据串台**。规范做法是在拦截器 `afterCompletion` 里 `BaseContext.removeCurrentId()`。本教程提供了 `removeCurrentId()` 却**没在请求结束时调用**——教学简化，生产必须补上。

### 配角 E：`StatusConstant`（状态的"语义名字"）

**文件**：[StatusConstant.java](sky-common/src/main/java/com/sky/constant/StatusConstant.java)

```java
public class StatusConstant {
    public static final Integer ENABLE = 1;    // 启用
    public static final Integer DISABLE = 0;   // 禁用
}
```

- 注意：**本条 `startOrStop` 链路其实没直接用到这个常量**——`status` 是前端通过路径变量传进来的裸值（`0` 或 `1`），Service 原样塞进实体，没有去和 `StatusConstant` 比较。
- 但理解它的存在仍有价值：它定义了"1=启用、0=禁用"这个**全局约定**。登录链路里 `employee.getStatus() == StatusConstant.DISABLE` 用它判断账号是否被禁用、新增链路里 `setStatus(StatusConstant.ENABLE)` 用它设默认值。前端传来的 `status` 值，语义上必须遵守这套约定（传 0 就是要禁用）。把 `0/1` 抽成有名字的常量，是为了消灭"魔法值（Magic Number）"——半年后没人会困惑"`1` 到底是启用还是禁用"。

---

## 六、第 ⑤’ 步：写库完成，回到 Controller 收尾

动态 SQL 拼好后，MyBatis 用 `PreparedStatement` 执行：

```sql
update employee set update_Time = ?, update_User = ?, status = ? where id = ?
-- 参数：now, empId, 0, 2
```

MySQL 更新这一行（只动了 3 个列，其余列原值不变），`update` 方法 `void` 返回 → Service `startOrStop` 返回 → 回到 Controller：

```java
employeeService.startOrStop(status, id);
return Result.success();   // data 为 null，只表示"成功"
```

### 配角 F：统一返回结果 `Result<T>`

**文件**：[Result.java](sky-common/src/main/java/com/sky/result/Result.java)

```java
@Data
public class Result<T> implements Serializable {
    private Integer code; // 1 成功；0 和其它数字失败
    private String msg;   // 错误信息
    private T data;        // 业务数据

    public static <T> Result<T> success() {            // ← 启用禁用接口用的就是这个无参版
        Result<T> result = new Result<T>();
        result.code = 1;
        return result;
    }
    public static <T> Result<T> success(T object) { /* 带数据，登录/查询用 */ }
    public static <T> Result<T> error(String msg)  { /* code=0, msg=... */ }
}
```

- "改状态"不需要回传数据，所以调**无参的 `success()`**——只把 `code` 设成 1，`data` 保持 `null`。`@RestController` 把它序列化成 JSON 返回前端：

  ```json
  { "code": 1, "msg": null, "data": null }
  ```

- 前端无论调哪个接口，都先看 `code`：`1` 就当成功（刷新列表，开关切到新状态），`0` 就弹 `msg`。统一的返回结构让前端用一套逻辑应对所有接口。整条链结束。

> **失败分支说明**：这条链路**没有显式的业务异常**——Service 里没有任何 `if` 校验、没有 `throw`。它把"会不会出错"几乎完全交给了下游：`id` 不存在时 `where id=#{id}` 影响 0 行（不报错，悄悄什么都没改）；`status` 传了非法值（比如 2）这里也不拦（教学简化，生产应校验）。所以它不像登录/新增那样需要全局异常处理器兜底——这也从侧面说明：**异常处理的复杂度，取决于业务本身有多少"失败可能"**。

---

## 七、总结与思考（比读懂源码更重要的部分）

> **学习心法**：类名、表名、字段都会变，但下面这些**设计思想可迁移**。这条链路真正的"新知识"是前两条：① 入参绑定的三种姿势，② Builder + AOP + 动态 SQL 三件套防止 null 覆盖。后面 AOP / ThreadLocal 的套路和"新增员工"那条相通，这里只点要害。记套路，不要记代码。

### 1. 必背套路一：入参绑定看"数据从哪来"，选对注解

**口诀**：`对象进 Body，标识进 Path，零散进 Query。`

| 数据来源 | 注解 | 什么时候用 |
|---|---|---|
| 请求体 JSON | `@RequestBody` | 字段多、是个完整对象（登录 DTO、新增 DTO） |
| URL 路径段 `/{x}` | `@PathVariable` | 标识资源或操作的关键值（`/status/{status}`、`/{id}`） |
| URL `?k=v` | 查询参数 / `@RequestParam` | 少量零散简单值（`?id=2`、分页参数） |

- 为什么必背：面试常问"`@RequestParam` 和 `@PathVariable` 区别"。一句话——**前者取问号后的查询串，后者取路径里的占位段**。还要知道：没注解的简单类型参数，Spring 默认当查询参数处理（这正是本链路 `id` 的情况）。
- ⚠️ 反模式：把一个有十几个字段的大对象拆成十几个查询参数传，URL 又长又乱——该上 `@RequestBody` 就上。

### 2. 必背套路二：更新操作要"只改想改的"，靠 Builder + 动态 SQL（本链路皇冠）

**口诀**：`实体只装要改的字段，动态 SQL 只更新非 null 列，null 的一律不碰。`

```
Builder 只 set 想改的字段（其余 null）
   → AOP 自动补 update_time/update_user（业务要的审计字段）
   → <set> + <if test="x!=null"> 只把非 null 字段拼进 UPDATE
   → 既不会把没传的字段冲成 null，又能一条 SQL 服务多种"改"
```

- 为什么必背：这是**更新操作最经典的坑与解**。新手最容易写"全字段 update"，结果一改局部就把其它字段冲成 null。动态 SQL 的 `<set>`+`<if>` 是标准解法，还顺带实现了 SQL 复用（一条 `update` 服务 `startOrStop` 和 `update(EmployeeDTO)` 两个业务）。
- `<set>` 的两个隐藏功能要记牢：**自动加 `SET`、自动去掉末尾多余逗号**。
- ⚠️ 面试追问"全字段 update 有什么问题"——答"会用 null 覆盖未传字段，且并发下易丢更新；动态 SQL 按需更新更安全"。

### 3. 必背套路三：AOP + 自定义注解 + 反射，统一处理"横切关注点"

**口诀**：`重复的、和业务无关的活，抽成切面自动盖章。`

| 组件 | 角色 | 关键点 |
|---|---|---|
| `@AutoFill` 自定义注解 | "哪些方法要自动填" 的标记 | 必须 `@Retention(RUNTIME)`，否则运行时读不到 |
| `OperationType` 枚举 | 区分 INSERT（填4个）/ UPDATE（填2个） | 枚举不用字符串，编译期限定取值 |
| `@Aspect`+`@Pointcut`+`@Before` | 切面本体 | Pointcut 锁定"mapper 包下带 @AutoFill 的方法"；`@Before` 在 SQL 前介入 |
| 反射 `getDeclaredMethod`+`invoke` | 通用赋值手段 | 切面不知实体具体类型，只能运行时反射调 setter |

- 本链路走的是 **UPDATE 分支，只填 `update_time`/`update_user` 两个字段**（不碰 create，因为"创建信息"修改时不该动）。
- 为什么必背：AOP 是 Spring 两大基石之一（另一个 IoC/DI）。面试问"AOP 在你项目里用在哪"，"公共字段自动填充"是最好答的实例——能讲全"注解标记 → 切面拦截 → 反射赋值"就说明真懂。

### 4. 必背套路四：ThreadLocal + 拦截器，跨层传"当前登录人"

**口诀**：`进门盖个章（拦截器存），全程随地查（任意层取），出门记得擦（remove）。`

- HTTP 请求**全程同一线程**，拦截器存进 `ThreadLocal` 的 `empId`，切面/Service 都取得到，不用当参数层层传。
- ⚠️ 面试必追问：**线程池复用线程，请求结束不 `remove()` 会数据串台 + 内存泄漏**。本项目有 `removeCurrentId()` 但没在请求结束时调用，是教学简化。

### 5. 哪些是"生产同款"、哪些是"教学简化"

**生产同款（直接保留）：** 三层架构、`@PathVariable`/查询参数按语义选用、Builder 造部分实体、动态 SQL 按需更新防 null 覆盖、AOP 公共字段填充、ThreadLocal+拦截器取登录人、统一返回。

**教学简化（要知道怎么升级）：**
- ⚠️ Service **没有任何入参校验**：`status` 传非法值（如 2）、`id` 传不存在的值都不拦 → 生产应校验 `status ∈ {0,1}`、`id` 存在性，并对"影响 0 行"给出明确反馈。
- ⚠️ **没有权限校验**：任何登录员工都能禁用任何人（包括把 admin 自己禁掉）→ 生产需加角色/越权校验。
- ⚠️ 切面 `operationType == operationType.UPDATE` 应为 `OperationType.UPDATE`（用实例访问静态成员，不规范但能跑）。
- ⚠️ **ThreadLocal 未 `remove()`** → 生产必须在拦截器 `afterCompletion` 清理。
- ⚠️ XML 里列名 `id_Number`/`update_Time` 大小写混用（MySQL 默认列名不区分大小写故能跑），属书写不规范。

---

## 八、面试官视角：这条链路我会怎么问（含口述答案）

> 假设我是 Java 后端面试官，看到你简历写了这个项目，针对"启用禁用员工账户"这条链路，我大概率会问下面这些。答案按"面试时能直接口述、30~60 秒讲完"的风格写。

**Q1：这个接口的 status 和 id 两个参数，是怎么从请求里取到的？`@PathVariable` 和查询参数有什么区别？**
> status 用了 `@PathVariable`，它取的是 URL 路径里 `{status}` 那一段的值，比如请求 `/admin/employee/status/0`，0 就被绑到 status 上。id 没有写任何注解，Spring 对没注解的简单类型参数默认按查询参数处理，相当于隐式的 `@RequestParam`，所以前端实际是在问号后面传 `?id=2`。区别就是：`@PathVariable` 取路径段里的值，查询参数取问号之后 key=value 里的值。把 status 放路径是因为它表达"对资源做什么操作"，符合 RESTful 风格，URL 本身就读得出语义。

**Q2：Service 里用 Builder 只设了 status 和 id，其它字段都是 null，那执行 update 时，数据库里 name、password 这些会不会被改成 null？**
> 不会，靠的是 MyBatis 动态 SQL。update 的 SQL 用了 `<set>` 加一堆 `<if test="字段 != null">`，只有非 null 的字段才会被拼进 SET 子句。我这次实体里只有 status、updateTime、updateUser、id 非 null，所以最终 SQL 只更新这三列，加上 where id。name、password 这些是 null，对应的 `<if>` 不成立，根本不进 SQL，所以库里原值不动。如果写成全字段 update，那就真的会把没传的字段冲成 null，这是更新操作很经典的坑。

**Q3：updateTime 和 updateUser 这两个字段，Service 里一行都没填，它们是怎么有值的？**
> 是 AOP 切面自动填的。Mapper 的 update 方法上挂了 `@AutoFill(OperationType.UPDATE)` 注解，项目里有个切面盯着所有带这个注解的方法，用 `@Before` 在 SQL 执行前介入。它从注解读出操作类型是 UPDATE，就只填 updateTime 和 updateUser 两个字段——updateTime 取当前时间，updateUser 从 ThreadLocal 里取当前登录员工 id。因为切面不知道实体具体是哪个类，所以是用反射调 setUpdateTime、setUpdateUser 这两个 setter。INSERT 的话会填四个字段，UPDATE 只填两个，因为创建信息修改时不该动。

**Q4：updateUser 要填"当前操作人 id"，但这个接口入参里根本没有当前登录人的信息，切面是从哪拿到的？**
> 从 ThreadLocal。请求进 Controller 之前有个 JWT 拦截器，先解析请求头的 token 取出登录员工 id，调 `BaseContext.setCurrentId` 存进 ThreadLocal。因为一个 HTTP 请求从拦截器到 Service 再到切面全程是同一个线程，所以切面里 `BaseContext.getCurrentId` 就能取回这个 id。这样登录态就不用当参数一层层往下传了。要注意线程池会复用线程，请求结束必须 remove，否则会读到上一个请求残留的 id 造成串台。

**Q5：这条 update SQL 我看注释说"启用禁用和编辑员工都用它"，一条 SQL 怎么同时服务两种不同的修改？**
> 还是动态 SQL 的功劳。这条 SQL 把所有可能改的字段都写成 `<if test="字段!=null">`，传进来的实体含哪几个非 null 字段，就更新哪几列。启用禁用时实体只有 status 和 id 非 null，就只更新 status；编辑员工时实体有 name、phone 等一堆非 null 字段，就更新那一堆。所以同一条 SQL、同一个 Mapper 方法，按实体的"非 null 字段"自适应，既复用了代码，又互不干扰。

**Q6（眼力题）：切面里写的是 `operationType == operationType.UPDATE`，这有问题吗？**
> 这是个不规范的写法，但不影响功能。`operationType` 是个实例变量，`UPDATE` 是枚举的静态常量，正确写法应该是用类名访问，`OperationType.UPDATE`。通过实例引用去访问静态成员，编译器会给警告，但因为枚举常量本质是静态的，所以运行结果是对的。读代码要以实际行为为准——它确实是在判断"操作类型是不是 UPDATE"，只是写法该改成类名访问。

**Q7（设计追问）：这个接口你觉得有什么安全或健壮性问题？生产你会怎么补？**
> 几个点。第一，没有入参校验，status 传个 2、id 传个不存在的值都不会报错，id 不存在时 SQL 影响 0 行也悄悄成功了，生产应该校验 status 只能是 0 或 1，并对影响 0 行给出明确反馈。第二，没有权限校验，任何登录员工都能禁用任何人，甚至能把超级管理员或自己禁掉，生产要加角色和越权校验。第三，ThreadLocal 用完没 remove，线程池复用下会脏数据，要在拦截器 afterCompletion 清理。这些在教学项目里被简化了，但生产环境必须补上。

---
