/**
 * Limitation légère des actions administratives critiques.
 *
 * Elle réduit les répétitions accidentelles ou automatisées sans ajouter de
 * dépendance. Les recherches GET restent fluides ; seules les écritures sont
 * limitées par compte administrateur.
 */
const WINDOW_MS = 15 * 60 * 1_000;
const MAX_ACTIONS = 30;
const attempts = new Map();

export const adminPaymentActionRateLimit = (req, res, next) => {
  const now = Date.now();
  const key = String(req.user?.id || 'anonymous');
  const current = attempts.get(key);

  if (!current || now >= current.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return next();
  }

  if (current.count >= MAX_ACTIONS) {
    const retryAfterSeconds = Math.max(Math.ceil((current.resetAt - now) / 1_000), 1);
    res.set('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({
      message: 'Trop d’actions sensibles ont été effectuées. Veuillez patienter avant de réessayer.'
    });
  }

  current.count += 1;
  return next();
};
