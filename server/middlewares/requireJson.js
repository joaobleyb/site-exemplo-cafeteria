import { HttpError } from '../utils/httpError.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function requireJson(req, res, next) {
  if (MUTATING.has(req.method) && !req.is('application/json')) {
    return next(new HttpError(415, 'Envie os dados em JSON.'));
  }
  next();
}
