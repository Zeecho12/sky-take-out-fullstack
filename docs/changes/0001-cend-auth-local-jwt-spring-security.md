# [0001] C 端认证改造:微信登录 → 本地账密 + JWT + Spring Security

## 元信息
- 状态: IN_PROGRESS(Phase 3 执行中;步骤1–5 已 TESTED——后端认证改造 + admin 前端认证头完成)
- 分支: feature/cend-auth-jwt(已创建)
- 关联 ADR: docs/decisions/0001-cend-auth-local-jwt-spring-security.md
- 关联契约: docs/api-contract/用户端接口.md(认证约定 + 注册/登录/改密/退出)、docs/api-contract/管理端接口.md(header 标准化)
- 依赖: 无(Phase 0 已完成);后续工单 0002(支付 mock)依赖本工单

## 目标 (What & Why)
把 C 端"微信 code 登录 + openid 身份"替换为"本地 username/password 登录",并把全站
鉴权从手写拦截器升级为 **Spring Security**(统管 admin + user),统一为无状态 JWT。
目的:去微信化(便于面试演示)+ 把 Spring Security 做成简历技术亮点。

## 现状/背景 (写给冷启动 AI / subagent)
> 详细现状事实见 ADR-0001「背景」,此处只列执行要点。

- **JWT 机制已存在**(`sky-common/JwtUtil`、`JwtProperties`);**两套手写拦截器**
  (`JwtTokenAdminInterceptor` / `JwtTokenUserInterceptor`)在 `WebMvcConfiguration`
  注册,校验后把主体 id 写入 `BaseContext`(ThreadLocal)。
- **内部身份 id-based**:JWT / BaseContext 只放 Long id,`openid` 不进入 → **下游 7 个用
  `getCurrentId()` 的 Service 不动**。
- `user` 表**无 `username`/`password` 列且无种子数据**(sky.sql);`employee` 表有
  `username`+`password`(MD5),`password` 列 `varchar(64)` 够放 BCrypt(60 字符)。
- `openid` 在 `OrderServiceImpl.payment()` 传给微信支付 → **遗留给 0002,本工单原样保留**。

**会动的关键文件:**
- sky-server:`controller/user/UserController`、`service/impl/UserServiceImpl`、
  `controller/admin/EmployeeController`、`service/impl/EmployeeServiceImpl`、
  `config/WebMvcConfiguration`、`interceptor/*`(将删)、`mapper/UserMapper`(+xml);
  **新增** `config/SecurityConfig`、JWT `OncePerRequestFilter`、`UserDetailsService`。
- sky-pojo:`entity/User`、`dto/UserLoginDTO`(+ 视情况新增注册/改密 DTO)。
- DB:`user` 表加列;`employee` seed 密码迁 BCrypt。
- 前端:`project-sky-admin-vue-ts`(改 token 头);**新建**最小 C 端 Vue3 + Vite。

## 验收标准 (Definition of Done)
- [ ] C 端注册 / 登录 / 登出 / 改密能跑(账密),返回统一 `Result` + Bearer JWT
- [ ] Spring Security 统管全站:`/admin/**` 需 ADMIN、`/user/**` 需 USER;免认证白名单生效
- [x] admin 端改造后仍能登录 + 带鉴权访问(**回归 Phase 0 冒烟**)
- [ ] 最小 C 端 Web(Vue3 + Vite)能完成注册 / 登录 / 改密 / 登出联调
- [ ] docs/api-contract/* 已更新(随规划已更新)
- [ ] ADR-0001 已写(已完成)
- [ ] docs/smoke-tests.md 增补 C 端认证冒烟且全绿

## 工单清单 (每步一个测试门;标了串行依赖)
- [x] 步骤1 DB 迁移:`user` 表加 `username`(唯一索引)+ `password` 列;`employee` seed 用户 admin 密码改 BCrypt 值。 —— TESTED
- [x] 步骤2 Security 骨架:sky-server 引入 `spring-boot-starter-security`;新增 `SecurityConfig`(`SecurityFilterChain` + `BCryptPasswordEncoder`),先保证项目能启动。 —— TESTED(依赖 1)
- [x] 步骤3 C 端认证后端(**认证 authn**):`User` 加字段;`UserMapper.getByUsername/updatePassword/insert`(+xml);`UserService` register/login/changePassword;`UserController` 四端点;`UserDetailsService`+`LoginUser`+`AuthenticationManager`;**JWT `OncePerRequestFilter`(读 Bearer→校验→填 `SecurityContext`+`BaseContext`)已并入本步**;旧 user 拦截器排除 `/user/user/**`。 —— TESTED(依赖 2)
- [x] 步骤4 统一**授权 authz** + 清理:`SecurityConfig` 授权规则(`/admin/**`=ADMIN、`/user/**`=USER)+ 免认证白名单 + 401/403 handler;admin 登录改 BCrypt(方案 A 手动 matches)+ 签发统一 JWT(role=ADMIN);**删两个手写拦截器 + `WebMvcConfiguration` 注册 + 清理旧 `JwtProperties` admin/user 双 secret 字段 + yml**。(JWT 认证过滤器已在步骤3 完成) —— TESTED(依赖 2、3)
- [x] 步骤5 admin 前端:请求头改 `Authorization: Bearer`;回归 admin 冒烟。 —— TESTED(依赖 4)
- [ ] 步骤6 最小 C 端 Web:Vue3 + Vite 骨架 + axios 拦截器(token 注入 + 401 处理)+ 登录 / 注册 / 改密页;联调打通。 —— TODO(依赖 3、4;契约已定死,可与 5 并行)
- [ ] 步骤7 冒烟 & 验收:`docs/smoke-tests.md` 增 C 端注册 / 登录 / 改密 / 登出;全绿。 —— TODO(收尾)

> 依赖链:1 → 2 → 3 → 4;5 依赖 4;6 依赖 3/4(契约定死后可与 5 并行);7 收尾。
> 状态标记:TODO / IN_PROGRESS(~) / CODE_DONE / TESTED

## 变更记录 (追加式,不删)
- 07-19: 完成 Phase 2 规划——ADR-0001 定稿、api-contract(用户端+管理端)更新、本工单成形。状态 TODO,待进 Phase 3。
- 07-19: 开 `feature/cend-auth-jwt`,执行**步骤1(DB 迁移)**。改 `sky.sql`(`user` 加 `username`/`password` + 唯一索引 `idx_username`;admin seed 密码→BCrypt),新增可重跑迁移脚本 `docs/changes/0001-migration.sql`(MySQL 5.7 用 `information_schema` 守卫 + `PREPARE/EXECUTE`),并对运行中的 `sky_take_out` 库执行。**测试门全绿**:`user` 表新增两列 + 唯一索引就位;迁移二次执行幂等不报错(3 条 skip、exit 0);admin 存储值为 60 字符 BCrypt 且 `matches("123456")=true`。本步零 Java/pom 改动,未跑 `clean package`(构建产物不受影响)。
  - **调研订正**:运行中的库 admin 密码实为 **MD5**(`e10adc3949ba59abbe56e057f20f883e`,ADR 记载正确);`sky.sql` 里原写的是明文 `123456`(从未生效的陈旧种子值,本步已一并改为 BCrypt)。→ 佐证顺序提醒:**此刻起 admin 登录会坏**,`EmployeeServiceImpl` 仍做 MD5 比对,须到步骤4 改用 BCrypt 才恢复;故步骤1 测试门**不含** admin 登录冒烟,该回归门放在步骤4/5。
- 07-19: 执行**步骤2(Security 骨架)**。`sky-server/pom.xml` 引入 `spring-boot-starter-security`(版本随父 pom 2.7.3 → Security 5.7.3);新增 `config/SecurityConfig`——组件式 `SecurityFilterChain`(`csrf().disable()` + `STATELESS` + 过渡 `anyRequest().permitAll()`)+ `BCryptPasswordEncoder` bean。**测试门全绿**:`clean package` EXIT=0;起 jar `Started SkyApplication`、Security 过滤链上链;`/doc.html`=200(无 `WWW-Authenticate`)证明 permitAll 不锁站。`permitAll` 期间旧手写拦截器仍在 MVC 层管鉴权,行为不变。
  - **非回归备忘**:`/user/shop/status` 返 500,是店铺状态未在 Redis(db10 为空)初始化的**既有数据态 NPE**(`ShopController.getStatus:32`,请求已穿全 Security 链到达 controller),与步骤2 无关,留步骤7 冒烟处理。`Using generated security password` WARN 为无 `UserDetailsService` bean 时的噪声,步骤3/4 加 `UserDetailsService` 后消失。
- 07-19: 执行**步骤3(C 端认证后端 + JWT 认证过滤器)**。两处规划期决策(见 ADR-0001 addendum):①登录走 **AuthenticationManager + UserDetailsService + 自定义 `LoginUser`**(而非手动 matches);②**JWT `OncePerRequestFilter` 从步骤4 提前到本步**,确立 authn(步骤3)/ authz(步骤4)分离。改动:`User` 加 `username`/`password`;`UserLoginDTO`→账密、新增 `UserRegisterDTO`/`UserChangePasswordDTO`、`UserLoginVO`→`{id,username,token}`;`JwtProperties` 加单套 `secretKey`/`ttl` + `application.yml`;`UserMapper` 加 `getByUsername`/`updatePassword` + xml、`insert` 补两列;新增 `security/{LoginUser,UserDetailsServiceImpl,JwtAuthenticationFilter}`;`SecurityConfig` 加 filter + `AuthenticationManager`(仍 permitAll);`WebMvcConfiguration` 旧 user 拦截器排除 `/user/user/**`;去微信化(删 `UserServiceImpl.wxLogin/getOpenid`)。**测试门全绿**(端到端 curl):注册`code:1`+JWT 载荷 `{sub,role:USER,exp}`、登录、Bearer 改密、旧密码失败、新密码成功、登出、重复注册报"用户名已存在"、无 token 改密优雅报错;DB 落库 `$2a$10$` 60 字符。
  - **修复(测试门抓到的真 bug)**:`UserMapper.insert` 原带 `@AutoFill(INSERT)`,该切面反射调 `setCreateUser/setUpdateTime/setUpdateUser`,但 `User` 无这些审计字段 → `NoSuchMethodException` 500(原项目潜伏 bug,wxLogin 从没被测过)。已摘掉 `insert` 的 `@AutoFill`(createTime 由 register 手动 set)。
  - **步骤4 待办提醒**:无 token 访问受保护端点现返 `code:0`(HTTP 200)而非 401——因授权仍 permitAll;步骤4 加 `/user/**`=USER 规则后自然变 401。
- 07-19: 执行**步骤4(统一授权 + 清理)**——**后端认证改造至此完成**。方案 A(admin 手动 `passwordEncoder.matches`)。改动:`EmployeeServiceImpl.login` MD5→BCrypt matches、`save` 默认密码→`encode`;`EmployeeController.login` 改单套 secret + 载荷 `{sub:empId, role:ADMIN}`;`SecurityConfig` 授权规则(白名单 permitAll → `/admin/**`=hasRole("ADMIN") → `/user/**`=hasRole("USER") → 尾 permitAll)+ 自定义 401 entryPoint / 403 accessDeniedHandler;**删 `JwtTokenAdminInterceptor`/`JwtTokenUserInterceptor` 两文件 + `WebMvcConfiguration` 的 `addInterceptors`**;清理 `JwtProperties` 6 个旧字段 + `application.yml` 6 行旧配置(单套 `secret-key`/`ttl` 保留)。**回归+授权门全绿**:`admin/123456` 登录恢复(JWT `{sub,role:ADMIN}`)、错密码报"密码错误";ADMIN token 访 `/admin/**`=200、无 token=401、USER token=403;USER token 访 `/user/addressBook/list`=200(统一鉴权打通 C 端业务端点)、无 token=401、ADMIN token=403;`/doc.html`=200。`anyRequest().permitAll()` 尾规则有意保留(只强制护 `/admin`、`/user`,与原拦截器覆盖面一致)。
  - **观察(非本工单)**:`EmployeeController.page` 返回体含 employee `password` 字段(BCrypt 明文哈希);`getById` 已掩码为 `****` 但分页查询未掩,属既有信息泄露点,记此备将来清理。

- 07-19: 执行**步骤5(admin 前端认证头改造)**。三处旧自定义 `token` 头 → `Authorization: Bearer <token>`:①主 axios 请求拦截器 `utils/request.ts`;②③两个 element-ui `<el-upload>` 上传组件(绕过 axios 实例、自带 `:headers`)`components/ImgUpload/index.vue`、`views/dish/addDishtype.vue`——三处同一件事,一并改齐避免步骤7 才发现上传 401。后端本轮零改动(复用步骤4 的 jar,未 `clean package`)。**测试门全绿**:后端 curl 证契约(`admin/123456` 登录→Bearer 访 `/admin/employee/page`=200/`code:1`;无 token=401;旧 `token` 头=401);前端浏览器冒烟(硬刷+重登→列表页 200 出数据、请求头带 `Authorization: Bearer`、新增菜品图片上传成功)经 Tech Lead 确认通过。

## ⭐ 交接:给下一个窗口的话
- **当前**:Phase 3 执行中,分支 `feature/cend-auth-jwt`;**步骤1–5 均已 TESTED 并提交**。后端:全站统一 Spring Security + 单套 JWT(`/admin/**`=ROLE_ADMIN、`/user/**`=ROLE_USER、白名单免认证、401/403 语义;admin+C 端 BCrypt;旧手写拦截器与双 secret 已清除)。admin 前端:三处旧 `token` 头(`utils/request.ts` 主拦截器 + `ImgUpload`/`addDishtype` 两个上传组件)已改 `Authorization: Bearer`,回归+授权门全绿(见变更记录 07-19 步骤4、步骤5)。
- **下一步**:**步骤6(最小 C 端 Vue3+Vite)**——按 `docs/api-contract/用户端接口.md` 建骨架 + axios 拦截器(token 注入 `Authorization: Bearer` + 401 处理)+ 注册/登录/改密/登出页,联调打通(契约已定死)。步骤6 后进 **步骤7 冒烟收尾**(`docs/smoke-tests.md` 增 C 端注册/登录/改密/登出 + admin 回归,全绿)。
- **注意**:①`/user/shop/status` 仍会 500(Redis db10 无 `SHOP_STATUS`,既有数据态,留步骤7 冒烟时 `redis-cli -n 10 set SHOP_STATUS 1` 或走 admin 端设置);②后端已用 `Authorization: Bearer`,前端(admin + 新 C 端)都按此发;③`OrderServiceImpl.payment()` 的 openid 仍留给 0002(账密新用户 openid=null,支付要到 0002 才通)。
- **别碰**:`reference/`(只读)、`.backup-original-git/`、`.tools/`;`OrderServiceImpl.payment()` 的 openid 调用(留给 0002)。
- **验证命令**:后端构建/起 jar/前端见 docs/WORKFLOW.md「常用命令」。**构建前先停后端 jar**(否则 `target` 里的 jar 被占,`clean` 失败):
  `Get-CimInstance Win32_Process -Filter "Name='java.exe'"` 找到 `sky-server-...jar` 的进程 → `Stop-Process -Id <pid> -Force`。
  **DB 迁移/校验**(本机 gotcha:5.7 客户端要加 `--ssl-mode=DISABLED`):
  `& 'D:\HSPJAVA\mysql-5.7.19-winx64\bin\mysql.exe' -uroot -p123456 --ssl-mode=DISABLED sky_take_out < docs\changes\0001-migration.sql`(可重跑)。
- **契约**:docs/api-contract/用户端接口.md 已定死,前后端按它写;不得擅自改契约,要改先回 Phase 2。
