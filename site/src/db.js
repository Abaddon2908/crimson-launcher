// База данных: встроенный SQLite из Node.js (без нативных зависимостей)
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'monitoring.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
// нижний регистр с поддержкой кириллицы (встроенный lower() в SQLite — только латиница)
db.function('ulower', { deterministic: true }, (s) => (s == null ? null : String(s).toLowerCase()));

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  pass TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',      -- user | admin
  banned INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS servers (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  discord TEXT NOT NULL DEFAULT '',
  banner TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  reject_reason TEXT NOT NULL DEFAULT '',
  online INTEGER NOT NULL DEFAULT 0,
  players INTEGER NOT NULL DEFAULT 0,
  max_players INTEGER NOT NULL DEFAULT 0,
  motd TEXT NOT NULL DEFAULT '',
  favicon TEXT NOT NULL DEFAULT '',
  ping_ms INTEGER NOT NULL DEFAULT 0,
  game_version TEXT NOT NULL DEFAULT '',
  last_ping INTEGER NOT NULL DEFAULT 0,
  vote_webhook TEXT NOT NULL DEFAULT '',
  vote_secret TEXT NOT NULL DEFAULT '',
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pings (
  server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  ts INTEGER NOT NULL,
  online INTEGER NOT NULL,
  players INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS pings_idx ON pings(server_id, ts);
CREATE TABLE IF NOT EXISTS votes (
  id INTEGER PRIMARY KEY,
  server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  ip TEXT NOT NULL,
  ts INTEGER NOT NULL,
  delivered INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS votes_idx ON votes(server_id, ts);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  kind TEXT NOT NULL,                     -- promo | banner | highlight
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL,                 -- рубли
  days INTEGER NOT NULL,
  slots INTEGER NOT NULL DEFAULT 0,       -- 0 = без ограничения
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  server_id INTEGER REFERENCES servers(id) ON DELETE SET NULL,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  amount INTEGER NOT NULL,
  days INTEGER NOT NULL,
  provider TEXT NOT NULL DEFAULT '',      -- yoomoney | heleket | manual
  provider_ref TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending', -- pending | paid | cancelled
  banner_title TEXT NOT NULL DEFAULT '',
  banner_text TEXT NOT NULL DEFAULT '',
  banner_image TEXT NOT NULL DEFAULT '',
  banner_url TEXT NOT NULL DEFAULT '',
  created INTEGER NOT NULL,
  paid_at INTEGER,
  starts INTEGER,
  ends INTEGER
);
CREATE TABLE IF NOT EXISTS news (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  published INTEGER NOT NULL DEFAULT 1,
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);

// Тарифы по умолчанию (меняются в админке)
const DEFAULT_PRODUCTS = [
  ['promo_7', 'promo', 'PROMO в топе — 7 дней', 'Сервер закреплён над топом на сайте и в NLauncher с меткой PROMO.', 990, 7, 5, 1],
  ['promo_30', 'promo', 'PROMO в топе — 30 дней', 'То же, что и PROMO на неделю, но на месяц и выгоднее.', 2990, 30, 5, 2],
  ['banner_7', 'banner', 'Баннер в лаунчере — 7 дней', 'Большой баннер на главной NLauncher и на сайте. Один слот, по очереди.', 1990, 7, 1, 3],
  ['highlight_30', 'highlight', 'Выделение цветом — 30 дней', 'Карточка сервера выделена в общем топе.', 490, 30, 0, 4],
  ['ingame_7', 'ingame', 'Сервер в игре — 7 дней', 'Ваш сервер первым в списке «Сетевая игра» у всех игроков NLauncher — прямо внутри Minecraft.', 1490, 7, 3, 5],
  ['ingame_30', 'ingame', 'Сервер в игре — 30 дней', 'То же на месяц: сервер в списке «Сетевая игра» у каждого игрока NLauncher.', 4490, 30, 3, 6],
];

/** Виды услуг (используются в кабинете, админке и ленте лаунчера) */
const KINDS = {
  promo: { label: 'PROMO в топе', short: 'PROMO' },
  banner: { label: 'Баннер в лаунчере', short: 'Баннер' },
  highlight: { label: 'Выделение цветом', short: 'Выделение' },
  ingame: { label: 'Сервер в игре', short: 'В игре' },
  points: { label: 'Промо-баллы', short: 'Баллы' },
};

db.exec(`
CREATE TABLE IF NOT EXISTS admin_log (
  id INTEGER PRIMARY KEY,
  admin_id INTEGER,
  action TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  ts INTEGER NOT NULL
);
`);
// миграции существующих баз
/** Добавляет недостающие колонки в существующие базы (обновление без потери данных) */
function addColumns(table, cols) {
  const have = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  for (const [name, def] of Object.entries(cols)) if (!have.includes(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
}
addColumns('orders', {
  note: `TEXT NOT NULL DEFAULT ''`,
  points: 'INTEGER NOT NULL DEFAULT 0',   // промо-баллы
  color: `TEXT NOT NULL DEFAULT ''`,      // цвет выделения
  coupon: `TEXT NOT NULL DEFAULT ''`,
  discount: 'INTEGER NOT NULL DEFAULT 0', // скидка в рублях (пакет + купон)
});
addColumns('servers', {
  votifier_host: `TEXT NOT NULL DEFAULT ''`,
  votifier_port: 'INTEGER NOT NULL DEFAULT 8192',
  votifier_key: `TEXT NOT NULL DEFAULT ''`,
  votifier_token: `TEXT NOT NULL DEFAULT ''`,
  version_min: `TEXT NOT NULL DEFAULT ''`,
  version_max: `TEXT NOT NULL DEFAULT ''`,
});
addColumns('votes', { rating: 'INTEGER NOT NULL DEFAULT 5' });
{
  // метка тарифа («Выгодно», «Хит»…); при первом добавлении колонки ставим «Выгодно» на PROMO от 30 дней, как было раньше
  const fresh = !db.prepare('PRAGMA table_info(products)').all().some((c) => c.name === 'label');
  addColumns('products', { label: `TEXT NOT NULL DEFAULT ''` });
  if (fresh) db.prepare(`UPDATE products SET label = 'Выгодно' WHERE kind = 'promo' AND days >= 30`).run();
}
db.exec(`
CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  percent INTEGER NOT NULL,
  max_uses INTEGER NOT NULL DEFAULT 0,  -- 0 = без ограничения
  used INTEGER NOT NULL DEFAULT 0,
  expires INTEGER,                      -- null = бессрочно
  active INTEGER NOT NULL DEFAULT 1,
  note TEXT NOT NULL DEFAULT '',
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS server_daily (
  server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  copies INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (server_id, day)
);
`);
const insP = db.prepare('INSERT OR IGNORE INTO products (code, kind, title, description, price, days, slots, sort) VALUES (?,?,?,?,?,?,?,?)');
for (const p of DEFAULT_PRODUCTS) insP.run(...p);

const DEFAULT_SETTINGS = {
  site_name: 'NLauncher',
  site_url: process.env.SITE_URL || 'http://localhost:3000',
  points_label: 'Выгодно',
  yoomoney_wallet: '',
  yoomoney_secret: '',
  heleket_merchant: '',
  heleket_api_key: '',
  default_banner_title: 'Здесь может быть ваш сервер',
  default_banner_text: 'Баннер на главной NLauncher — тысячи игроков видят его при каждом запуске.',
};
const insS = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insS.run(k, v);
// Старые названия по умолчанию меняем на NLauncher (NeoDev — только «при поддержке»)
db.prepare("UPDATE settings SET value = ? WHERE key = 'site_name' AND (value LIKE '%NeoDev%' OR value LIKE '%neodev%' OR value = 'Мониторинг Minecraft серверов')").run(DEFAULT_SETTINGS.site_name);

const now = () => Date.now();
const DAY = 86400000;

const settings = {
  get(key) { return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? ''; },
  all() { return Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((r) => [r.key, r.value])); },
  set(key, value) { db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value ?? '')); },
};

/** Голоса за текущий календарный месяц */
function monthStart() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); }

/** Список серверов для топа: промо сверху, затем по голосам за месяц.
 *  Поиск и фильтр по режиму — в JS: SQLite не умеет без учёта регистра для кириллицы.
 *  rank — место в общем топе (не в отфильтрованном списке). */
function topServers({ q = '', tag = '', limit = 100 } = {}) {
  const t = now();
  const rows = db.prepare(`
    SELECT s.*,
      (SELECT COUNT(*) FROM votes v WHERE v.server_id = s.id AND v.ts >= ?) AS votes,
      EXISTS (SELECT 1 FROM orders o WHERE o.server_id = s.id AND o.status = 'paid' AND o.kind = 'promo' AND o.starts <= ? AND o.ends > ?) AS promo,
      EXISTS (SELECT 1 FROM orders o WHERE o.server_id = s.id AND o.status = 'paid' AND o.kind = 'highlight' AND o.starts <= ? AND o.ends > ?) AS highlight,
      (SELECT o.color FROM orders o WHERE o.server_id = s.id AND o.status = 'paid' AND o.kind = 'highlight' AND o.starts <= ? AND o.ends > ? ORDER BY o.ends DESC LIMIT 1) AS hl_color,
      (SELECT COALESCE(SUM(o.points), 0) FROM orders o WHERE o.server_id = s.id AND o.status = 'paid' AND o.kind = 'points' AND o.starts <= ? AND o.ends > ?) AS points
    FROM servers s
    WHERE s.status = 'approved'
    -- PROMO-места сверху, затем по сумме активных промо-баллов, затем по голосам
    ORDER BY promo DESC, points DESC, votes DESC, s.online DESC, s.players DESC`).all(monthStart(), t, t, t, t, t, t, t, t);
  const ql = String(q).trim().toLowerCase();
  const tl = String(tag).trim().toLowerCase();
  return rows
    .map((r, i) => ({ ...r, rank: i + 1, tagList: r.tags.split(',').map((x) => x.trim()).filter(Boolean) }))
    .filter((r) => !ql || [r.name, r.address, r.description, r.tags].some((v) => String(v || '').toLowerCase().includes(ql)))
    .filter((r) => !tl || r.tagList.some((x) => x.toLowerCase() === tl))
    .slice(0, limit);
}

function activeBanner() {
  const t = now();
  return db.prepare(`SELECT o.*, s.address, s.name AS server_name FROM orders o LEFT JOIN servers s ON s.id = o.server_id
    WHERE o.status = 'paid' AND o.kind = 'banner' AND o.starts <= ? AND o.ends > ? ORDER BY o.starts LIMIT 1`).get(t, t);
}

/** Когда освободится слот для продукта (для очереди баннеров / ограниченных промо) */
function nextFreeStart(product) {
  const t = now();
  if (!product.slots) return t;
  const busy = db.prepare(`SELECT ends FROM orders WHERE product_id IN (SELECT id FROM products WHERE kind = ?) AND status = 'paid' AND ends > ? ORDER BY ends`).all(product.kind, t);
  if (busy.length < product.slots) return t;
  return busy[busy.length - product.slots].ends;
}

/** Отметить заказ оплаченным (идемпотентно) и рассчитать период показа.
 *  startNow — начать сразу, без очереди (выдача администратором). */
function markPaid(orderId, provider, ref = '', { startNow = false } = {}) {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!o) return null;
  if (o.status === 'paid') return o;
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(o.product_id)
    || db.prepare('SELECT * FROM products WHERE kind = ? AND active = 1 ORDER BY slots DESC LIMIT 1').get(o.kind)
    || { kind: o.kind, slots: 0 };
  // продление: если у сервера уже есть активный заказ того же типа — начинаем после него
  const last = db.prepare(`SELECT MAX(ends) AS e FROM orders WHERE server_id = ? AND kind = ? AND status = 'paid'`).get(o.server_id, o.kind)?.e || 0;
  // промо-баллы складываются: каждая покупка действует со своего момента, без очереди
  const starts = startNow || o.kind === 'points' ? now() : Math.max(now(), last, nextFreeStart(product));
  const ends = starts + o.days * DAY;
  db.prepare(`UPDATE orders SET status = 'paid', provider = ?, provider_ref = ?, paid_at = ?, starts = ?, ends = ? WHERE id = ?`)
    .run(provider, String(ref), now(), starts, ends, orderId);
  if (o.coupon) db.prepare('UPDATE coupons SET used = used + 1 WHERE code = ?').run(o.coupon); // купон засчитывается при оплате
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
}

/** Активные услуги сервера: { promo: ends, banner: ends, ... } */
function activeServices(serverId) {
  const t = now();
  const out = {};
  for (const r of db.prepare(`SELECT kind, MAX(ends) AS ends FROM orders WHERE server_id = ? AND status = 'paid' AND starts <= ? AND ends > ? GROUP BY kind`).all(serverId, t, t)) out[r.kind] = r.ends;
  return out;
}

/** Сервера с активной услугой «в игре» — для лаунчера */
function ingameServers() {
  const t = now();
  return db.prepare(`SELECT s.id, s.name, s.address, s.favicon, MIN(o.starts) AS since FROM orders o JOIN servers s ON s.id = o.server_id
    WHERE o.status = 'paid' AND o.kind = 'ingame' AND o.starts <= ? AND o.ends > ? AND s.status = 'approved'
    GROUP BY s.id ORDER BY since`).all(t, t);
}

function logAdmin(adminId, action, details = '') {
  db.prepare('INSERT INTO admin_log (admin_id, action, details, ts) VALUES (?, ?, ?, ?)').run(adminId || null, action, String(details).slice(0, 500), now());
}

module.exports = { db, settings, now, DAY, KINDS, topServers, activeBanner, markPaid, monthStart, nextFreeStart, activeServices, ingameServers, logAdmin };
