# PROJECT_S2_TECHSTACK — 技术栈扫描

> 扫描范围：根 `pom.xml`（第 34-126 行 `dependencyManagement` + 第 20-33 行 `properties`）、`sky-common/pom.xml`、`sky-pojo/pom.xml`、`sky-server/pom.xml` 的依赖声明部分。
> 版本说明：本项目所有子模块继承 `spring-boot-starter-parent` **2.7.3**，Spring 官方 starter 的版本由父 pom 统一管理；第三方库版本大多在根 pom 的 `<properties>` 中集中定义。

## 核心框架
| 技术名称 | 版本 | 在项目中的作用 | 是什么（一句话，用学生能理解的语言） |
|---|---|---|---|
| Spring Boot | 2.7.3 | 整个后端的启动与运行底座，`sky-server` 靠它打成可执行 jar 并用 `java -jar` 跑起来 | 让你不用配一堆 XML，写个 main 方法就能把整个后端服务跑起来，还自动帮你装好一堆常用组件 |
| Spring MVC（`spring-boot-starter-web`） | 父 pom 管理（Spring Boot 2.7.3） | `sky-server` 对外提供 HTTP 接口的 Web 层，负责接收商家端 / 用户端的请求并路由到对应 Controller | 负责"收快递、分快递"的前台：把浏览器发来的 HTTP 请求分发给对应的处理方法，再把结果包成响应发回去 |
| Spring WebSocket（`spring-boot-starter-websocket`） | 父 pom 管理（Spring Boot 2.7.3） | 为 `sky-server` 提供服务端主动推送能力（例如订单状态的实时通知，具体业务用途需在 scan-5-flow 读源码确认） | 让服务器能主动"打电话"给浏览器，而不是傻等浏览器来问；适合做实时提醒这类需要立刻通知用户的场景 |

## 数据层
| 技术名称 | 版本 | 在项目中的作用 | 是什么（一句话） |
|---|---|---|---|
| MyBatis（`mybatis-spring-boot-starter`） | 2.2.0（根 pom `properties`） | `sky-server` 访问数据库的持久层框架，把 Java 方法映射成 SQL 去查/改数据 | 帮你把"写 SQL"和"Java 方法"对应起来：你调一个方法，它就去数据库跑对应的 SQL 并把结果装回 Java 对象 |
| MySQL Connector/J（`mysql-connector-java`） | 父 pom 管理 | 连接 MySQL 数据库的官方驱动，`runtime` 作用域，程序运行时才需要 | 数据库的"专用电话线"：Java 程序要跟 MySQL 说话，必须靠这根驱动线路 |
| Druid（`druid-spring-boot-starter`） | 1.2.1（根 pom `properties`） | 数据库连接池，负责管理和复用数据库连接，并附带监控能力 | 一批提前建好、随时待命的数据库连接，用完还回去、不用每次都重新连，省时省资源 |
| PageHelper（`pagehelper-spring-boot-starter`） | 1.3.0（根 pom `properties`） | 配合 MyBatis 做物理分页，对应 S1 提到的"员工分页查询"等场景 | 你只管说"要第几页、每页几条"，它自动帮你在 SQL 后面补上分页语句，不用手写 limit |

> 微服务基础设施：本项目为多模块单体应用，根 pom 未引入任何 Spring Cloud / Nacos / Eureka / Gateway / OpenFeign / Dubbo / Sentinel 等依赖，该分类省略。

## 中间件
| 技术名称 | 版本 | 在项目中的作用 | 是什么（一句话） |
|---|---|---|---|
| Spring Data Redis（`spring-boot-starter-data-redis`） | 父 pom 管理（Spring Boot 2.7.3） | 为 `sky-server` 接入 Redis，用于缓存热点/临时数据以减轻数据库压力（具体缓存了哪些数据需在 scan-5-flow 读源码确认） | 一个放在内存里的"高速小仓库"，读写飞快，把常用数据放这儿，就不用每次都去慢吞吞的数据库拿 |
| Spring Cache（`spring-boot-starter-cache`） | 父 pom 管理（Spring Boot 2.7.3） | 提供统一的缓存抽象，可配合 Redis 用注解方式给方法结果加缓存 | 一套"贴标签就自动缓存"的规则：在方法上加个注解，结果就自动存起来，下次同样的请求直接返回，不用重算 |

## 安全与认证
| 技术名称 | 版本 | 在项目中的作用 | 是什么（一句话） |
|---|---|---|---|
| JWT（`jjwt`，io.jsonwebtoken） | 0.9.1（根 pom `properties`） | `sky-common` 引入，用于生成/校验登录令牌（配合 `JwtClaimsConstant`、`JwtTokenAdminInterceptor` 等，对应商家端/用户端登录鉴权） | 一张防伪"电子工牌"：用户登录后发一张带签名的令牌，之后每次请求带上它就能证明"我是谁"，服务器不用一直记着你 |

## 实用工具与第三方库
| 技术名称 | 版本 | 在项目中的作用 | 是什么（一句话） |
|---|---|---|---|
| Lombok | 1.18.30（根 pom `properties`） | 三个模块都在用，主要给 POJO / 实体类自动生成 getter/setter/构造器等样板代码 | 一个帮你自动写重复代码的小助手：类上加个注解，getter、setter、toString 它全给你补好，代码更干净 |
| Fastjson | 1.2.76（根 pom `properties`） | `sky-common` / `sky-server` 使用，做 JSON 与 Java 对象之间的转换 | 一个"翻译员"：把 Java 对象翻成 JSON 文本、或把 JSON 翻回 Java 对象 |
| Jackson（`spring-boot-starter-json` / `jackson-databind`） | starter 父 pom 管理（2.7.3）；`sky-pojo` 显式引入 `jackson-databind` 2.9.2 | Spring MVC 默认的 JSON 处理器，负责接口出入参的序列化/反序列化 | Spring Web 自带的另一个 JSON 翻译员，前台收发请求时默认用它在 Java 对象和 JSON 之间来回转换 |
| Apache Commons Lang（`commons-lang`） | 2.6（根 pom `properties`） | `sky-common` 引入，提供字符串等常用工具方法（未逐一核实具体调用点） | 一盒现成的"瑞士军刀"：判空、字符串处理这些琐碎活儿它都替你写好了，不用自己造轮子 |
| AspectJ（`aspectjrt` / `aspectjweaver`） | 1.9.4（根 pom `properties`） | `sky-server` 引入，用于 AOP 面向切面编程，把横切逻辑从业务代码抽离（例如公共字段自动填充/日志，具体切面需读源码确认） | 一台"统一登记 / 监控设备"：能在一堆方法执行前后自动插入同一段逻辑（如记日志、填字段），不用在每个方法里重复写 |
| Knife4j（`knife4j-spring-boot-starter`） | 3.0.2（根 pom `properties`） | `sky-pojo` / `sky-server` 引入，基于 Swagger 生成可视化的在线接口文档 | 给后端接口自动生成一份"带按钮的说明书"网页，前端不用问你就能看到有哪些接口、怎么调、能在线试 |
| Aliyun OSS SDK（`aliyun-sdk-oss`） | 3.10.2（根 pom `properties`） | `sky-common` 引入，对接阿里云对象存储，对应 S1 提到的"菜品图片上传"功能 | 一个"云端相册/网盘"的对接工具：把菜品图片这类文件上传到阿里云保存，再返回一个可访问的网址 |
| Apache POI（`poi` / `poi-ooxml`） | 3.16（根 pom `properties`） | `sky-server` 引入，对应 S1 提到的"导出 Excel 报表"（营业数据报表导出） | 一个用 Java 直接读写 Excel 的工具：能在程序里生成、填充 .xls/.xlsx 表格文件 |
| WeChat Pay SDK（`wechatpay-apache-httpclient`） | 0.4.8（根 pom，直接写死版本） | `sky-common` 引入，对接微信支付 API v3，对应 S1 提到的"微信支付"下单收款 | 微信官方给的"收银台对接工具"：帮你按微信的规矩发起支付、验签，让用户能微信付款 |
| JAXB API（`jaxb-api`） | 2.3.1（根 pom `properties`） | `sky-common` / `sky-server` 引入；通常是为高版本 JDK 补齐被移除的 XML 处理类，属兼容性支撑依赖（未发现独立业务使用迹象） | JDK 9 以后把 XML 相关的类踢出去了，这个依赖是把它们补回来，避免用到 XML 的库报错 |
| spring-boot-configuration-processor | 父 pom 管理 | `sky-common` 引入（`optional`），编译期为自定义配置属性类生成元数据 | 一个开发期小工具：让你在 application.yml 里写自定义配置项时，编辑器能自动提示、不容易写错 |
| Spring Boot Test（`spring-boot-starter-test`） | 父 pom 管理（Spring Boot 2.7.3） | `sky-server` 的 `test` 作用域依赖，提供单元/集成测试能力 | 一整套测试工具箱（JUnit、Mockito、Spring Test 等打包），让你能给代码写自动化测试来验证是否正确 |

## 技术栈整体类比

把整套技术栈想象成 **一家正在营业的外卖餐厅（sky-server 就是这家店）**：

- **Spring Boot** 是这栋楼本身 + 水电煤——地基、电路、上下水都提前接好，你一开门（跑 main 方法）整家店就通电营业了。
- **Spring MVC** 是**前台服务员**：顾客（浏览器）进门点单（发 HTTP 请求），前台负责把单子分给对应的后厨岗位（Controller），做好再把菜端出去（返回响应）。
- **MyBatis + MySQL Connector/J + Druid** 是**采购与库管班组**：MyBatis 是懂行的采购员（知道去仓库拿什么、怎么记账），MySQL Connector 是通往仓库的专线电话，Druid 是一群随时待命、用完归位的采购员（连接池），不用每次现找人。**PageHelper** 则是端菜时"一次只端一盘、分批上"的分页规矩。
- **Redis + Spring Cache** 是前台旁边的**保温备餐台**：热销菜提前做好放这儿，来单直接取，不用每次都跑后厨（数据库）现做；Spring Cache 是"贴张标签就自动进保温台"的管理规则。
- **WebSocket** 是后厨与前厅之间的**实时对讲机**：出餐了后厨能立刻喊话通知，而不是让前厅一直跑来问。
- **JWT** 是顾客的**会员卡 / 员工工牌**：刷一下就知道你是谁、有没有权限，店家不用一直盯着记住每个人。
- **Aliyun OSS（菜品图片外部相册）、Apache POI（打印营业报表）、WeChat Pay（微信收银台）、Knife4j（给开发者看的点餐系统操作手册）、Lombok / Fastjson / Jackson / Commons Lang / AspectJ** 则是后厨里各种**专用设备与帮工**：拍照存图、出报表、收钱、写说明书、自动干重复杂活。

**类比与真实技术的对应**：整栋楼和水电 = Spring Boot（运行底座）；前台服务员 = Spring MVC（Web 层收发请求）；采购库管班组 = MyBatis / Druid / MySQL 驱动（数据访问）；保温备餐台 = Redis + Spring Cache（缓存）；实时对讲机 = WebSocket（服务端推送）；会员卡工牌 = JWT（登录鉴权）；后厨设备与帮工 = OSS / POI / 微信支付 / Knife4j / Lombok 等工具类第三方库。
