# PROJECT_S1_PROFILE — 项目定性

## 项目基本信息
- 项目名称：**sky-take-out**（苍穹外卖）
  - 依据：根目录 `pom.xml` 第 12 行 `<artifactId>sky-take-out</artifactId>`，groupId 为 `com.sky`。
- 项目用途：一套**外卖 / 餐饮点餐管理系统**的后端服务（商家端 + 用户 C 端）。
  - 依据：groupId `com.sky`、artifactId `sky-take-out`（外卖）；`NOTE/` 目录下的源码笔记涉及"C 端菜品查询""员工分页查询""新增/编辑员工""启用禁用员工账户"等业务；`pom.xml` 引入了阿里云 OSS（图片上传，第 96-100 行）、微信支付（`wechatpay-apache-httpclient`，第 120-124 行）、POI（导出 Excel 报表，第 108-118 行）等典型外卖业务依赖。
- 项目类型：**多模块单体应用（Multi-module Monolith）** —— 基于 Spring Boot 2.7.3 的单体 Web 应用，按职责拆成多个 Maven 子模块，但最终只有一个可运行部署单元。
- 判断依据：
  1. 根 `pom.xml` 第 13 行 `<packaging>pom</packaging>`，且第 15-19 行声明了 3 个 `<module>`（`sky-common`、`sky-pojo`、`sky-server`）—— 这是**聚合工程（Aggregator Project）**的典型结构，而非单一模块。
  2. 每个子模块目录下都有自己的 `pom.xml`（`sky-common/pom.xml`、`sky-pojo/pom.xml`、`sky-server/pom.xml`）。
  3. 父工程继承 `spring-boot-starter-parent` 2.7.3（第 6-10 行），**没有引入任何 Spring Cloud 依赖**（无 Eureka/Nacos/Gateway/OpenFeign），因此**不是微服务（Microservices）**，而是单体。
  4. 从模块命名看，只有 `sky-server` 是可运行的服务模块，`sky-common`（公共工具）与 `sky-pojo`（数据模型）是被依赖的支撑库 —— 符合"多模块打包成一个进程运行"的单体特征。

## 构建与部署
- 构建工具：**Maven**（根目录及各子模块均为 `pom.xml`，无 `build.gradle`）。
  - POM 模型版本 `modelVersion` 4.0.0；未发现 Maven Wrapper（无 `mvnw` / `.mvn`）。
  - 依赖统一由父工程 `spring-boot-starter-parent` **2.7.3** 管理版本。
- 容器化：**没有**。
  - 依据：全项目范围内未发现 `Dockerfile`、`docker-compose.yml`/`docker-compose.yaml`、`.dockerignore` 或 `.env` 文件（已用通配符全局搜索确认）。
- 部署方式：未发现容器化配置，推测为**直接 jar 包部署** —— 由 `sky-server` 模块通过 `spring-boot-maven-plugin` 打成可执行 jar（fat jar），用 `java -jar` 直接运行。

## 模块列表
- **sky-common**：`sky-common/` —— 公共模块（推测存放通用工具类、常量、统一返回结果、全局异常等，供其他模块依赖）。
- **sky-pojo**：`sky-pojo/` —— 数据模型模块（推测存放 Entity / DTO / VO 等纯数据对象定义）。
- **sky-server**：`sky-server/` —— 主服务模块（推测存放 Controller / Service / Mapper 等业务代码，是唯一可运行、对外提供接口的部署单元）。

> 说明：模块职责为基于模块命名的**初步推断**，用于建立整体印象；各模块内部的确切职责与依赖关系将在 scan-3-modules 步骤中进一步核实。

## 项目类比
把这个多模块单体项目想象成**一家外卖餐厅**（整栋楼、一个出餐窗口）：

- **sky-common（公共工具间）**：后厨里放刀具、调料、量杯的公共储物间。谁都能进去取用，但它自己不炒菜、不接单。
- **sky-pojo（菜单与食材登记表）**：定义"一道菜长什么样""一份订单包含哪些字段"的标准表格。它只描述数据的形状，不干活。
- **sky-server（前厅 + 主厨房）**：真正接单、做菜、上菜、收款的地方，也是**唯一对外营业的窗口**（对外暴露 HTTP 接口）。它做菜时会去公共工具间（common）取工具，按菜单登记表（pojo）的格式装盘。

**类比与真实项目的对应关系**：整个餐厅是**一栋楼、一个营业窗口**（= 单体，所有模块最终打包运行在同一个进程里）；只有 `sky-server` 对外营业（= 唯一可运行部署单元），而 `sky-common` 和 `sky-pojo` 是被它依赖的内部支撑，不单独对外。这与"微服务"——即每个部门是独立的连锁分店、各自独立营业、之间靠电话（网络）沟通——形成对照。
