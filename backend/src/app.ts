import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './env';
import { authMiddleware } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/error';
import { authRouter } from './routes/auth';
import { categoriesRouter } from './routes/categories';
import { fieldsRouter } from './routes/fields';
import { recordsRouter } from './routes/records';
import { dashboardRouter } from './routes/dashboard';
import { reportsRouter } from './routes/reports';
import { kbRouter } from './routes/kb';
import { chatRouter } from './routes/chat';
import { profileRouter } from './routes/profile';
import { llmRouter, settingsRouter } from './routes/settings';
import { userRouter } from './routes/user';

const VERSION = '0.1.0';

export const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  })
);
app.use(
  cors({
    origin: env.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));

if (!env.isTest) {
  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
      const pathname = req.originalUrl.split('?')[0];
      console.log(`[http] ${req.method} ${pathname} ${res.statusCode} ${Date.now() - startedAt}ms`);
    });
    next();
  });
}

app.get('/api/health', (_req, res) => {
  res.status(200).json({ ok: true, version: VERSION });
});

app.use('/api/auth', authRouter);

app.use('/api/categories', authMiddleware, categoriesRouter);
app.use('/api/fields', authMiddleware, fieldsRouter);
app.use('/api/records', authMiddleware, recordsRouter);
app.use('/api/dashboard', authMiddleware, dashboardRouter);
app.use('/api/reports', authMiddleware, reportsRouter);
app.use('/api/kb', authMiddleware, kbRouter);
app.use('/api/chat', authMiddleware, chatRouter);
app.use('/api/profile', authMiddleware, profileRouter);
app.use('/api/settings', authMiddleware, settingsRouter);
app.use('/api/llm/models', authMiddleware, llmRouter);
app.use('/api/user', authMiddleware, userRouter);

app.use('/api', notFoundHandler);

if (!env.isTest) {
  const webDist = path.resolve(__dirname, '../../web/dist');
  if (fs.existsSync(webDist)) {
    app.use(
      express.static(webDist, {
        index: false,
        setHeaders: (res, filePath) => {
          // 指纹静态资源长缓存；其余文件（如 index.html）禁止缓存，避免更新后仍加载旧版本
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else {
            res.setHeader('Cache-Control', 'no-store');
          }
        }
      })
    );
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        next();
        return;
      }
      res.setHeader('Cache-Control', 'no-store');
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }
}

app.use(errorHandler);
