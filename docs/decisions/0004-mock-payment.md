# ADR-0004: C 端重建③(mock 支付)—— 支付链路五决策

## 状态: 已采纳(2026-07-23)

> 关联: Requirement/Proposal/Progress → ../features/0004-mock-payment/ | 契约 → ../api-contract/用户端接口.md | 路线图 → ../blueprint.md
> 定位: 本文件管"**为什么选 A 不选 B**"(广度)。机制深挖见 ../divedeep/(深度);
> **代码现状 / 要改哪些文件见 ../features/0004-mock-payment/proposal.md**,此处不重复。

---

## 背景

0004 是「C 端完整重建」epic 的**第三块**(见 blueprint):把 0003 停在"待付款"的订单真正**付掉**。除实现支付页 / 成功页本身,它要在支付链路上定 5 件事:①mock 支付怎么做、②openid 依赖怎么解、③payment 契约动不动、④退款是否 mock + 去微信支付删多干净、⑤成功页替换 0003 占位页的衔接。功能级动机见 Requirement §1,不重抄。

### 约束这些决策的关键事实(源码 / reference 实证,2026-07-23 实读)
- **现有 `payment()` 依赖微信 + openid**:`OrderServiceImpl.payment()`(L144)取 `user.getOpenid()` 后调 `weChatPayUtil.pay(orderNumber, amount, desc, openid)`,返回微信预支付 5 字段(`OrderPaymentVO{nonceStr,paySign,timeStamp,signType,packageStr}`);`WeChatPayUtil.pay` 需真实商户私钥 / 平台证书(`getClient()` 从 `D:\apiclient_key.pem` 等加载),**fresh 环境跑不通**。
- **0001 已去微信登录 → openid 成坏接缝**:账密 + JWT 用户 `openid` 为 NULL,现有 `payment()` 会把 null openid 传给微信 → 必失败。blueprint 明列"顺手解掉 0001 遗留的 `payment()` openid 依赖"。
- **契约↔代码历史不一致**:`docs/api-contract/用户端接口.md` 的 payment 响应写 `data.estimatedDeliveryTime`,而代码实际返回微信预支付 5 字段——**文档与代码本就对不上**(YAPI 导出与真实实现漂移)。
- **`paySuccess(outTradeNo)` 现成可复用**:置 `status=待接单(2)` + `pay_status=已支付(1)` + `checkout_time` + WebSocket 来单提醒;当前仅被 `PayNotifyController`(微信异步回调)调用。它按 `getByNumberAndUserId(outTradeNo, BaseContext.getCurrentId())` 取单——**在有 JWT 的请求线程里能拿到 userId**(mock 同步调用满足),而原异步回调线程无 JWT(是原实现的潜在坑,随回调删除一并消失)。
- **微信基建引用面已 grep 收敛**:`WeChatProperties` 仅被 `PayNotifyController` + `WeChatPayUtil` 引用;`sky.wechat.*` 配置(`application.yml` L47–56 映射 + `application-dev.yml` L19–28 明文值)仅经 `WeChatProperties` 的 `@ConfigurationProperties` 绑定 → 三者可整体删除。
- **`weChatPayUtil.refund(...)` 有 3 处调用**:`OrderServiceImpl.userCancelById`(L287,用户取消)、`rejection`(L400,管理端拒单)、`cancel`(L432,管理端取消)——均属**取消 / 拒单**流程,是 0005 / 管理端地盘。删 `WeChatPayUtil` 会让这 3 处**编译失败**——这是 D4 边界的核心约束。
- **reference 支付交互(实证)**:结算 → `redirectTo /pages/pay/index`(订单数据存 Vuex,orderId 走 query);支付页 = 倒计时(15min)+ 金额 + 支付方式单选(实际仅"微信支付")+ 确认支付;`PUT /user/order/payment` body `{orderNumber, payMethod:1}`,`code===1` 调 `wx.requestPayment`(喂 5 字段);成功 → `redirectTo /pages/success/index`,成功页 = "下单成功" + "预计送达" + 返回首页 / 查看订单;**无 `wx.requestPayment` 的 fail/cancel 回调**(取消支付前端不处理),仅 `code!==1` 弹 `msg` + 超时走取消订单。

---

## 决策概览
| 编号 | 决策点 | 结论 |
|---|---|---|
| D1 | mock 支付怎么做 | **内部同步**:`payment()` 校验(存在+归属+未支付)后直接调 `paySuccess`,不走任何回调 |
| D2 | openid 依赖怎么解 | **随微信支付一并移除**:删 `payment()` 里 openid 读取;`UserMapper.getByOpenId`(登录残留)不动 |
| D3 | payment 契约动不动 | **响应简化为"成功即可"**(删微信预支付 5 字段 / 删 `OrderPaymentVO`);订正文档↔代码历史不一致 |
| D4 | 退款 mock + 去微信支付 | **删干净**(删 `PayNotifyController`/`WeChatPayUtil`/`WeChatProperties`/`sky.wechat` 配置);3 处 `refund` 换 mock log,**周边业务逻辑一字不改**(边界:只拆外呼那一行) |
| D5 | 成功页衔接 | 下单成功 → **新支付页** → `payment` → **成功页**(改造 0003 占位页);行为对齐 reference;"查看订单"禁用(0005);不做失败/取消分支 |

---

## D1 — mock 支付怎么做:内部同步置已支付 + 调 `paySuccess`

### 方案对比
| 方案 | 优点 | 缺点 |
|---|---|---|
| **内部同步(选)** | 最简;`payment()` 校验后直接 `paySuccess`,一次请求内订单即"已支付";复用现成 `paySuccess`(状态流转 + 来单提醒);fresh 环境必通 | 不体现真实支付的"异步回调"形态(——正是面试对比点) |
| 伪两段式(payment 返假 prepay,前端再打 mock notify) | 更像真实异步回调 | 需**新增** mock notify 端点,违背 blueprint「不新增端点」;纯为拟真造复杂度 |
| 保留微信 `pay()` 接假证书 | 改动小 | 永远跑不通(需真证书);留坏死代码,与"去微信"目标相悖 |

### 决策
选 **内部同步**:`payment()` 先按 `getByNumberAndUserId(orderNumber, currentUserId)` 取单(**同时完成归属校验**,查不到即拒),再校验"未支付"(已支付则拒,弱防呆),然后调 `paySuccess(orderNumber)` 完成"待接单 + 已支付 + 来单提醒"。**核心理由**:blueprint 定的就是"payment() 内部同步置已支付并调 paySuccess";这是学习项目里"用最小代价把链路跑通"的正解,真实异步支付的机制作为面试对比讲清即可(见下)。**不加 `@Transactional`**:`paySuccess` 只有一次 `update` + WebSocket 推送(推送失败不应回滚已支付),无多写原子性诉求。

---

## D2 — openid 依赖怎么解:随微信支付一并移除

### 决策(无需多方案对比,是 D1 的直接推论)
去掉 `weChatPayUtil.pay(...)` 后,`payment()` 里 `User user = userMapper.getById(...)` + `user.getOpenid()` 失去唯一用途 → **一并删除**。这就解了 blueprint 说的"0001 遗留 `payment()` openid 依赖":0001 把微信登录换成账密 + JWT 后,账密用户 openid 为 NULL,旧 `payment()` 必然把 null 传给微信而失败——本决策根治它。

**边界**:`UserMapper.getByOpenId`(微信登录时代按 openid 查用户的 Mapper 方法)是**登录**残留、不在支付链路,**0004 不动**(属认证域,若要清理另开工单)。0004 只解 `payment()` 这一处。

---

## D3 — payment 契约动不动:响应简化为"成功即可" + 订正历史不一致

### 关键事实
- 现有响应 `OrderPaymentVO{nonceStr,paySign,timeStamp,signType,packageStr}` 全是**喂给 `wx.requestPayment` 的微信预支付参数**。我们是 **Web、无 `wx.requestPayment`**,这 5 字段**完全无用**。
- 契约文档写响应是 `data.estimatedDeliveryTime`,与代码返回的 5 字段**本就不一致**(YAPI 导出漂移)。

### 方案对比
| 方案 | 优点 | 缺点 |
|---|---|---|
| **A 响应简化为成功即可(选)** | 前端只需 `code===1` 即跳成功页;删掉无用的微信 VO(`OrderPaymentVO`)彻底"去微信";契约最干净 | 成功页拿不到"预计送达时间"(——用静态文案兜,最低可用) |
| B 对齐 YAPI 文档返回 `estimatedDeliveryTime` | 与原文档一致 + 成功页可显真实送达时间 | 要 `payment` 回读订单字段、扩响应;为一个展示字段增复杂度,偏离"最低可用" |

### 决策
选 **A**:`OrderService.payment` / `OrderController.payment` 返回值简化(服务层 `void` / 控制层 `Result.success()`),**删 `OrderPaymentVO`**(grep 确认仅支付链路引用),`payment()` 不再 `throws Exception`。请求体 `{orderNumber, payMethod}` **保留**(`payMethod=1` 表 mock,订单的 payMethod 已在 0003 submit 时写入,payment 不重复持久化)。契约文档**订正**:响应改为 `{code, data:null, msg}`,并注明"原 `estimatedDeliveryTime` 是 YAPI 文档与代码漂移的历史产物,mock 后统一为成功即可";成功页的"送达时间"用静态文案(最低可用)。

---

## D4 — 退款 mock + 去微信支付:删干净,但边界只到"拆外呼那一行"

### 关键约束
"去微信支付"要删 `WeChatPayUtil`,但它被 3 处 `refund(...)` 调用(`userCancelById`/`rejection`/`cancel`)——**删了这 3 处会编译失败**,而这 3 处属**取消 / 拒单**(0005 / 管理端)。这是"0004 去微信"与"0005 才做订单管理"之间的边界张力。

### 方案对比
| 方案 | 优点 | 缺点 |
|---|---|---|
| **A 删干净 + 3 处 refund 换 mock log(选)** | "去微信支付"彻底(类 / 配置 / 明文证书路径全清);编译通过;取消/拒单**业务逻辑零改动**(只把外呼换成 log);0005 直接在干净地基上做 | 需"越界"碰 `userCancelById`/`rejection`/`cancel` 各**一行**(但不改其语义) |
| B 留 `WeChatPayUtil` 不删,仅 `payment` 不调 `pay` | 改动最小、不碰取消/拒单 | 微信没删干净;留一堆跑不通的死代码(证书加载 / refund),与目标相悖;`WeChatProperties`/明文配置继续留存 |
| C 完全不碰 refund/cancel | 0004 后端最小 | `WeChatPayUtil` 删不掉 → 退回 B |

### 决策
选 **A**,并把**边界写死**:0004 对 `userCancelById`/`rejection`/`cancel` **只做一件事——把 `weChatPayUtil.refund(...)` 这一行外部调用换成 mock(`log.info("模拟退款(mock)...")`)**;这三处**周边的状态流转、退款状态口径一律不动**。特别地:现状 `rejection`/`cancel` **不**置 `payStatus=REFUND`、只有 `userCancelById` 置——这个**既有不一致是 0005 的活,0004 明确不修**(避免 0004 悄悄扩成订单管理)。删除清单:`controller/notify/PayNotifyController.java`、`utils/WeChatPayUtil.java`、`properties/WeChatProperties.java`、`application.yml`/`application-dev.yml` 的 `sky.wechat.*` 块、`OrderServiceImpl` 的 `weChatPayUtil` 字段 + import。

> 用户拍板(2026-07-23):同意 A,接受 0004 越界改 cancel/rejection 的这 3 行(仅拆外呼,不动语义)。

---

## D5 — 成功页衔接:下单成功 → 新支付页 → 成功页(改造占位页)

### 关键事实与选择
- **上游(← 0003)**:`Order/Confirm.vue` 下单成功后现在 `router.push('/order-created')`(占位页)。0004 改成 push 到**支付页**。
- **reference 对齐**:结算 → 支付页(金额 + 支付方式单选 + 确认支付)→ 成功页(下单成功 + 返回首页 / 查看订单);无支付失败/取消分支。

### 方案对比
| 方案 | 优点 | 缺点 |
|---|---|---|
| **插入支付页 + 改造占位页为成功页(选)** | 与 reference 行为一致(下单→支付→成功三段);0003 占位页顺势"转正";衔接清晰 | 新增一个路由 / 页面 |
| 结算页内嵌支付(不跳独立支付页) | 少一个页面 | 偏离 reference;结算/支付职责混在一页 |

### 决策
- **上游**:`Order/Confirm.vue` 下单成功 → push **支付页**(新增,携 `orderNumber` / `amount`,沿用 0003 的 query 透传,不引新 store)。
- **支付页**:显示金额 + 支付方式单选(mock,如"微信支付(模拟)")+ "确认支付";点击 → `PUT /user/order/payment {orderNumber, payMethod:1}` → `code===1` 跳成功页,否则错误提示不跳(对齐 reference `code!==1` 分支)。**不做** 15min 倒计时业务(最低可用)。
- **下游**:把 0003 占位页 [Created.vue](../../../project-sky-user-vue3/src/views/Order/Created.vue) **改造成支付成功页**("下单成功";"返回菜单"可用;**"查看订单"禁用 / 占位**,标注 0005 接管)。
- **失败/取消**:reference 本无 `wx.requestPayment` fail/cancel 回调,mock 顺势不做失败分支。

---

## Trade-off / 后果
> 要改哪些文件、怎么改见 proposal.md;这里只记决策层面的后果。

- **换来**:一条 fresh 环境必通的支付链路(去微信证书 / 去 openid);彻底删掉微信支付基建(含明文商户号 / 证书路径这一安全隐患);与 0003(下单)/0005(订单管理)接缝清晰的支付页 + 成功页。
- **放弃 / 代价**:支付变成"点一下就已支付"的 mock(无真实资金流 / 无异步回调 / 无验签);退款只 log 不落真实退款;成功页无真实送达时间(静态文案)。
- **后续义务 / 遗留**:
  - 真实第三方支付集成(北美栈如 Stripe / PayPal:PaymentIntent + webhook + 幂等 + 验签)→ epic 外 backlog。
  - 支付幂等强化(去重键 / 状态机)、支付超时倒计时业务 → 记档,0005 或将来。
  - `rejection`/`cancel` 的 `payStatus=REFUND` 口径不一致 → **0005** 处置。
  - `UserMapper.getByOpenId` 等微信登录残留 → 认证域另议。

---

## 💡 面试要点(广度卡片)
- **同步 vs 异步支付回调**:真实第三方支付是**异步**——前端下单拿 prepay 参数唤起支付,支付结果由支付平台**异步 webhook / notify** 回调商户后端(因为钱在支付平台侧,结果它说了算;要抗重复投递 / 网络重试)。本项目 mock 成**同步**(payment 内部直接置已支付)是学习简化;能讲清"为什么真实必须异步 + 回调要幂等 + 要验签防伪造"就是加分。
- **支付幂等 / 回调重放**:支付平台的 notify 会**重复投递**,商户必须幂等(按订单状态 / 去重键,处理过就直接回 SUCCESS)。本项目用 `payStatus` 状态检查做**弱幂等**(已支付则拒);真幂等键留将来。
- **去除外部强依赖 → 可测试性 / 可运行性**:把支付(微信证书)、配送(百度 AK,0003)这类外部 API 从主链移除 / mock 化,fresh 环境才能端到端跑通、才好测。这是"依赖注入 + 可替换实现"思想的体现(mock 支付 ≈ 面试常说的 test double)。
- **敏感配置不进代码库**:`application-dev.yml` 里明文 `mchid` / 私钥文件路径 / apiV3Key 是**反面教材**;生产应走环境变量 / 密钥管理(Vault / AWS Secrets Manager),代码库只留占位。0004 删掉它顺带消除这个隐患。
- **订单状态机**:待付款(1)→ 待接单(2)(payStatus 未支付 0 → 已支付 1),支付是状态机的一次合法迁移;非法迁移(如对已支付订单再支付)要挡。能画状态机 + 说清每次迁移的守卫条件是加分。
- **契约与实现漂移**:YAPI 文档说返回 `estimatedDeliveryTime`、代码却返回微信 5 字段——**文档不是真相源、代码才是**。契约优先要求"契约定死后实现对齐",本例是"契约事后校准对齐代码 + mock"的反向订正,提醒 contract-first 的纪律价值。
