import { Router } from 'express';
import { staffStream } from '../controllers/events.controller.js';
import { getMenu, patchItem } from '../controllers/menu.controller.js';
import { listOrders, patchOrder } from '../controllers/orders.controller.js';
import { listForStaff, patchReservation } from '../controllers/reservations.controller.js';
import { requireStaff } from '../middlewares/requireStaff.js';

export const staffRoutes = Router();

staffRoutes.use(requireStaff);
staffRoutes.get('/stream', staffStream);
staffRoutes.get('/orders', listOrders);
staffRoutes.patch('/orders/:id', patchOrder);
staffRoutes.get('/reservations', listForStaff);
staffRoutes.patch('/reservations/:id', patchReservation);
staffRoutes.get('/menu', getMenu);
staffRoutes.patch('/menu/:id', patchItem);
