/**
 * Limite les tentatives de connexion afin de réduire les attaques par force brute.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const attempts = new Map();

const makeKey = (req) => {
  const username = String(req.body?.username || '').trim().toLowerCase();
  return username || '__identifiant_vide__';
};

export const loginRateLimit = (req, res, next) => {
  const now = Date.now();
  const key = makeKey(req);
  const entry = attempts.get(key);

  if (!entry || now >= entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else if (entry.count >= MAX_ATTEMPTS) {
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    res.set('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({
      message: 'Trop de tentatives de connexion. Veuillez réessayer plus tard.'
    });
  } else {
    entry.count += 1;
  }

  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) attempts.delete(key);
  });

  return next();
};

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of attempts.entries()) {
    if (now >= entry.resetAt) attempts.delete(key);
  }
}, WINDOW_MS);
cleanupTimer.unref?.();
