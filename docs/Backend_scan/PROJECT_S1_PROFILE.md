# PROJECT_S1_PROFILE - 项目定性报告

## 项目基本信息
- 项目名称：user-center-backend（用户中心后端）
- 项目用途：一个用户管理系统，提供用户注册、登录、查询、注销等基础功能，属于企业级通用用户中心
- 项目类型：单体应用（Monolith）— Spring Boot 单体项目
- 判断依据：根目录仅有一个 `pom.xml`，无子模块声明（`<modules>` 标签不存在）；项目结构为标准的 `src/main` + `src/test` 单模块布局；`pom.xml` 的 `parent` 直接继承 `spring-boot-starter-parent`，无 Spring Cloud 相关依赖

## 构建与部署
- 构建工具：Maven（版本由 `spring-boot-starter-parent:2.6.4` 管理，项目自带 Maven Wrapper `mvnw`/`mvnw.cmd`）
- 容器化：有 — 项目根目录存在 `Dockerfile`，采用多阶段构建（multi-stage build），基础镜像为 `maven:3.5-jdk-8-alpine`
- 部署方式：Docker 容器化部署；`Dockerfile` 中通过 `mvn package` 构建 jar 包，启动命令为 `java -jar user-center-backend-0.0.1-SNAPSHOT.jar --spring.profiles.active=prod`；README 中提到支持多种部署方式：原始 Nginx + SpringBoot、宝塔 Linux、Docker 容器、容器平台

## 模块列表
- 单体项目，无子模块
- 主要目录结构：
  - `src/main`：主代码目录
  - `src/test`：测试代码目录
  - `sql/`：数据库建表脚本（`create_table.sql`）
  - `target/`：构建输出目录

## 项目类比

这个项目就像一家**小型社区便利店的会员管理系统**：

- **便利店本身** = 整个单体应用，所有功能都在一个店里完成
- **会员注册柜台** = 用户注册功能，新顾客来填写信息办卡
- **刷卡入口** = 用户登录功能，凭会员卡（Session/Cookie）进入会员专区
- **会员信息查询屏** = 用户查询功能，查看和管理会员资料
- **店长后台** = 用户管理功能，管理员对会员进行管理操作
- **MySQL 数据库** = 会员档案柜，存储所有会员信息

类比与真实项目的对应关系：这是一个功能聚焦、结构简洁的单体应用，就像社区便利店一样——麻雀虽小五脏俱全，所有服务在同一个屋檐下完成，不需要微服务那样的"连锁店调度系统"。
