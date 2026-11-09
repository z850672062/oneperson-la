-- OnePerson_LA：MySQL 8 初始化（Docker 首次启动 / 手工一次性执行）
-- 字符集统一 utf8mb4，排序规则 utf8mb4_unicode_ci
-- 说明：应用账号由 Docker 的 MYSQL_USER/MYSQL_PASSWORD 创建；
--       手工部署时请先创建账号（见 backend/DEPLOY.md），再执行本脚本补权限。
CREATE DATABASE IF NOT EXISTS `oneperson_la`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS `oneperson_la_test`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

GRANT ALL PRIVILEGES ON `oneperson_la`.* TO 'la'@'%';
GRANT ALL PRIVILEGES ON `oneperson_la_test`.* TO 'la'@'%';
FLUSH PRIVILEGES;
