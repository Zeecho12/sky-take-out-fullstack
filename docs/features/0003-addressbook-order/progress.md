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
