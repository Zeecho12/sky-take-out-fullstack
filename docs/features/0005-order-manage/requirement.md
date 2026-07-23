# [0005] C 端重建④:订单管理 — Requirement

## 元信息
- 编号: 0005
- 类型: 改造 + 新功能(C 端重建 epic 的第四块 = 收官,见 `docs/blueprint.md`)
- 档位: T3(全栈:后端安全/正确性多处修复 + 前端多页 + 契约校准;含 ADR 五决策)
- 状态: 规划中(Phase 2,2026-07-23)
- 关联: Proposal → ./proposal.md | Progress → ./progress.md | ADR → ../../decisions/0005-order-manage.md | 契约 → ../../api-contract/用户端接口.md

## 1. 背景与动机 (Why)
0002→0003→0004 已把 C 端「浏览 → 下单 → 支付」主链跑通:顾客能浏览菜品、加购、填地址结算下单、mock 支付变「已支付/待接单」。但**支付成功后就断了**——[Order/Created.vue](../../../project-sky-user-vue3/src/views/Order/Created.vue) 成功页那个"查看订单"按钮还是 0004 留下的 `disabled` 占位(注释写着"0005 接管"),顾客**看不到自己下过哪些单、看不了详情、不能取消、不能催单、不能再来一单,也没有一个"我的/个人中心"入口**。0005 补上订单生命周期的下半段,给 C 端重建 epic 收官。

同时 0005 要清掉订单相关后端的两类历史欠债(实读 `OrderServiceImpl` 坐实,比 blueprint 记的两笔更宽):
- **越权(IDOR)一整片**:C 端 5 个订单端点里,只有历史订单查询(`pageQueryForUser`)按当前用户过滤;**订单详情 `details`、用户取消 `userCancelById`、再来一单 `repetition`、催单 `reminder` 四处都只按 `id` 取数、无 `user_id` 归属校验** → 用户可拿别人订单 id 看他人订单(泄露地址/电话/收货人)、取消他人订单、把他人订单菜品灌进自己购物车、对他人订单催单。这是 OWASP API Security Top 1(BOLA/IDOR),0004 评审已把 `userCancelById` 记进 0005 backlog,本次实读发现范围更大,**一并按 0003 D6 修法收紧**。
- **退款状态口径不一致**:`userCancelById` 取消待接单(已支付)订单时置 `payStatus=REFUND`,而管理端 `rejection`(拒单)/`cancel`(取消)对已支付订单只 log"模拟退款"、**不置 `payStatus=REFUND`**(且 `cancel` 用字面量 `payStatus==1` 而非 `Orders.PAID`)。同样是"已支付订单被取消要退款",三处口径不一 → 数据不一致。0004 明确留给 0005,本次**统一为三处都置 REFUND**。

## 2. 目标 (What)
做完之后,登录顾客能——
- 从 Menu 顶栏「我的」进入**用户中心**(纯导航壳:显示用户名 + 历史订单/地址管理/修改密码/退出登录导航);
- 进**历史订单**页:按「全部 / 待付款 / 已取消」tab 筛选,触底加载更多,每张卡片看订单号/下单时间/金额/状态/菜品缩略,按状态出「再来一单 / 去支付 / 催单」按钮;
- 点卡片进**订单详情**页:看地址/明细/金额/状态等全字段,按状态出「取消订单 / 立即支付 / 催单 / 再来一单」操作(取消/再来一单/催单带二次确认或结果提示);
- 0004 支付成功页的**「查看订单」激活**,点它进本单详情;
- 所有订单操作**只能作用于自己的订单**(别人的订单看不到/取消不了/催不了/灌不进购物车)。

后端同时完成:**订单归属越权修复**(4 处补 `user_id` 归属校验)+ **退款状态口径统一**(3 处已支付取消统一置 `REFUND`)。

UI 用 Vant,行为对齐 `reference/` 小程序(historyOrder / details / my 三页),最低可用即可。

## 3. 范围 (Scope)

### 做什么 (In Scope)
- **后端归属越权修复(D1)**:`OrderServiceImpl` 的 `userCancelById` / `reminder` / `repetition` **在 Service 层**补 `user_id` 归属校验(取回后比对 `orders.userId == BaseContext.getCurrentId()`,不符按"订单不存在"拒;`repetition` 先取单校验归属再复制明细);详情走**新增 user-only 方法** `getUserOrderDetail(id)`(归属校验 + 装配),**共用的 `details()` 留给管理端不动**(AD1 HIGH#1:`details()` 被管理端 `GET /admin/order/details/{id}` 共用,塞归属会打死它);`reminder` **一并加 `status==2` 业务守卫**(AD1 Q3)。**不改 `OrderMapper.getById` 签名**(管理端 `rejection`/`cancel`/`delivery`/`complete` 也调它,改签名会编译失败;仿 0003 D6)。独立 commit。
- **后端退款口径统一(D2)**:管理端 `rejection`(L349)/`cancel`(L376)对**已支付**订单,在原有"模拟退款 log"处**补 `orders.setPayStatus(Orders.REFUND)`**(对齐 `userCancelById` 现有口径);`cancel` 的 `payStatus == 1` 字面量换成 `Orders.PAID`。**只补退款状态、不动其余状态流转/前置校验**。独立 commit。
- **前端历史订单页(D3)**:`van-tabs` 3 tab(全部=不传 status / 待付款=status1 / 已取消=status6,对齐 reference)+ `van-list` 触底无限加载(pageSize=10,records 累加)+ 订单卡片(号/时间/金额/状态/菜品缩略)+ 按状态出按钮(再来一单 always / 去支付 status1 / 催单 status2)。
- **前端订单详情页(D4)**:全字段展示(地址/收货人/电话/订单号/时间/明细/金额/状态/备注等)+ 按状态出操作(取消 status1|2 / 立即支付 status1 / 催单 status2 / 再来一单 always);取消/再来一单/催单走 `showConfirmDialog` 二次确认或结果提示。
- **前端用户中心(D5,纯导航壳)**:显示 store 里 `username` + `van-cell` 导航(历史订单 → `/order-list`、地址管理 → `/address`、修改密码 → `/change-password`、退出登录);**不新增后端端点、不查用户信息接口**。
- **前端导航入口 + 成功页接线(D4)**:Menu 顶栏加「我的」入口 → `/user`;`Created.vue`「查看订单」去 `disabled` + 接线到 `/order-detail/:id`;为拿到 id,把 `orderId` 沿 `Confirm.vue`→`Pay.vue`→`Created.vue` 的 query 一路透传补上(0004 只透了 orderNumber/orderAmount)。
- **前端资产**:`api/order.ts` 补 `historyOrders`(参数名 **`pageNum`**,AD1 HIGH#2)/`orderDetail`/`reminder`/`repetition`/`cancel` 5 函数;`types/business.ts` 补 `Order`/`OrderDetail`/`OrderDetailItem`/`PageResult<T>` 类型;`router` 加 3 路由(登录门槛);「再来一单」**合并加入后刷新购物车(不清空,AD1 Q1)**。
- **契约校准**:把 `docs/api-contract/用户端接口.md` 的 historyOrders / orderDetail / reminder / repetition / cancel 五端点补口径注释 + **归属校验行为变更**(仿 0003 D6 校准段);标注 tab→status 映射、分页语义、退款口径。

### 不做什么 (Out of Scope)
- **新增后端端点 / 改端点签名**:5 端点已就位,除归属校验(Service 层,不改签名)+ 退款口径(仅补 payStatus)外**不新增/不改契约签名**(照 blueprint「改造复用」)。
- **查询当前用户信息端点**:用户中心是**纯导航壳**,只读本地 store 的 `username`;**不新增 `GET /user/user/me` 之类端点**(D5)。头像/昵称/手机号等 reference `my` 页字段本项目账密用户没有,不做。
- **管理端订单管理功能**:接单/派送/完成/管理端列表等属管理端,0005 只在退款口径统一时**越界补 `rejection`/`cancel` 的 `payStatus=REFUND` 一行**,不做管理端任何其它功能/页面。
- **支付超时倒计时业务**:reference 详情页有 15min 待付款倒计时 + 超时自动取消,0004 已明确不做,0005 **不补**(最低可用;待付款订单不会自动取消,靠用户手动取消)。
- **真实退款 / 退款状态机 / 申请退款流程**:退款仍是 mock(log + 置 `payStatus=REFUND`);reference 详情页"申请退款"仅弹"联系商家"、不调接口,0005 不做该按钮。
- **金额服务端重算 / 反篡改**:延续 0003/0004,订单金额以下单时存库值为准,不重算(price-integrity 风险已记 ADR-0003 D4)。
- **催单/取消的操作前强确认(可选)**:reference 催单/取消是"先调接口后弹结果",无操作前确认;0005 为稳妥**给取消/再来一单加 `showConfirmDialog` 操作前确认**(取消是破坏性操作),催单可结果提示即可(实现期定,不算范围变更)。
- **详情页"取消订单"的伪按钮**:reference 对 status3/4 也显示取消按钮但点了只提示"联系商家";0005 **只在 status1|2(后端实际允许取消)显示取消按钮**,不做伪按钮(避免误导)。
- `reference/` 堂食扫码点餐 / 全局 tabbar 布局:out of scope(`reference/` 只读)。

## 4. 验收标准 (Acceptance Criteria)
> 可观测、面向行为、含负例;测试门做成**可证伪断言 + 工具核对**(curl / DB 查 / preview_network),不留肉眼判定空间(沿用 0002/0003/0004 风格)。DoD(流程门)见 CLAUDE.md 铁律 4,此处不重抄。
> 术语:状态 1待付款 / 2待接单 / 3已接单 / 4派送中 / 5已完成 / 6已取消;payStatus 0未支付 / 1已支付 / 2退款。

**A. 后端归属越权修复(D1)**
- [ ] **(正例 · 本人可用)** 甲登录,对**自己**的订单 id:`GET /order/orderDetail/{id}` 拿到详情、`PUT /order/cancel/{id}`(status≤2)能取消、`GET /order/reminder/{id}`(status2)能催单、`POST /order/repetition/{id}` 能把明细灌进自己购物车。curl 硬验。
- [ ] **(负例 · 详情归属 · 硬断言)** 前置:甲有订单 `id=X`、乙(另注册)无 X。乙 token `GET /order/orderDetail/X` → **拒/查无此单(不返回甲的地址/电话/收货人/明细)**。curl 硬验。
- [ ] **(负例 · 取消归属)** 乙 token `PUT /order/cancel/X` → **拒**,DB 查甲订单 `status` **未变**(未被取消)。
- [ ] **(负例 · 催单归属)** 乙 token `GET /order/reminder/X` → **拒**,不触发催单推送。
- [ ] **(负例 · 再来一单归属 · 硬断言)** 乙 token `POST /order/repetition/X` → **拒**,DB 查乙的 `shopping_cart` **不含**甲订单的菜品(不泄露/不灌入他人订单内容)。
- [ ] **(负例 · 催单状态守卫 · AD1 Q3)** 对**非待接单**(如已取消 status6 / 待付款 status1)的**自己**订单 `GET /order/reminder/{id}` → 后端**拒**(`ORDER_STATUS_ERROR`),不触发催单推送(证前端 gate 之外后端也挡)。
- [ ] **回归 · 用户隔离**:历史订单 `GET /order/historyOrders` 仍只返回当前用户订单(改动不破坏既有隔离)。
- [ ] **(回归 · 管理端详情不被打死 · AD1 HIGH#1)** admin token `GET /admin/order/details/{id}`(任意顾客订单)→ **仍能取到详情**(证 D1 归属校验落 user-only 方法、未污染管理端共用的 `details()`)。curl 硬验。

**B. 后端退款口径统一(D2)**
- [ ] **(正例 · 用户取消已支付单)** 造甲**已支付**订单(status2/payStatus1),甲 `PUT /order/cancel/{id}` → DB `status=6 已取消` **且 `pay_status=2 退款`**(userCancelById 现有口径不回归)。
- [ ] **(硬断言 · 管理端拒单退款口径)** 造已支付订单(status2/payStatus1),admin `PUT /admin/order/rejection` `{id, rejectionReason}` → DB `status=6` **且 `pay_status=2 退款`**(改前该值停在 1=已支付,是修复点)。curl + DB 硬验。
- [ ] **(硬断言 · 管理端取消退款口径)** 造已支付订单(需先 admin 接单/或直接构造 status),admin `PUT /admin/order/cancel` `{id, cancelReason}` → DB **`pay_status=2 退款`**(改前停在 1)。curl + DB 硬验。
- [ ] **(负例 · 未支付不误退 · AD1 锁可达路径)** 对**未支付**(payStatus0)订单走**用户取消**(status1 待付款,`PUT /user/order/cancel/{id}`)或**管理端取消**(`PUT /admin/order/cancel`)→ `pay_status` **仍为 0**(不误置 REFUND);流程正常完成。⚠️ **不走拒单 rejection 测此条**:rejection 有 `status==2` 前置,而 status2 必已支付,造不出"未支付+status2" → 走 rejection 恒撞 `ORDER_STATUS_ERROR`、到不了退款分支,该路径下此负例恒真不可证伪(AD1 内审)。

**C. 前端历史订单页(D3)**
- [ ] **tab 过滤**:进 `/order-list`,默认「全部」列出当前用户全部订单;切「待付款」→ `preview_network` 确认请求带 `status=1` 且列表只剩 status1 单;切「已取消」→ `status=6` 且只剩已取消单。
- [ ] **无限滚动分页**:造 > 10 笔订单,进页面首屏 10 条,触底加载出第 11 条起(`preview_network` 见 `page=2` 请求,records 累加不重复);加载完(len≥total)不再发请求。
- [ ] **卡片按状态出按钮**:status1 卡片见「去支付」+「再来一单」;status2 见「催单」+「再来一单」;status6 见「再来一单」(无去支付/催单)。
- [ ] **点卡片进详情**:点某卡片 → 路由到 `/order-detail/{该单id}`,详情页订单号与卡片一致。

**D. 前端订单详情页 + 动作(D4)**
- [ ] **详情字段**:进 `/order-detail/:id` 显示订单号/下单时间/金额/状态/收货地址(consignee+phone+address)/菜品明细列表(名/数量/单价/图)。字段取自 `GET /order/orderDetail/{id}`。
- [ ] **取消(status1|2)**:详情页点「取消订单」→ 二次确认 → `PUT /order/cancel/{id}` → `code:1` → 状态刷新为「已取消」;DB `status=6`。仅 status1|2 显示该按钮(status≥3 不显示)。
- [ ] **立即支付(status1)**:status1 详情页点「立即支付」→ 跳 `/order-pay`(带 orderNumber+amount)→ 走 0004 支付链路。
- [ ] **催单(status2)**:点「催单」→ `GET /order/reminder/{id}` → `code:1` → 结果提示"催单已发出";`preview_network` 确认请求。
- [ ] **再来一单(合并加入 · AD1 Q1)**:点「再来一单」→ 二次确认 → `POST /order/repetition/{id}`(**不清空购物车**)→ 购物车刷新后**含该单菜品且原有条目保留**(合并)→ 跳 `/menu`;`preview_network` 确认**只发 repetition(无 clean)**。前置:购物车先放一件别的菜 → 再来一单后该件仍在 + 新增该单菜品(证"合并不清空")。
- [ ] **成功页接线**:0004 支付成功页 `/order-created`「查看订单」**不再 `disabled`**,点它 → `/order-detail/{本单id}`(证 orderId 已沿 Confirm→Pay→Created 透传)。
- [ ] **(负例 · orderId 兜底 · AD1 收敛)** 构造 `/order-created` 无 `orderId`(如直接访问或 query 缺失)→「查看订单」**禁用或退化跳 `/order-list`**,**不跳 `/order-detail/undefined`**(证缺 id 有兜底)。

**E. 前端用户中心(D5)+ 入口**
- [ ] **入口**:Menu 页顶栏出现「我的」入口,点它 → `/user`。
- [ ] **导航壳**:`/user` 显示当前用户名(取自 store);「历史订单」→ `/order-list`、「地址管理」→ `/address`、「修改密码」→ `/change-password` 均可跳;「退出登录」→ 清 token 回 `/login`。**不发任何"查用户信息"请求**(`preview_network` 确认页面加载无此类请求)。

**F. 回归**
- [ ] `type-check` exit 0;0002 `/menu`、0003 `/order-confirm`+地址簿、0004 下单→支付→成功页主链**不受影响**。
