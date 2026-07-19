# [0000] Phase 0 安全网 (Safety Net)

## 元信息
- 状态: DONE (2026-07-18)
- 分支: main(Phase 0 基线直接在 main;功能开发才开 feature 分支)
- 关联 ADR: 暂无
- 依赖: 无(这是所有后续工作的前提)

## 目标 (What & Why)
在动任何业务代码前,建立"能验收、能回滚、能验证"的基础:git 基线 + 项目能跑 +
关键路径冒烟基线。

## 现状 / 环境事实(侦察结果)
- 后端: Spring Boot 2.7.3,Maven 多模块(sky-common / sky-pojo / sky-server),
  MyBatis + MySQL + Redis + knife4j + JWT(jjwt)+ 阿里云 OSS + POI + 微信支付。
- 前端: project-sky-admin-vue-ts(Vue 2.6 + TS 3.6 + Vue CLI 3.11 + webpack 4)。
- 只读参考: reference/mp-weixin(微信小程序源码)。
- 本机环境:
  - JDK: 用 **17**(JAVA_HOME=D:\Program\hspjdk17,17.0.5 LTS);PATH 上另有 JDK 21(不用)。
  - Maven: **手动装** Apache Maven 3.9.9 到 .tools/(winget 无此包),已 gitignore。
  - Node 20.19 / npm 11.10。前端 serve 需 `NODE_OPTIONS=--openssl-legacy-provider`
    (webpack4 在 Node17+ 的 OpenSSL 问题)。
  - MySQL 5.7.19:在运行(3306);库 sky_take_out 已建好,11 张表齐全
    (客户端需 --ssl-mode=DISABLED;应用 JDBC 本身 useSSL=false)。
  - Redis:docker 容器 sky-redis(6379)。
  - winget / wsl / docker:均可用。
- 已有分析资产(用户先前产出,Phase 1 可复用):docs/BACKEND_OVERVIEW.md、
  docs/api-contract/*.html、docs/learning-notes/*、
  sky-take-out/backend_scan/PROJECT_S1-S5.md、sky-take-out/NOTE*。
- ⚠ 安全提醒: application-dev.yml 内含阿里云 OSS / 微信密钥(疑似课程公开示例密钥)。
  本地仓库无泄露风险;**将来推送到你自己的 GitHub 前必须清理**(列为后续任务)。

## 验收标准 (Phase 0 DoD)
- [x] git 基线建立且后端源码完整纳入
- [x] 后端能启动(/doc.html=200;admin 登录返回 JWT)
- [x] 前端能启动并透代理登录(8888 → /api → 后端 8080)
- [x] 关键路径冒烟基线就位(docs/smoke-tests.md;用户选:手动冒烟,不写自动化)

## 工单清单
- [x] git init(main)+ 根 .gitignore + baseline 首次提交 —— DONE (8d6a248)
- [x] 修复:sky-take-out 自带 .git 导致后端被记成 submodule → 移入 gitignored 备份
      .backup-original-git/,后端 171 文件重新纳入 —— DONE (e7ea365)
- [x] 关闭 core.autocrlf(消 CRLF 噪音)—— DONE
- [x] 装 Maven —— DONE(winget 无此包 → 手动装 Apache Maven 3.9.9 到 .tools/,已 gitignore)
- [x] 起 Redis —— DONE(docker 容器 sky-redis,6379 OPEN)
- [x] 确定 JDK 版本 —— DONE(JDK 17;JAVA_HOME=D:\Program\hspjdk17,17.0.5 LTS)
- [x] 后端跑起来 —— DONE(JDK17 跑 jar;Started in 9.4s;/doc.html=200;admin 登录返回 JWT)
- [x] 前端跑起来 —— DONE(vue-cli serve @8888,--openssl-legacy-provider;/api 代理→后端;透代理登录返回 JWT)
- [x] 关键路径冒烟基线 —— DONE(docs/smoke-tests.md,已实测通过)

## 变更记录
- 07-18: 完成 git 基线;发现并修复后端嵌套 .git(submodule 陷阱);环境侦察完成;
  DB 确认已就绪。
- 07-18: 装 Maven 3.9.9(winget 无 → 手动到 .tools/);docker 起 Redis;JDK 定 17。
- 07-18: 后端构建 BUILD SUCCESS;后端 jar 启动跑通(连 MySQL+Redis,/doc.html=200,
  admin 登录 + 带鉴权读取全部验证);前端 dev server @8888 编译成功,透 /api 代理
  登录打通(无 CORS)。冒烟基线写入 docs/smoke-tests.md。**Phase 0 DONE。**

## ⭐ 交接:给下一个窗口的话
**Phase 0 完成。** 安全网齐备:git 基线稳、后端(8080)+ 前端(8888)+ MySQL + Redis
全部验证跑通,冒烟基线在 docs/smoke-tests.md。启动命令见 docs/WORKFLOW.md「常用命令」。
后端/前端 dev server 在这次会话里可能仍后台运行;重启顺序:docker start sky-redis →
后端 jar → 前端 npm run serve。
下一步:进 Phase 2 规划第一个功能(建议"替换微信登录 → JWT")——但 Phase 1 理解已有
现成资产(BACKEND_OVERVIEW.md、backend_scan/、learning-notes/)可直接复用。
别碰:reference/(只读)、.backup-original-git/(备份)、.tools/(本地 Maven)。
后续任务备忘:推送到自己的 GitHub 前,清理 application-dev.yml 里的密钥。
