# [0003] C 端重建②:地址簿 + 下单 — Progress(现场笔记)

> 追加式:每个窗口/关键节点追加一条,新的在下。里程碑历史看 `git log`;当前快照看 proposal 交接头。

---

## 2026-07-22 · Phase 2 立项 + 规划

**做了什么**
- 读状态:blueprint(epic 路线图,0003 边界=地址簿 CRUD + 结算下单;支付属 0004、订单历史属 0005)、0002 全套文档(requirement/proposal/ADR,沿用其可证伪测试门风格)、现有用户端接口契约。
- 派 2 个 Explore subagent 摸底(保护主窗口上下文):
  - **后端**:AddressBook 7 接口 + 实体字段(sex String / isDefault Integer / 省市区六字段)全部就位;`submitOrder` **无 `@Transactional`**(三写非原子);百度校验 `checkOutOfRange`(L562–618)**本身已坏**(`JSON.parseObject("result")` NPE + `"orgin"` 拼错 + 需真 AK)→ fresh 环境 submit 跑不通;地址簿 `getById/update/deleteById` **越权(IDOR)**,只按 id 无 user_id。
  - **reference 小程序**:地址簿列表 + 新增/编辑同页;**省市区 100% 客户端静态数据、无 API**;结算页读服务端购物车、**submit 不带明细**、前端算 amount(含写死配送费 ¥6 + packAmount=件数)、下单成功跳支付页。
- 向 Tech Lead 复述范围边界 + Requirement 拆法 + 6 个决策点;**全部按推荐拍板**(T3 档位、D4 信任前端 amount+记风险、D6 越权顺手修独立 commit、D5 占位落点)。
- 产出并 commit:Requirement 基线(`9070a46`)、ADR-0003 六决策(`9070a46`)、用户端接口契约「0003 校准补注」(`d440730`)、本 Proposal + progress(本次)。

**关键决策(详见 ADR-0003)**
- D1 `van-area`+`@vant/area-data` / D2 删百度校验 / D3 submitOrder `@Transactional` / D4 信任前端 amount(price-integrity 风险记档)/ D5 结算页接 0002 cart store + 落"订单已创建"占位页(0004 替换)/ D6 地址簿越权修复(独立 commit)。

**下一步**
- **双路评审**:内审(会话内全新上下文敌对 subagent)+ 外审(DeepSeek CLI `.tools/deepseek_review.py`)→ 融合修订 Proposal/ADR → Tech Lead 拍板 → 进 Phase 3 步骤1。

**坑 / 备忘**
- 后端 `checkOutOfRange` 的两处 live bug 是"外部依赖 + 死代码"双重问题,删除同时能讲清"外部调用不该进事务/下单主链"面试点。
- 原子性测试门要"注入异常"才可证伪(光跑成功路径证明不了回滚),Phase 3 交 verifier subagent 跑并撤注入。

---

## 2026-07-22 · 双路评审融合(Phase 2 收尾)

**做了什么**
- 内审:会话内全新上下文红队 subagent,**实读**后端源码(`OrderServiceImpl`/`AddressBookMapper(.java/.xml)`/`AddressBookServiceImpl`/`sky.sql`/前端 `cart.ts`/`router`/`package.json`)。
- 外审:`~/.claude/tools/deepseek_review.py`(`deepseek-v4-pro`,只喂四份规划文档)。**注**:外审脚本不在仓库 `.tools/`(那里只有 Maven),在用户目录 `~/.claude/tools/`,key 同目录 `deepseek.key`;用户指路后跑通。
- 两路融合(详见 ADR AD1),按拍板修订 requirement/proposal/ADR/契约。

**融合结论(净判定:修订前不可进 Phase 3)**
- **收敛(高置信)**:① D6 **不是一行修法** —— 改 Mapper 签名会让 `submitOrder:80` 编译失败;`update` 现状不注入 userId,只改 WHERE 会静默失效或成假修复;与契约"userId 忽略"矛盾。→ 改 **Service 层归属 + 不改签名 + userId 只认 BaseContext**。② 越权测试门假绿 → 补前置断言 + body 伪造 userId 用例。
- **分歧(内审源码纠正外审)**:外审"`@Transactional` 自调用失效"→ 内审证伪(接口代理外部调用,事务生效,D3 论述正确)。**教训:外审只有文档、内审能读码 → 机制真伪以内审为准**。
- **内审独有**:原子性注入点须在清购物车之后(否则恒真);`deliveryStatus`/`tablewareStatus` NOT NULL 漏传 500;编辑吞默认;归因订正。
- **外审独有**:`amount>0` 防呆(采纳);area-data 体积 / 重复提交(记 LOW)。

**拍板(用户 2026-07-22)**:D6 Service 层归属 / 下单读地址一并校验(步骤1)/ 加 `amount>0`。

**下一步**:Tech Lead 复核融合后计划 → 进 Phase 3 步骤1(每步派 subagent,铁律 8)。
