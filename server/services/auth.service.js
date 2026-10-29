import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

export const SESSION_COOKIE = 'freijo_staff';

const sha = v => createHash('sha256').update(String(v)).digest();
const sign = payload => createHmac('sha256', config.sessionSecret).update(payload).digest('base64url');

export function checkPassword(password) {
  return typeof password === 'string' && timingSafeEqual(sha(password), sha(config.staffPassword));
}

export function createSession() {
  const exp = Date.now() + config.sessionHours * 3600 * 1000;
  const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url');
  return { token: `${payload}.${sign(payload)}`, maxAge: config.sessionHours * 3600 * 1000 };
}

export function verifySession(token) {
  if (typeof token !== 'string') return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now();
  } catch {
    return false;
  }
}
