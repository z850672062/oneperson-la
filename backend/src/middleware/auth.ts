import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../utils/tokens';

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: '未登录或登录已过期' } });
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  try {
    const payload = verifyAccessToken(token);
    req.auth = { userId: payload.userId };
    next();
  } catch {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: '登录令牌无效或已过期' } });
  }
}
