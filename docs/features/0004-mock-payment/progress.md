# [0004] C 端重建③:mock 支付 — Progress(现场笔记)

> 追加式:每个窗口/关键节点追加一条,新的在下。里程碑历史看 `git log`;当前快照看 proposal 交接头。

---

## 2026-07-23 · Phase 2 立项 + 规划

**做了什么**
- 读状态:CLAUDE.md 快照 + blueprint(0004 一句话范围:替微信支付 / 去 openid / payment() 内部同步置已支付 + 调 paySuccess / 退款 mock / 删 PayNotifyController;支付页 + 成功页)+ ADR-0003 D5(0003 落"订单已创建"占位页,0004 用支付页替换)+ 0003 requirement/proposal 接缝。
- 实读后端支付链路:`OrderController.payment`(PUT /user/order/payment)→ `OrderServiceImpl.payment()`(取 openid + 调 `weChatPayUtil.pay`,需真证书,fresh 跑不通)→ 返回微信预支付 5 字段 `OrderPaymentVO`;`paySuccess()` 现成可复用(置待接单/已支付 + 来单提醒);`PayNotifyController` 微信异步回调。
- **实读挖出关键约束**:`weChatPayUtil.refund(...)` 被 3 处调用(`userCancelById`/`rejection`/`cancel`,均取消/拒单流程=0005/管理端)→ 删 `WeChatPayUtil` 会编译失败 → 这是 D4 边界的核心。`WeChatProperties` 仅被 `PayNotifyController`+`WeChatPayUtil` 引用、`sky.wechat` 配置仅经其绑定(grep 实证)→ 可整体删。契约文档说 payment 返回 `estimatedDeliveryTime`、代码却返回微信 5 字段(文档↔代码本就漂移)。
- 派 1 个 Explore subagent 摸 reference 支付交互(保护主窗口上下文):下单→支付页(倒计时+金额+支付方式单选[仅微信]+确认支付)→ `PUT payment {orderNumber,payMethod:1}`,`code===1` 调 `wx.requestPayment`(喂 5 字段)→ 成功页(下单成功+预计送达+返回首页/查看订单);**无 fail/cancel 回调**;orderNumber 走 Vuex、orderId 走 query。
- 向 Tech Lead 复述范围边界(做/不做)+ 5 决策点(D1 mock 方式 / D2 openid / D3 契约 / D4 退款 mock 深度+越界边界 / D5 成功页衔接)→ **全部按推荐拍板**("同意,开始",2026-07-23)。
- 切分支 `feature/0004-mock-payment`;产出并将 commit:Requirement + ADR-0004(五决策)+ 契约校准(payment 段:响应简化为成功 + 订正历史不一致 + mock/幂等/归属注)+ 本 Proposal + progress。

**关键决策(详见 ADR-0004)**
- D1 内部同步(payment 校验后直接 `paySuccess`,不走回调)/ D2 随微信支付移除 openid 读取(`getByOpenId` 登录残留不动)/ D3 响应简化为成功即可 + 删 `OrderPaymentVO` + 订正文档↔代码漂移 / D4 删干净微信基建 + 3 处 refund 换 mock log(**边界:只拆外呼那一行,取消/拒单业务逻辑不动**)/ D5 下单成功→新支付页→payment→成功页(改造 0003 占位页;查看订单禁用=0005;无 fail/cancel 分支)。

**下一步**
- **双路评审**:内审(会话内全新上下文敌对 subagent,实读源码)+ 外审(DeepSeek CLI `~/.claude/tools/deepseek_review.py`)→ 融合修订 Proposal/ADR(记 AD1)→ Tech Lead 复核 → 进 Phase 3 步骤1。

**坑 / 备忘**
- 删 `WeChatPayUtil` 前**必须先**把 3 处 refund 换成 mock,否则编译失败 → 步骤2 内"先换 refund 再删类"。
- `OrderPaymentVO` 删除前 grep 全仓引用(防管理端/其它隐藏引用)。
- `paySuccess` 用 `BaseContext.getCurrentId()` 取单 —— mock 同步调用在有 JWT 的请求线程内有值,复用成立;别把 payment 拆成无认证上下文调用。
- 越权/归属验证任务派 subagent 时,用中性"多用户数据隔离"措辞,避开 Opus cyber 安全过滤(0003 踩过:用"攻击/篡改/伪造"字眼会中止 subagent)。
- `application-dev.yml` 明文商户号 / 证书路径随 `sky.wechat` 删除即消失 —— 顺带记一个"敏感配置不进代码库"面试点。
