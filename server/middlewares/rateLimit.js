import { HttpError } from '../utils/httpError.js';

export function rateLimit({ windowMs, max, message }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [key, h] of hits) if (h.reset <= now) hits.delete(key);
  }, windowMs).unref();

  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'local';
    let h = hits.get(key);
    if (!h || h.reset <= now) hits.set(key, (h = { count: 0, reset: now + windowMs }));
    h.count++;
    if (h.count > max) {
      res.set('Retry-After', String(Math.ceil((h.reset - now) / 1000)));
      return next(new HttpError(429, message || 'Muitas tentativas seguidas. Espere um pouco e tente de novo.'));
    }
    next();
  };
}
