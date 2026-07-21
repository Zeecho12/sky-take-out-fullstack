# C 端菜品查询（Query Dishes by Category）全链路源码精读：Redis 缓存旁路模式（Cache-Aside）

**视频出处**：[在此处填写视频链接/出处]  
**关键词**：三层架构（Controller-Service-Mapper）、Entity/VO 数据载体、Redis 缓存、缓存旁路模式（Cache-Aside Pattern）、缓存命中/未命中（Cache Hit / Miss）、`RedisTemplate`、序列化（Serialization）与 `Serializable`、JDK 序列化器、N+1 查询问题（N+1 Query Problem）、MyBatis 动态 SQL（`<where>` / `<if>`）、Bean 命名冲突（Bean Name Conflict）、统一返回结果 `Result<T>`、C 端与管理端的差异  
**创建时间**：2026-06-10 16:56

---

## 〇、阅读这条链路前，先建立"全景地图"

我们要追的这条链，是**面向顾客（C 端）的菜品浏览**：顾客在小程序里点开某个菜品分类（比如"热菜"），前端发一个请求过来，后端把这个分类下**所有在售菜品 + 每个菜品的口味**查出来返回。

这条链最大的看点，**不是查数据库本身**（那套 Controller→Service→Mapper 在《员工登录》那条链里已经讲透了），而是它在最前面加了一层 **Redis 缓存**。顾客端的菜品列表是"读多写少、所有人看到的内容都一样"的典型数据——这正是缓存最该出场的场景。

用**餐厅运营**打比方，整条链上的角色是这样的：

| 角色 | 项目中的层 | 职责 | 类比 |
|---|---|---|---|
| 前台收银员 | `DishController`（user 端） | 接客、**先翻一眼"今日备菜单"** | 不进后厨，先看手边那张抄好的单子 |
| 今日备菜单（白板） | `Redis` | 缓存热点数据，命中就不进后厨 | 贴在前台、随手可查的速记板 |
| 厨师长 | `DishServiceImpl` | 组织查询、把菜品和口味拼装好 | 真正去后厨取料、装盘的人 |
| 仓库管理员 | `DishMapper` / `DishFlavorMapper` | 按单去冷库取货 | 只和数据库打交道 |
| 冷库 | `MySQL` | 存放原始数据 | 真实的食材仓库 |

**断点调试时，程序会按这个顺序在文件间跳转**（请把这张图记在脑子里，后面每一步都对应这里的一行）：

```
前端 GET /user/dish/list?categoryId=10
   │
   ▼
① DishController.list(categoryId)               [sky-server] 接客 + 先查缓存
   │  key = "dish_" + categoryId
   │  list = redisTemplate.opsForValue().get(key)
   │
   ├──【缓存命中 Cache Hit】list 非空  →  Result.success(list) 直接返回  ✅ 全程不碰 MySQL
   │
   └──【缓存未命中 Cache Miss】组装查询条件 Dish{categoryId, status=ENABLE}
         │  dishService.listWithFlavor(dish)
         ▼
   ② DishServiceImpl.listWithFlavor(dish)        [sky-server] 厨师长
         │  dishMapper.list(dish)
         ▼
   ③ DishMapper（接口）→ DishMapper.xml <select id="list">   [sky-server] 仓库 + 账本
         │  select * from dish where category_id=? and status=?
         ▼
      MySQL 返回 N 条 Dish  →（原路返回 ②）
         │
   ②’ 遍历每一条 Dish，再逐条查它的口味  ←★ 这里是 N+1 查询
         │  dishFlavorMapper.getByDishId(d.getId())
         ▼
   ③’ DishFlavorMapper → DishFlavorMapper.xml <select id="getByDishId">
         │  select * from dish_flavor where dish_id=?
         ▼
      把每条 Dish 拷成 DishVO、塞进 flavors，汇总成 List<DishVO>
         │ （原路返回 ①）
         ▼
   ①’ 回到 Controller：把 List<DishVO> 写回 Redis（set key list）
         │
         ▼
Result.success(list)  →  以 JSON 返回前端
```

> **跨模块提示**：这条请求横跨三个 Maven 子模块。
> - `DishController` / `DishServiceImpl` / `DishMapper` / `DishFlavorMapper` / `RedisConfiguration` 都在 **`sky-server`**；
> - `Dish`、`DishFlavor`（Entity）、`DishVO`（VO）这些数据类在 **`sky-pojo`**；
> - `StatusConstant`、`Result` 这些通用件在 **`sky-common`**。

下面进入断点逐步走读。

---

## 一、第 ① 步：请求落到 Controller，第一件事是查缓存

**文件**：`sky-server/src/main/java/com/sky/controller/user/DishController.java`

```java
@RestController("userDishController")   // ★ 注意这个显式的 Bean 名字，下面专门讲
@RequestMapping("/user/dish")           // 这个类下所有接口的公共前缀
@Slf4j
@Api(tags = "C端-菜品浏览接口")
public class DishController {
    @Autowired
    private DishService dishService;

    @Autowired
    private RedisTemplate redisTemplate;   // 注入操作 Redis 的模板对象

    @GetMapping("/list")                   // 完整路径 = GET /user/dish/list
    @ApiOperation("根据分类id查询菜品")
    public Result<List<DishVO>> list(Long categoryId) {
        // 构造 redis 中的 key，规则：dish_分类Id
        String key = "dish_" + categoryId;

        // 查询 redis 中是否存在菜品数据
        List<DishVO> list = (List<DishVO>) redisTemplate.opsForValue().get(key);
        if (list != null && list.size() > 0) {
            // 如果存在（缓存命中），直接返回，无需查询数据库
            return Result.success(list);
        }

        // 如果不存在（缓存未命中），查询数据库，再把结果放入 redis
        Dish dish = new Dish();
        dish.setCategoryId(categoryId);
        dish.setStatus(StatusConstant.ENABLE);   // 只查"起售中"的菜品

        list = dishService.listWithFlavor(dish);

        // 放入 redis
        redisTemplate.opsForValue().set(key, list);
        return Result.success(list);
    }
}
```

**断点观察 —— 进方法体之前，框架已经做了三件事：**

1. **路由匹配**：`@RequestMapping("/user/dish")` + `@GetMapping("/list")` 拼出 `GET /user/dish/list`。
2. **参数绑定**：这里入参是 `Long categoryId`，**没有** `@RequestBody`。因为这是 GET 请求，`categoryId` 通过 **URL 查询字符串**（query string，形如 `?categoryId=10`）传来。Spring MVC 默认会把"同名的 query 参数"绑定到方法形参上，等价于隐式的 `@RequestParam`。
   - *对比登录那条链*：登录是 POST + JSON 请求体 → 用 `@RequestBody` 反序列化成 DTO；这里是 GET + URL 参数 → 直接用基本类型形参接。**请求方式不同，取参方式就不同**，这是 REST 接口设计里要分清的。
3. **依赖注入**：`@Autowired` 把 `DishService` 和 `RedisTemplate` 两个 Bean 塞进来。

### 先解决一个最容易被忽略的细节：`@RestController("userDishController")` 为什么要起名字？

- *为什么需要它*：Spring 容器里每个 Bean 都有一个**唯一的名字**。`@RestController` 不写名字时，默认用"类名首字母小写"当 Bean 名。本项目里有**两个** `DishController`：
  - 管理端 `com.sky.controller.admin.DishController`（默认 Bean 名 `dishController`）
  - 用户端 `com.sky.controller.user.DishController`（如果也用默认名，又是 `dishController`）
- 两个类**简单类名相同**，默认 Bean 名就会**撞车**，Spring 启动直接报 `ConflictingBeanDefinitionException`。
- *怎么解决*：给其中一个**显式指定名字**。这里用户端写成 `@RestController("userDishController")`，名字唯一了，冲突就消失了。
- *面试可迁移点*：包名不同不代表 Bean 名不同——Bean 名只看"类名"，不看"包名"。同名类共存时必须手动起名（或用 `@Component("xxx")`）。

> 顺带看一眼这条链路用到的两个数据载体——出参 `DishVO` 和查询条件 `Dish`。

### 配角 A：`DishVO`（后端 → 前端 的出参）

**文件**：`sky-pojo/src/main/java/com/sky/vo/DishVO.java`

```java
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DishVO implements Serializable {   // ★ implements Serializable，下文第五节会解释为什么必须

    private Long id;
    private String name;            // 菜品名称
    private Long categoryId;        // 菜品分类id
    private BigDecimal price;       // 菜品价格
    private String image;           // 图片
    private String description;     // 描述信息
    private Integer status;         // 0 停售 1 起售
    private LocalDateTime updateTime;
    private String categoryName;    // 分类名称
    private List<DishFlavor> flavors = new ArrayList<>();   // ★ 菜品关联的口味列表
}
```

- **为什么需要 VO（View Object，视图对象）而不是直接返回 `Dish` 实体**：`Dish` 实体里有 `createUser`、`updateUser`、`createTime` 这些"内部管理字段"，顾客端根本不该看到。VO 是"为这个接口量身定制"的返回结构。
- **关键差异**：`DishVO` 比 `Dish` 实体**多了一个 `List<DishFlavor> flavors` 字段**。这正是这条链的核心目标——把"菜品"和"它的口味"组装成一个完整对象返回。一个菜品对多个口味，是**一对多（One-to-Many）**关系。
- `flavors` 初始化成空 `ArrayList`（而不是 `null`），是个小巧但好的习惯：前端拿到的永远是数组，不用判空，避免 `NullPointerException`。

### 配角 B：`Dish`（这里被当作"查询条件载体"用）

**文件**：`sky-pojo/src/main/java/com/sky/entity/Dish.java`

```java
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Dish implements Serializable {
    private static final long serialVersionUID = 1L;
    private Long id;
    private String name;
    private Long categoryId;        // ← Controller 里设了这个
    private BigDecimal price;
    private String image;
    private String description;
    private Integer status;         // ← Controller 里设了这个（=1 ENABLE）
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private Long createUser;
    private Long updateUser;
}
```

- **断点观察**：Controller 里 `new Dish()` 后只 set 了 `categoryId` 和 `status` 两个字段，其余全是 `null`。这个半空的 `Dish` 对象**不是要存库**，而是被当成**"查询条件"**传给 Mapper——下面 XML 里的 `<if test="categoryId!=null">` 会根据"哪些字段非空"动态拼 SQL。**同一个实体类，既能当落库载体，也能当查询条件载体**，这是 MyBatis 项目里常见的复用手法。

### 配角 C：`StatusConstant`（状态常量）

**文件**：`sky-common/src/main/java/com/sky/constant/StatusConstant.java`

```java
public class StatusConstant {
    public static final Integer ENABLE = 1;   // 启用 / 起售
    public static final Integer DISABLE = 0;  // 禁用 / 停售
}
```

- *为什么*：`dish.setStatus(1)` 这种**魔法数字（Magic Number）**散落在代码里，过半年没人记得 `1` 到底是"起售"还是"停售"。抽成常量 `StatusConstant.ENABLE`，代码自解释，改值也只改一处。
- **这一步业务含义很重要**：C 端把 `status` 写死成 `ENABLE`，意味着**顾客永远只能看到"起售中"的菜品**，停售的菜对顾客不可见。而管理端的 `DishController` 查询时不会强制加这个条件——**这就是 C 端和管理端的核心差异：看到的数据范围不同。**

---

## 二、缓存这一层：先理解 Redis 与"缓存旁路模式"

在跳进 Service 之前，必须把这条链最有价值的设计——**缓存**——讲清楚。

### ① 为什么需要缓存（不用会怎样）

顾客浏览菜单是**极高频**操作：成百上千人同时刷小程序，每次刷都查一遍数据库。而菜单数据**很少变**（老板一天改不了几次菜）。如果每次都老老实实查 MySQL，会出现：

- 数据库被**重复的、结果几乎不变的查询**反复轰炸，成为性能瓶颈；
- 更要命的是——下面会看到——这条查询本身还是个 **N+1 查询**（1 次查菜品 + N 次查口味），单次开销不小。

用餐厅类比：每来一个客人都让厨师长跑一趟冷库清点库存，太蠢了。聪明的做法是**在前台贴一块"今日备菜单"白板**：客人问菜，先看白板；白板上有就直接答，没有才进后厨清点、清点完顺手抄到白板上。这块白板就是 **Redis**（一个基于内存的高速键值数据库，读写比 MySQL 快几个数量级）。

### ② 它是什么：缓存旁路模式（Cache-Aside Pattern）

本方法用的就是工业界最主流的缓存策略，叫 **Cache-Aside（旁路缓存 / 缓存到一边）**。它的标准三步，和代码**逐行对应**：

```
读请求来了
  1. 先查缓存
     ├─ 命中（Cache Hit）  → 直接返回，结束              ← if (list != null...) return
     └─ 未命中（Cache Miss）↓
  2. 查数据库                                            ← dishService.listWithFlavor(dish)
  3. 把数据库结果写回缓存，再返回                         ← redisTemplate...set(key, list)
```

"旁路"二字的含义：缓存站在数据库**旁边**，由**应用代码自己**负责"查缓存 / 回填缓存"，缓存和数据库之间**不直接通信**。

### ③ 在这个项目里怎么用：`RedisTemplate` 的 API

```java
String key = "dish_" + categoryId;                              // 缓存的 key
List<DishVO> list = (List<DishVO>) redisTemplate.opsForValue().get(key);   // 读
redisTemplate.opsForValue().set(key, list);                     // 写
```

- **`RedisTemplate`** 是 Spring Data Redis 提供的"操作 Redis 的遥控器"。Redis 有 5 种基本数据结构（String / Hash / List / Set / ZSet），`RedisTemplate` 为每种都提供了一组操作入口：
  - `opsForValue()` → 操作 **String（字符串）** 类型（本例用的就是它，把整个 list 当一个值存进去）
  - `opsForHash()` / `opsForList()` / `opsForSet()` / `opsForZSet()` → 对应其余四种
- **key 的设计**：`"dish_" + categoryId`。不同分类用不同 key（`dish_10`、`dish_11`…），互不干扰。加 `dish_` 前缀是为了在 Redis 里**按业务分类、避免 key 撞车**（命名空间的雏形）。

> ⚠️ 这里埋了一个**生产级隐患**，先记住，第七节会专门拆：这条链**只写缓存、不更新/删除缓存**。一旦管理端改了菜品，Redis 里的旧数据不会自动失效，顾客就会看到**脏数据（Stale Data）**。完整的缓存方案必须在"增删改菜品"时**清理对应缓存**。

---

## 三、缓存未命中 → 进入 Service

断点走到 `dishService.listWithFlavor(dish)`，进入业务层。

**注意一个老规矩**：Controller 注入的是 `DishService`（**接口**），运行时执行的是实现类 `DishServiceImpl`。面向接口编程（Program to Interface），换实现不动调用方。

**文件**：`sky-server/src/main/java/com/sky/service/impl/DishServiceImpl.java`

```java
@Service
public class DishServiceImpl implements DishService {

    @Autowired
    private DishMapper dishMapper;
    @Autowired
    private DishFlavorMapper dishFlavorMapper;
    // …… 还注入了 setmealDishMapper / setmealMapper，本条链用不到，略

    /**
     * 条件查询菜品和口味
     */
    @Override
    public List<DishVO> listWithFlavor(Dish dish) {
        // 第 1 次查询：按条件查出所有符合的菜品
        List<Dish> dishList = dishMapper.list(dish);

        ArrayList<DishVO> dishVOArrayList = new ArrayList<>();

        // 遍历每一条菜品
        dishList.forEach(d -> {
            DishVO dishVO = new DishVO();
            BeanUtils.copyProperties(d, dishVO);   // 把 Dish 的同名字段拷到 DishVO

            // 第 2~N+1 次查询：根据菜品 id 再查它的口味  ←★ N+1 问题就在这儿
            List<DishFlavor> flavors = dishFlavorMapper.getByDishId(d.getId());

            dishVO.setFlavors(flavors);            // 把口味塞进 VO
            dishVOArrayList.add(dishVO);
        });

        return dishVOArrayList;
    }
    // …… saveWithFlavor / pageQuery / deleteBatch 等其他方法略
}
```

**断点单步走读：**

- **`dishMapper.list(dish)`**：第一次跳转，去查"符合条件的菜品列表"。注意此刻传进去的 `dish` 只有 `categoryId` 和 `status` 两个非空字段。
- **`BeanUtils.copyProperties(d, dishVO)`**：Spring 提供的工具，把源对象 `d`（`Dish`）里**所有同名属性**的值，反射拷贝到目标对象 `dishVO`（`DishVO`）。`id`、`name`、`price`… 这些两边都有的字段一次性拷完，省得一行行手写 `dishVO.setName(d.getName())`。
  - ⚠️ 小坑：它**只拷同名字段**。`DishVO` 独有的 `categoryName`、`flavors` 不会被它填充（源对象 `Dish` 里压根没有），得另外手动 set。代码里 `flavors` 正是随后手动 set 的。
- **`dishFlavorMapper.getByDishId(d.getId())`**：第二次跳转，**而且在循环里**——有几条菜品就跳几次。这就是下面要重点讲的 N+1。

---

## 四、第 ③ 步：两个 Mapper + 两段 XML

`DishMapper` 和 `DishFlavorMapper` 都**只有接口、没有实现类**，是 MyBatis 用**动态代理（Dynamic Proxy）**在运行时按"接口全限定名 namespace + 方法名 id"匹配 XML 里的 SQL 来执行的（这套机制在《员工登录》笔记里详述过，此处不重复）。

### 4.1 查菜品列表：`DishMapper.list`

**文件（接口）**：`sky-server/src/main/java/com/sky/mapper/DishMapper.java`

```java
@Mapper
public interface DishMapper {
    /**
     * 根据分类id查询菜品
     */
    List<Dish> list(Dish dish);   // 入参是整个 Dish 对象，当查询条件用
    // …… insert / pageQuery / getById / update 等略
}
```

**文件（XML）**：`sky-server/src/main/resources/mapper/DishMapper.xml`

```xml
<mapper namespace="com.sky.mapper.DishMapper">

    <!-- 根据分类id查询菜品 -->
    <select id="list" resultType="com.sky.entity.Dish">
        select *
        from dish
        <where>
            <if test="name!=null">
                and name like concat('%',#{name},'%')
            </if>
            <if test="categoryId!=null">
                and category_id=#{categoryId}
            </if>
            <if test="status!=null">
                and status=#{status}
            </if>
        </where>
        order by create_time desc
    </select>
    <!-- …… 其他 SQL 略 -->
</mapper>
```

**这里出现了 MyBatis 的"动态 SQL（Dynamic SQL）"——务必理解：**

- *为什么需要它*：同一个 `list` 方法，有时只按 `categoryId` 查，有时还想叠加 `name`、`status` 过滤。如果写死 SQL，每种组合都要一条，太啰嗦。动态 SQL 让"传了哪个条件，就拼哪段 `where`"。
- **`<if test="...">`**：条件成立才把里面那段 SQL 拼进去。本条链传进来的 `dish` 只有 `categoryId` 和 `status` 非空，所以最终拼出的真实 SQL 是：
  ```sql
  select * from dish where category_id = ? and status = ? order by create_time desc
  ```
  （`name` 是 null，那段 `<if>` 被跳过。）
- **`<where>` 标签的妙处**：它会**自动处理 `and` 前缀**——如果第一个成立的条件前面带 `and`（比如 `name` 是 null、`category_id` 成了第一个条件，它本来写着 `and category_id=...`），`<where>` 会智能地把多余的开头 `and` 去掉，并且只在确实有条件时才生成 `WHERE` 关键字。这避免了手写 `WHERE 1=1` 这种丑陋的占位 trick。
- `#{categoryId}` 是**预编译占位符**（`PreparedStatement`），天然防 SQL 注入。
- `resultType="com.sky.entity.Dish"`：结果按"列名 → 同名属性"映射成 `Dish`。靠的是 `application.yml` 里的 `map-underscore-to-camel-case: true`，把 `category_id` 这种下划线列名映射成 `categoryId` 驼峰属性。

### 4.2 查某个菜品的口味：`DishFlavorMapper.getByDishId`

**文件（接口）**：`sky-server/src/main/java/com/sky/mapper/DishFlavorMapper.java`

```java
@Mapper
public interface DishFlavorMapper {
    void insertBatch(List<DishFlavor> flavors);   // 批量插入，本条链用不到
    void deleteByDishId(Long id);                 // 删除，本条链用不到
    List<DishFlavor> getByDishId(Long id);        // ★ 本条链用这个
}
```

**文件（XML）**：`sky-server/src/main/resources/mapper/DishFlavorMapper.xml`

```xml
<mapper namespace="com.sky.mapper.DishFlavorMapper">
    <!-- 根据菜品id查询口味数据 -->
    <select id="getByDishId" resultType="com.sky.entity.DishFlavor">
        select *
        from dish_flavor where dish_id=#{dishId};
    </select>
</mapper>
```

- 简单的等值查询：给一个 `dishId`，把 `dish_flavor` 表里属于这个菜品的所有口味行查出来。

### 配角 D：`DishFlavor`（口味实体）

**文件**：`sky-pojo/src/main/java/com/sky/entity/DishFlavor.java`

```java
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DishFlavor implements Serializable {
    private static final long serialVersionUID = 1L;
    private Long id;
    private Long dishId;     // 菜品id（外键，指向 dish 表）
    private String name;     // 口味名称，如"辣度"
    private String value;    // 口味可选值，如 ["不辣","微辣","中辣","重辣"]（存成 JSON 字符串）
}
```

- `dishId` 是**外键**，把口味和菜品关联起来。一个 `dishId` 对应多条 `DishFlavor` → 这就是前面说的一对多。

**这一步的上下游与数据流：**
- 上游：Service 传来一个 `dishId`。
- 下游：MySQL `dish_flavor` 表。返回 `List<DishFlavor>` 给 Service，Service 把它 set 进对应的 `DishVO.flavors`。

---

## 五、回到第 ①’ 步：Controller 写回缓存 + 统一返回

断点从 Service 一路返回到 Controller，手里拿到了组装好的 `List<DishVO>`。最后两件事：

```java
// 把数据库查出来的结果写回 redis（下次同样的 categoryId 请求就能命中）
redisTemplate.opsForValue().set(key, list);
return Result.success(list);
```

这里藏着这条链**最隐蔽、也最值得深挖**的一个知识点——**序列化（Serialization）**。

### 配角 E：`RedisConfiguration` —— 为什么所有 POJO 都要 `implements Serializable`

**文件**：`sky-server/src/main/java/com/sky/config/RedisConfiguration.java`

```java
@Configuration
@Slf4j
public class RedisConfiguration {
    @Bean
    public RedisTemplate redisTemplate(RedisConnectionFactory redisConnectionFactory) {
        log.info("开始创建redis模板对象...");

        RedisTemplate redisTemplate = new RedisTemplate();
        // 设置 redis 的连接工厂对象
        redisTemplate.setConnectionFactory(redisConnectionFactory);
        // 设置 redis key 的序列化器
        redisTemplate.setKeySerializer(new StringRedisSerializer());
        return redisTemplate;
    }
}
```

**① 为什么需要序列化**：Redis 存的是**字节（byte）**，而我们手里是一个 Java 对象（`List<DishVO>`）。要把 Java 对象塞进 Redis，必须先把它"压扁"成字节流——这个过程叫**序列化**；从 Redis 取出来时再"还原"成对象——叫**反序列化（Deserialization）**。负责这件事的组件就是**序列化器（Serializer）**。

**② 这段配置做了什么、没做什么（关键观察）**：
- 它**只设置了 key 的序列化器** `StringRedisSerializer`——目的是让 Redis 里的 key 是**人类可读的字符串**（`dish_10`），而不是一串乱码。你用 Redis 客户端直接 `keys *` 就能看懂。
- 它**没有设置 value 的序列化器**。于是 value 用的是 `RedisTemplate` 的**默认序列化器：`JdkSerializationSerializer`（JDK 原生序列化）**。

**③ 这就解释了一个"看起来莫名其妙"的现象**：为什么 `DishVO`、`Dish`、`DishFlavor` 全都 `implements Serializable`？

> 因为 **JDK 原生序列化的硬性要求就是：被序列化的对象（及它内部引用的所有对象）都必须实现 `java.io.Serializable` 接口**，否则运行时直接抛 `NotSerializableException`。
>
> 我们往 Redis 存的是 `List<DishVO>`，而 `DishVO` 内部又含 `List<DishFlavor>`。所以这一整条引用链上的类——`DishVO`、`DishFlavor`——**全都必须 `implements Serializable`，缺一个就炸**。`Serializable` 是个**标记接口（Marker Interface，没有任何方法）**，它的唯一作用就是"打个标记，告诉 JVM：我同意被序列化"。

**④ 这也解释了那行刺眼的强制类型转换**：

```java
List<DishVO> list = (List<DishVO>) redisTemplate.opsForValue().get(key);
```

`get(key)` 的返回类型是 `Object`（因为 `RedisTemplate` 不带泛型）。JDK 序列化在存的时候把"这是个 `ArrayList<DishVO>`"的类型信息一起存了进去，反序列化能原样还原成对象图，所以这里**强转是安全的**（运行时类型确实匹配）。编译器会给个"unchecked cast"警告，但不影响运行。

> ⚠️ **生产级提醒**：JDK 序列化存进 Redis 的是**二进制乱码**，跨语言读不了、可读性差、体积大、还有安全隐患（反序列化漏洞）。生产里几乎都会把 value 序列化器换成 **`GenericJackson2JsonRedisSerializer`**（存成 JSON，可读、跨语言、体积小），换了之后 POJO 就**不再需要 `implements Serializable`** 了。本项目用 JDK 序列化是教学最省事的默认选择。

### 配角 F：统一返回结果 `Result<T>`

**文件**：`sky-common/src/main/java/com/sky/result/Result.java`

```java
@Data
public class Result<T> implements Serializable {
    private Integer code; // 1 成功，0 和其它数字为失败
    private String msg;   // 错误信息
    private T data;       // 数据（泛型）

    public static <T> Result<T> success(T object) {
        Result<T> result = new Result<T>();
        result.data = object;
        result.code = 1;
        return result;
    }
    public static <T> Result<T> error(String msg) { /* code=0, msg=... 略 */ }
}
```

- 无论缓存命中还是查库，最终都用 `Result.success(list)` 包一层。前端永远拿到统一的 `{code, msg, data}` 结构，用一套逻辑解析。
- `<T>` 泛型让 `data` 这次装的是 `List<DishVO>`。最终被 `@RestController` 序列化成 JSON 返回：
  ```json
  {
    "code": 1,
    "msg": null,
    "data": [
      { "id": 1, "name": "宫保鸡丁", "price": 38.0, "categoryId": 10, "status": 1,
        "flavors": [ { "id": 5, "dishId": 1, "name": "辣度", "value": "[\"微辣\",\"中辣\"]" } ] }
    ]
  }
  ```

---

## 六、总结与思考（比读懂源码更重要的部分）

> **学习心法**：这条链的源码细节（key 叫 `dish_`、status 写死成 ENABLE）换个项目就全变了。但下面这几个**设计思想是通用、可迁移的**。面试官不会问"苍穹外卖的 list 方法 key 怎么拼"，但一定会问"你项目里缓存怎么用的 / 缓存和数据库一致性怎么保证 / N+1 怎么优化"。**记套路，不要记代码。**

### 1. 必背套路一：缓存旁路模式（Cache-Aside）

**口诀**：`读：先查缓存，命中即返回；没中查库，查完回填缓存。`

```
读流程：查缓存 →(命中) 返回
              →(未命中) 查 DB → 写回缓存 → 返回
```

为什么"必背"：
- 这是工业界**最主流**的缓存读策略，几乎所有"读多写少 + 热点数据"场景都用它（菜单、商品详情、配置、排行榜…）。
- **价值**：把高频读从慢速的 MySQL 挡在 Redis 这层，数据库压力骤降、响应飞快。
- **本条链体现得很标准**：`get → if 命中 return → 查库 → set → return`，闭着眼能默写。

> 面试追问"为什么不在写数据库时就更新缓存（Write-Through）？"→ Cache-Aside 让缓存只在"被读到且没命中"时才加载，**冷数据不占缓存**，实现也简单，是性价比最高的默认选择。

### 2. 必背套路二：缓存一致性 —— 本项目的"坑"恰恰是最好的教材

**口诀**：`改了数据库，必须清掉对应缓存，否则顾客看到的是过期数据。`

- **本条链只写缓存、从不失效缓存**，是一个**故意/无意留下的缺陷**。设想：管理员把"宫保鸡丁"停售了（更新了 MySQL），但 Redis 里 `dish_10` 还缓存着"含宫保鸡丁"的旧列表 → 顾客**还能看到本该下架的菜**。这叫**脏数据 / 缓存不一致**。
- **正确做法**：在"新增/修改/删除/起售停售菜品"的写操作里，**主动删除相关缓存 key**（删除而非更新，更简单且不易出错——下次读自然回填最新数据）。管理端 `DishController` 的写接口理应配合 `redisTemplate.delete(key)` 或 `keys("dish_*")` 批量清理。
- **为什么"删"比"更新"好**：更新缓存要重算一遍数据，且并发下容易写入旧值；删除则把"重新加载"推迟到下次读，逻辑最简单。这就是业界常说的 **"Cache-Aside + 删除缓存"**。

> 这是缓存面试的**头号高频题**："如何保证缓存与数据库一致性？" 标准答法：Cache-Aside 读 + 写操作后删除缓存；更严谨的还会讲"延迟双删""先更库再删缓存"以及为什么不"先删缓存再更库"。

### 3. 必背套路三：识别并优化 N+1 查询

**口诀**：`列表里每个元素都单独再查一次库，就是 N+1，能合并就合并。`

- 本条链 `listWithFlavor` 的真实开销：**1 次** `dishMapper.list`（查 N 个菜品）+ 循环里 **N 次** `dishFlavorMapper.getByDishId`（每个菜品查一次口味）= **1 + N 次数据库往返**。这就是经典的 **N+1 查询问题**。
- *为什么是问题*：每次 DB 往返都有网络 + 解析开销。分类下 50 个菜，就是 51 次查询，慢且压数据库。
- **优化方向**（面试能说出一两个就够）：
  1. **一次性批量查口味**：先拿到所有 `dishId`，用 `select * from dish_flavor where dish_id in (...)` **一次查回**所有口味，再在内存里按 `dishId` 分组塞进各自的 VO。1 + N → **2 次查询**。
  2. **MyBatis 关联映射**：用 `<resultMap>` 的 `<collection>` 配合 `join`，一条 SQL 直接查出"菜品 + 口味"的嵌套结构。
- **也正因为有 N+1，这条链特别值得加缓存**——缓存命中时这 1+N 次查询**一次都不发生**。缓存某种意义上"掩盖"了 N+1 的代价（但不该用缓存当借口不优化 SQL）。

### 4. 必背套路四：序列化决定了"对象怎么进 Redis"

**口诀**：`对象存 Redis 必先序列化；用 JDK 序列化就得 implements Serializable，用 JSON 序列化就不用。`

- `RedisTemplate` 默认 value 序列化器是 **JDK 原生序列化** → 要求对象及其引用链全部 `implements Serializable`（这就是项目里一堆 POJO 都实现该接口的真正原因）。
- key 单独设成 `StringRedisSerializer` 是为了**可读**。
- **生产升级**：value 换 `GenericJackson2JsonRedisSerializer`（JSON），可读、跨语言、体积小，且不再依赖 `Serializable`。

### 5. 必背套路五：C 端与管理端"同名 Controller"的工程处理

**口诀**：`同名类共存 → Bean 名会撞 → 显式起名；面向顾客只给"起售"数据。`

- 两个 `DishController`（admin / user）简单类名相同 → 默认 Bean 名冲突 → 用 `@RestController("userDishController")` 显式命名化解。
- 业务上 C 端强制 `status = ENABLE`，**只让顾客看到在售菜品**；管理端不加这层过滤。**同一份数据，不同端看到不同切片**——这是真实系统里"权限/可见性"的最朴素体现。

### 6. 哪些是"生产同款"、哪些是"教学简化"（面试要能分辨）

**生产同款（直接保留）：** 三层架构、Cache-Aside 读缓存、统一返回 `Result`、动态 SQL `<where>/<if>`、Entity/VO 分离。

**教学简化（要知道怎么升级）：**
- ⚠️ **缓存逻辑写在 Controller 里** → 违背"Controller 不写业务"的分层纪律。生产应下沉到 Service，并用 Spring Cache 的 **`@Cacheable` / `@CacheEvict`** 声明式注解，让缓存读写与业务代码解耦。
- ⚠️ **只写缓存、不失效缓存** → 有脏数据风险。生产必须在写操作里清缓存。
- ⚠️ **缓存无过期时间（TTL）** → key 会永久驻留。生产通常给缓存设过期时间兜底（`set(key, value, 30, TimeUnit.MINUTES)`），即便忘了主动删除，过期后也会自动重载。
- ⚠️ **JDK 序列化** → 改用 JSON 序列化。
- ⚠️ **N+1 查询** → 用 `in` 批量查或 `<collection>` 关联映射优化。
- 💡 **没有缓存穿透/雪崩防护**：若大量请求查一个**不存在**的 `categoryId`（缓存和库都没有），每次都会击穿到 DB（缓存穿透）。生产会缓存空值或用布隆过滤器（Bloom Filter）。

---

## 七、面试官视角：这条链路我会怎么问（含口述答案）

> 假设我是 Java 后端面试官，看到你简历写了这个项目，针对"C 端菜品查询 + Redis 缓存"这条链，我大概率会问下面这些。答案按"面试时能直接口述、30~60 秒讲完"的风格写。

**Q1：讲一下你项目里 Redis 缓存是怎么用的？用的什么模式？**
> 我们在 C 端查菜品列表时用了缓存，模式是标准的 Cache-Aside（旁路缓存）。流程是：请求进来先用"dish_分类id"当 key 去 Redis 查；如果命中就直接返回，整个请求不碰数据库；如果没命中，再去查数据库，查完把结果写回 Redis，然后返回。这样做是因为菜单是典型的读多写少、热点数据，所有顾客看到的内容一样，特别适合缓存，能大幅降低数据库压力、提升响应速度。

**Q2：缓存和数据库怎么保证一致性？你这条链有没有这个问题？**
> 坦白说我这条读链路本身没处理一致性——它只写缓存、不失效缓存。所以如果管理员改了菜品而不清缓存，顾客会看到过期数据。正确做法是在所有写操作（新增、修改、删除、起售停售）之后，主动删除对应的缓存 key，让下次读自然回填最新数据。我倾向用"删除"而不是"更新"缓存，因为更新要重算、并发下还可能写回旧值，删除最简单可靠。再严谨一点可以做延迟双删，或者给缓存加个过期时间兜底。

**Q3：为什么你那些实体类都 implements Serializable？不写会怎样？**
> 因为我们把对象存进了 Redis，而 Redis 存的是字节，对象进 Redis 必须先序列化。我们的 RedisTemplate 只配了 key 用 String 序列化器，value 没配，所以默认走 JDK 原生序列化。JDK 序列化要求被序列化的对象、以及它内部引用的所有对象，都实现 Serializable 接口，否则会抛 NotSerializableException。我存的是 List<DishVO>，DishVO 里又嵌了 List<DishFlavor>，所以这两个类都得实现。生产里我会把 value 序列化器换成 JSON 的，可读、跨语言，而且就不依赖 Serializable 了。

**Q4：你这条查询里有没有性能隐患？怎么优化？**
> 有，是个 N+1 查询。Service 里先查出 N 个菜品，然后在循环里对每个菜品单独再查一次口味，总共 1+N 次数据库往返，菜一多就慢。优化有两种：一是先收集所有菜品 id，用 where dish_id in (...) 一次把所有口味查回来，再在内存里按 dishId 分组组装，1+N 就降成 2 次；二是用 MyBatis 的 resultMap 配 collection 做关联映射，一条 join SQL 直接查出嵌套结构。另外我们加的 Redis 缓存命中时这些查询一次都不发生，但缓存只是缓解，不能替代把 SQL 本身优化好。

**Q5：项目里有两个 DishController，是怎么处理的？为什么 GET 查询不用 @RequestBody？**
> 我们有管理端和用户端两个 DishController，简单类名一样，Spring 默认按类名首字母小写当 Bean 名，会冲突，启动报错。所以用户端我显式写了 @RestController("userDishController") 给它单独命名。至于参数：这个接口是 GET 请求，categoryId 是通过 URL 查询参数传的，Spring MVC 会自动把同名 query 参数绑定到方法形参，相当于隐式的 @RequestParam，不需要 @RequestBody。@RequestBody 是用来反序列化 POST/PUT 的 JSON 请求体的，GET 一般没有请求体。

**Q6：C 端和管理端查菜品有什么区别？**
> 主要是可见数据范围不同。C 端是给顾客看的，代码里把查询条件的 status 写死成 ENABLE，也就是只返回起售中的菜品，停售的对顾客不可见；管理端是给运营看的，要能看到全部菜品，包括停售的，方便管理。这其实就是同一份数据按不同角色做的可见性切片。另外 C 端加了 Redis 缓存因为访问量大，管理端写操作为主、对缓存需求不同。

**Q7（设计追问）：如果让你把缓存逻辑从 Controller 挪走、做得更规范，你会怎么改？**
> 我会把缓存逻辑从 Controller 下沉到 Service 层，因为 Controller 按分层纪律只该做接收参数和组装返回，不该写业务和缓存。更进一步，我会用 Spring Cache 的声明式注解：在查询方法上加 @Cacheable，框架自动帮我"先查缓存、没中查库、查完回填"；在增删改方法上加 @CacheEvict 自动清缓存。这样缓存读写和业务代码彻底解耦，代码里看不到 RedisTemplate 的样板调用，可读性和可维护性都更好，还能统一配置过期时间。

---
