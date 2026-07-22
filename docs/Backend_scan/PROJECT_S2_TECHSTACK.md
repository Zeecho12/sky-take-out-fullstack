# PROJECT_S2_TECHSTACK — 技术栈扫描

> 项目名称：sky-take-out（苍穹外卖）——外卖 / 餐饮点餐系统后端（商家管理端 + 顾客 C 端）
> 扫描范围（只读依赖与版本相关部分，未读 `.java` / `.yml` / `<build>` / `<plugins>`）：
> - `sky-take-out/pom.xml`（根聚合 POM）：读了 `<properties>`（第 20-33 行，集中定义版本号）与 `<dependencyManagement>`（第 34-126 行，锁定各依赖版本）——本项目版本号大多集中在这里。
> - `sky-take-out/sky-common/pom.xml`：`<dependencies>`（第 12-52 行）
> - `sky-take-out/sky-pojo/pom.xml`：`<dependencies>`（第 12-26 行）
> - `sky-take-out/sky-server/pom.xml`：`<dependencies>`（第 12-123 行，唯一可运行模块，依赖最全）
> - 版本约定：Spring 全家桶 starter 未显式写版本，由根 pom `<parent>` 继承的 `spring-boot-starter-parent` **2.7.3** 统一管理，本文标记为「父 pom 管理（2.7.3）」；其余第三方库版本来自根 pom `<properties>` + `<dependencyManagement>`，标记为「根 pom 管理」。

---

## 核心框架
| 技术名称 | 版本 | 在项目中的作用 | 是什么（一句话，用学生能理解的语言） |
|---|---|---|---|
| Spring Boot | 2.7.3（根 pom `<parent>` 继承 `spring-boot-starter-parent`） | 整个后端的启动与自动配置底座，`sky-server` 靠一个 main 方法拉起全站 | 一套开箱即用的脚手架：不用手写一堆 XML 配置，内置 Tomcat，一个 main 方法就能把整个后端跑起来 |
| Spring MVC（`spring-boot-starter-web`） | 父 pom 管理（2.7.3） | 提供 Controller 接收 HTTP 请求、返回 JSON，是对外 REST 接口的实现基础 | 负责「接客」的模块：把浏览器发来的网址请求分发给对应的 Java 方法，再把结果打包成 JSON 送回去 |
| Spring WebSocket（`spring-boot-starter-websocket`） | 父 pom 管理（2.7.3） | 建立浏览器与服务器的长连接，供服务端主动向前端推送（项目里用于商家端实时订单提醒类推送） | 一条一直挂着的「电话线」：普通 HTTP 是客户端问一句、服务端答一句，WebSocket 让服务器能反过来主动喊客户端 |
| Spring Cache（`spring-boot-starter-cache`） | 父 pom 管理（2.7.3） | 提供 `@Cacheable` 等缓存（Cache）注解给方法结果加缓存，配合下方 Redis 缓存菜品 / 套餐等热点数据 | Spring 的「缓存开关」：在方法上贴个注解，结果就自动被记下来，下次同样的请求直接拿现成的，不用再查库 |

## 数据层
| 技术名称 | 版本 | 在项目中的作用 | 是什么（一句话） |
|---|---|---|---|
| MyBatis（`mybatis-spring-boot-starter`） | 2.2.0（根 pom 管理） | 持久层（Persistence Layer）框架，SQL 写在 Mapper 里，负责与 MySQL 交互 | 半自动的「SQL 助手」：你自己写 SQL，它帮你把查询结果自动装进 Java 对象，省掉手写 JDBC 的样板代码 |
| MySQL Connector/J（`mysql-connector-java`） | 父 pom 管理（2.7.3 BOM，runtime 作用域） | JDBC 驱动，让程序能连上 MySQL 数据库 | 数据库的「翻译官」：让 Java 程序能听懂、也说得通 MySQL 的话 |
| Druid（`druid-spring-boot-starter`） | 1.2.1（根 pom 管理） | 数据库连接池（Connection Pool），管理复用数据库连接，自带监控 | 一个「连接管家」：建数据库连接很贵，它预先备好一批反复借还，还能顺便统计谁在慢查询 |
| PageHelper（`pagehelper-spring-boot-starter`） | 1.3.0（根 pom 管理） | 分页插件，自动给查询拼 `limit`，支撑后台各种分页列表（如员工 / 订单分页） | 「翻页小工具」：你正常写查询，它在背后自动加上「取第几页、每页几条」，不用自己算偏移量 |

> 微服务基础设施：全部 pom 中未见 Spring Cloud Gateway / Nacos / Eureka / Dubbo / OpenFeign / Sentinel 等任何微服务组件依赖（S1 已定性为多模块单体），该分类省略。

## 中间件
| 技术名称 | 版本 | 在项目中的作用 | 是什么（一句话） |
|---|---|---|---|
| Redis（`spring-boot-starter-data-redis`） | 父 pom 管理（2.7.3） | 内存数据库，做缓存（配合上方 Spring Cache 缓存菜品 / 套餐）、存放登录态 / 验证码等临时数据 | 一个放在内存里的「超快小本子」：把常用数据记在内存里，读写比查数据库快得多，临时数据都爱放这 |

## 安全与认证
| 技术名称 | 版本 | 在项目中的作用 | 是什么（一句话） |
|---|---|---|---|
| Spring Security（`spring-boot-starter-security`） | 父 pom 管理（2.7.3） | 全站认证授权（Authentication & Authorization）框架（功能 0001 引入）：拦截 `/admin/**`=ADMIN、`/user/**`=USER，未登录 401 / 无权限 403，用 BCrypt 加密密码 | 后端的「门卫 + 权限系统」：每个请求进来先查你是谁、有没有资格访问这个接口，不合格直接挡回去 |
| JJWT（`jjwt`，io.jsonwebtoken） | 0.9.1（根 pom 管理） | 生成 / 校验 JWT（JSON Web Token）令牌，承载登录用户身份，配合 Spring Security 做无状态认证 | 一张「防伪令牌」的制作 / 验证工具：登录后发你一张带签名的通行证，之后每次请求带上它，服务器验签就知道你是谁，不用每次查库 |

## 实用工具与第三方库
| 技术名称 | 版本 | 在项目中的作用 | 是什么（一句话） |
|---|---|---|---|
| Lombok | 1.18.30（根 pom 管理） | 用注解自动生成 getter/setter/构造器等，精简 Entity / DTO / VO 的样板代码 | 「样板代码代写员」：在类上贴个 `@Data`，getter/setter/toString 这些重复代码编译时自动补上 |
| Jackson（`jackson-databind` + `spring-boot-starter-json`） | jackson-databind 2.9.2（sky-pojo 显式声明）；starter-json 父 pom 管理（2.7.3） | Java 对象 ↔ JSON 互转，是 REST 接口序列化（Serialization）的默认实现 | 「翻译机」：把 Java 对象转成前端要的 JSON 文本，或反过来把收到的 JSON 变回 Java 对象 |
| Fastjson | 1.2.76（根 pom 管理） | 阿里的 JSON 库，项目里做部分 JSON 序列化 / 反序列化 | 另一台「JSON 翻译机」：功能和 Jackson 类似，阿里出品 |
| Apache Commons Lang（`commons-lang`） | 2.6（根 pom 管理） | 通用工具类（字符串判空、日期处理等），减少重复造轮子 | 一盒「常用小工具」：判断字符串是不是空、数组操作这类天天要用的琐碎方法都替你写好了 |
| AspectJ（`aspectjrt` + `aspectjweaver`） | 1.9.4（根 pom 管理） | 支撑 Spring 的面向切面编程（AOP, Aspect-Oriented Programming），做横切逻辑（如公共字段 createTime/updateTime 自动填充） | 「打补丁」的能力：不改原方法代码，就能在方法执行前后统一插入逻辑（比如自动记录创建时间） |
| Knife4j（`knife4j-spring-boot-starter`） | 3.0.2（根 pom 管理） | 基于 Swagger 生成在线 API 文档与调试页面 | 「自动生成的接口说明书」：根据代码注解自动列出所有接口，还能在网页上点着直接调用测试 |
| Aliyun OSS SDK（`aliyun-sdk-oss`） | 3.10.2（根 pom 管理） | 对接阿里云对象存储（Object Storage Service），上传 / 存放菜品图片等文件 | 一个「云端储物柜」的钥匙：图片这类文件不塞进数据库，而是传到阿里云，拿回一个 URL 存起来 |
| Apache POI（`poi` + `poi-ooxml`） | 3.16（根 pom 管理） | 读写 Excel（.xls/.xlsx），用于营业数据报表导出 | 「Excel 操作手」：让 Java 程序能生成、读写 Excel 表格，导出经营报表 |
| WeChat Pay SDK（`wechatpay-apache-httpclient`） | 0.4.8（根 pom 管理） | 对接微信支付 API v3（下单 / 回调验签）；属原始项目遗留，改造中（功能 0002 计划替换为支付 mock） | 微信支付的「官方对接包」：帮你按微信的规矩签名、发起支付请求、验证回调，不用自己搓加密逻辑 |
| JAXB API（`jaxb-api`） | 2.3.1（根 pom 管理） | 提供 `javax.xml.bind` XML 绑定 API；JDK 9+ 移除了该 API，此处补回以兼容仍依赖它的库 | 一块「兼容补丁」：高版本 JDK 把某个 XML 处理工具删了，有些库还要用，就手动把它加回来 |
| spring-boot-configuration-processor | 父 pom 管理（2.7.3，optional） | 为 `@ConfigurationProperties` 配置类生成元数据（pom 注释原文：yml 文件中可以提示配置项） | 一个「编译期小助手」：写 yml 配置时，IDE 能自动提示有哪些配置项可填 |
| spring-boot-starter-test | 父 pom 管理（2.7.3，test 作用域） | 测试脚手架（打包了 JUnit / Mockito / AssertJ 等），供 `sky-server` 写单元 / 集成测试 | 一套「测试全家桶」：把写测试常用的工具打包好，直接用来验证代码对不对 |

## 技术栈整体类比
把整套后端想象成一家**外卖餐厅的运营**（正好呼应项目本身）：

- **Spring Boot** = 整栋店面加上已通好的水电煤（内置 Tomcat），开业即用，不用自己盖房子布线；
- **Spring MVC** = 前台的迎宾 / 点单员，把上门客人的需求分给对应的后厨岗位，再把做好的菜端回去；
- **Spring Security + JJWT** = 门口的保安加会员卡：先验明你是谁、够不够资格进这个包间，验完发你一张带防伪签名的会员卡，之后凭卡通行；
- **MyBatis + MySQL Connector/J + Druid + PageHelper** = 后厨与仓库的取货流程：MyBatis 是照单取货的伙计，Connector 是能和仓库对话的翻译，Druid 是管着一排取货推车反复借还的管家，PageHelper 负责「一次只上一页菜单」；
- **Redis + Spring Cache** = 前台随手放的备菜台：把热销菜提前备好，来单直接端走，不用每次都回后厨现做；
- **WebSocket** = 后厨到前台的对讲机：一有新单，后厨能主动喊前台，而不是等前台反复来问；
- **Lombok / Commons Lang / Jackson / Fastjson / AspectJ / Knife4j** = 后厨里各种趁手的小工具和标准流程卡（省事、翻译、贴统一标签、自动生成说明书）；
- **Aliyun OSS / Apache POI / WeChat Pay SDK** = 对外的三个通道：OSS 是门店外存大件的仓库（图片），POI 是月底出报表的打印机，WeChat Pay SDK 是对接的第三方支付通道（正被换成自家 mock）。

**类比与真实技术的对应**：迎宾点单员 = Spring MVC（接 HTTP、发 JSON）；保安 + 会员卡 = Spring Security（认证授权）+ JJWT（无状态令牌）；取货流程 = MyBatis / Druid / MySQL 驱动 / PageHelper 组成的数据层；备菜台 = Redis + Spring Cache（缓存热点数据）；对讲机 = WebSocket（服务端主动推送）；整栋店面本身 = Spring Boot（启动与自动配置底座）。
