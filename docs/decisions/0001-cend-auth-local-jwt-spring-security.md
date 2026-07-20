# ADR-0001: C 端认证改造 —— 微信登录 → 本地账密 + JWT + Spring Security(统管全站)

## 状态: 已采纳(2026-07-19)

> 关联工单: `docs/changes/0001-*.md`
> 影响面分析(现状调研)已在本 ADR「背景」中固化,后续 subagent/新窗口读本文件即可,无需重复读源码。

---

## 背景

### 为什么要做这个决策

苍穹外卖原本的 C 端(顾客端)登录是**微信小程序登录**:小程序用 `wx.login()` 拿临时
`code` → 后端拿 `code` + `appid` + `secret` 调微信 `jscode2session` 换回 `openid` →
以 `openid` 作为账号查找/注册键。这套实现有三个问题,不适合作为北美后端 SDE 简历项目:

1. **强依赖外部微信服务**:没有合法的小程序 `appid`/`secret` 就跑不通登录,面试演示困难。
2. **`openid` 是微信特定概念**:北美技术栈里没有对应物,讲不出通用价值。
3. **鉴权是手写拦截器**,没有用行业标准的安全框架,技术深度不足以作为亮点。

### 现状事实(改造前,已调研固化)

- **JWT 机制本就存在**:`sky-common` 里 `JwtUtil`(jjwt 0.9.1)、`JwtProperties`,C 端和
  管理端登录成功后都签发 JWT。**所以本次"→ JWT"不是从零引入 JWT**,而是替换"用户凭什么
  证明身份"这一步 + 把鉴权升级到 Spring Security。
- **两套手写拦截器**:`JwtTokenAdminInterceptor`(拦 `/admin/**`,claim `EMP_ID`,
  secret `itcast`,header `token`)、`JwtTokenUserInterceptor`(拦 `/user/**`,claim
  `USER_ID`,secret `itheima`,header `authentication`),都在 `WebMvcConfiguration`
  里注册。校验通过后把主体 id 写进 `BaseContext`(ThreadLocal)。
- **内部身份早已是 id-based**:JWT 和 `BaseContext` 里流转的都是 DB 主键 id(Long),
  **`openid` 从不进入 JWT / BaseContext**。下游 7 个 Service 用 `BaseContext.getCurrentId()`
  取当前用户 id。→ 换登录方式**几乎不触碰下游**。
- **`user` 表无 `username`/`password` 列**(sky.sql 第 232-241 行),且**无种子数据**
  (用户表为空)→ 需加列,但无老数据迁移负担。
- **`employee` 表已有 `username`(唯一)+ `password`**,现存 **MD5**
  (`EmployeeServiceImpl` 用 `DigestUtils.md5DigestAsHex`);`password` 列 `varchar(64)`,
  **BCrypt 哈希 60 字符,列宽无需改**。
- **`openid` 的另一处耦合(地雷)**:`OrderServiceImpl.payment()` 把 `user.getOpenid()`
  传给微信支付。此依赖由后续工单 **0002(支付 mock)** 处理,本工单不动它。

---

## 决策概览

本 ADR 一次性拍板 5 个相互关联的决策,合起来构成一套完整的认证方案:

| 编号 | 决策点 | 结论 |
|---|---|---|
| D1 | 认证方式(用户凭什么证明身份) | **本地 `username` + `password`** |
| D2 | 鉴权框架 | **Spring Security 统管全站**(admin + user 统一) |
| D3 | Token 策略 | **无状态 JWT**(单 secret + `role` claim);登出 = 前端丢 token |
| D4 | 密码存储 | **BCrypt** |
| D5 | 身份数据模型 | `user` 加 `username`(唯一)+`password`;`openid` 留可空;`employee` 迁 BCrypt |

---

## D1 — 认证方式:本地 username/password

### 方案对比

| 方案 | 优点 | 缺点 |
|---|---|---|
| **本地 username/password(选)** | 后端认证基本功、无外部依赖、面试可讲、实现最小 | 需自己管密码存储/校验;无第三方背书 |
| OAuth2 社交登录(Google/GitHub) | 北美最主流、免管密码、简历亮点 | 需注册 OAuth App + 回调、概念多、超出"最小可用"时间预算 |
| Email/password + 邮箱验证 | 更接近真实产品 | 要接邮件服务,时间成本高 |
| 微信登录(现状) | —— | 依赖微信、openid 不通用(见背景) |

### 决策
选**本地 username/password**。理由:学习项目 + 时间紧,目标是"最丑但能跑",优先打通
认证主干和 Spring Security;OAuth2 作为将来可延伸的方向(留给后续工单)。

---

## D2 — 鉴权框架:Spring Security 统管全站

### 关键技术事实(决定了没有"只管一半"这条路)
`spring-boot-starter-security` 一旦进 classpath,它以**全局 servlet Filter 链**的形式生效,
**默认拦截所有请求**。所以无法"只给 C 端加 Spring Security 而不管理 admin"——必须显式为
全站配置授权规则。真正可选的只有两条路:

| 方案 | 优点 | 缺点 |
|---|---|---|
| **统管全站(选)** | 一套 `SecurityFilterChain` + JWT filter + `UserDetailsService` + 角色 `ROLE_ADMIN`/`ROLE_USER`;删掉两个手写拦截器;架构统一;**简历/面试故事完整** | admin 密码要迁 BCrypt;admin 前端 token 头要改;需回归 admin 冒烟 |
| 只管 C 端,admin 保留手写拦截器 | 工作量小、admin 不动 | 两套鉴权机制并存,"为什么有两套"面试难答;学习割裂;半套框架反成减分项 |

### 决策
选**统管全站**。理由:用户明确要把 Spring Security 作为**简历重点亮点**——半套框架在面试里
是红旗;统一后架构更干净,且 `ROLE_ADMIN` vs `ROLE_USER` 的角色授权正好是 Spring Security
的经典教学点,与本项目"商家端 + 顾客端"的双受众天然契合。Phase 0 的 admin 冒烟基线正是
用来兜底这次改造的回归风险。

---

## D3 — Token 策略:无状态 JWT + 前端丢 token 登出

### 决策要点
- **单一 secret + 单一 token 结构**,claims = `{ sub: 主体id, role: ADMIN|USER, exp }`。
  - 为什么必须带 `role`:`employee` 和 `user` 是两张表、id 都从 1 开始会**撞号**,
    光有 id 无法区分是员工还是顾客。`role` 既用于区分身份、也用于 Spring Security 授权。
  - 好处:`BaseContext.getCurrentId()` 下游**完全不用动**(每个请求非 admin 即 user,
    filter 依 `role` 填对上下文)。
- **登出 = 前端丢弃 token**:后端 `/logout` 接口返回成功即可(admin 端现在就是这么做的)。

### 方案对比(登出/会话)
| 方案 | 优点 | 缺点 |
|---|---|---|
| **无状态 JWT + 前端丢 token(选)** | 无服务端会话状态、易水平扩展、最小可用 | **登出不彻底**:token 在有效期(2h)内理论上仍可用 |
| 有状态 Session | 登出即时彻底、可主动失效 | 服务端存会话、扩展需共享 session、偏离 JWT 主线 |
| 无状态 JWT + Redis 黑名单 | 可主动失效、无状态优点仍在 | 每次校验多查一次 Redis、工作量更大 |

### 决策
MVP 选**前端丢 token**;Redis 黑名单作为**将来面试级增强**记录在案(项目已有 Redis,
随时可加)。这是"最丑但能跑"与学习价值之间的取舍——**局限点本身就是面试考点**。

---

## D4 — 密码存储:BCrypt

### 方案对比
| 方案 | 优点 | 缺点 |
|---|---|---|
| **BCrypt(选)** | 自带 salt、可调 work factor(慢哈希)、抗彩虹表/暴力破解;Spring Security 内置 `BCryptPasswordEncoder` | 比 MD5 慢(但这正是安全目的) |
| MD5(现状) | 快 | **无 salt、极快 → 易被彩虹表/暴力破解**,不可用于密码 |
| 明文 | —— | 绝不可接受 |

### 决策
统一用 **BCrypt**。C 端新用户直接 BCrypt 存储;**管理端 employee 从 MD5 迁到 BCrypt**
(重置 seed 用户 admin 的密码哈希值,列宽 `varchar(64)` 够用)。

---

## D5 — 身份数据模型

- `user` 表:**加 `username varchar(32)`(唯一索引)+ `password varchar(64)`**;
  `openid` 保留且**可空**(留给 0002 支付 / 将来社交登录)。用户表无种子数据,无迁移。
- `employee` 表:结构不变,仅把 seed 用户 admin 的密码值由 MD5 改为 BCrypt。
- `User` 实体 + `UserMapper`:加 `username`/`password` 字段、`getByUsername` 查询。

---

## Trade-off / 后果(改造要额外补什么)

**要动的:**
- 删除 `JwtTokenAdminInterceptor`、`JwtTokenUserInterceptor` 及其在 `WebMvcConfiguration`
  的注册;新增 `SecurityConfig`(`SecurityFilterChain` + `BCryptPasswordEncoder`)+ JWT
  `OncePerRequestFilter` + `UserDetailsService`。
- **认证头标准化为 `Authorization: Bearer <jwt>`**,替代旧的 `token`(admin)/
  `authentication`(user)两个自定义头 → **admin 前端请求头要改一行** + 回归 admin 冒烟。
- admin seed 密码 MD5 → BCrypt。
- `WebMvcConfiguration` 目前 `extends WebMvcConfigurationSupport`,与 Spring Security 共存时
  要确保放行 `/doc.html`、`/webjars/**` 等静态资源和 login/register 端点。

**基本不动的(好消息):**
- `JwtUtil`(可复用或按 Spring Security 习惯微调)、`BaseContext`、下游 7 个用
  `getCurrentId()` 的 Service —— 内部身份 id-based,与认证方式解耦。

**遗留 / 移交:**
- `OrderServiceImpl.payment()` 对 `openid` 的依赖 → 交 **0002(支付 mock)** 处理。
  本工单期间该调用原样保留(能编译;账密新用户的支付要到 0002 才真正打通)。
- 登出不彻底 → Redis 黑名单留作将来增强。

**安全备忘(非本工单,但记录):** 推 GitHub 前清理 `application-dev.yml` 中的
微信/OSS 密钥;JWT secret 目前是弱值(`itcast`/`itheima`),生产级应换强随机密钥并外置。

---

## 💡 面试要点

- **JWT vs Session vs OAuth2 选型**:无状态 vs 有状态;JWT 利于水平扩展和移动端/跨域,
  Session 便于即时失效;OAuth2 解决"第三方身份 + 授权委托",不是同一层的东西。
- **无状态 JWT 登出为什么难**:token 一旦签发,服务端不存状态就无法主动作废;
  解法有短 TTL + refresh token、或服务端黑名单(Redis)。→ 能讲清"局限 + 权衡"比"能跑"更值钱。
- **BCrypt 为什么优于 MD5/SHA 存密码**:salt 防彩虹表、work factor 慢哈希抗暴力破解;
  MD5/SHA 是快哈希,为完整性校验设计,不是为密码存储设计。
- **Spring Security Filter 链 vs Spring MVC 拦截器**:Filter 在 Servlet 容器层、
  早于 DispatcherServlet;Interceptor 在 MVC 层、在 handler 前后。认证放在 Filter 更合理。
- **认证(Authentication)vs 授权(Authorization)**:前者"你是谁",后者"你能干什么";
  `ROLE_ADMIN`/`ROLE_USER` + `hasRole()` 是授权;`ROLE_` 前缀约定的由来。
- **无状态 JWT API 为什么可以禁用 CSRF**:CSRF 攻击依赖浏览器自动携带 cookie/session;
  Bearer token 走 Authorization 头、非自动携带,故无状态 token API 常 `csrf().disable()`。

---

## Addendum(执行期细化,2026-07-19 步骤3)

规划期(Phase 2)拍了 D1–D5 五个大方向;执行到步骤3 时又确认了两个**实现层决策**,记录在此作为面试资产:

### AD1 — 登录校验:AuthenticationManager + UserDetailsService(而非手动 matches)
- **两条路**:(a)Service 里直接 `passwordEncoder.matches(raw, 库内hash)`,简单透明;(b)走 Spring Security 的 `AuthenticationManager.authenticate(UsernamePasswordAuthenticationToken)` → `DaoAuthenticationProvider` → `UserDetailsService.loadUserByUsername` + `PasswordEncoder`。
- **选 (b)**。理由:用户要把 Spring Security 作为简历亮点,走完整的 `AuthenticationManager`→`Provider`→`UserDetailsService` 链条,面试能讲清框架的认证时序。为拿到用户 id 签 JWT,自定义 `LoginUser implements UserDetails` 包住 `User` 实体(principal 携带领域对象)。
- **代价 / 面试点**:双表(`employee`/`user`)username 可能撞号,单个 `UserDetailsService` 无法区分——故 C 端 `UserDetailsServiceImpl` 只查 `user` 表、授权固定 `ROLE_USER`;admin 侧的认证(步骤4)要么各挂各的 `AuthenticationProvider`,要么 admin 维持手动 matches。**"一个 AuthenticationManager 如何服务两类用户"本身就是好考点。**

### AD2 — authn / authz 分离:JWT 认证过滤器归步骤3,授权规则归步骤4
- 原工单把"JWT `OncePerRequestFilter`"和"授权规则"都放步骤4。执行时发现:C 端新端点在 `/user/**` 下、受旧拦截器管;且 `changePassword` 需要"当前用户是谁",这份身份只有认证过滤器能提供。
- **决策**:把 JWT 认证过滤器(读 Bearer→校验→填 `SecurityContext`+`BaseContext`)提前到步骤3。于是 **步骤3 = 认证(Authentication,你是谁),步骤4 = 授权(Authorization,你能干什么)+ 清理**。这正好把 ADR 的"认证 vs 授权"面试点落到工程结构上。过滤器用构造注入 `JwtProperties`、在 `SecurityConfig` 里 `new` 出来经 `addFilterBefore` 挂载(不做成 `@Component`,避免 Spring Boot 把它当普通 servlet filter 二次注册)。

### AD3 — 顺带修的潜伏 bug:`@AutoFill(INSERT)` 不适用于 `User`
- `UserMapper.insert` 原带 `@AutoFill(OperationType.INSERT)`,`AutoFillAspect` 会反射调 `setCreateTime/setUpdateTime/setCreateUser/setUpdateUser` 四个 setter;但 `User` 只有 `createTime`,缺另外三个审计字段 → `NoSuchMethodException`。原项目里因 `wxLogin` 的注册路径从未被测,此 bug 潜伏至今。
- **修复**:摘掉 `insert` 的 `@AutoFill`(`createTime` 由 `register` 手动 set)。**教训**:`@AutoFill` 这类"约定填充"切面隐含"实体必须具备全部公共字段"的前提;把它用在字段不全的实体上会在运行时炸,而非编译期——这也是"切面/AOP 的隐式契约"面试点。
