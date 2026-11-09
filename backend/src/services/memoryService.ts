import { prisma } from '../prisma';

export async function rememberFromChat(content: string): Promise<void> {
  const compact = content.replace(/\s+/g, ' ').trim();
  if (!compact) return;
  const text = `工作关注：${Array.from(compact).slice(0, 40).join('')}`;
  const existing = await prisma.memoryItem.findUnique({ where: { text } });
  if (existing) return;
  await prisma.memoryItem.create({
    data: { text, source: 'chat', weight: 0.6 }
  });
}
