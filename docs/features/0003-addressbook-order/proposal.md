# [0003] C 端重建②:地址簿 + 下单 — Proposal(技术方案)

## 元信息
- 编号: 0003
- 状态: Phase 2 规划完成待复核(Requirement + ADR + 契约 + Proposal 已 commit;**双路评审已融合**;待 Tech Lead 复核 → Phase 3)
- 分支: feature/0003-addressbook-order
- 关联: Requirement → ./requirement.md | Progress → ./progress.md | ADR → ../../decisions/0003-addressbook-order.md | 契约 → ../../api-contract/用户端接口.md

## ⭐ 交接头(覆盖式,永远只写"现在")
- **当前**:Phase 3 执行中。**两个后端步骤已 TESTED 并 commit** —— 步骤1 submitOrder 改造 `b2e2389`(去百度 + `@Transactional` 原子化 + 下单读地址归属 + `amount>0` 防呆,4 门全绿含注入回滚对照);步骤2 地址簿越权修复 `e1ebbf0`(`AddressBookServiceImpl` getById/update/deleteById 归属校验 + Mapper.xml update WHERE 带 user_id,userId 只认 BaseContext,5 门全绿含 body 伪造 userId 用例)。后端改造全部完成,契约行为已与实现对齐。
- **下一步**:进 Phase 3 **步骤3(前端脚手架)** —— `@vant/area-data` + `api/address.ts` + `api/order.ts` + 业务类型 + 4 路由骨架(含登录门槛)。按铁律 1 先复述 + Tech Lead 确认,铁律 8 派 subagent;前端起 `npm --prefix project-sky-user-vue3 run dev`(:5173)。
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
- **后端 submitOrder(D2+D3+D6下单侧+D4)**:删 `checkOutOfRange` + 其调用 + `ak`/`shopAddress` 依赖(内审确认仅类内自引用、可直接删);方法加 `@Transactional` 包三写(建订单 → 建明细 → 清购物车);**校验 `addressBookId` 属当前用户**否则拒(D6 下单侧);**`amount<=0` 拒**(D4 防呆)。
- **后端地址簿越权(D6,Service 层)**:在 `AddressBookServiceImpl` 里做 —— `getById` 取回比对 owner、`update`/`deleteById` 先 `setUserId(BaseContext.getCurrentId())`(delete 先取回校验)再落库;**不改 `AddressBookMapper` 签名**(改签名会让 `submitOrder` 编译失败);**userId 只认 `BaseContext` 不认 body**。
- **金额(D4)**:前端算 `amount = Σ(单价×数量) + 配送费 6 + packAmount(菜品件数)` 提交,后端信任存库(记 price-integrity 风险)。
- **结算页(D5)**:复用 cart store 取明细;地址卡默认预填(`GET /addressBook/default`)/ 跳地址簿选;备注 / 餐具数量 / 送达时间;提交 `POST /order/submit` → 落"订单已创建"占位页(`orderNumber`/`orderAmount`),0004 用支付页替换。
- **路由**:新增 `/address`(列表)、`/address/edit`(新增-编辑同页,`?id=` 区分)、`/order-confirm`(结算)、`/order-created`(占位),全套登录门槛;CartBar"去结算"接线到 `/order-confirm`。

### 业务时序
**A. 新增地址**:`/address` → 新增 → `/address/edit` → `van-area` 选省市区 + 填收货人/手机/性别/详情/标签 → 校验通过 → `POST /addressBook`(userId 后端补)→ 回列表刷新。
**B. 结算 → 下单**:`/menu` 加购 → CartBar"去结算" →(打烊置灰)→ `/order-confirm` → 并发拉 `shoppingCart/list`(cart store)+ `addressBook/default` → 展示地址卡 + 明细 + 金额(合计+打包+配送¥6)+ 备注/餐具/送达时间 → (可跳 `/address` 选地址回传)→ 点"去支付":无地址则拦截提示不发请求;有地址则 `POST /order/submit` → 成功清空购物车 → `/order-created` 显示订单号。
**C. 地址选择回传**:结算页 → `/address`(带"选择模式")→ 选中某地址 → 回 `/order-confirm` 并更新地址卡(实现用 Pinia address store 或路由 query,Phase 3 定)。

### 评审融合要点(实现必须遵守;来源见 ADR AD1)
- **D6 走 Service 层、不改 Mapper 签名**:`getById(Long id)` 是单参且被 `submitOrder:80` 复用,改签名会**编译失败**;归属校验放 `AddressBookServiceImpl`。
- **userId 只认 `BaseContext`**:`update`/`deleteById` 必须 `setUserId(BaseContext.getCurrentId())`;**绝不信任 body 里的 userId**(否则是假修复)。
- **原子性注入点在清购物车之后**:清购物车是三写末步,注入点若在其之前,"购物车仍在"恒真 → 假绿。
- **`@Transactional` 勿类内自调用**:三写别拆成本类 `this.xxx()` 的 `@Transactional` 方法(AOP 代理会被绕过);`submitOrder` 由接口代理外部调用,当前结构生效。
- **NOT NULL 字段前端定死**:`deliveryStatus`/`tablewareStatus`/`payMethod` 必发值(1/1/1),漏传显式 NULL → 500。
- **编辑页不提交 `isDefault`**:`update` 的 `<if isDefault!=null>` 会吞默认;设默认只走 `/default`。
- **`amount>0` 后端防呆**:唯一金额兜底,不重算。

### LOW / backlog(记档,0003 不深做)
- `@vant/area-data` 体积:一次性引入全国区划数据;学习项目可接受,如影响首屏可后续改 `import()` 动态加载(不影响 0002 菜单页)。
- **重复提交幂等**:购物车清空提供弱防护;真正幂等(去重键 / 状态机)留将来,面试话题点。
- `checkOutOfRange` 归因:真实先挂假 AK(店铺地理编码 status≠0),非 L590 NPE;结论(删)不变。

## 3. 会动的关键文件

**后端 `sky-take-out/sky-server/`:**
- `.../service/impl/OrderServiceImpl.java` —— 删 `checkOutOfRange`(L562–618)+ 删 `submitOrder:86` 调用 + `submitOrder` 加 `@Transactional`(import `org.springframework.transaction.annotation.Transactional`)+ **校验 `addressBookId` 归属当前用户**(D6)+ **`amount<=0` 拒**(D4);删 `@Value` 的 `ak`/`shopAddress` 字段(内审确认仅类内自引用,可删)。【步骤1】
- `.../service/impl/AddressBookServiceImpl.java` —— **D6 越权修复(Service 层)**:`getById` 取回比对 owner、`update`/`deleteById` 先 `setUserId(BaseContext.getCurrentId())`(delete 先取回校验)再落库;**不改 `AddressBookMapper` 签名**。【步骤2】
- `.../resources/mapper/AddressBookMapper.xml` —— `update` 的 `<where>` 视实现或加 `and user_id = #{userId}`(配合 Service 注入的 userId);`getById` **不动**。Phase 3 读现状定最终落点。【步骤2】
- `src/main/resources/application.yml` —— 移除 `sky.shop.address` / `sky.baidu.ak`(内审确认是字面量、非 `${}` 占位,可删)。【步骤1】

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
> (评审 AD1 确认:D6 走 **Service 层、不改 Mapper 签名** → `submitOrder` 不受影响 → 步骤 1/2 保持解耦、依赖图不变。若当初按"改 Mapper 签名"则 1↔2 会强耦合。)
> 状态标记:TODO / IN_PROGRESS(~) / CODE_DONE / TESTED。
> 前置(联调步骤都需):Redis 起 + 后端 jar 跑 + `PUT /admin/shop/1`(Bearer)初始化。**后端步骤改前先停旧 jar、改后重建**。冗长验证(注入回滚断言 / 端到端网络日志)交**独立 verifier subagent**跑,回浓缩结论(铁律 8)。

- [x] **步骤1(后端)**:submitOrder 改造 —— 去百度(D2)+ `@Transactional`(D3)+ 下单读地址归属(D6 下单侧)+ `amount>0` 防呆(D4)  [依赖: 无]  —— **TESTED**(commit `b2e2389`;4 门全绿,含②对照去 @Transactional 证非恒真)
      测试门(curl 硬断言 + 注入回滚断言,交 verifier):
      ① 去百度:登录 → `cart/add`(dishId)→ `POST /addressBook` 建地址 → `order/submit` 断言 `code:1` + `orderNumber`;**换任意/远距离地址仍 `code:1`**(改前假 AK 会 500)。
      ② 原子性(**注入点修正**):在三写**全部之后(清购物车之后)**注入 `RuntimeException` → 断言 `orders` **无残留** 且 `shopping_cart` **仍在** → **撤注入重建**。注入点**必须在清购物车之后**,否则"购物车仍在"恒真、无法证伪(评审 AD1:清购物车是三写末步)。对照:去 `@Transactional` 应见脏订单 + 购物车已清。
      ③ 下单读地址归属:乙 token 提交 `order/submit`、`addressBookId` 填甲的 → **拒**、不建单。
      ④ amount 防呆:`amount<=0`(0/负数)提交 → **拒**(`OrderBusinessException`)、不建单。
- [x] **步骤2(后端)**:地址簿越权修复(D6,**Service 层**),独立 commit  [依赖: 无]  —— **TESTED**(commit `e1ebbf0`;5 门全绿,含 body 伪造 userId 用例)
      实现:`AddressBookServiceImpl` —— `getById` 取回比对 `userId==currentId` 不符返回空;`update`/`deleteById` 先 `setUserId(BaseContext.getCurrentId())`(delete 先取回校验)再落库;**不改 Mapper 签名**、**userId 只认 BaseContext 不认 body**。
      测试门(curl 硬验):前置 —— 甲 `POST /addressBook` 得 `id=X`,乙(另注册)**无 X**(先查断言)。乙 token:`GET /addressBook/X`(**空/拒**)、`PUT`(body `{id:X,...}` → **甲地址未变**)、`DELETE ?id=X`(**甲 list 仍含 X**);**再补**:乙 token `PUT` body `{id:X, userId:甲Id}`(伪造)→ **甲地址仍不变**(证只认 BaseContext)。逐一断言。
- [ ] **步骤3(前端)**:脚手架 —— `@vant/area-data` + `api/address.ts` + `api/order.ts` + 业务类型 + 路由骨架(4 路由 + 登录门槛)  [依赖: 无]  —— **TODO**
      测试门:`type-check` exit 0;curl 复核 7 个 addressBook 接口 + `order/submit`(用步骤1后端)`code:1`;`@vant/area-data` 能 import、`areaList` 结构正确(**记一个省/市/区样例写进 api 注释**);`dev` 起无 console 报错、**回测 0002 `/menu` 正常**。
- [ ] **步骤4(前端)**:地址簿页面 —— 列表(设默认/删除/进编辑)+ 新增-编辑页(`van-area` 三级 + 表单校验;**编辑不提交 isDefault**)  [依赖: 3]  —— **TODO**
      测试门(preview + `preview_network` 硬验):新增填全字段保存 → `list` 出现且**省市区 Name 正确**;**设默认 A 再设 B → `list` 仅 B `isDefault==1`、A 归 0**(硬断言);**编辑默认地址 A 只改详情 → A 仍 `isDefault==1`**(硬断言,证不吞默认);删除 → `list` 无该 id;编辑预填(`GET /{id}`)→ 改详情 → `list` 为新值;**(负例)手机号非 11 位/收货人空 → `preview_network` 确认不发 add 请求 + 提示**。
      注:`van-area` 回显靠 code;新建地址由 `@vant/area-data` 写入自洽,若命中旧种子数据 code 对不上则退化为空选择(容错、不崩)。
- [ ] **步骤5(前端)**:结算页 + 下单 + 占位成功页 + 接线 0002"去结算"  [依赖: 1,3,4]  —— **TODO**
      实现要点:提交体**定死** `deliveryStatus=1` / `tablewareStatus=1` / `payMethod=1`(均对 `NOT NULL` 列,漏传会 500);`amount = totalAmount + 6 + 件数`(件数=packAmount)。
      测试门(端到端 preview + `preview_network`,交 verifier):`/menu` 加购 →"去结算"进 `/order-confirm`(**打烊时仍置灰**,沿用 0002);结算页显示默认地址 + 购物车明细(**复用 cart store,条目/合计与购物车一致**)+ 商品合计+打包费+配送费¥6;跳地址簿选另一地址 → 回结算页地址卡更新;**提交(payMethod/deliveryStatus/tablewareStatus 齐全)→ 返回 `orderNumber` → 落 `/order-created` 显订单号 → `shoppingCart/list` 空**;**任意地址下单成功**(去百度端到端);**(负例)未选地址点"去支付"→ `preview_network` 无 `order/submit` + 提示"请选择收货地址"**;(负例)购物车空进结算页 → 给态、不允许提交;**(重复提交)双击"去支付"→ 至多建一单**(购物车清空是弱防护,真幂等留将来,见备注)。

> 说明:契约已定死(现有 + 0003 校准补注),本功能是"前端对既有后端 + 后端三处改造"。测试门刻意做成**可证伪绝对断言 + 工具核对**(curl / preview_network / DB 查 / 注入回滚),不留肉眼判定空间(沿用 0002 ADR AD1 教训)。
