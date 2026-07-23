# 冒烟测试基线 (Smoke Tests)

> Phase 0 安全网的一部分。按项目约定"测试够用即可",这里用**手动冒烟命令**替代自动化
> 测试,记录 **改代码前的"已知良好行为"**:任何改动后重跑这些命令,结果一致即认为核心
> 链路没被改坏。真正修改某个功能时,再针对那一块写更聚焦的 characterization 测试
> (放到对应功能的 feature 分支里,见 WORKFLOW.md Phase 3)。
>
> 全部命令已在 Phase 0(2026-07-18)实测通过。
>
> **2026-07-19 更新(功能 0001 C 端认证改造)**:全站认证已统一为 Spring Security + 单套
> JWT,令牌头由旧的自定义 `token`/`authentication` 迁为 **`Authorization: Bearer <jwt>`**。
> 据此**第 3 项 admin 鉴权读取的请求头已更新**(旧 `token` 头现在会 401);并**新增第 6 段
> C 端认证冒烟**。第 3、6 段命令已于 2026-07-19 实测全绿。

## 前置:起依赖和服务
1. MySQL —— 本机 5.7,库 `sky_take_out`(11 表)已就绪
2. Redis: `docker start sky-redis`
3. 后端: `& 'D:\Program\hspjdk17\bin\java.exe' -jar 'D:\CQWM2\sky-take-out\sky-server\target\sky-server-1.0-SNAPSHOT.jar'`
4. admin 前端: 在 `project-sky-admin-vue-ts` 下 `$env:NODE_OPTIONS='--openssl-legacy-provider'; npm run serve`(:8888)
5. C 端前端(0001 新增): 首次 `npm install --prefix project-sky-user-vue3`;起 `npm --prefix project-sky-user-vue3 run dev`(:5173,Vite 无需 openssl 老参数)
6. 店铺状态初始化(否则 `/user/shop/status` 因 Redis 无 `SHOP_STATUS` 键 → `getStatus` 对 null 拆箱 NPE → 500):
   登录 admin 拿 token 后 `curl -X PUT http://localhost:8080/admin/shop/1 -H "Authorization: Bearer <TOKEN>"`。
   **走 admin 接口写**,保证与后端 `RedisTemplate` 的序列化器一致;**勿用裸 `redis-cli set`**(会写成纯字符串,`getStatus` 里 `(Integer)` 强转失败)。

## 冒烟项(附已验证期望)

### 1. 后端存活 + 接口文档
```
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/doc.html
```
期望:`200`(knife4j 接口文档页)

### 2. 管理端登录 —— Web → Service → MyBatis → MySQL → 签发 JWT
```
curl -s -X POST http://localhost:8080/admin/employee/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"123456"}'
```
期望:`{"code":1,...,"data":{"id":1,"userName":"admin","name":"管理员","token":"<JWT>"}}`
(0001 后 JWT 载荷为 `{sub:员工id, role:ADMIN, exp}`;密码存储已由 MD5 迁 BCrypt)

### 3. 带鉴权的数据读取 —— JWT 过滤器 → Service → Mapper → DB 读
> **0001 起:令牌走 `Authorization: Bearer`**(替代旧 `token` 头;旧头现在会 401)。
```
TOKEN=<上一步的 token>
curl -s "http://localhost:8080/admin/category/list?type=1" -H "Authorization: Bearer $TOKEN"
curl -s "http://localhost:8080/admin/employee/page?page=1&pageSize=10" -H "Authorization: Bearer $TOKEN"
```
期望:
- category/list → `code:1`,返回分类数组(蜀味烤鱼、蜀味牛蛙、特色蒸菜…)
- employee/page → `code:1`,`total:2`(admin、lzq)

### 4. 前端 + 代理链路 —— 前端(8888) → /api 代理 → 后端(8080)/admin
```
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8888/
curl -s -X POST http://localhost:8888/api/employee/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"123456"}'
```
期望:首个 `200`;第二个返回 JWT(`code:1`)——证明代理链路 + 无 CORS。

### 5. 数据库
```
mysql -uroot -p123456 --ssl-mode=DISABLED -e "use sky_take_out; show tables;"
```
期望:11 张表(address_book, category, dish, dish_flavor, employee, order_detail,
orders, setmeal, setmeal_dish, shopping_cart, user)。

### 6.【0001】C 端认证冒烟 —— Spring Security 统一鉴权 + 单套 JWT + C 端本地账密
> 后端契约见 `docs/api-contract/用户端接口.md`。C 端 Web(:5173)已用**真浏览器端到端**
> 验证过完整闭环(注册→自动登录→受保护端点→改密→登出→路由守卫拦截),见
> `docs/features/0001-cend-auth-jwt/progress.md` 07-19 步骤6。下列 curl **直打后端 :8080**,验证认证
> 契约本身。全部于 2026-07-19 实测全绿。

**6.1 注册(免认证,成功直接签发 JWT)** —— 用户名唯一,重复注册返回"用户名已存在"
```
curl -s -X POST http://localhost:8080/user/user/register \
  -H "Content-Type: application/json" \
  -d '{"username":"smoke_<唯一后缀>","password":"pass123"}'
```
期望:`code:1`,`data:{id, username, token}`(JWT 载荷 `role:USER`)

**6.2 登录**
```
curl -s -X POST http://localhost:8080/user/user/login \
  -H "Content-Type: application/json" \
  -d '{"username":"smoke_<同上>","password":"pass123"}'
```
期望:`code:1` + token

**6.3 带 Bearer 访问受保护端点(证明 token 生效)**
```
UTOKEN=<6.1/6.2 的 token>
curl -s -w " [%{http_code}]\n" "http://localhost:8080/user/addressBook/list" -H "Authorization: Bearer $UTOKEN"
```
期望:`code:1`(新用户 `data:[]`),HTTP `200`

**6.4 鉴权负例(401)** —— 证明后端确实护 `/user/**`,且弃用旧自定义头
```
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/user/addressBook/list                    # 无 token
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/user/addressBook/list -H "token: $UTOKEN" # 旧自定义头
```
期望:两者都 `401`

**6.5 改密(需 Bearer)+ 新密码重登**
```
curl -s -X PUT http://localhost:8080/user/user/password \
  -H "Content-Type: application/json" -H "Authorization: Bearer $UTOKEN" \
  -d '{"oldPassword":"pass123","newPassword":"pass456"}'
curl -s -X POST http://localhost:8080/user/user/login \
  -H "Content-Type: application/json" \
  -d '{"username":"smoke_<同上>","password":"pass456"}'
```
期望:改密 `code:1`;用**新密码**登录 `code:1`(证明改密真生效)

**6.6 登出(无状态:后端返回成功,前端丢 token)**
```
curl -s -X POST http://localhost:8080/user/user/logout -H "Authorization: Bearer $UTOKEN"
```
期望:`code:1`

**6.7 店铺状态(免认证白名单)**
```
curl -s -w " [%{http_code}]\n" http://localhost:8080/user/shop/status
```
期望:`code:1`,`data:1`,HTTP `200`(前提:已做前置第 6 步店铺状态初始化)

### 7.【0002】C 端商品浏览 + 购物车冒烟 —— 点餐首页 /menu 端到端
> 契约见 `docs/api-contract/用户端接口.md`。此段主要在 **C 端 Web(:5173)真浏览器**上跑(UI 行为),
> 已于 0002 步骤7(Gate G)端到端验证,见 `docs/features/0002-cend-browse-cart/progress.md`。
> 前置:MySQL / Redis / 后端 jar / C 端 dev 全起,且**已做前置第 6 步店铺状态初始化**(否则营业状态取不到)。
> 除 7.7 外均为**操作 → 期望结果**;7.7 附一条直打后端的负例 curl。全部于 2026-07-22 实测全绿。

**7.1 进点餐首页** —— 登录后访问 `/menu`:左侧见分类列表、右侧见对应分类的菜品/套餐、顶部见营业状态(营业中 / 打烊)。

**7.2 切换分类** —— 点左侧另一个分类:右侧列表随之切换为该分类的菜品/套餐。

**7.3 带口味菜品选规格加购** —— 点带"选规格"的菜 → 弹出规格弹层 → 选一组口味 → 加入购物车:底部购物车栏数量 +1、金额随之增加。

**7.4 连加同菜数量正确 + 刷新持久** —— 同一菜连加 3 次 → 购物车该项 `number=3`、合计 = 单价×3;**刷新页面后仍为 3**(证明写服务端并持久,非前端内存计数)。

**7.5 购物车明细增减 / 清空** —— 打开购物车明细弹层:对条目 `+ / -` 可正确增减数量、"清空"可清空;清空后底部购物车栏归零。

**7.6 打烊态可浏览可加购、结算置灰** —— 店铺打烊时:仍能浏览分类 / 菜品、仍能加购;但"去结算"按钮**置灰**并给出打烊提示(不阻塞浏览与加购)。

**7.7 未登录拦截 + 无 token 购物车接口 401** —— 未登录(无 token)直接访问 `/menu` 被路由守卫拦回 `/login`;无 token 直打购物车接口返回 `401`:
```
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/user/shoppingCart/list   # 无 token
```
期望:HTTP `401`(前端守卫是 UX 兜底,真门槛在后端 —— 与第 6 段 authn/authz 边界一脉相承)。

### 8.【0005】C 端订单管理冒烟 —— 下单→支付→订单管理端到端 + 后端归属/退款
> 契约见 `docs/api-contract/用户端接口.md`「订单管理约定(0005 校准补注)」。UI 行为在 **C 端 Web(:5173)真浏览器**跑,
> 已于 0005 Phase 3 逐步 + Phase 4 端到端(A~G)验证,见 `docs/features/0005-order-manage/progress.md`。
> 前置:MySQL / Redis / 后端 jar / C 端 dev 全起 + 店铺状态初始化。8.1~8.5 为 UI 操作;8.6~8.7 直打后端验后端修复。
> ⚠️ 预览验证前先把视口设 mobile(否则 van-list 触底不触发)。全部于 2026-07-23 实测全绿。

**8.1 端到端主链** —— 登录后:`/menu` 加购 → `/order-confirm` 选地址去支付 → `/order-pay` 确认支付 → `/order-created` 下单成功 →「查看订单」→ `/order-detail/{id}`(非 `/order-detail/undefined`),详情状态「待接单」。(证 orderId 沿 Confirm→Pay→Created 透传闭环。)

**8.2 历史订单** —— `/order-list` 默认「全部」列出订单;切「待付款」tab 自动加载且请求带 `status=1`、切「已取消」带 `status=6`;>10 单时触底加载第 2 页(`pageNum=2`,不重复)。⚠️ 分页参数名是 **`pageNum`** 非 `page`。

**8.3 详情动作** —— 详情页按状态出按钮:待接单(status2)见 取消/催单/再来一单;待付款(status1)见 取消/立即支付/再来一单;已取消(status6)仅再来一单。催单→toast;再来一单→合并加入购物车(不清空原有)→回菜单。

**8.4 用户中心** —— `/menu` 顶栏「我的」→ `/user`:显示用户名 + 历史订单/地址管理/修改密码/退出登录 4 入口;退出登录清 token 回 `/login`;页面加载**无查用户信息请求**(纯本地导航壳)。

**8.5 多用户数据隔离(UI 层)** —— 甲登录只在历史订单/详情看到自己的订单(后端按当前用户过滤 + 归属校验)。

**8.6 后端订单归属(直打后端,负例)** —— 乙 token 对甲订单 id `X` 操作,均被按"订单不存在"拒:
```
UB=<乙的 Bearer token>   # 另注册一个用户
curl -s "http://localhost:8080/user/order/orderDetail/X" -H "Authorization: Bearer $UB"   # 甲的订单 X
curl -s -X PUT "http://localhost:8080/user/order/cancel/X" -H "Authorization: Bearer $UB"
```
期望:两者 `code:0` "订单不存在"(不泄露甲的地址/明细;不改甲订单状态)。catch:详情/取消/催单/再来一单四端点均已在 Service 层校验归属(`userId==BaseContext`)。

**8.7 后端退款口径(直打后端 + DB)** —— 管理端取消/拒单**已支付**订单后 `pay_status` 应为 `2 退款`:
```
# 造已支付单(status2/pay1),admin token 调:
curl -s -X PUT http://localhost:8080/admin/order/cancel \
  -H "Authorization: Bearer <ADMIN>" -H "Content-Type: application/json" \
  -d '{"id":<已支付单 id>,"cancelReason":"test"}'
mysql -uroot -p123456 --ssl-mode=DISABLED -e "use sky_take_out; select status,pay_status from orders where id=<id>;"
```
期望:`code:1`;DB `status=6` 且 `pay_status=2`(改前管理端只 log 不置 REFUND,是 0005 修复点;三处已支付判断统一 `Orders.PAID.equals()`)。
