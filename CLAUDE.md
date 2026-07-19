# CQWM2 —— 苍穹外卖学习改造项目

> 这份文件每个新窗口开机自动加载。它是本项目的"宪法":定义我们怎么协作、
> 铁律有哪些、文档放在哪。**详细操作手册见 [docs/WORKFLOW.md](docs/WORKFLOW.md)。**

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

- **Phase**:Phase 3 执行中(功能 0001「C 端认证改造」)。**步骤 1–4 已 TESTED 并提交——后端认证改造完成**:全站统一 Spring Security + 单套 JWT(`/admin/**`=ADMIN、`/user/**`=USER、401/403);admin+C 端均 BCrypt;旧手写拦截器与双 secret 已清除。回归+授权门全绿。
- **下一步**:**步骤5(admin 前端改 `Authorization: Bearer` 头)+ 步骤6(最小 C 端 Vue3+Vite)可并行**,然后步骤7 冒烟收尾。详见工单交接段。
- **进行中的功能工单**:0001(`docs/changes/0001-*.md`,状态 IN_PROGRESS;分支 `feature/cend-auth-jwt`;ADR 含 Addendum;契约 `docs/api-contract/*`)。
- **git**:在 `feature/cend-auth-jwt`(未合 main);构建前先停后端 jar;本机 MySQL 5.7 客户端连库需 `--ssl-mode=DISABLED`(详见工单交接段「验证命令」)。冒烟基线 `docs/smoke-tests.md`。

> 本节是**当前快照**,只写"现在":**覆盖式更新**(改写这几行,不往下追加历史),
> 永远保持这个长度。完成了什么、里程碑历史,看 `git log` 和 `docs/changes/` 里的
> 已完成工单,不写进这里。

## 四、铁律(每个窗口都必须遵守)

1. **开工前先读状态、先复述、后动手**:动任何代码前,先读对应的
   `docs/changes/NNNN-*.md` 的「交接段」和清单,并向我复述"当前在哪一步 / 下一步
   做什么 / 打算改哪些文件 / 怎么验证",**我确认后才动手**。
2. **提交粒度**:一步一 commit,一功能一分支(`feature/xxx`),一功能一次合并。
3. **契约优先(contract-first)**:全栈功能先在 `docs/api-contract.md` 定死接口契约,
   再实现;契约定死后前后端才可并行。
4. **完成的定义(DoD)**:代码 + 测试 + 相关文档 + ADR 全部更新,才算 `DONE`。
   文档更新不是事后补,是"完成"的一部分。
5. **收工前更新交接段**:每个窗口结束前,更新对应 `docs/changes/NNNN` 的「交接段」
   （当前在哪 / 下一步 / 别碰什么 / 验证命令）。
6. **决策必留痕**:带设计决策的改动必须写 ADR(`docs/decisions/NNNN-*.md`),
   含方案对比、决策理由、trade-off、面试要点。
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
| `docs/WORKFLOW.md` | 流程 | 5 阶段操作手册 + 模板(proto-skill) |
| `docs/BACKEND_OVERVIEW.md` | 派生 | backend-scan 产出的架构总览,里程碑再生 |
| `docs/api-contract.md` | 源头 | 前后端接口契约 |
| `docs/changes/NNNN-*.md` | 源头/living | 每个功能一份工单,含清单与交接段 |
| `docs/decisions/NNNN-*.md` | 源头/永久 | ADR 决策记录,面试学习资产 |
| `reference/` | 只读 | 参考资料(微信小程序源码等) |

## 六、5 阶段流程(一句话版,详见 WORKFLOW.md)

```
Phase 0 安全网   git + 跑起来 + 关键路径测试(动业务代码前的前提)
Phase 1 理解     backend-scan 产出架构总览(派 subagent 读)
Phase 2 规划     探讨 trade-off → 写 ADR → 拆工单 → 定契约(主窗口,我在环)
Phase 3 执行     一步一 subagent,串行卡测试门;契约定死后前后端可并行
Phase 4 验证学习 跑测试 + 审 diff + 写 ADR/面试笔记
```
