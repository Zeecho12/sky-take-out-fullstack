# PROJECT_S2_TECHSTACK - 技术栈扫描报告

## 核心框架

| 技术名称 | 版本 | 在项目中的作用 | 是什么（一句话，用学生能理解的语言） |
|---|---|---|---|
| Spring Boot | 2.6.4 | 整个用户中心应用的启动和运行框架，内嵌 Tomcat 服务器，一个 main 方法启动全部服务 | 让你不用配置一堆 XML 文件，一个 main 方法就能跑起来整个后端应用 |
| Spring MVC | 父 pom 管理（随 Spring Boot 2.6.4） | 处理前端发来的 HTTP 请求（注册、登录、查询等），将请求路由到对应的 Controller 方法 | 后端的"前台接待员"，负责接收浏览器发来的请求，找到对应的处理方法，再把结果返回去 |
| spring-boot-devtools | 父 pom 管理 | 开发阶段热重载（Hot Reload），修改代码后自动重启应用，省去手动重启的麻烦 | 开发时的"自动刷新器"，改完代码不用手动重启，它帮你自动重新加载 |
| spring-boot-configuration-processor | 父 pom 管理 | 编译期为自定义配置属性生成元数据（Metadata），让 IDE 在编辑 `application.yml` 时能自动补全和提示 | 一个编译期小助手，让你在写配置文件时 IDE 能弹出自动补全提示，不用死记配置项名字 |

## 数据层

| 技术名称 | 版本 | 在项目中的作用 | 是什么（一句话，用学生能理解的语言） |
|---|---|---|---|
| MyBatis | 2.2.2（mybatis-spring-boot-starter） | 将 Java 代码中的数据库操作映射为 SQL 语句，实现用户数据的增删改查 | 一个"翻译官"，把你写的 Java 方法翻译成数据库能听懂的 SQL 语句去执行 |
| MyBatis-Plus | 3.5.1 | 在 MyBatis 基础上提供增强功能，单表的增删改查不用手写 SQL，自动生成通用 CRUD 方法 | MyBatis 的"加强版外挂"，简单的增删改查它直接帮你写好了，你只需要调用现成的方法 |
| MySQL Connector/J | 父 pom 管理 | MySQL 数据库的 JDBC 驱动（Driver），让 Java 程序能连接上 MySQL 数据库 | 一条"网线"，把你的 Java 程序和 MySQL 数据库连起来，没有它程序就找不到数据库 |

> 微服务基础设施：本项目为单体应用（Monolith），未引入 Spring Cloud、Nacos、Dubbo 等微服务相关依赖，该分类省略。

> 中间件：未发现 Redis、RabbitMQ、Kafka、Elasticsearch 等中间件依赖，该分类省略。

> 安全与认证：未发现 Spring Security、Sa-Token、JWT、Shiro 等独立认证框架依赖，该分类省略。项目的登录态管理推测通过 Servlet 原生的 HttpSession + Cookie 实现。

## 实用工具与第三方库

| 技术名称 | 版本 | 在项目中的作用 | 是什么（一句话，用学生能理解的语言） |
|---|---|---|---|
| Lombok | 父 pom 管理 | 通过注解（Annotation）自动生成 getter/setter/toString/构造方法等样板代码（Boilerplate Code），减少用户实体类中的重复代码 | 一个"代码偷懒神器"，加个注解就能自动生成 getter、setter 那些重复代码，不用自己一行行写 |
| Apache Commons Lang3 | 3.12.0 | 提供字符串判空（`StringUtils.isBlank`）、对象工具等常用方法，用于用户注册/登录时的参数校验 | 一个"瑞士军刀工具箱"，装满了处理字符串、数字、日期的常用小工具，省得自己从零写这些基础方法 |

## 测试框架

| 技术名称 | 版本 | 在项目中的作用 | 是什么（一句话，用学生能理解的语言） |
|---|---|---|---|
| spring-boot-starter-test | 父 pom 管理 | Spring Boot 官方测试套件，提供集成测试（Integration Test）支持，可以在测试中启动完整的 Spring 上下文 | Spring Boot 自带的"考试套装"，帮你模拟真实运行环境来测试代码对不对 |
| JUnit 4 | 4.13.2 | 编写和运行单元测试（Unit Test），验证用户注册、登录等业务逻辑的正确性 | 程序员的"自动阅卷机"，你写好测试用例，它帮你一键检查代码有没有 bug |

## 技术栈整体类比

这套技术栈就像一家**小饭馆的完整运营班底**：

- **Spring Boot** 是这家饭馆的**店面**——它把灶台、桌椅、收银台全部打包好，开门就能营业，不用你自己一样一样去采购和组装。
- **Spring MVC** 是**前台服务员**——顾客（前端请求）进门后，服务员负责听他要什么菜，然后把订单递给后厨。
- **MyBatis + MyBatis-Plus** 是**后厨的厨师**——服务员把订单传过来，厨师按照菜谱（SQL）从冰箱（数据库）里拿食材做菜。MyBatis-Plus 就是个"预制菜厨师"，家常菜（简单 CRUD）不用你现写菜谱，它已经会了。
- **MySQL + MySQL Connector/J** 是**冰箱和冰箱门**——所有用户数据存在冰箱里，Connector 是冰箱门，没有它厨师打不开冰箱。
- **Lombok** 是**洗碗机**——本来每道菜做完都要手洗一堆碗碟（写 getter/setter），有了它自动搞定，厨师只管做菜。
- **Commons Lang3** 是**厨房里的量杯和计时器**——做菜时随手就能用的小工具。
- **JUnit + spring-boot-starter-test** 是**试菜员**——新菜做好先让他尝一口，确认味道对了再端给顾客。
