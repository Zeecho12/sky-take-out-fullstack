# PROJECT_S4_ENTRYPOINT — 核心入口定位

> 项目名称：user-center-backend（用户中心后端）
> 项目类型：单体应用（Monolith）
> 默认激活 Profile：未指定（application.yml 中没有 spring.profiles.active 字段，默认使用 application.yml 本身的配置）
> 配置文件一览：
> - src/main/resources/application.yml（公共 / 默认配置）
> - src/main/resources/application-prod.yml（线上生产环境配置）

---

## 启动顺序

1. **MySQL 数据库**：项目的核心数据存储，所有用户数据持久化在 MySQL 的 `yupi` 库中。应用启动时 Spring Boot 的 DataSource 自动配置会立即尝试建立数据库连接池（HikariCP），如果 MySQL 未就绪，应用将启动失败并抛出连接异常。

2. **user-center-backend 应用本身**：Spring Boot 单体应用，启动类为 `UserCenterApplication`。MySQL 就绪后即可启动，启动过程中 MyBatis-Plus 会扫描 Mapper 接口并完成 SQL 映射初始化，Servlet 容器（默认 Tomcat）在 8080 端口开始监听 HTTP 请求。本项目没有 Redis、消息队列（MQ）、注册中心（Service Registry）等其他基础设施依赖，因此 MySQL 是唯一的前置依赖。

---

## 对外入口

- 端口：`8080`（在 application.yml 中配置；application-prod.yml 未覆盖，沿用 8080）
- 监听地址：默认环境未配置（默认 `0.0.0.0`）；prod 环境显式配置为 `0.0.0.0`
- 路径前缀：`/api`（server.servlet.context-path）
- 完整访问地址示例：`http://localhost:8080/api/user/xxx`
- Gateway：无。本项目是单体应用，不含网关模块。

---

## 关键配置项索引

### 公共配置（application.yml）

| 配置项 | 值 | 所在文件路径 | 作用说明 |
|---|---|---|---|
| spring.application.name | user-center-backend | src/main/resources/application.yml | 应用名称 |
| spring.datasource.driver-class-name | com.mysql.jdbc.Driver | src/main/resources/application.yml | MySQL JDBC 驱动类 |
| spring.datasource.url | jdbc:mysql://localhost:3306/yupi | src/main/resources/application.yml | 数据库连接地址，连接本地 MySQL 的 yupi 库 |
| spring.datasource.username | root | src/main/resources/application.yml | 数据库用户名 |
| spring.datasource.password | 123456 | src/main/resources/application.yml | 数据库密码 |
| spring.session.timeout | 86400 | src/main/resources/application.yml | Session 失效时间，86400 秒 = 24 小时 |
| server.port | 8080 | src/main/resources/application.yml | 服务监听端口 |
| server.servlet.context-path | /api | src/main/resources/application.yml | Servlet 路径前缀，所有接口 URL 以 /api 开头 |
| mybatis-plus.configuration.map-underscore-to-camel-case | false | src/main/resources/application.yml | 关闭下划线到驼峰的自动映射（业务开关型配置），意味着数据库字段名与 Java 属性名需保持一致（本项目数据库字段已使用驼峰命名如 userAccount） |
| mybatis-plus.global-config.db-config.logic-delete-field | isDelete | src/main/resources/application.yml | 全局逻辑删除字段名 |
| mybatis-plus.global-config.db-config.logic-delete-value | 1 | src/main/resources/application.yml | 逻辑已删除标记值 |
| mybatis-plus.global-config.db-config.logic-not-delete-value | 0 | src/main/resources/application.yml | 逻辑未删除标记值 |

### prod 配置覆盖（application-prod.yml）

以下仅列出相对默认配置有变化的项：

| 配置项 | 值 | 所在文件路径 | 作用说明 |
|---|---|---|---|
| spring.datasource.url | jdbc:mysql://sh-cynosdbmysql-grp-98pxrcoq.sql.tencentcdb.com:29164/user_center?useSSL=false | src/main/resources/application-prod.yml | 线上数据库连接地址，使用腾讯云 TDSQL-C（CynosDB）MySQL 兼容版，库名为 user_center |
| spring.datasource.username | self | src/main/resources/application-prod.yml | 线上数据库用户名 |
| spring.datasource.password | liyupi66! | src/main/resources/application-prod.yml | 线上数据库密码 |
| server.address | 0.0.0.0 | src/main/resources/application-prod.yml | 显式绑定监听所有网卡地址（默认环境未配置此项） |

注意：application.yml 中未设置 `spring.profiles.active`，意味着本地开发时直接使用 application.yml 的默认配置。部署到线上时需通过启动参数 `--spring.profiles.active=prod` 激活 prod 配置。

---

## 环境差异对比

| 配置维度 | 默认（无 profile / 本地开发） | prod（线上生产） |
|---|---|---|
| 端口 | 8080 | 8080（沿用默认） |
| 数据库地址 | localhost:3306/yupi | sh-cynosdbmysql-grp-98pxrcoq.sql.tencentcdb.com:29164/user_center |
| 数据库用户名 | root | self |
| 数据库密码 | 123456 | liyupi66! |
| 监听地址 | 未配置（默认 0.0.0.0） | 显式配置 0.0.0.0 |
| useSSL | 未指定（默认取决于驱动版本） | false（显式关闭） |
| Session 超时 | 86400 秒 | 沿用默认 86400 秒 |
| MyBatis-Plus 配置 | 驼峰映射关闭 + 逻辑删除 | 沿用默认 |

---

## API 路径概览

基于 PROJECT_S3_MODULES.md 中的 Controller 清单 + `server.servlet.context-path = /api` 推导。
本步骤未读 .java 源码，路径前缀均为推断。

| URL 路径前缀（推断） | 对应 Controller | 推断功能 |
|---|---|---|
| /api/user/** （推断） | UserController | 用户注册、登录、注销、当前用户查询、用户搜索、用户删除等用户管理相关接口 |

---

## 数据库 Schema 索引

| 文件 | 完整路径 | 用途 |
|---|---|---|
| create_table.sql | sql/create_table.sql | 数据库初始化脚本：创建 `yupi` 库和 `user` 用户表（含 id、username、userAccount、avatarUrl、gender、userPassword、phone、email、userStatus、createTime、updateTime、isDelete、userRole、planetCode 共 14 个字段），并导入一条示例用户数据 |
