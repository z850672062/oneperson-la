-- CreateTable
CREATE TABLE `StickyNote` (
    `id` VARCHAR(191) NOT NULL,
    `content` VARCHAR(500) NOT NULL,
    `done` BOOLEAN NOT NULL DEFAULT false,
    `categoryId` VARCHAR(191) NULL,
    `recordId` VARCHAR(191) NULL,
    `doneAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `StickyNote_recordId_key`(`recordId`),
    INDEX `StickyNote_done_createdAt_idx`(`done`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
