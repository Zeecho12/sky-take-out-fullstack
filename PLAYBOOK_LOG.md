# PLAYBOOK_LOG —— 方法论变更日志 + 搁置背包

> **这是什么**:`PLAYBOOK.md`(可移植方法论)自身演化的记录。两个功能:
> **A 变更日志**——已采纳的方法论改动(为什么改 / 不改的代价 / 落到哪);
> **B 搁置背包**——考虑过但暂不采纳的改动(附"什么时候该重新捡起")。
> 相当于"**方法论自己的 ADR**"。
>
> **可移植**:本文件随 `PLAYBOOK.md` 一起在 `~/.claude/` 有一份主副本,开新项目一起复制过去
> ——方法论的演化史和搁置项是**跨项目资产**(下一个下载的教学项目可能撞到同样的坑)。
>
> **更新纪律**:里程碑式追加(方法论有改动才写),不逐次维护;旧条目不改(是历史)。

---

## A. 变更日志(已采纳,里程碑追加)

### 2026-07-24 · 首轮方法论优化(基于 0002–0005「C 端重建」epic 的一手实践复盘)

背景:C 端重建 epic(0002–0005)交付后,复盘 5 个 feature 的 progress/ADR + 跨 feature 重复模式,
对 PLAYBOOK 做首轮优化。以下 7 项已采纳(逐条 mini-ADR 结构:升级前 / 驱动问题 / 不改的代价 / 落点)。

**A1 — 新增 epic 层(blueprint)**
- 升级前:方法论只有"项目(CLAUDE.md 当前进度)/ feature"两层,没有"跨多 feature 大工程"这层。
- 驱动问题:一句"重做 C 端"天然拆成 0002–0005 四个 feature;项目自发造了 `docs/blueprint.md` 补位,却没回流方法论——下个项目要重新发明。
- 不改的代价:跨 feature 路线图无处安放(塞 CLAUDE.md 违反 bounded / 散在各 ADR 无统览)。
- 落点:PLAYBOOK §4.2.1(定义 + 触发门槛 ≥2 feature + `docs/blueprint/E01-<slug>.md` 命名[E=epic] + 何时建/更新/追溯 + 跨功能决策混合归属)、§4.6 目录树、§3 Phase 2、§5 词典、§9.1 文档地图。`docs/blueprint.md` → `docs/blueprint/E01-cend-rebuild.md`(首个实例 = 归档资产)。

**A2 — "运行期行为断言"归"待验假设",不进 ADR**
- 升级前:proposal 模板无"假设"栏,规划期的行为猜测无处安放,只能挤进 ADR 当"决策"。
- 驱动问题:0005 把"van-list 只靠自动 @load 首拉"当护栏写进 ADR-0005 AD1,切 tab 场景被执行期 verifier 实测推翻——双路评审(读文档+源码)看不见第三方组件的运行期涌现行为。
- 不改的代价:未验证的行为断言混进 ADR(决策资产),被推翻时像"决策打脸",污染 ADR 纯度。
- 落点:PLAYBOOK §9.4 proposal 模板加「假设/待验」栏、§4.4 ADR 纪律加一条、§5 词典加"待验假设"、§3 Phase 2 评审关卡点明盲区。

**A3 — Progress 模板贴合实践(按里程碑/日期分节)**
- 升级前:§9.6 模板是"### 步骤N (日期)"+ 四段 bullet;实践(0003/0004/0005)自发改成"## 日期·里程碑"叙事,模板与实践漂移。
- 驱动问题:追加式现场笔记天然按时间线组织,原模板结构不贴合 → 模板形同虚设。
- 落点:§9.6 改为"按里程碑/日期分节 + 四要素(做了什么/验证/发现踩坑/关联下一步)必填",保留"发现踩坑一等公民、没有写无"。这是 §8「先手动跑、实践更好就回流」的正例。

**A4 — 复述握手扩为"先核 env + 复述"**
- 升级前:复述握手只要求"读状态 → 复述 → 动手",没有"先核环境"。
- 驱动问题:环境扛不过进程重启/会话边界(0001/0002/0004/0005 反复:jar/Docker/dev server 掉、Redis 丢店铺状态),"读完状态就狂奔"会撞到跑不起来。
- 不改的代价:每个新会话重复踩"环境没了还往下干"的坑。
- 落点:PLAYBOOK §5 复述握手 + CLAUDE 铁律 1(先核 env);机器命令留 RUNBOOK。

**A5 — CLAUDE.md 环境行压成 RUNBOOK 指针**
- 升级前:CLAUDE.md「当前进度」env 行内联了完整起环境步骤 + 踩坑 + 测试账号,和 RUNBOOK 重复。
- 驱动问题:CLAUDE.md 每窗口自动加载、必须 bounded;重复内容稀释注意力预算(恶化"铁律被漏")。
- 落点:env 行压成"起环境/踩坑/测试账号见 RUNBOOK";细节移入 RUNBOOK。

**A6 — 三处文档改名(名实相符 + 命名规范)**
- 升级前:`GOOD.md`(零信息名)装方法论;`docs/WORKFLOW.md`(听着像装 workflow)装命令环境;`docs/Backend_scan/`(PascalCase+下划线)和其余 lowercase-kebab 目录不一致。
- 驱动问题:名不符实误导冷启动 AI;目录命名不统一。
- 落点:`GOOD.md`→`PLAYBOOK.md`(接"运营宝典"类比)、`docs/WORKFLOW.md`→`docs/RUNBOOK.md`(运维标准词)、`docs/Backend_scan/`→`docs/backend-scan/`。全仓库引用同步更新。

**A7 — 新建本文件(PLAYBOOK_LOG.md)**
- 驱动问题:搁置项(下方 B 段)带"重启条件",原先只存在临时 `Draft.md` 里,会随 Draft 删除而丢;方法论演化也无 changelog。
- 落点:新建 `PLAYBOOK_LOG.md`(可移植,随 PLAYBOOK 主副本走)+ PLAYBOOK §4.6/§9.1 文档地图登记。

---

## B. 搁置背包(考虑过、暂不采纳;附重启条件)

### 议题 1 — 给「铁律 8」配 hook 闸门 —— 搁置(2026-07-24)
- **提案**:PreToolUse hook 拦截"主窗口(顶层 agent)直接 Edit/Write 业务码"、放行 subagent 的编辑;逃生舱 = 标记文件 `.claude/allow-main-edit`。硬拦截 + 路径启发式(业务码路径触发,docs/md/.claude 放行)。
- **能力核实**(claude-code-guide 读官方 hooks.md/sub-agents.md,⚠️**未实测**):**完全可行**——PreToolUse 对 subagent 也触发;输入 JSON 有 `agent_id` 字段(**只在 subagent 出现** → 能干净区分主/子);`permissionDecision:"deny"` 可硬拦 + 原因给模型;`allow`+`additionalContext` 可软提醒;无 SubagentStop 但 `agent_id` 够用。配置在 `.claude/settings.json` 的 `hooks.PreToolUse[{matcher:"Edit|Write",...}]`。
- **为什么搁置**:用户决定暂不实施。
- **重启条件**:主窗口内联写代码 / 上下文暴涨的老毛病(0002 那种)再犯,或想把"可判定的铁律"系统性 hook 化时。
- **备查**:落地前先做 hook 冒烟实测(派 dummy subagent 改 + 主窗口改,确认 `agent_id` 一有一无)——别把未实测的运行期断言当已定(此即 A2 教训用在自己工具上)。

### 议题 3 — Phase 2 契约「反向校准」写进方法论 —— 驳回(2026-07-24)
- **提案**:改造项目里契约(YAPI 逆向导出)常与代码漂移(0004 payment 响应字段 `estimatedDeliveryTime` vs 微信 5 字段;0005 `pageNum` vs `page`);建议 Phase 2 契约步骤加 brownfield 专属"校准 → 固化":定契约前实读后端校准逆向契约,再冻结走 contract-first。根因框架:**先写型契约(API-first,权威)vs 逆向型契约(code-first,派生、冲突时代码赢)**。
- **为什么驳回**:用户认为本项目契约是从网上下载、他本人未审查;判断以后项目不会出现这种错误,不值得为此改方法论。
- **AI 存疑(记录)**:PLAYBOOK §0 适用范围就是"改造从 GitHub 下载的教学项目",故"契约未审 / 需从代码逆向"是常态而非例外,下个 brownfield 项目大概率同类。
- **重启条件**:下个项目再撞同类"契约 ↔ 代码漂移",或决定为 brownfield 契约补"入场审"动作时。
