import { afterAll, beforeAll } from 'vitest';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:./test.db';

const prisma = new PrismaClient();

beforeAll(async () => {
  await prisma.recordKb.deleteMany();
  await prisma.record.deleteMany();
  await prisma.fieldDef.deleteMany();
  await prisma.report.deleteMany();
  await prisma.chatMessage.deleteMany();
  await prisma.chatSession.deleteMany();
  await prisma.memoryItem.deleteMany();
  await prisma.stickyNote.deleteMany();
  await prisma.kbDoc.deleteMany();
  await prisma.kbConnector.deleteMany();
  await prisma.category.deleteMany();
  await prisma.refreshSession.deleteMany();
  await prisma.consent.deleteMany();
  await prisma.llmModel.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash('Legal1234', 4);
  await prisma.user.create({
    data: {
      id: 'test-user',
      username: 'demo@legal.local',
      name: '测试法务',
      email: 'demo@legal.local',
      passwordHash
    }
  });
  // 第二账号：用于验证数据隔离
  await prisma.user.create({
    data: {
      id: 'test-user-b',
      username: 'other@legal.local',
      name: '另一账号',
      email: 'other@legal.local',
      passwordHash
    }
  });

  await prisma.category.createMany({
    data: [
      { id: 't-contract', userId: 'test-user', name: '合同审查', sort: 0 },
      { id: 't-compliance', userId: 'test-user', name: '合规建设', sort: 1 },
      { id: 't-b-contract', userId: 'test-user-b', name: '合同审查', sort: 0 }
    ]
  });

  await prisma.fieldDef.create({
    data: {
      id: 't-field-1',
      userId: 'test-user',
      categoryId: 't-contract',
      name: '关联项目',
      group: '基础信息',
      type: 'text',
      required: false,
      sort: 0
    }
  });

  await prisma.setting.create({
    data: { id: 'test-user', maskSensitive: true, maskLlm: true, defaultModel: 'deepseek-chat' }
  });
  await prisma.setting.create({
    data: { id: 'test-user-b', maskSensitive: true, maskLlm: true, defaultModel: 'deepseek-chat' }
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
