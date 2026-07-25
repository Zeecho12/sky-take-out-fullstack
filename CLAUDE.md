# CQWM2 —— 苍穹外卖学习改造项目

> 这份文件每个新窗口开机自动加载。它是本项目的"宪法":定义我们怎么协作、
> 铁律有哪些、文档放在哪。**方法论详见 [PLAYBOOK.md](PLAYBOOK.md);本机命令速查见 [docs/RUNBOOK.md](docs/RUNBOOK.md)。**

---

## 一、这是什么

- **代码**:`sky-backend/`（Java monolith 后端,MyBatis + MySQL + Redis）
  + `sky-admin-web/`（Vue 后台管理前端）。
- **目标**:学习工业级全栈项目 + 准备北美后端 SDE 面试。把项目里的微信特定实现
  （微信登录 / 微信支付 / 小程序客户端）替换成北美技术栈标准实现,产出一个能写进
  简历的项目 + 一套面试笔记。
- **性质**:学习为主。不追求生产级完备,只要项目能正常运行、改动的功能能正常发挥
  作用即可。测试够用即可,不陷进覆盖率。

## 二、你(AI)和我(用户)的分工

我是 **Tech Lead / 架构师**,不是纯验收员:我定方向、审设计、做决策。
你是执行团队:给方案、讲清 trade-off、实现代码、写学习文档。

- **带设计决策的事**(选型、schema、模块边界、API 契约):**你必须先把各方案的
  优缺点摆给我 → 和我探讨 → 我拍板 → 你才实现**,并把决策和理由写成 ADR。
- **无决策含量的劳动**(样板代码、批量改名、补测试、写注释):你做,我审。
- 我缺乏很多技术背景,遇到我可能不懂的概念,主动从"为什么需要它"讲起,别默认我懂。

## 三、当前进度

- **Phase**:**无进行中 feature**。功能 0005「C 端重建④:订单管理」**已交付并合并回 main(merge `0fcaca4`,`--no-ff`,2026-07-23)**,DoD 全绿。**「C 端完整重建」epic(0002→0005)全部交付收官**:C 端浏览→加购→下单→(mock)支付→订单管理(历史/详情/取消/催单/再来一单/用户中心)端到端跑通,微信特定实现(登录/支付/小程序客户端)已全部换成账密+JWT / mock 支付 / Vue3 Web;顺带清偿多笔安全/正确性欠债(整站认证统一、地址簿+订单越权 BOLA、事务原子性、退款口径)。0005 六 code commit `353f772`(D1 越权)/`a296f2e`(D2 退款口径)/`8b5d584`(脚手架)/`7c961f9`(List 含 van-list 修复)/`91f0ef5`(Detail+接线)/`a5e4aa0`(Center+入口);验证后端 8/8+4/4、前端 preview 逐步 PASS + 端到端冒烟 A~G。(0004 `b08bf8e`、0003 `3365f69`、0002 `df53f0b`、0001 `b02590b` 均已交付。)
- **进行中**:无 feature。刚完成一次**仓库结构整理 chore**:三端目录统一改名(`sky-take-out`→`sky-backend`、`project-sky-admin-vue-ts`→`sky-admin-web`、`project-sky-user-vue3`→`sky-user-web`)+ `sky.sql`→`db/` + 全量引用更新(含 backend-scan 派生文档批量 sed);已 `--no-ff` 合并 main(`ce5778b`)并 push。焦点仍是工作流 / 方法论(PLAYBOOK.md)优化。
- **⚠️ 待用户手动**:**根目录 `D:\CQWM2` → `sky-take-out-fullstack` 改名尚未做**(会话内无法改自身工作根)。文档绝对路径**已按目标态烤入 `D:\sky-take-out-fullstack`**——所以改名前它与实际 `D:\CQWM2` 暂不一致(相对路径不受影响);改名须同步移动记忆目录 `~/.claude/projects/D--CQWM2`。下一步:用户改完根名从新路径重开,再续工作流探讨。
- **git/环境**:`main` HEAD = merge `ce5778b`;顶层现为 `sky-backend/ sky-admin-web/ sky-user-web/ db/`;epic 路线图见 `docs/blueprint/E01-cend-rebuild.md`。起环境 / 踩坑 / 账号见 `docs/RUNBOOK.md`;新会话先核 env(`java`/8080/6379/`docker ps`;⚠️ jar/Docker/dev server 扛不过进程重启;admin-web dev server 需 `NODE_OPTIONS=--openssl-legacy-provider`)。冒烟基线 `docs/smoke-tests.md`。

> 本节是**当前快照**,只写"现在":**覆盖式更新**(改写这几行,不往下追加历史),
> 永远保持这个长度。完成了什么、里程碑历史,看 `git log` 和各功能的 `progress.md`,
> 不写进这里。

## 四、铁律(每个窗口都必须遵守)

1. **开工前先核 env、先读状态、先复述、后动手**:先核环境(项目能否跑起来——新会话 / 进程重启后
   尤其要核,命令见 `docs/RUNBOOK.md`),再读对应的 `docs/features/NNNN-slug/proposal.md` 的「交接头」
   和实施清单,并向我复述"当前在哪一步 / 下一步做什么 / 打算改哪些文件 / 怎么验证",**我确认后才动手**。
2. **提交粒度**:一步一 commit,一功能一分支(`feature/xxx`),一功能一次合并。
3. **契约优先(contract-first)**:全栈功能先在 `docs/api-contract/` 定死接口契约,
   再实现;契约定死后前后端才可并行。
4. **完成的定义(DoD)**:代码 + 测试 + 相关文档(requirement / proposal / progress)+ ADR
   全部更新,才算 `DONE`。文档更新不是事后补,是"完成"的一部分。**这是全站统一 DoD;
   各功能 Requirement 里只写功能级验收标准(Acceptance Criteria),不重抄本条。**
5. **收工前更新交接**:每个窗口结束前,更新对应 `proposal.md` 的「交接头」(当前 / 下一步 /
   别碰什么 / 怎么验证)+ 追加一条 `progress.md` 现场笔记。
6. **决策留痕(广度)、机制留笔记(深度)**:带设计决策的改动写 ADR(`docs/decisions/NNNN-*.md`,
   含方案对比、理由、trade-off、面试要点);值得吃透的机制用 `divedeep` 写源码精读笔记
   (`docs/divedeep/`)。**每功能 ADR「面试要点」里按 高/中/低 标出 divedeep 候选(评链路不评
   decision),Phase 4 主动问我对中/高哪几条触发 divedeep(高默认建议写、低不写)。**
7. **派生文档不手改**:`docs/BACKEND_OVERVIEW.md` 等能从代码再生的文档,里程碑再生,
   不逐次手动维护;接口文档尽量用 Swagger 注解自动生成(改注解即改文档)。
8. **外包劳动、自留决策 —— Phase 3 执行硬铁律**:需要和我探讨的决策留主窗口。
   **Phase 3 每个实施步骤的「读文件 + 写代码」必须派 subagent(一步一个),不在主窗口内联写代码**;
   验证若输出冗长(浏览器网络日志 / 大快照 / 海量读取)也交**独立 verifier subagent** 跑,只回浓缩结论。
   主窗口**只保留**:编排(何时进下一步)、审 diff、把测试门(拍板过没过)、提交 commit、环境调试
   (git / Docker / jar / DB)。**目的:保护主窗口上下文 + 职责分离(运动员 ≠ 裁判)**。
   (教训:0002 step1–6 在主窗口内联实现导致上下文暴涨;此后不复犯。)
9. **只读区**:`reference/` 是参考资料(如微信小程序源码),**禁止修改、不纳入构建、
   不纳入扫描**。

## 五、文档地图

| 文档 | 类型 | 说明 |
|---|---|---|
| `CLAUDE.md`(本文件) | 常驻 | 协作宪法,自动加载 |
| `PLAYBOOK.md` | 方法论 | 可移植主文档,方法论的唯一真相源 |
| `PLAYBOOK_LOG.md` | 方法论 | 方法论变更日志 + 搁置背包(随 PLAYBOOK 主副本走) |
| `docs/RUNBOOK.md` | 项目速查 | 本机命令 / 环境 / 踩坑(不含方法论) |
| `docs/blueprint/E01-*.md` | 源头/epic | 跨 feature 大工程路线图(每 epic 一文件,如 C 端重建 E01=0002~0005);一行一 feature,里程碑更新 |
| `docs/features/NNNN-slug/` | 源头/living | 每功能一文件夹:requirement + proposal(含交接头) + progress |
| `docs/decisions/NNNN-*.md` | 源头/永久 | ADR 决策记录(广度学习资产) |
| `docs/divedeep/*.md` | 学习/永久 | 源码精读笔记(深度学习资产) |
| `docs/api-contract/` | 源头 | 前后端接口契约 |
| `docs/backend-scan/` | 派生 | Phase 1 backend-scan 产出(S1~SN + BACKEND_OVERVIEW.md),里程碑再生 |
| `reference/` | 只读 | 参考资料(微信小程序源码等) |

## 六、5 阶段流程(一句话版,详见 PLAYBOOK.md §3)

```
Phase 0 安全网   git + 跑起来 + 关键路径测试(动业务代码前的前提)
Phase 1 理解     backend-scan 产出架构总览(派 subagent 读)
Phase 2 规划     写 Requirement + 探讨写 ADR → 定契约 → 拆 Proposal → 内审+DeepSeek 双路评审融合(主窗口,我在环)
Phase 3 执行     按 Proposal 一步一 subagent,串行卡测试门;契约定死后前后端可并行
Phase 4 验证收尾 验证 + 合并回 main + 复核 ADR / 收口 divedeep backlog + 再生派生文档 + 更新快照
```
