import { db } from '../db.js';
import { notFound } from '../utils/httpError.js';
import { publishStaff } from './events.service.js';

export const CATEGORIES = [
  { slug: 'paes', name: 'Pães', note: 'fermentação natural, 48 horas' },
  { slug: 'salgados', name: 'Salgados', note: 'direto do forno' },
  { slug: 'doces', name: 'Doces', note: 'feitos aqui' },
  { slug: 'cafes', name: 'Cafés', note: 'torra média, coado na hora' },
  { slug: 'bebidas', name: 'Bebidas', note: '' }
];

const toItem = r => ({
  id: r.id,
  category: r.category,
  name: r.name,
  description: r.description,
  priceCents: r.price_cents,
  available: r.available === 1
});

export function listMenu() {
  const rows = db.prepare('SELECT * FROM menu_items ORDER BY sort, id').all().map(toItem);
  return CATEGORIES.map(c => ({ ...c, items: rows.filter(r => r.category === c.slug) }));
}

export function getItemsByIds(ids) {
  if (!ids.length) return [];
  const marks = ids.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM menu_items WHERE id IN (${marks})`).all(...ids).map(toItem);
}

export function setAvailability(id, available) {
  const info = db.prepare('UPDATE menu_items SET available = ? WHERE id = ?').run(available ? 1 : 0, id);
  if (!info.changes) throw notFound('Item não encontrado.');
  const item = toItem(db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id));
  publishStaff('menu.updated', item);
  return item;
}
