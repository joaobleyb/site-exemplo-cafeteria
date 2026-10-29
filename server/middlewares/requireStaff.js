import { SESSION_COOKIE, verifySession } from '../services/auth.service.js';
import { parseCookies } from '../utils/cookies.js';
import { HttpError } from '../utils/httpError.js';

export function isStaff(req) {
  return verifySession(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
}

export function requireStaff(req, res, next) {
  if (isStaff(req)) return next();
  next(new HttpError(401, 'Sua sessão acabou. Entre de novo com a senha da equipe.'));
}
