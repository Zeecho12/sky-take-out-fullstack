# [0002] C 端重建①:商品浏览 + 购物车 — Proposal(技术方案)

## 元信息
- 编号: 0002
- 状态: Phase 3 完成(步骤 1–7 全 TESTED),待 0002 验收 + 合并回 main
- 分支: feature/0002-cend-browse-cart
- 关联: Requirement → ./requirement.md | Progress → ./progress.md | ADR → ../../decisions/0002-cend-browse-cart.md | 契约 → ../../api-contract/用户端接口.md

## ⭐ 交接头(覆盖式,永远只写"现在")
- **当前**:**Phase 3 全部完成(步骤 1–7 全 TESTED)+ 0002 验收通过(requirement 11 条 AC 全绿)**。步骤7 STEP7 ALL PASS(未登录拦截无闪烁/登录·注册落地 `/menu`/Home 逃生/登出再拦/无 token→401/服务端权威跨会话一致);验收阶段补掉唯一未测 AC——打烊时「去结算」置灰+提示(`CartBar` 加 `shopClosed` prop,`Menu/Index` 传 `shopStatus===0`),verifier 打烊复验 PASS + 营业态无回归;`npm run type-check`/`build`(已固化 `vue-tsc --noEmit` 门)exit 0。环境:Docker/Redis + shop 已初始化(营业);后端 :8080、前端 :5173。
- **下一步**:**合并回 main(一功能一次合并;已达 DoD,待 Tech Lead 拍板)** → Phase 4 收尾(复核 ADR-0002 是否补 AD3 类型检查 Addendum、覆盖式更新 `CLAUDE.md` 当前进度 + `blueprint.md` 里程碑、按需再生派生文档、核对 `docs/smoke-tests.md` 是否补 0002 项)。
- **别碰**:后端**除 `ShoppingCartMapper.updateNumberById` 一行外**一律不动;地址/下单(0003)、支付(0004)、订单管理(0005)相关代码与页面;`reference/`(只读)。
- **怎么验证**:起 Redis(`docker start sky-redis`)+ 后端 jar(:8080)+ `PUT /admin/shop/1`(Bearer)初始化店铺状态;C 端 `npm --prefix project-sky-user-vue3 run dev`(:5173);用 preview 工具真浏览器端到端验 + 截图。类型门:`npm --prefix project-sky-user-vue3 run type-check`(或 `run build`)应 exit 0。

## 1. 现状(与本改动相关的技术起点)
> 全局架构见 docs/Backend_scan/BACKEND_OVERVIEW.md;这里只写和 0002 相关的。

**前端 `project-sky-user-vue3`(0001 交付)**:
- 已有认证全链路可**直接复用**:`utils/request.ts`(axios 实例 `baseURL:/api`、请求拦截注入 `Authorization: Bearer`、响应拦截 401 兜底跳登录)、`stores/user.ts`(token + user,localStorage 持久)、`router/index.ts`(`beforeEach` 未登录跳 `/login` + redirect 回跳)、`api/user.ts`、`views/{Login,Register,Home,ChangePassword}.vue`。
- 工程配置:Vite 端口 5173、`/api`→`http://localhost:8080` 代理(rewrite 去 `/api`)、`@`→`src` 别名、TS strict。
- **缺**:任何业务 UI、UI 组件库、业务 API 模块、购物车 store、商品图片方案。

**后端(仅一处 bugfix)**:0002 用到的 8 个接口全部就位(见契约校准),但**接口存在 ≠ 行为正确**——评审发现 `ShoppingCartMapper.updateNumberById` 写错列(`set amount` 应为 `set number`),致购物车数量恒为 1(见 ADR Addendum AD1),本功能修这一行。购物车以 `shopping_cart` 表为准(服务端权威);`add` 由后端自动从 dish/setmeal 表填 name/image/amount(**amount = 单价**),前端只传 `{dishId,setmealId,dishFlavor}`(无价格篡改面)。`list` 靠 `dish_flavor` **精确匹配**。

## 2. 方案总览(选定方案长什么样)
> 为什么这么选见 ADR-0002,此处不重复论证。

- **UI 库**:引入 **Vant 4**(Vue3),**按需引入**(`unplugin-vue-components` + `VantResolver`,面试点:tree-shaking / 按需加载)。
- **图片**:D3 决定一律用占位图 → 把 `reference/Resource/Dummy.png` **复制**到 `src/assets/dummy.png`,封装极小的 `ProductImage`(或统一常量),**所有菜品/套餐图片一律渲染占位图**(忽略 `dish.image`,不接云)。
- **API 模块**:`src/api/{shop,category,dish,setmeal,cart}.ts`,全部复用 `request.ts`;配套 TS 类型(Category/DishVO/DishFlavor/Setmeal/DishItemVO/ShoppingCart/ShoppingCartDTO)。
- **购物车 store**:`src/stores/cart.ts`(Pinia)。**服务端为准**:`fetchCart/add/sub/clean` 每次写后重拉 `list`;getter `totalCount`/`totalAmount`(= Σ amount×number)。前端不自算库存、不本地造数据。
- **点餐主页**:`views/Menu/Index.vue` = 顶部营业状态 + 左侧分类栏(`van-sidebar`)+ 右侧菜品/套餐列表 + 底部购物车栏(合计 + "去结算"占位)+ 规格选择弹层 + 套餐含菜弹层。
- **登录门槛(D2)**:`/` → `/menu`;`/menu` 需登录;复用现有守卫。`/menu` 成为登录后落地页。

### 业务时序(加菜)
1. 进 `/menu`(未登录被守卫拦→登录)→ 并发拉 `shop/status` + `category/list` → 默认选第一类 → 按分类拉 `dish/list` 或 `setmeal/list` → 拉 `cart/list` 初始化购物车。
2. 点某菜"加":无 `flavors` 直接 `cart/add({dishId})`;有 `flavors` 弹规格层选完再 `add({dishId,dishFlavor})`;套餐 `add({setmealId})`。
3. `add/sub/clean` 成功后**重拉 `cart/list`**,底部栏合计与条目实时更新;刷新页面因走服务端而保持一致。

### 评审融合要点(实现必须遵守;来源见 ADR Addendum AD1)
- **数量正确性**:先修后端 `updateNumberById`(步骤1),否则数量恒为 1、"增减"测试门是假绿。
- **口味 dishFlavor**:`DishFlavor.value` 是 JSON 数组串(`JSON.parse` 出选项),一菜可多组;选择 join 成 dishFlavor 发 `add`;**+/- 一律复用 `cart/list` 返回的 dishFlavor 原值,绝不前端重拼**(后端精确匹配)。
- **shop/status 兜底**:`shop.ts` try/catch,取不到返回"未知"而非抛错;**绝不阻塞** category/dish 浏览(页面不白屏)。打烊时可浏览/加购,"去结算"置灰提示。
- **金额只展示不计算**:`totalAmount = Σ(item.amount × item.number)`,amount 全取自 `cart/list`,前端不硬编码单价、不改 amount。
- **竞态**:cart store 对连续 add/sub 串行化 / 忽略在途,防购物车数字跳变。
- **图片**:`ProductImage` prop 支持动态 URL(当前恒传占位图),为将来 S3 留过渡位。
- **setmeal/dish 缓存**:api 层按 setmealId 做 `Map<id, Promise>` 轻缓存,重复开弹层不重复请求。

## 3. 会动的关键文件(前端 `project-sky-user-vue3/` + 后端一行 bugfix)
- **后端**:`sky-server/src/main/resources/mapper/ShoppingCartMapper.xml` —— 改 `updateNumberById`:`set amount = #{amount}` → `set number = #{number}`(**唯一后端改动**,步骤1)
- `package.json` —— 增 `vant`(**全量引入**,见 ADR AD2;不再需要 unplugin / vite 插件)
- `src/main.ts` —— 改:`import Vant from 'vant'` + `import 'vant/lib/index.css'` + `app.use(Vant)`
- `src/assets/dummy.png` —— 新增(从 `reference/Resource/Dummy.png` 复制)
- `src/api/shop.ts` / `category.ts` / `dish.ts` / `setmeal.ts` / `cart.ts` —— 新增(shop 带兜底、setmeal 带轻缓存)
- `src/types/business.ts`(或就近内联)—— 新增业务类型
- `src/stores/cart.ts` —— 新增购物车 store(服务端为准 + 连续写去重)
- `src/components/ProductImage.vue` —— 新增(统一占位图,prop 支持动态 URL,为将来 S3 留位)
- `src/views/Menu/Index.vue` + 子组件(`DishCard` / `SetmealCard` / `FlavorPopup` / `SetmealDishPopup` / `CartBar` / **`CartDetailPopup`**)—— 新增
- `src/router/index.ts` —— 改:加 `/menu`;`/` 重定向与 `beforeEach` 已登录回跳的**两处 `/home`** 一并改;`/menu` 设登录门槛
- `src/views/Home.vue` —— 改:**保留作逃生入口**(加"进入点餐 → `/menu`"按钮,保留改密/登出),不做纯重定向(消单向门)

## 4. 实施清单(每步一个测试门;测试门为**可证伪断言**,非肉眼)—— 活文档,状态就地翻
> 依赖:1、2 无依赖(先后随意);3←2;4←1,2,3;5←2,3,4;6←1,5;7←5,6。
> 状态标记:TODO / IN_PROGRESS(~) / CODE_DONE / TESTED
> 前置(每个联调步骤都需):Redis 起 + 后端 jar 跑 + `PUT /admin/shop/1`(Bearer)初始化店铺状态。

- [x] **步骤1**:后端 bugfix `updateNumberById`(`set amount`→`set number`)+ 重建 jar  [依赖: 无]  —— **TESTED (2026-07-22)**
      测试门(curl 硬断言):停旧 jar → 改 XML → 重建 → 起;登录取 token → 对同一 `dishId` `cart/add` **两次** → `cart/list` 断言该行 `number == 2`(**修复前为 1**)→ `cart/clean` 复原。
      ✅ 实测:dishId=46 连加两次 → `cart/list` 该行 `number:2`(见 progress 步骤1)。
- [x] **步骤2**:引 Vant(**全量**,见 AD2)+ 复制占位图 + `ProductImage` + 冒烟  [依赖: 无]  —— **TESTED (2026-07-22)**
      测试门:`npm run dev` 起(:5173);**真实组件**(`van-stepper`/`van-cell`/`van-button`)样式正常(不止 van-button);占位图就位;**回测 0001**:登录页渲染正常、无 console 报错。
      ✅ 实测:临时在 Login 页渲染 Vant 真实组件 → `van-button--primary` 带 Vant 类 + 32px 高 + 背景色,stepper/cell 正常;0001 登录表单完好并存;`preview_console_logs` 无错误;验完已还原临时代码。
- [x] **步骤3**:业务 TS 类型 + 5 个 API 模块(shop 兜底 / setmeal 轻缓存)  [依赖: 2]  —— **TESTED (2026-07-22)**
      测试门:curl 复核 8 接口 `code:1`,并**记录一条真实购物车行的 `dishFlavor` 实际值**写进契约注释;`shop.ts` 在 Redis 未初始化时**不抛错**(兜底返回"未知"),不阻塞 category/dish。
      ✅ 实测:category/list、dish/list code:1;`flavors[].value` 确为 JSON 数组串;`add(dishFlavor=选项)` → `list` 原样回写(round-trip);shop/status 无 Redis→500(fallback 已在 shop.ts)/ 有 Redis→200;dishFlavor+Redis 约定已补进契约。setmeal/list code:1 但 seed 无套餐数据(count 0),setmeal UI 留步骤5/6 建 demo 套餐验。
- [x] **步骤4**:购物车 Pinia store(fetch/add/sub/clean + totalCount/totalAmount + 连续写去重)  [依赖: 1,2,3]  —— **TESTED (2026-07-22)**
      测试门(`preview_eval` 断言):给已知单价 `dishId` 加 2 次 → `store.totalAmount === 单价×2` 且对应行 `number === 2`(依赖步骤1);连点 3 次数值不跳变、最终正确。
      ✅ 实测(经 UI):鮰鱼2斤 微辣 → +两次 → 明细 number=3、totalAmount ¥216.00(=72×3);串行链保证连点不跳变。
- [x] **步骤5**:点餐主页布局(状态兜底 + 分类栏 + 菜品/套餐列表 + 底部栏 + CartDetailPopup)  [依赖: 2,3,4]  —— **TESTED (2026-07-22)**
      测试门:登录进 `/menu`,营业状态显示(**Redis 未初始化时显示"未知"不白屏**);分类切换 → 列表随之切换;占位图显示;底部栏合计正确;点底部栏弹 `CartDetailPopup` 列出条目。preview 截图。
      ✅ 实测:/menu 渲染 10 分类 + 商品列表 + 营业中 + 占位图;切到人气套餐显示套餐;底部栏合计正确;CartDetailPopup 列出条目 + +/-;截图留档。
- [x] **步骤6**:规格弹层 + 套餐含菜弹层 + 加/减/清空  [依赖: 1,5]  —— **TESTED (2026-07-22)**
      测试门:无口味菜直接加;**有口味菜未选规格点加 → `preview_network` 确认未发出 `cart/add` + 有提示**(负例);选完加成功;套餐可加可看含菜;CartDetailPopup 里 +/- **复用原 `dishFlavor`**;**数量硬断言**:连加 3 次 → number=3、合计=单价×3 → **刷新仍 3**(`preview_eval` 比对 + `preview_network` 看 `cart/list` 响应)。
      ✅ 实测:未选规格点"加入购物车"→ `preview_network` 无 `shoppingCart/add`(负例过);选微辣后加成功;**数量增到 3 → 刷新仍 ¥216(持久,证后端修复)**;+/- 复用原 dishFlavor "微辣";套餐含菜弹层显示 2 菜、套餐加购成功(→4/¥315)。
- [x] **步骤7**:登录门槛 + 落地路由(`/`→`/menu` + Home 逃生 + `/home` 两处)+ 端到端  [依赖: 5,6]  —— **TESTED (2026-07-22)**
      测试门:未登录访问 `/menu` → 跳登录;登录落地 `/menu`;Home 有"进入点餐"入口且可去改密/登出;**登出后再访问 `/menu` → 拦截、无闪烁**;无 token 直打 `/user/shoppingCart/list` → 401;**第二浏览器/隐私窗口**登录同账号 → 购物车一致。端到端截图作交付证据。
      ✅ 实测(独立 verifier subagent,STEP7 ALL PASS):A 未登录访问 `/menu`→最终 `/login?redirect=/menu`、无菜单 DOM、console 无错(同步守卫不挂载=无闪烁);B 注册新用户 `s7v_2268`(id=8)+ 裸登录均落地 `/menu`;C Home 见"进入点餐/验证 token/改密/登出"齐全、点击进 `/menu`;D 登出→`/login`、再访问 `/menu` 又被拦;E 裸 `fetch('/api/user/shoppingCart/list')`→**401**;F 加 dishId=67(¥72)→清客户端重登同账号→服务端仍 1 行/¥72(跨会话一致)、复原已清空。
      **落点扩到 4 源文件**(超出原计划的 2 文件):除 `router/index.ts`(两处 `/home`)、`Home.vue`(逃生入口)外,登录后落地兜底还散在 `Login.vue`(`route.query.redirect` 默认值 `/home`→`/menu`)、`Register.vue`(注册成功 `router.push('/home')`→`/menu`),一并对齐 `/menu`。
      **工具链固化(用户拍板)**:Gate G 暴露 `npm run build` 只有 `vite build`(esbuild 只转译不查类型),类型错误会被静默放过。→ 加 `vue-tsc@^2.1.10` devDep + `type-check` 脚本 + `build` 改为 `vue-tsc --noEmit && vite build`;`type-check`/`build` 均 exit 0(全项目零类型错误)。面试点见 progress / 待 Phase 4 决定是否补 ADR Addendum。

> 说明:步骤 1(后端)与 2(前端脚手架)互不依赖;3~7 基本串行。契约已定死,本功能是纯前端对既有后端(+ 一处后端 bugfix),不涉及前后端并行。测试门刻意做成"可证伪的绝对断言 + 工具核对(curl / preview_eval / preview_network)",不留肉眼判定空间(见 ADR Addendum AD1)。
