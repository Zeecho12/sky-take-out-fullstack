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
