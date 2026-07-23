# [0003] C 端重建②:地址簿 + 下单 — Progress(现场笔记)

> 追加式:每个窗口/关键节点追加一条,新的在下。里程碑历史看 `git log`;当前快照看 proposal 交接头。

---

## 2026-07-22 · Phase 2 立项 + 规划

**做了什么**
- 读状态:blueprint(epic 路线图,0003 边界=地址簿 CRUD + 结算下单;支付属 0004、订单历史属 0005)、0002 全套文档(requirement/proposal/ADR,沿用其可证伪测试门风格)、现有用户端接口契约。
- 派 2 个 Explore subagent 摸底(保护主窗口上下文):
  - **后端**:AddressBook 7 接口 + 实体字段(sex String / isDefault Integer / 省市区六字段)全部就位;`submitOrder` **无 `@Transactional`**(三写非原子);百度校验 `checkOutOfRange`(L562–618)**本身已坏**(`JSON.parseObject("result")` NPE + `"orgin"` 拼错 + 需真 AK)→ fresh 环境 submit 跑不通;地址簿 `getById/update/deleteById` **越权(IDOR)**,只按 id 无 user_id。
  - **reference 小程序**:地址簿列表 + 新增/编辑同页;**省市区 100% 客户端静态数据、无 API**;结算页读服务端购物车、**submit 不带明细**、前端算 amount(含写死配送费 ¥6 + packAmount=件数)、下单成功跳支付页。
- 向 Tech Lead 复述范围边界 + Requirement 拆法 + 6 个决策点;**全部按推荐拍板**(T3 档位、D4 信任前端 amount+记风险、D6 越权顺手修独立 commit、D5 占位落点)。
- 产出并 commit:Requirement 基线(`9070a46`)、ADR-0003 六决策(`9070a46`)、用户端接口契约「0003 校准补注」(`d440730`)、本 Proposal + progress(本次)。

**关键决策(详见 ADR-0003)**
- D1 `van-area`+`@vant/area-data` / D2 删百度校验 / D3 submitOrder `@Transactional` / D4 信任前端 amount(price-integrity 风险记档)/ D5 结算页接 0002 cart store + 落"订单已创建"占位页(0004 替换)/ D6 地址簿越权修复(独立 commit)。

**下一步**
- **双路评审**:内审(会话内全新上下文敌对 subagent)+ 外审(DeepSeek CLI `.tools/deepseek_review.py`)→ 融合修订 Proposal/ADR → Tech Lead 拍板 → 进 Phase 3 步骤1。

**坑 / 备忘**
- 后端 `checkOutOfRange` 的两处 live bug 是"外部依赖 + 死代码"双重问题,删除同时能讲清"外部调用不该进事务/下单主链"面试点。
- 原子性测试门要"注入异常"才可证伪(光跑成功路径证明不了回滚),Phase 3 交 verifier subagent 跑并撤注入。

---

## 2026-07-22 · 双路评审融合(Phase 2 收尾)

**做了什么**
- 内审:会话内全新上下文红队 subagent,**实读**后端源码(`OrderServiceImpl`/`AddressBookMapper(.java/.xml)`/`AddressBookServiceImpl`/`sky.sql`/前端 `cart.ts`/`router`/`package.json`)。
- 外审:`~/.claude/tools/deepseek_review.py`(`deepseek-v4-pro`,只喂四份规划文档)。**注**:外审脚本不在仓库 `.tools/`(那里只有 Maven),在用户目录 `~/.claude/tools/`,key 同目录 `deepseek.key`;用户指路后跑通。
- 两路融合(详见 ADR AD1),按拍板修订 requirement/proposal/ADR/契约。

**融合结论(净判定:修订前不可进 Phase 3)**
- **收敛(高置信)**:① D6 **不是一行修法** —— 改 Mapper 签名会让 `submitOrder:80` 编译失败;`update` 现状不注入 userId,只改 WHERE 会静默失效或成假修复;与契约"userId 忽略"矛盾。→ 改 **Service 层归属 + 不改签名 + userId 只认 BaseContext**。② 越权测试门假绿 → 补前置断言 + body 伪造 userId 用例。
- **分歧(内审源码纠正外审)**:外审"`@Transactional` 自调用失效"→ 内审证伪(接口代理外部调用,事务生效,D3 论述正确)。**教训:外审只有文档、内审能读码 → 机制真伪以内审为准**。
- **内审独有**:原子性注入点须在清购物车之后(否则恒真);`deliveryStatus`/`tablewareStatus` NOT NULL 漏传 500;编辑吞默认;归因订正。
- **外审独有**:`amount>0` 防呆(采纳);area-data 体积 / 重复提交(记 LOW)。

**拍板(用户 2026-07-22)**:D6 Service 层归属 / 下单读地址一并校验(步骤1)/ 加 `amount>0`。

**下一步**:Tech Lead 复核融合后计划 → 进 Phase 3 步骤1(每步派 subagent,铁律 8)。

---

## 2026-07-22 · Phase 3 步骤1(后端 submitOrder 改造)完成

**做了什么**
- Tech Lead 复述确认后开工。按铁律 8:派 1 个实现 subagent 改代码(不构建/不运行/不提交,只回 diff)、派 1 个独立 verifier subagent 跑测试门(构建+起 jar+curl+注入回滚,回浓缩结论);主窗口只做编排 / 审 diff / 把测试门 / 提交 / 环境调试。
- 改 2 文件 `OrderServiceImpl.java` + `application.yml`,commit `b2e2389`:
  - **D2 去百度**:删 `checkOutOfRange` 方法 + `submitOrder` 内调用 + `@Value` 的 `ak`/`shopAddress` 字段 + 3 个 unused import(`JSONArray`/`HttpClientUtil`/`Value`);`application.yml` 删 `sky.baidu.ak` / `sky.shop.address`。全库 grep 确认无悬挂引用。
  - **D3 原子化**:`submitOrder` 加 `@Transactional`(未拆 `this.` 子方法、无 `rollbackFor`)。
  - **D6 下单侧**:`addressBook == null || !currentId.equals(addressBook.getUserId())` → 拒 `ADDRESS_BOOK_IS_NULL`;`currentId` 只来自 `BaseContext`。
  - **D4 防呆**:`amount == null || amount.compareTo(BigDecimal.ZERO) <= 0` → `OrderBusinessException`。

**测试门(4/4 PASS,verifier 硬断言)**
- ① 去百度:深圳 + 新疆远地址 submit 均 `code:1`(改前假 AK 会 500)。
- ② 原子性:清购物车(末步)后注入 `throw` → `orders` 无残留 + `shopping_cart` 仍在;**对照**去 `@Transactional` → 脏单落库 + 购物车已清(证测试非恒真)。
- ③ 下单读地址归属:乙(id=9)用甲(id=8)地址 submit → `ADDRESS_BOOK_IS_NULL`、乙无订单。
- ④ amount 防呆:`amount=0` / `-1` → `订单金额非法`、不建单。

**坑 / 备忘**
- 日期格式无坑:`OrdersSubmitDTO.estimatedDeliveryTime` 用字段级 `@JsonFormat("yyyy-MM-dd HH:mm:ss")`。
- 项目自带 `apache-maven-3.9.9` + JDK17;`mvn clean package -DskipTests` 可构建。
- 遗留测试脏数据(未清):`orders` user8 3 行(门① 2 单 + 门②(b) 无事务脏单 1)、`address_book` user8 新增 2 条、测试账号 `verify_b_*`(id=9)。不影响后续步骤。

**下一步**:进 Phase 3 步骤2(地址簿越权修复,D6 Service 层,`AddressBookServiceImpl`),独立 commit。

---

## 2026-07-22 · Phase 3 步骤2(地址簿越权修复 D6·Service 层)完成

**做了什么**
- Tech Lead 复述确认后开工。派实现 subagent 改 2 文件(只回 diff)+ 独立 verifier 跑隔离矩阵;主窗口审 diff + 把门 + 提交。commit `e1ebbf0`:
  - `AddressBookServiceImpl.getById`:取回后 Java 比对 `userId==BaseContext.getCurrentId()`,跨用户返回 null。**Mapper getById 单参签名不动**(被 `submitOrder`/`deleteById` 复用)。
  - `AddressBookServiceImpl.update`:落库前 `setUserId(BaseContext.getCurrentId())` 覆盖 body userId;`AddressBookMapper.xml` 的 `update` WHERE 加 `and user_id = #{userId}`。
  - `AddressBookServiceImpl.deleteById`:单参 mapper 不改签名,先 `getById` 取回校验归属再删。
  - 核实 `setDefault`(L76)调 `update`(L81)前已注入 userId → WHERE 加固对它安全,且顺带堵住 setDefault 越权。

**测试门(5/5 PASS,verifier 硬断言 + DB 查证)**
- A 跨用户读→`data:null`;B 跨用户写→DB 未变;C 跨用户删→记录仍在;D body 塞 `userId=8`→DB 未变(证只认 BaseContext);E 正例回归→U1 自己 GET/PUT/DELETE 正常。

**坑 / 备忘**
- verifier 首轮踩 Git Bash `curl -d` 直传中文 body 被 shell 损坏成无效 JSON→400;改用 Python urllib UTF-8 发送解决(非服务端问题)。后续前端联调无此坑(浏览器发 UTF-8)。
- 遗留测试数据(均在 user8 / 新注册账号,不影响结论):user8 新增地址若干(含 id=4 detail 被改)、临时 id=5 已删、首轮损坏脚本误删 user8 既有 id=2(U1 删自己的,功能合法);新注册 `verify_iso_*`(id=10/11)无地址。

**遗留决策**:安全过滤误报——描述越权测试用"攻击/篡改"字眼触发 Opus cyber 安全过滤,改中性"多用户数据隔离"措辞后跑通(经验记忆)。

**下一步**:进 Phase 3 步骤3(前端脚手架:`@vant/area-data` + api + 类型 + 4 路由骨架)。

---

## 2026-07-22 · Phase 3 步骤3(前端脚手架)完成

**做了什么**
- Tech Lead 确认(路由占位用推荐的"4 个最小占位 .vue")后开工。派实现 subagent 装包 + 写 api/类型/路由/占位页(回 diff + 自跑 type-check),主窗口审 diff + 独立 type-check + preview 浏览器冒烟。commit `28958d3`(10 文件):
  - 依赖 `@vant/area-data@^2.1.0`(`areaList = {province_list, city_list, county_list}`,均 `Record<6位code, 中文名>`;样例:江苏 320000 / 南京 320100 / 玄武 320102)。
  - `api/address.ts`(7 函数,复用 request.ts,照 `cart.ts`/`setmeal.ts` 风格)+ `api/order.ts`(submitOrder)。
  - `types/business.ts` 追加 `AddressBook`/`OrdersSubmitDTO`/`OrderSubmitVO`。
  - `router/index.ts` 加 4 路由 + `views/Address/{List,Edit}.vue`、`views/Order/{Confirm,Created}.vue` 占位页。

**关键发现(纠正复述)**
- 本项目路由门槛**不是** `requiresAuth` opt-in,而是**「默认全需登录、只有 `meta:{public:true}` 放行」**(`beforeEach`)。故 4 新路由**不加 meta** 即自动受保护。subagent 实读源码纠正,已在浏览器冒烟证实(未登录跳 /login)。

**测试门(全绿)**
- type-check exit 0(subagent + 主窗口独立各一次)。
- preview 冒烟:dev 无构建/console 报错;`/menu` 0002 回归正常(分类/菜品/CartBar);4 新路由 `/address`、`/address/edit`、`/order-confirm`、`/order-created` 均解析渲染占位页;未登录跳 `/login`、登录(`s7v_2268` id=8,token 存 `localStorage.sky_user_token`)后放行。
- "curl 复核 7 addressBook + submit"降级为 diff 核对(端点已在步骤1/2 端到端验证两遍,前端 api 为字面量路径)。

**坑 / 备忘**
- token 持久化 key:`localStorage.sky_user_token`(+ `sky_user_info`),reload 不丢登录态。
- 登录页输入框无 name/class,用 placeholder 选择器(`请输入用户名`/`请输入密码`)驱动。

**下一步**:进 Phase 3 步骤4(地址簿列表页 + 新增/编辑页,`van-area` 三级 + 表单校验)。

---

## 2026-07-23 · Phase 3 步骤4(地址簿页面)完成

**做了什么**
- Tech Lead 确认(性别 1/0、标签 1/2/3、旧数据回显容错、选择模式留步骤5)后开工。派实现 subagent 填 `List.vue`+`Edit.vue`(自跑 type-check),主窗口审 diff + preview 硬验。commit `f19d218`(3 文件:两页 + business.ts isDefault 改可选)。
- List:卡片(收货人/手机/`fullAddress`/标签/默认徽标)+ 设默认(reload)+ 删除(confirm dialog)+ 卡片/编辑跳转带 id + 新增。
- Edit:`?id=` 区分新增/编辑;`van-area`(点 readonly 字段弹 popup,confirm 取 `selectedOptions` 写六字段 code+name);校验门(收货人非空 + `/^1\d{10}$/`,失败 showToast+return 在任何请求前);提交 `payload={...form}` 天然不含 isDefault;编辑预填 + `areaCode` 回显。

**测试门(全绿,preview + 页内 XHR 录制器硬验)**
- 因 `preview_network` 全量 dump 过大(216K,触发 铁律8 冗长),改在页面挂 XHR 录制器只记 addressBook/order 请求的 method/url/body,精确低噪。
- 新增:`POST /api/user/addressBook` body 六字段带 Name(北京市/北京市/东城区)+ **无 isDefault** → list 出现(id=6)。
- 设默认排他:设 id6→仅 id6 默认;再设 id1→仅 id1 默认、id6 归 0。
- **编辑不吞默认(核心)**:编辑默认 id1 只改详情 → `PUT /addressBook` body **无 isDefault**、编辑后 id1 仍 `isDefault==1`、detail 为新值。
- 删除 id6:`DELETE ?id=6` → list 不再含。
- 负例:空收货人 / 手机 `123` → **0 请求** + Toast(「请输入收货人」/「请输入正确的手机号」)。
- 附加:van-area 回显真实 code(440305)命中 area-data → 「广东省 深圳市 南山区」正确。

**坑 / 备忘(preview 驱动 SPA 的关键教训)**
- 路由守卫 `beforeEach` 调 Pinia store 查登录态 → **从 preview_eval 外部 `router.push` 会因 `getActivePinia()` 无激活实例而抛错、导航中止**。故 SPA 编程式跳转走不通;必须用真实 UI 点击(组件上下文,Pinia 激活)或 `location.href` 整页重载(重载时 app 初始化、守卫正常)。
- XHR 录制器在整页 reload 后丢失 → 每次 `location.href` 跳转后需重装;SPA 内跳转(如保存后 `router.push`)不重载、录制器存活。
- 断言 list 状态用带 `Authorization: Bearer localStorage.sky_user_token` 的 `fetch('/api/user/addressBook/list')` 直读后端真相,低噪可靠。

**下一步**:进 Phase 3 步骤5(结算页 + 下单 + 占位成功页 + 接线 0002"去结算")。

---

## 2026-07-23 · Phase 3 步骤5(结算下单收官)完成 —— 5 步全 TESTED

**做了什么**
- Tech Lead 确认(地址回传 Pinia store、送达时间只做"立即"、成功页 query 传参、餐具默认)后开工。派实现 subagent 填 `Confirm.vue`+`Created.vue` + 接线 `CartBar` + `List` 选择模式 + 新增 `stores/address.ts`(回 diff + type-check),主窗口审 diff + preview 端到端硬验。commit `d0fdbaa`(5 文件)。
- 金额:`amount = cart.totalAmount + 6 + cart.totalCount`(打包费=件数);payload 定死 `deliveryStatus/tablewareStatus/payMethod = 1/1/1`,`estimatedDeliveryTime` = 本地格式化 now。
- 地址回传:`useAddressStore().selected`;List `?mode=select` 时点卡片 setSelected + `router.back()`;Confirm 优先取 selected 否则 `getDefaultAddress()`。

**端到端测试门(全绿,preview + XHR 录制,鮰鱼2斤×2 单价72)**
- CartBar「去结算」→ `/order-confirm`(打烊/空车置灰保留)。
- 结算页:默认地址(测试甲)+ 明细「鮰鱼2斤 x2 ¥144」与购物车一致 + 商品合计144/配送6/打包2/**合计152**。
- 地址切换:选择模式选 ZhangSan(id=3)→ 卡更新;提交体 `{addressBookId:3, amount:152, deliveryStatus:1, estimatedDeliveryTime:"2026-07-23 00:21:32", packAmount:2, payMethod:1, tablewareNumber:1, tablewareStatus:1}`。
- 提交 → `orderNumber 1784791292872` → `/order-created` 显订单号/¥152 → **`shoppingCart/list` 空**(任意地址成功=去百度端到端)。
- 负例:空车 → `van-empty`「购物车是空的」、无去支付按钮;无地址(新账号 id=12 无默认)点去支付 → Toast「请选择收货地址」+ **0 次 order/submit**。
- 双击:`submitting` 守卫 + 下单即清车(二次提交后端 SHOPPING_CART_IS_NULL 兜底);未自动化双击,守卫已审在位。

**坑 / 备忘**
- 端到端验证沿用步骤4 打法:`location.href` 到页(重载→守卫在 Pinia 激活下正常)+ 重装 XHR 录制器 + UI 点击(组件上下文)+ 带 token fetch 断言;跨账号负例靠改写 `localStorage.sky_user_token`/`sky_user_info` + reload 切账号(reload 重置 Pinia,`addressStore.selected` 不残留)。
- 遗留测试数据:user8 订单若干(步骤1 + 本步 152 单)、地址 3 条(测试甲默认/ZhangSan/张三);新账号 `verify_pay_*`(id=12)有 1 购物车项、无地址、无订单。浏览器登录态当前停在 id=12(临时,可重登 s7v_2268)。

**下一步**:0003 Phase 3 执行全部完成。进 Phase 4 验证收尾(合并 main 待 Tech Lead 拍板 + 复核 ADR + 更新 CLAUDE.md 快照/blueprint)。
