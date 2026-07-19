# 员工登录（Employee Login）全链路源码精读：从 HTTP 请求到 JWT 返回

**视频出处**：[在此处填写视频链接/出处]  
**关键词**：三层架构（Controller-Service-Mapper）、DTO/Entity/VO 三种数据载体、`@RequestBody` 参数绑定、MyBatis 接口映射、自定义异常 + 全局异常处理器（Global Exception Handler）、MD5 单向哈希、JWT（JSON Web Token）身份令牌、Builder 模式、统一返回结果 `Result<T>`  
**创建时间**：2026-06-05 17:16

---

## 〇、阅读这条链路前，先建立"全景地图"

我们要追的这条链，是后端最经典的一条：**用户输入账号密码 → 点登录 → 后端验证 → 返回一张"通行证"（Token）**。

用餐厅打比方，整条链上有四类角色，各司其职、互不越权：

| 角色 | 项目中的层 | 职责 | 类比 |
|---|---|---|---|
| 前台收银员 | `Controller` | 接客、收单、把成品端出去 | 不炒菜，只负责对接顾客和后厨 |
| 厨师长 | `Service` | 核心烹饪逻辑、判断食材合不合格 | 真正"做判断"的地方 |
| 仓库管理员 | `Mapper` | 按账本去冷库取货 | 只负责和数据库打交道 |
| 冷库 | `Database` | 存放原始数据 | MySQL |

**断点调试时，程序会按这个顺序在文件间跳转**（请把这张图记在脑子里，后面每一步都对应这里的一行）：

```
前端 POST /admin/employee/login   （携带 JSON: {username, password}）
   │
   ▼
① EmployeeController.login()                    [sky-server] 接客
   │  employeeService.login(dto)
   ▼
② EmployeeServiceImpl.login()                   [sky-server] 厨师长
   │  employeeMapper.getByUsername(username)
   ▼
③ EmployeeMapper（接口） → EmployeeMapper.xml    [sky-server] 仓库管理员 + 账本
   │  select * from employee where username = ?
   ▼
④ MySQL 返回一行记录 → MyBatis 映射成 Employee 实体
   │  （沿原路返回②）
   ▼
②’ 回到 Service：判空 → MD5 比对密码 → 判断账号状态
   │  全部通过则 return employee；任一失败则 throw 自定义异常
   ▼
①’ 回到 Controller：用 empId 生成 JWT → 组装 EmployeeLoginVO
   │
   ▼
Result.success(vo)  →  以 JSON 返回前端
```

> 注意一个跨模块的细节：`Controller / ServiceImpl / Mapper` 都在 **`sky-server`** 模块里；而 `Employee`、`EmployeeLoginDTO`、`EmployeeLoginVO` 这些数据类在 **`sky-pojo`** 模块；`JwtUtil`、`Result`、各种 `Exception`、`JwtProperties` 这些通用工具在 **`sky-common`** 模块。一条登录请求，实际上横跨了三个 Maven 子模块。

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
    private JwtProperties jwtProperties;       // 注入 JWT 配置（密钥、过期时间）

    @PostMapping("/login")   // 完整路径 = /admin/employee/login
    public Result<EmployeeLoginVO> login(@RequestBody EmployeeLoginDTO employeeLoginDTO) {
        log.info("员工登录：{}", employeeLoginDTO);

        // ① 调 Service 验证账号密码，拿回完整的 Employee 实体
        Employee employee = employeeService.login(employeeLoginDTO);

        // ② 登录成功后，生成 JWT 令牌
        Map<String, Object> claims = new HashMap<>();
        claims.put(JwtClaimsConstant.EMP_ID, employee.getId());
        String token = JwtUtil.createJWT(
                jwtProperties.getAdminSecretKey(),
                jwtProperties.getAdminTtl(),
                claims);

        // ③ 组装返回给前端的 VO
        EmployeeLoginVO employeeLoginVO = EmployeeLoginVO.builder()
                .id(employee.getId())
                .userName(employee.getUsername())
                .name(employee.getName())
                .token(token)
                .build();

        return Result.success(employeeLoginVO);
    }
}
```

**断点观察 —— 在程序进到方法体的第一行之前，框架已经替我们做了三件事：**

1. **路由匹配**。`@RestController` + `@RequestMapping("/admin/employee")` + `@PostMapping("/login")` 三者拼出完整路径 `POST /admin/employee/login`。Spring MVC 的前端控制器 `DispatcherServlet` 根据这个 URL 找到了这个方法。
   - *为什么需要它*：HTTP 请求只是一串文本，必须有人把"哪个 URL + 哪个方法"对应到"哪个 Java 方法"。这就是路由（Routing）。
2. **请求体反序列化**。`@RequestBody` 告诉 Spring：把请求体里的 JSON（`{"username":"admin","password":"123456"}`）用 Jackson 反序列化成一个 `EmployeeLoginDTO` 对象。
   - *为什么是 DTO 而不是 Entity*：见下面对 `EmployeeLoginDTO` 的说明。
3. **依赖注入**。`@Autowired` 让 Spring 容器在创建这个 Controller 时，自动把 `EmployeeService` 的实现类和 `JwtProperties` 的实例"塞"进来。所以方法里能直接用 `employeeService`，不用 `new`。

**这一层的职责边界（很重要的设计纪律）**：Controller 只做"对接 I/O"——收参数、调一次 Service、把结果包装好返回。它**不写任何业务判断**（比如"密码对不对"绝不在这里 `if`）。

> 顺带看一眼上游传进来的数据载体。

### 配角 A：`EmployeeLoginDTO`（前端 → 后端 的入参）

**文件**：`sky-pojo/src/main/java/com/sky/dto/EmployeeLoginDTO.java`

```java
@Data
@ApiModel(description = "员工登录时传递的数据模型")
public class EmployeeLoginDTO implements Serializable {
    @ApiModelProperty("用户名")
    private String username;
    @ApiModelProperty("密码")
    private String password;
}
```

- **为什么需要它（DTO，Data Transfer Object，数据传输对象）**：前端登录其实只需要传 `username` 和 `password` 两个字段。而数据库的 `Employee` 实体有 10 多个字段（id、phone、status、createTime…）。如果直接用 `Employee` 接参，既冗余又危险（前端可能伪造 `status`、`createUser` 等字段）。所以专门定义一个"只含登录所需字段"的瘦类来接参。
- **`@Data`** 是 Lombok 注解，编译期自动生成 getter/setter/toString。`log.info("员工登录：{}", employeeLoginDTO)` 能打印出内容，靠的就是它生成的 `toString()`。

---

## 二、第 ① 行代码触发跳转：进入 Service

断点单步进入 `employeeService.login(employeeLoginDTO)`。

**注意一个细节**：Controller 里注入的是 `EmployeeService`（**接口**），但运行时真正执行的是它的实现类 `EmployeeServiceImpl`。这是 Spring 的依赖注入 + 面向接口编程（Program to Interface）：Controller 不关心"谁来实现"，只认接口。好处是将来想换实现，Controller 一行都不用改。

**文件**：`sky-server/src/main/java/com/sky/service/impl/EmployeeServiceImpl.java`

```java
@Service                                    // 声明这是一个 Service Bean，交给 Spring 管理
public class EmployeeServiceImpl implements EmployeeService {

    @Autowired
    private EmployeeMapper employeeMapper;   // 注入 Mapper，用来查数据库

    public Employee login(EmployeeLoginDTO employeeLoginDTO) {
        String username = employeeLoginDTO.getUsername();
        String password = employeeLoginDTO.getPassword();

        // 1、根据用户名查询数据库中的数据
        Employee employee = employeeMapper.getByUsername(username);

        // 2、处理各种异常情况（用户名不存在、密码不对、账号被锁定）
        if (employee == null) {
            // 账号不存在
            throw new AccountNotFoundException(MessageConstant.ACCOUNT_NOT_FOUND);
        }

        // 密码比对
        // TODO 后期需要进行md5加密，然后再进行比对
        password = DigestUtils.md5DigestAsHex(password.getBytes());
        if (!password.equals(employee.getPassword())) {
            // 密码错误
            throw new PasswordErrorException(MessageConstant.PASSWORD_ERROR);
        }

        if (employee.getStatus() == StatusConstant.DISABLE) {
            // 账号被锁定
            throw new AccountLockedException(MessageConstant.ACCOUNT_LOCKED);
        }

        // 3、返回实体对象
        return employee;
    }
    // …… save / pageQuery / startOrStop 等其他方法略
}
```

**断点单步走读：**

- **`getUsername()` / `getPassword()`**：从 DTO 里把两个字段取出来。此刻 `password` 还是前端传来的**明文**（比如 `"123456"`）。

- **`employeeMapper.getByUsername(username)`**：这一行又触发一次跳转 —— 进入数据访问层（第 ③ 步）。断点会"消失"在这一行，下一帧出现在 MyBatis 的代理逻辑里。我们先跳过去看第三节，回来再继续往下。

---

## 三、第 ③ 步：Mapper 接口 + XML + 数据库

这里有个让初学者困惑的点：`EmployeeMapper` **只有接口，没有实现类**，谁在执行 SQL？答案是 **MyBatis 用动态代理（Dynamic Proxy）在运行时生成了一个实现类**。它根据"接口全限定名 + 方法名"去 XML 里找同名的 SQL 标签来执行。

### 账本的"目录"：Mapper 接口

**文件**：`sky-server/src/main/java/com/sky/mapper/EmployeeMapper.java`

```java
@Mapper   // 告诉 MyBatis：这是一个 Mapper 接口，请为它生成代理实现
public interface EmployeeMapper {

    /**
     * 根据用户名查询员工
     */
    Employee getByUsername(@Param("username") String username);
    // …… insert / pageQuery / update / getById 等略
}
```

- **`@Mapper`**：标记接口，MyBatis 启动时扫描到它，生成代理对象并注册成 Bean，所以 Service 里能 `@Autowired` 它。
- **`@Param("username")`**：给参数起个名字，XML 里就能用 `#{username}` 引用。

### 账本的"内容"：XML 里的 SQL

**文件**：`sky-server/src/main/resources/mapper/EmployeeMapper.xml`

```xml
<mapper namespace="com.sky.mapper.EmployeeMapper">   <!-- namespace 必须等于接口全限定名 -->

    <!-- id 必须等于接口里的方法名 getByUsername -->
    <select id="getByUsername" resultType="com.sky.entity.Employee">
        select * from employee where username = #{username}
    </select>

    <!-- …… 其他 SQL 略 -->
</mapper>
```

**MyBatis 是怎么把接口和 XML 接起来的（这是关键设计）：**

- `namespace` = 接口全限定名 `com.sky.mapper.EmployeeMapper`
- `<select>` 的 `id` = 接口方法名 `getByUsername`

两者一拼，MyBatis 就知道："调用 `EmployeeMapper.getByUsername` 时，执行这条 `select`。"

**数据流细节：**
- `#{username}` 是占位符，MyBatis 用 `PreparedStatement` 把它替换成参数值——**注意是预编译占位符，不是字符串拼接**，所以天然防 SQL 注入（SQL Injection）。
- `resultType="com.sky.entity.Employee"`：查询结果（一行记录）的每个列，会按"列名 → 同名属性"映射到 `Employee` 实体上（依赖 `mybatis.configuration.map-underscore-to-camel-case` 把 `id_number` 这种下划线列名映射成 `idNumber` 驼峰属性）。

**这一步的上下游：**
- 上游：Service 传来一个字符串 `username`。
- 下游：MySQL。SQL 执行后，MyBatis 把结果封装成 `Employee` 对象（**注意：这个对象里 `password` 字段是数据库里存的 MD5 密文，不是明文**），原路返回给 Service。
- 如果查无此人，返回 `null`。

---

## 四、回到第 ②’ 步：Service 拿到 Employee 后做三道安检

断点从 Mapper 返回，回到 `EmployeeServiceImpl.login` 的第 1 步之后。现在手里有了 `employee`（可能是 `null`，可能是一条真实记录）。接下来是**整条链最核心的业务逻辑**——三道安检，任何一道不过就直接抛异常中断。

```java
// 安检 1：账号是否存在
if (employee == null) {
    throw new AccountNotFoundException(MessageConstant.ACCOUNT_NOT_FOUND);
}

// 安检 2：密码是否正确
password = DigestUtils.md5DigestAsHex(password.getBytes());  // 把明文密码做 MD5
if (!password.equals(employee.getPassword())) {              // 和库里的密文比
    throw new PasswordErrorException(MessageConstant.PASSWORD_ERROR);
}

// 安检 3：账号是否被禁用
if (employee.getStatus() == StatusConstant.DISABLE) {
    throw new AccountLockedException(MessageConstant.ACCOUNT_LOCKED);
}

return employee;  // 三关全过，放行
```

**逐道安检分析：**

1. **判空**：`employee == null` 说明 Mapper 没查到这个用户名 → 抛 `AccountNotFoundException`。

2. **MD5 密码比对** —— 这里有个**容易看走眼、但很值得讲的细节**：
   - 上面那行注释写着 `// TODO 后期需要进行md5加密`，但**它紧接着的下一行就已经在做 MD5 了**（`DigestUtils.md5DigestAsHex(...)`）。这是教程的"历史痕迹"：最早期版本是明文直接比对、留了个 TODO 提醒"以后要加密"；后来补上了 MD5，却忘了删掉这条 TODO 注释。**真实代码里这种过时注释很常见，读代码要以代码本身为准，不要被注释带偏。**
   - *为什么要 MD5（哈希，Hash）*：数据库里**绝不能存明文密码**。存的是 `md5("123456")` 的结果。登录时把用户输入的明文做同样的 MD5，再比对两个密文是否相等。这样即使数据库泄露，攻击者也拿不到原始密码。
   - *补充一句工程现实*：纯 MD5 在生产环境其实**不够安全**（容易被彩虹表撞库），真实项目通常用 `BCrypt` 或"MD5 + 盐值 salt"。这个教程项目用 MD5 是为了教学简化。

3. **账号状态**：`employee.getStatus() == StatusConstant.DISABLE`（`DISABLE` 通常是常量 `0`）说明账号被管理员禁用 → 抛 `AccountLockedException`。

**三关全过 → `return employee`**，把完整实体交回 Controller。

### 配角 B：自定义异常体系 + 全局异常处理器

这是这条链里**最值得学的设计套路**，单独展开。

注意 Service 验证失败时**不返回错误码、不返回 null，而是直接 `throw`**。这些异常都继承自同一个基类：

**文件**：`sky-common/src/main/java/com/sky/exception/BaseException.java`

```java
public class BaseException extends RuntimeException {   // 注意：继承的是 RuntimeException（非受检异常）
    public BaseException() {}
    public BaseException(String msg) { super(msg); }
}
```

`PasswordErrorException`、`AccountNotFoundException`、`AccountLockedException` 全都 `extends BaseException`：

```java
public class PasswordErrorException extends BaseException {
    public PasswordErrorException(String msg) { super(msg); }
}
```

那这些抛出去的异常被谁接住？答案是**全局异常处理器**：

**文件**：`sky-server/src/main/java/com/sky/handler/GlobalExceptionHandler.java`

```java
@RestControllerAdvice   // 横切所有 Controller，统一拦截异常
@Slf4j
public class GlobalExceptionHandler {

    @ExceptionHandler          // 只要抛出的是 BaseException（或其子类），就由这个方法处理
    public Result exceptionHandler(BaseException ex){
        log.error("异常信息：{}", ex.getMessage());
        return Result.error(ex.getMessage());   // 转成统一的失败结果返回前端
    }
    // 还有一个处理 SQL 唯一约束冲突的方法，略
}
```

**这套机制为什么优雅（务必理解）：**
- *为什么需要它*：如果没有全局处理器，Service 每抛一个异常，Controller 就得 `try-catch` 一次，业务代码会被异常处理淹没，变成一堆 `if-else`。
- *它是什么*：`@RestControllerAdvice` 是 Spring 提供的"全局 AOP 切面"，专门在所有 Controller 方法**外层**兜底。`@ExceptionHandler` 按异常类型分发。
- *数据流*：`Service throw PasswordErrorException("密码错误")` → 异常一路向上冒泡，**Controller 的 `login` 方法被中断**（后面生成 JWT、组装 VO 的代码根本不会执行）→ 冒泡到最外层被 `GlobalExceptionHandler` 捕获 → 转成 `Result.error("密码错误")` → 以 JSON 返回前端。
- **结果**：正常业务代码（Controller）只需要写"成功路径"（Happy Path），完全不用关心失败分支，代码非常干净。这就是"用异常做业务流程控制 + 集中式错误处理"的经典范式。

---

## 五、回到第 ①’ 步：Controller 生成 JWT 令牌

断点回到 Controller，`employee` 已是验证通过的完整实体。开始第 ② 件事——发"通行证"。

```java
Map<String, Object> claims = new HashMap<>();
claims.put(JwtClaimsConstant.EMP_ID, employee.getId());   // 把 empId 装进令牌
String token = JwtUtil.createJWT(
        jwtProperties.getAdminSecretKey(),   // 密钥（来自配置文件）
        jwtProperties.getAdminTtl(),         // 过期时长（来自配置文件）
        claims);
```

- **为什么需要 JWT**：HTTP 是 **无状态(Stateless)** 的——服务器是"健忘"的，处理完这次请求就忘了你是谁。登录成功后必须给前端发一个"身份凭证"，前端之后每次请求都带上它，后端一解析就知道"这是几号员工发的请求"，不用每次都重新输账号密码。
- **`claims`（声明）**：令牌里要携带的身份信息。这里只放了 `empId`。`JwtClaimsConstant.EMP_ID` 是个常量 `"empId"`（定义在 `sky-common` 的 `JwtClaimsConstant` 类里），用常量而非裸字符串，是为了避免到处手写 `"empId"` 时拼错。

### 配角 C：JWT 配置 `JwtProperties`

**文件**：`sky-common/src/main/java/com/sky/properties/JwtProperties.java`

```java
@Component
@ConfigurationProperties(prefix = "sky.jwt")   // 自动读取 application.yml 中 sky.jwt.* 配置
@Data
public class JwtProperties {
    private String adminSecretKey;   // ← 对应 application.yml: sky.jwt.admin-secret-key
    private long adminTtl;           // ← sky.jwt.admin-ttl
    private String adminTokenName;
    // 还有 user 端的三个，略
}
```

- *为什么*：密钥、过期时间这种"环境相关、可能要改"的值，不应硬编码在 Java 里，而要放到 `application.yml`。`@ConfigurationProperties(prefix="sky.jwt")` 把 YAML 里 `sky.jwt` 下的配置项**自动绑定**到这个类的同名属性上（`admin-secret-key` → `adminSecretKey`，短横线转驼峰）。
- 这也解释了 Controller 里为什么能 `jwtProperties.getAdminSecretKey()`——值是 Spring 启动时从配置文件读进来的。

### 配角 D：`JwtUtil.createJWT` 真正生成令牌

**文件**：`sky-common/src/main/java/com/sky/utils/JwtUtil.java`

```java
public static String createJWT(String secretKey, long ttlMillis, Map<String, Object> claims) {
    // 1. 指定签名算法：HS256（对称加密）
    SignatureAlgorithm signatureAlgorithm = SignatureAlgorithm.HS256;

    // 2. 计算过期时间点 = 当前时间 + 存活时长
    long expMillis = System.currentTimeMillis() + ttlMillis;
    Date exp = new Date(expMillis);

    // 3. 组装并签名
    JwtBuilder builder = Jwts.builder()
            .setClaims(claims)                                                   // 放入自定义数据（empId）
            .signWith(signatureAlgorithm, secretKey.getBytes(StandardCharsets.UTF_8))  // 用密钥签名
            .setExpiration(exp);                                                 // 设置过期时间

    return builder.compact();   // 4. 拼成最终的 token 字符串
}
```

- 这是个**静态工具方法**（`static`），不依赖任何实例状态，输入相同就输出相同，所以做成工具类。
- 基于 `jjwt` 库 + HS256 对称算法，把 `claims`（empId）、过期时间、服务器密钥揉在一起，`.compact()` 产出一串形如 `xxxxx.yyyyy.zzzzz` 的字符串。
- **关键点**：令牌是用服务器**私有密钥签名**的。前端拿到后**改不动里面的内容**（一改签名就对不上），但服务器能用同一个密钥验签。`JwtUtil` 里还有一个对应的 `parseJWT` 方法，用于后续请求拦截器里解析令牌、取出 `empId`——那是登录之后"验票"环节的事，不在本条链路。

---

## 六、第 ①’’ 步：组装 VO + 统一返回

```java
EmployeeLoginVO employeeLoginVO = EmployeeLoginVO.builder()
        .id(employee.getId())
        .userName(employee.getUsername())
        .name(employee.getName())
        .token(token)
        .build();

return Result.success(employeeLoginVO);
```

### 配角 E：`EmployeeLoginVO`（后端 → 前端 的出参）

**文件**：`sky-pojo/src/main/java/com/sky/vo/EmployeeLoginVO.java`

```java
@Data
@Builder                 // ← Lombok：编译期生成建造者，支持 .id().userName()....build() 链式调用
@NoArgsConstructor
@AllArgsConstructor
@ApiModel(description = "员工登录返回的数据格式")
public class EmployeeLoginVO implements Serializable {
    private Long id;
    private String userName;
    private String name;
    private String token;
}
```

- **为什么需要 VO（View Object，视图对象）**：从数据库查出的 `Employee` 实体含密码密文、创建时间、创建人 id 等敏感/无关字段，**绝不能整个扔给前端**。VO 是"专门为这个接口的返回量身定制"的瘦类——前端登录后只需要 `id / userName / name / token` 四样，就只给这四样。
- **`@Builder`（建造者模式，Builder Pattern）**：像在赛百味点餐——"要面包 + 火腿 + 生菜"（链式 set），最后说"做吧"（`.build()`）。比起 `new` 出来再一行行 `setXxx()`，链式写法更紧凑、可读性更好，且适合字段多、可选字段多的对象。

### 配角 F：统一返回结果 `Result<T>`

**文件**：`sky-common/src/main/java/com/sky/result/Result.java`

```java
@Data
public class Result<T> implements Serializable {
    private Integer code;  // 1 成功；0 或其它失败
    private String msg;    // 错误信息
    private T data;        // 业务数据（泛型）

    public static <T> Result<T> success(T object) {
        Result<T> result = new Result<>();
        result.data = object;
        result.code = 1;
        return result;
    }
    public static <T> Result<T> error(String msg) { /* code=0, msg=... */ }
}
```

- **为什么需要它**：如果每个接口返回的 JSON 结构都不一样，前端就得为每个接口单独写解析逻辑。统一成 `{code, msg, data}` 后，前端可以写一个**通用拦截器**：见 `code == 1` 就取 `data`，否则弹 `msg` 报错。前后端协作成本大幅下降。
- `<T>` 泛型让它能装任意类型的 `data`——登录接口装 `EmployeeLoginVO`，分页接口装 `PageResult`，都复用同一个壳。
- 最终 `Result.success(vo)` 被 `@RestController` 序列化成 JSON：
  ```json
  { "code": 1, "msg": null, "data": { "id": 1, "userName": "admin", "name": "管理员", "token": "xxx.yyy.zzz" } }
  ```
  返回前端，整条链结束。

---

## 七、总结与思考（比读懂源码更重要的部分）

> **学习心法**：项目的源码会变（换个项目，类名、表名全不一样），但下面这些**设计思想是通用的、可迁移的**。面试官不会问你"苍穹外卖的 login 方法第几行写了什么"，但一定会问"你项目里是怎么分层的 / 异常怎么处理的 / 登录态怎么维持的"。所以这一节才是真正要内化的部分——**记套路，而不是记代码**。

### 1. 必背套路一：三层架构 + 单向依赖（最核心）

**口诀**：`Controller 管接待，Service 管思考，Mapper 管存取，依赖只能从上往下。`

```
前端 Request
  → Controller（接客层：收参 / 调一次 Service / 组装返回，【绝不写业务判断】）
  → Service   （业务层：核心逻辑、所有 if 校验、抛异常、事务边界）
  → Mapper    （持久层：只写 SQL，接口 + XML，不含任何业务）
  → DB
```

为什么"必背"：
- **职责单一（Single Responsibility）**：每层只干一件事，出 bug 时能快速定位"问题在哪一层"。
- **单向依赖**：上层依赖下层，下层**绝不**反向调用上层（Mapper 永远不会去调 Service）。这避免了循环依赖、让每层都能独立测试。
- **面向接口编程**：Controller 注入的是 `EmployeeService` 接口而非 `EmployeeServiceImpl`。换实现不影响调用方——这是**依赖倒置（Dependency Inversion）** 在项目里的落地。
- **可替换性**：换数据库只动 Mapper、换加密方式只动 Service、换返回字段只动 VO。这就是分层带来的"改动隔离"。

> ⚠️ 最容易踩的反模式：把业务判断写进 Controller、或在 Mapper 里写业务逻辑。一旦这么做，分层就名存实亡了。

### 2. 必背套路二：DTO / Entity / VO 三层数据模型（绝不混用）

**口诀**：`进来用 DTO，落库用 Entity，出去用 VO，一个都不能省。`

```
DTO（前端传入，瘦：只含必要入参，防止前端越权传 status/createUser 等字段）
  → Entity（数据库映射，胖：含 password 密文、createTime 等全字段，对外是机密）
  → VO（返回前端，瘦：只挑前端该看的字段，天然屏蔽敏感信息）
```

为什么"必背"：
- **安全边界**：直接把 `Entity` 返回前端 = 把密码密文、内部字段全暴露，是真实事故级问题。
- **解耦数据库与接口**：数据库表结构变了，不一定要改对外接口（中间隔着 DTO/VO 缓冲）。
- **防止过度提交（Mass Assignment）**：用 DTO 限定入参字段，前端就无法伪造 `status`、`createUser` 等它本不该碰的字段。

> 面试高频追问："为什么不直接用一个 Employee 走到底？" → 答"安全 + 解耦 + 防越权"三点即可。

### 3. 必背套路三：异常驱动的流程控制 + 全局兜底

**口诀**：`业务出错就 throw，绝不返回错误码；Controller 只写成功路径，失败交给全局处理器。`

- Service 校验失败 → `throw new PasswordErrorException(...)`（自定义异常继承 `BaseException`，而 `BaseException extends RuntimeException` 是**非受检异常**，所以不用在方法签名上声明 `throws`，不污染调用链）。
- 异常向上冒泡，**Controller 的后续代码（生成 JWT、组装 VO）根本不会执行**——这就是"用异常中断流程"，比层层 `if (失败) return 错误码` 干净得多。
- `@RestControllerAdvice` + `@ExceptionHandler` 在所有 Controller **外层**统一捕获，转成统一的 `Result.error(msg)`。

为什么"必背"：业务代码因此只需要描述"成功怎么走"（Happy Path），错误处理被**集中托管**，代码可读性和一致性大幅提升。这是中大型项目的标配范式。

### 4. 必背套路四：三个"统一" + 配置外置

| 套路 | 实现 | 解决什么问题 |
|---|---|---|
| 统一返回结果 | `Result<T>`（`{code,msg,data}`） | 前端用一套逻辑解析所有接口的响应 |
| 统一异常处理 | `@RestControllerAdvice` | 业务代码不写 `try-catch`，错误格式一致 |
| 统一配置绑定 | `@ConfigurationProperties` | 密钥/过期时间外置到 YAML，不硬编码、可分环境 |

> 这三个"统一"几乎出现在每一个规范的 Spring Boot 项目里，是"工程素养"的体现，面试时主动提到会加分。

### 5. 必背套路五：无状态认证（JWT）

**口诀**：`登录时签发令牌，后续请求验票，服务端不存会话。`

- HTTP 无状态 → 登录成功后签发 JWT（内含 `empId`，服务器密钥签名，前端改不动）。
- 前端之后每次请求带上 token，服务端解析即知"是谁"，**无需服务端存储 Session** → 天然适合分布式/多实例部署。
- 本条链只覆盖"签发"，完整闭环还需要"**拦截器在后续请求里验票**"（解析 token、校验过期、把 `empId` 存入 `ThreadLocal` 供本次请求随处取用）——那是登录之外的另一条链路。

### 6. 哪些是"生产同款"、哪些是"教学简化"（面试要能分辨）

**生产同款（直接保留）：** 三层架构、DTO/VO 分离、密码哈希存储、JWT 认证、全局异常 + 统一返回。

**教学简化（要知道怎么升级）：**
- ⚠️ **MD5** 不加盐、不可抗彩虹表 → 生产用 **BCrypt**（自带盐、可调计算成本）或 PBKDF2。
- ⚠️ JWT 这里**无法主动失效**（一旦签发，过期前都有效）→ 生产常配合 Redis 黑名单 / 短时 access token + refresh token。

---

## 八、面试官视角：这条链路我会怎么问（含口述答案）

> 假设我是 Java 后端面试官，看到你简历上写了这个项目，针对这条登录链路，我大概率会问下面这些。答案按"**面试时能直接口述**"的口语化风格写，控制在 30~60 秒讲完。

**Q1：讲一下你这个项目的整体分层，一个登录请求是怎么流转的？**
> 我们是标准的三层架构。请求先到 Controller，它只负责接收参数、调用 Service、组装返回，不写业务逻辑。核心校验在 Service 层：先通过 Mapper 按用户名查库，然后依次校验账号是否存在、密码是否匹配、账号是否被禁用。Mapper 是持久层，基于 MyBatis，接口定义方法、XML 写 SQL。依赖是单向的，上层调下层。具体到登录：`@RequestBody` 把 JSON 转成 DTO → Service 校验 → 通过后回到 Controller 用员工 id 生成 JWT → 封装成 VO → 用统一的 `Result` 返回。

**Q2：你项目里为什么要区分 DTO、Entity、VO？只用一个实体类不行吗？**
> 主要是安全和解耦。Entity 对应数据库表，包含密码密文、创建人这些敏感或内部字段，直接返回前端会泄露。所以对外返回用 VO，只暴露前端真正需要的字段。入参用 DTO，是为了限定前端只能传该传的字段，防止它伪造 status、createUser 这类它不该碰的字段（也就是防过度提交）。同时 DTO/VO 把数据库结构和对外接口隔开，表结构调整不一定要改接口。

**Q3：登录失败（比如密码错）时，代码是怎么处理的？为什么不用 if 返回错误码？**
> Service 里校验不通过会直接抛自定义异常，比如密码错抛 `PasswordErrorException`，它继承自 `BaseException`，而 `BaseException` 继承 `RuntimeException`，是非受检异常。异常一抛，Controller 后面生成 JWT、组装 VO 的代码就不执行了，相当于用异常中断了流程。这些异常统一由一个加了 `@RestControllerAdvice` 的全局异常处理器捕获，转成统一的失败 `Result` 返回前端。好处是业务代码只写成功路径，不用到处 try-catch 或层层判断错误码，代码干净、错误格式也统一。

**Q4：JWT 是什么？为什么用它而不用 Session？它存在哪、安全吗？**
> JWT 是一段服务端用密钥签名的字符串，里面可以携带身份信息，我们项目里放了员工 id。用它是因为 HTTP 是无状态的，登录后得有个凭证，前端每次请求带上、服务端一解析就知道是谁。相比 Session，JWT 不需要服务端存储会话状态，天然适合多实例/分布式部署。安全性上，token 被密钥签名，前端改内容签名就对不上，所以防篡改；但要注意它本身不加密、内容可被 Base64 解开，所以不能放敏感数据。另外它在过期前无法主动失效，生产里通常配合 Redis 做黑名单或用 refresh token 机制。

**Q5：密码是怎么存和校验的？MD5 够安全吗？生产你会怎么改？**
> 数据库里绝不存明文，存的是密码的哈希值。登录时把用户输入的明文做同样的哈希，再和库里的哈希比对，相等就算通过。这样即使库泄露也拿不到原始密码。这个项目用的是 MD5，其实不够安全——MD5 不加盐、计算太快，容易被彩虹表或暴力破解。生产我会用 BCrypt，它自带随机盐、还能调计算成本，相同明文每次哈希结果都不同，更抗破解。

**Q6（MyBatis 细节）：Mapper 只有接口没有实现类，SQL 是怎么被执行的？`#{}` 和 `${}` 有什么区别？**
> MyBatis 启动时扫描带 `@Mapper` 的接口，用动态代理在运行时生成实现类，再根据接口的全限定名匹配 XML 的 namespace、用方法名匹配 SQL 标签的 id，这样调接口方法就等于执行对应的 SQL。`#{}` 是预编译占位符，底层用 `PreparedStatement` 传参，能防 SQL 注入，是默认选择；`${}` 是字符串直接拼接，有注入风险，只在需要动态传表名、排序字段这种没法用占位符的场景才用，且要自己做白名单校验。

**Q7（设计追问）：如果让你把密码加密从 MD5 换成 BCrypt，需要改动哪几层？这体现了什么设计原则？**
> 只需要改 Service 层的密码处理逻辑（加密和比对那两处），Controller、Mapper、DTO/VO、数据库结构都不用动，最多是密文字段长度要够。改动被隔离在一层里，这正是分层架构和单一职责带来的好处——每层只负责自己的事，变更影响范围可控。这也是面向接口、低耦合设计的价值体现。

---