-- 多账号数据隔离：为业务数据增加 userId，并把存量数据回填到最早注册的用户
-- 说明：Setting.id 即 userId（该表无外键约束，由业务层保证）

-- 1) 增加列（先可空，便于回填）
ALTER TABLE `Category` ADD COLUMN `userId` VARCHAR(191) NULL;
ALTER TABLE `FieldDef` ADD COLUMN `userId` VARCHAR(191) NULL;
ALTER TABLE `Record` ADD COLUMN `userId` VARCHAR(191) NULL;
ALTER TABLE `StickyNote` ADD COLUMN `userId` VARCHAR(191) NULL;
ALTER TABLE `KbConnector` ADD COLUMN `userId` VARCHAR(191) NULL;
ALTER TABLE `KbDoc` ADD COLUMN `userId` VARCHAR(191) NULL;
ALTER TABLE `ChatSession` ADD COLUMN `userId` VARCHAR(191) NULL;
ALTER TABLE `MemoryItem` ADD COLUMN `userId` VARCHAR(191) NULL;
ALTER TABLE `Report` ADD COLUMN `userId` VARCHAR(191) NULL;
ALTER TABLE `LlmModel` ADD COLUMN `userId` VARCHAR(191) NULL;

-- 2) 存量数据回填到最早注册的用户（单人应用，历史数据归属创建者）
UPDATE `Category` SET `userId` = (SELECT id FROM `User` ORDER BY `createdAt` ASC, `id` ASC LIMIT 1) WHERE `userId` IS NULL;
UPDATE `FieldDef` SET `userId` = (SELECT id FROM `User` ORDER BY `createdAt` ASC, `id` ASC LIMIT 1) WHERE `userId` IS NULL;
UPDATE `Record` SET `userId` = (SELECT id FROM `User` ORDER BY `createdAt` ASC, `id` ASC LIMIT 1) WHERE `userId` IS NULL;
UPDATE `StickyNote` SET `userId` = (SELECT id FROM `User` ORDER BY `createdAt` ASC, `id` ASC LIMIT 1) WHERE `userId` IS NULL;
UPDATE `KbConnector` SET `userId` = (SELECT id FROM `User` ORDER BY `createdAt` ASC, `id` ASC LIMIT 1) WHERE `userId` IS NULL;
UPDATE `KbDoc` SET `userId` = (SELECT id FROM `User` ORDER BY `createdAt` ASC, `id` ASC LIMIT 1) WHERE `userId` IS NULL;
UPDATE `ChatSession` SET `userId` = (SELECT id FROM `User` ORDER BY `createdAt` ASC, `id` ASC LIMIT 1) WHERE `userId` IS NULL;
UPDATE `MemoryItem` SET `userId` = (SELECT id FROM `User` ORDER BY `createdAt` ASC, `id` ASC LIMIT 1) WHERE `userId` IS NULL;
UPDATE `Report` SET `userId` = (SELECT id FROM `User` ORDER BY `createdAt` ASC, `id` ASC LIMIT 1) WHERE `userId` IS NULL;
UPDATE `LlmModel` SET `userId` = (SELECT id FROM `User` ORDER BY `createdAt` ASC, `id` ASC LIMIT 1) WHERE `userId` IS NULL;

-- Setting：把默认单例行的主键改为用户 id
UPDATE `Setting` SET `id` = (SELECT id FROM `User` ORDER BY `createdAt` ASC, `id` ASC LIMIT 1) WHERE `id` = 'default';

-- 2.5) 清理无主数据：全新空库重放时无用户可回填，
--      早期迁移内嵌的演示分类会成为孤儿行，交给 seed 重建；已有用户的生产库此步为空操作
DELETE FROM `FieldDef` WHERE `userId` IS NULL;
DELETE FROM `Record` WHERE `userId` IS NULL;
DELETE FROM `StickyNote` WHERE `userId` IS NULL;
DELETE FROM `KbDoc` WHERE `userId` IS NULL;
DELETE FROM `KbConnector` WHERE `userId` IS NULL;
DELETE FROM `ChatSession` WHERE `userId` IS NULL;
DELETE FROM `MemoryItem` WHERE `userId` IS NULL;
DELETE FROM `Report` WHERE `userId` IS NULL;
DELETE FROM `LlmModel` WHERE `userId` IS NULL;
DELETE FROM `Category` WHERE `userId` IS NULL;

-- 3) 收紧为 NOT NULL
ALTER TABLE `Category` MODIFY `userId` VARCHAR(191) NOT NULL;
ALTER TABLE `FieldDef` MODIFY `userId` VARCHAR(191) NOT NULL;
ALTER TABLE `Record` MODIFY `userId` VARCHAR(191) NOT NULL;
ALTER TABLE `StickyNote` MODIFY `userId` VARCHAR(191) NOT NULL;
ALTER TABLE `KbConnector` MODIFY `userId` VARCHAR(191) NOT NULL;
ALTER TABLE `KbDoc` MODIFY `userId` VARCHAR(191) NOT NULL;
ALTER TABLE `ChatSession` MODIFY `userId` VARCHAR(191) NOT NULL;
ALTER TABLE `MemoryItem` MODIFY `userId` VARCHAR(191) NOT NULL;
ALTER TABLE `Report` MODIFY `userId` VARCHAR(191) NOT NULL;
ALTER TABLE `LlmModel` MODIFY `userId` VARCHAR(191) NOT NULL;

-- 4) 唯一约束按用户维度重建
ALTER TABLE `Category` DROP INDEX `Category_name_key`;
ALTER TABLE `Category` ADD UNIQUE INDEX `Category_userId_name_key`(`userId`, `name`);
ALTER TABLE `MemoryItem` DROP INDEX `MemoryItem_text_key`;
ALTER TABLE `MemoryItem` ADD UNIQUE INDEX `MemoryItem_userId_text_key`(`userId`, `text`);
ALTER TABLE `LlmModel` DROP INDEX `LlmModel_vendor_model_key`;
ALTER TABLE `LlmModel` ADD UNIQUE INDEX `LlmModel_userId_vendor_model_key`(`userId`, `vendor`, `model`);

-- 5) 普通索引
ALTER TABLE `Category` ADD INDEX `Category_userId_idx`(`userId`);
ALTER TABLE `FieldDef` ADD INDEX `FieldDef_userId_idx`(`userId`);
ALTER TABLE `Record` ADD INDEX `Record_userId_idx`(`userId`);
ALTER TABLE `StickyNote` ADD INDEX `StickyNote_userId_idx`(`userId`);
ALTER TABLE `KbConnector` ADD INDEX `KbConnector_userId_idx`(`userId`);
ALTER TABLE `KbDoc` ADD INDEX `KbDoc_userId_idx`(`userId`);
ALTER TABLE `ChatSession` ADD INDEX `ChatSession_userId_idx`(`userId`);
ALTER TABLE `MemoryItem` ADD INDEX `MemoryItem_userId_idx`(`userId`);
ALTER TABLE `Report` ADD INDEX `Report_userId_idx`(`userId`);
ALTER TABLE `LlmModel` ADD INDEX `LlmModel_userId_idx`(`userId`);

-- 6) 外键（级联删除用户数据）
ALTER TABLE `Category` ADD CONSTRAINT `Category_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `FieldDef` ADD CONSTRAINT `FieldDef_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Record` ADD CONSTRAINT `Record_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `StickyNote` ADD CONSTRAINT `StickyNote_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `KbConnector` ADD CONSTRAINT `KbConnector_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `KbDoc` ADD CONSTRAINT `KbDoc_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ChatSession` ADD CONSTRAINT `ChatSession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `MemoryItem` ADD CONSTRAINT `MemoryItem_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Report` ADD CONSTRAINT `Report_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `LlmModel` ADD CONSTRAINT `LlmModel_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
