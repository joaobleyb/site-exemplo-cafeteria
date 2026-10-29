import { listMenu, setAvailability } from '../services/menu.service.js';
import { badRequest } from '../utils/httpError.js';

export function getMenu(req, res) {
  res.set('Cache-Control', 'no-store');
  res.json({ categories: listMenu() });
}

export function patchItem(req, res) {
  if (typeof req.body?.available !== 'boolean') throw badRequest('Informe se o item está disponível.');
  res.json({ item: setAvailability(Number(req.params.id), req.body.available) });
}
