# [0005] C 端重建④:订单管理 — Progress(现场笔记)

> 追加式:每个窗口/关键节点追加一条,新的在下。里程碑历史看 `git log`;当前快照看 proposal 交接头。
> 纪律:只记 git 看不出的东西(验证证据 / 发现 / 踩坑 / 临场决策),别抄 diff。

---

## 2026-07-23 · Phase 2 立项 + 规划

**做了什么**
- 读状态(铁律 1):CLAUDE.md 快照 + blueprint(0005 收官、两笔 backlog)+ 0003/0004 全套(格式/深度范本 + D6 归属修法 + 越界纪律)+ 契约用户端 5 端点 + `OrderServiceImpl` 五端点方法体 + GOOD.md §3 Phase 2 + WORKFLOW。
- 向 Tech Lead 复述 6 决策点(比 blueprint 记的两笔宽:实读发现越权是**一整片** 4 处,不止 `userCancelById`)→ **全部拍板**:D1 归属校验 4 处全修 Service 层 / D2 退款口径三处统一 REFUND(授权越界碰管理端)/ D3、D4 授权我对齐 reference 定 / D5 用户中心纯导航壳。
- 派 2 个 Explore subagent(保护主窗口上下文):①摸 reference 订单管理交互(historyOrder 3 tab、details 按状态出按钮、my 取 Vuex 不查接口、success→details、导航层级 my→history→details);②摸 C 端前端现状(request.ts 返整 Result 判 `code===1`、无 tabbar/无"我的"入口需从零加、Created 查看订单 disabled 且 query 缺 id、Vant 全量、路由 meta.public 门槛)。
- 自核后端事实:`Orders` 状态常量(TO_BE_CONFIRMED=2/PAID=1/REFUND=2/CANCELLED=6)、`MessageConstant.ORDER_NOT_FOUND` 可复用、`rejection`/`cancel` 确由 `controller/admin/OrderController`(L84/L98)调用=管理端(D2 越界点坐实)。
- 切分支 `feature/0005-order-manage`(自 main);产出 Requirement + ADR-0005(五决策)+ 契约校准(用户端接口.md 加「订单管理约定(0005 校准补注)」段)+ Proposal(6 步)+ 本 progress。

**关键决策(详见 ADR-0005)**
- D1 越权 4 处全修(Service 层比对 `BaseContext`,不改 `getById` 签名,仿 0003 D6)/ D2 三处退款口径统一置 REFUND + `cancel` 字面量换 `Orders.PAID`(越界只补退款状态)/ D3 3 tab(全部/待付款/已取消 → status 空/1/6)+ van-list 无限滚动(对齐 reference)/ D4 三页三路由 + Menu「我的」入口(不引全局 tabbar)+ 成功页查看订单接线(补透传 orderId,完成 0004 留的钩子)/ D5 用户中心纯导航壳(不新增端点)。

**实读挖出的关键约束 / 发现**
- **越权是一整片,不是一笔**:blueprint 只记了 `userCancelById`,实读发现 `details`/`repetition`/`reminder` 同样只按 id 取数无归属校验——`details` 泄露他人地址/电话/明细,`repetition` 能把他人订单菜品灌进自己购物车(数据泄露),`reminder` 能对他人订单催单。唯一安全的是 `pageQueryForUser`(按当前用户过滤)。→ D1 扩到 4 处。
- **`getById` 被 7 处共用**(用户端 3 + 管理端 4)→ 改签名会打死管理端(与 0003 D6 完全同构)→ 归属校验必须走 Service 层。
- **前端无导航入口到"我的/订单"**:App.vue 只有 router-view,Menu 顶栏无入口 → D4 需从零加(选顶栏「我的」而非全局 tabbar,省布局层改造)。
- **Created 查看订单缺 id**:0004 链路只透了 orderNumber,submit 返回的 `id` 丢了 → 接线详情需沿 Confirm→Pay→Created 补透传 orderId。

**下一步**
- **双路评审**:内审(会话内全新上下文红队 subagent,实读源码逐条证伪)+ 外审(DeepSeek-v4-pro `~/.claude/tools/deepseek_review.py`)→ 融合入 ADR AD1 → Tech Lead 复核 → 进 Phase 3 步骤1(派 subagent)。

**坑 / 备忘**
- 越权/归属验证任务派 subagent 时,用中性"多用户数据隔离"措辞,避开 Opus cyber 安全过滤(0003/0004 踩过:用"攻击/篡改/伪造"字眼会中止 subagent)。
- D2 越界碰管理端 `rejection`/`cancel` 时**只补 `setPayStatus(REFUND)` 一行**,其余状态流转不动(仿 0004 D4 只拆外呼一行的越界纪律)。
- 环境扛不过进程重启(0004 教训):Phase 3 联调前先核 `java`/8080/6379/`docker ps`;测试消耗真实订单,verifier 造数注意 Git Bash 中文字节坏 → curl body 用 ASCII/确保 UTF-8。

---

## 2026-07-23 · 双路评审融合(Phase 2 收尾)

**做了什么**
- 跑双路敌对评审:内审(会话内全新上下文红队 subagent,**实读源码**逐条证伪)+ 外审(DeepSeek-v4-pro,**只看 requirement/ADR/proposal**),融合入 ADR AD1。
- **净判定:两路一致——修订后可进 Phase 3**。**2 项 HIGH 必修全靠内审实读源码**(外审只看文档抓不到),再次坐实异构双路价值:能读码的一路管"契约/共用面是否真成立",看文档的一路管"设计/UX/安全面是否被粉饰"。

**收敛 / 内审独有 / 外审独有 / 处置(详见 ADR AD1)**
- **[内审 HIGH#1 · 必修] 归属校验放共用的 `details()` 会打死管理端订单详情**:`orderService.details()` 被 user + 管理端 `GET /admin/order/details/{id}`(`admin/OrderController:61`)共用 → 塞归属后管理端(sub=员工 id≠订单 userId)恒抛"订单不存在"。→ 改**新增 user-only 方法 `getUserOrderDetail(id)`**,`details()` 留管理端;补管理端详情回归门。**教训:共用面分析要延伸到 Service 层,不止 Mapper——我 D1 只盘了 `getById` 7 处共用、漏了 `details()` 本身也共用。**
- **[内审 HIGH#2 · 必修] `historyOrders` 参数名 `pageNum` 非 `page`**:`user/OrderController:65` 无 `@RequestParam`、靠参数名绑定 → 用 `page` 发参 400。→ 契约/前端/curl 门统一 `pageNum`。属"contract-first 下契约(YAPI 导出)本身写错参数名"。
- **[内审 MED]** payStatus 用 `.equals()` 非 `==`(`Orders.PAID` 是 Integer,`==` 引用比较地雷、且与项目 `userCancelById` 的 `.equals()` 惯例不一致)——**恰恰推翻我 ADR D2"消除魔法数字"的卖点**,订正为三处统一 `Orders.PAID.equals(payStatus)`(含 `rejection` 既有隐患);"未支付不误退"经 rejection 恒真(status2 前置不可达)→ 负例锁 user/admin cancel;van-list 切 tab 复位 4 状态 + 只 `@load` 首拉防双请求。
- **[收敛]** orderId 透传脆弱:外审(刷新丢)+ 内审(列表去支付支线 → `/order-detail/undefined`)→ 每跳写 URL query + Created 缺 id 兜底。
- **[外审→拍板]** 再来一单清空购物车数据丢失(内审证 clean=全删、repetition=追加,"repetition 后 clean"不可行)→ **Q1 合并加入不清空**;3 tab 看不到进行中 → **Q2 保持 3 tab + backlog**;催单无后端状态校验 → **Q3 加 status==2 守卫**。
- **[外审记档]** 退款"假一致"(仅状态位无资金流)→ 注释 + ADR 标注;PageResult 实读证 `{total,records}` 结构对(加分页硬断言门兜底);JWT logout 不失效 → 0001 认证域已知局限,记面试点。
- **[内审核对通过]** 另 3 处越权点用户端专属可安全改;`ORDER_NOT_FOUND` 反枚举正确;`OrderMapper.xml` 动态 `<if payStatus>` 能只更 payStatus;6 步依赖无编译死锁(步骤3 先建占位组件)。

**拍板(Tech Lead,2026-07-23)**:Q1 合并加入不清空 / Q2 3 tab 对齐 reference / Q3 催单加 status==2 守卫;2 HIGH 必修 + 内审 MED + 收敛护栏 + 外审记档一并落 requirement/proposal/ADR/契约。

**下一步**
- Tech Lead 复核融合稿 → 进 Phase 3 步骤1(派 subagent 实现:新增 `getUserOrderDetail` + 4 处归属 + reminder 守卫)。

**坑 / 备忘**
- **共用面分析别止于 Mapper**:这次的 HIGH#1 就是"坚持不改 `getById` 签名"却漏了 `details()` Service 方法本身 user+admin 共用——共用点在 Service 层也会咬人。
- **契约参数名要实读后端绑定方式**:无 `@RequestParam` 时靠参数名绑定,YAPI 导出的 `page` 与代码 `pageNum` 漂移 → contract-first 也救不了"契约本身抄错"。
- Integer `==` 陷阱:`-128..127` 缓存内碰巧为真,出了缓存区就是 bug;比较包装类型一律 `.equals()`。

---

## 2026-07-23 · Phase 3 步骤1 后端归属越权修复(D1 + AD1 订正)—— 完成 TESTED

**做了什么(铁律 8:读文件+写码派 subagent,主窗口只编排/审 diff/把测试门/提交)**
- 读状态复述(铁律 1)→ Tech Lead 确认后动手。
- 派**实现 subagent**改 3 文件(零决策,改动全在 ADR 锁定):`OrderService` 加 `getUserOrderDetail(Long id)`;`OrderServiceImpl` 新增该方法实现(getById→null/归属校验→装配 OrderVO)+ `userCancelById`/`reminder` 补归属 + `repetition` 先 getById 取单再校验 + `reminder` 加 status==2 守卫;`user/OrderController.details` 改调 `getUserOrderDetail`。**共用的 `details()`、`OrderMapper.getById` 签名均未动。** IDE 内置 Maven `mvn -pl sky-server -am compile` PASS。
- 主窗口审 diff:50 行纯新增(details() 一行未删改)+ controller 单行替换。停旧 jar(PID 12396)→ `mvn -DskipTests package` 重建(77MB fat jar)→ 起新 jar(PID 28664,:8080 200)。
- 派**独立 verifier subagent**跑测试门(中性"多用户数据隔离"措辞)。
- 提交 code commit `353f772`(独立,只 3 后端文件)。

**验证证据(verifier,curl+DB,8/8 PASS)**
- 甲 `s7v_2268`/id=8、乙新注册 `iso_check_18468`/id=14、admin 员工 id=1。复用订单:X_paid=8(status2/pay1)、X_cancelable=7、非 status2 单=1(status6)。
- ①本人可用:甲 detail/cancel(7→DB status6)/reminder(8,status2)/repetition 全 code:1。②详情隔离:乙 detail/8→code:0"订单不存在",data:null(无地址/电话/明细泄露)。③取消隔离:乙 cancel/8→拒,DB order8 status 仍 2。④催单隔离:乙 reminder/8→拒。⑤再来一单隔离:乙 repetition/8→拒,乙购物车前后 0 行。⑥催单状态守卫:甲对自己 order1(status6)reminder→code:0"订单状态错误"(归属过、状态守卫挡)。⑦管理端详情回归:admin `GET /admin/order/details/8?id=8`→code:1+完整详情(未被归属污染)。⑧历史订单隔离:甲 historyOrders?pageNum=1&pageSize=10→total7,records 全 userId:8。

**坑 / 发现**
- **归属校验放在状态守卫之前**(reminder):乙催甲单先撞归属→"订单不存在"(不泄露存在性);甲催自己非 status2 单归属过→撞"订单状态错误"。两条负例可区分,与测试门 ④⑥ 对齐。
- **管理端 `GET /admin/order/details/{id}` 的 `id` 无 `@PathVariable`**(既有写法,本次未改):纯路径调用 id 绑定为 null→HTTP 500,须用 `?id=8`(query)才拿到详情。这是既有 quirk,非本次引入——⑦ 回归判据只认"不返回订单不存在"(证 details() 未被归属污染),已 PASS。→ 记面试/技术债,0005 不修(不在步骤1 范围)。
- 环境:重建前先停旧 jar(否则端口占用);java 21 运行 jdk17 编译产物 OK。测试消耗真实数据(order7 被取消、甲购物车被 repetition 灌入)——学习项目可接受。

**下一步**
- Phase 3 步骤2(后端退款口径统一 D2 + AD1 订正):`rejection`/`cancel` 补 `setPayStatus(REFUND)` + 三处已支付判断统一 `Orders.PAID.equals(payStatus)`。独立 commit,派 subagent 实现、verifier 跑退款口径测试门(含未支付不误退锁可达路径)。

---

## 2026-07-23 · Phase 3 步骤2 后端退款口径统一(D2 + AD1 订正)—— 完成 TESTED

**做了什么(铁律 8)**
- 派实现 subagent 改 1 文件 `OrderServiceImpl.java` 两个管理端方法:`rejection`/`cancel` 已支付判断改 `Orders.PAID.equals(payStatus)`(消 Integer `==` 引用比较陷阱、消 `cancel` 字面量 `1`)+ 块内补 `orders.setPayStatus(Orders.REFUND)`;`orders` 更新对象构建上移到判断前(对齐 `userCancelById` 惯例,让退款置位落判断块内)。`userCancelById` 不动;`cancel` 既有 `getPayStatus()` 无 null 检查不扩范围修(AD1 LOW)。编译 PASS(+16/-12)。
- 主窗口审 diff(status/reason/time/update 全不变,仅新增退款状态位)→ 停旧 jar → `mvn -DskipTests package` 重建 → 起新 jar(PID 3188,:8080 200)→ 派 verifier。
- 提交 code commit `a296f2e`(独立,仅 OrderServiceImpl.java)。

**验证证据(verifier,curl+DB,4/4 PASS,全 DB 直接造单)**
- 造单 id 9(user8/status2/pay1)、10(同)、11(同)、12(user8/status1/pay0),number T20260723001~004。
- ①甲 `PUT /user/order/cancel/9`→code1,DB 9: status 2→6、pay_status 1→2(回归基准不破)。②admin `rejection {id:10}`→code1,DB 10: 2→6、pay 1→**2**(修复点,改前停 1)。③admin `cancel {id:11}`→code1,DB 11: 2→6、pay 1→**2**(修复点)。④甲 `cancel/12`(status1 未付)→code1,DB 12: 1→6、pay **0→0 保持**(不误退)。reason 字段落库正确。

**坑 / 发现**
- **④ 锁可达路径 = user cancel(status1)**,没走 rejection:rejection 有 status==2 前置,而 status2 必已支付,造不出"未支付+status2"→ 走 rejection 恒撞 ORDER_STATUS_ERROR、到不了退款分支=假绿(AD1 内审)。验证选对了路径。
- **Git Bash 传中文 body 坏码**(与本 feature 开篇备忘一致):verifier 首轮 `rejectionReason:"库存不足"` 经 Git Bash 编码破坏 → 请求体 JSON 解析失败 400(未进业务),换 ASCII/文件承载 body 重发即 code1。测试环境编码问题非代码缺陷;400 未触达业务故订单状态未变,重发才生效。
- `OrderMapper.update` 的动态 `<if test="payStatus!=null">` 保证:只在已支付分支 set payStatus,未支付单 update 不带 payStatus 列 → pay_status 保持 0(④ 得以成立)。

**下一步**
- Phase 3 步骤3(前端脚手架:`types/business.ts` 补 4 类型 + `api/order.ts` 补 5 函数[historyOrders 参数名 `pageNum`] + `router` 加 3 路由 + 3 占位组件),测试门 type-check exit0 + curl 硬验 historyOrders `?pageNum=1&pageSize=10` 返 `{total,records}`。后端两步已收尾,余下纯前端。

---

## 2026-07-23 · Phase 3 步骤3 前端脚手架(类型+api+路由+占位)—— 完成 TESTED

**做了什么(铁律 8)**
- 派实现 subagent:`types/business.ts` 末尾补 `OrderDetailItem`/`Order`/`OrderDetail extends Order`/`PageResult<T>`(字段对齐后端 `OrderDetail`/`Orders`/`OrderVO`/`PageResult`);`api/order.ts` type-only import 扩容 + 补 5 函数(historyOrders GET `params:{pageNum,pageSize,status}`、orderDetail/reminder GET+path、repetition POST+path、cancel PUT+path,沿用 `request.xxx<unknown,Result<T>>`);`router` 加 3 路由(懒加载、不写 meta.public 受登录门槛)+ 新建 3 占位 .vue 空壳。`npm run type-check` exit0 一次过。
- 主窗口审 diff(纯新增 107 行,风格与既有一致)→ 提交 code commit `8b5d584`。
- 运行时门分两块:curl 契约交 verifier;preview 浏览器门主窗口做(原生 preview 工具,占位页快照极小、不冗长)。

**验证证据**
- **curl(verifier)**:historyOrders `?pageNum=1&pageSize=10`→code1,`data` 顶层键 = `total`(11)+`records`(数组),字段名正确;orderDetail/8→code1,全字段+`orderDetailList`(与类型对齐);reminder/repetition/cancel 均连通返 Result。
- **preview(主窗口)**:登录注入(fetch `/api/user/user/login` 拿 token 写 `sky_user_token`/`sky_user_info` 两 key,绕过 Vant 表单填充问题)→ `/user`、`/order-list`、`/order-detail/8` 三路由**均解析到各自占位页文案**(登录态下不被重定向,证登录门槛+懒加载都对);`/menu` 回归完整渲染(营业中+分类+菜品+价格);error 级 console 为空。

**坑 / 发现**
- **反证 `page`(错误参数名)返 HTTP 500 而非契约/AD1 写的 400**:verifier 实测缺 `pageNum` 时后端抛 500(疑似 `pageNum` 缺失→PageHelper NPE 兜底,而非 `MissingServletRequestParameterException` 400)。不影响结论(前端用 `pageNum` 已验证 code1+{total,records});契约 line64 / ADR AD1 HIGH#2 的"400"表述与实测有偏差 —— **待定:是否校准契约措辞为 400/500**(非本步 DoD,记一笔)。
- **preview 登录用 UI 表单点击没发出 login POST**(网络日志只见 GET /login):Vant `van-field` 的 preview_fill/click 组合没触发提交。改用 preview_eval 直接 fetch 登录 + 写两个 localStorage key(`stores/user.ts` 初始化即从 `sky_user_token`/`sky_user_info` 读)→ reload 即登录态。**这是后续前端步骤验证登录门槛页的通用捷径**(已写进交接头)。
- verifier 又消耗了订单 8(cancel 8:status2→6 + repetition/8 灌购物车)——step4 无限滚动需 >10 单,大概率要 verifier 造单。

**下一步**
- Phase 3 步骤4(历史订单页 List.vue,D3):van-tabs 3 tab + van-list 无限滚动(AD1 复位/单请求护栏)+ 卡片按状态出按钮 + 点卡片跳详情。交 verifier 跑 preview_network 测试门。

---

## 2026-07-23 · Phase 3 步骤4 历史订单页 List.vue(D3)—— 完成 TESTED(含一处 van-list 缺陷修复)

**做了什么(铁律 8)**
- 派实现 subagent 把占位 `List.vue` 覆盖为完整实现(van-tabs 3 tab + van-list 无限滚动 + 卡片按状态出按钮 + 去支付/催单/再来一单合并动作 + 点卡片跳详情 + 切 tab 竞态守卫)。type-check exit0。
- 主窗口审(读文件确认逻辑)→ 重启 dev server(preview_list 曾空)→ 派 verifier 跑 preview 门。
- **verifier 抓到 gate① FAIL(真 bug)** → 主窗口定修法 → 派 subagent 改一处 `watch(activeTab)` → 主窗口 preview 重验通过 → 提交 `7c961f9`(初版+修复合一)。

**验证证据(preview,mobile 视口)**
- ② 无限滚动 PASS:全部 tab 首屏**只 1 次** `historyOrders?pageNum=1`(AD1 首拉不双发 ✓),触底 `pageNum=2` 累加、无重复 id、`finished` 后停。
- ③ 按钮按状态 PASS:status1=去支付+再来一单 / status2=催单+再来一单 / status6=仅再来一单。
- ④ 点卡片 PASS:非按钮区点击→`/order-detail/{该单id}`(占位页可见)。
- ① tab 过滤:修复后重验 PASS——从全部切待付款→**无需滚动即自动加载** 3 条全 status1、请求恰 1 次 `...&status=1`;切已取消→10 条 status6、`...&status=6`;切回全部→无 status、10 条混合。每次切 tab 恰 1 次请求。

**坑 / 发现(高价值)**
- **van-list 切 tab 白屏缺陷(推翻 AD1 一处假设)**:AD1 护栏原写"切 tab 只复位 `finished=false`、首拉只靠 van-list 自动 @load"。实测**不成立**:Vant van-list 的 `@load` 只在 `finished` 发生 `true→false` **跳变**(或 scroll/mount)时重查;从"未加载完(`finished` 恒 false、数据>1页)"的 tab 切走时复位 `finished=false` **无跳变** → 不重触发 → 新 tab 白屏,要手动滚一下才出。对照实验坐实(从已 `finished=true` 的 3 单 tab 切走则正常,差别只在 finished 是否跳变)。**修法**:切 tab 复位后**先置 `loading=true` 再手动调一次 `onLoad()`**——van-list 在 loading 期间不并发触发,故切 tab 恰 1 次请求(既治白屏、又守住 AD1"勿双发");初始挂载不加手动调用,仍纯靠 van-list 挂载自动首拉。**教训:AD1"只靠自动 @load"对"首屏挂载"成立,但对"切 tab 复位"不成立——两个场景 van-list 触发条件不同,不能一概而论。**
- **预览环境 `window.innerHeight=0`**:Vite preview 初始视口高 0 → van-list 可见性检测永不触发 @load、列表全空(假 FAIL)。**verifier/验证前必须先 `preview_resize` mobile(375×812)**。已写进交接头,后续前端验证通用。
- verifier 造单补齐:甲(id=8)现有 16 单(status1×3=id13/14/15、status2×2=id16/17、其余 status6),供步骤5 直接用。

**下一步**
- Phase 3 步骤5(订单详情页 Detail.vue + 动作 + 成功页接线,D4):orderDetail 全字段 + 取消/立即支付/催单/再来一单;Created 查看订单去 disabled + orderId 兜底;Confirm/Pay 补透传 orderId。复用 List.vue 动作写法。

---

## 2026-07-23 · Phase 3 步骤5 详情页 Detail.vue + 动作 + 成功页接线(D4)—— 完成 TESTED

**做了什么(铁律 8)**
- 派实现 subagent 改 4 文件:`Detail.vue`(占位→实现:orderDetail(route.params.id) 全字段+明细 + 按状态动作,复用 List.vue 的 cancel/reminder/repetition/goPay 写法);`Created.vue`(查看订单去 disabled + `goDetail`:有 orderId 跳 `/order-detail/:id`、缺则退化 `/order-list`);`Pay.vue`/`Confirm.vue`(query 每跳补透传 orderId:Confirm 源自 `res.data.id`=OrderSubmitVO.id → Pay → Created)。type-check exit0。
- 主窗口审 diff(三处透传接线贯通 Confirm→Pay→Created)→ 派 verifier 跑 preview mobile 端到端。
- 提交 code commit `91f0ef5`(4 文件)。

**验证证据(verifier,preview mobile 端到端,7/7 PASS)**
- ①详情字段:`/order-detail/8`(有明细单)显示号/时间/状态/收货(张三/13800000001/U1自己改的)/明细(草鱼2斤 x1 ¥68)/合计 ¥75,命中 `GET orderDetail/8` code1。②取消:`/order-detail/13`(status1)取消→确认→`PUT cancel/13` code1→刷新已取消,DB status=6;负例:status6 单只显「再来一单」,不显取消/支付/催单。③立即支付:status1→`/order-pay?orderNumber=..&orderAmount=..&orderId=14`(orderId 带上)。④催单:status2→`GET reminder/16` code1 + toast。⑤**再来一单合并**:购物车基线 {馒头}→点再来一单(订单8)→确认→**只 `POST repetition/8`、全程无 clean/deleteByUserId 请求**→跳 /menu→购物车 {草鱼,馒头}(合并非替换)。⑥成功页接线:`/order-created?...&orderId=14`→查看订单非 disabled→`/order-detail/14`。⑦orderId 兜底:`/order-created` 无 orderId→查看订单→`/order-list`(非 `/order-detail/undefined`)。

**坑 / 发现**
- **orderId 透传闭环靠"每跳写 URL query"**(AD1 收敛):Confirm 的 submit 响应 `OrderSubmitVO.id` → 每一跳(Confirm→Pay→Created)query 显式带 orderId,Created 再用它跳详情;缺 orderId 一律退化 `/order-list`,杜绝 `/order-detail/undefined`。verifier ⑥⑦ 分别验了正例闭环与兜底负例。
- **详情/再来一单需要有明细的单**:脚手期造的 13-17 无 order_detail,只能验取消/支付/催单(不看明细);①明细展示与⑤再来一单合并用订单 8(有真实明细)验。
- step5 消耗订单 13(status1→6);购物车留 {草鱼,馒头}(step6 纯导航壳不受影响)。

**下一步**
- Phase 3 步骤6(收官):`User/Center.vue` 纯导航壳(store username + van-cell-group:历史订单/地址/改密/退出)+ `Menu/Index.vue` 顶栏加「我的」入口。测试门 preview:Menu「我的」→/user、4 入口跳对、退出清 token 回 /login、加载无查用户信息请求、0002-0004 回归。之后进 Phase 4 收尾。

---

## 2026-07-23 · Phase 3 步骤6 用户中心 + Menu 入口(D5/D4)—— 完成 TESTED(Phase 3 收官)

**做了什么(铁律 8)**
- 派实现 subagent 改 2 文件:`User/Center.vue`(占位→纯导航壳:头像占位 + store username + van-cell-group 4 项[历史订单/地址/改密/退出],退出=`userStore.logout()`+跳 /login,无任何后端调用);`Menu/Index.vue` 顶栏右侧加「我的」入口→/user(tag 与「我的」归入 `.topbar-right` 组,既有店铺/菜单/购物车逻辑一行未动)。type-check exit0。
- 主窗口审 Menu diff(仅 3 处新增,既有未动)→ 派 verifier 跑 preview mobile。
- 提交 code commit `a5e4aa0`(2 文件)。

**验证证据(verifier,preview mobile,5/5 PASS)**
- ①Menu「我的」→ `/user`。②/user 显示用户名 `s7v_2268`(本地 store 水合)。③/user 加载 `performance` resource 过滤 `/api/`+`/user/` 为**空**(纯导航壳零后端请求,D5 达成)。④4 入口:历史订单→/order-list、地址→/address、改密→/change-password、退出→token 清为 null + →/login。⑤/menu 回归:店名+营业中+10 分类+商品非空,加入口未破坏。

**坑 / 发现**
- verifier 备注:`preview_click` 对 Vue 绑定元素(span.mine / van-cell)不触发导航,改 `dispatchEvent(new MouseEvent('click',{bubbles:true}))` 即正常——**工具与 Vue 事件的兼容问题,非应用缺陷**(handler 绑定正确)。后续前端 preview 点击类验证留意。

**里程碑**
- **0005 Phase 3 全 6 步 TESTED,功能实现收官**。订单生命周期下半段闭环(历史订单/详情/取消/支付/催单/再来一单合并/用户中心+入口)。C 端完整重建 epic(0002-0005)功能全部落地。

**下一步**
- Phase 4 验证收尾:端到端冒烟 → 合并回 main → 复核 ADR-0005 + 收口 divedeep backlog → 契约 `page` 报错码 400/500 措辞校准 → 再生派生文档 → 更新 blueprint + 快照。
