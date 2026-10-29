import { Router } from 'express';
import { login, logout, me } from '../controllers/auth.controller.js';
import { rateLimit } from '../middlewares/rateLimit.js';

export const authRoutes = Router();

authRoutes.post('/login', rateLimit({ windowMs: 15 * 60_000, max: 8, message: 'Muitas tentativas de senha. Espere 15 minutos.' }), login);
authRoutes.post('/logout', logout);
authRoutes.get('/me', me);
