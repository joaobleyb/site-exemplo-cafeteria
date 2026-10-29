import { randomInt } from 'node:crypto';
import { config } from '../config.js';
import { db } from '../db.js';
import { badRequest, notFound } from '../utils/httpError.js';
import { addDays, dateLabel, isoNow, isYmd, localNow } from '../utils/time.js';
import { publishStaff } from './events.service.js';

export const BREADS = ['Fermentação natural', 'Integral com sementes', 'Pão de queijo, uma dúzia', 'Croissant, quatro unidades'];
export const PICKUP_TIMES = ['7h', '8h', '9h', '10h'];
export const RESERVATION_STATUSES = ['reservado', 'separado', 'retirado', 'cancelado'];
const CODE_CHARS = 'ACDEFGHJKMNPQRTUVWXY34679';

const toView = r => ({
  id: r.id,
  code: r.code,
  name: r.name,
  whatsapp: r.whatsapp,
  bread: r.bread,
  pickupDate: r.pickup_date,
  pickupLabel: dateLabel(r.pickup_date),
  pickupTime: r.pickup_time,
  status: r.status,
  createdAt: r.created_at
});

function newCode() {
  for (;;) {
    let code = 'R-';
    for (let i = 0; i < 4; i++) code += CODE_CHARS[randomInt(CODE_CHARS.length)];
    if (!db.prepare('SELECT 1 FROM reservations WHERE code = ?').get(code)) return code;
  }
}

export function nextPickupDate(now = localNow()) {
  return addDays(now.date, now.hour < config.reservationCutoffHour ? 1 : 2);
}

export function createReservation(input) {
  const name = typeof input?.name === 'string' ? input.name.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
  if (name.length < 2) throw badRequest('Diga seu nome, do jeito que chamamos no balcão.');
  const whatsapp = String(input?.whatsapp ?? '').replace(/\D/g, '');
  if (whatsapp.length < 10 || whatsapp.length > 11) throw badRequest('Confira o WhatsApp, com DDD. Ex.: (31) 90000-0000.');
  if (!BREADS.includes(input?.bread)) throw badRequest('Escolha um dos pães da lista.');
  if (!PICKUP_TIMES.includes(input?.time)) throw badRequest('Escolha um horário de retirada entre 7h e 10h.');

  const pickupDate = nextPickupDate();
  const now = isoNow();
  const { lastInsertRowid } = db.prepare(`INSERT INTO reservations (code, name, whatsapp, bread, pickup_date, pickup_time, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'reservado', ?, ?)`).run(newCode(), name, whatsapp, input.bread, pickupDate, input.time, now, now);
  const view = toView(db.prepare('SELECT * FROM reservations WHERE id = ?').get(lastInsertRowid));
  publishStaff('reservation.created', view);
  return { code: view.code, name: view.name, bread: view.bread, pickupDate: view.pickupDate, pickupLabel: view.pickupLabel, pickupTime: view.pickupTime };
}

export function listReservations(date) {
  const day = isYmd(date) ? date : nextPickupDate();
  const rows = db.prepare(`SELECT * FROM reservations WHERE pickup_date = ?
    ORDER BY CAST(REPLACE(pickup_time, 'h', '') AS INTEGER), created_at`).all(day).map(toView);
  const totals = BREADS.map(bread => ({
    bread,
    count: rows.filter(r => r.bread === bread && r.status !== 'cancelado').length
  })).filter(t => t.count);
  return { date: day, label: dateLabel(day), today: localNow().date, reservations: rows, totals };
}

export function updateReservationStatus(id, status) {
  if (!RESERVATION_STATUSES.includes(status)) throw badRequest('Status inválido.');
  const info = db.prepare('UPDATE reservations SET status = ?, updated_at = ? WHERE id = ?').run(status, isoNow(), id);
  if (!info.changes) throw notFound('Reserva não encontrada.');
  const view = toView(db.prepare('SELECT * FROM reservations WHERE id = ?').get(id));
  publishStaff('reservation.updated', view);
  return view;
}
