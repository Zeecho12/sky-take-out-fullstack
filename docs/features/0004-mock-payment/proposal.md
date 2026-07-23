# [0004] C 端重建③:mock 支付 — Proposal(技术方案)

## 元信息
- 编号: 0004
- 状态: Phase 2 规划完成(Requirement + ADR + 契约校准 + Proposal 已 commit;**双路评审已融合(ADR AD1)**;待 Tech Lead 复核 → Phase 3)
- 分支: feature/0004-mock-payment
- 关联: Requirement → ./requirement.md | Progress → ./progress.md | ADR → ../../decisions/0004-mock-payment.md | 契约 → ../../api-contract/用户端接口.md

## ⭐ 交接头(覆盖式,永远只写"现在")
- **当前**:**Phase 2 规划完成 + 双路评审已融合**。D1–D5 经 Tech Lead 拍板(2026-07-23);**双路评审(内审红队实读源码 + 外审 DeepSeek-v4-pro)已跑完并融合入 ADR AD1**——D1 细化为 **CAS 原子幂等**(采纳外审 HIGH#2,用户选 A)、D4 边界订正为**逐处枚举**(内审 CONFIRMED,防编译失败)、+ pom 依赖删除 / 测试门重挂 / userMapper 清理 / 成功页 orderNumber 透传 / 金额 NOTED / userCancelById IDOR 记 0005。**尚未进入 Phase 3,未写任何业务代码。**
- **下一步**:**Tech Lead 复核融合稿** → 进 Phase 3(按实施清单 3 步,一步一 subagent;主窗口只编排 / 审 diff / 把测试门 / 提交)。
- **别碰**:0005(订单管理:历史 / 详情 / 催单 / 取消 / 再来一单 / 用户中心)的功能实现;`reference/`(只读);后端**除** `OrderServiceImpl`(payment 重写 + 3 处 refund 换 mock)、支付相关待删文件、`application*.yml` 的 `sky.wechat` 块**之外**一律不动;0002/0003 已交付代码**除 `Order/Confirm.vue` 下单落点接线 + `Order/Created.vue` 改造成功页**外不动。
- **怎么验证**:`docker start sky-redis` → 后端 jar(:8080,**构建前先停旧 jar**)→ `PUT /admin/shop/1`(Bearer)初始化店铺 → 前端 `npm --prefix project-sky-user-vue3 run dev`(:5173)。测试账号 `s7v_2268`/`123456`(id=8,openid 为 NULL)。类型门 `npm --prefix project-sky-user-vue3 run type-check` exit 0。MySQL 5.7 连库加 `--ssl-mode=DISABLED`。

## 1. 现状(与本改动相关的技术起点)
> 全局架构见 docs/Backend_scan/BACKEND_OVERVIEW.md;这里只写和 0004 相关的。

**后端(支付链路,0004 改造对象):**
- `controller/user/OrderController.payment`(`PUT /user/order/payment`)→ `OrderService.payment(OrdersPaymentDTO{orderNumber, payMethod})` → 返回 `OrderPaymentVO{nonceStr,paySign,timeStamp,signType,packageStr}`(微信预支付 5 字段,`throws Exception`)。
- `OrderServiceImpl.payment()`(L144):取 `userMapper.getById` 拿 `user.getOpenid()` → 调 `weChatPayUtil.pay(orderNumber, amount, desc, openid)`(需真实商户证书)→ 转 VO。**依赖 openid + 微信证书,fresh 环境跑不通。**
- `OrderServiceImpl.paySuccess(outTradeNo)`(L175):置 `status=待接单(2)` + `pay_status=已支付(1)` + `checkout_time` + WebSocket 来单提醒。**现成可复用**;当前仅被 `PayNotifyController` 调用。
- `controller/notify/PayNotifyController`(`/notify/paySuccess`):微信异步回调,解密后调 `paySuccess`。**0004 删。**
- `utils/WeChatPayUtil`(`pay`/`refund`)+ `properties/WeChatProperties`:微信支付基建。`WeChatProperties` **仅被** `PayNotifyController` + `WeChatPayUtil` 引用(grep 实证);`sky.wechat.*` 配置仅经其 `@ConfigurationProperties` 绑定。**0004 全删。**
- `weChatPayUtil.refund(...)` **3 处调用**:`userCancelById`(L287)、`rejection`(L400)、`cancel`(L432)——取消 / 拒单流程(0005 / 管理端)。删 `WeChatPayUtil` 前必须先把这 3 处换成 mock,否则**编译失败**。

**前端 `project-sky-user-vue3`(0002/0003 交付,可复用):**
- `Order/Confirm.vue`:结算页,下单成功后 `router.push('/order-created')`(L71)——**0004 改成 push 支付页**。
- `Order/Created.vue`:0003 "订单已创建"占位页(读 `route.query.orderNumber/orderAmount`,写着"支付功能即将上线(0004)")——**0004 改造成支付成功页**。
- `api/order.ts`:仅有 `submitOrder`——**0004 补 `payment`**。
- 认证 / 请求基座:`stores/user.ts`(token)、`utils/request.ts`(Bearer 注入 + 401 兜底)、`router/index.ts`(登录门槛)、Vant 全量、`api/` 模块模式——复用。

## 2. 方案总览(选定方案长什么样)
> 为什么这么选见 ADR-0004,此处不重复论证。

- **payment mock(D1+D2+D3;CAS 见 AD1)**:`payment()` 改为——① 按 `getByNumberAndUserId(orderNumber, BaseContext.getCurrentId())` 取单(**null → 拒**"订单不存在/无权限",即存在 + 归属校验);② 调**新增原子方法** `OrderMapper.updateToPaidIfUnpaid(orderNumber, userId)`(`UPDATE orders SET status=2, pay_status=1, checkout_time=now() WHERE number=? AND user_id=? AND pay_status=0`,返回影响行数);③ **影响行数 0 → 拒**(`OrderBusinessException`"该订单已支付",**原子幂等**);**=1 → 推 WebSocket 来单提醒**。删 openid / `userMapper.getById`(字段一并删)/ `weChatPayUtil.pay` / `JSONObject` import。**删 `paySuccess`**(推送逻辑并入 payment,删 `PayNotifyController` 后无其它调用者)。返回值简化:`OrderService.payment` 改 `void`、去 `throws Exception`;`OrderController.payment` 返回 `Result.success()`;**删 `OrderPaymentVO`**(grep 实证仅 3 文件 + 类本身引用,无管理端/无 test)。`payment()` **不加 `@Transactional`**(原子性由单条 CAS SQL 自身保证)。
- **去微信支付删干净(D4)**:删 `PayNotifyController.java` / `WeChatPayUtil.java` / `WeChatProperties.java` + `application.yml`(`sky.wechat` 映射块)/ `application-dev.yml`(`sky.wechat` 值块)+ `OrderServiceImpl` 的 `weChatPayUtil` 字段 + `import`。
- **退款 mock(D4,边界=只拆外呼;逐处枚举见 AD1)**:三处形态不一,**照"只换一行"会编译失败** —— `userCancelById`(L287)换 1 句 log;`rejection`(L400 赋值 + L406 后继 log)、`cancel`(L432 赋值 + L438 后继 log)各**删 `String refund=...refund(...)` 赋值 + 删/合并后续用到 `refund` 的 log**(每处 2 句),合并成一句 `log.info("模拟退款(mock),订单号:{}", ...)`;**周边状态流转 / 退款状态口径 / 前置校验一字不改**(`rejection`/`cancel` 现状不置 `payStatus=REFUND` 的既有不一致**留 0005**)。
- **前端支付页(D5)**:新增支付页(金额 + 支付方式单选"微信支付(模拟)" + "确认支付"),点击调 `payment({orderNumber, payMethod:1})`,`code===1` 跳成功页,否则 Vant 错误提示不跳。**不做** 15min 倒计时业务。
- **前端成功页(D5)**:`Order/Created.vue` 改造成"下单成功"成功页(返回菜单可用;"查看订单"**禁用 / 占位**,标注 0005)。
- **路由 / 透传(AD1 外审#1 补)**:新增支付页路由;成功页路由沿用 / 更名(Phase 3 定,机械);`orderNumber`/`amount` 沿用 0003 的 **query 透传**(不引新 store)。链路:`Order/Confirm.vue` 下单成功 → push 支付页(带 `orderNumber`/`amount`)→ 支付成功 → push 成功页**继续 query 透传 `orderNumber`(+`amount`)** —— 成功页展示用,并给 0005「查看订单」留钩子(0004 该按钮禁用但订单号已在手,0005 激活时无需回改支付页跳转)。

### 业务时序
**支付主链**:`/menu` 加购 → 结算页 `/order-confirm` "去支付"下单成功(`POST /order/submit` → `orderNumber`)→ **push 支付页**(携 `orderNumber`/`amount`)→ 支付页显示金额 + 支付方式单选 + "确认支付" → 点击 `PUT /order/payment {orderNumber, payMethod:1}` → 后端 `payment()` 校验(存在+归属+未支付)→ `paySuccess`(订单转"待接单 / 已支付" + 来单提醒)→ 返回 `code:1` → **push 支付成功页**("下单成功",返回菜单 / 查看订单禁用)。失败(`code!==1`)→ 错误提示、不跳(对齐 reference)。

### 评审融合要点(实现必须遵守;来源见 ADR AD1)
- **归属校验靠 `getByNumberAndUserId` + CAS 的 `user_id` 条件**:`payment()` 取单必须带当前用户 id(该 Mapper 方法已按 `orderNumber + userId` 过滤),他人订单查不到即拒;CAS 的 `WHERE` 也带 `user_id`——**不要**改成只按 `orderNumber` 查/更新。
- **CAS 判定靠影响行数,不做 check-then-act**:置位用 `UPDATE ... WHERE pay_status=0` 的**单条原子 SQL**,按返回影响行数(0/1)判成败;**勿**退回"先 `SELECT` 查 `payStatus` 再 `UPDATE`"的两步式(竞态,评审 HIGH#2 的病根)。
- **`payment` 依赖 `BaseContext`**:mock 同步调用在有 JWT 的请求线程内,`BaseContext.getCurrentId()` 有值 → 成立;**勿把 `payment` 拆成异步 / 无认证上下文调用**(否则取不到 userId)。
- **删 `WeChatPayUtil` 前先换 3 处 refund(逐处枚举,见 §2)**:否则编译失败(步骤内先换 refund 再删类)。
- **`OrderPaymentVO` 删除前 grep 全仓引用**(AD1 内审实证仅 3 文件 + 类本身,无管理端 / test)。
- **`sky.wechat` 配置 + pom 依赖删除前确认解绑**:删 `WeChatProperties` 类后配置块才无主;pom `wechatpay-apache-httpclient` 删类后成孤儿,一并删。

### LOW / backlog(记档,0004 不深做)
- **真实第三方支付集成**(北美栈 Stripe/PayPal:PaymentIntent + webhook + 幂等 + 验签)→ epic 外 backlog。
- **支付幂等**:0004 已用**数据库层 CAS**(`WHERE pay_status=0`)做单节点原子幂等(AD1);分布式去重键 / 完整状态机 / **支付超时倒计时业务** → 0005 或将来。
- **`rejection`/`cancel` 的 `payStatus=REFUND` 口径不一致** → 0005 处置。
- **`userCancelById` 越权(AD1 外审#4,NOTED)**:用 `orderMapper.getById(id)`、无 `user_id` 归属 → 潜在 IDOR;**0004 不修**(D4 边界),记 **0005**「用户订单管理」一并修(仿 0003 D6)。
- **支付页金额 query 可篡改(AD1 外审#3,NOTED)**:仅展示、无安全影响(后端不信任前端金额);生产应从后端订单详情取金额。
- **微信登录残留**(`UserMapper.getByOpenId` 等)→ 认证域另议。
- **敏感配置治理**(密钥管理 / 环境变量)→ 面试点,不落地。

## 3. 会动的关键文件

**后端 `sky-take-out/`:**
- `sky-server/.../service/impl/OrderServiceImpl.java` —— payment() 重写(D1+D2+D3:去 openid / 去 `pay` / 校验存在+归属 / 原子 CAS 置位 + 推送 / 简化返回)+ **删 `paySuccess` 方法**(推送并入 payment)+ 删 `userMapper` 字段 + `weChatPayUtil` 字段 + `JSONObject`/import;3 处 `refund` → mock log(D4,逐处枚举见 §2)。【步骤1 + 步骤2】
- `sky-server/.../service/OrderService.java` —— `payment` 签名改 `void`(去 `throws Exception`)+ **删 `paySuccess` 接口方法** + 删 `OrderPaymentVO` import。【步骤1】
- `sky-server/.../mapper/OrderMapper.java` + `sky-server/src/main/resources/mapper/OrderMapper.xml` —— **新增原子方法** `updateToPaidIfUnpaid`(条件 `WHERE ... AND pay_status=0` 的 CAS UPDATE,返回影响行数;命名 Phase 3 定)。【步骤1】
- `sky-server/.../controller/user/OrderController.java` —— `payment` 返回 `Result.success()`(去 `Result<OrderPaymentVO>` / 去 `throws Exception`)+ 删 import。【步骤1】
- `sky-pojo/.../vo/OrderPaymentVO.java` —— **删**(grep 确认仅支付链路引用)。【步骤1】
- `sky-server/.../controller/notify/PayNotifyController.java` —— **删**。【步骤2】
- `sky-common/.../utils/WeChatPayUtil.java` —— **删**。【步骤2】
- `sky-common/.../properties/WeChatProperties.java` —— **删**。【步骤2】
- `sky-server/src/main/resources/application.yml` —— 删 `sky.wechat` 映射块(L47–56)。【步骤2】
- `sky-server/src/main/resources/application-dev.yml` —— 删 `sky.wechat` 值块(L19–28,含明文商户号 / 证书路径)。【步骤2】
- `sky-take-out/pom.xml`(L121–122)+ `sky-take-out/sky-common/pom.xml`(L49–50)—— **删** `wechatpay-apache-httpclient` 依赖(删类后成孤儿;grep 门抓不到,须显式删)(AD1 内审)。【步骤2】

**前端 `project-sky-user-vue3/`:**
- `src/api/order.ts` —— 补 `payment(data)` → `PUT /user/order/payment`。【步骤3】
- `src/types/business.ts`(或就近)—— 增 `OrdersPaymentDTO` 类型(如需)。【步骤3】
- `src/views/Order/Pay.vue` —— **新增**支付页(金额 + 支付方式单选 + 确认支付)。【步骤3】
- `src/views/Order/Created.vue` —— 改造成支付成功页(重命名为 `Success.vue` 或原地改造,Phase 3 定;"下单成功" + 返回菜单 + 查看订单禁用)。【步骤3】
- `src/router/index.ts` —— 新增支付页路由 + 成功页路由(登录门槛);沿用 / 更名 `/order-created`(机械,Phase 3 定)。【步骤3】
- `src/views/Order/Confirm.vue` —— 下单成功 `router.push` 落点从占位页改成支付页(携 `orderNumber`/`amount`)。【步骤3】

## 4. 实施清单(每步一个测试门;测试门为**可证伪断言**,非肉眼)—— 活文档,状态就地翻
> 依赖:1→2(步骤2 删 `WeChatPayUtil` 前,步骤1 已让 payment 不再用它;3 处 refund 换 mock 在步骤2 内一并做)。3 依赖后端 payment 契约锁定(步骤1),但**契约已定死** → 前端可与后端并行开发,联调需步骤1 jar。单人串行推进顺序:1→2→3。
> 状态标记:TODO / IN_PROGRESS(~) / CODE_DONE / TESTED。
> 前置(联调步骤都需):Redis 起 + 后端 jar 跑 + `PUT /admin/shop/1`(Bearer)初始化。**后端步骤改前先停旧 jar、改后重建**。冗长验证(端到端网络日志 / DB 断言 / 外呼监测)交**独立 verifier subagent**跑,回浓缩结论(铁律 8)。**Phase 3 每步派 subagent 实现(读文件 + 写码),主窗口只编排 / 审 diff / 把测试门 / 提交。**

- [ ] **步骤1(后端)**:payment mock 重写 —— 去 openid(D2)+ 去微信 `pay`(D1)+ 校验(存在+归属)+ **原子 CAS 置位**(D1/AD1)+ 删 `paySuccess` + 简化返回 / 删 `OrderPaymentVO`(D3)  [依赖: 无]
      实现:`OrderMapper` 新增 `updateToPaidIfUnpaid`(条件 CAS UPDATE,见 §2);`OrderServiceImpl.payment` 改为"取单校验存在+归属 → CAS → 影响行数 0 拒/1 推送"(见 §2);**删 `paySuccess`(接口 + 实现)**、`userMapper` 字段、`JSONObject` import、payment 里 openid/`weChatPayUtil.pay`;`OrderService.payment`→`void` 去 `throws`;`OrderController.payment`→`Result.success()`;删 `OrderPaymentVO`(**先 grep 全仓引用**,AD1 内审实证仅 3 文件 + 类本身)。**注意**:`weChatPayUtil` 字段此步暂留(3 处 refund 还在用),步骤2 再删。
      测试门(curl + DB 硬验,交 verifier):① 正例:登录(`s7v_2268`,openid NULL)→ 下单得 `orderNumber`(DB `status=1/pay_status=0`)→ `PUT /order/payment {orderNumber,payMethod:1}` 断言 `code:1`;DB 该单 **`status=2 / pay_status=1 / checkout_time` 非空**。② 去 openid:同上账号成功即证(改前 null openid 必失败)。③ **重复支付(原子幂等)**:对已支付单再打 → **拒**"该订单已支付"、状态不变、**不重复推来单提醒**(CAS 影响行数 0)。④ 归属:乙 token 打甲 `orderNumber` → **拒 / 查无此单**(getByNumberAndUserId 返 null)、甲单不变。
- [ ] **步骤2(后端)**:去微信支付删干净(D4)—— 删 `PayNotifyController`/`WeChatPayUtil`/`WeChatProperties`/`sky.wechat` 配置 + pom 依赖 + 3 处 refund 换 mock  [依赖: 1]
      实现:先把 3 处 refund 换 mock(**逐处枚举,见 §2**:`userCancelById` 换 1 句;`rejection`/`cancel` 各删 `String refund=...` 赋值 + 后继 `log.info(..., refund)`,合并成一句 mock log —— **周边逻辑 / 前置校验不动**),再删 `OrderServiceImpl` 的 `weChatPayUtil` 字段 + import,再删三个类文件 + 两处 `sky.wechat` 配置块,最后删两处 pom 的 `wechatpay-apache-httpclient` 依赖。
      测试门:① 编译:`mvn` 构建**通过**、jar 正常启动(证配置无残留引用、`@ConfigurationProperties` 解绑干净)。② 退款 mock(**主证据:grep 归零 + 日志 + 订单状态**;AD1 内审——"无外呼"删类后近恒真、降为辅助):已支付订单走用户取消 `PUT /user/order/cancel/{id}`(订单 mock 支付后为 `待接单` → 命中退款分支)→ 流程成功、**订单转 `已取消`(DB 查)** + **日志见"模拟退款"**;取消/拒单**既有状态口径不变**。③ grep 归零(主门):全仓(**排除 docs/**)`WeChatPayUtil`/`WeChatProperties`/`PayNotifyController`/`sky.wechat`/`weChatPayUtil.pay`/`.refund`/`wechatpay-apache-httpclient` → **0 命中**。
- [ ] **步骤3(前端)**:支付页 + 成功页改造 + 接线  [依赖: 1(契约锁定,可并行开发;联调需步骤1 jar)]
      实现:`api/order.ts` 补 `payment`;新增 `Order/Pay.vue`(金额 + 支付方式单选 + 确认支付 → `payment` → `code===1` 跳成功页**并 query 透传 `orderNumber`(+`amount`)** / 否则错误提示不跳);`Order/Created.vue` 改造成成功页("下单成功" + 返回菜单 + **查看订单禁用/占位**,标注 0005;成功页读 query `orderNumber` 备 0005 用,AD1 外审#1);路由新增支付页 + 成功页(登录门槛);`Order/Confirm.vue` 下单成功 push 支付页(带 `orderNumber`/`amount`)。提交体**定死** `payMethod=1`。**防双击**:确认支付按钮加 `submitting` 守卫(沿用 0003 Confirm 风格;真原子幂等已由后端 CAS 兜底)。
      测试门(端到端 preview + `preview_network`,交 verifier):① 落点改造:加购 → 结算"去支付"下单成功 → **进支付页(不再直接落占位)**,金额与结算页一致(`preview_network` 证跳转 + 金额)。② 确认支付 → 成功页:点"确认支付"发 `PUT /order/payment`(body `orderNumber`+`payMethod` 齐全)→ `code:1` → 落成功页"下单成功";DB 查订单 `status=2/pay_status=1`。③ 成功页:"返回菜单"跳 `/menu`;**"查看订单"禁用 / 点击不跳无报错**。④ 端到端:加购→下单→支付→成功页 全通。⑤ 负例:后端返回 `code!==1` → 前端错误提示、**不跳成功页**。⑥ 回归:`type-check` exit 0 + 0002 `/menu` / 0003 `/order-confirm` 正常。

> 说明:契约已定死(0004 校准补注),本功能是"前端对既有 + 改造后端 + 后端 payment 重写 + 去微信删干净"。测试门刻意做成**可证伪绝对断言 + 工具核对**(curl / preview_network / DB 查 / 外呼监测 / grep 归零),不留肉眼判定空间(沿用 0002/0003 教训)。
