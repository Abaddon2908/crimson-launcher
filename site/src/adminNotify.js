// Счётчик новых событий для админа: обращения в поддержку, сервера, пользователи, оплаты.
// Каждая часть сбрасывается, когда админ открывает соответствующий раздел.
const { db, settings, now } = require('./db');
const support = require('./support');

const KEYS = { servers: 'admin_seen_servers', users: 'admin_seen_users', orders: 'admin_seen_orders' };
// при первом запуске считаем «просмотренным» всё, что было до обновления
for (const k of Object.values(KEYS)) if (!settings.get(k)) settings.set(k, String(now()));
const seen = (k) => Number(settings.get(KEYS[k])) || 0;

function counts() {
  const c = {
    support: support.unreadCount(),
    // новые сервера и все, что ждут модерации
    servers: db.prepare(`SELECT COUNT(*) AS n FROM servers WHERE created > ? OR status = 'pending'`).get(seen('servers')).n,
    users: db.prepare('SELECT COUNT(*) AS n FROM users WHERE created > ?').get(seen('users')).n,
    // оплаты через ЮMoney и Heleket (выданные вручную не считаем)
    orders: db.prepare(`SELECT COUNT(*) AS n FROM orders WHERE status = 'paid' AND provider != 'manual' AND paid_at > ?`).get(seen('orders')).n,
  };
  c.total = c.support + c.servers + c.users + c.orders;
  return c;
}

function describe(c) {
  const parts = [];
  if (c.support) parts.push(`обращений в поддержку: ${c.support}`);
  if (c.servers) parts.push(`новых серверов: ${c.servers}`);
  if (c.users) parts.push(`новых пользователей: ${c.users}`);
  if (c.orders) parts.push(`оплат: ${c.orders}`);
  return parts.length ? `Новое — ${parts.join(', ')}` : 'Ничего нового';
}

const markSeen = (k) => settings.set(KEYS[k], String(now()));

module.exports = { counts, describe, markSeen };
