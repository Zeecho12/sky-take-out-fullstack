# WORKFLOW —— 5 阶段操作手册

> 本文件是 CQWM2 项目的操作手册,配合根目录 [CLAUDE.md](../CLAUDE.md) 使用。
> CLAUDE.md 讲"规矩"(自动加载,篇幅短);本文件讲"怎么做"(需要时查,篇幅长)。
>
> **双重身份**:现在它是手动跑流程的操作手册;将来某个 phase 跑顺、步骤稳定了,
> 这一节的内容就是那个 skill 的规格说明,可直接交给 skill-creator 固化成 skill。
> 所以每次跑完一个 phase,如果发现步骤和这里写的不一致,**回来更新本文件**——
> 它是在为未来的 skill 攒真实规格。

---

## 0. 怎么用这份手册

### 新窗口开机三步

1. CLAUDE.md 已自动加载,新窗口已经知道所有铁律。
2. 你(用户)只需一句指路,例如:
   > "继续 feature 0001。按铁律 1,先读 `docs/changes/0001-*.md`,复述当前状态和
   > 下一步,先别写代码。"
3. AI 读完 → 复述"当前在哪步 / 下一步 / 要改哪些文件 / 验证命令" → 你确认 → 才动手。

> **为什么要先复述再动手**:新窗口的 AI 是"失忆"的,靠文档重建状态时可能理解偏。
> 花 10 秒让它先复述,是防止"理解偏了还一路狂奔"的廉价保险。

### 上下文交接协议(context handoff)

长任务会超出单个窗口的上下文。跨窗口续接**不靠 AI 重读全部代码**,靠工单里的
「交接段」。每个窗口收工前,AI 必须更新对应 `docs/changes/NNNN` 的「交接段」:
当前在哪、下一步做什么、别碰哪些文件、用什么命令验证。新窗口读这一段 + 清单即可秒接。

---

## 1. 文档架构:派生 vs 源头

治"文档漂移"(代码变了文档没跟上)的根本办法,是分清两类文档、区别对待:

| | 派生文档(Derived) | 源头文档(Source-of-truth) |
|---|---|---|
| 例子 | `BACKEND_OVERVIEW.md`、Swagger API 文档 | ADR、`api-contract.md`、功能工单 |
| 本质 | 代码的"缓存",能从代码再生 | 含人类意图/决策,代码里生不出来 |
| 维护 | **不手动维护,里程碑再生** | **手动维护,列入 DoD** |

三条策略:
1. 接口文档尽量用 **Swagger/knife4j 注解自动生成**——改注解即改文档,永不漂移。
2. `BACKEND_OVERVIEW.md` 当"架构快照",**每个 Phase / 大功能完成后再生一次**,
   中间小改动不碰它。
3. 把"更新文档"写进 **DoD**——功能不是"代码写完"算完,是"代码+测试+文档+ADR"
   都更新才算 `DONE`。

---

## 2. subagent 委派原则:外包劳动,自留决策

**主窗口是你的指挥席**,你只跟它说话,它自己判断何时把活外包给 subagent。你不需要
手动管理一堆 agent。

判断规则:subagent 上下文**隔离**(看不到对话,只返回结果),所以——
- ✅ **外包**:边界清晰、读取量大、只要结果不要过程的活。
- ❌ **自留**:需要和你反复探讨、你必须在环做决策的活。

| Phase | 主窗口(你在环) | 外包给 subagent |
|---|---|---|
| 0 安全网 | git、跑起来(交互调环境) | 写关键路径测试(边界清晰) |
| 1 理解 | 看报告、提问 | **整个 backend-scan(读海量文件)** |
| 2 规划 | **全程:探讨、写 ADR、定契约** | 顶多派 explore 查"某标识符在哪被用" |
| 3 执行 | 编排、审 diff、把测试门 | **每一步实现 = 一个 subagent** |
| 4 验证学习 | 跑测试、审 diff、拍板 | 独立 verifier 复审;整理 ADR |

要点:
- **不是"一 phase 一 subagent"**:Phase 1 可能一个大 subagent;Phase 2 一个都不外包;
  Phase 3 是**一步一个**。
- subagent 还能**保护主窗口上下文**:让它去读几十个文件,只把浓缩结果返回,主窗口
  始终清爽。这正好治"长任务窗口不够用"。
- **同一份功能工单一物两用**:对新窗口主 AI 是"交接文档",对派出的 subagent 是
  "任务简报"。所以工单要写清"现状/背景/要改哪些文件"。

---

## 3. 分支与提交策略

- **一功能一分支**:`feature/<slug>`(如 `feature/jwt-login`)。
- **一步一 commit**:工单清单里的每个步骤,对应一个 commit;commit message 说清
  "改了什么 + 关联工单/步骤"。
- **一功能一次合并**:整个功能验收通过后,合并回 `main`。
- 好处:审 diff 颗粒度细,任何一步出错都能单独回滚。

---

## 4. 五个 Phase 详解

> 每个 phase 统一按:目的 / 输入 / 步骤 / 产出 / 谁做 / 完成标准。

### Phase 0 —— 安全网(Safety Net)

- **目的**:建立"能验收、能回滚、能验证"的基础。动任何业务代码前必须完成。
- **输入**:下载好的项目源码。
- **步骤**:
  1. `git init` + 写根目录 `.gitignore`(排除 `target/`、`node_modules/`、
     本地配置等)+ 首次提交,锁定"已知良好基线"。
  2. 让项目真正跑起来:MySQL 建库导数据、Redis 起来、后端 `sky-server` 能启动、
     Vue 后台能登录进去。**跑通前不改任何业务代码。**
  3. 补关键路径测试(characterization test 思路):针对登录、下单、支付、查报表等
     核心链路,写一批集成测试,把"当前行为"钉死。够用即可,不追覆盖率。
- **产出**:git 仓库 + 可运行的基线 + 一批关键路径测试。
- **谁做**:git / 跑环境在主窗口(交互调试);写测试可派 subagent。
- **完成标准**:项目能跑;核心链路测试全绿;基线已 commit。

### Phase 1 —— 理解(Understand)

- **目的**:搞清项目架构、模块职责、耦合关系,建立"空间地图"。
- **输入**:可运行的基线。
- **步骤**:
  1. 运行 `backend-scan-*` skill 套件(单体版,SKILL 1→7),产出各 `PROJECT_SN_*.md`。
  2. 合并为 `docs/BACKEND_OVERVIEW.md`。
  3. 额外产出一张**耦合地图**:标清哪些模块互相依赖、哪些代码被 admin 和 user 两端
     共用(如 `sky-common`、`sky-pojo`、共用 Service)。它决定 Phase 3 哪些能并行。
- **产出**:`docs/BACKEND_OVERVIEW.md` + 耦合地图。
- **谁做**:派 subagent 做扫描(读海量文件),主窗口看报告。
- **完成标准**:你能对着 overview 说清"每块是谁、负责什么、谁调谁"。

### Phase 2 —— 规划(Plan)

- **目的**:把"想改的地方"变成"可执行、可验收的工单",并把设计决策拍板留痕。
- **输入**:`BACKEND_OVERVIEW.md` + 改造目标。
- **步骤**:
  1. **探讨决策**:对每个带设计含量的改动,AI 先把各方案优缺点摆出来 → 和我探讨
     trade-off → 我拍板 → 写成 ADR(`docs/decisions/NNNN-*.md`)。
  2. **定契约**:全栈功能先在 `docs/api-contract.md` 定死接口(路径/方法/请求/响应/
     状态码/错误格式)。契约定死后前后端才可并行。
  3. **拆工单**:把功能拆成有依赖顺序的步骤,写进 `docs/changes/NNNN-*.md`(用下面的
     模板),标清范围边界、依赖、验收标准、学习点。串行依赖的步骤不能丢给并行 agent。
- **产出**:ADR + `api-contract.md` 更新 + 功能工单。
- **谁做**:**全程主窗口,你在环**(这是决策,不外包)。
- **完成标准**:工单里每一步都有明确边界和验收标准;关键决策都有 ADR。

### Phase 3 —— 执行(Execute)

- **目的**:按工单实现代码,每步过测试门再进下一步。
- **输入**:功能工单 + ADR + 契约。
- **步骤**(单个功能):
  1. 开 `feature/<slug>` 分支。
  2. 逐步骤推进:派 subagent 实现步骤 N → 跑测试 → **你审 diff + 确认测试过**(测试门
     由你/独立方把守,不能让写代码的 subagent 自己宣布通过)→ 更新工单清单为 `TESTED`
     + 更新交接段 → 提交一个 commit → 进步骤 N+1。
  3. 契约定死的全栈功能,前端实现与后端实现可**并行**(各对契约写)。
- **产出**:实现代码 + 每步一个 commit + 工单清单持续更新。
- **谁做**:编排/审查/把门在主窗口;每步实现可派 subagent。
- **完成标准**:所有步骤 `TESTED`;功能能跑;准备验收。

### Phase 4 —— 验证与学习(Verify & Learn)

- **目的**:确认改动正确,并把"AI 干的活"沉淀成"你的面试能力"。
- **输入**:实现完成的功能分支。
- **步骤**:
  1. **验证**:关键路径测试全绿 + 应用能跑 + 你逐个审 diff。
  2. **学习**:补全/复核该功能的 ADR(决策理由 + trade-off + 面试要点);必要时用
     `create-note` skill 生成源码精读笔记。
  3. **合并**:功能整体合并回 `main`。
  4. **收尾**:里程碑处再生 `BACKEND_OVERVIEW.md`;更新 CLAUDE.md「当前进度」。
- **产出**:合并后的代码 + 完整 ADR/笔记 + 更新后的架构快照。
- **谁做**:验证/拍板在主窗口;独立复审、整理笔记可派 subagent。
- **完成标准**:功能已合并;DoD 全部满足;学习文档到位。

---

## 5. 模板

> 新建工单/ADR 时,复制下面对应模板到 `docs/changes/` 或 `docs/decisions/`,
> 文件名用数字前缀 + slug(如 `0001-replace-wechat-login.md`)。

### 5.1 功能工单模板(`docs/changes/NNNN-*.md`)

```markdown
# [NNNN] <功能标题>

## 元信息
- 状态: TODO | IN_PROGRESS | DONE
- 分支: feature/<slug>
- 关联 ADR: docs/decisions/NNNN-*.md
- 依赖: 无 | 依赖 [功能 NNNN]

## 目标 (What & Why)
一句话目标 + 为什么做。

## 现状/背景 (写给"冷启动 AI / subagent"看)
当前怎么工作的、涉及哪些文件、关键数据怎么流的。

## 验收标准 (Definition of Done)
- [ ] 功能能正常运行
- [ ] 关键路径测试全绿
- [ ] api-contract.md 已更新(如涉及接口)
- [ ] ADR 已写(如有决策)

## 工单清单 (每步一个测试门)
- [ ] 步骤1: ...  —— TODO
- [ ] 步骤2: ...  —— TODO
状态标记: TODO / IN_PROGRESS(~) / CODE_DONE / TESTED

## 变更记录 (追加式,不删)
- MM-DD: ...

## ⭐ 交接:给下一个窗口的话
当前在第几步、已完成什么、下一步做什么、**别碰哪些文件**、验证命令是什么。
```

### 5.2 ADR 模板(`docs/decisions/NNNN-*.md`)

```markdown
# ADR-NNNN: <决策标题>

## 状态: 提议中 | 已采纳(YYYY-MM-DD)

## 背景
为什么需要做这个决策。

## 方案对比
| 方案 | 优点 | 缺点 |
|---|---|---|
| 方案A | ... | ... |
| 方案B | ... | ... |

## 决策
选哪个,为什么。

## Trade-off / 后果
放弃了什么,换来了什么,需要额外补什么。

## 💡 面试要点
- 这个决策背后的核心概念(可能被怎么问)
```

---

## 6. 快速参考

- **新窗口指路模板**:
  > "继续 feature NNNN。按铁律 1,先读 `docs/changes/NNNN-*.md`,复述当前状态和
  > 下一步,先别写代码。"
- **常用命令**(本机环境:JDK17=D:\Program\hspjdk17,Maven=D:\CQWM2\.tools\apache-maven-3.9.9):
  - 起 Redis: `docker start sky-redis`(首次已用 `docker run -d -p 6379:6379 --name sky-redis redis` 建好)
  - 后端构建: `& 'D:\CQWM2\.tools\apache-maven-3.9.9\bin\mvn.cmd' -f 'D:\CQWM2\sky-take-out\pom.xml' clean package -DskipTests`
  - 后端启动: `& 'D:\Program\hspjdk17\bin\java.exe' -jar 'D:\CQWM2\sky-take-out\sky-server\target\sky-server-1.0-SNAPSHOT.jar'`
  - knife4j 接口文档: http://localhost:8080/doc.html
  - 前端启动: 在 `project-sky-admin-vue-ts` 下 `$env:NODE_OPTIONS='--openssl-legacy-provider'; npm run serve`(http://localhost:8888)
  - 登录冒烟: `curl -s -X POST http://localhost:8080/admin/employee/login -H "Content-Type: application/json" -d '{\"username\":\"admin\",\"password\":\"123456\"}'`
```
