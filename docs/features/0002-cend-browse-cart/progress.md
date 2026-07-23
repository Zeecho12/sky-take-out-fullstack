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
