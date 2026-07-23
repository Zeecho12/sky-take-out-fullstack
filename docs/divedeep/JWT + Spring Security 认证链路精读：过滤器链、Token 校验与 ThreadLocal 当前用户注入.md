# JWT + Spring Security 认证链路精读：过滤器链、Token 校验与 ThreadLocal 当前用户注入

**关联**：feature 0001（C 端认证改造：微信登录 → 本地账号密码 + JWT + Spring Security）
**关键词**：Spring Security 过滤器链（Filter Chain）、`OncePerRequestFilter`、JWT（JSON Web Token）无状态认证（Stateless Authentication）、`SecurityContextHolder` / `Authentication`、`GrantedAuthority` 与 `ROLE_` 前缀、`ThreadLocal` 当前用户上下文、Filter vs Interceptor（过滤器 vs 拦截器）、`AuthenticationManager` / `UserDetailsService` / `UserDetails`、`BCryptPasswordEncoder`、401 vs 403（`AuthenticationEntryPoint` / `AccessDeniedHandler`）
**创建时间**：2026-07-23 10:25

---

## 〇、阅读这条链路前，先建立"全景地图"

我们要追的这条链，是**登录之后**的每一次请求都会走的路：**前端带着一张"通行证"（JWT）来敲门 → 后端在正式处理业务之前，先在门口验票、认出"你是几号用户" → 把这个身份塞到一个"随手能取"的地方，供后面所有业务代码使用**。

这条链回答一个很具体的问题：一个带 `Authorization: Bearer <JWT>` 的请求进来后，**"当前登录用户的 id" 到底是怎么一步步被解析出来、又是怎么被送到 `AddressBookController` / `OrderServiceImpl` 手里的？**

> feature 0001 之前，苍穹外卖原版用的是 **拦截器（Interceptor）** 体系（`JwtTokenUserInterceptor` / `JwtTokenAdminInterceptor`，注册在 `WebMvcConfiguration` 里）。0001 改造后，这两个拦截器已被**彻底删除**（在 `sky-take-out` 全仓 grep 已查无此类），认证改由 **Spring Security 的过滤器链** 承担。所以本篇讲的是**当前真实代码**，不是原版教程记忆——两者机制不同，别混。

先用两个熟悉的场景打比方。整条链上有这么几类角色：

| 角色 | 项目中的类 / 层 | 职责 | 类比 |
|---|---|---|---|
| 门禁链 | Spring Security `FilterChainProxy` | 请求进 Controller 前的一串关卡 | 机场：值机后到登机口之间，要连过安检、边检好几道门 |
| 验票员 | `JwtAuthenticationFilter` | 读票（Token）、验真伪、认出你是谁 | 安检口那个刷你登机牌的人 |
| 验票机 | `JwtUtil.parseJWT` | 用密钥验签、拆出票面信息 | 刷登机牌的那台机器 |
| 身份牌（授权用） | `SecurityContextHolder` | 存"这次请求是谁 + 有什么权限"，给授权规则查 | MMORPG 里你的角色卡：等级/阵营，决定你能进哪个副本 |
| 随身托盘（业务用） | `BaseContext`（`ThreadLocal`） | 把"当前用户 id"放在本线程随手能取的托盘上 | 餐厅：服务员把你这桌的点单夹在专属托盘上，后厨随时来拿 |
| 授权规则 | `SecurityConfig.authorizeRequests` | 判定这张身份牌够不够格进这个 URL | 登机口：check 你的登机牌航班号对不对得上这个口 |

**断点调试时，一个带 Token 的请求会按这个顺序在文件间跳转**（把这张图记在脑子里，后面每一节都对应这里的一行）：

```
带 Authorization: Bearer <JWT> 的请求   （例：GET /user/addressBook/list）
   │
   ▼
Servlet 容器 → Spring Security 过滤器链（FilterChainProxy）      [sky-server] SecurityConfig 定义整条链
   │
   ▼
① JwtAuthenticationFilter.doFilterInternal()                    [sky-server/security] 验票员
   │   读 "Authorization" 头 → 判断以 "Bearer " 开头 → substring(7) 截出 token
   │   JwtUtil.parseJWT(secretKey, token)  ───────────────────► [sky-common] 验签 + 解析 → Claims{sub, role, exp}
   │   取 sub = userId、role = "USER"
   │   ├─ 写 SecurityContextHolder（权限 ROLE_USER）  ← 给下面②的"授权阶段"查
   │   └─ BaseContext.setCurrentId(userId) ───────────────────► [sky-common] ThreadLocal 存当前用户 id
   ▼
② filterChain.doFilter() 放行 → 继续走完过滤器链 → 授权决策       [sky-server] SecurityConfig.authorizeRequests
   │   /user/** 要求 hasRole("USER") → 命中 ROLE_USER → 通过
   │   （token 缺失/无效 → 没身份 → 401 AuthenticationEntryPoint；角色不符 → 403 AccessDeniedHandler）
   ▼
③ DispatcherServlet → AddressBookController.list()              [sky-server] 业务接客
   │   addressBook.setUserId(BaseContext.getCurrentId())  ◄───── [sky-common] 从 ThreadLocal 取回当前用户 id
   ▼
④ Service → Mapper → DB（凭 userId 只查/改当前用户自己的数据）
   │   （原路返回，响应逐层往回走）
   ▼
⑤ 请求结束：回到 ① 的 finally 块
      BaseContext.removeCurrentId()   ← 清理 ThreadLocal，防线程池复用导致"串号"和内存泄漏
```

> 跨模块细节：`SecurityConfig`、`JwtAuthenticationFilter`、`UserController`、各 Service 都在 **`sky-server`** 模块；`JwtUtil`、`BaseContext`、`JwtProperties`、各 `Exception` 在 **`sky-common`** 模块；`User`、`UserLoginDTO`、`UserLoginVO` 在 **`sky-pojo`** 模块。一次"验票"，横跨了三个 Maven 子模块。

下面进入断点逐步走读。为了先把"票从哪来"讲明白，第一节先花一点篇幅简述**上游登录如何签发这张票**，然后回到本篇主角——验票链路。

---

## 一、上游简述：登录时，这张 JWT 是怎么签发出来的

验票之前得先有票。C 端登录的入口在 `UserController`。

**文件**：`sky-server/src/main/java/com/sky/controller/user/UserController.java`

```java
@RestController
@RequestMapping("/user/user")
@Api(tags = "C端用户相关接口")
@Slf4j
public class UserController {

    @Autowired
    private UserService userService;

    @PostMapping("/login")   // 完整路径 = /user/user/login（在 SecurityConfig 白名单里，免认证）
    @ApiOperation("账号密码登录")
    public Result<UserLoginVO> login(@RequestBody UserLoginDTO userLoginDTO) {
        log.info("C端登录:{}", userLoginDTO.getUsername());
        return Result.success(userService.login(userLoginDTO));
    }
    // register / changePassword / logout 略
}
```

Controller 只做对接，核心在 Service：

**文件**：`sky-server/src/main/java/com/sky/service/impl/UserServiceImpl.java`

```java
@Override
public UserLoginVO login(UserLoginDTO userLoginDTO) {
    Authentication authentication;
    try {
        // 把"用户名+密码"交给 Spring Security 的认证管理器去校验
        authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(userLoginDTO.getUsername(), userLoginDTO.getPassword()));
    } catch (AuthenticationException e) {
        throw new LoginFailedException(MessageConstant.LOGIN_FAILED);   // 校验失败统一转成"登录失败"
    }
    LoginUser loginUser = (LoginUser) authentication.getPrincipal();    // 认证通过，拿到"当事人"
    User user = loginUser.getUser();
    String token = issueToken(user.getId());                            // 签发 JWT
    return UserLoginVO.builder().id(user.getId()).username(user.getUsername()).token(token).build();
}

/** 签发无状态 JWT：载荷 {sub: 用户id, role: "USER", exp}；单一 secret。 */
private String issueToken(Long userId) {
    Map<String, Object> claims = new HashMap<>();
    claims.put("sub", String.valueOf(userId));   // subject = 用户 id（字符串）
    claims.put("role", "USER");                  // 角色，供后续授权用
    return JwtUtil.createJWT(jwtProperties.getSecretKey(), jwtProperties.getTtl(), claims);
}
```

**这里的关键，是"密码校验"这件事被完全交给了 Spring Security，而不是像原版员工登录那样手写 `if (!password.equals(...))`：**

- `authenticationManager.authenticate(...)` 收到一个"还没验证"的 `UsernamePasswordAuthenticationToken`（里面只有用户名和明文密码）。
- 它内部委托给 `DaoAuthenticationProvider`，后者调用我们实现的 `UserDetailsService` 去数据库把用户捞出来，再用 `PasswordEncoder`（这里是 `BCrypt`）比对密码。
- 比对成功，返回一个"已验证"的 `Authentication`，其 `principal` 就是我们包装的 `LoginUser`。

*为什么绕这么一圈？* 因为一旦接入 Spring Security，认证的"标准流程"就是 `AuthenticationManager → AuthenticationProvider → UserDetailsService → PasswordEncoder` 这套。我们只要"填空"两处：怎么按用户名查用户（`UserDetailsService`）、用什么算法比密码（`PasswordEncoder` Bean）。框架负责把它们串起来。

### 配角 A：`UserDetailsServiceImpl`——告诉框架"怎么按用户名找人"

**文件**：`sky-server/src/main/java/com/sky/security/UserDetailsServiceImpl.java`

```java
@Service
public class UserDetailsServiceImpl implements UserDetailsService {

    @Autowired
    private UserMapper userMapper;

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        User user = userMapper.getByUsername(username);          // 去 user 表按用户名查
        if (user == null) {
            throw new UsernameNotFoundException(MessageConstant.ACCOUNT_NOT_FOUND);
        }
        return new LoginUser(user);                             // 包装成框架认识的 UserDetails
    }
}
```

- *为什么需要它（`UserDetailsService`）*：Spring Security 不知道你的用户存在哪张表、字段叫什么。它只认一个接口 `UserDetailsService`，问它要"给我个用户名，你还我一个 `UserDetails`"。我们实现这个接口，把"查 `user` 表"的细节告诉框架。
- `userMapper.getByUsername` 对应 `UserMapper.xml` 里 `select * from user where username = #{username}`（预编译占位符，防 SQL 注入）。

### 配角 B：`LoginUser`——把项目的 `User` 适配成框架的 `UserDetails`

**文件**：`sky-server/src/main/java/com/sky/security/LoginUser.java`

```java
public class LoginUser implements UserDetails {

    private final User user;   // 内部包着项目自己的 User 实体

    public LoginUser(User user) { this.user = user; }
    public User getUser() { return user; }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return Collections.singletonList(new SimpleGrantedAuthority("ROLE_USER"));  // C 端用户固定 USER 角色
    }

    @Override public String getPassword() { return user.getPassword(); }   // 交给框架比对（BCrypt 密文）
    @Override public String getUsername() { return user.getUsername(); }

    @Override public boolean isAccountNonExpired() { return true; }
    @Override public boolean isAccountNonLocked() { return true; }
    @Override public boolean isCredentialsNonExpired() { return true; }
    @Override public boolean isEnabled() { return true; }
}
```

- *这是典型的**适配器模式（Adapter Pattern）***：项目里已有的 `User` 实体（`sky-pojo`）和 Spring Security 要求的 `UserDetails` 接口对不上，就写一个"转接头" `LoginUser`，把 `User` 包起来、按 `UserDetails` 的方法签名对外提供 `getPassword()` / `getUsername()` / `getAuthorities()`。框架只跟 `LoginUser` 打交道，`User` 一个字段都不用改。
- `getPassword()` 返回的是**数据库里的 BCrypt 密文**。框架会拿这个密文和用户输入的明文，用 `PasswordEncoder.matches(明文, 密文)` 比对——不是我们手写的 `equals`。

至此，`issueToken(user.getId())` 调 `JwtUtil.createJWT` 签出一张形如 `xxx.yyy.zzz` 的 JWT，随 `UserLoginVO` 返回前端。**这张票就是本篇主角要验的票。** 下面正式进入验票链路。

---

## 二、第 ① 步：请求先撞上 Spring Security 过滤器链

从这里开始是本篇的**主链路**。前端登录后，之后每次请求都会在 HTTP 头里带上 `Authorization: Bearer xxx.yyy.zzz`。这个请求到达服务器后，**在进入任何 Controller 之前**，先要穿过 Spring Security 的过滤器链。

**文件**：`sky-server/src/main/java/com/sky/config/SecurityConfig.java`

```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Autowired
    private JwtProperties jwtProperties;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf().disable()                                                    // ① 关掉 CSRF
                .sessionManagement().sessionCreationPolicy(SessionCreationPolicy.STATELESS)  // ② 无状态：不建 Session
                .and()
                .authorizeRequests()
                // 免认证白名单（必须写在 /admin/**、/user/** 规则之前）
                .antMatchers(
                        "/admin/employee/login",
                        "/user/user/login",
                        "/user/user/register",
                        "/user/shop/status").permitAll()
                // 角色授权
                .antMatchers("/admin/**").hasRole("ADMIN")
                .antMatchers("/user/**").hasRole("USER")
                // 其余（knife4j /doc.html、/webjars/**、swagger、支付回调、websocket 等）放行
                .anyRequest().permitAll()
                .and()
                // ③ 401：未认证/令牌无效；403：已认证但无权限
                .exceptionHandling()
                .authenticationEntryPoint((request, response, ex) -> {
                    response.setStatus(401);
                    response.setContentType("application/json;charset=UTF-8");
                    response.getWriter().write("{\"code\":0,\"msg\":\"未认证或令牌无效\",\"data\":null}");
                })
                .accessDeniedHandler((request, response, ex) -> {
                    response.setStatus(403);
                    response.setContentType("application/json;charset=UTF-8");
                    response.getWriter().write("{\"code\":0,\"msg\":\"无访问权限\",\"data\":null}");
                })
                .and()
                // ④ 把我们的 JWT 过滤器插到"用户名密码认证过滤器"之前
                .addFilterBefore(new JwtAuthenticationFilter(jwtProperties),
                        UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();   // 登录时比对密码、注册时加密密码都用它
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration configuration) throws Exception {
        return configuration.getAuthenticationManager();   // 暴露成 Bean，供 UserServiceImpl 注入
    }
}
```

**断点还没进 Controller，先在这里把"门禁链是怎么搭起来的"讲清楚——严格按"为什么 → 是什么 → 怎么用"：**

**① 为什么需要"过滤器链"这个东西？**
一个 Web 请求要处理的"横切关注点"很多：要不要登录？有没有权限？跨域怎么办？CSRF 防不防？如果把这些判断塞进每个 Controller，代码会重复到爆炸，而且漏一个就是漏洞。所以需要一个"在业务代码之前统一把关"的地方。

**② 它是什么？**
Spring Security 的核心就是**一条过滤器链（Filter Chain）**。它本质是 Servlet 规范里的 `Filter`，通过一个叫 `FilterChainProxy` 的总入口，把十几个内置过滤器（处理登录、登出、CSRF、异常翻译、授权……）串成一条流水线。请求像传送带上的行李，依次经过每一道，任何一道都可以：放行、拦下、或往请求上"贴标签"（比如贴上"已认证"）。

**③ 在这个项目里怎么用？**
`@EnableWebSecurity` + 一个返回 `SecurityFilterChain` 的 `@Bean` 方法，就是 Spring Security **5.7+ 的新式配置写法**（旧写法是继承 `WebSecurityConfigurerAdapter`，已废弃——**别照搬老教程**）。我们在这个方法里对 `HttpSecurity` 做了四件事：

- **`.csrf().disable()`**：关掉 CSRF（跨站请求伪造）防护。*为什么能关*：CSRF 攻击依赖浏览器**自动携带 Cookie**。我们用 JWT 放在 `Authorization` 头里、手动带，浏览器不会自动带，所以 CSRF 这条攻击路径天然不成立，可以关。
- **`.sessionCreationPolicy(STATELESS)`**：告诉框架**不要创建 HttpSession**。*为什么*：我们要做**无状态认证**——身份完全靠每次请求带的 JWT，服务端一个会话都不存。不加这句，Spring Security 默认还会尝试用 Session 存 `SecurityContext`，那就"半有状态"了，白瞎了 JWT。
- **`.authorizeRequests()...`**：定义**授权规则**（谁能访问哪个 URL）。注意顺序——`antMatchers` 是**从上往下匹配，命中即止**，所以白名单（`permitAll`）必须写在 `/user/**`（`hasRole("USER")`）**前面**，否则 `/user/user/login` 会先被 `/user/**` 规则拦住、要求登录，就死锁了（登录接口反而要求先登录）。
- **`.exceptionHandling()`**：定制两种失败响应。**401**（`authenticationEntryPoint`）= "我不知道你是谁"（没带 token 或 token 无效）；**403**（`accessDeniedHandler`）= "我知道你是谁，但你没权限进这里"（比如 C 端用户想访问 `/admin/**`）。两者返回统一的 `{code:0,msg,data:null}` JSON，跟全站 `Result` 格式对齐。
- **`.addFilterBefore(new JwtAuthenticationFilter(...), UsernamePasswordAuthenticationFilter.class)`**：把我们**自己写的验票过滤器**插进这条链，位置在内置的 `UsernamePasswordAuthenticationFilter`**之前**。*为什么在它之前*：我们要在框架的"表单登录"逻辑之前，先用 JWT 把身份认出来；一旦 `SecurityContext` 里已经有了认证信息，后面的过滤器就不用再管登录了。

**一个非常值得记的工程细节（`new` 而不是 `@Bean`）：** 注意这里是 `new JwtAuthenticationFilter(jwtProperties)`——**手动 new，通过构造器传配置**，而不是把过滤器声明成 Spring Bean。*为什么这么做*：如果一个 `Filter` 是 Spring Bean，Spring Boot 会**自动把它注册到 Servlet 容器的主过滤器链上**，于是它会跑**两次**（一次在 Security 链里、一次在主链里）。手动 `new` 就绕开了自动注册，保证它只在 Security 链里跑一次。这是接入 Spring Security 时的经典坑。

**这一层的上下游**：上游是 Servlet 容器（Tomcat）；下游是我们插进去的 `JwtAuthenticationFilter`（第 ② 步）。数据此刻还是一个原始的 `HttpServletRequest`，头里带着那串 `Bearer xxx.yyy.zzz`。

### 配角 C：`JwtProperties`——密钥和过期时间从哪来

**文件**：`sky-common/src/main/java/com/sky/properties/JwtProperties.java`

```java
@Component
@ConfigurationProperties(prefix = "sky.jwt")   // 自动绑定 application.yml 里 sky.jwt.* 配置
@Data
public class JwtProperties {
    /** C端本地账密登录统一 JWT 配置（工单 0001，单套 secret） */
    private String secretKey;   // ← sky.jwt.secret-key（短横线自动转驼峰）
    private long ttl;           // ← sky.jwt.ttl
}
```

对应 `application.yml`：

```yaml
sky:
  jwt:
    secret-key: sky-take-out-cend-auth-unified-secret-2026
    ttl: 7200000   # 过期时长，毫秒 = 2 小时
```

- *为什么外置到 YAML*：密钥、过期时间是"环境相关、可能要改"的值，硬编码在 Java 里既不安全也不灵活。`@ConfigurationProperties(prefix="sky.jwt")` 把 `sky.jwt` 下的配置**自动绑定**到同名属性（`secret-key` → `secretKey`）。
- **0001 的一个决策痕迹**：注释写"单套 secret"。原版苍穹外卖是"管理端一套密钥 + 用户端一套密钥"两套；0001 改造成 C 端本地账密登录后，统一成**一套** `secretKey` + 一个 `ttl`。这解释了为什么这个类比原版**瘦了一半**（原版有 `adminSecretKey/adminTtl/userSecretKey/userTtl` 六个字段）。

---

## 三、第 ② 步（本篇核心）：`JwtAuthenticationFilter` 验票

断点单步进入我们插的那个过滤器。**这是整条链最核心的一节**——"当前用户 id"就是在这里被解析出来并存起来的。

**文件**：`sky-server/src/main/java/com/sky/security/JwtAuthenticationFilter.java`

```java
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtProperties jwtProperties;

    public JwtAuthenticationFilter(JwtProperties jwtProperties) {
        this.jwtProperties = jwtProperties;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String header = request.getHeader("Authorization");            // ① 读票
        if (header != null && header.startsWith("Bearer ")) {          // ② 必须以 "Bearer " 开头
            String token = header.substring(7);                        //    截掉 "Bearer "（7 个字符）
            try {
                Claims claims = JwtUtil.parseJWT(jwtProperties.getSecretKey(), token);  // ③ 验签+解析
                Long userId = Long.valueOf(String.valueOf(claims.get("sub")));          //    取用户 id
                Object roleObj = claims.get("role");
                String role = roleObj == null ? null : roleObj.toString();              //    取角色

                // ④ 组装一个"已认证"的令牌对象，principal 直接就是 userId
                UsernamePasswordAuthenticationToken authentication =
                        new UsernamePasswordAuthenticationToken(
                                userId,
                                null,
                                role == null ? Collections.emptyList()
                                        : Collections.singletonList(new SimpleGrantedAuthority("ROLE_" + role)));
                authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));

                SecurityContextHolder.getContext().setAuthentication(authentication);   // ⑤ 存进"授权用"的上下文
                BaseContext.setCurrentId(userId);                                       // ⑥ 存进"业务用"的 ThreadLocal
            } catch (Exception e) {
                // token 无效/过期：不填充身份（把决定权交给后面的授权阶段），清掉上下文
                SecurityContextHolder.clearContext();
            }
        }
        try {
            filterChain.doFilter(request, response);   // ⑦ 放行，继续走后续过滤器 → Controller
        } finally {
            BaseContext.removeCurrentId();             // ⑧ 请求结束，务必清 ThreadLocal
        }
    }
}
```

**断点逐步走读：**

**为什么继承 `OncePerRequestFilter` 而不是直接实现 `Filter`？**
- *为什么需要它*：一个请求在服务器内部可能被"转发（forward）"多次（比如错误页转发、内部 include），如果过滤器每次转发都跑一遍，就会重复解析 token、重复写上下文。
- *它是什么*：`OncePerRequestFilter` 是 Spring 提供的过滤器基类，内部用一个 request 属性标记"本请求我已经跑过了"，**保证每个请求只执行一次** `doFilterInternal`。
- *怎么用*：继承它，把逻辑写在 `doFilterInternal` 里即可。

**① ② 读票并识别格式**：`Authorization` 头的标准格式是 `Bearer <token>`（`Bearer` 是 OAuth2 定义的"持票人"令牌类型）。判空 + 判前缀，然后 `substring(7)` 精确切掉 `"Bearer "` 这 7 个字符（含末尾空格），剩下的就是纯 token。
- **注意一个刻意的设计**：如果**没带**头、或格式不对，这个 `if` 直接跳过，**过滤器不报错、不拦截**，而是往下走（第 ⑦ 步放行）。也就是说，**本过滤器只管"认证"，绝不管"授权"**——认不出身份就当"匿名用户"继续走，最终是不是被拦，交给第 ③ 步的授权规则去判。这是"认证与授权分离"的干净设计。

**③ 验签解析**：`JwtUtil.parseJWT` 用**服务端密钥**对 token 验签并解出 `Claims`（票面上的键值对）。这一步任何失败（签名对不上 = 伪造、过期 = `ExpiredJwtException`、格式错乱）都会抛异常，被 `catch` 兜住。

**④ 组装 `Authentication`**：这里有个**容易看走眼但很关键**的细节——`new UsernamePasswordAuthenticationToken(userId, null, authorities)` 的第一个参数 `principal` 直接传的是 **`userId`（一个 `Long`）**，不是登录时那个 `LoginUser`。
- *为什么*：验票阶段我们手上只有 token，没必要为了拿身份再查一次库。JWT 是**自包含（self-contained）**的——id 和角色都写在票面上，直接用即可。这正是无状态认证省掉"每次查库/查 Session"的价值。
- 权限用 `new SimpleGrantedAuthority("ROLE_" + role)`：`role` 是 `"USER"`，拼出 `"ROLE_USER"`。**这个 `ROLE_` 前缀是与第 ③ 步 `hasRole("USER")` 对齐的暗号**（下一节详说）。

**⑤ 写 `SecurityContextHolder`**：把这个"已认证"对象放进 `SecurityContext`。
- *为什么需要它*：Spring Security 的**授权阶段**（后面的 `FilterSecurityInterceptor`）只认 `SecurityContext` 里的 `Authentication` 来判断"这人有没有 `ROLE_USER`"。不写这里，`hasRole("USER")` 就永远不通过。
- *它是什么*：`SecurityContextHolder` 默认也是基于 **`ThreadLocal`** 的——它把"当前请求的安全上下文"绑在当前线程上。所以严格说，这一步和第 ⑥ 步都是往"线程本地存储"里写东西，只是一个是框架的、一个是我们项目自己的。

**⑥ 写 `BaseContext`**：`BaseContext.setCurrentId(userId)`——把用户 id 放进**项目自己的** `ThreadLocal`。
- *为什么还要再存一份*：Spring Security 的 `SecurityContext` 是给**框架授权**用的；而项目里几十处业务代码（`AddressBookController`、`OrderServiceImpl`……）早就习惯了 `BaseContext.getCurrentId()` 这种"随手取当前用户 id"的写法（这套 `BaseContext` 在原版就有）。0001 改造时保留了它，让**业务层代码零改动**——它们不需要知道底层从"拦截器"换成了"过滤器"，照样从 `BaseContext` 拿 id。这是"用一个薄适配层隔离改动、保护上层"的典型手法。

**⑦ 放行**：`filterChain.doFilter(request, response)`——把请求交给链上的下一环。断点会离开这里，去走完剩下的过滤器、进入授权判断、最终到 Controller。

**⑧ `finally` 清理（重中之重）**：`BaseContext.removeCurrentId()`。
- *为什么必须清*：Tomcat 用**线程池**处理请求——**线程是复用的**。假设线程 T 处理完 8 号用户的请求后没清理，`ThreadLocal` 里还留着 `8`；下一个请求恰好又被线程 T 处理、但**那个请求没带 token**（匿名），业务代码一调 `BaseContext.getCurrentId()` 拿到的却是上一个人的 `8`——**这就串号了，是严重的越权数据泄露**。
- 放在 `finally` 里，保证无论下游成功还是抛异常，**回到本过滤器时一定清**。这也顺带避免了 `ThreadLocal` 长期不清导致的**内存泄漏（Memory Leak）**。
- 对比第 ⑤ 步的 `SecurityContext`：它由 Spring Security 自己的过滤器在请求结束时清理，**不用我们操心**；但 `BaseContext` 是我们自己加的，**必须自己清**——这就是为什么只有 `BaseContext` 出现在 `finally` 里。

### 配角 D：`JwtUtil.parseJWT`——真正的验票机

**文件**：`sky-common/src/main/java/com/sky/utils/JwtUtil.java`

```java
public static Claims parseJWT(String secretKey, String token) {
    Claims claims = Jwts.parser()
            .setSigningKey(secretKey.getBytes(StandardCharsets.UTF_8))   // 用同一把密钥验签
            .parseClaimsJws(token).getBody();                            // 验签通过则返回票面 Claims
    return claims;
}

// 对应的签发（第一节 issueToken 调的就是它）：
public static String createJWT(String secretKey, long ttlMillis, Map<String, Object> claims) {
    SignatureAlgorithm signatureAlgorithm = SignatureAlgorithm.HS256;    // 对称签名算法
    long expMillis = System.currentTimeMillis() + ttlMillis;
    Date exp = new Date(expMillis);
    JwtBuilder builder = Jwts.builder()
            .setClaims(claims)                                                          // 放入 {sub, role}
            .signWith(signatureAlgorithm, secretKey.getBytes(StandardCharsets.UTF_8))   // 用密钥签名
            .setExpiration(exp);                                                        // 过期时间
    return builder.compact();
}
```

- 基于 `jjwt` 库 + **HS256（对称加密）**：签发和验签用**同一把密钥**。前端拿到 token 后**改不动内容**（一改，签名就对不上，`parseClaimsJws` 直接抛异常），但服务端能用密钥验真伪。这就是"防篡改"的来源。
- **JWT 结构**（`xxx.yyy.zzz` 三段，`.` 分隔）：Header（算法）.Payload（我们放的 `sub`/`role`/`exp`）.Signature（签名）。**前两段只是 Base64 编码、没加密**——意味着 payload 是**可被任何人解码看到**的。所以票面上**只放 id、角色这种非敏感信息，绝不放密码**。
- **一处"注释会撒谎"的教学点**：`parseJWT` 上方的注释写着"如果对接多个客户端建议改造成多个"（密钥）。但 0001 的决策恰恰**相反**——刻意统一成单套 secret（见 `JwtProperties` 的注释）。这是原版模板遗留的通用注释，与本项目当前决策不符。**读代码要以代码 + 本项目决策为准，别被模板注释带偏。**
- **一处签发/验签的呼应细节**：`createJWT` 是把 `"sub"` 当成**自定义键**塞进 `claims` map（`claims.put("sub", ...)`），而不是用 jjwt 的标准 API `setSubject(...)`；对应地，`parseJWT` 后也是用 `claims.get("sub")` 按普通键取回。两边"存取键名一致"，所以能对上。功能没问题，只是没用上"标准 subject 声明"那套语义——知道即可。

---

## 四、第 ③ 步：授权阶段——`hasRole("USER")` 凭什么放行

断点离开过滤器，请求继续沿链往下，到达 Spring Security 的**授权决策**环节（内置的 `FilterSecurityInterceptor`）。它拿第 ② 步写进 `SecurityContext` 的 `Authentication`，对照 `SecurityConfig` 里的规则判断。

以 `GET /user/addressBook/list` 为例，命中规则 `.antMatchers("/user/**").hasRole("USER")`：

- `hasRole("USER")` 在底层会检查：当前 `Authentication` 的权限集合里，**有没有名为 `ROLE_USER` 的 `GrantedAuthority`**。
- 回看第 ② 步：过滤器写进去的正是 `new SimpleGrantedAuthority("ROLE_" + role)` = `"ROLE_USER"`。**对上了 → 放行。**

**这就是 `ROLE_` 前缀那个"暗号"的意义（务必理解，面试常问）：**
- `hasRole("USER")` 是**语法糖**，它内部**自动补上 `ROLE_` 前缀**去比对，即等价于要求权限 `ROLE_USER`。
- 所以我们在过滤器里手动拼 `"ROLE_" + role`，是为了和 `hasRole` 的约定对齐。
- 如果哪天想用**不带前缀**的权限名（比如 `"USER"`），授权规则那边就得改用 `hasAuthority("USER")`（`hasAuthority` **不加**前缀，精确匹配）。`hasRole` vs `hasAuthority` 的区别就在这个前缀上。

**三种结局：**
1. **带了有效 token、角色匹配** → `SecurityContext` 有 `ROLE_USER` → 放行 → 进 Controller。
2. **没带 / token 无效** → 第 ② 步没往 `SecurityContext` 写任何身份 → 授权判定为"匿名、无权限" → 触发 `authenticationEntryPoint` → **401**。
3. **带了有效 token 但角色不对**（如 C 端用户 `ROLE_USER` 去访问 `/admin/**` 要求 `ROLE_ADMIN`）→ 有身份但权限不够 → 触发 `accessDeniedHandler` → **403**。

---

## 五、第 ③④ 步：进入业务代码，`BaseContext.getCurrentId()` 取用

授权通过，请求终于到 `DispatcherServlet` → Controller。此刻业务代码要用"当前用户是谁"，就从第 ② 步存好的 `ThreadLocal` 里取。

### 取用场景一：Controller 直接取（查"我"的地址簿）

**文件**：`sky-server/src/main/java/com/sky/controller/user/AddressBookController.java`

```java
@GetMapping("/list")
@ApiOperation("查询当前登录用户的所有地址信息")
public Result<List<AddressBook>> list() {
    AddressBook addressBook = new AddressBook();
    addressBook.setUserId(BaseContext.getCurrentId());   // ← 从 ThreadLocal 取当前用户 id 作查询条件
    List<AddressBook> list = addressBookService.list(addressBook);
    return Result.success(list);
}
```

- **数据流闭环**：第 ② 步 `BaseContext.setCurrentId(8)` → 这里 `getCurrentId()` 取回 `8` → 拼成 `where user_id = 8` 的查询。**用户只能查到自己的地址**，这是"数据隔离"的地基。
- 注意：整条链**没有一个方法参数在传 userId**——它是通过 `ThreadLocal` "隐式"贯穿的。Controller 不用从请求里解析 id，Service 也不用多加参数，随用随取。

### 取用场景二：Service 取（改"我"的密码）

**文件**：`sky-server/src/main/java/com/sky/service/impl/UserServiceImpl.java`

```java
@Override
public void changePassword(UserChangePasswordDTO userChangePasswordDTO) {
    Long userId = BaseContext.getCurrentId();                  // ← 同样从 ThreadLocal 取
    if (userId == null) {
        throw new AccountNotFoundException(MessageConstant.ACCOUNT_NOT_FOUND);
    }
    User user = userMapper.getById(String.valueOf(userId));
    if (user == null) {
        throw new AccountNotFoundException(MessageConstant.ACCOUNT_NOT_FOUND);
    }
    if (!passwordEncoder.matches(userChangePasswordDTO.getOldPassword(), user.getPassword())) {  // BCrypt 比对旧密码
        throw new PasswordErrorException(MessageConstant.PASSWORD_ERROR);
    }
    userMapper.updatePassword(userId, passwordEncoder.encode(userChangePasswordDTO.getNewPassword()));  // BCrypt 加密新密码
}
```

- 这里演示了 `getCurrentId()` 的一个**防御性判空**：`if (userId == null)`。理论上能进到这个受保护接口就一定认证过、`ThreadLocal` 里应有值；但业务代码不假设"上游一定填了"，取到 null 就当"没登录"处理。这是稳健写法。
- 顺带看到 `PasswordEncoder` 的另一半用法：`matches(明文旧密码, 库里密文)` 校验、`encode(新密码)` 加密后再落库。**全程数据库不存明文**。

> 全仓 `BaseContext.getCurrentId()` 被 `AddressBookServiceImpl`、`OrderServiceImpl`、`ShoppingCartServiceImpl`、`AutoFillAspect` 等十多处调用——它们全都依赖第 ② 步那一次 `setCurrentId`。这也反过来说明：**过滤器里那行 `setCurrentId` 一旦出问题，下游一大片"我的数据"逻辑会集体串号**，所以它和 `finally` 里的 `removeCurrentId` 一样重要。

请求处理完，响应逐层原路返回，最后回到第 ② 步过滤器的 `finally`，`removeCurrentId()` 擦掉托盘，线程干干净净地回到池子里等下一个请求。**整条链结束。**

---

## 六、总结与思考（比读懂源码更重要的部分）

> **学习心法**：类名会变（换个项目就不叫 `JwtAuthenticationFilter` 了），但"无状态认证怎么落地、身份怎么在一次请求里流动"这套**设计思想是通用的**。面试官不会问"苍穹外卖过滤器第几行写了什么"，但一定会问"你项目的登录态是怎么维持的 / Filter 和 Interceptor 有啥区别 / ThreadLocal 为什么要 remove"。记套路，别记代码。

### 1. 必背套路一：无状态认证（Stateless / JWT）——"签发—验票"两段式

**口诀**：`登录签票、请求验票，服务端不存会话；票自包含，验签即认人。`

- **签发**（第一节）：登录成功 → 把 `{sub: userId, role: USER, exp}` 用服务端密钥签成 JWT → 交给前端。
- **验票**（第二~五节）：之后每次请求带 `Authorization: Bearer <JWT>` → 过滤器验签解出 id/role → 存上下文 → 业务取用。
- **为什么必背**：HTTP 无状态，服务端"健忘"。传统方案靠服务端存 Session（有状态），多实例部署时还得共享 Session（粘性会话/Redis 集中存），麻烦。JWT 把身份写进"票"、由客户端保管，**服务端零存储**，天然适合分布式/水平扩容。代价是"注销难"（见套路 5 的⚠️）。

### 2. 必背套路二：认证与授权分离（Authentication vs Authorization）

**口诀**：`过滤器只负责"认出你是谁"，规则表负责"你能不能进"。`

- `JwtAuthenticationFilter` 认不出身份时**不拦截**，只是不填 `SecurityContext`，继续放行。
- 真正的拦/放，由 `authorizeRequests` 的规则 + `authenticationEntryPoint`(401)/`accessDeniedHandler`(403) 在授权阶段决定。
- **为什么必背**：这是**单一职责（Single Responsibility）** 在安全链上的落地。认证逻辑（怎么解 token）和授权策略（哪个 URL 要什么角色）解耦——想调整"哪些接口免登录"，只改 `SecurityConfig` 的规则表，过滤器一行不动。

### 3. 必背套路三：`ThreadLocal` 贯穿单次请求 + `finally` 必清

**口诀**：`一次请求一个线程，身份挂线程本地；用完 finally 必 remove，线程池复用不串号。`

- 用 `ThreadLocal` 存"当前用户 id"，让身份在**一次请求**内跨 Controller/Service/Aspect 隐式流动，不用层层传参。
- **必须 `remove`**：Tomcat 线程池复用线程，不清就会把上一个请求的用户 id 泄漏给下一个请求（越权），且 `ThreadLocal` 引用不断也会内存泄漏。
- **为什么必背**：这是面试关于 `ThreadLocal` 的**必考陷阱**。能说清"为什么要 remove、不 remove 会怎样、为什么放 finally"，基本就过了。

### 4. 必背套路四：适配层隔离改动（保护上层零改动）

**口诀**：`底层换血，上层无感——靠一个薄适配层扛住。`

- `LoginUser` 把项目的 `User` 适配成框架的 `UserDetails`（适配器模式），`User` 不用改。
- `BaseContext` 让"从拦截器体系换成 Spring Security 过滤器"这件事，对几十处业务代码**完全透明**——它们照旧 `getCurrentId()`。
- **为什么必背**：这是 0001 这次改造能"小步安全落地"的关键——**改动被封在认证层内部，不外溢**。体现的是**依赖倒置 / 面向接口** 的价值。

### 5. 生产同款 vs 教学简化（面试要能分辨）

**生产同款（直接保留）：** Spring Security 过滤器链、JWT 无状态认证、BCrypt 存密码、认证/授权分离、统一 401/403 响应、`STATELESS` 会话策略。这套在真实北美后端里就是主流。

**教学/项目简化（要知道怎么升级）：**
- ⚠️ **JWT 无法主动失效**：token 一旦签发，**在过期前始终有效**。用户改密码/被封号/点了"登出"，旧 token 照样能用（本项目 `logout` 就是空实现，仅靠前端丢弃）。生产做法：**短时 access token + 长效 refresh token**，或用 **Redis 黑名单**存"已失效的 tokenId"，验票时多查一步。
- ⚠️ **密钥硬编码在 YAML**：`secret-key` 明文写在 `application.yml`。生产应放**环境变量 / 配置中心 / KMS**，且定期轮换。
- ⚠️ **`role` 写死在 token 里**：改了用户角色，旧 token 里的 role 不会变，要等过期。和上一条同源（无状态的通病）。
- ⚠️ **`allow-circular-references: true`**：`application.yml` 里开了循环依赖兜底，是接入 Security 后为图省事的妥协。生产更推荐理清 Bean 依赖、去掉这个开关。

---

## 七、面试官视角：这条链路我会怎么问（含口述答案）

> 假设我是 Java 后端面试官，看到你简历上写了"用 Spring Security + JWT 重构了 C 端认证"，我大概率会问下面这些。答案按"面试时能直接口述、30~60 秒讲完"的风格写。

**Q1：讲讲 Spring Security 的过滤器链，一个带 Token 的请求进来是怎么被处理的？**
> Spring Security 的核心是一条过滤器链，本质是 Servlet 的 Filter，通过一个 `FilterChainProxy` 把一堆内置过滤器串起来，在请求进 Controller 之前统一处理认证、授权、CSRF 这些横切逻辑。我在链上插了一个自定义的 `JwtAuthenticationFilter`，位置在用户名密码认证过滤器之前。请求进来后，这个过滤器先从 `Authorization` 头读出 Bearer token，用密钥验签解析出用户 id 和角色，把身份写进 `SecurityContextHolder`，然后放行。接着到授权阶段，框架拿 `SecurityContext` 里的权限对照我配的规则，比如 `/user/**` 要求 `ROLE_USER`，匹配就放行到 Controller，不匹配就返回 401 或 403。整个会话策略设成 STATELESS，服务端不建 Session。

**Q2：JWT 这种无状态认证和传统 Session 认证有什么区别？各自优缺点？**
> Session 是有状态的：登录后服务端在内存或 Redis 里存一份会话，给浏览器发个 sessionId，之后靠这个 id 反查会话。JWT 是无状态的：登录后把用户 id、角色这些信息签进一个 token 交给客户端保管，服务端什么都不存，每次请求带上 token、验签就知道你是谁。JWT 的好处是服务端零存储，多实例部署不用共享会话，天然好扩展；缺点是签发后没法主动失效，改密码或登出后旧 token 在过期前还有效，通常得配合 Redis 黑名单或 refresh token 来补。Session 的好处是能随时在服务端销毁、可控性强，缺点是分布式下要额外做会话共享。

**Q3：Filter 和 Interceptor 有什么区别？执行时机上谁先谁后？为什么这个项目从拦截器改成了过滤器？**
> Filter 是 Servlet 规范层面的，由 Servlet 容器（Tomcat）管理，位置在 `DispatcherServlet` 之前，能拿到最原始的 request/response，但拿不到 Spring MVC 的 handler 信息。Interceptor 是 Spring MVC 层面的，由 Spring 管理，在 `DispatcherServlet` 之后、Controller 前后触发（`preHandle`/`postHandle`/`afterCompletion`），能拿到具体要执行哪个方法。时机上 Filter 更靠外，先于 Interceptor。这个项目原来用拦截器做 JWT 校验，改造时接入了 Spring Security，而 Security 整套机制就是建立在过滤器链上的，所以认证顺理成章地下沉到 Filter 层，和框架保持一致，也更早地把非法请求挡在 MVC 之外。

**Q4：你用 `ThreadLocal`（`BaseContext`）存当前用户 id，为什么用它？不 `remove` 会出什么事？为什么放在 `finally`？**
> 用 `ThreadLocal` 是因为一次 HTTP 请求由一个线程从头处理到尾，把用户 id 挂在这个线程的本地存储上，Controller、Service、切面都能随手取，不用在每个方法签名里传 userId，很干净。但 Tomcat 用线程池、线程是复用的，如果处理完不清理，`ThreadLocal` 里会残留上一个请求的用户 id，下一个复用同一线程的请求就可能读到别人的 id，造成越权和数据串号，同时长期不清还会内存泄漏。所以我在过滤器里用 `try...finally`，在 `filterChain.doFilter` 之后的 `finally` 里 `removeCurrentId`，保证不管业务成功还是抛异常，请求一结束就一定清干净。

**Q5：JWT 的一个硬伤是没法主动失效——用户改了密码或点了登出，旧 token 还有效。你会怎么解决？**
> 这是无状态认证的固有代价。常见有几种做法：一是缩短 access token 的有效期，配一个长效的 refresh token，access 过期就用 refresh 换新的，这样即使泄露影响窗口也短；二是在 Redis 里维护一个黑名单，登出或改密码时把当前 token 的 id 加进去，验票时多查一步黑名单，命中就拒绝；三是给用户记一个"密码最后修改时间"或 token 版本号，签发时写进 token，验票时比对，对不上就失效，这样改密码能让所有旧 token 一起作废。本项目为了教学简化，登出只是前端丢弃 token，生产我会上 Redis 黑名单加 refresh token 这套。

**Q6：`hasRole("USER")` 和权限里的 `ROLE_USER` 是什么关系？为什么过滤器里要手动拼 `ROLE_` 前缀？**
> `hasRole` 是个语法糖，它内部会自动补上 `ROLE_` 前缀再去比对，所以 `hasRole("USER")` 实际要求的权限名是 `ROLE_USER`。我在过滤器里给 `Authentication` 塞权限时写的是 `new SimpleGrantedAuthority("ROLE_" + role)`，拼出来正好是 `ROLE_USER`，两边就对上了。如果我不想要这个前缀、直接用 `USER`，那授权规则那边就得换成 `hasAuthority("USER")`，因为 `hasAuthority` 是精确匹配、不会自动加前缀。理解这个前缀约定，能避免"权限明明配了却一直 403"这种坑。

**Q7：登录时你没有手写密码比对，而是调 `authenticationManager.authenticate(...)`，这背后发生了什么？**
> 我把用户名和明文密码包成一个未认证的 `UsernamePasswordAuthenticationToken` 交给 `AuthenticationManager`，它委托给 `DaoAuthenticationProvider`。这个 Provider 会调我实现的 `UserDetailsService.loadUserByUsername`，按用户名去 `user` 表查出用户、包成 `UserDetails`（我用 `LoginUser` 适配的），然后用我注册的 `PasswordEncoder`——也就是 `BCryptPasswordEncoder`——把用户输入的明文和库里的密文做 `matches` 比对。比对通过就返回一个已认证的 `Authentication`，principal 就是 `LoginUser`，我从中取出 `User` 再签发 JWT。好处是密码怎么存、怎么比全部交给框架标准流程，我只需要"填空"两件事：怎么按用户名查人、用什么算法比密码。BCrypt 自带随机盐、还能调计算成本，比 MD5 安全得多。

---
