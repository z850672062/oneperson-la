import 'dotenv/config';

const DEV_JWT_SECRET = 'dev-only-jwt-secret-oneperson-la-change-me-2f8a1c';
const DEV_ENCRYPTION_KEY = 'dev-only-encryption-key-oneperson-la-change-me-9b3d7e';

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

function splitOrigins(value: string | undefined): string[] {
  if (!value) return ['http://localhost:5173', 'http://127.0.0.1:5173'];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export const env = {
  nodeEnv,
  isProduction,
  isTest: nodeEnv === 'test',
  port: Number(process.env.PORT || 3001),
  jwtSecret: process.env.JWT_SECRET || DEV_JWT_SECRET,
  encryptionKey: process.env.ENCRYPTION_KEY || DEV_ENCRYPTION_KEY,
  llmApiKey: process.env.LLM_API_KEY || '',
  corsOrigins: splitOrigins(process.env.CORS_ORIGINS),
  cookieSecure: process.env.COOKIE_SECURE === 'true'
};

if (isProduction) {
  if (!process.env.JWT_SECRET || env.jwtSecret === DEV_JWT_SECRET) {
    throw new Error('生产环境必须设置独立的 JWT_SECRET');
  }
  if (!process.env.ENCRYPTION_KEY || env.encryptionKey === DEV_ENCRYPTION_KEY) {
    throw new Error('生产环境必须设置独立的 ENCRYPTION_KEY');
  }
}

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const REFRESH_COOKIE_NAME = 'la_refresh';
export const REFRESH_COOKIE_PATH = '/api/auth';
