import { Router } from 'express';
import type { Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { env, REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH, REFRESH_TOKEN_TTL_MS } from '../env';
import { prisma } from '../prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError, unauthorized } from '../utils/errors';
import { generateRefreshToken, hashToken, signAccessToken } from '../utils/tokens';
import {
  checkLoginBlocked,
  loginRateKey,
  recordLoginFailure,
  resetLoginFailures
} from '../utils/loginRateLimit';
import { authMiddleware } from '../middleware/auth';
import { serializeUser } from '../services/serializers';

export const authRouter = Router();

const loginSchema = z.object({
  username: z.string({ required_error: 'username 必填' }).trim().min(1, 'username 不能为空'),
  password: z.string({ required_error: 'password 必填' }).min(1, 'password 不能为空')
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'currentPassword 必填'),
  newPassword: z.string().min(8, '新密码至少 8 位')
});

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    secure: env.cookieSecure,
    maxAge: REFRESH_TOKEN_TTL_MS
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    secure: env.cookieSecure
  });
}

async function issueSession(userId: string) {
  const refreshToken = generateRefreshToken();
  await prisma.refreshSession.create({
    data: {
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS)
    }
  });
  return refreshToken;
}

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const username = body.username.trim();
    const key = loginRateKey(req.ip || 'unknown', username);

    const blocked = checkLoginBlocked(key);
    if (blocked.blocked) {
      res.setHeader('Retry-After', String(blocked.retryAfterSeconds));
      throw new AppError(429, 'TOO_MANY_REQUESTS', '登录失败次数过多，请 15 分钟后再试');
    }

    const user = await prisma.user.findFirst({
      where: { OR: [{ username }, { email: username }] }
    });
    const passwordOk = user ? await bcrypt.compare(body.password, user.passwordHash) : false;

    if (!user || !passwordOk) {
      recordLoginFailure(key);
      throw unauthorized('账号或密码错误');
    }

    resetLoginFailures(key);
    const refreshToken = await issueSession(user.id);
    setRefreshCookie(res, refreshToken);

    res.status(200).json({
      user: serializeUser(user),
      accessToken: signAccessToken(user.id)
    });
  })
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    if (token) {
      await prisma.refreshSession.updateMany({
        where: { tokenHash: hashToken(token), revokedAt: null },
        data: { revokedAt: new Date() }
      });
    }
    clearRefreshCookie(res);
    res.status(204).end();
  })
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    if (!token) {
      throw unauthorized('refresh token 缺失');
    }

    const session = await prisma.refreshSession.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true }
    });

    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      clearRefreshCookie(res);
      throw unauthorized('refresh token 无效或已过期');
    }

    await prisma.refreshSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() }
    });
    const newRefreshToken = await issueSession(session.userId);
    setRefreshCookie(res, newRefreshToken);

    res.status(200).json({
      user: serializeUser(session.user),
      accessToken: signAccessToken(session.userId)
    });
  })
);

authRouter.get(
  '/me',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
    if (!user) throw unauthorized('用户不存在');
    res.status(200).json({ user: serializeUser(user) });
  })
);

authRouter.post(
  '/password',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const body = passwordSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
    if (!user) throw unauthorized('用户不存在');

    const ok = await bcrypt.compare(body.currentPassword, user.passwordHash);
    if (!ok) throw new AppError(401, 'UNAUTHORIZED', '当前密码不正确');

    const passwordHash = await bcrypt.hash(body.newPassword, 10);
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      prisma.refreshSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() }
      })
    ]);
    clearRefreshCookie(res);
    res.status(204).end();
  })
);
