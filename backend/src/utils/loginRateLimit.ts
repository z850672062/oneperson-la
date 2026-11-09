interface AttemptRecord {
  count: number;
  windowStartedAt: number;
}

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const attempts = new Map<string, AttemptRecord>();

function prune(now: number) {
  for (const [key, record] of attempts) {
    if (now - record.windowStartedAt >= WINDOW_MS) {
      attempts.delete(key);
    }
  }
}

export function loginRateKey(ip: string, username: string): string {
  return `${ip}|${username.trim().toLowerCase()}`;
}

export function checkLoginBlocked(key: string): { blocked: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  prune(now);
  const record = attempts.get(key);
  if (!record || now - record.windowStartedAt >= WINDOW_MS) {
    return { blocked: false, retryAfterSeconds: 0 };
  }
  if (record.count >= MAX_FAILURES) {
    return {
      blocked: true,
      retryAfterSeconds: Math.max(1, Math.ceil((record.windowStartedAt + WINDOW_MS - now) / 1000))
    };
  }
  return { blocked: false, retryAfterSeconds: 0 };
}

export function recordLoginFailure(key: string): void {
  const now = Date.now();
  const record = attempts.get(key);
  if (!record || now - record.windowStartedAt >= WINDOW_MS) {
    attempts.set(key, { count: 1, windowStartedAt: now });
    return;
  }
  record.count += 1;
}

export function resetLoginFailures(key: string): void {
  attempts.delete(key);
}
