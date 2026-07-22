# WORKFLOW —— CQWM2 运行速查卡

> 方法论(5 阶段、文档体系、模板、协作模型)看 [GOOD.md](../GOOD.md),本文件**不复述**。
> 这里只写"在这台机器、这个项目上具体怎么敲命令 + 踩过的坑"。

---

## 本机环境
- JDK17:`D:\Program\hspjdk17`
- Maven:`D:\CQWM2\.tools\apache-maven-3.9.9`
- MySQL 5.7 客户端:`D:\HSPJAVA\mysql-5.7.19-winx64\bin\mysql.exe`(库 `sky_take_out`,root / 123456)
- Redis:Docker 容器 `sky-redis`

## 常用命令
- 起 Redis:`docker start sky-redis`(首次:`docker run -d -p 6379:6379 --name sky-redis redis`)
- 后端构建:`& 'D:\CQWM2\.tools\apache-maven-3.9.9\bin\mvn.cmd' -f 'D:\CQWM2\sky-take-out\pom.xml' clean package -DskipTests`
- 后端启动:`& 'D:\Program\hspjdk17\bin\java.exe' -jar 'D:\CQWM2\sky-take-out\sky-server\target\sky-server-1.0-SNAPSHOT.jar'`
- knife4j 接口文档:http://localhost:8080/doc.html
- admin 前端:在 `project-sky-admin-vue-ts` 下 `$env:NODE_OPTIONS='--openssl-legacy-provider'; npm run serve`(http://localhost:8888)
- C 端前端:`npm --prefix project-sky-user-vue3 run dev`(http://localhost:5173,需后端 :8080;首次先 `npm install --prefix project-sky-user-vue3`)
- 登录冒烟:`curl -s -X POST http://localhost:8080/admin/employee/login -H "Content-Type: application/json" -d '{\"username\":\"admin\",\"password\":\"123456\"}'`

## Phase 2 计划外审(DeepSeek CLI,全局工具)
> 方法论见 GOOD.md §3 Phase 2 步骤5(内审 + 外审**双路必跑**)。内审 = 会话内开全新上下文敌对 subagent;
> 外审 = 下面的 DeepSeek CLI。工具在**全局** `C:\Users\18582\.claude\tools\`(跨项目复用;key 不进任何 repo)。
- 列模型:`python "C:\Users\18582\.claude\tools\deepseek_review.py" --key-file "C:\Users\18582\.claude\tools\deepseek.key" --list-models`
- 外审一份计划(敌对提示词放文件;输出写 UTF-8 文件避免控制台中文乱码):
  `python "C:\Users\18582\.claude\tools\deepseek_review.py" --key-file "C:\Users\18582\.claude\tools\deepseek.key" --model deepseek-v4-pro --system "$(Get-Content critic.txt -Raw)" --file docs\decisions\NNNN-xxx.md --file docs\features\NNNN-slug\requirement.md --out result.md`
- 模型:`deepseek-v4-pro`(推理,免费档可用)

## 本机踩坑(gotchas)
- **构建前先停后端 jar**(否则 `target` 里的 jar 被占,`clean` 失败):
  `Get-CimInstance Win32_Process -Filter "Name='java.exe'"` 找到跑 `sky-server-...jar` 的进程 → `Stop-Process -Id <pid> -Force`。
- **MySQL 5.7 客户端连库要加 `--ssl-mode=DISABLED`**(迁移脚本可重跑):
  `& 'D:\HSPJAVA\mysql-5.7.19-winx64\bin\mysql.exe' -uroot -p123456 --ssl-mode=DISABLED sky_take_out < docs\features\0001-cend-auth-jwt\0001-migration.sql`
- **`SHOP_STATUS`**:重启 Redis / 清库后,`/user/shop/status` 会因 Redis 无该键拆箱 NPE→500;用 admin `PUT /admin/shop/1`(Bearer)重新初始化(勿裸 `redis-cli set`——与 `RedisTemplate` 序列化器不符)。
- C 端 Vite 无需 admin 工程的 `--openssl-legacy-provider`。

## 冒烟基线
`docs/smoke-tests.md`(全套 [A]~[L] + C 端 6.1~6.7)。

## 新窗口指路模板
> "继续 feature NNNN。按铁律 1,先读 `docs/features/NNNN-slug/proposal.md` 的交接头,
> 复述当前状态和下一步,先别写代码。"
