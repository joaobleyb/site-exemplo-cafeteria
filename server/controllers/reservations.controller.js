import { BREADS, PICKUP_TIMES, createReservation, listReservations, nextPickupDate, updateReservationStatus } from '../services/reservations.service.js';
import { dateLabel } from '../utils/time.js';

export function getOptions(req, res) {
  const date = nextPickupDate();
  res.set('Cache-Control', 'no-store');
  res.json({ breads: BREADS, times: PICKUP_TIMES, pickupDate: date, pickupLabel: dateLabel(date) });
}

export function postReservation(req, res) {
  res.status(201).json({ reservation: createReservation(req.body) });
}

export function listForStaff(req, res) {
  res.set('Cache-Control', 'no-store');
  res.json(listReservations(req.query.date));
}

export function patchReservation(req, res) {
  res.json({ reservation: updateReservationStatus(Number(req.params.id), req.body?.status) });
}
