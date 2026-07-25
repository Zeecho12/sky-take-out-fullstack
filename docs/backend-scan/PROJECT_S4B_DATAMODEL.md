# PROJECT_S4B_DATAMODEL — 数据模型精读

> 项目名称：sky-take-out（苍穹外卖）
> ORM 框架：**MyBatis**（依据：S2/S3 技术栈；启动类无 `@MapperScan` 集中声明，Mapper 接口用 `@Mapper` 被扫描；`application.yml` 配置 `mybatis.mapper-locations: classpath:mapper/*.xml` + `mybatis.type-aliases-package: com.sky.entity`。**非 MyBatis-Plus**——entity 上无 `@TableName`/`@TableId`/`@TableField`/`@TableLogic` 任何 MyBatis-Plus 注解，映射靠 mapper XML + 驼峰开关）
> schema 来源模式：**DDL 脚本模式**——仓库带独立全库建表脚本 `D:\CQWM2\sky.sql`，以其中 `CREATE TABLE` 为真相源；entity 只作映射校对。功能 0001 另有增量迁移 `0001-migration.sql`（见下）。
> 命名映射约定：`mybatis.configuration.map-underscore-to-camel-case: true`（依据 S4 关键配置项索引）→ 数据库下划线列名自动映射到 Java 驼峰属性，例如列 `order_time` ↔ 属性 `orderTime`、`create_user` ↔ `createUser`、`id_number` ↔ `idNumber`。全项目 entity 均**无**显式字段级映射注解，全靠此开关。
> 本步骤读取的真实文件：
> - DDL：`D:\CQWM2\sky.sql`（全库建表脚本，主源）、`D:\CQWM2\docs\features\0001-cend-auth-jwt\0001-migration.sql`（功能 0001 增量迁移）
> - entity（11 个，仅读字段声明与注解，未读方法体）：`sky-take-out\sky-pojo\src\main\java\com\sky\entity\` 下的 `AddressBook.java` `Category.java` `Dish.java` `DishFlavor.java` `Employee.java` `OrderDetail.java` `Orders.java` `Setmeal.java` `SetmealDish.java` `ShoppingCart.java` `User.java`
> - dto（23 个）：`...\com\sky\dto\` 下全部 23 个 DTO/Query 类（见清单）
> - vo（17 个）：`...\com\sky\vo\` 下全部 17 个 VO 类（见清单）

---

## 数据模型总览

- **表数量**：11 张（`address_book` / `category` / `dish` / `dish_flavor` / `employee` / `order_detail` / `orders` / `setmeal` / `setmeal_dish` / `shopping_cart` / `user`）。均取自 `sky.sql` 的 `CREATE TABLE`，引擎 InnoDB，默认字符集 utf8mb3（部分列显式 utf8mb4）。
- **实体（entity/PO）数量**：11 个，与 11 张表**一一对应**（表名 = 实体类名的下划线小写化，如 `Orders`↔`orders`、`AddressBook`↔`address_book`、`OrderDetail`↔`order_detail`）。
- **逻辑删除约定**：**未发现逻辑删除**——全部 11 张表均无 `is_deleted`/`deleted` 之类软删列，全部 entity 均无 `@TableLogic` 或等价字段。推断为**物理删除**（DELETE 直接删行；实际删除语句在 mapper XML 中，本步未读）。
- **公共字段约定**：`create_time` / `update_time` / `create_user` / `update_user` 四件套仅出现在 **`category` / `dish` / `setmeal` / `employee`** 四张「基础数据/管理端维护」表；由 `sky-server` 的 AOP 切面 `aspect/AutoFillAspect` 拦截标注 `@AutoFill` 的 Mapper 方法，在 insert/update 前统一填充（依据 S3 aspect/annotation 卡片；`create_user`/`update_user` 取自 `BaseContext` 当前登录用户 id）。**注意不是所有表都有这四件套**：`user`、`shopping_cart` 只有 `create_time`（无 update/user 列）；`orders` 用业务语义时间字段（`order_time`/`checkout_time`/`delivery_time` 等）而非公共四件套；`address_book`/`dish_flavor`/`order_detail`/`setmeal_dish` 无任何公共时间字段。
- **初始化数据脚本**：无独立 `data.sql`。`sky.sql` 内**内联**了少量 `INSERT`（`category` 10 行、`dish` 24 行、`dish_flavor` 24 行、`employee` 1 行 admin 账号）用于建库时铺基础数据；按约定本步只登记有无、不读数据行。
- **sky.sql 与 0001-migration.sql 的关系（重要）**：`sky.sql` 已经是**功能 0001 改造后的最终形态**——`user` 表 DDL 里已含 `username`/`password` 两列 + `idx_username` 唯一索引，`employee` admin 密码 INSERT 值已是 BCrypt 哈希。`0001-migration.sql` 是对**已在运行的旧库**做原地增量升级（幂等可重跑：用 `information_schema` 存在性守卫 + `PREPARE/EXECUTE` 动态 SQL）。二者内容**已对齐、无冲突**：全新导入用 `sky.sql`，旧库升级用迁移脚本，落到的最终 schema 一致。

---

## 表结构

### 表：`address_book` —— 地址簿（用户收货地址）
> 来源：`D:\CQWM2\sky.sql`

| 字段 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| id | bigint | 否 | AUTO_INCREMENT | 主键 |
| user_id | bigint | 否 | | 用户 id（逻辑关联 user.id） |
| consignee | varchar(50) | 是 | NULL | 收货人 |
| sex | varchar(2) | 是 | NULL | 性别 |
| 🔐 phone | varchar(11) | 否 | | 手机号 |
| province_code | varchar(12) | 是 | NULL | 省级区划编号 |
| province_name | varchar(32) | 是 | NULL | 省级名称 |
| city_code | varchar(12) | 是 | NULL | 市级区划编号 |
| city_name | varchar(32) | 是 | NULL | 市级名称 |
| district_code | varchar(12) | 是 | NULL | 区级区划编号 |
| district_name | varchar(32) | 是 | NULL | 区级名称 |
| 🔐 detail | varchar(200) | 是 | NULL | 详细地址 |
| label | varchar(100) | 是 | NULL | 标签（家/公司/学校等） |
| is_default | tinyint(1) | 否 | 0 | 是否默认地址 0 否 1 是 |

- 主键：`id`
- 唯一键 / 索引：无（仅主键）
- 关联：`user_id` → `user.id`（逻辑关联，无显式外键）

### 表：`category` —— 菜品及套餐分类
> 来源：`D:\CQWM2\sky.sql`

| 字段 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| id | bigint | 否 | AUTO_INCREMENT | 主键 |
| type | int | 是 | NULL | 类型 1 菜品分类 2 套餐分类 |
| name | varchar(32) | 否 | | 分类名称 |
| sort | int | 否 | 0 | 顺序 |
| status | int | 是 | NULL | 分类状态 0 禁用 1 启用 |
| create_time | datetime | 是 | NULL | 创建时间（自动填充） |
| update_time | datetime | 是 | NULL | 更新时间（自动填充） |
| create_user | bigint | 是 | NULL | 创建人（→ employee.id，自动填充） |
| update_user | bigint | 是 | NULL | 修改人（→ employee.id，自动填充） |

- 主键：`id`
- 唯一键 / 索引：`UNIQUE KEY idx_category_name (name)`
- 关联：`create_user`/`update_user` → `employee.id`（逻辑关联）；被 `dish.category_id`、`setmeal.category_id` 逻辑引用
- 有内联 INSERT 初始数据（10 行，未读具体行）

### 表：`dish` —— 菜品
> 来源：`D:\CQWM2\sky.sql`

| 字段 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| id | bigint | 否 | AUTO_INCREMENT | 主键 |
| name | varchar(32) | 否 | | 菜品名称 |
| category_id | bigint | 否 | | 菜品分类 id（→ category.id） |
| price | decimal(10,2) | 是 | NULL | 菜品价格 |
| image | varchar(255) | 是 | NULL | 图片 URL |
| description | varchar(255) | 是 | NULL | 描述信息 |
| status | int | 是 | 1 | 0 停售 1 起售 |
| create_time | datetime | 是 | NULL | 创建时间（自动填充） |
| update_time | datetime | 是 | NULL | 更新时间（自动填充） |
| create_user | bigint | 是 | NULL | 创建人（→ employee.id，自动填充） |
| update_user | bigint | 是 | NULL | 修改人（→ employee.id，自动填充） |

- 主键：`id`
- 唯一键 / 索引：`UNIQUE KEY idx_dish_name (name)`
- 关联：`category_id` → `category.id`（逻辑关联）；被 `dish_flavor.dish_id`、`setmeal_dish.dish_id`、`order_detail.dish_id`、`shopping_cart.dish_id` 逻辑引用
- 有内联 INSERT 初始数据（24 行，未读具体行）

### 表：`dish_flavor` —— 菜品口味关系表
> 来源：`D:\CQWM2\sky.sql`

| 字段 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| id | bigint | 否 | AUTO_INCREMENT | 主键 |
| dish_id | bigint | 否 | | 菜品 id（→ dish.id） |
| name | varchar(32) | 是 | NULL | 口味名称（如「甜味」「辣度」） |
| value | varchar(255) | 是 | NULL | 口味数据 list（JSON 字符串，如 `["无糖","少糖"]`） |

- 主键：`id`
- 唯一键 / 索引：无（仅主键）
- 关联：`dish_id` → `dish.id`（逻辑关联，一个菜品多条口味）
- 有内联 INSERT 初始数据（24 行，未读具体行）

### 表：`employee` —— 员工信息（管理端账号）
> 来源：`D:\CQWM2\sky.sql`（admin 密码已是功能 0001 迁移后的 BCrypt 哈希）

| 字段 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| id | bigint | 否 | AUTO_INCREMENT | 主键 |
| name | varchar(32) | 否 | | 姓名 |
| username | varchar(32) | 否 | | 登录用户名 |
| 🔐 password | varchar(64) | 否 | | 登录密码（BCrypt 哈希，功能 0001 后） |
| 🔐 phone | varchar(11) | 否 | | 手机号 |
| sex | varchar(2) | 否 | | 性别 |
| 🔐 id_number | varchar(18) | 否 | | 身份证号 |
| status | int | 否 | 1 | 状态 0 禁用 1 启用 |
| create_time | datetime | 是 | NULL | 创建时间（自动填充） |
| update_time | datetime | 是 | NULL | 更新时间（自动填充） |
| create_user | bigint | 是 | NULL | 创建人（→ employee.id，自动填充） |
| update_user | bigint | 是 | NULL | 修改人（→ employee.id，自动填充） |

- 主键：`id`
- 唯一键 / 索引：`UNIQUE KEY idx_username (username)`
- 关联：`create_user`/`update_user` → `employee.id`（自引用，逻辑关联）；被 `category`/`dish`/`setmeal` 的 `create_user`/`update_user` 逻辑引用
- 有内联 INSERT（1 行：admin 管理员账号，未读明文值——密码为 BCrypt 哈希）

### 表：`order_detail` —— 订单明细表
> 来源：`D:\CQWM2\sky.sql`

| 字段 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| id | bigint | 否 | AUTO_INCREMENT | 主键 |
| name | varchar(32) | 是 | NULL | 商品名字（下单时快照） |
| image | varchar(255) | 是 | NULL | 图片（下单时快照） |
| order_id | bigint | 否 | | 订单 id（→ orders.id） |
| dish_id | bigint | 是 | NULL | 菜品 id（→ dish.id，与 setmeal_id 二选一） |
| setmeal_id | bigint | 是 | NULL | 套餐 id（→ setmeal.id，与 dish_id 二选一） |
| dish_flavor | varchar(50) | 是 | NULL | 口味（下单时快照） |
| number | int | 否 | 1 | 数量 |
| amount | decimal(10,2) | 否 | | 金额 |

- 主键：`id`
- 唯一键 / 索引：无（仅主键）
- 关联：`order_id` → `orders.id`（逻辑关联，一订单多明细）；`dish_id` → `dish.id` / `setmeal_id` → `setmeal.id`（逻辑关联，快照式）

### 表：`orders` —— 订单表
> 来源：`D:\CQWM2\sky.sql`

| 字段 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| id | bigint | 否 | AUTO_INCREMENT | 主键 |
| number | varchar(50) | 是 | NULL | 订单号（业务流水号，非主键） |
| status | int | 否 | 1 | 订单状态 1 待付款 2 待接单 3 已接单 4 派送中 5 已完成 6 已取消 7 退款 |
| user_id | bigint | 否 | | 下单用户（→ user.id） |
| address_book_id | bigint | 否 | | 地址 id（→ address_book.id） |
| order_time | datetime | 否 | | 下单时间 |
| checkout_time | datetime | 是 | NULL | 结账（支付）时间 |
| pay_method | int | 否 | 1 | 支付方式 1 微信 2 支付宝 |
| pay_status | tinyint | 否 | 0 | 支付状态 0 未支付 1 已支付 2 退款 |
| amount | decimal(10,2) | 否 | | 实收金额 |
| remark | varchar(100) | 是 | NULL | 备注 |
| 🔐 phone | varchar(11) | 是 | NULL | 手机号（下单快照） |
| 🔐 address | varchar(255) | 是 | NULL | 地址（下单快照，详细地址） |
| user_name | varchar(32) | 是 | NULL | 用户名称（快照） |
| consignee | varchar(32) | 是 | NULL | 收货人（快照） |
| cancel_reason | varchar(255) | 是 | NULL | 订单取消原因 |
| rejection_reason | varchar(255) | 是 | NULL | 订单拒绝原因 |
| cancel_time | datetime | 是 | NULL | 订单取消时间 |
| estimated_delivery_time | datetime | 是 | NULL | 预计送达时间 |
| delivery_status | tinyint(1) | 否 | 1 | 配送状态 1 立即送出 0 选择具体时间 |
| delivery_time | datetime | 是 | NULL | 送达时间 |
| pack_amount | int | 是 | NULL | 打包费 |
| tableware_number | int | 是 | NULL | 餐具数量 |
| tableware_status | tinyint(1) | 否 | 1 | 餐具数量状态 1 按餐量提供 0 选择具体数量 |

- 主键：`id`
- 唯一键 / 索引：无（`number` 订单号未建唯一索引）
- 关联：`user_id` → `user.id`、`address_book_id` → `address_book.id`（逻辑关联）；被 `order_detail.order_id` 逻辑引用
- 说明：大量字段是「下单瞬间的快照」（phone/address/consignee/user_name），与 `user`/`address_book` 当前值可能不同——这是外卖订单常见的反规范化设计（下单后地址改了不影响历史订单）

### 表：`setmeal` —— 套餐
> 来源：`D:\CQWM2\sky.sql`

| 字段 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| id | bigint | 否 | AUTO_INCREMENT | 主键 |
| category_id | bigint | 否 | | 分类 id（→ category.id） |
| name | varchar(32) | 否 | | 套餐名称 |
| price | decimal(10,2) | 否 | | 套餐价格 |
| status | int | 是 | 1 | 售卖状态 0 停售 1 起售 |
| description | varchar(255) | 是 | NULL | 描述信息 |
| image | varchar(255) | 是 | NULL | 图片 URL |
| create_time | datetime | 是 | NULL | 创建时间（自动填充） |
| update_time | datetime | 是 | NULL | 更新时间（自动填充） |
| create_user | bigint | 是 | NULL | 创建人（→ employee.id，自动填充） |
| update_user | bigint | 是 | NULL | 修改人（→ employee.id，自动填充） |

- 主键：`id`
- 唯一键 / 索引：`UNIQUE KEY idx_setmeal_name (name)`
- 关联：`category_id` → `category.id`（逻辑关联）；被 `setmeal_dish.setmeal_id`、`order_detail.setmeal_id`、`shopping_cart.setmeal_id` 逻辑引用

### 表：`setmeal_dish` —— 套餐菜品关系（多对多连接表）
> 来源：`D:\CQWM2\sky.sql`

| 字段 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| id | bigint | 否 | AUTO_INCREMENT | 主键 |
| setmeal_id | bigint | 是 | NULL | 套餐 id（→ setmeal.id） |
| dish_id | bigint | 是 | NULL | 菜品 id（→ dish.id） |
| name | varchar(32) | 是 | NULL | 菜品名称（冗余字段） |
| price | decimal(10,2) | 是 | NULL | 菜品单价（冗余字段） |
| copies | int | 是 | NULL | 菜品份数 |

- 主键：`id`
- 唯一键 / 索引：无（仅主键）
- 关联：`setmeal_id` → `setmeal.id`、`dish_id` → `dish.id`（逻辑关联）——本表是 `setmeal` ∞─∞ `dish` 的**连接表**

### 表：`shopping_cart` —— 购物车
> 来源：`D:\CQWM2\sky.sql`

| 字段 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| id | bigint | 否 | AUTO_INCREMENT | 主键 |
| name | varchar(32) | 是 | NULL | 商品名称（快照） |
| image | varchar(255) | 是 | NULL | 图片（快照） |
| user_id | bigint | 否 | | 用户 id（→ user.id）（COMMENT 误写为「主键」） |
| dish_id | bigint | 是 | NULL | 菜品 id（→ dish.id，与 setmeal_id 二选一） |
| setmeal_id | bigint | 是 | NULL | 套餐 id（→ setmeal.id，与 dish_id 二选一） |
| dish_flavor | varchar(50) | 是 | NULL | 口味 |
| number | int | 否 | 1 | 数量 |
| amount | decimal(10,2) | 否 | | 金额 |
| create_time | datetime | 是 | NULL | 创建时间 |

- 主键：`id`
- 唯一键 / 索引：无（仅主键）
- 关联：`user_id` → `user.id`（逻辑关联，一用户一车多条）；`dish_id`/`setmeal_id` → `dish.id`/`setmeal.id`（逻辑关联）

### 表：`user` —— 用户信息（C 端顾客账号）
> 来源：`D:\CQWM2\sky.sql`（已含功能 0001 新增的 username/password/idx_username）；增量来自 `0001-migration.sql`

| 字段 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| id | bigint | 否 | AUTO_INCREMENT | 主键 |
| openid | varchar(45) | 是 | NULL | 微信用户唯一标识（微信遗留，允许空以兼容本地账号） |
| username | varchar(32) | 是 | NULL | 登录用户名（**功能 0001 新增**） |
| 🔐 password | varchar(64) | 是 | NULL | 密码 BCrypt（**功能 0001 新增**） |
| name | varchar(32) | 是 | NULL | 姓名 |
| 🔐 phone | varchar(11) | 是 | NULL | 手机号 |
| sex | varchar(2) | 是 | NULL | 性别 |
| 🔐 id_number | varchar(18) | 是 | NULL | 身份证号 |
| avatar | varchar(500) | 是 | NULL | 头像 URL |
| create_time | datetime | 是 | NULL | 注册时间 |

- 主键：`id`
- 唯一键 / 索引：`UNIQUE KEY idx_username (username)`（**功能 0001 新增**；唯一索引允许多个 NULL，给「仅 openid / 社交登录」用户留空间）
- 关联：被 `address_book.user_id`、`orders.user_id`、`shopping_cart.user_id` 逻辑引用
- 功能 0001 增量（`0001-migration.sql`）：① `ADD COLUMN username`（openid 之后）；② `ADD COLUMN password`（username 之后）；③ `ADD UNIQUE KEY idx_username(username)`。三步均带 `information_schema` 存在性守卫，幂等可重跑。`sky.sql` 已内含此最终形态，二者对齐无冲突。

---

## 实体↔表映射

> 覆盖 S3 文件清单里列出的**全部 11 个** entity。所有实体均**无** MyBatis-Plus/JPA 映射注解，列名↔属性名靠 `map-underscore-to-camel-case=true` 自动转换。

| 实体类 | 对应表 | 文件路径 | 映射说明 |
|---|---|---|---|
| AddressBook | address_book | `sky-pojo\...\entity\AddressBook.java` | 字段一一对应；`isDefault`↔`is_default`、`provinceCode`↔`province_code` 等下划线映射。表 14 列 = 实体 14 字段，完全对齐 |
| Category | category | `sky-pojo\...\entity\Category.java` | 一一对应；含公共四件套 `createTime/updateTime/createUser/updateUser` |
| Dish | dish | `sky-pojo\...\entity\Dish.java` | 一一对应；含公共四件套。实体**无** `flavors` 字段（口味在 DishDTO/DishVO 里才组合） |
| DishFlavor | dish_flavor | `sky-pojo\...\entity\DishFlavor.java` | 一一对应（id/dishId/name/value 4 字段） |
| Employee | employee | `sky-pojo\...\entity\Employee.java` | 一一对应；含公共四件套 + 认证字段 username/password |
| OrderDetail | order_detail | `sky-pojo\...\entity\OrderDetail.java` | 一一对应（实体字段顺序 image 在末尾，DDL 中 image 在前，属**顺序差异不影响 MyBatis 按列名映射**） |
| Orders | orders | `sky-pojo\...\entity\Orders.java` | 一一对应（24 列↔24 字段）。实体额外定义了 `status`/`payStatus` 的静态常量（见下「字段合法值」）。**类型注意**：`packAmount`、`tablewareNumber` 实体声明为原始类型 `int`，而 DDL 列 `pack_amount`/`tableware_number` 允许 NULL——查出 NULL 时 MyBatis 拆箱可能 NPE（登记差异，不展开逻辑） |
| Setmeal | setmeal | `sky-pojo\...\entity\Setmeal.java` | 一一对应；含公共四件套 |
| SetmealDish | setmeal_dish | `sky-pojo\...\entity\SetmealDish.java` | 一一对应（id/setmealId/dishId/name/price/copies 6 字段） |
| ShoppingCart | shopping_cart | `sky-pojo\...\entity\ShoppingCart.java` | 一一对应（实体 image 字段在末尾，DDL image 在前，顺序差异不影响按列名映射） |
| User | user | `sky-pojo\...\entity\User.java` | 一一对应（10 列↔10 字段）；`idNumber`↔`id_number`、`createTime`↔`create_time`。含功能 0001 的 username/password |

**字段合法值（顺手记录，取自 DDL COMMENT 与实体常量）：**
- `orders.status`（Orders 实体静态常量）：1 `PENDING_PAYMENT` 待付款 / 2 `TO_BE_CONFIRMED` 待接单 / 3 `CONFIRMED` 已接单 / 4 `DELIVERY_IN_PROGRESS` 派送中 / 5 `COMPLETED` 已完成 / 6 `CANCELLED` 已取消（DDL COMMENT 另列 7 退款，实体未定义 7 的常量）
- `orders.pay_status`（Orders 实体静态常量）：0 `UN_PAID` 未支付 / 1 `PAID` 已支付 / 2 `REFUND` 退款
- `orders.pay_method`：1 微信 / 2 支付宝（DDL COMMENT）
- `category.type` / `dish.status` / `setmeal.status` / `category.status`：见各表 COMMENT（1 菜品分类 2 套餐分类；0 停售 1 起售 等）

---

## 表关系图

（纯文字箭头，未用代码块包裹；所有关系均为**逻辑关联**——DDL 中无任何显式 FOREIGN KEY 约束，依据共享的 `xxx_id` 列命名推断）

[user]  ── C 端顾客账号
  │ 1─∞ (user.id ← address_book.user_id，xxx_id 逻辑关联)
  ├──▶ [address_book]  ── 收货地址簿
  │ 1─∞ (user.id ← orders.user_id，xxx_id 逻辑关联)
  ├──▶ [orders]  ── 订单
  │ 1─∞ (user.id ← shopping_cart.user_id，xxx_id 逻辑关联)
  └──▶ [shopping_cart]  ── 购物车

[address_book]  ── 收货地址簿
  │ 1─∞ (address_book.id ← orders.address_book_id，xxx_id 逻辑关联)
  ▼
[orders]  ── 订单
  │ 1─∞ (orders.id ← order_detail.order_id，xxx_id 逻辑关联)
  ▼
[order_detail]  ── 订单明细（下单快照）

[category]  ── 菜品/套餐分类
  │ 1─∞ (category.id ← dish.category_id，xxx_id 逻辑关联)
  ├──▶ [dish]  ── 菜品
  │ 1─∞ (category.id ← setmeal.category_id，xxx_id 逻辑关联)
  └──▶ [setmeal]  ── 套餐

[dish]  ── 菜品
  │ 1─∞ (dish.id ← dish_flavor.dish_id，xxx_id 逻辑关联)
  ▼
[dish_flavor]  ── 菜品口味

[setmeal]  ∞─∞  [dish]  ── 套餐与菜品多对多
  │ 经连接表 setmeal_dish
  │   (setmeal.id ← setmeal_dish.setmeal_id，xxx_id 逻辑关联)
  │   (dish.id    ← setmeal_dish.dish_id，   xxx_id 逻辑关联)
  ▼
[setmeal_dish]  ── 套餐菜品关系（连接表）

[order_detail] / [shopping_cart]  ── 均含可空 dish_id / setmeal_id（二选一）
  ├──▶ [dish]     (dish_id → dish.id，xxx_id 逻辑关联，快照式)
  └──▶ [setmeal]  (setmeal_id → setmeal.id，xxx_id 逻辑关联，快照式)

[employee]  ── 管理端员工账号（独立表，无入向业务外键）
  │ 1─∞ (employee.id ← {category,dish,setmeal}.create_user/update_user，公共字段逻辑关联)
  └──▶ [category] / [dish] / [setmeal]  ── 记录「谁创建/修改」

---

## 请求 / 响应对象清单（DTO / Request / VO）

> DTO 包共 23 个、VO 包共 17 个，**均未超过 30 个阈值**，故全部登记；核心相关的展开关键字段。所有类均 `implements Serializable`、`@Data`（Lombok）。来源均为 S3 `sky-pojo` 文件清单。路径前缀省略为 `sky-pojo\...\dto\` 与 `sky-pojo\...\vo\`。

### DTO / Query（入参，23 个）

| 类名 | 路径 | 用途 | 关键字段 | 来源 |
|---|---|---|---|---|
| OrdersSubmitDTO | dto\OrdersSubmitDTO.java | C 端下单入参 | addressBookId, payMethod, remark, estimatedDeliveryTime, deliveryStatus, tablewareNumber, tablewareStatus, packAmount, amount | S3 |
| OrdersPaymentDTO | dto\OrdersPaymentDTO.java | 支付入参 | orderNumber, payMethod | S3 |
| OrdersDTO | dto\OrdersDTO.java | 订单通用传输（含明细列表） | id, number, status, userId, addressBookId, orderTime, checkoutTime, payMethod, amount, remark, userName, phone, address, consignee, orderDetails:List\<OrderDetail\> | S3 |
| OrdersPageQueryDTO | dto\OrdersPageQueryDTO.java | 订单分页查询 | page, pageSize, number, phone, status, beginTime, endTime, userId | S3 |
| OrdersCancelDTO | dto\OrdersCancelDTO.java | 管理端取消订单 | id, cancelReason | S3 |
| OrdersConfirmDTO | dto\OrdersConfirmDTO.java | 管理端接单 | id, status | S3 |
| OrdersRejectionDTO | dto\OrdersRejectionDTO.java | 管理端拒单 | id, rejectionReason | S3 |
| ShoppingCartDTO | dto\ShoppingCartDTO.java | 购物车增删入参 | dishId, setmealId, dishFlavor | S3 |
| DishDTO | dto\DishDTO.java | 菜品新增/修改（含口味） | id, name, categoryId, price, image, description, status, flavors:List\<DishFlavor\> | S3 |
| DishPageQueryDTO | dto\DishPageQueryDTO.java | 菜品分页查询 | page, pageSize, name, categoryId, status | S3 |
| SetmealDTO | dto\SetmealDTO.java | 套餐新增/修改（含菜品关系） | id, categoryId, name, price, status, description, image, setmealDishes:List\<SetmealDish\> | S3 |
| SetmealPageQueryDTO | dto\SetmealPageQueryDTO.java | 套餐分页查询 | page, pageSize, name, categoryId, status | S3 |
| CategoryDTO | dto\CategoryDTO.java | 分类新增/修改 | id, type, name, sort | S3 |
| CategoryPageQueryDTO | dto\CategoryPageQueryDTO.java | 分类分页查询 | page, pageSize, name, type | S3 |
| EmployeeDTO | dto\EmployeeDTO.java | 员工新增/修改 | id, username, name, phone, sex, idNumber | S3 |
| EmployeeLoginDTO | dto\EmployeeLoginDTO.java | 管理端登录入参 | username, password（🔐）；带 Swagger `@ApiModel`/`@ApiModelProperty` | S3 |
| EmployeePageQueryDTO | dto\EmployeePageQueryDTO.java | 员工分页查询 | name, page, pageSize | S3 |
| UserLoginDTO | dto\UserLoginDTO.java | C 端登录入参（功能 0001 本地账密） | username, password（🔐） | S3 |
| UserRegisterDTO | dto\UserRegisterDTO.java | C 端注册入参（功能 0001） | username, password（🔐） | S3 |
| UserChangePasswordDTO | dto\UserChangePasswordDTO.java | C 端改密（功能 0001） | oldPassword, newPassword（🔐） | S3 |
| PasswordEditDTO | dto\PasswordEditDTO.java | 管理端员工改密 | empId, oldPassword, newPassword（🔐） | S3 |
| DataOverViewQueryDTO | dto\DataOverViewQueryDTO.java | 报表时间区间查询 | begin, end（LocalDateTime）；`@Builder` | S3 |
| GoodsSalesDTO | dto\GoodsSalesDTO.java | 销量统计中间对象 | name, number；`@Builder` | S3 |

### VO（出参，17 个）

| 类名 | 路径 | 用途 | 关键字段 | 来源 |
|---|---|---|---|---|
| OrderSubmitVO | vo\OrderSubmitVO.java | 下单成功返回 | id, orderNumber, orderAmount, orderTime | S3 |
| OrderPaymentVO | vo\OrderPaymentVO.java | 微信支付预下单返回（遗留） | nonceStr, paySign, timeStamp, signType, packageStr | S3 |
| OrderVO | vo\OrderVO.java | 订单详情返回（**extends Orders**） | 继承 Orders 全部字段 + orderDishes, orderDetailList:List\<OrderDetail\> | S3 |
| OrderStatisticsVO | vo\OrderStatisticsVO.java | 管理端订单各状态计数 | toBeConfirmed, confirmed, deliveryInProgress | S3 |
| DishVO | vo\DishVO.java | 菜品详情返回 | id, name, categoryId, price, image, description, status, updateTime, categoryName, flavors:List\<DishFlavor\> | S3 |
| DishItemVO | vo\DishItemVO.java | 套餐内菜品项展示 | name, copies, image, description | S3 |
| SetmealVO | vo\SetmealVO.java | 套餐详情返回 | id, categoryId, name, price, status, description, image, updateTime, categoryName, setmealDishes:List\<SetmealDish\> | S3 |
| EmployeeLoginVO | vo\EmployeeLoginVO.java | 管理端登录返回 | id, userName, name, token；带 Swagger 注解 | S3 |
| UserLoginVO | vo\UserLoginVO.java | C 端登录返回（功能 0001） | id, username, token | S3 |
| BusinessDataVO | vo\BusinessDataVO.java | 工作台数据概览 | turnover, validOrderCount, orderCompletionRate, unitPrice, newUsers | S3 |
| DishOverViewVO | vo\DishOverViewVO.java | 工作台菜品总览 | sold, discontinued | S3 |
| SetmealOverViewVO | vo\SetmealOverViewVO.java | 工作台套餐总览 | sold, discontinued | S3 |
| OrderOverViewVO | vo\OrderOverViewVO.java | 工作台订单总览 | waitingOrders, deliveredOrders, completedOrders, cancelledOrders, allOrders | S3 |
| OrderReportVO | vo\OrderReportVO.java | 订单统计报表 | dateList, orderCountList, validOrderCountList, totalOrderCount, validOrderCount, orderCompletionRate | S3 |
| TurnoverReportVO | vo\TurnoverReportVO.java | 营业额报表 | dateList, turnoverList | S3 |
| UserReportVO | vo\UserReportVO.java | 用户统计报表 | dateList, totalUserList, newUserList | S3 |
| SalesTop10ReportVO | vo\SalesTop10ReportVO.java | 销量 Top10 报表 | nameList, numberList | S3 |

---

## 数据模型类比

把整个数据库想象成一家外卖餐厅的**后台档案柜**，每张表是一个专用的活页夹（登记册），字段是活页上必须填的栏目，`xxx_id` 逻辑关联则是活页夹之间「见此编号请翻另一册」的互相指向：

- **`user` / `employee`（两本人员名册）**：一本登记来点餐的顾客（C 端），一本登记店里的员工（管理端）。每人一张页，`id` 是页码；`username`/`password` 是这个人的门禁卡号和密码（🔐 锁起来）。
- **`category` → `dish` / `setmeal`（菜单目录 → 单品册 / 套餐册）**：目录册先分好「菜品类」「套餐类」，单品册和套餐册每一页都写着「归属目录编号 `category_id`」，翻回目录就知道属于哪一类。
- **`dish_flavor`（口味便签本）**：每张口味便签写着「属于哪道菜 `dish_id`」——一道菜可以贴多张（甜度、辣度），是典型的一对多。
- **`setmeal_dish`（套餐配料单）**：这是一本「中间账本」，专门记「哪个套餐 `setmeal_id` 里装了哪道菜 `dish_id`、几份」——因为一个套餐含多道菜、一道菜又能进多个套餐，所以要单开一本连接账（多对多）。
- **`shopping_cart`（临时点餐篮）**：顾客还没结账时东西先放这本，写清「谁的篮子 `user_id`、装了什么」。
- **`orders` → `order_detail`（正式订单存根 → 订单逐项清单）**：一旦结账，就从点餐篮生成一张正式订单存根（记总额、地址、状态流转），存根下再挂若干「逐项清单」（`order_id` 指回存根），逐条记这单买了哪些东西。存根里的地址/手机号是**下单当刻的照片**（快照），顾客事后改地址不会改动历史存根。
- **`address_book`（顾客的收货地址簿）**：每条地址写着「属于哪个顾客 `user_id`」，下单时挑一条抄进订单存根。

**类比与真实数据模型的对应**：活页夹=表，活页栏目=字段，「见编号翻另一册」的指向=`xxx_id` 逻辑关联（本项目全部是逻辑关联，档案柜里**没有装物理联动的机械锁**——即数据库无显式外键约束，靠应用层自觉维护一致性）。「一本目录 → 多本单品」= 一对多（category→dish）；「套餐配料单」这本中间账本 = 多对多的连接表（setmeal_dish 连 setmeal 与 dish）；订单存根里的地址快照 = 反规范化的冗余字段。
