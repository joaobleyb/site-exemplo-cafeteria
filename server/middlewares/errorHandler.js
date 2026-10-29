import { HttpError } from '../utils/httpError.js';

export function apiNotFound(req, res, next) {
  next(new HttpError(404, 'Endereço da API não encontrado.'));
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Os dados enviados estão em um formato inválido.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Os dados enviados são grandes demais.' });
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  console.error('[freijo]', err);
  res.status(500).json({ error: 'Algo deu errado do nosso lado. Tente de novo em instantes.' });
}
