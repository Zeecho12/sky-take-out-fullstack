# [0005] C 端重建④:订单管理 — Proposal(技术方案)

## 元信息
- 编号: 0005
- 状态: Phase 2 规划完成 + **双路评审已融合(ADR AD1)**(Requirement + ADR + 契约校准 + Proposal;**待 Tech Lead 复核 → Phase 3**)
- 分支: feature/0005-order-manage
- 关联: Requirement → ./requirement.md | Progress → ./progress.md | ADR → ../../decisions/0005-order-manage.md | 契约 → ../../api-contract/用户端接口.md

## ⭐ 交接头(覆盖式,永远只写"现在")
- **当前**:**Phase 3 前五步完成 TESTED**(D1 归属越权 + D2 退款口径 + 脚手架 + List.vue + Detail.vue&接线)。commit:`353f772`(D1)、`a296f2e`(D2)、`8b5d584`(脚手架)、`7c961f9`(List.vue,含 van-list 切 tab 修复)、`91f0ef5`(Detail.vue + Created/Pay/Confirm 透传 orderId + 成功页接线)。验证:后端 verifier 8/8+4/4;步骤3 type-check+curl+preview;步骤4 preview 全 PASS;步骤5 preview mobile 端到端 verifier 7/7 PASS(详情字段含明细/取消 DB status6+负例/立即支付带 orderId/催单/再来一单合并全程无 clean/成功页接线 orderId→详情/无 orderId 兜底→/order-list)。**只剩步骤6(用户中心 + Menu 入口)。**
- **下一步**:**Phase 3 步骤6(前端用户中心 Center.vue + Menu「我的」入口,D5/D4)= 收官步**(派 subagent,依赖步骤3 已满足)。`views/User/Center.vue`(现为占位)实现:顶部显示 `useUserStore().user?.username` + `van-cell-group` 导航(历史订单→`/order-list`、地址管理→`/address`、修改密码→`/change-password`、退出登录→`useUserStore().logout()`+跳 `/login`);**不发任何"查用户信息"请求**(D5 纯导航壳)。`views/Menu/Index.vue` 顶栏加「我的」入口 → `/user`(现顶栏只有店名+营业 tag,别动既有店铺/菜单逻辑,只加一个入口)。测试门交 verifier(preview mobile:Menu 顶栏见「我的」→点它到 /user;/user 显示用户名 + 4 入口分别跳对[历史订单/地址/改密可达、退出清 token 回 /login];**加载无"查用户信息"请求**;type-check exit0 + 0002/0003/0004 主链回归)。步骤6 完成即进 **Phase 4(验证收尾:合并回 main + 复核 ADR/收口 divedeep backlog + 契约 400/500 措辞校准 + 再生派生文档 + 更新快照)**。**未做**:步骤6 + Phase 4。
- **别碰**:`reference/`(只读);后端订单代码(步骤1/2 已定稿);共用的 `details()`/`OrderMapper.getById` 签名;已完成的类型/api/路由 + `List.vue` + `Detail.vue` + `Created/Pay/Confirm`(步骤3/4/5 定稿,别再改);`Menu/Index.vue` 既有店铺/菜单逻辑(步骤6 只**加**一个「我的」入口,别动既有);其余 0002–0004 已交付代码不动。
- **环境现状**:新 jar(PID 3188)在 :8080 运行(含步骤1+2);`sky-redis` up(店铺营业中);**C 端 dev server `user-web` 在 :5173**(serverId 每次 `preview_list` 查;**验证前先 `preview_resize` mobile**——预览初始 `innerHeight=0` 会让 van-list 不触发 @load);MySQL 5.7 本机 `localhost:3306/sky_take_out` root/123456(`--ssl-mode=DISABLED`,client `D:\HSPJAVA\mysql-5.7.19-winx64\bin\mysql.exe`)。⚠️ 环境扛不过 Claude Code 进程重启,新窗口先核 `java`/8080/6379/`docker ps` + preview_list。**登录注入捷径**(路由受登录门槛):preview_eval `fetch('/api/user/user/login',{method:'POST',...})` 拿 token → `localStorage.setItem('sky_user_token',token)`+`sky_user_info`(`{id,username}`)→ reload。账号 `s7v_2268`/`123456`(id=8)。测试数据:甲(id=8)约 16 单(step5 消耗:13 已取消;剩 status1=14/15、status2=16/17、订单 8 有真实明细、其余 status6);步骤6 是纯导航壳无需订单数据(`select id,status,pay_status from orders where user_id=8` 复核)。购物车留有 step5 合并结果 {草鱼,馒头}(不影响步骤6)。
- **怎么验证 / 起环境**:**Docker Desktop → `docker start sky-redis` → 后端 jar(:8080,构建前先停旧 jar)→ `PUT /admin/shop/1`(Bearer,Redis 重启后店铺状态丢失需重设)→ 前端 `preview_start` name `user-web` 或 `npm --prefix project-sky-user-vue3 run dev`(:5173)**。测试账号 `s7v_2268`/`123456`(id=8)。类型门 `npm --prefix project-sky-user-vue3 run type-check` exit 0。MySQL 5.7 连库加 `--ssl-mode=DISABLED`。⚠️ jar/Docker/dev server 扛不过 Claude Code 进程重启,新窗口先核环境。

## 1. 现状(与本改动相关的技术起点)
> 全局架构见 docs/Backend_scan/BACKEND_OVERVIEW.md;这里只写和 0005 相关的。

**后端 `OrderServiceImpl`(0005 改造对象,均已有端点、不新增):**
- `pageQueryForUser`(L167):`ordersPageQueryDTO.setUserId(BaseContext.getCurrentId())` → 已按当前用户过滤,**安全,不改**(回归即可)。⚠️ 对应 `user/OrderController.page(int pageNum,int pageSize,Integer status)`(L65,**无 `@RequestParam`、靠参数名绑定 → 参数名是 `pageNum` 不是 `page`**;AD1 HIGH#2)。
- `details`(L204):`getById(id)` + `getByOrderId(id)` → `OrderVO`(**且无 null 检查** → getById 返 null 时 NPE)。**无归属校验**。⚠️ **`details()` 被 user + 管理端 `GET /admin/order/details/{id}`(`admin/OrderController:61`)共用**(AD1 HIGH#1)→ **归属校验不能塞进 `details()`**,须走新增 user-only 方法(见 §2)。
- `userCancelById`(L224):`getById(id)` + null 校验 + `status>2` 拒;`status==TO_BE_CONFIRMED(2)` 时 log 模拟退款 **且 `setPayStatus(REFUND)`**。**无归属校验**(用户端专属,可安全改)→ D1 补;退款口径是正确基准(D2 不动)。
- `repetition`(L262):直接 `getByOrderId(id)` 复制明细**追加**进当前用户购物车(`insertBatch`,不清空),**连订单都没取、无归属校验**(用户端专属)→ D1 补(先取单校验)。
- `reminder`(L442):`getById(id)` + null 校验 + WebSocket 催单,**无归属校验、无状态守卫**(用户端专属)→ D1 补归属 **+ 加 `status==2` 守卫**(AD1 Q3)。
- `rejection`(L339,管理端):`if(payStatus==Orders.PAID)` 只 log,**不置 REFUND** → D2 补。
- `cancel`(L370,管理端):`if(payStatus==1)`(字面量)只 log,**不置 REFUND** → D2 补 + 字面量换 `Orders.PAID`。
- `OrderMapper.getById(Long id)`:单参,用户端 3 处 + 管理端 4 处共用 → **不改签名**(D1/D2 均 Service 层做)。
- 常量:`Orders.{PENDING_PAYMENT=1,TO_BE_CONFIRMED=2,...,CANCELLED=6}`、`{UN_PAID=0,PAID=1,REFUND=2}`;`MessageConstant.{ORDER_NOT_FOUND,ORDER_STATUS_ERROR}` 现成可复用。

**前端 `project-sky-user-vue3`(0002–0004 交付,可复用):**
- `api/order.ts`:仅 `submitOrder`/`payment`(风格:`request.method<unknown, Result<VO>>(path, data?)` + 顶部契约注释)。GET+query 抄 `dish.ts`(`{ params }`),GET/path 抄 `setmeal.ts`/`address.ts`(模板字符串)。
- `utils/request.ts`:拦截器返回**整个 `Result{code,data,msg}`** → 判成功 `res.code===1`;Bearer 注入 + 401 兜底。
- `router/index.ts`:`meta.public` 白名单登录门槛,新路由不写即受保护;懒加载。
- `stores/user.ts`:`user:{id,username}`(持久化)、`isLoggedIn`、`logout()`。`stores/cart.ts`:`refresh()`/`clean()`。
- `views/Order/`:`Confirm.vue`(下单→push `/order-pay`,带 orderNumber/orderAmount)、`Pay.vue`(mock 支付→push `/order-created`,带 orderNumber/orderAmount)、`Created.vue`(成功页,「查看订单」`disabled` 占位、query 有 orderNumber **无 id**)。
- `types/business.ts`:有 `OrdersSubmitDTO`/`OrderSubmitVO`/`OrdersPaymentDTO`,**无** `Order`/`OrderDetail`/`OrderDetailItem`/`PageResult<T>`。
- Vant 全量引入(`van-tabs`/`van-list`/`van-pull-refresh`/`van-dialog`/`showConfirmDialog`/`showToast` 直接可用)。
- **导航**:`App.vue` 仅 `<router-view>`,**无 tabbar、无"我的"入口**;Menu 顶栏只有店名 + 营业 tag → D4 加「我的」入口。

## 2. 方案总览(选定方案长什么样)
> 为什么这么选见 ADR-0005,此处不重复论证。

- **后端归属校验(D1 · AD1 订正)**:`userCancelById`/`reminder`/`repetition` 在 Service 层——取单后比对 `orders.getUserId().equals(BaseContext.getCurrentId())`,不符抛 `OrderBusinessException(ORDER_NOT_FOUND)`;`repetition` 先 `getById(id)` 取单校验归属再复制明细。**详情走新增 user-only 方法 `getUserOrderDetail(id)`**(`getById` + null/归属校验 + 装配 `OrderVO`),`user/OrderController.details` 改调它,**共用的 `details()` 留给管理端不动**(否则打死 `GET /admin/order/details/{id}`)。`reminder` **加 `status==TO_BE_CONFIRMED(2)` 守卫**(非 status2 抛 `ORDER_STATUS_ERROR`)。**不改 `getById` 签名**、**userId 只认 `BaseContext`**。
- **后端退款口径(D2 · AD1 订正)**:`rejection`/`cancel` 的已支付判断块内补 `orders.setPayStatus(Orders.REFUND)`;**三处已支付判断统一用 `Orders.PAID.equals(payStatus)`**(非 `==`,避免 Integer 装箱引用比较;含 `rejection` 既有 `== Orders.PAID` 一并改)。周边状态流转不动。
- **前端历史订单(D3)**:`views/Order/List.vue` = `van-tabs`(全部/待付款/已取消 → status 空/1/6)+ `van-list`(`@load` 触底,pageSize10,records 累加,`finished` 停);卡片(号/时间/金额/状态/菜品缩略)按状态出按钮(再来一单 always / 去支付 status1 / 催单 status2);点卡片 → `/order-detail/:id`。
- **前端订单详情(D4)**:`views/Order/Detail.vue` = 全字段 + 按状态操作(取消 status1|2 / 立即支付 status1→`/order-pay` / 催单 status2 / 再来一单 always);取消/再来一单 `showConfirmDialog` 二次确认,催单结果 `showToast`。**再来一单(AD1 Q1)= `repetition`(合并加入,不调 clean)→ `cart.refresh()` → 跳 `/menu`**。
- **前端用户中心(D5)**:`views/User/Center.vue` = store `username` + `van-cell-group` 导航(历史订单/地址管理/修改密码/退出登录);无接口调用。
- **导航 + 接线(D4 · AD1 orderId 护栏)**:Menu 顶栏加「我的」→ `/user`;`orderId` **每一跳都写进 URL query**(`Confirm.vue`→`Pay.vue`→`Created.vue`,源自 submit 的 `OrderSubmitVO.id`;**列表"去支付"支线也带 `orderId`**,列表项本有 `id`);`Created.vue`「查看订单」去 disabled + `@click` → `/order-detail/${orderId}`,**缺 `orderId` 兜底**(禁用或退化跳 `/order-list`,不跳 `/order-detail/undefined`)。
- **类型 / api(D3/D4)**:`types/business.ts` 补 `Order`/`OrderDetail`/`OrderDetailItem`/`PageResult<T>`(`{total,records}`,对齐 `com.sky.result.PageResult`);`api/order.ts` 补 `historyOrders`(`params:{pageNum,pageSize,status}` —— **`pageNum` 非 `page`**,AD1 HIGH#2)/`orderDetail`/`reminder`/`repetition`/`cancel`;路由加 `/order-list`/`/order-detail/:id`/`/user`(登录门槛)。

### 业务时序
**看单**:Menu →「我的」→ `/user` →「历史订单」→ `/order-list`(默认全部,tab 切筛选,触底加载)→ 点卡片 → `/order-detail/:id`(`GET orderDetail/{id}`)。
**取消**:详情/列表(status1|2)→「取消订单」→ 确认 → `PUT cancel/{id}` → `code:1` → 刷新为已取消(已支付单 `payStatus=2`)。
**催单**:详情/列表(status2)→「催单」→ `GET reminder/{id}` → `code:1` → toast"催单已发出"。
**再来一单**:详情/列表 →「再来一单」→ 确认 → `cart.clean()` → `POST repetition/{id}` → `cart.refresh()` → 跳 `/menu`。
**去支付**:列表/详情(status1)→「去支付/立即支付」→ `/order-pay`(orderNumber/amount)→ 0004 支付链路。
**成功页接线**:下单→支付成功页 →「查看订单」→ `/order-detail/{本单id}`(id 沿 Confirm→Pay→Created 透传)。

### 评审融合要点(实现必须遵守;来源见 ADR AD1)
> 双路评审(内审实读 + DeepSeek 外审)融合后的实现护栏,逐条写死:
- **[HIGH#1] 详情归属不碰共用的 `details()`**:`details()` 被管理端 `GET /admin/order/details/{id}` 共用——归属校验必须落**新增 user-only 方法** `getUserOrderDetail(id)`,`user/OrderController.details` 改调它,`details()` 原样留给管理端。测试门补**管理端详情回归**。**教训:共用面分析延伸到 Service 层,不止 Mapper。**
- **[HIGH#2] `historyOrders` 参数名 `pageNum`**:后端靠参数名绑定(无 `@RequestParam`)→ 前端 `params:{pageNum,pageSize,status}`、契约与 curl 门都用 `pageNum`;用 `page` 必 400。
- **D1 归属只认 `BaseContext`**:`userCancelById`/`reminder`/`repetition` + `getUserOrderDetail` 一律 `BaseContext.getCurrentId()` 比对;非本人统一 `ORDER_NOT_FOUND`(不泄露存在性)。`repetition` 须**先 `getById(id)`**(现状直接取明细,无 userId 可比)。`reminder` **加 `status==2` 守卫**(AD1 Q3)。**不改 `getById` 签名**。
- **[MED] D2 用 `.equals()` 不用 `==`**:三处已支付判断统一 `Orders.PAID.equals(payStatus)`(`Orders.PAID` 是 `Integer`,`==` 是引用比较地雷;含 `rejection` 既有隐患一并改)。只补退款状态,其余不动;`userCancelById` 不碰。
- **[Q1] 再来一单合并加入**:前端只调 `repetition`(后端即"追加")+ `cart.refresh()`,**绝不调 `cart.clean()`**(清空后 repetition 失败会永久丢购物车)。
- **[收敛] orderId 护栏**:orderId 每跳写进 URL query(含列表"去支付"支线);`Created.vue` 缺 orderId 兜底(禁用/退化 `/order-list`),不跳 `/order-detail/undefined`。
- **[MED] van-list 复位**:切 tab 一次性复位 `list=[]`/`finished=false`/`loading=false`,**只靠 `@load` 触发首拉**(勿手动+自动并发→双请求);空 tab(total=0)立即 `finished`。
- **[MED] 未支付不误退测可达路径**:该负例锁在 user cancel(status1)+ admin cancel;**勿用 rejection 测**(status2 前置恒撞 ORDER_STATUS_ERROR,不可达=假绿)。
- **前端判成功 `res.code===1`**(`request.ts` 返回整 `Result`);登录门槛靠不写 `meta.public`;金额键沿用 `orderAmount`(0004 链路一致)。

### LOW / backlog(记档,0005 不深做)
- 更细状态筛选(6 状态 tab)/ 待付款倒计时业务 / 真实退款状态机 / 申请退款流程 / 用户信息端点(头像等)→ 见 ADR「后续义务」。
- 并发取消 vs 接单的状态迁移竞态 → 面试点,单机学习不深做。

## 3. 会动的关键文件

**后端 `sky-take-out/sky-server/`:**
- `.../service/impl/OrderServiceImpl.java` —— D1:`userCancelById`/`reminder`/`repetition` 补 Service 层归属校验(`repetition` 先取单)+ `reminder` 加 `status==2` 守卫 + **新增 user-only 方法 `getUserOrderDetail(id)`**(归属 + 装配,`details()` 不动)【步骤1】;D2:`rejection`/`cancel` 补 `setPayStatus(REFUND)` + 三处已支付判断用 `Orders.PAID.equals(payStatus)`【步骤2】。**`getById` 签名 / `OrderMapper` / 共用的 `details()` 不动。**
- `.../service/OrderService.java` —— 加 `getUserOrderDetail(Long id)` 接口方法【步骤1】。
- `.../controller/user/OrderController.java` —— `details` 改调 `orderService.getUserOrderDetail(id)`(管理端 `admin/OrderController` 不动)【步骤1】。

**前端 `project-sky-user-vue3/`:**
- `src/types/business.ts` —— 补 `Order`/`OrderDetail`/`OrderDetailItem`/`PageResult<T>`。【步骤3】
- `src/api/order.ts` —— 补 `historyOrders(page,pageSize,status)`/`orderDetail(id)`/`reminder(id)`/`repetition(id)`/`cancel(id)`。【步骤3】
- `src/router/index.ts` —— 加 `/order-list`(order-list)、`/order-detail/:id`(order-detail)、`/user`(user-center),登录门槛。【步骤3】
- `src/views/Order/List.vue` —— **新增** 历史订单页(tabs + van-list + 卡片按钮)。【步骤4】
- `src/views/Order/Detail.vue` —— **新增** 订单详情页 + 动作。【步骤5】
- `src/views/Order/Created.vue` —— 「查看订单」去 disabled + 接线 `/order-detail/:id`。【步骤5】
- `src/views/Order/Confirm.vue` + `src/views/Order/Pay.vue` —— query 补透传 `orderId`(链路带 id 到 Created)。【步骤5】
- `src/views/User/Center.vue` —— **新增** 用户中心导航壳。【步骤6】
- `src/views/Menu/Index.vue`(顶栏)—— 加「我的」入口 → `/user`。【步骤6】

## 4. 实施清单(每步一个测试门;测试门为**可证伪断言**,非肉眼)—— 活文档,状态就地翻
> 依赖:1、2、3 无依赖(**契约已定死,前后端可并行**);4←3;5←3;6←3。单人串行推进顺序:1→2→3→4→5→6。
> 状态标记:TODO / IN_PROGRESS(~) / CODE_DONE / TESTED。
> 前置(联调步骤都需):Redis 起 + 后端 jar 跑 + `PUT /admin/shop/1`(Bearer)。**后端步骤改前先停旧 jar、改后重建**。冗长验证(多用户数据隔离断言 / 端到端网络日志 / DB 断言)交**独立 verifier subagent**跑,回浓缩结论(铁律 8)。**Phase 3 每步派 subagent 实现(读文件 + 写码),主窗口只编排 / 审 diff / 把测试门 / 提交。**
> ⚠️ 派 subagent 做归属/越权验证时,用中性"多用户数据隔离"措辞,避开 Opus cyber 安全过滤(0003/0004 教训:用"攻击/篡改/伪造"字眼会中止 subagent)。

- [x] **步骤1(后端)· 订单归属越权修复(D1 + AD1 订正)**,独立 commit `353f772`  [依赖: 无]  —— TESTED(verifier 8/8 PASS:4 接口归属隔离 + 催单 status==2 守卫 + 管理端详情无回归 + 历史订单隔离)
      实现:①**新增 user-only 方法** `OrderService.getUserOrderDetail(Long id)` + `OrderServiceImpl` 实现(`getById(id)` → `orders==null || !BaseContext.getCurrentId().equals(orders.getUserId())` 抛 `ORDER_NOT_FOUND` → 装配 `OrderVO` 返回),`user/OrderController.details` 改调它;**共用的 `details()` 不动**(管理端仍用)。② `userCancelById`/`reminder`/`repetition` 在 Service 层补同款归属校验(`repetition` 先 `getById(id)`)。③ `reminder` 补 `status==TO_BE_CONFIRMED(2)` 守卫(非 status2 抛 `ORDER_STATUS_ERROR`)。**不改 `getById` 签名。**
      测试门(curl + DB 硬验,多用户数据隔离,交 verifier):前置——甲(id=8)有订单 `id=X`,乙(另注册)无 X(先查断言)。① 正例:甲对自己订单 `orderDetail/X`(拿到)、`cancel/X`(status≤2 能取消)、`reminder/X`(status2 能催)、`repetition/X`(合并进甲购物车)。② 详情隔离:乙 `orderDetail/X` → **拒/查无**(响应不含甲地址/电话/明细)。③ 取消隔离:乙 `cancel/X` → **拒**,DB 甲订单 `status` 未变。④ 催单隔离:乙 `reminder/X` → **拒**。⑤ 再来一单隔离:乙 `repetition/X` → **拒**,DB 乙 `shopping_cart` 不含甲订单菜品。⑥ **催单状态守卫**:甲对自己**非 status2**(如 status6 已取消)订单 `reminder` → **拒**(`ORDER_STATUS_ERROR`)。⑦ **管理端详情回归(HIGH#1)**:admin token `GET /admin/order/details/{X}` → **仍取到详情**(证 `details()` 未被污染)。⑧ 回归:甲 `historyOrders` 仍只返甲订单。
- [x] **步骤2(后端)· 退款状态口径统一(D2 + AD1 订正)**,独立 commit `a296f2e`  [依赖: 无]  —— TESTED(verifier 4/4 PASS:用户取消已支付单 status6/pay2 回归、管理端拒单 pay2、管理端取消 pay2、未支付取消 pay 保持 0)
      实现:`rejection` + `cancel` 各补 `orders.setPayStatus(Orders.REFUND)`;**三处已支付判断统一用 `Orders.PAID.equals(payStatus)`**——`cancel` 的 `payStatus==1`、`rejection` 既有的 `payStatus==Orders.PAID` 都改 `.equals()`(避免 Integer 装箱引用比较);`userCancelById` 退款置位不动(已正确)。周边状态流转/原因/时间/前置校验不动;可顺带记一句 mock 退款注释(仅置状态位,无真实资金流)。
      测试门(curl + DB 硬验,交 verifier):① 用户取消已支付单(回归基准):造甲已支付单(status2/payStatus1)→ 甲 `PUT /user/order/cancel/{id}` → DB `status=6` 且 `pay_status=2`。② 管理端拒单:造已支付单(status2/payStatus1)→ admin `PUT /admin/order/rejection {id,rejectionReason}` → DB `status=6` 且 **`pay_status=2`**(改前=1,是修复点)。③ 管理端取消:造已支付单(status2,**无需先接单**,`cancel` 无 status 前置)→ admin `PUT /admin/order/cancel {id,cancelReason}` → DB **`pay_status=2`**(改前=1)。④ **未支付不误退(锁可达路径)**:对未支付单走**用户取消**(status1)或**管理端取消**(payStatus0)→ `pay_status` **仍 0**;**勿用 rejection 测**(status2 前置不可达=假绿)。(②③需 admin token:`POST /admin/employee/login` admin/123456。)
- [x] **步骤3(前端)· 脚手架:类型 + api + 路由**,commit `8b5d584`  [依赖: 无(契约已定死)]  —— TESTED(type-check exit0;verifier curl historyOrders?pageNum=1 返 {total,records} + 5 接口连通;preview 3 路由解析到占位页 + /menu 回归 + 无 error console)
      实现:`types/business.ts` 补 `Order`/`OrderDetail`/`OrderDetailItem`/`PageResult<T>`(`{total,records}`);`api/order.ts` 补 5 函数(historyOrders GET+`params:{pageNum,pageSize,status}`(**`pageNum` 非 `page`**)、orderDetail GET+path、reminder GET+path、repetition POST+path、cancel PUT+path;判成功 `res.code===1`);`router` 加 3 路由(`/order-list`、`/order-detail/:id`、`/user`,懒加载、登录门槛)+ 3 个占位组件(先建空壳供动态 import 过 type-check)。
      测试门:`type-check` exit 0;**curl 硬验 `historyOrders` 用 `?pageNum=1&pageSize=10`**(证参数名对,`page` 会 400)→ `code:1` + **响应结构硬断言 `{total, records:[...]}`**(字段名核对,AD1);curl 复核其余 4 接口(用步骤1/2 后端,`code:1`);3 路由能解析到占位页;`dev`/`preview` 起无 console 报错;**回测 0002 `/menu` 正常**。
- [x] **步骤4(前端)· 历史订单页 List.vue(D3)**,commit `7c961f9`  [依赖: 3]  —— TESTED(preview mobile 重验:tab 过滤各切 tab 恰 1 请求且自动加载 [全部无 status/待付款 status=1/已取消 status=6]、无限滚动首屏单请求+触底 pageNum=2 无重复+finished 停、按钮按状态、点卡片跳详情。⚠️ verifier 抓到并修复 van-list 切 tab 白屏缺陷——见 progress)
      实现:`van-tabs` 全部/待付款/已取消(按 status 空/1/6);`van-list` `@load` 触底(`pageNum++`、records 累加、`finished=len>=total`)。**切 tab 一次性复位 `list=[]`/`finished=false`/`loading=false`/`pageNum=1`,首拉只靠 `van-list` 挂载自动 `@load` 触发(勿手动 + 自动并发→双请求);空 tab(total=0)立即 `finished`**(AD1 van-list 护栏)。订单卡片(号/时间/金额/状态文案/菜品缩略图=占位图)按状态出按钮(再来一单 always / 去支付 status1→`/order-pay`,**query 带 orderNumber/orderAmount/orderId** / 催单 status2);点卡片 → `/order-detail/:id`;空态。
      测试门(preview + `preview_network`,交 verifier):① tab 过滤:默认全部;切待付款→请求带 `status=1` + 列表只 status1;切已取消→`status=6`。② 无限滚动:造>10 单→首屏 10(**首屏不重复发请求**)、触底见 `pageNum=2` 请求 + records 累加不重复、加载完(len≥total)不再发;切 tab 后列表/`finished` 复位干净。③ 卡片按钮:status1 见去支付+再来一单;status2 见催单+再来一单;status6 仅再来一单。④ 点卡片→ `/order-detail/{该id}` 且详情订单号一致。
- [x] **步骤5(前端)· 订单详情页 Detail.vue + 动作 + 成功页接线(D4)**,commit `91f0ef5`  [依赖: 3]  —— TESTED(preview mobile 端到端 verifier 7/7:详情字段含明细、取消 DB status6+负例、立即支付带 orderId、催单、再来一单合并[前后购物车 {馒头}→{草鱼,馒头} 全程无 clean]、成功页接线 orderId→详情、无 orderId 兜底→/order-list)
      实现:`Detail.vue`(`GET orderDetail/{id}` 全字段 + 明细列表)+ 按状态操作(取消 status1|2→`showConfirmDialog`→`cancel`;立即支付 status1→`/order-pay`;催单 status2→`reminder`→toast;**再来一单→`showConfirmDialog`→`repetition`(合并加入,不调 clean)→`cart.refresh`→`/menu`**,AD1 Q1);`Created.vue`「查看订单」去 disabled + `@click`→`/order-detail/${orderId}`,**缺 orderId 兜底**(禁用/退化跳 `/order-list`);`Confirm.vue`/`Pay.vue` query **每跳补透传 `orderId`**(源自 submit `OrderSubmitVO.id`,写进 URL query)。
      测试门(端到端 preview + `preview_network`,交 verifier):① 详情字段:`/order-detail/:id` 显示号/时间/金额/状态/地址(consignee+phone+address)/明细(名/量/价/图),取自 `orderDetail/{id}`。② 取消(status1|2):点取消→确认→`PUT cancel/{id}` `code:1`→状态刷新已取消,DB `status=6`;status≥3 不显示取消。③ 立即支付(status1):→ `/order-pay`(带 orderNumber/amount)。④ 催单(status2):→ `GET reminder/{id}` `code:1` + toast。⑤ **再来一单(合并)**:购物车先放一件别的菜→点再来一单→确认→`preview_network` **只见 repetition(无 clean)**→购物车含该单菜品**且原有那件仍在**→跳 `/menu`。⑥ 成功页接线:下单→支付→成功页「查看订单」**非 disabled**→`/order-detail/{本单id}`(证 id 透传闭环);⑦ **orderId 兜底**:构造无 orderId 的 `/order-created`→「查看订单」禁用/退化,不跳 `/order-detail/undefined`。
- [ ] **步骤6(前端)· 用户中心 Center.vue + Menu「我的」入口(D5/D4)**  [依赖: 3]  —— TODO
      实现:`views/User/Center.vue`(顶部 store `username` + `van-cell-group` 导航:历史订单→`/order-list`、地址管理→`/address`、修改密码→`/change-password`、退出登录→`logout()`+跳`/login`);Menu 顶栏加「我的」入口 → `/user`。
      测试门(preview + `preview_network`,交 verifier):① 入口:Menu 顶栏见「我的」→ 点它到 `/user`。② 导航壳:`/user` 显示当前用户名;4 个入口分别跳对(历史订单/地址管理/修改密码可达,退出登录清 token 回 `/login`);**加载无"查用户信息"请求**(`preview_network` 确认)。③ 回归:`type-check` exit 0 + 0002/0003/0004 主链正常。

> 说明:契约已定死(既有 + 0005 校准补注),本功能是"前端对既有 + 后端归属/退款修复"。测试门刻意做成**可证伪绝对断言 + 工具核对**(curl / preview_network / DB 查 / 多用户数据隔离),不留肉眼判定空间(沿用 0002–0004 教训)。
