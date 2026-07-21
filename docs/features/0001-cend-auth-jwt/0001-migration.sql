-- =============================================================================
-- 工单 0001「C 端认证改造」— 步骤1 DB 迁移脚本
-- =============================================================================
-- 作用:对【正在运行的库】做增量迁移(sky.sql 是全新导入用的 schema 源头,
--       本脚本负责已有数据库的原地升级,二者内容对齐)。
--   1) user 表新增 username(唯一索引) + password 两列;openid 保持不变。
--   2) employee 表 admin 用户密码迁移为 BCrypt 哈希(明文 123456 → 哈希)。
--
-- 目标环境:MySQL 5.7,库名 sky_take_out(库名不硬编码,以 DATABASE() 为准)。
--
-- 幂等/可重跑:MySQL 5.7 不支持 ADD COLUMN/INDEX IF NOT EXISTS,
--   因此用 information_schema 查询做"存在性守卫" + PREPARE/EXECUTE 动态 SQL,
--   已存在则跳过。全脚本仅用动态 SQL,不使用 DELIMITER / 存储过程,
--   可直接 `mysql < file` 执行,可重复执行不报错。
--
-- 运行方式:
--   mysql -uroot -p123456 sky_take_out < docs/features/0001-cend-auth-jwt/0001-migration.sql
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1) user 表新增 `username` 列(openid 之后)
--    守卫:information_schema.COLUMNS 里已存在该列则跳过。
-- -----------------------------------------------------------------------------
SELECT COUNT(*) INTO @col_username
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'user'
  AND COLUMN_NAME  = 'username';

SET @sql := IF(@col_username > 0,
  'SELECT ''[skip] user.username 已存在'' AS msg',
  'ALTER TABLE `user` ADD COLUMN `username` varchar(32) COLLATE utf8_bin DEFAULT NULL COMMENT ''登录用户名'' AFTER `openid`');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- -----------------------------------------------------------------------------
-- 2) user 表新增 `password` 列(username 之后)
--    守卫:information_schema.COLUMNS 里已存在该列则跳过。
-- -----------------------------------------------------------------------------
SELECT COUNT(*) INTO @col_password
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'user'
  AND COLUMN_NAME  = 'password';

SET @sql := IF(@col_password > 0,
  'SELECT ''[skip] user.password 已存在'' AS msg',
  'ALTER TABLE `user` ADD COLUMN `password` varchar(64) COLLATE utf8_bin DEFAULT NULL COMMENT ''密码(BCrypt)'' AFTER `username`');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- -----------------------------------------------------------------------------
-- 3) user 表新增唯一索引 `idx_username`(username 列)
--    守卫:information_schema.STATISTICS 里已存在该索引则跳过。
--    说明:唯一索引允许多个 NULL(MySQL 语义),给 openid-only/社交登录留空间。
-- -----------------------------------------------------------------------------
SELECT COUNT(*) INTO @idx_username
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'user'
  AND INDEX_NAME   = 'idx_username';

SET @sql := IF(@idx_username > 0,
  'SELECT ''[skip] user.idx_username 已存在'' AS msg',
  'ALTER TABLE `user` ADD UNIQUE KEY `idx_username` (`username`)');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- -----------------------------------------------------------------------------
-- 4) 迁移 admin 密码:明文 → BCrypt 哈希(matches("123456")=true,已验证)
--    天然幂等:重跑只是把同一个值再写一遍,无需守卫。
-- -----------------------------------------------------------------------------
UPDATE `employee`
SET `password` = '$2a$10$h3pWxrN1VUO/Ufe57AdH3.zmJaUsHRIt90xI8HRY7nxRfx015.eFS'
WHERE `username` = 'admin';
