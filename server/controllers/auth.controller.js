import { config } from '../config.js';
import { isStaff } from '../middlewares/requireStaff.js';
import { SESSION_COOKIE, checkPassword, createSession } from '../services/auth.service.js';
import { HttpError } from '../utils/httpError.js';

const cookieOptions = { httpOnly: true, sameSite: 'strict', secure: config.production, path: '/' };

export function login(req, res) {
  if (!checkPassword(req.body?.password)) throw new HttpError(401, 'Senha incorreta.');
  const { token, maxAge } = createSession();
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge });
  res.json({ staff: true });
}

export function logout(req, res) {
  res.clearCookie(SESSION_COOKIE, cookieOptions);
  res.json({ staff: false });
}

export function me(req, res) {
  res.set('Cache-Control', 'no-store');
  res.json({ staff: isStaff(req) });
}
