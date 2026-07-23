# [0002] C 端重建①:商品浏览 + 购物车 — Progress(现场笔记)

## 元信息
- 编号: 0002
- 关联: Requirement → ./requirement.md | Proposal → ./proposal.md | ADR → ../../decisions/0002-cend-browse-cart.md
- 纪律: 追加式,旧条目不改。只记 git 看不出的东西,别抄 diff。

## 步骤记录(追加式,新条目往下加)

### 步骤1 (2026-07-22) — 后端 bugfix `updateNumberById`
- **改了什么**: `ShoppingCartMapper.xml` 的 `updateNumberById` SQL `set amount` → `set number`(1 行);`mvn clean package -DskipTests` 重建 jar。
- **验证**(对应 Proposal 步骤1 测试门):起 jar(:8080)→ 注册 smoke 用户拿 token → 对 `dishId=46`(王老吉 ¥6.00)`cart/add` 两次 → `cart/list` 断言该行 `number==2`(修复前恒为 1)→ `cart/clean` 复原。**实测 `number:2`,STEP1_PASS**。
- **发现 / 踩坑 / 临场决策**:
  - **Docker 未启动 → Redis 不可用**;但购物车走 MySQL 不走 Redis,步骤1 无需 Redis(shop/status 等要到步骤3/5 才需 → 届时得先 `docker start sky-redis` + `PUT /admin/shop/1` 初始化)。
  - `cart/list` 返回确认 `dish.image` 是阿里云 OSS URL(`https://sky-itcast.oss-cn-beijing.aliyuncs.com/...`),印证 ADR D3——图片一律走占位图。
  - 开工前查进程:唯一 `java.exe` 是 IDE(redhat.java)语言服务器,无残留 sky-server jar,无需先停。
  - 启动等待用"后台 curl 轮询 :8080/doc.html 直到 200"实现(避免前台 sleep)。
- **关联**: 见本步 commit / ADR AD1(number bug 的评审来源与"UPDATE 写错列静默 no-op"面试点)

### 步骤2 (2026-07-22) — 引 Vant(全量)+ 占位图 + ProductImage
- **改了什么**: `npm install vant`;`main.ts` 全量引入 Vant(`app.use(Vant)` + `import 'vant/lib/index.css'`);复制 `reference/Resource/Dummy.png` → `src/assets/dummy.png`;新增 `src/components/ProductImage.vue`(统一占位图,prop 支持动态 URL 供将来 S3)。
- **验证**(对应 Proposal 步骤2 测试门):preview_start 起 :5173;临时在 Login 页渲染 Vant 真实组件(button/stepper/cell)→ `preview_inspect` 确认 `van-button--primary` 带 Vant 类 + 背景色 + 32px 高(**Vant CSS 已加载**);`preview_snapshot` 见 0001 登录表单完好并存;`preview_console_logs` 无错误。验完还原临时代码(Login.vue diff 为空)。
- **发现 / 踩坑 / 临场决策**:
  - **改按需引入为全量引入**(记为 ADR AD2):两路评审预警按需引入的 functional 组件样式坑,学习项目不在意 bundle,全量最稳、零配置。
  - **全局 button 金色主题渗进 Vant 按钮**:`styles.css` 的全局 `button` 规则让 Vant 主按钮显示金色而非 Vant 蓝。纯外观,暂不处理(UI 能跑就行)。
  - ProductImage 当前一律占位图(不接云、不发失败请求);`src` prop + `@error` 回退占位图,为将来 S3 留过渡位。
- **关联**: 见本步 commit / ADR AD2

### 步骤3 (2026-07-22) — 业务类型 + 5 个 API 模块
- **改了什么**: 新增 `src/types/business.ts`(Category/DishFlavor/DishVO/Setmeal/DishItemVO/ShoppingCart/ShoppingCartDTO)+ `src/api/{shop,category,dish,setmeal,cart}.ts`(复用 request 层)。shop.ts 带 try/catch 兜底;setmeal.ts 对含菜明细做 `Map<id,Promise>` 轻缓存(失败剔除)。契约补注 dishFlavor 与 Redis 依赖。
- **验证**(对应 Proposal 步骤3 测试门):对活后端(:8080)逐接口 curl(见 scratchpad/verify_step3.py):category/list、dish/list `code:1`;**`flavors[].value` 实测为 JSON 数组串**(如 `["不辣","微辣",...]`);`add(dishId,dishFlavor=首选项)` → `list` **原样回写** dishFlavor(number 1、amount 72.0),证实精确匹配契约;shop/status 有 Redis→200。
- **发现 / 踩坑 / 临场决策**:
  - **dish/list + setmeal/list 也依赖 Redis**(dish 手写 RedisTemplate 缓存、setmeal `@Cacheable`),Redis 未起时**直接 500 不降级**(jar 日志实证 `RedisConnectionFailureException`)。→ 比预期更早需要 Redis;已启动 Docker Desktop + `docker start sky-redis` + `PUT /admin/shop/1`。这也是 shop.ts 前端兜底价值的实证(后端读缓存不降级)。
  - **seed 无套餐数据**(setmeal 表 0 行,但有 2 个 type=2 分类)→ setmeal 浏览接口正常但返回空;套餐 UI(步骤5/6)需经 admin API 建 demo 套餐(admin 建套餐会 `@CacheEvict` 清 setmealCache,直接 SQL 插入则被缓存的空列表挡住)。
  - 全局 Druid 日志偶发 "discard long time none received connection" 是连接池回收空闲连接,非故障(MySQL 正常)。
- **关联**: 见本步 commit / 契约补注(dishFlavor + Redis 依赖)

### 步骤4-6 (2026-07-22) — 购物车 store + 点餐主页 + 弹层交互(里程碑 A)
- **改了什么**: `stores/cart.ts`(服务端为准 + enqueue 串行化防竞态)、`views/Menu/Index.vue`(状态兜底 + van-sidebar 分类 + 菜品/套餐列表 + 占位图)、`components/{CartBar,CartDetailPopup,FlavorPopup,SetmealDishPopup}.vue`、`router` 加 `/menu`(受守卫保护)。
- **验证**(对应 Proposal 步骤4-6 测试门,真浏览器 preview 端到端):
  - 菜单渲染:10 分类 + 商品列表 + "营业中" + 占位图;分类切换 OK。
  - **负例**:有口味菜未选规格点"加入购物车"→ `preview_network` **无 `shoppingCart/add`** + Toast 提示。
  - **数量硬断言**:鮰鱼2斤 微辣加购 → 明细 +两次 → `number=3`、合计 `¥216.00`(=72×3);**刷新后仍 ¥216**(store 从服务端重拉,证后端 number 修复持久化)。
  - +/- 复用该行原始 `dishFlavor`("微辣");购物车明细清空 OK。
  - 套餐:切人气套餐 → 显示套餐 → 含菜弹层列 2 菜 → 套餐加购 → 4 件 / ¥315.00。
- **发现 / 踩坑 / 临场决策**:
  - **seed 无套餐数据** → 经 SQL 插入 1 个 demo 套餐"江湖双鱼套餐"(category 13,status 1)+ 2 条 setmeal_dish,并 `redis -n 10 DEL setmealCache::13` 清缓存(否则被之前缓存的空列表挡住)。此 demo 数据留库供后续演示。
  - Vant `van-popup` 隐藏后仍在 DOM,多个 popup 有多个 `.van-overlay`;关闭要点可见的那个(否则 overlay 拦截点击)——验证时踩到一次。
  - 全局 `button` 金色主题渗进 Vant 主按钮(见 AD2),外观可接受。
- **关联**: 见本步 commit / ADR AD1(number 持久化)、AD2(Vant 全量 + 样式渗透)、D4(串行化)

### 步骤7 (2026-07-22) — 登录门槛 + 落地路由 + 类型检查固化(Phase 3 收官)
- **改了什么**:
  - `router/index.ts`:根 `/` redirect 与守卫"已登录回跳登录/注册页"两处 `/home`→`/menu`。`/menu` 登录门槛靠**现有反向机制**(`beforeEach`:`!to.meta.public && !isLoggedIn` → 跳 `/login?redirect=to.fullPath`),`/menu` 无 `meta.public` 故本就受保护,未新增 meta。
  - `Home.vue`:加 `<van-button type="primary" block>进入点餐</van-button>` 逃生入口(`router.push('/menu')`);改密/登出/"验证 token"全保留,**不做纯重定向**(留可回退门)。
  - **落地兜底散点收敛**:实现时发现"登录后落地页"不止 router 两处——`Login.vue` 的 `const redirect = route.query.redirect || '/home'` 与 `Register.vue` 注册成功 `router.push('/home')` 也是落地页,一并 `/home`→`/menu`(保留 `redirect` query 优先机制)。故本步实改 **4 个源文件**,非原计划 2 个。
  - `package.json`:加 `vue-tsc@^2.1.10` devDep(typescript 已有 `^5.6.3`)、新增 `type-check: vue-tsc --noEmit`、`build` 改 `vue-tsc --noEmit && vite build`。
- **验证**(对应 Proposal 步骤7 测试门,独立 verifier subagent 真浏览器 + 命令,STEP7 ALL PASS):A 清 storage 访问 `/menu`→最终 `/login?redirect=/menu`、无菜单 DOM、console 无错;B 注册 `s7v_2268`(id=8)+ 裸 `/login` 登录均落地 `/menu`;C Home 四入口齐全、点"进入点餐"→`/menu`;D 登出→`/login`、再访问 `/menu` 又被拦;E 裸 `fetch('/api/user/shoppingCart/list')`(无 Authorization)→**HTTP 401**;F 加 dishId=67(¥72)→ `localStorage.clear()` 重登同账号 → 服务端仍 1 行/¥72(**跨会话一致**、证服务端权威)→ 清空复原。`type-check`/`build` 均 exit 0。
- **发现 / 踩坑 / 临场决策**:
  - **`/menu` 门槛是"反向白名单"而非 `requiresAuth`**:0001 的守卫设计成"默认全拦,`meta.public` 才放行",所以步骤4–6 加 `/menu` 时无需任何 meta 就自动受保护——这是 0001 认证脚手架复用的红利。
  - **`npm run build` 原来不查类型**(Gate G 暴露):`build` 只有 `vite build`,而 Vite 用 **esbuild 转译**——esbuild 为速度只做"逐文件剥类型注解",**不做跨文件类型检查**;类型错误能静默进产物。这正是 create-vue 官方模板把 `type-check`(`vue-tsc`)与 `build-only`(`vite build`)**分成两个脚本**的原因。verifier 起初按测试门跑 `npm run build` 发现它不查类型 → 临时 `npx vue-tsc --noEmit` 补验(绿)→ 主窗口据此请 Tech Lead 拍板,**选择固化**:让 `build` 先 `vue-tsc --noEmit` 再 `vite build`,后续 0003–0005 有真类型门。**面试点**:esbuild/SWC 转译 vs `tsc` 类型检查的区别;为何前端构建普遍"转译与类型检查解耦"(速度 vs 正确性)。→ 候选 ADR-0002 Addendum AD3(留 Phase 4 定)。
  - 登录门槛的"无闪烁"本质:Vue Router `beforeEach` 返回重定向对象是**导航前同步拦截**,目标组件根本不 mount,故不存在"先看到 /menu 再跳走"的闪烁(区别于 mount 后在 `onMounted` 里 replace 的做法)。
  - verifier 注册的 `s7v_2268`(id=8)留库供后续步骤复用,购物车已清空无脏数据。
- **关联**: 见本步 commit / ADR D2(登录门槛)、AD3(候选:类型检查固化)/ 里程碑 B(登录门槛 + 落地路由端到端)
