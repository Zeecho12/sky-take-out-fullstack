# C 端完整重建 —— 蓝图 / 路线图 (Blueprint / Roadmap)

> **备忘录性质**。这是「重做 C 端」这个大工程(epic)的**前瞻路线图**,只记
> "拆成哪几个 feature、什么顺序、各自一句话范围、当前到哪"。方法论按 feature 组织
> (GOOD.md),没有 epic 这一层;CLAUDE.md「当前进度」刻意只写"现在"——本文件补的是
> 二者之间缺失的**跨 feature 前瞻视图**。
>
> **纪律(务必遵守,否则会文档漂移)**:
> 1. 每个 feature **只写一行**;详细范围 / 验收标准以各自 `features/NNNN-*/requirement.md`
>    为**真相源**,本文件**不重抄**。
> 2. 「状态」列**覆盖式更新**,不追加历史(历史看 `git log` 与各 `progress.md`)。
> 3. **里程碑再更新**,不逐次维护——本文件是**索引 + 顺序备忘**,不是源头文档。
> 4. 当前聚焦哪一步看 `CLAUDE.md`「当前进度」;为什么这么选看各 feature 的 ADR。

---

## 背景

"重做 C 端" = 照 `reference/` 的微信小程序,把 C 端 Web(`project-sky-user-vue3`)
**端到端重建**,业务行为与 reference **完全一致**,UI 只保最低标准(能跑就行);并把
微信特定实现替换掉——微信登录已在 0001 换成账密 + JWT,**微信支付本次(0004)换成 mock
并顺手解掉 0001 遗留的 `OrderServiceImpl.payment()` openid 依赖**。

单人在环、**串行推进**:0002 交付合并后再做 0003,依次类推。

## 跨功能已定决策(2026-07-22 拍板;详细论证见各 feature 的 ADR)

- **UI 方案**:引入 **Vant**(移动端组件库,开箱即用省 CSS)→ 详见 0002 ADR。
- **登录门槛**:**整站登录后可用**(照 reference);后端 `SecurityConfig` 白名单不动 → 详见 0002 ADR。
- **后端策略**:**改造复用**,不新增业务端点(8 个 `controller/user/*` 已全部就位)。
- **契约来源**:**校准**现有 `docs/api-contract/用户端接口.md`(YAPI 导出);认证头统一 `Authorization: Bearer`;
  reference 里的堂食扫码点餐接口 out of scope。
- **认证**:复用 0001(账密 + JWT + Spring Security + Bearer),**不新做**。
- **媒体资源(商品图片)**:**不接阿里云**(现在与将来都不用);当前一律用占位图 `Dummy.png`;将来升级走 **AWS S3**(epic 外 backlog,用户待学 AWS)→ 详见 0002 ADR D3。

## Feature 路线图

| 编号 | 名称 | 一句话范围 | 依赖 | 后端是否改 | 状态 |
|---|---|---|---|---|---|
| 0002 | 商品浏览 + 购物车 | 店铺状态 / 分类 / 菜品(含口味规格)/ 套餐(含含菜)/ 购物车增删查清 + 点餐首页;引 Vant + 整站登录门槛 | 0001 | 是(仅 1 行 bugfix) | 已交付(合并 main `df53f0b`,2026-07-22) |
| 0003 | 地址簿 + 下单 | 地址簿 CRUD(三级省市区)+ 结算页 + 备注;后端去百度配送校验 + `submitOrder` 补 `@Transactional` + 地址簿越权修复(Service 层) | 0002 | 是 | 已交付(合并 main `3365f69`,2026-07-23) |
| 0004 | mock 支付 | 替微信支付(`payment()` 内部同步 + 原子 CAS 幂等)/ 去 openid / 删微信基建(类+配置+pom)+ 退款 mock;支付页 + 成功页 | 0003 | 是 | 已交付(合并 main `b08bf8e`,2026-07-23) |
| 0005 | 订单管理 | 历史订单(3 tab + 无限滚动)/ 详情 / 催单 / 再来一单 / 取消 / 用户中心;后端修 4 处订单越权(IDOR)+ 统一退款口径 | 0004 | **是**(4 处归属校验 + 退款口径,越界补管理端 rejection/cancel) | 规划中(Phase 2 完成待执行) |

> 状态取值:`未开始` / `规划中`(Phase 2) / `执行中`(Phase 3) / `已交付`(合并回 main、DoD 全绿)。

## 时间线(粗粒度备忘)

- **2026-07-22**:epic 立项;完成现状盘点(reference 行为 + 现有前后端);拍板 4-feature 切分
  + 跨功能决策(Vant / 整站门槛 / 改造复用 / 复用 0001 认证);启动 **0002 规划(Phase 2)**。
- **2026-07-22**:**0002「商品浏览 + 购物车」交付并合并回 main**(merge `df53f0b`,DoD 全绿);
  epic 推进焦点转向 **0003「地址簿 + 下单」**(下一个开工的 feature)。
- **2026-07-22**:**0003「地址簿 + 下单」Phase 2(规划)完成**(分支 `feature/0003-addressbook-order`):
  Requirement + ADR-0003 六决策 + 契约校准 + Proposal(5 步)已定;双路评审(内审红队实读源码 +
  外审 DeepSeek-v4-pro)融合入 ADR AD1(D6 越权修复由"Mapper 一行"纠正为 Service 层归属)。待进 Phase 3。
- **2026-07-23**:**0003「地址簿 + 下单」交付并合并回 main**(merge `3365f69`,`--no-ff` 保留 Phase 3 五步粒度;
  DoD 全绿:后端去百度 + 事务原子性 + 下单读地址归属 + amount 防呆 + 地址簿越权修复,前端地址簿 CRUD +
  结算下单端到端)。epic 推进焦点转向 **0004「mock 支付」**(下一个开工的 feature)。
- **2026-07-23**:**0004「mock 支付」立项 + Phase 2 规划 + 双路评审融合**(分支 `feature/0004-mock-payment`):D1–D5 经 Tech Lead 拍板
  (D1 内部同步 / D2 去 openid / D3 响应简化+订正文档漂移 / D4 删微信基建+refund 换 mock,边界只拆外呼 / D5 支付页+成功页替占位);
  Requirement + ADR-0004 五决策 + 契约校准(payment 段)+ Proposal(3 步)已产出。**双路评审(内审红队实读源码 + 外审 DeepSeek-v4-pro)已融合入 AD1**:
  D1 细化为 CAS 原子幂等(采纳外审 HIGH#2,用户选 A)、D4 边界订正为逐处枚举(内审防编译失败)。待 Tech Lead 复核 → Phase 3。
- **2026-07-23**:**0004「mock 支付」交付并合并回 main**(merge `b08bf8e`,`--no-ff` 保留 Phase 3 三步粒度;DoD 全绿):后端 payment CAS 内部同步 mock(去 openid/微信 pay)+ 去微信基建删干净(类+配置+pom)+ 3 处 refund 换 mock;前端支付页 + 成功页 + 接线。执行期边界订正:`PayNotifyController` 删除由步骤2 提前到步骤1(paySuccess 唯一调用者,Tech Lead 拍板)。epic 推进焦点转向 **0005「订单管理」**(下一个开工的 feature;含 `userCancelById` IDOR + `rejection`/`cancel` 的 `payStatus=REFUND` 口径不一致两笔 backlog)。**C 端重建 epic 仅剩 0005**。
- **2026-07-23**:**0005「订单管理」立项 + Phase 2 规划 + 双路评审融合 + Tech Lead 复核通过**(分支 `feature/0005-order-manage`,规划提交 `947ca28`):Requirement + ADR-0005 五决策(D1 订单越权 4 处全修 Service 层 / D2 退款口径三处统一置 REFUND、越界补管理端 / D3 历史订单 3 tab+van-list / D4 三页三路由+Menu「我的」入口 / D5 用户中心纯导航壳)+ 契约校准 + Proposal(6 步)已定。**双路评审(内审实读 + 外审 DeepSeek-v4-pro)融合入 AD1**:2 HIGH 必修订正(`details()` 与管理端共用 → 归属改走新增 user-only `getUserOrderDetail`;`historyOrders` 参数名 `pageNum` 非 `page`)+ Q1 再来一单合并不清空 / Q2 保持 3 tab / Q3 催单加 `status==2` 守卫。**实读发现越权是一整片 4 处(非 blueprint 原记的 1 笔)、后端确会改(订正本表原"否")**。待进 Phase 3。**0005 = C 端重建 epic 收官功能。**
