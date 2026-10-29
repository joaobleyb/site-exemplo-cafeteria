import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

try {
  process.loadEnvFile(path.join(root, '.env'));
} catch {
  // no .env file: environment variables or defaults are used
}

const production = process.env.NODE_ENV === 'production';

let staffPassword = process.env.STAFF_PASSWORD || '';
if (!staffPassword) {
  if (production) throw new Error('Defina STAFF_PASSWORD no ambiente antes de iniciar em produção.');
  staffPassword = 'freijo-dev';
  console.warn('[freijo] STAFF_PASSWORD não definida. Usando a senha de desenvolvimento "freijo-dev".');
}

export const config = {
  root,
  publicDir: path.join(root, 'public'),
  dataDir: process.env.DATA_DIR || path.join(root, 'data'),
  port: Number(process.env.PORT) || 3000,
  production,
  trustProxy: process.env.TRUST_PROXY === '1',
  staffPassword,
  sessionSecret: process.env.SESSION_SECRET || randomBytes(32).toString('hex'),
  sessionHours: 12,
  timeZone: 'America/Sao_Paulo',
  reservationCutoffHour: 20
};
