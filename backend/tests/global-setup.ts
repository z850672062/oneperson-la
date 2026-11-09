import { execSync } from 'node:child_process';
import path from 'node:path';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'mysql://la:LaLocal2026!@127.0.0.1:3307/oneperson_la_test';

export default function globalSetup() {
  const cwd = path.resolve(__dirname, '..');
  // 测试库需预先创建（utf8mb4）；迁移由 Prisma 应用
  execSync('pnpm exec prisma migrate deploy', {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL }
  });
}
