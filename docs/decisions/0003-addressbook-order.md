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
- **百度校验 `checkOutOfRange`(`OrderServiceImpl` L562–618)在 fresh 环境根本跑不通**:`application.yml` 的 `sky.baidu.ak` 是假 AK(且 fresh 环境常无外网)→ **第一段店铺地理编码就 `status≠0`、抛"店铺地址解析失败",走不到后面**;此外该方法还有两处死 bug(`JSON.parseObject("result")` 应 parse `userCoordinate` 会 NPE、`"orgin"` 应 `origin`),但正常运行**先**挂在假 AK 上。(归因经内审实读订正:2026-07-22。)
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
| D4 | 下单金额口径 | **信任前端 `amount`**(照 reference)+ 记篡改风险 + 加 `amount>0` 防呆;配送费 ¥6 / `packAmount`=件数 照搬 |
| D5 | 结算页衔接 | 上游接 0002 cart store + "去结算";下游落"订单已创建"占位页,0004 替换 |
| D6 | 地址簿越权 | **0003 顺手修**,**Service 层**归属校验(仿 `setDefault` 注入 userId,不改 Mapper 签名)+ 下单读地址一并校验;独立 commit |

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

**评审补(AD1 拍板)**:虽**不重算**,但在 `submitOrder` 加一条最基本的 **`amount > 0` 防呆**(≤0 抛 `OrderBusinessException`),挡负数 / 零金额脏订单。这**不是重算**(不碰金额口径),只是合法性兜底,成本一行;配一条负例 AC。

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
| **0003 顺手修(选)** | 堵住真实 authz 漏洞(BOLA / OWASP API #1);极好的面试素材;下单读地址也更安全 | 扩后端范围(blueprint 原写只改百度 + 事务);**非一行修**(评审坐实,见下) |
| 记 backlog 另开工单 | 保持 0003 后端最小 | 已知越权漏洞挂着;下次未必回来修 |

### 决策
选 **0003 顺手修**,独立 commit。但**双路评审(AD1)坐实这不是"一行修法",实现要点如下**(原类比 0002 `updateNumberById` 严重低估):

- **归属校验放 Service 层,不改 Mapper 签名**。理由:`AddressBookMapper.getById(Long id)` 是**单参**,`OrderServiceImpl.submitOrder` 也调它 —— 若改签名加 `userId` 参数,`submitOrder` 的调用点**会编译失败**。故:
  - **`getById`**:在 `AddressBookServiceImpl.getById` 取回后比对 `addressBook.getUserId().equals(BaseContext.getCurrentId())`,不符返回空。Mapper 不动。
  - **`update` / `deleteById`**:**先 `setUserId(BaseContext.getCurrentId())`**(delete 则先按 id 取回校验归属再删),再落库。**关键**:userId **只认 `BaseContext`、绝不认请求体** —— 现状 `AddressBookServiceImpl.update` 根本不注入 userId(不像 `setDefault` 就注入了),若照搬"信任 body userId"则是**假修复**(攻击者带受害者 userId 即可篡改)。
- **下单读地址一并校验(Q2 拍板,放步骤 1)**:`submitOrder` 校验 `addressBookId` 属于当前用户,否则拒(现状用户可拿别人 `addressBookId` 下单 —— 次要 IDOR)。此改动落 `OrderServiceImpl`(步骤 1),与地址簿 CRUD 归属(步骤 2,纯 `AddressBookServiceImpl`)**分属两步、互不耦合**。
- **契约口径订正**:原"`userId` 后端忽略 / 前端不必传"对 `POST`(save 已注入)成立;但 `update` / `delete` 的**归属由后端按当前登录用户判定、不认 body 里的 userId** —— 契约补注已相应修正(评审发现的自相矛盾)。

列入 Requirement AC:越权负例**硬验**,且**补一发"乙 token + body 里塞甲的 userId → 甲地址仍不变"**,锁死"只认 BaseContext"。

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

### AD1 — 双路评审发现与处置(2026-07-22,内审:会话内全新上下文红队 subagent + 外审:DeepSeek-v4-pro)
> 按 GOOD.md Phase 2 步骤5,规划稿交内审(会话内全新上下文敌对 subagent,**实读源码**)+ 外审(DeepSeek 异构模型,**只看四份规划文档**)双路敌对评审,融合后修订计划。原决策 D1–D6 结论不变;此处记录发现与处置,作为学习 / 面试资产。**净判定:两路一致 —— 修订前不可进 Phase 3**,问题几乎全集中在 D6 + 两条假绿测试门。

**① 两路收敛(高置信,已改进计划):**
- **D6 不是"一行修法"**(外审标 PLAUSIBLE、内审实读 CONFIRMED):
  - 外审担心"Mapper 加 `user_id` 打死管理端";内审 grep **证伪管理端复用**(admin / 派送不碰 `AddressBookMapper`),却挖出更真的:`getById(Long id)` 单参,`submitOrder:80` 也调它 → **改签名后端不编译**;`update` 的 Service 层**从不注入 userId** → 只在 WHERE 加 `user_id` 会因 `userId=null` **编辑静默失效**,或退化成"信任 body"的**假修复**;且与契约"userId 忽略"**自相矛盾**。→ D6 改为 **Service 层归属校验 + 不改 Mapper 签名 + userId 只认 BaseContext**(见 D6 正文),契约口径订正。
- **越权测试门可能假绿**(外审 + 内审):原用例没锁"甲有 X、乙没 X",也没测"body 伪造 userId"。→ AC / 测试门补前置断言 + `{id:X, userId:甲Id}` 伪造用例。

**② 分歧(内审用源码纠正外审):**
- 外审 [HIGH]「`@Transactional` **自调用**失效」→ 内审**证伪**:`submitOrder` 经 `OrderController → OrderService` 接口代理**外部调用**,非类内自调用,事务生效;业务异常均 `RuntimeException`,默认回滚成立,无需 `rollbackFor`。**D3 论述正确**。(外审的"勿把三写拆成 `this.` 调的 @Transactional 方法"作为实现护栏保留一句。)

**③ 各自独有(补覆盖):**
- **内审独有(实读 CONFIRMED)**:
  - **原子性测试门假绿**:三写 建订单→建明细→**清购物车(末步)**;原注入点"建订单后抛"在清购物车**之前** → "购物车未被清空"**恒真**(有无事务都过),只有"orders 无残留"真正可证伪。→ **注入点挪到清购物车之后 / 三写全部之后**。
  - **`deliveryStatus` / `tablewareStatus` 是 `NOT NULL` 列**,DTO 为可空 `Integer` → 前端漏传 → 显式插 NULL → submit **500**(NOT NULL 的 DEFAULT 只在列被省略时生效)。→ 前端定死默认(`deliveryStatus=1` / `tablewareStatus=1`)+ 契约标"必传非空"+ 步骤5 测试门。
  - **编辑地址可能静默丢默认**(`update` 的 `<if isDefault!=null>`)→ 编辑页**不提交 isDefault**(设默认只走 `/default`),加 AC"编辑默认地址改详情后仍 `isDefault==1`"。
  - **`checkOutOfRange` 归因订正**:真实先挂在假 AK(店铺地理编码 status≠0),走不到 L590 NPE。结论(删)不变,ADR 关键事实已订正。
- **外审独有**:`amount` 无 `>0` 防呆(→ D4 加,拍板)、`@vant/area-data` 体积/懒加载(→ LOW 记档)、重复提交幂等(→ LOW 记档:购物车清空是弱防护,真幂等留将来)。

**④ 拍板(用户,2026-07-22):**
- D6 → **Service 层归属校验**(仿 `setDefault` 注入 userId,不改 Mapper 签名);
- **下单读地址一并做归属校验**(放步骤 1);
- **加 `amount > 0` 后端防呆**(D4)。
- 其余机械修正(测试门注入点、NOT NULL 字段前端定死、编辑不提交 isDefault、越权补 body 伪造用例、归因订正、LOW 记档)一并落入 requirement / proposal。

**评审留痕**:内审 = 会话内全新上下文红队 subagent(实读 `OrderServiceImpl` / `AddressBookMapper(.java/.xml)` / `AddressBookServiceImpl` / `sky.sql` / 前端 `cart.ts` / `router` / `package.json`);外审 = `~/.claude/tools/deepseek_review.py`(`deepseek-v4-pro`)。这是"你如何验证自己的设计"的面试实证 —— **异构双路敌对评审**:收敛处(D6、假绿门)高置信;分歧处(自调用)靠**实读源码**判真伪(外审只有文档,内审能读码,故内审更准);D6 是"看似一行 UPDATE 加条件、实则牵出编译依赖 + 层级 + 假修复 + 契约矛盾"的真实案例。
