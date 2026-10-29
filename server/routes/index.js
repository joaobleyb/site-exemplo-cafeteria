import { Router } from 'express';
import { apiNotFound } from '../middlewares/errorHandler.js';
import { requireJson } from '../middlewares/requireJson.js';
import { authRoutes } from './auth.routes.js';
import { menuRoutes } from './menu.routes.js';
import { ordersRoutes } from './orders.routes.js';
import { reservationsRoutes } from './reservations.routes.js';
import { staffRoutes } from './staff.routes.js';

export const apiRoutes = Router();

apiRoutes.use(requireJson);
apiRoutes.use('/menu', menuRoutes);
apiRoutes.use('/orders', ordersRoutes);
apiRoutes.use('/reservations', reservationsRoutes);
apiRoutes.use('/auth', authRoutes);
apiRoutes.use('/staff', staffRoutes);
apiRoutes.use(apiNotFound);
