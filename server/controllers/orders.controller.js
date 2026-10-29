import { createOrder, getOrderByToken, listOrdersForStaff, updateOrderStatus } from '../services/orders.service.js';
import { subscribeOrder } from '../services/events.service.js';

export function postOrder(req, res) {
  res.status(201).json({ order: createOrder(req.body) });
}

export function getOrder(req, res) {
  res.set('Cache-Control', 'no-store');
  res.json({ order: getOrderByToken(req.params.token) });
}

export function streamOrder(req, res) {
  subscribeOrder(req, res, req.params.token, getOrderByToken(req.params.token));
}

export function listOrders(req, res) {
  res.set('Cache-Control', 'no-store');
  res.json(listOrdersForStaff());
}

export function patchOrder(req, res) {
  res.json({ order: updateOrderStatus(Number(req.params.id), req.body?.status) });
}
