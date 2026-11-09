-- 扁平化分类：取消两级结构，原先的二级分类转为记录的「事项类型」(subType)
-- 1) 记录新增事项类型列
ALTER TABLE `Record` ADD COLUMN `subType` VARCHAR(40) NOT NULL DEFAULT '' AFTER `categoryId`;

-- 2) 二级分类名写入事项类型
UPDATE `Record` r
JOIN `Category` c ON r.`categoryId` = c.`id`
SET r.`subType` = c.`name`
WHERE c.`parentId` IS NOT NULL;

-- 3) 记录并入父分类
UPDATE `Record` r
JOIN `Category` c ON r.`categoryId` = c.`id`
SET r.`categoryId` = c.`parentId`
WHERE c.`parentId` IS NOT NULL;

-- 4) 字段模板并入父分类（如有自定义字段）
UPDATE `FieldDef` f
JOIN `Category` c ON f.`categoryId` = c.`id`
SET f.`categoryId` = c.`parentId`
WHERE c.`parentId` IS NOT NULL;

-- 5) 分类改名与补建
UPDATE `Category` SET `name` = '合规建设' WHERE `name` = '合规咨询';
INSERT INTO `Category` (`id`, `name`, `sort`, `createdAt`, `updatedAt`)
SELECT 'cat-ip', '知识产权', 4, NOW(3), NOW(3) FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `Category` WHERE `name` = '知识产权');

-- 6) 删除全部二级分类
DELETE FROM `Category` WHERE `parentId` IS NOT NULL;

-- 7) 移除 self relation 与相关索引，改为分类名全局唯一
ALTER TABLE `Category` DROP FOREIGN KEY `Category_parentId_fkey`;
ALTER TABLE `Category` DROP INDEX `Category_parentId_name_key`;
ALTER TABLE `Category` DROP INDEX `Category_parentId_idx`;
ALTER TABLE `Category` DROP COLUMN `parentId`;
CREATE UNIQUE INDEX `Category_name_key` ON `Category`(`name`);

-- 8) 事项类型筛选索引
CREATE INDEX `Record_categoryId_subType_idx` ON `Record`(`categoryId`, `subType`);
