# [0000] Phase 0 安全网 (Safety Net)

## 元信息
- 状态: IN_PROGRESS
- 分支: main(Phase 0 基线直接在 main;功能开发才开 feature 分支)
- 关联 ADR: 暂无
- 依赖: 无(这是所有后续工作的前提)

## 目标 (What & Why)
在动任何业务代码前,建立"能验收、能回滚、能验证"的基础:git 基线 + 项目能跑 +
关键路径测试。

## 现状 / 环境事实(侦察结果)
- 后端: Spring Boot 2.7.3,Maven 多模块(sky-common / sky-pojo / sky-server),
  MyBatis + MySQL + Redis + knife4j + JWT(jjwt)+ 阿里云 OSS + POI + 微信支付。
- 前端: project-sky-admin-vue-ts(Vue + TS)。
- 只读参考: reference/mp-weixin(微信小程序源码)。
- 本机环境:
  - JDK: PATH=21,JAVA_HOME=D:\Program\hspjdk17(17)。项目为 JDK 8/11 时代所写。
  - Maven: **未安装**(无 mvn,无 mvnw wrapper)。
  - Node 20.19 / npm 11.10:已装。
  - MySQL 5.7.19:**在运行**(3306);库 sky_take_out **已建好,11 张表齐全**
    (客户端需 --ssl-mode=DISABLED 连;应用 JDBC 本身 useSSL=false,不受影响)。
  - Redis:**未运行**(6379 关闭,redis-cli 不在 PATH)。
  - winget / wsl / docker:均可用。
- 已有分析资产(用户先前产出,Phase 1 可复用):docs/BACKEND_OVERVIEW.md、
  docs/api-contract/*.html、docs/learning-notes/*、
  sky-take-out/backend_scan/PROJECT_S1-S5.md、sky-take-out/NOTE*。
- ⚠ 安全提醒: application-dev.yml 内含阿里云 OSS / 微信密钥(疑似课程公开示例密钥)。
  本地仓库无泄露风险;**将来推送到你自己的 GitHub 前必须清理**(列为后续任务)。

## 验收标准 (Phase 0 DoD)
- [ ] git 基线建立且后端源码完整纳入
- [ ] 后端能启动(mvn spring-boot:run,knife4j 可访问)
- [ ] 前端能启动并登录进后台
- [ ] 关键路径 characterization 测试就位(登录/下单/查报表等,够用即可)

## 工单清单
- [x] git init(main)+ 根 .gitignore + baseline 首次提交 —— DONE (8d6a248)
- [x] 修复:sky-take-out 自带 .git 导致后端被记成 submodule → 移入 gitignored 备份
      .backup-original-git/,后端 171 文件重新纳入 —— DONE (e7ea365)
- [x] 关闭 core.autocrlf(消 CRLF 噪音)—— DONE
- [ ] 装 Maven(方式待定:winget / wrapper)—— TODO
- [ ] 起 Redis(方式待定:docker / memurai / wsl)—— TODO
- [ ] 确定 JDK 版本(倾向 17)—— TODO
- [ ] 后端跑起来 —— TODO
- [ ] 前端跑起来(npm install + serve)—— TODO
- [ ] 补关键路径 characterization 测试 —— TODO

## 变更记录
- 07-18: 完成 git 基线;发现并修复后端嵌套 .git(submodule 陷阱);环境侦察完成;
  DB 确认已就绪。

## ⭐ 交接:给下一个窗口的话
git 基线已稳(2 commits,后端源码完整)。原始后端 .git 备份在
.backup-original-git\sky-take-out-git(已 gitignore,可删)。
下一步:让项目跑起来,三个待决:装 Maven、起 Redis、定 JDK(倾向 17)。
未提交改动:根 .gitignore(加了备份忽略行)+ 本工单,尚未提交。
别碰:reference/(只读)、.backup-original-git/(备份)。
验证 DB: mysql -uroot -p123456 --ssl-mode=DISABLED -e "use sky_take_out; show tables;"
