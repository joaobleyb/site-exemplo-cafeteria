import express from 'express';
import { config } from './config.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { securityHeaders } from './middlewares/securityHeaders.js';
import { apiRoutes } from './routes/index.js';

export const app = express();

app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', 1);

app.use(securityHeaders);
app.use(express.json({ limit: '20kb' }));
app.use('/api', apiRoutes);
app.use(express.static(config.publicDir, { extensions: ['html'], maxAge: config.production ? '1h' : 0 }));
app.use(errorHandler);
