import { randomBytes } from 'node:crypto';
import { db, transaction } from '../db.js';
import { badRequest, notFound } from '../utils/httpError.js';
import { isoNow, localNow } from '../utils/time.js';
import { getItemsByIds } from './menu.service.js';
import { publishOrder, publishStaff } from './events.service.js';

export const ORDER_STATUSES = ['novo', 'preparando', 'pronto', 'entregue', 'cancelado'];
const ACTIVE = ['novo', 'preparando', 'pronto'];
const MAX_LINES = 30;
const MAX_QTY = 20;

const cleanText = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

function loadItems(orderIds) {
  if (!orderIds.length) return new Map();
  const marks = orderIds.map(() => '?').join(',');
  const rows = db.prepare(`SELECT order_id, name, price_cents, qty FROM order_items WHERE order_id IN (${marks}) ORDER BY id`).all(...orderIds);
  const byOrder = new Map();
  for (const r of rows) {
    if (!byOrder.has(r.order_id)) byOrder.set(r.order_id, []);
    byOrder.get(r.order_id).push({ name: r.name, priceCents: r.price_cents, qty: r.qty });
  }
  return byOrder;
}

function publicView(o, items) {
  return {
    token: o.token,
    number: o.number,
    type: o.type,
    table: o.table_number,
    name: o.customer_name,
    status: o.status,
    totalCents: o.total_cents,
    items,
    createdAt: o.created_at,
    updatedAt: o.updated_at
  };
}

function staffView(o, items) {
  return { id: o.id, ...publicView(o, items), note: o.note, serviceDate: o.service_date };
}

function parseLines(raw) {
  if (!Array.isArray(raw) || !raw.length) throw badRequest('Escolha pelo menos um item do cardápio.');
  if (raw.length > MAX_LINES) throw badRequest('Pedido grande demais. Fale com a gente no balcão.');
  const qtyById = new Map();
  for (const line of raw) {
    const id = Number(line?.id);
    const qty = Number(line?.qty);
    if (!Number.isInteger(id) || id < 1 || !Number.isInteger(qty) || qty < 1) throw badRequest('Algum item do pedido está inválido.');
    qtyById.set(id, (qtyById.get(id) || 0) + qty);
  }
  for (const qty of qtyById.values()) if (qty > MAX_QTY) throw badRequest(`Até ${MAX_QTY} unidades de cada item por pedido.`);
  return qtyById;
}

export function createOrder(input) {
  const type = input?.type === 'mesa' ? 'mesa' : input?.type === 'balcao' ? 'balcao' : null;
  if (!type) throw badRequest('Diga se o pedido é para a mesa ou para retirar no balcão.');

  let table = null;
  if (type === 'mesa') {
    table = Number(input.table);
    if (!Number.isInteger(table) || table < 1 || table > 99) throw badRequest('Informe o número da mesa, de 1 a 99.');
  }
  const name = cleanText(input.name, 40);
  if (type === 'balcao' && name.length < 2) throw badRequest('Diga seu nome para a gente chamar no balcão.');
  const note = cleanText(input.note, 200);

  const qtyById = parseLines(input.items);
  const menuItems = getItemsByIds([...qtyById.keys()]);
  if (menuItems.length !== qtyById.size) throw badRequest('Algum item não existe mais no cardápio. Atualize a página.');
  const missing = menuItems.filter(i => !i.available);
  if (missing.length) throw badRequest(`Acabou agora: ${missing.map(i => i.name).join(', ')}. Tire do pedido e envie de novo.`);

  const lines = menuItems.map(i => ({ menuItemId: i.id, name: i.name, priceCents: i.priceCents, qty: qtyById.get(i.id) }));
  const total = lines.reduce((s, l) => s + l.priceCents * l.qty, 0);
  const now = isoNow();
  const serviceDate = localNow().date;
  const token = randomBytes(12).toString('base64url');

  const order = transaction(() => {
    const number = db.prepare('SELECT COALESCE(MAX(number), 0) + 1 AS n FROM orders WHERE service_date = ?').get(serviceDate).n;
    const { lastInsertRowid } = db.prepare(`INSERT INTO orders (token, number, service_date, type, table_number, customer_name, note, status, total_cents, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'novo', ?, ?, ?)`).run(token, number, serviceDate, type, table, name || null, note || null, total, now, now);
    const insertLine = db.prepare('INSERT INTO order_items (order_id, menu_item_id, name, price_cents, qty) VALUES (?, ?, ?, ?, ?)');
    for (const l of lines) insertLine.run(lastInsertRowid, l.menuItemId, l.name, l.priceCents, l.qty);
    return db.prepare('SELECT * FROM orders WHERE id = ?').get(lastInsertRowid);
  });

  const items = lines.map(({ name: n, priceCents, qty }) => ({ name: n, priceCents, qty }));
  publishStaff('order.created', staffView(order, items));
  return publicView(order, items);
}

export function getOrderByToken(token) {
  if (typeof token !== 'string' || !/^[\w-]{10,40}$/.test(token)) throw notFound('Pedido não encontrado.');
  const o = db.prepare('SELECT * FROM orders WHERE token = ?').get(token);
  if (!o) throw notFound('Pedido não encontrado.');
  return publicView(o, loadItems([o.id]).get(o.id) || []);
}

export function listOrdersForStaff() {
  const today = localNow().date;
  const rows = db.prepare(`SELECT * FROM orders
    WHERE service_date = ? OR status IN (${ACTIVE.map(() => '?').join(',')})
    ORDER BY created_at`).all(today, ...ACTIVE);
  const items = loadItems(rows.map(r => r.id));
  return { today, orders: rows.map(r => staffView(r, items.get(r.id) || [])) };
}

export function updateOrderStatus(id, status) {
  if (!ORDER_STATUSES.includes(status)) throw badRequest('Status inválido.');
  const info = db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(status, isoNow(), id);
  if (!info.changes) throw notFound('Pedido não encontrado.');
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  const items = loadItems([o.id]).get(o.id) || [];
  publishStaff('order.updated', staffView(o, items));
  publishOrder(o.token, publicView(o, items));
  return staffView(o, items);
}
