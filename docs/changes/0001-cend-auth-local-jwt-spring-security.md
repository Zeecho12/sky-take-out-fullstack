# [0001] C 端认证改造:微信登录 → 本地账密 + JWT + Spring Security

## 元信息
- 状态: IN_PROGRESS(Phase 3 执行中;步骤1 已 TESTED)
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
- [ ] admin 端改造后仍能登录 + 带鉴权访问(**回归 Phase 0 冒烟**)
- [ ] 最小 C 端 Web(Vue3 + Vite)能完成注册 / 登录 / 改密 / 登出联调
- [ ] docs/api-contract/* 已更新(随规划已更新)
- [ ] ADR-0001 已写(已完成)
- [ ] docs/smoke-tests.md 增补 C 端认证冒烟且全绿

## 工单清单 (每步一个测试门;标了串行依赖)
- [x] 步骤1 DB 迁移:`user` 表加 `username`(唯一索引)+ `password` 列;`employee` seed 用户 admin 密码改 BCrypt 值。 —— TESTED
- [ ] 步骤2 Security 骨架:sky-server 引入 `spring-boot-starter-security`;新增 `SecurityConfig`(`SecurityFilterChain` + `BCryptPasswordEncoder`),先保证项目能启动。 —— TODO(依赖 1)
- [ ] 步骤3 C 端认证后端:`User` 加字段;`UserMapper.getByUsername/insert`(+xml);`UserService` register/login/changePassword;`UserController` 四端点;`UserDetailsService`。 —— TODO(依赖 2)
- [ ] 步骤4 统一鉴权:JWT `OncePerRequestFilter`(读 Bearer → 校验 → 填 `SecurityContext` + `BaseContext`);`SecurityConfig` 授权规则 + 免认证白名单;admin 登录改签发统一 JWT(role=ADMIN);**删两个手写拦截器 + `WebMvcConfiguration` 里的注册**。 —— TODO(依赖 2、3)
- [ ] 步骤5 admin 前端:请求头改 `Authorization: Bearer`;回归 admin 冒烟。 —— TODO(依赖 4)
- [ ] 步骤6 最小 C 端 Web:Vue3 + Vite 骨架 + axios 拦截器(token 注入 + 401 处理)+ 登录 / 注册 / 改密页;联调打通。 —— TODO(依赖 3、4;契约已定死,可与 5 并行)
- [ ] 步骤7 冒烟 & 验收:`docs/smoke-tests.md` 增 C 端注册 / 登录 / 改密 / 登出;全绿。 —— TODO(收尾)

> 依赖链:1 → 2 → 3 → 4;5 依赖 4;6 依赖 3/4(契约定死后可与 5 并行);7 收尾。
> 状态标记:TODO / IN_PROGRESS(~) / CODE_DONE / TESTED

## 变更记录 (追加式,不删)
- 07-19: 完成 Phase 2 规划——ADR-0001 定稿、api-contract(用户端+管理端)更新、本工单成形。状态 TODO,待进 Phase 3。
- 07-19: 开 `feature/cend-auth-jwt`,执行**步骤1(DB 迁移)**。改 `sky.sql`(`user` 加 `username`/`password` + 唯一索引 `idx_username`;admin seed 密码→BCrypt),新增可重跑迁移脚本 `docs/changes/0001-migration.sql`(MySQL 5.7 用 `information_schema` 守卫 + `PREPARE/EXECUTE`),并对运行中的 `sky_take_out` 库执行。**测试门全绿**:`user` 表新增两列 + 唯一索引就位;迁移二次执行幂等不报错(3 条 skip、exit 0);admin 存储值为 60 字符 BCrypt 且 `matches("123456")=true`。本步零 Java/pom 改动,未跑 `clean package`(构建产物不受影响)。
  - **调研订正**:运行中的库 admin 密码实为 **MD5**(`e10adc3949ba59abbe56e057f20f883e`,ADR 记载正确);`sky.sql` 里原写的是明文 `123456`(从未生效的陈旧种子值,本步已一并改为 BCrypt)。→ 佐证顺序提醒:**此刻起 admin 登录会坏**,`EmployeeServiceImpl` 仍做 MD5 比对,须到步骤4 改用 BCrypt 才恢复;故步骤1 测试门**不含** admin 登录冒烟,该回归门放在步骤4/5。

## ⭐ 交接:给下一个窗口的话
- **当前**:Phase 3 执行中,**分支 `feature/cend-auth-jwt` 已建**;**步骤1(DB 迁移)已 TESTED 并提交**。运行中的 `sky_take_out` 库:`user` 表已含 `username`/`password` + 唯一索引 `idx_username`,admin 密码已迁 BCrypt;`sky.sql` 与迁移脚本 `docs/changes/0001-migration.sql` 均已就位、内容对齐。
- **下一步**:**步骤2(Security 骨架)**——`sky-server` 引入 `spring-boot-starter-security`;新增 `SecurityConfig`(`SecurityFilterChain` + `BCryptPasswordEncoder` bean);**本步目标只是"项目仍能启动"**(先给一个放行/最小配置,别在这步写授权规则与 JWT filter,那是步骤4),测试门 = `clean package` 成功 + 起 jar 不报错。
- **注意(预期内故障)**:此刻起 **admin 登录已坏**(库里 BCrypt、`EmployeeServiceImpl` 仍 MD5),步骤4 修;admin 登录冒烟门放在步骤4/5,别在步骤2/3 拿它当门。
- **别碰**:`reference/`(只读)、`.backup-original-git/`、`.tools/`;`OrderServiceImpl.payment()` 的 openid 调用(留给 0002)。
- **验证命令**:后端构建/起 jar/前端见 docs/WORKFLOW.md「常用命令」。**DB 迁移/校验**(本机 gotcha:5.7 客户端要加 `--ssl-mode=DISABLED`):
  `& 'D:\HSPJAVA\mysql-5.7.19-winx64\bin\mysql.exe' -uroot -p123456 --ssl-mode=DISABLED sky_take_out < docs\changes\0001-migration.sql`(可重跑)。
- **契约**:docs/api-contract/用户端接口.md 已定死,前后端按它写;不得擅自改契约,要改先回 Phase 2。
