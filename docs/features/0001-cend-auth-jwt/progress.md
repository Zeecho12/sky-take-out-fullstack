# [0001] C 端认证改造 — Progress(现场笔记)

## 元信息
- 编号: 0001
- 关联: Requirement → ./requirement.md | Proposal → ./proposal.md | ADR → ../../decisions/0001-cend-auth-local-jwt-spring-security.md
- 纪律: 追加式,旧条目不改。只记 git 看不出的东西(验证证据 + 发现/踩坑/临场决策),别抄 diff。

## 步骤记录(追加式,新条目往下加)

### 里程碑 (07-19) — Phase 2 规划完成
- **改了什么**: ADR-0001 定稿;api-contract(用户端+管理端)更新;工单成形。状态 TODO,待进 Phase 3。
- **验证**: —(规划阶段,无测试门)
- **发现/踩坑/临场决策**: 无
- **关联**: —

### 步骤1 (07-19) — DB 迁移:user 加账密列 + admin 密码迁 BCrypt
- **改了什么**: `user` 表加 `username`(唯一索引 `idx_username`)/`password`;admin seed 密码 → BCrypt;新增可重跑迁移脚本 `docs/features/0001-cend-auth-jwt/0001-migration.sql`(MySQL 5.7 用 `information_schema` 守卫 + `PREPARE/EXECUTE`)。本步零 Java/pom 改动。
- **验证**: Proposal 步骤1 测试门 —— 两列+唯一索引就位;迁移二次执行幂等(3 条 skip, exit 0);admin 存值 60 字符 BCrypt 且 `matches("123456")=true`。全绿。
- **发现/踩坑/临场决策**: ①**调研订正**:运行中的库 admin 密码实为 MD5(`e10adc…`),ADR 记载正确;`sky.sql` 里原写的是明文 `123456`(从未生效的陈旧种子,本步一并改为 BCrypt)。②**顺序陷阱**:此刻起 admin 登录会坏(`EmployeeServiceImpl` 仍 MD5 比对),须到步骤4 改 BCrypt 才恢复 → 故步骤1 测试门不含 admin 登录冒烟,回归门放步骤4/5。
- **关联**: commit <步骤1>;`0001-migration.sql`

### 步骤2 (07-19) — Security 骨架
- **改了什么**: `sky-server/pom.xml` 引入 `spring-boot-starter-security`(随父 pom 2.7.3 → Security 5.7.3);新增 `SecurityConfig`——组件式 `SecurityFilterChain`(csrf disable + STATELESS + 过渡 `anyRequest().permitAll()`)+ `BCryptPasswordEncoder`。
- **验证**: Proposal 步骤2 测试门 —— `clean package` EXIT=0;起 jar `Started SkyApplication`、Security 过滤链上链;`/doc.html`=200(无 `WWW-Authenticate`,证 permitAll 不锁站)。全绿。permitAll 期间旧拦截器仍在 MVC 层管鉴权,行为不变。
- **发现/踩坑/临场决策**: **非回归备忘**:`/user/shop/status` 返 500,是店铺状态未在 Redis(db10 空)初始化的既有数据态 NPE(`ShopController.getStatus:32`),与步骤2 无关,留步骤7 处理。`Using generated security password` WARN 是无 `UserDetailsService` bean 的噪声,步骤3/4 后消失。
- **关联**: commit <步骤2>

### 步骤3 (07-19) — C 端认证后端(authn)+ JWT 认证过滤器
- **改了什么**: `User` 加 `username`/`password`;`UserLoginDTO`→账密、新增 `UserRegisterDTO`/`UserChangePasswordDTO`、`UserLoginVO`→`{id,username,token}`;`JwtProperties` 加单套 `secretKey`/`ttl`;`UserMapper` 加 `getByUsername`/`updatePassword`+xml、`insert` 补两列;新增 `security/{LoginUser,UserDetailsServiceImpl,JwtAuthenticationFilter}`;`SecurityConfig` 加 filter + `AuthenticationManager`(仍 permitAll);`WebMvcConfiguration` 旧 user 拦截器排除 `/user/user/**`;去微信化(删 `wxLogin/getOpenid`)。
- **验证**: Proposal 步骤3 测试门 —— 端到端 curl:注册 code:1 + 载荷 `{sub,role:USER,exp}`、登录、Bearer 改密、旧密码失败、新密码成功、登出、重复注册报"用户名已存在"、无 token 改密优雅报错;DB 落库 `$2a$10$` 60 字符。全绿。
- **发现/踩坑/临场决策**: ①**真 bug(测试门抓到)**:`UserMapper.insert` 原带 `@AutoFill(INSERT)`,切面反射调 `setCreateUser/setUpdateTime/setUpdateUser`,但 `User` 无这些审计字段 → `NoSuchMethodException` 500(原项目潜伏 bug,`wxLogin` 从没被测过)。已摘 `insert` 的 `@AutoFill`(`createTime` 由 register 手动 set)。②两处**实现层决策**(登录走 `AuthenticationManager`、JWT filter 从步骤4 提前到步骤3 以确立 authn/authz 分离)→ 已记入 ADR AD1/AD2,此处不重复。③**待办**:无 token 访受保护端点现返 code:0(HTTP 200)而非 401(授权仍 permitAll);步骤4 加规则后自然变 401。
- **关联**: commit <步骤3>;决策见 ADR-0001 AD1/AD2/AD3

### 步骤4 (07-19) — 统一授权(authz)+ 清理【后端认证改造至此完成】
- **改了什么**: `EmployeeServiceImpl.login` MD5→BCrypt matches、`save` 默认密码 encode;`EmployeeController.login` 改单套 secret + 载荷 `{sub:empId, role:ADMIN}`;`SecurityConfig` 授权规则(白名单 permitAll → `/admin/**`=hasRole(ADMIN) → `/user/**`=hasRole(USER) → 尾 permitAll)+ 401 entryPoint / 403 handler;删 `JwtTokenAdminInterceptor`/`JwtTokenUserInterceptor` + `WebMvcConfiguration` 的 `addInterceptors`;清 `JwtProperties` 6 旧字段 + yml 6 行。
- **验证**: Proposal 步骤4 测试门 —— admin/123456 登录恢复(JWT role:ADMIN)、错密码报"密码错误";ADMIN token 访 `/admin/**`=200/无 token=401/USER token=403;USER token 访 `/user/addressBook/list`=200/无 token=401/ADMIN token=403;`/doc.html`=200。全绿。
- **发现/踩坑/临场决策**: **观察(非本工单)**:`EmployeeController.page` 返回体含 employee `password` 字段(BCrypt 哈希);`getById` 已掩码 `****` 但分页未掩,属既有信息泄露点,记此备将来清理。`anyRequest().permitAll()` 尾规则有意保留(只强制护 `/admin`、`/user`,与原拦截器覆盖面一致)。
- **关联**: commit <步骤4>

### 步骤5 (07-19) — admin 前端认证头改 Bearer
- **改了什么**: 三处旧自定义 `token` 头 → `Authorization: Bearer <token>`:①主 axios 拦截器 `utils/request.ts`;②③两个 `<el-upload>` 上传组件(绕过 axios 实例、自带 `:headers`)`components/ImgUpload/index.vue`、`views/dish/addDishtype.vue`。后端零改动(复用步骤4 jar)。
- **验证**: Proposal 步骤5 测试门 —— 后端 curl:admin/123456 登录→Bearer 访 `/admin/employee/page`=200/code:1、无 token=401、旧 `token` 头=401;浏览器冒烟(硬刷+重登→列表 200 出数据、请求头带 Bearer、图片上传成功)经 Tech Lead 确认。全绿。
- **发现/踩坑/临场决策**: 三处上传头是同一件事,一并改齐避免步骤7 才发现上传 401。
- **关联**: commit <步骤5>

### 步骤6 (07-19) — 最小 C 端 Web(Vue3+Vite+TS+Pinia)【功能实现至此全部完成】
- **改了什么**: 新建独立工程 `project-sky-user-vue3/`(与 admin 分离):①`vite.config.ts` dev proxy `/api`→:8080(rewrite 剥前缀)绕 CORS;②`utils/request.ts` axios 注入 Bearer + 响应 401 清态跳登录;③`stores/user.ts`(Pinia)存 token/user 持久化 localStorage;④`router` 守卫;⑤`views/` 注册/登录/改密/首页(手写最小表单);⑥`api/user.ts` 对齐契约四端点。不碰后端。
- **验证**: Proposal 步骤6 测试门 —— 真浏览器端到端打实时后端:注册→自动登录进首页(`POST /api/user/user/register`=200);受保护端点带 Bearer(`GET /api/user/addressBook/list`=200/data:[]);改密(`PUT .../password`=200)→自动登出→新密码重登(证改密真生效);登出(localStorage 清空);路由守卫拦未登录。全绿。
- **发现/踩坑/临场决策**: Vite 无需 admin 工程的 `--openssl-legacy-provider`。
- **关联**: commit <步骤6>

### 步骤7 (07-19) — 冒烟 & 验收【功能 0001 实现+冒烟全部完成】
- **改了什么**: ①修数据态:`/user/shop/status` 因 Redis(db10)无 `SHOP_STATUS` 键、`getStatus` 对 null 拆箱 NPE→500;用 admin `PUT /admin/shop/1`(Bearer)初始化为 1(走 admin 接口保证与 `RedisTemplate` 序列化器一致,裸 `redis-cli set` 会类型不符失败),验 `GET /user/shop/status`=200/data:1。②更新 `docs/smoke-tests.md`:admin 鉴权头 `token`→Bearer,新增 C 端认证冒烟段 + 前置(C 端 :5173 + shop 初始化)。本步零代码改动(仅数据态+文档)。
- **验证**: Proposal 步骤7 测试门 —— 全套冒烟 2026-07-19 实测全绿([A]~[L] + 6.1~6.7)。
- **发现/踩坑/临场决策**: **重启 Redis / 清库后需重新 set `SHOP_STATUS`**(见 smoke-tests 前置第 6 步;勿用裸 `redis-cli set`——与 `RedisTemplate` 序列化器不符)。
- **关联**: commit <步骤7>
