import { Router } from 'express';
import { getOptions, postReservation } from '../controllers/reservations.controller.js';
import { rateLimit } from '../middlewares/rateLimit.js';

export const reservationsRoutes = Router();

reservationsRoutes.get('/options', getOptions);
reservationsRoutes.post('/', rateLimit({ windowMs: 10 * 60_000, max: 6, message: 'Muitas reservas seguidas. Espere alguns minutos ou chame a gente no WhatsApp.' }), postReservation);
