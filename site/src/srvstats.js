// Статистика сервера для владельца: просмотры страницы и копирования IP по дням.
// Повторы от одного посетителя за день не считаются; боты отсекаются по User-Agent.
const { db, now, DAY } = require('./db');

const MSK = 3 * 3600 * 1000;
const dayKey = (t = now()) => new Date(t + MSK).toISOString().slice(0, 10);
const BOT = /bot|crawl|spider|slurp|yandex|google|bing|baidu|duckduck|facebookexternalhit|telegram|vkshare|preview|headless|lighthouse/i;

const seen = new Map(); // `${field}:${server}:${visitor}:${day}` → 1 (чистится раз в сутки)
setInterval(() => seen.clear(), DAY).unref();

/**
 * @param {number} serverId
 * @param {'views'|'copies'} field
 * @param {{visitor:string, ua:string}} who
 */
function track(serverId, field, { visitor, ua }) {
  if (!serverId || !['views', 'copies'].includes(field)) return false;
  if (!ua || BOT.test(ua)) return false;
  const day = dayKey();
  const key = `${field}:${serverId}:${visitor}:${day}`;
  if (seen.has(key)) return false;
  seen.set(key, 1);
  db.prepare(`INSERT INTO server_daily (server_id, day, ${field}) VALUES (?, ?, 1)
    ON CONFLICT(server_id, day) DO UPDATE SET ${field} = ${field} + 1`).run(serverId, day);
  return true;
}

/** Последние N дней: просмотры, копирования IP, голоса и отметка активной рекламы */
function history(serverId, days = 30) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const t = now() - i * DAY;
    const day = dayKey(t);
    const r = db.prepare('SELECT views, copies FROM server_daily WHERE server_id = ? AND day = ?').get(serverId, day) || { views: 0, copies: 0 };
    const from = Date.parse(`${day}T00:00:00Z`) - MSK;
    const votes = db.prepare('SELECT COUNT(*) AS n FROM votes WHERE server_id = ? AND ts >= ? AND ts < ?').get(serverId, from, from + DAY).n;
    const ads = db.prepare(`SELECT GROUP_CONCAT(DISTINCT kind) AS k FROM orders WHERE server_id = ? AND status = 'paid' AND starts < ? AND ends > ?`).get(serverId, from + DAY, from).k;
    out.push({ day, views: r.views, copies: r.copies, votes, ads: ads ? ads.split(',') : [] });
  }
  return out;
}

function totals(serverId) {
  const month = dayKey().slice(0, 7);
  const r = db.prepare(`SELECT COALESCE(SUM(views), 0) AS views, COALESCE(SUM(copies), 0) AS copies FROM server_daily WHERE server_id = ? AND day LIKE ?`).get(serverId, `${month}%`);
  const today = db.prepare('SELECT views, copies FROM server_daily WHERE server_id = ? AND day = ?').get(serverId, dayKey()) || { views: 0, copies: 0 };
  return { monthViews: r.views, monthCopies: r.copies, todayViews: today.views, todayCopies: today.copies };
}

module.exports = { track, history, totals, dayKey };
