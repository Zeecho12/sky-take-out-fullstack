# 员工分页查询（Employee Page Query）全链路源码精读：PageHelper 分页插件与动态 SQL 的协作

**视频出处**：[在此处填写视频链接/出处]  
**关键词**：三层架构（Controller-Service-Mapper）、GET 请求参数绑定（Query Parameter Binding）、分页（Pagination）、PageHelper 分页插件、MyBatis 拦截器/插件（Interceptor / Plugin）、ThreadLocal（线程本地变量）、动态 SQL（Dynamic SQL：`<where>` / `<if>`）、`LIKE` 模糊查询、`Page<E>` 与 `PageResult`、统一返回结果 `Result<T>`、驼峰命名映射（map-underscore-to-camel-case）  
**创建时间**：2026-06-07 18:43

---

## 〇、阅读这条链路前，先建立"全景地图"

我们要追的这条链，是后台管理系统里**最高频**的一类需求：**列表分页查询**——"给我员工表第 1 页、每页 10 条，名字里带'张'的那些人"。

它和你已经读过的登录链路（`login`）走的是同一套三层架构，但这条链里藏着一个新主角：**PageHelper 分页插件**。它会用一种"你看不见的方式"，在你写的 SQL 送进数据库之前，**自动**帮你加上 `limit` 和 `count`。理解它，就理解了"插件 / 拦截器"这种"无侵入增强"的设计思想。

还用餐厅打比方，这条链上的角色是：

| 角色 | 项目中的层 | 职责 | 类比 |
|---|---|---|---|
| 前台收银员 | `Controller` | 接客、收单、把成品端出去 | 不炒菜，只对接顾客和后厨 |
| 厨师长 | `Service` | 决定"怎么做"、调度分页插件 | 真正编排逻辑的地方 |
| **智能切配台** | **`PageHelper`（插件）** | **在出菜前偷偷把"全量"改成"只切这一页 + 顺便数总数"** | **一个装在后厨门口、自动改单的机器人** |
| 仓库管理员 | `Mapper` | 按账本去冷库取货 | 只和数据库打交道 |
| 冷库 | `Database` | 存放原始数据 | MySQL |

**断点调试时，程序会按这个顺序在文件间跳转**（先把这张图记在脑子里，后面每一步都对应这里一行）：

```
前端 GET /admin/employee/page?name=张&page=1&pageSize=10
        （注意：参数在 URL 查询串里，不是 JSON 请求体）
   │
   ▼
① EmployeeController.page(dto)                    [sky-server] 接客
   │  employeeService.pageQuery(dto)
   ▼
② EmployeeServiceImpl.pageQuery(dto)              [sky-server] 厨师长
   │  ②a PageHelper.startPage(page, pageSize)  ← 往 ThreadLocal 里塞"我要第几页、每页几条"
   │  ②b employeeMapper.pageQuery(dto)         ← 紧接着的第一条 SQL 会被插件拦截改写
   ▼
③ EmployeeMapper(接口) → EmployeeMapper.xml       [sky-server] 仓库管理员 + 账本
   │  select * from employee <where> name like ... </where>
   │     ↑ 这条"全量 SQL"在发往 MySQL 之前，被 PageHelper 拦截器改写成两条：
   │        (1) SELECT count(0) from employee <where>...</where>     —— 数总数
   │        (2) SELECT * from employee <where>...</where> limit ?,?  —— 只取当前页
   ▼
④ MySQL 返回（总记录数 + 当前页的若干行）→ MyBatis 封装成 Page<Employee>
   │  （沿原路返回 ②）
   ▼
②' 回到 Service：page.getTotal() 取总数、page.getResult() 取当前页列表
   │  new PageResult(total, records)
   ▼
①' 回到 Controller：Result.success(pageResult)
   │
   ▼
以 JSON 返回前端  { "code":1, "data":{ "total":35, "records":[ {...}, {...} ] } }
```

> 跨模块提示：和登录链路一样，这条请求横跨三个 Maven 子模块。`Controller / ServiceImpl / Mapper / XML` 都在 **`sky-server`**；入参 `EmployeePageQueryDTO`、实体 `Employee` 在 **`sky-pojo`**；统一返回 `Result`、分页结果 `PageResult` 在 **`sky-common`**。而 `PageHelper`、`Page` 来自第三方依赖 `pagehelper-spring-boot-starter`（见 `sky-server/pom.xml`）。

下面进入断点逐步走读。

---

## 一、第 ① 步：请求落到 Controller（注意：这次没有 `@RequestBody`）

**文件**：`sky-server/src/main/java/com/sky/controller/admin/EmployeeController.java`

```java
/**
 * 员工分页查询
 */
@GetMapping("/page")                 // 完整路径 = GET /admin/employee/page
@ApiOperation("员工分页查询")
public Result<PageResult> page(EmployeePageQueryDTO employeePageQueryDTO) {
    log.info("员工分页查询，参数为：{}", employeePageQueryDTO);
    PageResult pageResult = employeeService.pageQuery(employeePageQueryDTO);
    return Result.success(pageResult);
}
```

**断点观察 —— 进方法体前，框架替我们做的事，和登录那条链有一个关键不同：**

1. **路由匹配**：`@RestController`（在类上）+ `@RequestMapping("/admin/employee")`（类级前缀）+ `@GetMapping("/page")` 拼出 `GET /admin/employee/page`，由 Spring MVC 的 `DispatcherServlet` 派发到这个方法。

2. **参数绑定方式不同（重点）**：登录方法的参数前有 `@RequestBody`，因为它是 `POST`、数据在 **JSON 请求体**里；而这里的 `page` 方法参数**前面什么注解都没有**。
   - *为什么不一样*：分页查询是 `GET` 请求，参数是跟在 URL 后面的**查询串（Query String）**：`?name=张&page=1&pageSize=10`。GET 通常没有请求体。
   - *它是什么 / 怎么用*：当一个方法参数是普通的 POJO（这里是 `EmployeePageQueryDTO`）且没有 `@RequestBody`，Spring MVC 会用**对象参数绑定**：把查询串里的每个 `key`（`name`、`page`、`pageSize`），按名字匹配到 DTO 的**同名属性**上，**通过 setter 注入**。所以 `EmployeePageQueryDTO` 必须有这三个字段对应的 setter（由 Lombok 的 `@Data` 生成）。
   - 一句话对比：**`@RequestBody` 走 JSON 反序列化（Jackson）；无注解的 POJO 走查询参数绑定（按字段名 + setter）。** 这是面试常被追问的细节。

3. **职责边界仍然不变**：Controller 只做"收参 → 调一次 Service → 包装返回"，**分页的具体逻辑一行都不写**。它甚至不知道"分页"是靠插件实现的——这正是分层想要的效果。

> 先看一眼上游传进来的数据载体。

### 配角 A：`EmployeePageQueryDTO`（前端 → 后端 的入参）

**文件**：`sky-pojo/src/main/java/com/sky/dto/EmployeePageQueryDTO.java`

```java
@Data
public class EmployeePageQueryDTO implements Serializable {

    //员工姓名
    private String name;       // 模糊查询条件（可为空 → 查全部）

    //页码
    private int page;          // 第几页，从 1 开始

    //每页显示记录数
    private int pageSize;      // 每页几条
}
```

- **为什么需要它（DTO，Data Transfer Object，数据传输对象）**：分页查询要传"查询条件 + 分页参数"三样东西。把它们打包成一个瘦类，比在方法签名上写 `page(String name, int page, int pageSize)` 三个散参数更整洁，将来加筛选条件（如按状态、按入职日期）也只动这个类，不动方法签名。
- **一个值得留意的小细节**：`page` 和 `pageSize` 用的是基本类型 `int`（不是包装类 `Integer`）。基本类型不能为 `null`，前端不传时会绑定失败/取默认值。生产里这类分页参数更稳妥的做法是用 `Integer` 并在前端/校验层兜底默认值，这里教学项目从简。
- `@Data` 是 Lombok 注解，编译期生成 getter/setter/toString。前面 `log.info("...{}", dto)` 能打印出内容、以及 Spring 能用 setter 完成参数绑定，靠的都是它。

---

## 二、第 ① 行代码触发跳转：进入 Service —— 本条链的主角登场

断点单步进入 `employeeService.pageQuery(employeePageQueryDTO)`。同样地，Controller 注入的是 `EmployeeService`（**接口**），运行时执行的是 `EmployeeServiceImpl`（面向接口编程，换实现不影响调用方）。

**接口声明 —— 文件**：`sky-server/src/main/java/com/sky/service/EmployeeService.java`

```java
/**
 * 员工分页查询
 */
PageResult pageQuery(EmployeePageQueryDTO employeePageQueryDTO);
```

**实现 —— 文件**：`sky-server/src/main/java/com/sky/service/impl/EmployeeServiceImpl.java`

```java
@Override
public PageResult pageQuery(EmployeePageQueryDTO employeePageQueryDTO) {
    // ②a 开始分页查询：把"页码 + 每页条数"塞进 PageHelper 的 ThreadLocal
    PageHelper.startPage(employeePageQueryDTO.getPage(), employeePageQueryDTO.getPageSize());

    // ②b 执行查询。注意：返回类型是 Page<Employee>，不是普通 List
    Page<Employee> page = employeeMapper.pageQuery(employeePageQueryDTO);

    // ②' 从 page 里把"总数"和"当前页数据"拆出来
    long total = page.getTotal();          // 总记录数（插件自动 count 出来的）
    List<Employee> records = page.getResult();  // 当前页的那几条

    // 封装成统一的分页结果返回
    return new PageResult(total, records);
}
```

**断点单步走读，这短短四行每一行都有讲究：**

### ②a `PageHelper.startPage(page, pageSize)` —— 这一行到底做了什么？

这是整条链**最魔法、也最该理解透**的一行。它看起来只是"开始分页"，实际上**它本身并不查任何数据库**，它只做一件事：**把"我接下来要查第几页、每页几条"这个信息，存进当前线程的 ThreadLocal 里。**

要讲清楚它，按"为什么 → 是什么 → 怎么用"拆三层：

**① 为什么需要 PageHelper（不用会怎样）**

如果没有它，你想分页，就得自己在 SQL 里写 `limit #{offset}, #{pageSize}`，还得**再写一条** `select count(*)` 去数总数，然后两条结果手工拼起来。每个需要分页的接口都重复这套，又啰嗦又容易错。PageHelper 的价值就是：**你只管写"查全部"的那条最朴素的 SQL，分页的 `limit` 和 `count` 由它自动帮你加。**

**② 它是什么（核心机制：MyBatis 拦截器 + ThreadLocal）**

PageHelper 的底层是一个 **MyBatis 拦截器（Interceptor，也叫插件 Plugin）**。

- *什么是拦截器*：MyBatis 允许你在它执行 SQL 的"关键路口"安插一个"质检员"，在 SQL 真正发给数据库之前**拦下来、改一改**。这就是面向切面（AOP，Aspect-Oriented Programming）思想在持久层的体现——**不改你的业务代码，却能增强它的行为**。
  - 餐厅类比：PageHelper 就是装在**后厨出菜口的智能切配台**。厨师（你的 Mapper）按"做一整锅"的菜谱出菜，切配台在端出去之前自动拦下来，按订单小票（ThreadLocal 里的页码）只切出"第 2 页那 10 份"，顺手再数一下"这一锅总共能装几份"。厨师全程不知道有这道工序。
- *startPage 和拦截器怎么配合*：`startPage` 把分页参数写进 **ThreadLocal**（线程本地变量）。紧接着执行的那条 SQL 经过拦截器时，拦截器从 ThreadLocal 里取出页码，于是：
  1. 先发一条 `SELECT count(0) FROM employee <where>...</where>` 数出**总数**；
  2. 再把你的原始 SQL 改写成 `SELECT * FROM employee <where>...</where> LIMIT ?, ?` 取出**当前页数据**。
- *为什么用 ThreadLocal*：Web 服务器用**线程池**同时处理很多请求。如果分页参数存在一个共享变量里，A 用户查第 1 页、B 用户查第 5 页就会互相串。ThreadLocal 让**每个线程有一份自己专属的副本**，互不干扰。
  - 餐厅类比：ThreadLocal 就是**每个服务员口袋里自己的点单小本子**，不是贴在墙上的公共白板。各记各的，绝不串台。

**③ 在这个项目里怎么用（配置层面）**

你可能注意到：项目里**没有任何一行代码去手动注册这个拦截器**。这是因为引入了 `pagehelper-spring-boot-starter`：

**文件**：`sky-server/pom.xml`

```xml
<dependency>
    <groupId>com.github.pagehelper</groupId>
    <artifactId>pagehelper-spring-boot-starter</artifactId>
    <!-- 版本在父 pom 统一管理：<pagehelper>1.3.0</pagehelper> -->
</dependency>
```

- *为什么能"零配置"生效*：Spring Boot 的 **Starter（起步依赖）+ 自动配置（AutoConfiguration）** 机制。这个 starter 的 jar 里带了一个自动配置类，项目启动时它会自动把 PageHelper 的拦截器注册进 MyBatis。这就是"约定优于配置（Convention over Configuration）"——你只要把依赖放进来，它就自动接管，省去手写 XML/Java 配置。

### ②b `Page<Employee> page = employeeMapper.pageQuery(dto)` —— 一条"看起来很普通"的查询

这一行触发跳转进入 Mapper（第三节）。**关键认知**：你在 Mapper 里写的 SQL 是"查全部"，但因为上一行刚执行过 `startPage`，这条 SQL 在被拦截器改写后，实际只查回了当前页。返回值类型也不是 `List<Employee>` 而是 `Page<Employee>`。

> ⚠️ **必须紧挨着写**：`startPage` 只对"它之后紧跟着执行的第一条 MyBatis 查询"生效。中间不要插别的查询，否则分页会"作用错对象"。这是 PageHelper 最经典的坑，也是面试高频陷阱。

### 配角 B：`Page<Employee>` 是什么？为什么它能同时装"数据"和"总数"？

`Page<E>` 是 PageHelper 提供的类，它**继承自 `java.util.ArrayList<E>`**。也就是说——**它本身就是一个 List**（里面装着当前页的若干 `Employee`），同时又额外挂了一堆分页元数据（`total` 总数、`pageNum` 当前页、`pageSize` 每页条数、`pages` 总页数等）。

```java
// 概念示意（来自 PageHelper 库，非本项目源码）：
public class Page<E> extends ArrayList<E> {
    private long total;     // 总记录数
    private int  pageNum;   // 当前页
    private int  pageSize;  // 每页条数
    // ... getTotal() / getResult() 等
}
```

所以 Service 里：
- `page.getTotal()` → 取出插件 count 出来的**总记录数**；
- `page.getResult()` → 取出**当前页的数据列表**。

- 上游：Service 调它、并已通过 `startPage` 在 ThreadLocal 里备好了分页参数。
- 下游：MyBatis + PageHelper 拦截器，最终把 MySQL 返回的"总数 + 当前页行"封装进这个 `Page` 对象，原路返回。

---

## 三、第 ③ 步：Mapper 接口 + XML（动态 SQL 登场）

和登录链一样，`EmployeeMapper` **只有接口、没有实现类**，由 MyBatis 用**动态代理（Dynamic Proxy）** 在运行时生成实现：靠"接口全限定名 = XML 的 namespace""方法名 = SQL 标签的 id"把接口和 SQL 对应起来。

### 账本的"目录"：Mapper 接口

**文件**：`sky-server/src/main/java/com/sky/mapper/EmployeeMapper.java`

```java
@Mapper
public interface EmployeeMapper {

    /**
     * 员工分页查询
     */
    Page<Employee> pageQuery(EmployeePageQueryDTO employeePageQueryDTO);
    // …… getByUsername / insert / update / getById 略
}
```

- 返回值写成 `Page<Employee>`（而不是 `List<Employee>`），是为了能直接拿到 `getTotal()`。即便这里写 `List<Employee>`，PageHelper 实际返回的也是 `Page` 实例，但写成 `Page` 取总数更直接。
- 参数是整个 `EmployeePageQueryDTO` 对象，所以 XML 里可以直接用 `#{name}` 引用它的 `name` 属性（对象属性会被自动展开）。

### 账本的"内容"：XML 里的动态 SQL

**文件**：`sky-server/src/main/resources/mapper/EmployeeMapper.xml`

```xml
<!--    员工分页查询-->
<select id="pageQuery" resultType="com.sky.entity.Employee">
    select *
    from employee
    <where>
        <if test="name != null and name != ''">
            and name like concat('%', #{name}, '%')
        </if>
    </where>
</select>
```

**注意三个关键点：**

1. **`resultType` 是 `Employee`，不是 `Page`**：你只告诉 MyBatis"每一行映射成一个 Employee"。"把这些 Employee 收进一个 `Page` 并填上 total"这步，是 **PageHelper 拦截器接管后**额外做的，不归你管。

2. **动态 SQL（Dynamic SQL）—— `<where>` + `<if>`**：
   - *为什么需要它*：`name` 是可选筛选条件。用户填了名字就按名字过滤，没填就查全部。如果用字符串硬拼 SQL，得自己处理"加不加 `where`""前面要不要 `and`"这些恼人的细节，极易拼错。
   - *它是什么*：MyBatis 的标签让你"声明式"地按条件拼 SQL：
     - `<if test="...">`：条件成立才把里面那段 SQL 拼进去。这里 `name != null and name != ''` 表示"名字非空才加过滤条件"。
     - `<where>`：智能包裹。它做两件贴心事——① 如果里面**一个条件都不成立**，它**连 `WHERE` 都不输出**（于是变成查全部）；② 如果第一个成立的条件以 `and`/`or` 开头，它会**自动把开头那个 `and` 去掉**。所以你看到 `<if>` 里大胆写了 `and name like...`，最终拼出来却是正确的 `where name like...`。
   - 餐厅类比：`<where>` 像个**懂事的传菜口**——你递条子时随手写了"还要加辣"，它发现这是第一句，自动把多余的"还要"去掉；要是你什么附加要求都没写，它干脆连"备注："这个抬头都不打印。

3. **`like concat('%', #{name}, '%')` —— 模糊查询的正确姿势**：
   - 目标是 `name like '%张%'`（名字里包含"张"）。
   - 用数据库函数 `concat` 把 `%` 和参数值拼起来，而**不是**在 Java 里拼 `"%" + name + "%"` 再传进来。
   - **为什么用 `#{}` 不用 `${}`**：`#{name}` 是**预编译占位符**，底层走 `PreparedStatement` 传参，能防 SQL 注入（SQL Injection）。`${}` 是字符串直接拼接，有注入风险。这里把 `%` 交给 `concat` 拼、把值交给 `#{}` 占位，既实现了模糊匹配又保住了安全。

**这一步的上下游与数据流：**
- 上游：Service 传来 `dto`，且 ThreadLocal 里已备好分页参数。
- 你写的 SQL：`select * from employee [where name like ...]`。
- 拦截器改写后实际发往 MySQL 的是**两条**：先 `count(0)` 数总数，再加 `limit` 取当前页。
- 下游：MySQL 返回结果 → 列名按 `map-underscore-to-camel-case: true`（见 `application.yml`）把 `id_number` 这种下划线列映射成 `idNumber` 驼峰属性 → 封装成 `Page<Employee>`，原路返回 Service。

> 配置佐证 —— **文件**：`sky-server/src/main/resources/application.yml`
> ```yaml
> mybatis:
>   mapper-locations: classpath:mapper/*.xml      # 去哪儿找 XML
>   type-aliases-package: com.sky.entity          # 实体别名包（resultType 可简写）
>   configuration:
>     map-underscore-to-camel-case: true          # 下划线列名 → 驼峰属性 自动映射
> ```

---

## 四、回到第 ②’ 步：Service 把 `Page` 拆成 `PageResult`

断点从 Mapper 返回，回到 Service。现在手里是一个 `Page<Employee>`（既是列表又带总数）。最后两行做的是"**把第三方插件的类型，转换成本项目自己的、对外统一的分页结果**"：

```java
long total = page.getTotal();                 // 1) 取总数
List<Employee> records = page.getResult();    // 2) 取当前页列表
return new PageResult(total, records);        // 3) 装进项目自定义的统一分页结果
```

**为什么不直接把 `Page` 返回给 Controller / 前端？** 因为 `Page` 是第三方库（PageHelper）的类型。如果让它直插到对外接口，整个项目就和 PageHelper **强绑定**了——将来想换分页方案，所有接口都得改。所以这里做一次"翻译"：插件内部用 `Page`，对外一律用项目自己的 `PageResult`。这是**防腐层（Anti-Corruption Layer）** 思想的轻量体现——把外部依赖挡在边界上。

### 配角 C：`PageResult`（统一的分页结果壳子）

**文件**：`sky-common/src/main/java/com/sky/result/PageResult.java`

```java
/**
 * 封装分页查询结果
 */
@Data
@AllArgsConstructor      // 生成 PageResult(long total, List records) 全参构造，对应 new PageResult(total, records)
@NoArgsConstructor
public class PageResult implements Serializable {

    private long total;    // 总记录数

    private List records;   // 当前页数据集合
}
```

- **为什么需要它（为什么不直接返回 `List`）**：前端渲染分页表格，光有"当前页这几条"不够，还需要"总共多少条"来算"共多少页、翻页按钮怎么显示"。`PageResult` 把这两样打包成一个固定结构 `{total, records}`，所有分页接口都复用它，前端只要写一套分页渲染逻辑。
- **一个可优化点（值得作为教学点指出）**：`private List records;` 用的是**原始类型（raw type）`List`**，没写泛型 `List<Employee>`。好处是这个壳子能装任意实体的分页结果（员工、菜品、订单都能用同一个 `PageResult`）；代价是丢失了编译期类型检查。生产里更稳妥的写法是 `PageResult<T>` 加泛型。这里教程为了"一个壳子走天下"而牺牲了类型安全。
- `@AllArgsConstructor` 是 Lombok 注解，生成 `(long, List)` 的全参构造——这正是 Service 里 `new PageResult(total, records)` 能编译通过的原因。

- 上游：Service 用 `Page` 拆出的 `total` 和 `records` 来 `new`。
- 下游：返回给 Controller。

---

## 五、回到第 ①’ 步：Controller 用 `Result<T>` 统一包装返回

断点回到 Controller 最后一行：

```java
return Result.success(pageResult);
```

### 配角 D：统一返回结果 `Result<T>`

**文件**：`sky-common/src/main/java/com/sky/result/Result.java`

```java
@Data
public class Result<T> implements Serializable {
    private Integer code; // 1 成功；0 和其它数字为失败
    private String msg;   // 错误信息
    private T data;        // 业务数据（泛型）

    public static <T> Result<T> success() {            // 无数据的成功
        Result<T> result = new Result<T>();
        result.code = 1;
        return result;
    }
    public static <T> Result<T> success(T object) {    // 带数据的成功
        Result<T> result = new Result<T>();
        result.data = object;
        result.code = 1;
        return result;
    }
    public static <T> Result<T> error(String msg) {    // 失败
        Result result = new Result();
        result.msg = msg;
        result.code = 0;
        return result;
    }
}
```

- **为什么需要它**：如果每个接口返回的 JSON 结构都不一样，前端就得为每个接口单独写解析。统一成 `{code, msg, data}` 后，前端写一个**通用响应拦截器**：`code == 1` 就取 `data`，否则弹 `msg`。
- **`<T>` 泛型的妙处**：同一个壳，登录接口装 `EmployeeLoginVO`，分页接口装 `PageResult`，复用同一套结构。这里 `Result<PageResult>` 就是"成功，且 data 是一个分页结果"。
- 最终 `@RestController` 把它序列化成 JSON 返回前端，整条链结束：
  ```json
  {
    "code": 1,
    "msg": null,
    "data": {
      "total": 35,
      "records": [
        { "id": 1, "username": "admin", "name": "管理员", "status": 1, "phone": "13800000000", "..." : "..." }
      ]
    }
  }
  ```

> ⚠️ 顺带一个安全提醒：分页接口里 `records` 装的是**原始 `Employee` 实体**，它带着 `password` 字段（库里的 MD5 密文）。理论上这会把密文一并返回前端。对比 `getById` 方法里有一句 `employee.setPassword("****")` 主动抹掉密码——分页这里**没有做这步**。生产中规范做法是分页也返回一个**不含敏感字段的 VO**（如 `EmployeeVO`），或在查询时就不 `select password`。这是教学项目为简化留下的一个"对外暴露过多"的小瑕疵，读代码时要能识别出来。

---

## 六、总结与思考（比读懂源码更重要的部分）

> **学习心法**：源码会变（换个项目，类名表名全不同），但下面这些**设计思想是通用、可迁移的**。面试官不会问"苍穹外卖的 pageQuery 第几行写了啥"，但一定会问"你项目里分页怎么做的 / 动态查询条件怎么处理 / 插件机制懂不懂"。**记套路，别记代码。**

### 1. 必背套路一：分页用"插件 + ThreadLocal"做无侵入增强

**口诀**：`startPage 先占位，紧跟一条查询；插件偷偷加 limit 和 count，业务代码不沾分页。`

- `PageHelper.startPage(page, pageSize)` 把分页参数写进 **ThreadLocal**（每线程一份，天然线程安全）；
- 紧跟的**第一条** MyBatis 查询被 **拦截器（Interceptor / Plugin）** 拦下，自动追加 `count` 查询和 `limit` 子句；
- 你的 Mapper SQL 只写"查全部"，对分页**一无所知**。

为什么"必背"：这是 **AOP（面向切面）/ 无侵入增强** 思想在持久层的典型落地——**不改业务代码，却扩展了它的行为**。同类思想还有：日志、事务、权限校验都常用切面实现。
- ⚠️ 经典坑（面试爱问）：`startPage` 之后必须**紧跟**目标查询，中间不能插别的查询；否则分页会作用到错误的 SQL 上。
- ⚠️ 进阶（面试加分）：PageHelper 在查询结束后会**清理 ThreadLocal**（在 `finally` 里 `clearPage()`），防止线程池复用时把上一次的分页参数"带"给下一个请求——这是用 ThreadLocal 必须配套的"用完即清"纪律，否则会内存泄漏/参数串味。

### 2. 必背套路二：动态 SQL 处理"可选查询条件"

**口诀**：`条件可有可无用 <if>，拼接交给 <where> 兜底，模糊查询 concat + #{}。`

- `<if test="name != null and name != ''">` 让条件"有就拼、没有就不拼"；
- `<where>` 自动处理 `WHERE` 的有无、以及开头多余的 `and/or`；
- `like concat('%', #{name}, '%')` 用预编译占位符 `#{}` 防注入，用数据库 `concat` 拼通配符 `%`。

为什么"必背"：后台管理系统的"多条件筛选列表"几乎全靠它。比手写字符串拼 SQL 安全（防注入）、健壮（不会拼出语法错误的 `where and ...`）。

### 3. 必背套路三：三层架构 + 单向依赖（与登录链同款，再夯实一遍）

**口诀**：`Controller 接待，Service 编排，Mapper 存取，依赖只能从上往下。`

- Controller 只收参/调一次 Service/包装返回，**不碰分页逻辑**；
- Service 负责"编排"：调插件 + 调 Mapper + 组装 `PageResult`；
- Mapper 只写 SQL。
- 换分页方案只动 Service，换查询条件只动 XML，换返回字段只动结果类——**改动被隔离在单层**。这就是分层 + 单一职责（Single Responsibility）的价值。

### 4. 必背套路四：用"项目自己的类型"包住"第三方类型"（防腐层）

**口诀**：`插件内部用 Page，对外一律转 PageResult。`

- Service 拿到 PageHelper 的 `Page` 后，立刻转成项目自定义的 `PageResult` 再返回。
- 好处：项目对外接口**不绑定**任何第三方库类型，将来换分页框架，影响面只在 Service 内部那几行。这是**防腐层（Anti-Corruption Layer）/ 依赖隔离**的思想。

### 5. 必背套路五：GET 查询用参数绑定，POST 提交用 `@RequestBody`

**口诀**：`查询条件挂 URL（无注解 POJO 绑定），提交数据放 body（@RequestBody 反序列化）。`

- `page` 方法（GET）参数无注解 → Spring 按字段名 + setter 把查询串绑定到 DTO；
- `login`/`save`（POST）参数有 `@RequestBody` → Jackson 把 JSON body 反序列化成 DTO。
- 面试要能说清这两种绑定方式的区别和适用场景。

### 6. 哪些是"生产同款"、哪些是"教学简化"（面试要能分辨）

**生产同款（直接保留）：** 三层架构、动态 SQL、PageHelper 插件分页、统一返回 `Result`、统一分页结果 `PageResult`、`#{}` 防注入。

**教学简化（要知道怎么升级）：**
- ⚠️ 分页 `records` 直接返回 `Employee` 实体，**带出了 password 密文** → 生产应返回脱敏 VO 或查询时不 select 密码字段（对比 `getById` 里有 `setPassword("****")`，分页这里漏了）。
- ⚠️ `PageResult` 用**原始类型 `List`**（无泛型）→ 生产建议 `PageResult<T>` 保留类型安全。
- ⚠️ 分页参数 `page/pageSize` 用基本类型 `int`、无默认值/上限校验 → 生产应做默认值兜底，并限制 `pageSize` 上限（防止 `pageSize=100000` 拖垮数据库）。

---

## 七、面试官视角：这条链路我会怎么问（含口述答案）

> 假设我是 Java 后端面试官，看到你简历上写了这个项目，针对这条"分页查询"链路，我大概率会问下面这些。答案按"**面试时能直接口述、30~60 秒讲完**"的口语化风格写。

**Q1：你项目里的分页是怎么实现的？讲一下整个流程。**
> 我们用的是 PageHelper 这个分页插件。流程是：Controller 接到分页参数后调 Service，Service 里第一行先调 `PageHelper.startPage(页码, 每页条数)`，这一步不查库，只是把分页参数放进当前线程的 ThreadLocal。紧接着调 Mapper 执行一条"查全部"的普通查询，这条 SQL 在发往数据库前会被 PageHelper 的 MyBatis 拦截器拦下，自动加上 `limit`、还会额外发一条 `count` 查总数。最后拿到的是一个 `Page` 对象，它继承自 ArrayList，既是当前页数据，又带 `getTotal()`。Service 把 total 和 records 拆出来，封装成项目统一的 `PageResult` 返回，Controller 再用 `Result` 包一层返回前端。

**Q2：`PageHelper.startPage` 为什么必须紧跟着查询？底层是怎么生效的？**
> 因为它的原理是基于 ThreadLocal + MyBatis 拦截器。`startPage` 把分页参数存进当前线程的 ThreadLocal，拦截器只对"之后执行的第一条查询"取出这个参数去改写 SQL。如果中间插了别的查询，分页参数就会作用到那条不该分页的 SQL 上，导致分页失效或错乱。另外查询结束后插件会在 finally 里清掉 ThreadLocal，避免线程池复用时把分页参数泄漏给下一个请求。所以规范写法就是 `startPage` 紧挨着目标查询。

**Q3：MyBatis 的拦截器（插件）是什么？这体现了什么设计思想？**
> MyBatis 允许在它执行 SQL 的几个关键节点上插入自定义拦截器，在 SQL 真正执行前后做增强，比如改写 SQL、记录日志。这本质是 AOP——面向切面，核心是"不修改原有业务代码，却能扩展它的行为"。PageHelper 就是用这个机制，在不改我任何一行 Mapper 的前提下，自动加上了分页和 count。同样的思想还用在事务管理、权限校验、日志埋点上。

**Q4：分页查询里那个按名字模糊查的条件，是怎么实现"有就过滤、没有就查全部"的？为什么不用字符串拼 SQL？**
> 用 MyBatis 的动态 SQL。`<if test="name != null and name != ''">` 判断名字非空才把过滤条件拼进去；外面包一个 `<where>` 标签，它会自动处理：一个条件都没有时连 WHERE 都不加，有条件时自动去掉开头多余的 and。模糊匹配用 `name like concat('%', #{name}, '%')`，通配符交给数据库的 concat 拼。不用字符串拼接是因为那样既容易拼出语法错误，又有 SQL 注入风险；`#{}` 是预编译占位符，走 PreparedStatement 传参，能防注入。

**Q5：这个分页接口的返回值结构是怎样的？为什么要包成 `PageResult` 和 `Result`，不直接返回 List？**
> 最外层是统一返回 `Result`，结构是 `{code, msg, data}`，让前端用一套逻辑解析所有接口。data 里是 `PageResult`，结构是 `{total, records}`。之所以不直接返回 List，是因为前端渲染分页表格除了当前页数据，还需要总记录数来算总页数、控制翻页按钮。另外我们没有直接把 PageHelper 的 `Page` 返回出去，而是转成项目自己的 `PageResult`，这样对外接口不绑定第三方库，将来换分页方案影响面小。

**Q6（绑定细节）：这个 GET 分页接口的参数前没有 `@RequestBody`，它是怎么拿到值的？和登录接口有什么区别？**
> 登录是 POST，数据在 JSON 请求体里，所以参数前加 `@RequestBody`，由 Jackson 反序列化成 DTO。分页是 GET，参数是 URL 查询串，比如 `?name=张&page=1&pageSize=10`。这种情况参数是个普通 POJO 且不加注解，Spring MVC 会做对象参数绑定——按查询串的 key 匹配 DTO 的同名字段，通过 setter 注入。所以 DTO 必须有对应字段的 setter，这里靠 Lombok 的 `@Data` 生成。

**Q7（隐患排查）：这个分页接口有没有什么你觉得不太好、生产要改的地方？**
> 有几个。第一，records 直接返回了 Employee 实体，里面带 password 密文，会泄露到前端——对比同类的 getById 方法里有手动把密码设成星号，分页这里漏了，生产应该返回脱敏 VO 或查询时不 select 密码。第二，`PageResult` 的 records 用的是原始类型 List 没加泛型，丢了类型安全，建议改成泛型。第三，pageSize 没有上限校验，如果有人传一个超大的 pageSize 可能把数据库拖垮，生产要加默认值和上限限制。
