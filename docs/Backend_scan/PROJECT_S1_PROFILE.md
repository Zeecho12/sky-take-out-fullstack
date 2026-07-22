# PROJECT_S1_PROFILE — 项目定性

> 项目名称：sky-take-out（苍穹外卖）
> 项目类型：多模块单体（Multi-Module Monolith）—— 基于 Spring Boot 的 Maven 聚合工程
> 扫描来源：
> - 已读到：`sky-take-out/pom.xml`（根聚合 POM）、CODE_ROOT 目录结构（depth=2）
> - 已全局搜索确认容器化与 SQL：`**/Dockerfile`、`**/docker-compose.y*ml`、`**/.dockerignore`、`**/*.sql`
> - 显式未发现：CODE_ROOT 根目录下无 `README.md` / `README.*`；无 `NOTE.md`（git 状态显示 `sky-take-out/NOTE.md` 已删除）；无 `.env` / `.env.example`
> - 说明：CODE_ROOT 下存在 `NOTE/` 文件夹（内为源码精读学习笔记，非项目说明文档），本步骤仅从其文件名读取业务线索，未读取其正文；`Dockerfile` / `docker-compose` / `.dockerignore` 三者全局搜索均无结果

---

## 项目基本信息
- 项目名称：`sky-take-out`（`pom.xml` 第 12 行 `<artifactId>sky-take-out</artifactId>`，第 11 行 `<groupId>com.sky</groupId>`，第 14 行 `<version>1.0-SNAPSHOT</version>`）；中文名「苍穹外卖」
- 项目用途：一个**外卖 / 餐饮点餐系统的后端服务**（商家管理端 + 顾客 C 端）。依据：
  - 根 `pom.xml` 显式引入的第三方依赖透露业务特征——`wechatpay-apache-httpclient`（微信支付，POM 第 119-124 行注释「微信支付」）、`aliyun-sdk-oss`（阿里云对象存储 OSS，图片等文件上传，第 96-100 行）、`poi` / `poi-ooxml`（Excel 报表导出，第 108-118 行）、`pagehelper`（分页查询，第 66-70 行）。
  - CODE_ROOT 下 `NOTE/` 文件夹的笔记文件名涉及「新增员工 / 员工分页查询 / 启用禁用员工账户 / 编辑员工信息 / C 端菜品查询（Query Dishes by Category）」等，指向「后台管理端（员工/菜品管理）+ C 端顾客点餐」的典型外卖平台业务形态。
- 项目类型：多模块单体（Multi-Module Monolith）。
- 判断依据：
  1. 根 `pom.xml` 第 13 行 `<packaging>pom</packaging>`，且第 15-19 行 `<modules>` 聚合三个子模块（`sky-common` / `sky-pojo` / `sky-server`）——本身不产出可运行制品，是**聚合/父工程（Aggregator/Parent POM）**。
  2. CODE_ROOT 目录结构（depth=2）显示三个子文件夹 `sky-common/`、`sky-pojo/`、`sky-server/` **各自都带有独立 `pom.xml`**（`sky-common/pom.xml`、`sky-pojo/pom.xml`、`sky-server/pom.xml`），符合 Maven 多模块划分特征。
  3. 父工程继承 `spring-boot-starter-parent` 2.7.3（第 6-10 行），根 `pom.xml` 中**未见任何 Spring Cloud / 注册中心 / 网关依赖**（无 Eureka/Nacos/Gateway/OpenFeign），三个模块同属一套构建、共享一个父 POM，故定性为「多模块**单体**」而非微服务（Microservices）。

## 构建与部署
- 构建工具：Maven（依据 CODE_ROOT 根目录存在 `pom.xml`，各子模块亦为 `pom.xml`，无 `build.gradle`）。POM `modelVersion` 为 4.0.0；父工程继承 `spring-boot-starter-parent` **2.7.3**（`pom.xml` `<parent>` 段第 6-10 行），即 Spring Boot 2.7.3。`pom.xml` 未声明 Maven 自身版本，CODE_ROOT 下亦未见 Maven Wrapper（`mvnw` / `.mvn`）。
- 容器化：没有。已全局搜索 `**/Dockerfile`、`**/docker-compose.y*ml`、`**/.dockerignore` 三类通配符，**均无结果**，据此判定无容器化配置；`.env` / `.env.example` 亦未发现。
- 部署方式：未发现容器化配置，推测为直接 jar 包部署——可运行模块为 `sky-server`，经 `spring-boot-maven-plugin` 打成可执行 fat jar 后 `java -jar` 运行。
  - 数据库脚本索引（本步骤仅登记位置，不读内容）：全局搜索 `**/*.sql` 命中两处，均**不在 CODE_ROOT 内**——`D:\CQWM2\sky.sql`（仓库根，主建表脚本）、`D:\CQWM2\docs\features\0001-cend-auth-jwt\0001-migration.sql`（功能 0001 迁移脚本）。CODE_ROOT (`sky-take-out/`) 内未见 `.sql` 文件。

## 模块列表
- `sky-take-out`：`D:\CQWM2\sky-take-out\`（根聚合/父工程，`packaging=pom`，不产出运行制品）
- `sky-common`：`D:\CQWM2\sky-take-out\sky-common\`（公共模块，含独立 `pom.xml`；推测存放通用工具类、常量、统一返回结果、全局异常等，供其他模块依赖）
- `sky-pojo`：`D:\CQWM2\sky-take-out\sky-pojo\`（数据模型模块，含独立 `pom.xml`；推测存放 Entity / DTO / VO 等纯数据对象定义）
- `sky-server`：`D:\CQWM2\sky-take-out\sky-server\`（主服务/启动模块，含独立 `pom.xml`；推测存放 Controller / Service / Mapper 等业务代码，为唯一可运行、对外提供接口的部署单元）

> 说明：模块名与路径来自根 `pom.xml` 的 `<modules>` 声明及 depth=2 目录结构；模块职责为基于模块命名的**初步推断**，各子模块内部确切职责与依赖将由后续 S2/S3 深入核实，本步骤未读取子模块 `pom.xml`。

## 项目类比
把这个项目想象成一家**外卖餐厅的后厨系统**（整栋楼、一个出餐窗口）：

- 整个 `sky-take-out` 聚合工程好比「这家店的总店章程」——它自己不炒菜（`packaging=pom`，不产出可运行制品），只规定「本店由哪几个部门组成、大家统一用哪套供货标准（`dependencyManagement` 里锁定的依赖版本）」。
- `sky-common` 像后厨的**公共工具间**：刀具、量杯、统一的调味配比（工具类、通用常量、异常定义等），每个部门都来取用，但它自己不接单、不炒菜。
- `sky-pojo` 像**标准餐盒与菜单模板**：规定「一份订单长什么样、一道菜有哪些字段」（数据对象 / DTO / Entity），保证前台后厨传菜时格式一致；它只描述数据的形状，不干活。
- `sky-server` 才是**真正开火营业的前厅 + 主灶台**：对外开门迎客（接收 HTTP 请求）、调度公共工具间和餐盒模板，把菜做出来上桌（唯一可 `java -jar` 启动、对外营业的模块）。

**类比与真实项目的对应关系**：多模块单体 = 同一家店、同一套后厨、一次性开张营业（单进程单体），只是内部按「公共工具 / 数据模板 / 主业务」分了三个部门（Maven 子模块）；三个部门共用一份总店章程（父 POM）、统一供货标准（`dependencyManagement`），只有 `sky-server` 对外营业（唯一可运行部署单元）。它**不是**几家独立门店各自开业、靠电话（网络）互相协作（那才是微服务），正对应「多模块单体」的关键特征。
