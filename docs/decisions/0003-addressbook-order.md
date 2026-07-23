# ADR-0003: C 端重建②(地址簿 + 下单)—— 下单主链六决策

## 状态: 已采纳(2026-07-22)

> 关联: Requirement/Proposal/Progress → ../features/0003-addressbook-order/ | 契约 → ../api-contract/用户端接口.md | 路线图 → ../blueprint.md
> 定位: 本文件管"**为什么选 A 不选 B**"(广度)。机制深挖见 ../divedeep/(深度);
> **代码现状 / 要改哪些文件见 ../features/0003-addressbook-order/proposal.md**,此处不重复。

---

## 背景

0003 是「C 端完整重建」epic 的**第二块**(见 blueprint):把购物车里的东西真正**送出去(下单)**。除实现地址簿 + 结算下单本身,它要在下单主链上定 6 件事:①省市区数据来源、②去百度配送校验的替代、③`submitOrder` 事务边界、④下单金额口径、⑤结算页与上下游(0002 购物车 / 0004 支付)的衔接、⑥顺手堵一个越权漏洞。功能级动机见 Requirement §1,不重抄。

### 约束这些决策的关键事实(源码 / reference 实证)
- **reference 省市区选择 100% 客户端静态数据、无区域 API**:`pages/common/simple-address` + 打包的 `city-data/{province,city,area}.js`,3 列级联 picker。
- **现有前端已 Vant 全量引入**(0002 AD2)→ `van-area` 现成可用,只缺区划数据源。
- **后端 `submitOrder` 无 `@Transactional`**(`OrderServiceImpl.submitOrder`,连 `org.springframework.transaction.annotation.Transactional` 都没 import),三写(`insert orders` → `insertBatch order_detail` → `deleteByUserId shopping_cart`)**非原子**。
- **百度校验 `checkOutOfRange`(`OrderServiceImpl` L562–618)本身已坏**:`JSON.parseObject("result")`(应 parse `userCoordinate`)会 NPE、`map.put("orgin", …)`(应 `origin`)拼错 Baidu 参数,且需真 `sky.baidu.ak` → **fresh 环境下 `submit` 根本跑不通**。
- **reference 下单口径**:**前端算 `amount` 发给后端、后端信任存库**(不重算);**配送费写死 ¥6**、`packAmount = 菜品总件数`;submit body **不带明细**(后端按服务端购物车 + `addressBookId` 派生 `order_detail`)。
- **地址簿越权(IDOR)**:`AddressBookMapper` 的 `getById` / `update` / `deleteById` **只按 `id`、无 `user_id` 归属校验**;`submitOrder` 读地址也走这个 `getById`。
- **上下游边界**:支付页 / 成功页属 0004;历史 / 详情 / 催单等属 0005。

---

## 决策概览
| 编号 | 决策点 | 结论 |
|---|---|---|
| D1 | 省市区数据来源 | **`van-area` + `@vant/area-data`**(客户端静态,无 API) |
| D2 | 去百度配送校验 | **删干净**(删调用 + 删 `checkOutOfRange` + 清 `ak`/`shopAddress` 依赖) |
| D3 | `submitOrder` 事务 | **方法级 `@Transactional`** 包三写;依赖默认 RuntimeException 回滚 |
| D4 | 下单金额口径 | **信任前端 `amount`**(照 reference)+ ADR 记篡改风险;配送费 ¥6 / `packAmount`=件数 照搬 |
| D5 | 结算页衔接 | 上游接 0002 cart store + "去结算";下游落"订单已创建"占位页,0004 替换 |
| D6 | 地址簿越权 | **0003 顺手修**(加 `user_id` 归属校验),独立 bugfix commit |

---

## D1 — 省市区数据来源:`van-area` + `@vant/area-data`

### 方案对比
| 方案 | 优点 | 缺点 |
|---|---|---|
| **`van-area` + `@vant/area-data`(选)** | 契合已引入的 Vant 栈;**一个 npm 包**带全国省市区静态数据,`van-area` 直接渲染级联选择;零手搓 | 多一个数据包(体积);区划数据有更新滞后(学习项目无所谓) |
| 照搬 reference 的静态 `province/city/area.js` | 与 reference 数据完全一致 | 是小程序格式,得改写适配 Vue;不如官方包干净 |
| 调区域 API | 数据实时 | 项目没有该接口;要新增后端 / 引第三方;违背「不新增端点」;reference 本就没用 |

### 决策
选 **`van-area` + `@vant/area-data`**。核心理由:reference 本就是纯客户端静态数据、无 API,`@vant/area-data` 是同一思路的 Vant 官方现成实现,契合 0002 定的 Vant 基座,最省事。产出 `provinceCode/Name`、`cityCode/Name`、`districtCode/Name` 六字段直接喂 addressBook 契约。

---

## D2 — 去百度配送校验:删干净

### 方案对比
| 方案 | 优点 | 缺点 |
|---|---|---|
| **直接删(选)** | 下单主链不再强依赖外部地图 API;删掉本就坏的死代码;fresh 环境 submit 立刻能跑;去掉无用 `ak`/`shopAddress` 配置 | 失去"配送范围"这一业务语义(学习项目不需要真实配送) |
| 保留方法改"永远通过" stub | 改动小、留个扩展位 | 留一段永远为真的死逻辑,误导读者;无实际价值 |
| 换本地轻量校验(假距离) | 保留"范围校验"形态 | 纯造数据、无意义;徒增复杂度 |

### 决策
选 **删干净**:删 `checkOutOfRange` 方法 + `submitOrder` 内的调用 + 相关 `@Value("${sky.baidu.ak}")` / `${sky.shop.address}` 字段(若无他处引用)。**关键依据**:该校验**当前是坏的**(两处 live bug + 需真 AK),等于 fresh 环境下没人能下单成功;它也是本 epic「替换微信 / 外部特定实现」目标的一部分。面试点见下。

> 边界:只动 `submitOrder` 主链上的这段;`OrderServiceImpl` 其它方法(派送 / 完成等)若引用同类逻辑,不在 0003 动(0003 只碰下单)。

---

## D3 — `submitOrder` 事务:方法级 `@Transactional`,默认回滚

### 方案对比
| 方案 | 优点 | 缺点 |
|---|---|---|
| **方法级 `@Transactional`(选)** | 三写(建订单 / 建明细 / 清购物车)原子化,失败整体回滚;声明式、一行注解、最贴学习目标 | 事务期持有连接 / 锁(本项目无外部慢调用——D2 已把百度调用移出,正好) |
| 不加事务(现状) | 无 | 中途失败留脏数据(有订单无明细 / 清了购物车但订单没建);已知隐患 |
| 编程式事务(`TransactionTemplate`) | 控制粒度细 | 学习项目无需;声明式已够 |

### 决策
选 **方法级 `@Transactional`**(`org.springframework.transaction.annotation.Transactional`)包住 `submitOrder`。回滚语义:**Spring 声明式事务默认只对 `RuntimeException`(unchecked)回滚**;项目的 `AddressBookBusinessException` / `OrderBusinessException` / `ShoppingCartBusinessException` 均继承 `RuntimeException`,天然满足,**无需 `rollbackFor`**。边界=读地址 / 读购物车 / 三写全在一个方法事务内。**注意**:D2 先把百度外部调用移出主链,事务里就没有慢的外部 I/O,事务时长可控——两个决策相互成全。

---

## D4 — 下单金额口径:信任前端 `amount`(照 reference)+ 记风险

### 方案对比
| 方案 | 优点 | 缺点 |
|---|---|---|
| **信任前端 `amount`(选)** | 行为与 reference / 现后端完全一致;实现简单;0003 后端零新增业务逻辑 | **前端可篡改金额**(改 `amount` 少付钱)——真实电商绝不可接受 |
| 服务端按购物车重算 | 正确、安全(金额不可篡改) | 偏离 reference;0003 后端范围变大;需重算规则(配送 / 打包口径) |

### 决策
选 **信任前端 `amount`**(照 reference),但**在 ADR / 契约里明确标注这是学习项目的行为对齐、生产不可接受**;服务端重算列为将来增强。配套口径也照 reference:**配送费写死 ¥6**、`packAmount = 菜品总件数`、`amount = Σ(单价×数量) + 6 + packAmount`;`estimatedDeliveryTime` / `deliveryStatus`(立即=1 / 选时间=0)照 reference;submit body **不带明细**(后端按服务端购物车派生)。

> 对比 0002:购物车 `add` **无金额篡改面**(`ShoppingCartDTO` 只有 `{dishId,setmealId,dishFlavor}`,后端自填 amount)。下单 submit **有**篡改面(前端直接送 `amount`)——这个反差本身是很好的面试素材(见下)。

---

## D5 — 结算页衔接:上游接 0002 购物车,下游落占位页(0004 替换)

### 关键事实与选择
- **上游(← 0002)**:0002"去结算"目前是占位 / 打烊置灰。0003 把它接到真实 `/order-confirm` 路由;结算页购物车数据**复用 0002 cart store**(进页面重拉 `shoppingCart/list`,服务端为准);0002 的"打烊置灰去结算"沿用。
- **下游(→ 0004)**:reference 下单成功 → 跳支付页,但**支付是 0004**。

| 下游落点方案 | 优点 | 缺点 |
|---|---|---|
| **落"订单已创建"占位页(选)** | 0003 闭环可验(订单真生成了);0004 直接把占位页换成支付页,接口不变 | 用户暂时不能真支付(0003 范围内本就如此) |
| "去支付"按钮先禁用 | 更"诚实" | 无法验证下单成功后的落地体验;衔接不连贯 |

### 决策
上游**复用 0002 cart store + 接线"去结算"**;下游**落"订单已创建"占位页**(展示 `orderNumber` / `orderAmount`),0004 用支付页替换。这样 0003 自身端到端可验(购物车 → 结算 → 提交 → 订单生成 → 购物车清空),且与 0004 的接缝清晰。

---

## D6 — 地址簿越权(IDOR):0003 顺手修

### 方案对比
| 方案 | 优点 | 缺点 |
|---|---|---|
| **0003 顺手修(选)** | 堵住真实 authz 漏洞(BOLA / OWASP API #1);成本低(Mapper 查询加 `user_id` 条件);极好的面试素材;下单读地址也更安全 | 略微扩后端范围(blueprint 原写只改百度 + 事务) |
| 记 backlog 另开工单 | 保持 0003 后端最小 | 已知越权漏洞挂着;下次未必回来修 |

### 决策
选 **0003 顺手修**,作**独立 bugfix commit**(类比 0002 的 `updateNumberById` 一行修法):给 `getById` / `update` / `deleteById` 的查询 / 更新条件加 `user_id = BaseContext.getCurrentId()` 归属校验,越权访问返回空 / 不生效而非泄露 / 篡改。理由:这是我们本来就要碰的下单主链上的真实安全缺陷,成本低、学习价值高。列入 Requirement AC(越权负例硬验)。

---

## Trade-off / 后果
> 要改哪些文件、怎么改见 proposal.md;这里只记决策层面的后果。

- **换来**:一条能真正跑通的下单主链(去坏的百度校验 + 三写原子化)、契合 Vant 的地址录入、与 0002/0004 接缝清晰的结算页、以及顺带堵住的越权漏洞——都为 0004 支付铺路。
- **放弃 / 代价**:多一个前端数据包(`@vant/area-data`);金额暂时信任前端(生产不可接受,已记风险);配送费 / 打包费沿用 reference 的"非真实"口径。
- **后续义务 / 遗留**:
  - 服务端金额重算(反篡改)→ 将来增强。
  - 真实配送计费 / 营业状态拦截下单 → 未纳入(行为对齐 reference)。
  - `OrderServiceImpl` 其它方法里若有同类百度 / 事务问题 → 各自功能再碰,0003 不越界。

---

## 💡 面试要点(广度卡片)
- **声明式事务回滚规则**:`@Transactional` 默认**只回滚 unchecked 异常(RuntimeException / Error)**,checked 异常默认**不**回滚(需 `rollbackFor`);本项目业务异常都继承 `RuntimeException` 故天然生效。能讲清"为什么下单三写要原子、默认回滚规则、传播行为"是加分。
- **外部调用不该进事务 / 下单主链**:同步调地图 API(慢、可能超时 / 失败)放在事务里会**放大事务时长、长时间持有连接与行锁**;正确做法是把外部调用移出事务(或异步 / 前置校验)。D2 删百度校验恰好把外部 I/O 移出了 D3 的事务——两决策相互成全。
- **IDOR / BOLA(越权)**:按对象 id 查询却不校验 owner,是 **OWASP API Security Top 1**(Broken Object Level Authorization)。修法=查询条件带上当前用户 id。经典面试 / 安全审计点。
- **前端传金额 vs 服务端重算(price integrity)**:**永远不要信任客户端提交的金额**;真实电商在服务端按购物车 + 商品价重算。本项目为对齐 reference 选了信任前端,但能说清"为什么生产必须服务端重算"就是加分(对比 0002 购物车无篡改面)。
- **客户端静态区划数据 vs 区域 API**:静态数据零延迟、离线可用,但更新滞后 + 增体积;高频变化数据才需要接口。

---

## Addendum(执行期细化,追加式)
> 双路评审(内审:会话内全新上下文红队 subagent;外审:DeepSeek CLI)结论、执行期修订将追加于此。当前:待评审。
