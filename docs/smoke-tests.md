# 冒烟测试基线 (Smoke Tests)

> Phase 0 安全网的一部分。按项目约定"测试够用即可",这里用**手动冒烟命令**替代自动化
> 测试,记录 **改代码前的"已知良好行为"**:任何改动后重跑这些命令,结果一致即认为核心
> 链路没被改坏。真正修改某个功能时,再针对那一块写更聚焦的 characterization 测试
> (放到对应功能的 feature 分支里,见 WORKFLOW.md Phase 3)。
>
> 全部命令已在 Phase 0(2026-07-18)实测通过。

## 前置:起依赖和服务
1. MySQL —— 本机 5.7,库 `sky_take_out`(11 表)已就绪
2. Redis: `docker start sky-redis`
3. 后端: `& 'D:\Program\hspjdk17\bin\java.exe' -jar 'D:\CQWM2\sky-take-out\sky-server\target\sky-server-1.0-SNAPSHOT.jar'`
4. 前端: 在 `project-sky-admin-vue-ts` 下 `$env:NODE_OPTIONS='--openssl-legacy-provider'; npm run serve`

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

### 3. 带鉴权的数据读取 —— JWT 拦截器 → Service → Mapper → DB 读
先用上一步拿到的 token,放进 `token` 请求头:
```
TOKEN=<上一步的 token>
curl -s "http://localhost:8080/admin/category/list?type=1" -H "token: $TOKEN"
curl -s "http://localhost:8080/admin/employee/page?page=1&pageSize=10" -H "token: $TOKEN"
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
