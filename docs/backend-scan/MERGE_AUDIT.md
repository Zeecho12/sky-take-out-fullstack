# MERGE_AUDIT — BACKEND_OVERVIEW 保真度审计
> 由 backend-scan-7b-audit 生成。下游 AI 通常无需阅读，仅在怀疑失真时查。

✅ A0 存在性关卡通过；A1~A9 强校验全部通过。
审计对象：BACKEND_OVERVIEW.md + FILE_INDEX.md
对照基准：PROJECT_S1~S5 + S4B
审计时间：2026-07-22

---

## A0 存在性关卡（最硬关卡，全过）
- **A0.1 OVERVIEW 章节齐全**：`## META` / `## AI 导航` / `## SECTION-1` ~ `## SECTION-7` 全部存在（共 7 个 SECTION，一个不缺）。
- **A0.2 FILE_INDEX 分类齐全**：`## A.1` ~ `## A.13` 全部 13 个分类标题存在（本项目 13 类均有文件，无需 "(无)" 占位）。
- **A0.3 META 字段齐全**：25 个字段全部在表内；`java_version` 无法从 S1~5 取值，已如实标注「未在 SECTION-1~5 中找到」（非整行缺失，合规）。

## A1~A9 保真度强校验（全过）
- **A1 模块卡片完整**：S3 Part A（sky-common / sky-pojo / sky-server 共 3 张）+ Part B（controller / service / mapper / config / security / aspect / annotation / handler / task / websocket 共 10 张）= 13 张卡片，SECTION-3 逐一对应。
- **A2 调用链节点完整**：S5 主链 5 个节点（OrderController / OrderServiceImpl / OrderMapper / MySQL / 百度地图 Web API）+ 3 条浅链（鉴权 / 推送 / 缓存）在 SECTION-5 全部对应；「未展开」候选亦保留。
- **A3 代码片段逐字一致（LOCK）**：SECTION-5 共 7 段 `java` 代码，逐段与 S5 对应片段做去缩进后 byte-diff——**7/7 代码内容 byte-identical**（换行、缩进、注释、中文、空行全一致）。唯一差异是 S5 因代码块嵌套在「📍 节点」条目下、闭合围栏带 3 空格缩进而多出 1 个结尾换行符，属 markdown 围栏排版产物，非代码内容差异，不构成失真。
- **A4 FILE_INDEX 防编造**：A.1~A.13 每条路径均带 `[SOURCE: ...]` 且可回溯到 S3 完整文件清单 / S4 配置 / S1 构建 / S5 节点；无凭空杜撰路径。
- **A5 FILE_INDEX 防遗漏**：S3 三个子模块完整文件清单共 **145 个 `.java`**（sky-common 29 + sky-pojo 51 + sky-server 65）逐一核对，全部能在 FILE_INDEX A.1~A.11 找到归属——**零遗漏**。（DTO 23 / VO 17 / entity 11 / mapper 11 / service 接口 10 + impl 10 / controller admin 9 + user 8 + notify 1 / exception 12 / config 5 / security 3 / task 3 等分项均对齐。）
- **A6 SECTION-6 对齐 S4B**：S4B 的 11 张表 + 11 个实体在 SECTION-6.1/6.2 全部出现；字段类型逐表核对与 S4B 一致，**全文无「(类型未明)」标记**（S4B 已给类型的字段无一漏搬）；6.3 DTO 23 + VO 17、6.4 表关系边列表均可追溯到 S4B。
- **A7 SECTION-7 安全覆盖**：扫描 S5 全文，未出现 `MD5`/`SHA1`/`DigestUtils`/固定盐/明文密码/`synchronized`/`intern()`/`Thread.sleep`/`SQL 拼接` 任一触发关键词（S5 用的是 BCrypt，属良好实践）；SECTION-7 7.2/7.3 另已覆盖实存风险：无 `@Transactional` 的多步写库不一致（🔴）、配置明文凭证（🟡）、`useSSL=false`（🟡）、Redis 无密码（🟡）、物理删除（🟡）、拆箱 NPE（🟡）、回调验签未知（⚪）。
- **A8 标识符与值抽查**：抽查 20+ 项 LOCK 值（port 8080、DB 密码 123456、JWT secret `sky-take-out-cend-auth-unified-secret-2026` / ttl 7200000、阿里云 AK/SK、微信 appid/mchid/mchSerialNo/apiV3Key/secret/两处 `.pem` 路径、百度 ak `EFEEFFEFEFE`、Redis database 10、WebSocket 端点 `ws://localhost:8080/ws/{sid}`、百度地图 URL、Spring Boot 2.7.3、关键文件绝对路径）——与 S1~5 源逐一一致，重排未改动任何 LOCK 值。
- **A9 置信标记保留**：S1~5 的 `(推断)`（`@MapperScan`/WebSocket 承载/API 路径/PayNotify 路径等）与「判断依据」在 OVERVIEW 对应处仍在；S4「推断」→S5「实读确认」的升级（WebSocket 端点路径）也如实保留。

---

## 结论
全部关卡通过，未发现缺章节、编造、遗漏或 LOCK 值改动。BACKEND_OVERVIEW.md 与 FILE_INDEX.md 对 PROJECT_S1~S5 + S4B 保真。META 顶部 `merge_audit_status` 回填为 `PASS`。
