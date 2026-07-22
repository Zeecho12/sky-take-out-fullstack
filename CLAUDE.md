# CQWM2 —— 苍穹外卖学习改造项目

> 这份文件每个新窗口开机自动加载。它是本项目的"宪法":定义我们怎么协作、
> 铁律有哪些、文档放在哪。**方法论详见 [GOOD.md](GOOD.md);本机命令速查见 [docs/WORKFLOW.md](docs/WORKFLOW.md)。**

---

## 一、这是什么

- **代码**:`sky-take-out/`（Java monolith 后端,MyBatis + MySQL + Redis）
  + `project-sky-admin-vue-ts/`（Vue 后台管理前端）。
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

- **Phase**:功能 0001「C 端认证改造」**已交付并合并回 `main`(merge `b02590b`,DoD 全绿)**:后端全站统一 Spring Security + 单套 JWT(`/admin/**`=ADMIN、`/user/**`=USER、401/403、BCrypt);admin 前端认证头迁 `Authorization: Bearer`;新建 C 端 Web `project-sky-user-vue3`(Vue3+Vite+TS+Pinia)全链路端到端跑通;`docs/smoke-tests.md` 全绿。
- **进行中**:文档方法论体系定稿(GOOD.md 五类文档 + C 混合布局 + Phase 4 改「验证与收尾」+ ADR 写法标准),本轮改动直接提交到 `main`。
- **下一步**:功能 0002「支付 mock」(解 `OrderServiceImpl.payment()` 的 openid 遗留,见 0001 Requirement Out of Scope);启动时按 Phase 2 走(写 Requirement → 探讨 ADR → 定契约 → 拆 Proposal)。按需从 ADR-0001 的 divedeep backlog 挑深读笔记。
- **git**:当前在 `main`;`feature/cend-auth-jwt` 分支已合并(未删)。构建前先停后端 jar;本机 MySQL 5.7 客户端连库需 `--ssl-mode=DISABLED`(详见 `docs/WORKFLOW.md`)。冒烟基线 `docs/smoke-tests.md`。

> 本节是**当前快照**,只写"现在":**覆盖式更新**(改写这几行,不往下追加历史),
> 永远保持这个长度。完成了什么、里程碑历史,看 `git log` 和各功能的 `progress.md`,
> 不写进这里。

## 四、铁律(每个窗口都必须遵守)

1. **开工前先读状态、先复述、后动手**:动任何代码前,先读对应的
   `docs/features/NNNN-slug/proposal.md` 的「交接头」和实施清单,并向我复述"当前在哪一步 /
   下一步做什么 / 打算改哪些文件 / 怎么验证",**我确认后才动手**。
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
   (`docs/divedeep/`)。
7. **派生文档不手改**:`docs/BACKEND_OVERVIEW.md` 等能从代码再生的文档,里程碑再生,
   不逐次手动维护;接口文档尽量用 Swagger 注解自动生成(改注解即改文档)。
8. **外包劳动、自留决策**:读取量大 / 边界清晰的活可派 subagent(如扫描、按规格实现
   一步);需要和我探讨决策的活留在主窗口。
9. **只读区**:`reference/` 是参考资料(如微信小程序源码),**禁止修改、不纳入构建、
   不纳入扫描**。

## 五、文档地图

| 文档 | 类型 | 说明 |
|---|---|---|
| `CLAUDE.md`(本文件) | 常驻 | 协作宪法,自动加载 |
| `GOOD.md` | 方法论 | 可移植主文档,方法论的唯一真相源 |
| `docs/WORKFLOW.md` | 项目速查 | 本机命令 / 环境 / 踩坑(不含方法论) |
| `docs/features/NNNN-slug/` | 源头/living | 每功能一文件夹:requirement + proposal(含交接头) + progress |
| `docs/decisions/NNNN-*.md` | 源头/永久 | ADR 决策记录(广度学习资产) |
| `docs/divedeep/*.md` | 学习/永久 | 源码精读笔记(深度学习资产) |
| `docs/api-contract/` | 源头 | 前后端接口契约 |
| `docs/Backend_scan/` | 派生 | Phase 1 backend-scan 产出(S1~SN + BACKEND_OVERVIEW.md),里程碑再生 |
| `reference/` | 只读 | 参考资料(微信小程序源码等) |

## 六、5 阶段流程(一句话版,详见 GOOD.md §3)

```
Phase 0 安全网   git + 跑起来 + 关键路径测试(动业务代码前的前提)
Phase 1 理解     backend-scan 产出架构总览(派 subagent 读)
Phase 2 规划     写 Requirement + 探讨写 ADR → 定契约 → 拆 Proposal → R1/R2 评审(主窗口,我在环)
Phase 3 执行     按 Proposal 一步一 subagent,串行卡测试门;契约定死后前后端可并行
Phase 4 验证收尾 验证 + 合并回 main + 复核 ADR / 收口 divedeep backlog + 再生派生文档 + 更新快照
```
