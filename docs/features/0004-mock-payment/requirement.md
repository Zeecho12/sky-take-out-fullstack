# [0004] C 端重建③:mock 支付 — Requirement

## 元信息
- 编号: 0004
- 类型: 改造 + 新功能(C 端重建 epic 的第三块,见 `docs/blueprint.md`)
- 档位: T3(全栈:后端改造 + 删代码 + 前端两页 + 契约校准;含 ADR 五决策)
- 状态: 规划中(Phase 2,2026-07-23)
- 关联: Proposal → ./proposal.md | Progress → ./progress.md | ADR → ../../decisions/0004-mock-payment.md | 契约 → ../../api-contract/用户端接口.md

## 1. 背景与动机 (Why)
0003 已让顾客能把购物车"下单"成一笔真实订单(`orders` + `order_detail`),但下单成功后只落到一个"订单已创建"**占位页**([Order/Created.vue](../../../project-sky-user-vue3/src/views/Order/Created.vue)),写着"支付功能即将上线(0004)"——**订单永远停在"待付款"状态,付不了款、进不了后续流程**。0004 补上「浏览 → 下单 → **支付**」链路的最后一环:顾客在支付页确认支付后,订单变为"已支付 / 待接单",并落到支付成功页。

同时 0004 要清理支付链路上的微信历史包袱:①`OrderServiceImpl.payment()` 调 `weChatPayUtil.pay(...)` 走真实微信 JSAPI 支付,**需要真实商户证书**、fresh 环境跑不通;②它还依赖 `user.getOpenid()`——而 0001 已把微信登录换成账密 + JWT,账密用户**没有 openid**,这条依赖是 0001 遗留的坏接缝;③`PayNotifyController`(微信异步回调)+ `WeChatPayUtil` + `WeChatProperties` + `sky.wechat.*` 配置(含明文商户号 / 证书路径)整套微信支付基建都用不上了。0004 用 **mock 支付**替换:内部同步置已支付,去微信、去 openid、删干净微信支付基建。这与 epic「把微信特定实现替换成北美技术栈标准实现」目标一致(呼应 0001 去微信登录、0003 去百度配送)。

## 2. 目标 (What)
做完之后,登录顾客能——
- 下单成功后进入**支付页**:看到订单金额、选支付方式(mock,单选)、点"确认支付";
- 点"确认支付" → 后端**内部同步**把订单置为「已支付 / 待接单」并触发来单提醒 → 前端落到**支付成功页**("下单成功",可返回菜单);
- 用**账密登录的账号**(无 openid)也能正常支付(**不再依赖 openid / 微信证书**)。

后端同时完成:**去微信支付**(删 `PayNotifyController` / `WeChatPayUtil` / `WeChatProperties` / `sky.wechat` 配置)、**退款 mock**(取消 / 拒单流程里的 `weChatPayUtil.refund(...)` 换成 mock,不再外呼微信,行为不变)。

UI 用 Vant,行为对齐 `reference/` 小程序(支付页 / 成功页),最低可用即可。

## 3. 范围 (Scope)

### 做什么 (In Scope)
- **后端 payment 重写(D1+D2+D3)**:`OrderServiceImpl.payment()` 去 `weChatPayUtil.pay` + 去 openid 读取,改为**内部同步**校验订单(存在 + 归属 + 未支付)后调 `paySuccess(orderNumber)`;`payment` 返回值简化(去微信预支付 5 字段,响应只表"成功");随之调整 `OrderService.payment` / `OrderController.payment` 签名 + 删 `OrderPaymentVO`。
- **后端去微信支付删干净(D4)**:删 `controller/notify/PayNotifyController.java`、`utils/WeChatPayUtil.java`、`properties/WeChatProperties.java`;删 `application.yml` / `application-dev.yml` 的 `sky.wechat.*` 配置块(grep 确认仅上述三类引用);删 `OrderServiceImpl` 的 `weChatPayUtil` 字段 + import。
- **后端退款 mock(D4)**:`OrderServiceImpl` 里 3 处 `weChatPayUtil.refund(...)`(`userCancelById` / `rejection` / `cancel`)替换为 mock(`log.info` 记一笔"模拟退款"),**周边取消 / 拒单业务逻辑一字不改**(那是 0005 / 管理端地盘,0004 只拆掉外呼这一行)。
- **前端支付页 + 成功页(D5)**:新增支付页(金额 + 支付方式单选 + "确认支付"→ `PUT /user/order/payment`);把 0003 占位页改造成支付成功页("下单成功",返回菜单;"查看订单"先禁用,0005 接管);`Order/Confirm.vue` 下单成功后的落点从占位页改成**支付页**。
- **前端资产**:`api/order.ts` 补 `payment`;新增支付页 / 成功页组件 + 路由(登录门槛);订单号 / 金额在页面间的透传。
- **契约校准**:把 `docs/api-contract/用户端接口.md` 的「订单支付 PUT /user/order/payment」与 mock 后实际对齐(响应改为成功即可 + 订正原文档 `estimatedDeliveryTime` ↔ 代码返回微信 5 字段的历史不一致 + 标注 mock / 幂等 / 归属语义)。

### 不做什么 (Out of Scope)
- **真实支付 / 真实退款 / 对账 / 验签 / 异步回调**:整套第三方支付集成 out of scope;mock 内部同步完成。
- **订单管理**:历史订单 / 详情 / 催单 / 取消 / 再来一单 / 用户中心 → **0005**。0004 成功页的"查看订单"按钮**先禁用 / 占位**,不实现跳转。
- **取消 / 拒单业务逻辑**:0004 **只把 3 处 refund 外呼换成 mock**,不动取消 / 拒单的状态流转、退款状态口径(现状 `rejection` / `cancel` 不置 `payStatus=REFUND`、只有 `userCancelById` 置——此既有不一致**留给 0005** 处置,0004 不修)。
- **支付幂等强化 / 支付超时倒计时业务**:reference 有 15 分钟支付倒计时 + 超时取消,0004 **不做倒计时业务**(最低可用);重复支付用订单 `payStatus` 状态做**弱防呆**(已支付则拒),真幂等(去重键 / 状态机)留将来记档。
- **支付失败 / 取消支付分支**:reference 本就没有 `wx.requestPayment` 的 fail/cancel 回调,mock 顺势不做失败分支(仅接口 `code!==1` 走通用错误提示)。
- **openid 其它遗留**:`UserMapper.getByOpenId`(0001 微信登录残留)**不在 0004 动**;0004 只解 `payment()` 这一处 openid 依赖。
- **敏感配置治理**:`application-dev.yml` 明文商户号 / 证书路径随 `sky.wechat` 配置一并删除即消失;不额外引入密钥管理方案(ADR 记为面试点)。
- `reference/` 堂食扫码点餐:整个 epic out of scope;`reference/` 只读。

## 4. 验收标准 (Acceptance Criteria)
> 可观测、面向行为、含负例;测试门做成**可证伪断言 + 工具核对**(curl / DB 查 / preview_network),不留肉眼判定空间(沿用 0002/0003 风格)。DoD(流程门)见 CLAUDE.md 铁律 4,此处不重抄。

**A. 支付主链(后端)**
- [ ] **正例 · 内部同步支付**:登录 → 下单得 `orderNumber`(此时 DB `orders.status=1 待付款`、`pay_status=0 未支付`)→ `PUT /user/order/payment` body `{orderNumber, payMethod:1}` → 返回 `code:1`;DB 查该订单 **`status=2 待接单`、`pay_status=1 已支付`、`checkout_time` 非空**。curl + DB 硬验。
- [ ] **正例 · 去 openid**:用**账密注册、openid 为 NULL** 的测试账号(如 `s7v_2268`)完成上一条支付 → **成功**(证不再依赖 openid;改前该路径会因 openid 为空 / 微信证书缺失而失败)。
- [ ] **(负例 · 重复支付防呆)** 对已支付订单再打一次 `PUT /order/payment` → 后端**拒**(`OrderBusinessException`"该订单已支付"),订单状态不变、不重复推来单提醒。curl 硬验。
- [ ] **(负例 · 归属)** 用乙 token 对**甲的 `orderNumber`** 打 `PUT /order/payment` → 后端**拒 / 查无此单**(`getByNumberAndUserId` 按当前用户过滤,查不到 → 拒),不改甲订单。curl 硬验。

**B. 去微信支付 / 退款 mock(后端)**
- [ ] **编译 + 启动**:删 `PayNotifyController` / `WeChatPayUtil` / `WeChatProperties` / `sky.wechat` 配置后,`mvn` 构建**通过**、jar **正常启动**(证配置块无残留引用、`@ConfigurationProperties` 解绑干净)。
- [ ] **退款 mock 不外呼**:走一次会触发退款的路径(如已支付订单用户取消 `PUT /user/order/cancel/{id}`)→ **无对 `api.mch.weixin.qq.com` 的外部请求**、流程正常完成(订单转 `已取消`);日志出现"模拟退款"。(取消 / 拒单的既有状态口径**不变**——仅验证不外呼 + 流程不报错。)
- [ ] **微信基建确无残留**:全仓 grep `WeChatPayUtil` / `WeChatProperties` / `PayNotifyController` / `sky.wechat` → **0 命中**(除文档 / ADR);`weChatPayUtil.pay` / `.refund` 调用点 → **0 命中**。

**C. 支付页 + 成功页(前端)**
- [ ] **落点改造**:`/menu` 加购 → 结算页"去支付"下单成功 → 进入**支付页**(**不再直接落占位页**);支付页显示订单金额 + 支付方式单选(mock)+ "确认支付"。`preview_network` 确认下单后跳支付页、金额与结算页一致。
- [ ] **确认支付 → 成功页**:支付页点"确认支付" → 发 `PUT /user/order/payment`(body `orderNumber` + `payMethod` 齐全)→ `code:1` → 落**支付成功页**("下单成功");`preview_network` 确认请求体 / 响应 + 页面跳转。
- [ ] **成功页**:显示"下单成功"、"返回菜单"可点(跳 `/menu`);**"查看订单"按钮禁用 / 占位**(标注 0005),点击不跳转 / 无报错。
- [ ] **端到端**:加购 → 下单 → 支付 → 成功页,DB 查订单 `status=2 待接单 / pay_status=1 已支付`;返回菜单后再次进入,行为正常。
- [ ] **(负例)** 后端对已支付订单返回错误(`code!==1`)时,前端给出错误提示、**不跳成功页**(对齐 reference 的通用错误 `showModal`)。
- [ ] **回归**:0003 下单主链(结算 → 提交 → 购物车清空)与 0002 菜单页**不受影响**(`type-check` exit 0 + `/menu`、`/order-confirm` 回归)。
