/**
 * Authentifie les connexions Socket.IO avec les mêmes règles que l'API HTTP.
 */
import jwt from 'jsonwebtoken';

const parseCookieHeader = (header = '') => header
  .split(';')
  .map((part) => part.trim())
  .filter(Boolean)
  .reduce((cookies, part) => {
    const separator = part.indexOf('=');
    if (separator <= 0) return cookies;
    const key = part.slice(0, separator).trim();
    const rawValue = part.slice(separator + 1).trim();
    try {
      cookies[key] = decodeURIComponent(rawValue);
    } catch {
      cookies[key] = rawValue;
    }
    return cookies;
  }, {});

/** Authentifie chaque connexion Socket.IO avec le même JWT HTTP-only. */
export const authenticateSocket = (socket, next) => {
  try {
    const cookies = parseCookieHeader(socket.handshake.headers.cookie || '');
    if (!cookies.token) return next(new Error('Non authentifié'));

    const decoded = jwt.verify(cookies.token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    socket.user = {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role
    };
    return next();
  } catch {
    return next(new Error('Session invalide ou expirée'));
  }
};
