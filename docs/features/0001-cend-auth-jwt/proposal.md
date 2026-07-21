# [0001] C 端认证改造 — Proposal(技术方案)

## 元信息
- 编号: 0001
- 状态: 已交付(步骤 1–7 全 TESTED)
- 分支: feature/cend-auth-jwt(已合并回 main:merge b02590b)
- 关联: Requirement → ./requirement.md | Progress → ./progress.md | ADR → ../../decisions/0001-cend-auth-local-jwt-spring-security.md | 契约 → ../../api-contract/

## ⭐ 交接头(给下一个窗口 / subagent —— 覆盖式,永远只写"现在")
- **当前**: 功能 0001 **已交付并合并回 `main`**(merge `b02590b`);步骤 1–7 全部 TESTED、DoD 全绿。后端全站统一 Spring Security + 单套 JWT;admin 前端认证头已迁 Bearer;C 端新工程 `project-sky-user-vue3` 全链路跑通;冒烟基线 `docs/smoke-tests.md` 全绿。
- **下一步**: 本功能已收口。剩余均为按需项:(a)从 ADR-0001 的 divedeep backlog 挑深读笔记(Spring Security Filter 链 / 认证时序 / `OncePerRequestFilter`);(b)openid 支付遗留 → 功能 0002;(c)里程碑再生 `docs/BACKEND_OVERVIEW.md`。
- **别碰**: `reference/`(只读)、`.backup-original-git/`、`.tools/`;`OrderServiceImpl.payment()` 的 openid 调用(留给 0002)。
- **怎么验证**: 构建/起 jar/前端命令见 `docs/WORKFLOW.md` 常用命令;构建前先停 jar(`Get-CimInstance Win32_Process` 找 `sky-server-...jar` → `Stop-Process -Id <pid> -Force`);DB 迁移/校验用 `mysql.exe ... --ssl-mode=DISABLED sky_take_out < docs\features\0001-cend-auth-jwt\0001-migration.sql`(可重跑);C 端 `npm --prefix project-sky-user-vue3 run dev`(:5173,需后端 :8080)。

## 1. 现状(与本改动相关的技术起点)
> 只写和本功能相关的;全局架构看 BACKEND_OVERVIEW。
- **JWT 机制已存在**:`sky-common/JwtUtil`(jjwt 0.9.1)、`JwtProperties`;C 端和管理端登录后都签发 JWT。本次不是从零引入 JWT。
- **两套手写拦截器**:`JwtTokenAdminInterceptor`(拦 `/admin/**`,claim `EMP_ID`,secret `itcast`,header `token`)、`JwtTokenUserInterceptor`(拦 `/user/**`,claim `USER_ID`,secret `itheima`,header `authentication`),都在 `WebMvcConfiguration` 注册;校验后把主体 id 写进 `BaseContext`(ThreadLocal)。
- **内部身份 id-based**:JWT/BaseContext 只放 Long id,`openid` 从不进入 → 下游 7 个用 `getCurrentId()` 的 Service 不动。
- **数据表**:`user` 表无 `username`/`password` 列且无种子数据;`employee` 表已有 `username`(唯一)+`password`(MD5),`password` 列 `varchar(64)` 够放 BCrypt(60 字符)。
- **openid 遗留耦合**:`OrderServiceImpl.payment()` 把 `user.getOpenid()` 传给微信支付 → 留给 0002。

## 2. 方案总览(选定方案长什么样)
> 为什么这么选(Spring Security 统管 / 无状态 JWT / BCrypt),见 ADR-0001。
- **组件构成**:一条 `SecurityFilterChain`(csrf disable + STATELESS)+ 一个 JWT `OncePerRequestFilter`(读 Bearer → 校验 → 填 `SecurityContext` & `BaseContext`)+ `UserDetailsServiceImpl` + 角色 `ROLE_ADMIN` / `ROLE_USER`。
- **业务时序**:登录 → `AuthenticationManager` → `UserDetailsService` 校验 → 签发含 `role` 的 JWT → 后续请求带 Bearer → filter 校验 → 按 `role` 填对上下文 → 授权规则放行 `/admin/**` 或 `/user/**`。
- **关键设计点**:单 secret 单 token,claim 带 `role`(`employee`/`user` 双表 id 都从 1 开始会撞号,靠 `role` 区分身份 + 授权);authn(步骤3)与 authz(步骤4)分离。

## 3. 会动的关键文件
- **sky-server**:`controller/user/UserController`、`service/impl/UserServiceImpl`、`controller/admin/EmployeeController`、`service/impl/EmployeeServiceImpl`、`config/WebMvcConfiguration`、`interceptor/*`(删);**新增** `config/SecurityConfig`、`security/{LoginUser,UserDetailsServiceImpl,JwtAuthenticationFilter}`;`mapper/UserMapper`(+xml)。
- **sky-pojo**:`entity/User`、`dto/UserLoginDTO`、新增 `UserRegisterDTO`/`UserChangePasswordDTO`、`UserLoginVO`。
- **sky-common**:`JwtProperties`(清双 secret,留单套)。
- **DB**:`user` 加列;`employee` seed 密码迁 BCrypt(脚本 `docs/features/0001-cend-auth-jwt/0001-migration.sql`)。
- **前端**:`project-sky-admin-vue-ts`(token 头改 Bearer);**新建** `project-sky-user-vue3`(Vue3+Vite+TS+Pinia)。

## 4. 实施清单(每步一个测试门;标串行依赖)
- [x] 步骤1: DB 迁移——`user` 加 `username`(唯一)+`password`;`employee` seed 密码 MD5→BCrypt  [依赖: 无] —— TESTED
      测试门: 两列 + 唯一索引就位;迁移二次执行幂等不报错;admin 存值 60 字符 BCrypt 且 `matches("123456")=true`。
- [x] 步骤2: Security 骨架——引入 `spring-boot-starter-security`;新增 `SecurityConfig`(`SecurityFilterChain` + `BCryptPasswordEncoder`),先保证能启动  [依赖: 1] —— TESTED
      测试门: `clean package` EXIT=0;起 jar `Started SkyApplication`;`/doc.html`=200(permitAll 不锁站)。
- [x] 步骤3: C 端认证后端(authn)+ JWT 认证过滤器——`User` 加字段;`UserMapper`;`UserService` register/login/changePassword;`UserController` 四端点;`UserDetailsService`+`LoginUser`;JWT `OncePerRequestFilter`  [依赖: 2] —— TESTED
      测试门: curl 注册 code:1 + 载荷 `{sub,role:USER,exp}`;Bearer 改密成功、旧密码失败;登出;重复注册报"已存在";DB 落库 `$2a$10$` 60 字符。
- [x] 步骤4: 统一授权(authz)+ 清理——`SecurityConfig` 授权规则(`/admin/**`=ADMIN、`/user/**`=USER)+ 白名单 + 401/403 handler;admin 登录改 BCrypt + 签统一 JWT;删两个手写拦截器 + 清 `JwtProperties` 双 secret  [依赖: 2、3] —— TESTED
      测试门: admin/123456 登录恢复(JWT role:ADMIN);ADMIN token 访 `/admin/**`=200、无 token=401、USER token=403;USER token 访 `/user/**`=200、ADMIN token=403;`/doc.html`=200。
- [x] 步骤5: admin 前端认证头改 `Authorization: Bearer`;回归 admin 冒烟  [依赖: 4] —— TESTED
      测试门: 后端 curl 证契约(Bearer 访 `/admin/employee/page`=200、旧 `token` 头=401);浏览器冒烟登录+列表+图片上传成功。
- [x] 步骤6: 最小 C 端 Web(Vue3+Vite+TS+Pinia)——骨架 + axios 拦截器(注入 Bearer + 401 处理)+ 登录/注册/改密页;联调  [依赖: 3、4;契约定死后与 5 并行] —— TESTED
      测试门: 真浏览器端到端——注册→自动登录进首页;受保护端点带 Bearer=200;改密→登出→新密码重登成功;路由守卫拦未登录。
- [x] 步骤7: 冒烟 & 验收——`docs/smoke-tests.md` 增 C 端认证冒烟;全绿  [依赖: 收尾] —— TESTED
      测试门: 全套冒烟([A]~[L] + 6.1~6.7)实测全绿。
> 依赖链: 1 → 2 → 3 → 4;5 依赖 4;6 依赖 3/4(契约定死后与 5 并行);7 收尾。
> 状态标记: TODO / IN_PROGRESS(~) / CODE_DONE / TESTED
