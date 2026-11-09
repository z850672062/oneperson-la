import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors';

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: '接口不存在' } });
}

function zodMessage(error: ZodError): string {
  const issue = error.issues[0];
  if (!issue) return '参数校验失败';
  const path = issue.path.length ? `${issue.path.join('.')}: ` : '';
  return `${path}${issue.message}`;
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (error instanceof AppError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }

  if (error instanceof ZodError) {
    res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: zodMessage(error) } });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      res.status(409).json({ error: { code: 'CONFLICT', message: '同名或重复的资源已存在' } });
      return;
    }
    if (error.code === 'P2003') {
      res.status(409).json({ error: { code: 'CONFLICT', message: '存在关联数据，操作被拒绝' } });
      return;
    }
    if (error.code === 'P2025') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '资源不存在' } });
      return;
    }
  }

  if (error instanceof SyntaxError && 'body' in error) {
    res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: '请求体不是合法 JSON' } });
    return;
  }

  if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'test') {
    console.error('[error]', error instanceof Error ? error.message : error);
  }

  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' } });
}
