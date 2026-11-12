-- 便签勾选完成时是否调用 AI 归类（关闭则人工填写）
ALTER TABLE `Setting` ADD COLUMN `stickyAiSuggest` BOOLEAN NOT NULL DEFAULT true;
