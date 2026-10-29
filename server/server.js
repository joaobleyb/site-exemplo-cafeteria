import { app } from './app.js';
import { config } from './config.js';
import { db } from './db.js';

const server = app.listen(config.port, () => {
  console.log(`[freijo] Site:   http://localhost:${config.port}`);
  console.log(`[freijo] Painel: http://localhost:${config.port}/painel`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
