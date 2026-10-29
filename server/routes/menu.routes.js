import { Router } from 'express';
import { getMenu } from '../controllers/menu.controller.js';

export const menuRoutes = Router();

menuRoutes.get('/', getMenu);
