# ADR-0005: C 端重建④(订单管理)—— 越权修复 / 退款口径 / 前端订单管理五决策

## 状态: 已采纳(2026-07-23)

> 关联: Requirement/Proposal/Progress → ../features/0005-order-manage/ | 契约 → ../api-contract/用户端接口.md | 路线图 → ../blueprint.md
> 定位: 本文件管"**为什么选 A 不选 B**"(广度)。机制深挖见 ../divedeep/(深度);
> **代码现状 / 要改哪些文件见 ../features/0005-order-manage/proposal.md**,此处不重复。

---

## 背景

0005 是「C 端完整重建」epic 的**第四块 = 收官**(见 blueprint):把 0004 支付后断掉的订单生命周期下半段补齐(历史订单 / 详情 / 催单 / 再来一单 / 取消 / 用户中心),并清掉订单相关后端的两类历史欠债。除实现前端页面本身,它要定 5 件事:①订单归属越权(IDOR)怎么修、②退款状态口径怎么统一(含要不要越界碰管理端)、③历史订单 tab + 分页怎么设计、④前端页面/路由怎么拆 + 导航入口 + 成功页接线、⑤用户中心做到什么程度。功能级动机见 Requirement §1,不重抄。

### 约束这些决策的关键事实(源码 / reference 实证,2026-07-23 实读)
- **C 端 5 端点归属校验只覆盖 1 个**(`OrderServiceImpl` 实读):
  - `pageQueryForUser`(L167,历史订单):`ordersPageQueryDTO.setUserId(BaseContext.getCurrentId())` → **已隔离,安全**。
  - `details`(L204,详情):`orderMapper.getById(id)` + `orderDetailMapper.getByOrderId(id)`,**无归属校验** → 越权可看他人订单(含地址/电话/收货人/明细)。
  - `userCancelById`(L224,取消):`orderMapper.getById(id)`,**无归属校验** → 越权可取消他人订单(0004 评审 AD1 外审#4 已记 0005 backlog)。
  - `repetition`(L262,再来一单):直接 `orderDetailMapper.getByOrderId(id)`(**连订单都没取**),**无归属校验** → 越权可把他人订单菜品灌进自己购物车(数据泄露)。
  - `reminder`(L442,催单):`orderMapper.getById(id)`,**无归属校验** → 越权可对他人订单触发催单推送(危害较小)。
- **`OrderMapper.getById(Long id)` 是单参、被 7 处共用**:用户端 `details`/`userCancelById`/`reminder` + 管理端 `rejection`/`cancel`/`delivery`/`complete` 都调它。**改签名加 `userId` 会让管理端编译失败**(与 0003 D6 同构约束)。
- **退款状态三处口径不一**(`OrderServiceImpl` 实读):
  - `userCancelById`(L242–248):取消**待接单**(status2=已支付)订单时,log 模拟退款 **且 `orders.setPayStatus(Orders.REFUND)`** → 口径正确,作为对齐基准。
  - `rejection`(L349–353,管理端拒单):`if (payStatus == Orders.PAID)` 只 log 模拟退款,**不置 `payStatus=REFUND`** → 退了款但状态停在"已支付"。
  - `cancel`(L370–388,管理端取消):`if (payStatus == 1)`(**字面量,非 `Orders.PAID`**)只 log,**不置 `payStatus=REFUND`**。
  - `rejection`/`cancel` 由 `controller/admin/OrderController`(L84/L98)调用 = **管理端**;0004 D4 明确"这个既有不一致留 0005"。
- **前端现状**(`project-sky-user-vue3` 实读,0002–0004 交付):
  - `api/order.ts` 仅 `submitOrder`/`payment`;`request.ts` 拦截器返回**整个 `Result{code,data,msg}`** → 判成功用 `res.code===1`;路由靠 `meta.public` 白名单,新路由不写即受登录保护;Vant **全量引入**(`van-tabs`/`van-list`/`van-pull-refresh`/`van-dialog` 直接可用);`types/business.ts` 无 `Order`/`OrderDetail`/`PageResult<T>`(需新增)。
  - **无全局 tabbar / 无"我的"入口**:`App.vue` 只有 `<router-view>`,Menu 顶栏只有店名 + 营业 tag。用户当前**无路径到达"我的/订单"**——0005 需新增导航入口(从零)。
  - `Created.vue`(0004 成功页)「查看订单」`disabled` + 注释"0005 接管";query 只透传了 `orderNumber`/`orderAmount`,**没有订单 id**(Confirm→Pay→Created 链路把 submit 返回的 `id` 丢了)。
- **reference 订单管理交互实证**(小程序,Explore 实读):无 tabbar,页面靠 `navigateTo/redirectTo`;
  - `historyOrder`:**只 3 个 tab**(`['全部订单','待付款','已取消']` → status `''`/`1`/`6`),`pageSize=10`,`onReachBottom` 触底加载累加;卡片按状态出「再来一单(always)/去支付(status1)/催单(status2)」;点卡片 `redirectTo details?orderId=`。
  - `details`:全字段 + 按状态出「取消(1/2 真调,3/4 提示联系商家)/立即支付(1)/催单(2)/再来一单(!=7)」;15min 待付款倒计时(0004/0005 均不做)。
  - `my`(用户中心):头像/昵称/性别/电话取自 **Vuex store 不查接口**;入口只有「地址管理」「历史订单」(无设置/登出/客服);导航层级 `my → historyOrder → details`。
  - `success`(下单成功):「查看订单」`navigateTo details?orderId=<本单>`(直达详情,不经列表)。

---

## 决策概览
| 编号 | 决策点 | 结论 |
|---|---|---|
| D1 | 订单归属越权(IDOR)怎么修 | **4 处全修**(details/userCancelById/repetition/reminder),**Service 层**取回比对 `userId==BaseContext`,**不改 `getById` 签名**(仿 0003 D6) |
| D2 | 退款状态口径怎么统一 | **三处统一置 `REFUND`**(补 `rejection`/`cancel` 的 `setPayStatus(REFUND)` + `cancel` 字面量换 `Orders.PAID`);**越界碰管理端仅补退款状态一行**,其余不动 |
| D3 | 历史订单 tab + 分页 | **3 tab 对齐 reference**(全部/待付款/已取消 → status `''`/1/6)+ **`van-list` 触底无限加载**(pageSize10,records 累加);更细状态筛选记 backlog |
| D4 | 前端页面/路由拆分 + 入口 + 接线 | **三页三路由**(`/order-list`/`/order-detail/:id`/`/user`)+ **Menu 顶栏「我的」入口**(不引全局 tabbar)+ 成功页「查看订单」接线到详情(补透传 `orderId`) |
| D5 | 用户中心做到什么程度 | **纯导航壳**:显示 store `username` + 导航入口(历史订单/地址管理/修改密码/退出),**不新增后端端点** |

---

## D1 — 订单归属越权(IDOR):4 处全修,Service 层归属校验

### 关键约束
C 端 5 端点里 4 处越权(见背景);`getById(Long id)` 被用户端 + 管理端 7 处共用,**改签名会让管理端编译失败**——与 0003 D6 完全同构。

### 方案对比
| 方案 | 优点 | 缺点 |
|---|---|---|
| **A 4 处全修 + Service 层比对 + 不改 Mapper 签名(选)** | 一次堵住整片同类漏洞(BOLA/OWASP API#1);与 0003 D6 修法一致(心智负担小);不碰管理端、不破坏 `getById` 复用 | 4 个方法各加几行;`repetition` 需先补一次取单(现在连订单都没取) |
| B 只修 `userCancelById`(blueprint 原记的那一笔) | 改动最小 | details/repetition/reminder 三处越权继续挂着,下次未必回来修;漏洞面不齐 |
| C 新增 `getByIdAndUserId` Mapper 方法,4 处改调它 | 归属条件下沉到 SQL,更"原子" | 新增 Mapper 方法 + XML;`repetition` 仍要单独取单校验;与 0003 D6"Service 层比对"不一致(两套修法)。**用户已否**(选 A) |
| 现状(不修) | 无 | 已知越权漏洞;顾客可看/改他人订单 |

### 决策
选 **A**(用户拍板:范围=4 处全修、做法=Service 层)。每处修法:
- **`details(id)`**:`getById(id)` 后,`orders==null || !currentUserId.equals(orders.getUserId())` → 抛 `OrderBusinessException(MessageConstant.ORDER_NOT_FOUND)`("订单不存在",**不区分"不存在"与"非本人"以免泄露存在性**,与 0004 payment 一致)。**⚠️ 见评审补:`details()` 与管理端共用,归属校验须落 user-only 方法而非 `details()` 本身。**
- **`userCancelById(id)`**:现有已 `getById` + null 校验,**在 null 校验后补一句归属比对**(非本人 → 同样 `ORDER_NOT_FOUND`),其余状态流转不动。
- **`reminder(id)`**:同 `details`,`getById` 后补归属比对。**+ 评审补:一并加 `status==TO_BE_CONFIRMED(2)` 业务守卫(Q3 拍板)。**
- **`repetition(id)`**:**先 `getById(id)` 取单**(现在直接取明细),校验存在 + 归属,再走原有"明细 → 购物车"复制。
- **一律 `userId` 只认 `BaseContext.getCurrentId()`、不认任何请求参数**(这些端点参数只有 path `id`,天然无 body userId,但原则写死)。
- **`getById` Mapper 签名不动**(管理端共用)。

**评审补(AD1 · 内审 CONFIRMED · HIGH 必修):**`orderService.details()` **不是用户端专属** —— 管理端 `GET /admin/order/details/{id}`(`admin/OrderController:61`)也调它。若把归属校验塞进 `details()`,管理端 JWT 的 `sub`=员工 id、订单 `userId`=顾客 id **永不相等** → 管理端查任何订单详情恒抛"订单不存在",**打死一个既有管理端功能**。这是 D1 背景只盘点了 `getById` 共用(7 处)、却漏了 `details()` 本身也 user+admin 共用的疏漏(其余 3 处 `userCancelById`/`repetition`/`reminder` 实证均用户端专属,可安全改)。**订正修法**:用户 controller 改调**新增的 user-only Service 方法**(如 `getUserOrderDetail(id)`:`getById`+归属+装配,顺带修 `details` 现有的 null 未检查 → `BeanUtils.copyProperties(null,…)` NPE),`details()` 留给管理端不动;测试门补**管理端 `GET /admin/order/details/{id}` 仍可取详情**的回归断言。

**评审补(AD1 · Q3 拍板 · 催单状态守卫):**`reminder` 现状**无状态守卫**(`getById`+null+推送),前端只在 status2 显示按钮不足以防直接调 API 对任意状态(已取消/已完成/待付款)订单催单——"前端限制不可替代后端业务规则"(本 ADR 面试要点自己主张的)。**加 `status==TO_BE_CONFIRMED(2)` 业务守卫**(非 status2 抛 `ORDER_STATUS_ERROR`),配一条负例 AC。这是 D1 范围的轻微扩展(超出 IDOR 归属本身),Tech Lead 拍板纳入。

> 与 0003 D6 的关系:0003 修的是**地址簿** `AddressBook` 归属;0005 修的是**订单** `Orders` 归属。同一 BOLA 模式、同一"Service 层比对不改 Mapper 签名"修法——0005 是 0003 D6 的直接复刻 + 扩面。**新教训(AD1)**:"不改 Mapper 签名"只保证 DAO 层复用不断,**Service 方法本身也可能被多端共用**——共用面分析要延伸到 Service 层,不能止于 Mapper。

---

## D2 — 退款状态口径:三处统一置 REFUND(越界碰管理端)

### 关键约束
"已支付订单被取消要退款"发生在三处(`userCancelById` 用户取消 / `rejection` 管理端拒单 / `cancel` 管理端取消),只有 `userCancelById` 置了 `payStatus=REFUND`。`rejection`/`cancel` 是**管理端**方法,而 0005 是 C 端 —— 统一口径**必然越界碰管理端**。

### 方案对比
| 方案 | 优点 | 缺点 |
|---|---|---|
| A 只保用户端正确,管理端不一致记 backlog | 0005 不越界 | 已知数据不一致继续挂着;"一并统一"没兑现 |
| B 统一 `rejection`/`cancel` 置 REFUND | 三处口径一致;越界最小(各补一行) | 碰了管理端(需授权) |
| **C = B + `cancel` 字面量 `payStatus==1` 换 `Orders.PAID`(选)** | 口径一致 **且** 顺手消除魔法数字、与全项目常量风格一致 | 同 B(越界),外加改一处字面量 |
| 现状(不修) | 无 | 退了款状态停"已支付",数据不一致 |

### 决策
选 **C**(用户拍板,授权越界碰管理端):
- `rejection`(L349–353):在已支付判断块内,除原 log 外**补 `orders.setPayStatus(Orders.REFUND)`**。
- `cancel`(L370–388):**补 `orders.setPayStatus(Orders.REFUND)`**,并把 `payStatus == 1` 换成 `Orders.PAID.equals(payStatus)`(见评审补)。
- `userCancelById`:**不动**(已是正确基准)。
- **边界写死**:0005 对 `rejection`/`cancel` **只补退款状态这一件事**,其余状态流转(置 CANCELLED)、原因、时间、前置校验一律不动(仿 0004 D4"只拆一行外呼"的越界纪律,反向:只补一行退款状态)。

**评审补(AD1 · 内审 CONFIRMED · MED · 订正本决策的表述):**原 D2 把 `cancel` 的 `payStatus == 1` 换成 `payStatus == Orders.PAID` 宣传为"消除魔法数字 + 风格统一"——**但选错了形式**:`Orders.PAID` 是 **`Integer`**(`Orders.java:35`),`Integer == Integer` 是**引用比较**,仅因 `1` 落在 Integer 缓存区(-128..127)、MyBatis 与常量都指向 `Integer.valueOf(1)` 缓存实例才**碰巧**为真——这是装箱引用比较地雷,且与本项目自己的正确惯例不一致(`userCancelById` L242 用的是 `.equals()`)。功能上 `payStatus` 恒为 0/1/2 在缓存区不会真错,但作为面试向学习项目、且卖点是"可维护性",站不住。**订正**:三处统一写 `Orders.PAID.equals(payStatus)`(**含 `rejection` L350 既有的同款 `== Orders.PAID` 隐患一并改**),才真叫"消除魔法数字 + 风格一致"。此即 D2 该有的正确落地。
> **退款仅置状态位、无真实资金流**(外审 MED#6 提醒):三处置 `payStatus=REFUND` 只让数据库状态一致,退款金额/时间/流水**均无**(mock)。代码注释 + 本 ADR 明确标注"本阶段仅补状态位,非真实退款",避免后续维护者误以为退款逻辑已完备(记面试/技术债)。真实退款 → 见后续义务。

> 与 0004 D4 的呼应:0004 越界碰这三处**只把 refund 外呼换 mock log**(明确不碰退款状态口径,留 0005);0005 越界碰**只补退款状态**(不碰别的)。两次越界各有清晰边界,叠起来把这三处的退款逻辑收拾干净。

---

## D3 — 历史订单 tab + 分页:3 tab 对齐 reference + van-list 无限滚动

### 关键事实
`GET /user/order/historyOrders?page&pageSize&status`(status 可空,后端 `pageQuery` 按 status 动态过滤)。reference `historyOrder` **刻意只做 3 tab**(全部/待付款/已取消),pageSize10,触底加载。前端 Vant 全量引入,`van-list`(触底无限加载)+ `van-tabs` 现成。

### 方案对比(D3 由用户授权我定,对齐 reference)
| 维度 | 选定 | 备选(否) | 为什么 |
|---|---|---|---|
| tab 数 | **3 tab**(全部=不传 status / 待付款=1 / 已取消=6) | 6 tab(每 status 一个) | epic 铁则"业务行为与 reference 完全一致";reference 就是 3 tab;mock 世界里 C 端订单主要落 status 1/2/6,多 tab 大多空;更细筛选记 backlog(端点已支持任意 status,将来加 tab 即可) |
| 分页 | **`van-list` 触底无限加载**(pageSize10,records 累加) | 分页器(page 数字) | reference 是触底加载;`van-list` 是 Vant 惯用无限滚动组件、`finished` 控制停止;移动端体验对 |

### 决策
选 **3 tab + `van-list`**:`van-tabs` 三项 → 切换时以对应 status(空/1/6)重置 `page=1` 重新拉;`van-list` `@load` 触底时 `page++` 追加,`records` 累加去重,`len>=total` 置 `finished` 停止。空态给"暂无订单"。**这是 D3 的最低可用 + reference 对齐**。

---

## D4 — 前端页面/路由拆分 + 导航入口 + 成功页接线

### 关键事实
reference 三页(historyOrder/details/my);现有前端**无导航入口**到"我的/订单";`Created.vue`「查看订单」缺订单 id(链路只透传了 orderNumber)。

### 方案对比(D4 由用户授权我定,对齐 reference)
| 子决策 | 选定 | 备选(否) | 为什么 |
|---|---|---|---|
| 页面/路由 | **三页三路由**:`/order-list`(List.vue)、`/order-detail/:id`(Detail.vue)、`/user`(Center.vue),均受登录门槛 | 列表+详情合一 / 详情用 query 传 id | 对齐 reference 三页;详情用 **path 参数 `:id`**(RESTful、可分享/刷新);登录门槛靠不写 `meta.public` 自动生效 |
| 导航入口 | **Menu 顶栏加「我的」入口 → `/user`** | 引全局 `van-tabbar`(菜单\|我的) | tabbar 要改 `App.vue` 布局层 + 各页条件显隐(order-confirm/pay 等不该显示),复杂度高;顶栏入口是**最低成本**、契合"UI 最低标准";reference 本身也无 tabbar |
| 成功页接线 | **`Created.vue`「查看订单」→ `/order-detail/:id`**;为拿 id,把 `orderId` 沿 `Confirm.vue`→`Pay.vue`→`Created.vue` 的 **query 一路透传补上** | 「查看订单」→ `/order-list`(免 id) | reference success→details(直达本单详情)体验更好;补透传 id 是完成 0004 明确留的钩子(0004 只透了 orderNumber);id 在 Confirm 的 submit 响应 `OrderSubmitVO.id` 就有 |
| 列表卡片「去支付」 | **直接 → `/order-pay`**(带 orderNumber+amount) | 学 reference 先跳详情再支付 | 更少跳转、Pay.vue 已读 query 的 orderNumber/orderAmount;行为等价(都能付) |
| 详情「取消」按钮 | **仅 status1|2 显示**(后端实际允许) | 学 reference 对 3/4 也显示"伪按钮"(点了提示联系商家) | 后端 `userCancelById` status>2 直接抛错;显示点不动的伪按钮误导用户,违背最低可用 |
| 「再来一单」 | **二次确认 → repetition(合并加入,不清空)→ 刷新购物车 → 跳 `/menu`**(Q1 拍板) | 清空重来(clean→repetition,对齐 reference) | 见评审补:清空重来若 repetition 失败则服务端购物车永久丢失;合并加入最安全、也是主流外卖 App 行为,后端 repetition 现状就是"加"、前端连 clean 都不调 |

### 决策
选上表全部"选定"项。路由/组件命名 Phase 3 机械定(倾向 `views/Order/List.vue`/`Detail.vue`、`views/User/Center.vue`)。**导航层级**对齐 reference:Menu →(「我的」)→ `/user` →(历史订单)→ `/order-list` →(卡片)→ `/order-detail/:id`;成功页 → 详情。

**评审补(AD1 · Q1 拍板 · 再来一单改合并加入):**内审/外审都点了原"清空 → repetition"的**数据丢失风险**:`cart.clean()`(服务端 `deleteByUserId`)先清空,若随后 `repetition` 失败(弱网/后端异常/归属拒),服务端购物车**永久丢失且前端无法回滚**;且后端 `clean` 会连 `repetition` 刚插入的行一起删,故"repetition 后再 clean"不可行。Q1 拍板 **合并加入(不清空)**:前端只调 `repetition`(后端现状即"insert 追加")+ `cart.refresh()`,**不调 clean**——零数据丢失、主流外卖行为、改动最小。AC/proposal 相应改"购物车含该单菜品(合并,原有条目保留)"。
**评审补(AD1 · 收敛 · orderId 透传护栏):**外审(刷新易断)+ 内审(**列表"去支付"支线**丢 orderId → `/order-detail/undefined`)都点了 orderId 脆弱。→ ① orderId 在**每一跳都写进 URL query**(Confirm→Pay→Created;列表"去支付"也带 orderId,列表项本有 `id`);② `Created.vue` **兜底**:缺 orderId 则「查看订单」禁用或退化跳 `/order-list`,不空白跳转 `/order-detail/undefined`。

---

## D5 — 用户中心:纯导航壳

### 关键约束
reference `my` 页展示头像/昵称/性别/电话,但**数据取自 Vuex store、不查接口**;而本项目账密用户(0001)**只有 `{id, username}`**,没有头像/昵称/手机号;现有契约也**无"查当前用户信息"端点**。

### 方案对比
| 方案 | 优点 | 缺点 |
|---|---|---|
| **A 纯导航壳(选)**:显示 store `username` + 导航入口(历史订单/地址管理/修改密码/退出登录) | 零后端改动(守 blueprint「不新增端点」);账密用户信息本就只有 username;最低可用达成 | 不如 reference `my` 页丰富(无头像等——但本项目本就没有这些字段) |
| B 补 `GET /user/user/me` 端点返回用户信息 | 用户中心更完整 | 新增端点(违 blueprint 改造复用);账密用户也没头像/手机可返回,收益薄 |

### 决策
选 **A**(用户拍板"纯导航壳"):`/user` = 顶部显示 `useUserStore().user?.username` + `van-cell-group` 导航(历史订单 → `/order-list`、地址管理 → `/address`、修改密码 → `/change-password`、退出登录 → `logout()` 回 `/login`)。**不新增任何后端端点、加载时不发"查用户信息"请求**。头像/昵称/手机号等 reference 字段本项目无来源,不做。

---

## Trade-off / 后果
> 要改哪些文件、怎么改见 proposal.md;这里只记决策层面的后果。

- **换来**:订单生命周期下半段闭环(历史/详情/催单/再来一单/取消/用户中心),C 端重建 epic 收官;顺手堵住整片订单越权(BOLA)、统一退款状态口径——两笔安全/正确性欠债清偿。
- **放弃 / 代价**:用户中心比 reference 简陋(纯导航壳,无头像等);无待付款倒计时(待付款订单不自动取消);退款仍是 mock(仅置 `payStatus=REFUND` + log,无真实资金流);金额仍以下单存库值为准(不重算)。
- **后续义务 / 遗留**:
  - **更细状态筛选**(3 tab → 6 状态 tab)→ backlog(端点已支持,前端加 tab 即可)。
  - **真实退款状态机 / 申请退款流程**(reference"申请退款"仅提示联系商家)→ 未做。
  - **支付超时倒计时业务**(15min 未付自动取消)→ 0004 起明确不做,记档。
  - **用户信息端点 / 资料页**(头像/昵称/手机)→ 若将来要丰富用户中心再议(需新增端点 + 用户资料模型)。
  - **管理端订单管理**(接单/派送/完成/列表)→ 管理端地盘,不在本 epic。
  - **分布式/并发取消与支付竞态**:0004 payment 已上 CAS;取消/拒单/接单之间的并发状态迁移竞态(如"用户取消"与"管理端接单"同时)本项目单机学习不深做,记面试点。

---

## 💡 面试要点(广度卡片)
- **IDOR / BOLA(越权)—— 整片而非单点**:按对象 id 操作却不校验 owner 是 OWASP API Security Top 1。0005 的看点是**同一类漏洞在一个 Service 里散落 4 处**(详情/取消/催单/再来一单),而列表查询因为"按当前用户过滤"天生免疫——能讲清"为什么列表安全、单资源操作危险""修法=查询/操作条件带上当前用户身份""为什么用统一的『不存在』错误避免存在性泄露"是加分。与 0003 D6(地址簿越权)是同模式两实例。
- **为什么归属校验放 Service 层不改 Mapper 签名**:`getById` 被用户端 + 管理端共用,改签名会打死管理端(编译失败);Service 层"取回后比对 `BaseContext` 当前用户"既修漏洞又不破坏复用。这是"共享 DAO 方法上做差异化鉴权"的真实取舍(对比:新增 scoped 查询方法把条件下沉 SQL 的 B/C 方案)。
- **退款状态口径一致性 / 状态机不变量**:三处"已支付被取消"应有相同副作用(置 `payStatus=REFUND`),现状只有一处置 → 数据不一致。能讲清"同一状态迁移必须有一致的副作用集合""魔法数字 `1` vs 常量 `Orders.PAID` 的可维护性""状态机迁移要成对定义守卫与副作用"是加分。
- **无限滚动分页 vs 分页器**:触底加载(累加 records、`finished` 停)适合移动端流式浏览;分页器适合可跳页的后台表格。能讲清 `van-list` 的 `loading/finished/@load` 契约与"何时该用哪种"是加分。
- **契约既有但归属行为变更 → 契约校准**:5 端点契约(YAPI 导出)签名不变,但归属校验行为收紧 —— 属"契约事后校准"(补行为注释,签名不动),延续 0003/0004 的 contract-first 纪律。
- **前端登录门槛的"默认拒绝"设计**:路由靠 `meta.public` 白名单,新页不写即受保护 —— fail-safe(默认安全)胜过 fail-open(默认放行、忘了加保护就漏)。
- **divedeep 候选(按「链路/机制」评,不是按 decision 评)**:
  - **订单越权修复全链路(BOLA 在 Service 层的差异化鉴权)** [含金量: 中] —— 入口 `OrderServiceImpl#details/userCancelById/repetition/reminder` —— 归属校验为什么放 Service 层、与 0003 地址簿越权同模式;**建议并入**已有的越权/鉴权主题或与 0003 D6 合并讲,不单开(标准 authz 套路,讲得清但常见)。
  - **历史订单分页链路(PageHelper + 无限滚动前后端协作)** [含金量: 低] —— 入口 `OrderServiceImpl#pageQueryForUser` + `van-list` —— `PageHelper.startPage` 拦截下一条 SQL 分页的机制**已被 divedeep「员工分页查询」覆盖**(同 `PageHelper` 套路),本功能不重复写。
  - 结论:**本功能无"高含金量、必须单开"的链路**;越权修复是本 epic 的第 2 个 BOLA 实例(第 1 个是 0003 D6),更适合作为"同模式两实例"的对照素材并入鉴权主题,而非单独 divedeep。Phase 4 收口时确认。

---

## Addendum(执行期细化,追加式)

### AD1 — 双路评审发现与处置(2026-07-23,内审:会话内全新上下文红队 subagent 实读源码 + 外审:DeepSeek-v4-pro 只看规划文档)
> 按 GOOD.md Phase 2 步骤5,规划稿交内审(全新上下文敌对 subagent,**实读源码**逐条证伪)+ 外审(DeepSeek 异构模型,**只看 requirement/ADR/proposal**)双路敌对评审,融合后修订计划。原决策 D1–D5 **方向不变**;D1 实现订正(details 共用 + reminder 守卫)、D2 表述订正(`.equals()`)、再来一单改合并(Q1)、tab 保持 3(Q2)、催单加守卫(Q3)。**净判定:两路一致——修订后可进 Phase 3**(2 项 HIGH 必修阻断,均**内审实读独有**、外审只看文档抓不到——异构双路的价值再次印证:能读码的一路负责"契约/共用面是否真成立",只看文档的一路负责"设计/UX/安全面是否被粉饰")。

**① HIGH 必修阻断(内审 CONFIRMED,均已订正计划):**
- **[HIGH#1] 归属校验放共用的 `details()` 会打死管理端订单详情**:`orderService.details()` 被用户端 + 管理端 `GET /admin/order/details/{id}`(`admin/OrderController:61`)共用;塞归属校验后管理端(sub=员工 id ≠ 订单 userId)恒抛"订单不存在"。→ 改为**新增 user-only Service 方法** `getUserOrderDetail(id)`,`details()` 留给管理端不动;补管理端详情回归门。(详见 D1 评审补。)**教训:共用面分析要延伸到 Service 层,不能止于 Mapper。**
- **[HIGH#2] `historyOrders` 参数名后端是 `pageNum` 不是 `page`**:`user/OrderController:65` `page(int pageNum,int pageSize,Integer status)` 无 `@RequestParam`、靠参数名绑定(Spring Boot 2.7.3 默认 `-parameters`)→ 绑定键 `pageNum`;契约/前端写 `page` → 请求失败、非 `Result`,历史订单首屏 + 每次切 tab 全废。→ **契约改 `pageNum`、前端 `params:{pageNum,pageSize,status}`、step3 curl 门用 `?pageNum=1` 硬验**。属"contract-first 下契约本身(YAPI 导出)写错了参数名"。**Phase 4 校准**:原判"用 `page` 报 `MissingServletRequestParameterException` 400"与实测不符——verifier 实测返 **HTTP 500**(疑似 `pageNum` 缺失后 `PageHelper.startPage(null,…)` NPE 被兜底成 500),非 400。结论不变(必须用 `pageNum`),仅错误码事实订正(契约同步改)。

**② 内审独有 CONFIRMED(实读,已改进计划):**
- **[MED] `payStatus == Orders.PAID` 是装箱引用比较地雷** → 三处统一 `Orders.PAID.equals(payStatus)`(含 `rejection` 既有隐患)。(详见 D2 评审补。)
- **[MED] "未支付不误退"经 rejection 路径不可达(假绿)**:rejection 有 `status==2` 前置,而 status2 必已支付(payment CAS 同置 status2+paid),造不出"未支付+status2" → 走 rejection 先撞 `ORDER_STATUS_ERROR`,到不了退款分支,该负例恒真。→ 负例锁在**可达路径**:user cancel(status1 未付)+ admin cancel(无 status 守卫)。
- **[MED] van-list + tab 复位/双请求坑**:切 tab 须一次性复位 `list=[]`/`finished=false`/`loading=false`,且 `van-list` 挂载即自动 `@load`——**只靠 `@load` 触发首拉、勿手动+自动并发**(否则首屏双请求、records 重复)。空 tab(total=0)立即 `finished`。→ 护栏纳入 step4。
- **[LOW] admin `cancel` 取 `getPayStatus()` 前无 null 检查**(既有 NPE,非本次引入):D2 只补退款状态、不强求修,记一笔。

**③ 收敛项(两家都提,高置信,已加护栏):**
- **orderId 透传脆弱/丢失**:外审(Pay 页刷新丢 id)+ 内审(列表"去支付"支线丢 id → `/order-detail/undefined`)→ 每跳写进 URL query + `Created.vue` 缺 id 兜底。(详见 D4 评审补。)

**④ 外审独有(补覆盖 / 记档):**
- **[HIGH→Q1] 再来一单清空购物车数据丢失 + 替换 vs 合并语义**:内审证实后端 `clean`=全删、`repetition`=追加,"repetition 后 clean"不可行 → **Q1 拍板合并加入(不清空)**(最安全,详见 D4 评审补)。
- **[MED→Q2] 3 tab 看不到"进行中"订单**(已支付落 status2 只在"全部"里)→ **Q2 拍板保持 3 tab 对齐 reference**,更细筛选记 backlog(端点已支持,可逆)。
- **[HIGH→Q3] 催单 reminder 无后端状态校验**(前端 gate 不可替代后端规则)→ **Q3 拍板加 `status==2` 守卫**(详见 D1 评审补)。
- **[MED] 退款"假一致"**(仅状态位无资金流)→ 代码注释 + ADR 标注(详见 D2 评审补)。
- **[MED] PageResult 字段对不上风险** → 内审/主窗口实读证 `PageResult{total:long, records:List}`(`sky-common` `PageResult.java`)**结构正确**,前端 `PageResult<T>={total,records}` 可对齐;仍加**分页结构硬断言门**(step3)兜底防漂移。
- **[LOW] JWT 退出不失效**(无 token 黑名单)→ 0001 认证域已知局限(stateless JWT 先天特性),用户中心 logout 仅清前端 token,记面试点,不改。

**⑤ 内审核对通过(高置信,规划无误):** 另外 3 处越权点(`userCancelById`/`repetition`/`reminder`)实证均用户端专属、可安全改;统一 `ORDER_NOT_FOUND` 不泄露存在性(反枚举)正确;`OrderMapper.xml` 的 `<update>` 动态 SQL(`<if test="payStatus!=null">`)能正确更新只 set payStatus 的场景;`OrderSubmitVO` 确有 `id`、orderId 透传链路可补;6 步依赖与可编译性无死锁(步骤3 先建占位组件供动态 import 通过 type-check);无第 4 处漏改的退款点、无遗漏的第 5 个越权端点。

**⑥ 拍板(用户,2026-07-23):** Q1 再来一单=合并加入(不清空)/ Q2 历史订单=3 tab 对齐 reference / Q3 催单=加后端 status==2 守卫。两项 HIGH 必修(details 共用、pageNum)+ 内审 MED(.equals / 未支付负例改路径 / van-list 复位)+ 收敛(orderId 护栏)+ 外审记档(退款假一致注释 / 分页硬断言门 / JWT 局限)一并落 requirement / proposal / 本 ADR / 契约。

**评审留痕**:内审 = 会话内全新上下文红队 subagent(实读 `OrderServiceImpl` / 两个 `OrderController` / `OrderMapper`+XML / `Orders` / `MessageConstant` / `JwtAuthenticationFilter` / `OrderVO` / 前端 `order.ts`/`request.ts`/`router`/`stores`/`Confirm`/`Pay`/`Created`/`Menu`/pom);外审 = `~/.claude/tools/deepseek_review.py`(`deepseek-v4-pro`)。**异构双路敌对评审**再次印证:2 个 HIGH 必修全靠内审实读源码(共用面、参数名绑定这类"文档看不出、只能读码"的坑),外审补足设计/UX/安全面(数据丢失、进行中 tab、催单守卫、退款假一致);收敛处(orderId)高置信;最终由 Tech Lead 就 3 个"范围/行为选择"拍板——决策留人、机制留笔记。

### AD2 — Phase 4 复核与收尾(2026-07-23)
> Phase 3 六步全部 TESTED 后的收尾复核(GOOD.md Phase 4)。本节记决策落地一致性、执行期订正、divedeep backlog 收口、契约事实校准。

**① 决策落地一致性(D1–D5 复核,均与实现一致):**
- **D1** 订单归属越权 4 处全修:`getUserOrderDetail`(user-only,`details()` 未污染,管理端 `GET /admin/order/details/{id}` 回归通过)+ `userCancelById`/`reminder`/`repetition` Service 层归属校验 + `reminder` `status==2` 守卫。`getById` 签名未动。verifier 8/8。**按 AD1 HIGH#1 订正落地无偏差。**
- **D2** 退款口径三处统一:`rejection`/`cancel` 补 `setPayStatus(REFUND)`,三处已支付判断统一 `Orders.PAID.equals(payStatus)`(消 Integer `==` 陷阱 + `cancel` 字面量 1),`userCancelById` 不动。verifier 4/4(含未支付不误退锁可达路径)。**按 AD1 MED(.equals)订正落地。**
- **D3** 历史订单 3 tab + van-list 无限滚动:落地;AD1"只靠自动 @load"护栏在**切 tab 场景被实测推翻**(van-list 仅在 `finished` true→false 跳变时重触发),执行期订正为"切 tab 复位后置 `loading=true` 再手动调一次 `onLoad`",恰 1 请求、兼顾"勿双发"(见 progress step4)。
- **D4** 三页三路由 + Menu「我的」入口 + 成功页 orderId 接线:落地;orderId 每跳写 URL query(Confirm→Pay→Created)+ Created 缺 orderId 兜底退化 `/order-list`(端到端 verifier 7/7)。
- **D5** 用户中心纯导航壳:落地;`/user` 加载零后端请求(verifier 实测 `performance` resource 无 `/api` 调用),不新增端点。
- **端到端冒烟**:0002→0005 主链一次跑通(A~G 全 PASS,新下单 id=18:menu→cart→confirm→submit→pay→created→查看订单→detail→催单→历史订单[pageNum]→用户中心)。

**② divedeep backlog 收口(Tech Lead 拍板,2026-07-23):** 本 ADR 面试要点判定"本功能无高含金量必单开链路"——1 条**中**候选(订单越权修复全链路 / BOLA 在 Service 层差异化鉴权)+ 1 条**低**(历史订单分页,已被"员工分页"divedeep 覆盖)。**Tech Lead 决定:不为本功能写 divedeep**(中候选并入既有鉴权/越权主题即可,与 0003 D6 同模式两实例作对照素材)。backlog 关闭。

**③ 契约事实校准:** `historyOrders` 用错误参数名 `page` 的报错码,原判 400(`MissingServletRequestParameterException`)与实测不符——Phase 4 verifier 实测 **HTTP 500**(疑似缺 `pageNum` → `PageHelper.startPage(null,…)` NPE 兜底)。结论不变(前端必须用 `pageNum`),已同步订正契约 + AD1 HIGH#2 表述。

**④ 执行期教训沉淀:** AD1"van-list 只靠自动 @load 首拉"的护栏**对"首屏挂载"成立、对"切 tab 复位"不成立**(两场景 van-list 触发条件不同)——被独立 verifier 抓到(运动员≠裁判的价值)。再次说明:规划期写的前端组件行为假设需在执行期用真浏览器证伪,不能只凭文档下定论。
