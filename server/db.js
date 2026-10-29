import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(config.dataDir, 'freijo.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 3000;

  CREATE TABLE IF NOT EXISTS menu_items (
    id INTEGER PRIMARY KEY,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    available INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    number INTEGER NOT NULL,
    service_date TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('mesa', 'balcao')),
    table_number INTEGER,
    customer_name TEXT,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'novo',
    total_cents INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS orders_by_day ON orders (service_date, status);

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    menu_item_id INTEGER,
    name TEXT NOT NULL,
    price_cents INTEGER NOT NULL,
    qty INTEGER NOT NULL CHECK (qty > 0)
  );
  CREATE INDEX IF NOT EXISTS order_items_by_order ON order_items (order_id);

  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    whatsapp TEXT NOT NULL,
    bread TEXT NOT NULL,
    pickup_date TEXT NOT NULL,
    pickup_time TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'reservado',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS reservations_by_day ON reservations (pickup_date);
`);

const SEED = [
  ['paes', 'Pão de fermentação natural, inteiro', 'Casca crocante, miolo aberto. Dura três dias sem endurecer.', 2800],
  ['paes', 'Meio pão de fermentação natural', 'O mesmo pão, para quem mora sozinho.', 1500],
  ['paes', 'Pão integral com sementes', 'Girassol, linhaça e gergelim.', 3200],
  ['paes', 'Brioche da casa', 'Manteiga e ovos caipiras. Macio por dentro.', 2400],
  ['salgados', 'Pão de queijo da casa', 'Sai do forno a cada 30 minutos.', 600],
  ['salgados', 'Pão na chapa', 'Fermentação natural e manteiga de verdade.', 1000],
  ['salgados', 'Torrada com ricota e mel', 'Ricota fresca, mel de flor de laranjeira.', 1800],
  ['salgados', 'Misto quente no brioche', 'Queijo minas padrão e presunto cozido.', 2200],
  ['doces', 'Croissant de manteiga', 'Três dias de massa, folhado de verdade.', 1400],
  ['doces', 'Bolo de fubá com goiabada, fatia', 'Receita de vó, goiabada cascão.', 1200],
  ['doces', 'Rosca de canela', 'Fermentação natural e açúcar mascavo.', 1300],
  ['doces', 'Pudim de leite, fatia', 'Sem furinho, com calda de caramelo.', 1400],
  ['cafes', 'Café coado no pano', 'Doce e encorpado, xícara por xícara.', 900],
  ['cafes', 'Espresso', 'Curto e cremoso.', 800],
  ['cafes', 'Pingado na caneca de ágata', 'Café coado com leite quente.', 1000],
  ['cafes', 'Cappuccino da casa', 'Só café, leite e espuma. Sem canela em pó.', 1400],
  ['bebidas', 'Chocolate quente', 'Cacau 50%, leite integral ou vegetal.', 1500],
  ['bebidas', 'Suco de laranja', 'Espremido na hora.', 1200],
  ['bebidas', 'Chá de capim-santo', 'Folhas frescas, sem saquinho.', 800]
];

if (db.prepare('SELECT COUNT(*) AS n FROM menu_items').get().n === 0) {
  const insert = db.prepare('INSERT INTO menu_items (category, name, description, price_cents, sort) VALUES (?, ?, ?, ?, ?)');
  transaction(() => SEED.forEach((row, i) => insert.run(...row, i)));
}

export function transaction(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
