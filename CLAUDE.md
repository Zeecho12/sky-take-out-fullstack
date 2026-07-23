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

- **Phase**:功能 0005「C 端重建④:订单管理」**Phase 3 执行中,前五步完成 TESTED,只剩收官步骤6**。分支 `feature/0005-order-manage`(自 main):规划 `947ca28`、快照 `102fa31`、**`353f772`**(归属越权 D1)、**`a296f2e`**(退款口径 D2)、**`8b5d584`**(脚手架)、**`7c961f9`**(List.vue,含 van-list 切 tab 修复)、**`91f0ef5`**(Detail.vue+成功页 orderId 透传接线)。六决策拍板:D1 归属越权 4 处全修(Service 层)/ D2 退款口径三处统一置 REFUND / D3 历史订单 3 tab+van-list / D4 三页三路由+Menu「我的」入口 / D5 用户中心纯导航壳。验证:后端 verifier 8/8+4/4;步骤3 type-check+curl+preview;步骤4 preview 全 PASS;步骤5 preview mobile 端到端 verifier 7/7 PASS(详情字段含明细/取消 DB status6+负例/立即支付带 orderId/催单/再来一单合并全程无 clean/成功页接线 orderId→详情/无 orderId 兜底→/order-list)。(0004 merge `b08bf8e`、0003 `3365f69`、0002 `df53f0b`、0001 `b02590b` 均已交付。)
- **进行中**:epic「C 端完整重建」—— **0001–0004 已交付,0005(收官)Phase 3 执行中(6 步:步骤1–5 done,只剩步骤6 用户中心+Menu 入口)**。跨功能决策(Vant / 整站门槛 / 改造复用 / 认证复用 0001)已落地。
- **下一步**:**0005 Phase 3 步骤6(前端用户中心 Center.vue + Menu「我的」入口,D5/D4)= 收官步**:`views/User/Center.vue`(占位→实现)顶部 `useUserStore().user?.username` + `van-cell-group` 导航(历史订单→/order-list、地址管理→/address、修改密码→/change-password、退出登录→`logout()`+跳 /login),**纯导航壳、不发查用户信息请求**(D5);`views/Menu/Index.vue` 顶栏**加**「我的」入口→/user(别动既有店铺/菜单逻辑)。派 subagent 实现(铁律 8)、verifier 跑 preview mobile 门(Menu 见「我的」→/user、4 入口跳对、退出清 token 回 /login、加载无查用户信息请求、type-check+0002/0003/0004 回归)。**步骤6 完成即进 Phase 4 收尾**(合并回 main + 复核 ADR/收口 divedeep backlog[本功能倾向无需单开,见 ADR]+ 契约 `page` 报错码 400/500 措辞校准 + 再生派生文档 + 更新快照)。环境:新 jar(:8080)+ dev server(user-web:5173)在跑;验证前先 `preview_resize` mobile;登录注入捷径写 `sky_user_token`/`sky_user_info`。按铁律 1 先读 proposal 交接头复述后动手。
- **git/环境**:`main` 含 0004(merge `b08bf8e`);`feature/0005-order-manage` 已切、含规划提交 `947ca28`,**未合并**;`feature/0004-mock-payment` 已合并未删。起环境:**Docker Desktop → `docker start sky-redis` → 后端 jar(:8080,构建前先停旧 jar)→ admin `PUT /admin/shop/1` 初始化店铺(Redis 重启后状态丢失需重设)→ C 端 `preview_start` `user-web` 或 `npm --prefix project-sky-user-vue3 run dev`(:5173)**。⚠️**jar/Docker/dev server 扛不过 Claude Code 进程重启,新窗口先核环境**(`java`/8080/6379/`docker ps`)。C 端测试账号 `s7v_2268`/`123456`(id=8);admin `admin`/`123456`;dish/setmeal/shop 依赖 Redis;MySQL 5.7 连库需 `--ssl-mode=DISABLED`(详见 `docs/WORKFLOW.md`)。冒烟基线 `docs/smoke-tests.md`。

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
| `GOOD.md` | 方法论 | 可移植主文档,方法论的唯一真相源 |
| `docs/WORKFLOW.md` | 项目速查 | 本机命令 / 环境 / 踩坑(不含方法论) |
| `docs/blueprint.md` | 备忘/索引 | 跨 feature 大工程路线图(如 C 端重建 0002~0005);一行一 feature,详情看各 requirement,里程碑更新 |
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
Phase 2 规划     写 Requirement + 探讨写 ADR → 定契约 → 拆 Proposal → 内审+DeepSeek 双路评审融合(主窗口,我在环)
Phase 3 执行     按 Proposal 一步一 subagent,串行卡测试门;契约定死后前后端可并行
Phase 4 验证收尾 验证 + 合并回 main + 复核 ADR / 收口 divedeep backlog + 再生派生文档 + 更新快照
```
