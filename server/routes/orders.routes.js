import { Router } from 'express';
import { getOrder, postOrder, streamOrder } from '../controllers/orders.controller.js';
import { rateLimit } from '../middlewares/rateLimit.js';

export const ordersRoutes = Router();

ordersRoutes.post('/', rateLimit({ windowMs: 60_000, max: 8, message: 'Muitos pedidos seguidos. Espere um minuto ou chame a gente no balcão.' }), postOrder);
ordersRoutes.get('/:token', getOrder);
ordersRoutes.get('/:token/stream', streamOrder);
