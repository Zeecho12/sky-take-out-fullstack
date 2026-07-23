# [0003] C 端重建②:地址簿 + 下单 — Proposal(技术方案)

## 元信息
- 编号: 0003
- 状态: Phase 2 规划中(Requirement + ADR + 契约校准已 commit;本 Proposal 起草;**双路评审待做**)
- 分支: feature/0003-addressbook-order
- 关联: Requirement → ./requirement.md | Progress → ./progress.md | ADR → ../../decisions/0003-addressbook-order.md | 契约 → ../../api-contract/用户端接口.md

## ⭐ 交接头(覆盖式,永远只写"现在")
- **当前**:Phase 2 规划中。Requirement 基线 + ADR-0003 六决策已定并 commit(`9070a46`);用户端接口契约已加「0003 校准补注」并 commit(`d440730`)。本 Proposal + progress 起草中。**下一关卡 = 双路评审(内审:会话内敌对 subagent + 外审:DeepSeek CLI)未做**。
- **下一步**:双路评审 → 融合修订本 Proposal / ADR(如需)→ Tech Lead 拍板 → 进 Phase 3 **步骤1(后端 submitOrder 改造)**。Phase 3 每步派 subagent(铁律 8)。
- **别碰**:支付(0004)/ 订单管理(0005)的代码与页面;`reference/`(只读);后端**除** `OrderServiceImpl.submitOrder`(去百度 + 事务)与 `AddressBookMapper`(越权修复)**之外**一律不动;0002 已交付代码**除 CartBar"去结算"接线**外不动。
- **怎么验证**:`docker start sky-redis` → 后端 jar(:8080,**构建前先停旧 jar**)→ `PUT /admin/shop/1`(Bearer)初始化店铺 → 前端 `npm --prefix project-sky-user-vue3 run dev`(:5173)。测试账号 `s7v_2268`/`123456`(id=8)。类型门 `npm --prefix project-sky-user-vue3 run type-check` exit 0。MySQL 5.7 连库加 `--ssl-mode=DISABLED`。

## 1. 现状(与本改动相关的技术起点)
> 全局架构见 docs/Backend_scan/BACKEND_OVERVIEW.md;这里只写和 0003 相关的。

**前端 `project-sky-user-vue3`(0002 交付,可复用):**
- **购物车 cart store**(`stores/cart.ts`,服务端为准:fetch/add/sub/clean + `totalCount`/`totalAmount`)—— 结算页直接复用取明细。
- **认证 / 请求基座**:`stores/user.ts`(token+user)、`utils/request.ts`(`/api` 代理、Bearer 注入、401 兜底)、`router/index.ts`(`beforeEach` 登录门槛、`/menu` 落地)、Vant **全量引入**、`api/` 模块模式、`ProductImage` 占位图。
- **CartBar 的"去结算"目前是占位 / 打烊置灰**(0002 收尾补的打烊置灰)。
- **缺**:地址簿 / 结算 / 下单相关的一切(api、页面、类型、路由、送达时间/餐具/备注交互)。

**后端(0003 改三处,均已有接口、不新增端点):**
- 地址簿 `/user/addressBook/**` 7 接口 + 下单 `POST /user/order/submit` 均就位。但:
  - `submitOrder`(`OrderServiceImpl`)**无 `@Transactional`** 且在 L86 调 `checkOutOfRange`(百度校验,L562–618)——该校验**代码已坏**(`JSON.parseObject("result")` NPE、`"orgin"` 拼错)且需真 `sky.baidu.ak` → **fresh 环境 submit 跑不通**。
  - 地址簿 `getById`/`update`/`deleteById` **只按 id、无 `user_id` 归属校验**(IDOR)。

## 2. 方案总览(选定方案长什么样)
> 为什么这么选见 ADR-0003,此处不重复论证。

- **省市区(D1)**:`van-area` + `@vant/area-data`,纯客户端静态区划数据。
- **后端 submitOrder(D2+D3)**:删 `checkOutOfRange` + 其调用 + 清 `ak`/`shopAddress` 依赖;方法加 `@Transactional` 包三写(建订单 → 建明细 → 清购物车)。
- **后端地址簿(D6)**:`getById`/`update`/`deleteById` 查询/更新条件加 `user_id = BaseContext.getCurrentId()`。
- **金额(D4)**:前端算 `amount = Σ(单价×数量) + 配送费 6 + packAmount(菜品件数)` 提交,后端信任存库(记 price-integrity 风险)。
- **结算页(D5)**:复用 cart store 取明细;地址卡默认预填(`GET /addressBook/default`)/ 跳地址簿选;备注 / 餐具数量 / 送达时间;提交 `POST /order/submit` → 落"订单已创建"占位页(`orderNumber`/`orderAmount`),0004 用支付页替换。
- **路由**:新增 `/address`(列表)、`/address/edit`(新增-编辑同页,`?id=` 区分)、`/order-confirm`(结算)、`/order-created`(占位),全套登录门槛;CartBar"去结算"接线到 `/order-confirm`。

### 业务时序
**A. 新增地址**:`/address` → 新增 → `/address/edit` → `van-area` 选省市区 + 填收货人/手机/性别/详情/标签 → 校验通过 → `POST /addressBook`(userId 后端补)→ 回列表刷新。
**B. 结算 → 下单**:`/menu` 加购 → CartBar"去结算" →(打烊置灰)→ `/order-confirm` → 并发拉 `shoppingCart/list`(cart store)+ `addressBook/default` → 展示地址卡 + 明细 + 金额(合计+打包+配送¥6)+ 备注/餐具/送达时间 → (可跳 `/address` 选地址回传)→ 点"去支付":无地址则拦截提示不发请求;有地址则 `POST /order/submit` → 成功清空购物车 → `/order-created` 显示订单号。
**C. 地址选择回传**:结算页 → `/address`(带"选择模式")→ 选中某地址 → 回 `/order-confirm` 并更新地址卡(实现用 Pinia address store 或路由 query,Phase 3 定)。

### 评审融合要点(实现必须遵守)
> 待双路评审(内审 + DeepSeek 外审)后补;当前为空占位。

## 3. 会动的关键文件

**后端 `sky-take-out/sky-server/`:**
- `src/main/java/com/sky/service/impl/OrderServiceImpl.java` —— 删 `checkOutOfRange`(L562–618)+ 删 `submitOrder` L86 调用 + 方法加 `@Transactional`(import `org.springframework.transaction.annotation.Transactional`);清 `@Value("${sky.baidu.ak}")` / `${sky.shop.address}` 字段(**需确认无他处引用**)。【步骤1】
- `src/main/java/com/sky/mapper/AddressBookMapper.java` +（若在 XML）`src/main/resources/mapper/AddressBookMapper.xml` —— `getById`/`update`/`deleteById` 加 `user_id` 归属(D6)。具体落注解还是 XML,Phase 3 读现状后定。【步骤2】
- (可能)`src/main/resources/application.yml` —— 若删了 `ak`/`shopAddress` 字段,移除对应配置项。【步骤1】

**前端 `project-sky-user-vue3/`:**
- `package.json` —— 增 `@vant/area-data`。【步骤3】
- `src/api/address.ts` / `src/api/order.ts` —— 新增(复用 `request.ts`)。【步骤3】
- `src/types/business.ts`(或就近)—— 增 `AddressBook` / `OrdersSubmitDTO` / `OrderSubmitVO` 等类型。【步骤3】
- `src/router/index.ts` —— 加 `/address`、`/address/edit`、`/order-confirm`、`/order-created`(登录门槛)。【步骤3】
- `src/views/Address/List.vue` + `src/views/Address/Edit.vue` —— 地址簿列表 + 新增/编辑(`van-area` + 表单校验)。【步骤4】
- `src/views/Order/Confirm.vue` —— 结算页。【步骤5】
- `src/views/Order/Created.vue` —— "订单已创建"占位页。【步骤5】
- `src/views/Menu/Index.vue`(或 CartBar 组件)—— "去结算"接线到 `/order-confirm`(替换占位)。【步骤5】
- (可能)`src/stores/address.ts` —— 若地址选择回传用 store。【步骤4/5】

## 4. 实施清单(每步一个测试门;测试门为**可证伪断言**,非肉眼)—— 活文档,状态就地翻
> 依赖:1、2、3 无依赖(**契约锁定,前后端可并行**);4←3;5←1,3,4(+0002 cart store)。单人串行推进顺序:1→2→3→4→5。
> 状态标记:TODO / IN_PROGRESS(~) / CODE_DONE / TESTED。
> 前置(联调步骤都需):Redis 起 + 后端 jar 跑 + `PUT /admin/shop/1`(Bearer)初始化。**后端步骤改前先停旧 jar、改后重建**。冗长验证(注入回滚断言 / 端到端网络日志)交**独立 verifier subagent**跑,回浓缩结论(铁律 8)。

- [ ] **步骤1(后端)**:submitOrder 改造 —— 去百度校验(D2)+ 补 `@Transactional`(D3)  [依赖: 无]  —— **TODO**
      测试门(curl 硬断言 + 注入回滚断言,交 verifier):
      ① 去百度:登录取 token → `cart/add`(某 dishId)→ `POST /addressBook` 建地址 → `POST /order/submit` 断言 `code:1` + 返回 `orderNumber`;**换任意/远距离地址仍 `code:1`**(改前该 path 会因百度 NPE/AK 500 或"超出配送范围")。
      ② 原子性:临时在 `submitOrder` 三写之间注入 `RuntimeException`(建订单后抛)→ 重建 → submit → 断言 `orders` 表**无该笔残留** 且 `shopping_cart` **未被清空**(证回滚);**撤注入重建**。对照:去掉 `@Transactional` 应看到脏订单。
- [ ] **步骤2(后端)**:地址簿越权修复(D6),独立 commit  [依赖: 无]  —— **TODO**
      测试门(curl 硬验):账号甲登录 `POST /addressBook` 得 `id=X`;注册/登录账号乙,用乙 token:`GET /addressBook/X`(**拿不到/空**)、`PUT /addressBook`(body id=X 改字段 → **甲的地址未变**)、`DELETE /addressBook?id=X`(**甲 list 仍含 X**)。逐一断言修复后越权失效。
- [ ] **步骤3(前端)**:脚手架 —— `@vant/area-data` + `api/address.ts` + `api/order.ts` + 业务类型 + 路由骨架(4 路由 + 登录门槛)  [依赖: 无]  —— **TODO**
      测试门:`type-check` exit 0;curl 复核 7 个 addressBook 接口 + `order/submit`(用步骤1后端)`code:1`;`@vant/area-data` 能 import、`areaList` 结构正确(**记一个省/市/区样例写进 api 注释**);`dev` 起无 console 报错、**回测 0002 `/menu` 正常**。
- [ ] **步骤4(前端)**:地址簿页面 —— 列表(设默认/删除/进编辑)+ 新增-编辑页(`van-area` 三级 + 表单校验)  [依赖: 3]  —— **TODO**
      测试门(preview + `preview_network` 硬验):新增填全字段保存 → `list` 出现且**省市区 Name 正确**;**设默认 A 再设 B → `list` 仅 B `isDefault==1`、A 归 0**(硬断言);删除 → `list` 无该 id;编辑预填(`GET /{id}`)→ 改详情 → `list` 为新值;**(负例)手机号非 11 位/收货人空 → `preview_network` 确认不发 add 请求 + 提示**。
- [ ] **步骤5(前端)**:结算页 + 下单 + 占位成功页 + 接线 0002"去结算"  [依赖: 1,3,4]  —— **TODO**
      测试门(端到端 preview + `preview_network`,交 verifier):`/menu` 加购 →"去结算"进 `/order-confirm`(**打烊时仍置灰**,沿用 0002);结算页显示默认地址 + 购物车明细(**复用 cart store,条目/合计与购物车一致**)+ 商品合计+打包费+配送费¥6;跳地址簿选另一地址 → 回结算页地址卡更新;**提交 → 返回 `orderNumber` → 落 `/order-created` 显订单号 → `shoppingCart/list` 空**(购物车已清);**任意地址下单成功**(去百度端到端);**(负例)未选地址点"去支付"→ `preview_network` 无 `order/submit` + 提示"请选择收货地址"**;(负例)购物车空进结算页 → 给态、不允许提交。

> 说明:契约已定死(现有 + 0003 校准补注),本功能是"前端对既有后端 + 后端三处改造"。测试门刻意做成**可证伪绝对断言 + 工具核对**(curl / preview_network / DB 查 / 注入回滚),不留肉眼判定空间(沿用 0002 ADR AD1 教训)。
