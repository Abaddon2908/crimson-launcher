// Честная статистика NLauncher: онлайн лаунчера, игроки в игре, уникальные за день, запуски, пики.
// Лаунчер раз в 2 минуты присылает анонимный случайный ID (без ника и без IP в базе).
const crypto = require('crypto');
const { db, settings, now, DAY } = require('./db');

db.exec(`
CREATE TABLE IF NOT EXISTS launcher_clients (
  id TEXT PRIMARY KEY,          -- sha256(случайный ID лаунчера + соль сайта)
  last_seen INTEGER NOT NULL,
  in_game INTEGER NOT NULL DEFAULT 0,
  version TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS launcher_day_clients (day TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY (day, id));
CREATE TABLE IF NOT EXISTS launcher_daily (
  day TEXT PRIMARY KEY,         -- YYYY-MM-DD (UTC+3, Москва)
  uniques INTEGER NOT NULL DEFAULT 0,
  launches INTEGER NOT NULL DEFAULT 0,
  peak INTEGER NOT NULL DEFAULT 0,
  peak_ingame INTEGER NOT NULL DEFAULT 0,
  peak_servers INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS stats_snapshots (
  ts INTEGER NOT NULL,
  launcher INTEGER NOT NULL,
  in_game INTEGER NOT NULL,
  servers INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS stats_snapshots_ts ON stats_snapshots(ts);
CREATE TABLE IF NOT EXISTS download_daily (day TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS download_day_ips (day TEXT NOT NULL, ip TEXT NOT NULL, PRIMARY KEY (day, ip));
`);

const ONLINE_WINDOW = 5 * 60 * 1000; // лаунчер считается онлайн 5 минут после последнего сигнала
const MSK = 3 * 3600 * 1000;
const dayKey = (t = now()) => new Date(t + MSK).toISOString().slice(0, 10);
let salt = settings.get('stats_salt');
if (!salt) { salt = crypto.randomBytes(16).toString('hex'); settings.set('stats_salt', salt); }
const hashId = (id) => crypto.createHash('sha256').update(`${salt}:${id}`).digest('hex').slice(0, 32);

function serversOnline() {
  return db.prepare(`SELECT COALESCE(SUM(players), 0) AS p, COUNT(*) AS n FROM servers WHERE status = 'approved' AND online = 1`).get();
}

function current() {
  const since = now() - ONLINE_WINDOW;
  const r = db.prepare('SELECT COUNT(*) AS online, COALESCE(SUM(in_game), 0) AS in_game FROM launcher_clients WHERE last_seen > ?').get(since);
  return { online: r.online, inGame: r.in_game };
}

function bumpDaily(fields) {
  const day = dayKey();
  db.prepare('INSERT OR IGNORE INTO launcher_daily (day) VALUES (?)').run(day);
  for (const [k, v] of Object.entries(fields)) {
    if (k === 'launches') db.prepare('UPDATE launcher_daily SET launches = launches + ? WHERE day = ?').run(v, day);
    else db.prepare(`UPDATE launcher_daily SET ${k} = MAX(${k}, ?) WHERE day = ?`).run(v, day);
  }
}

/** Сигнал от лаунчера */
function ping({ id, inGame = false, version = '', event = '' }) {
  if (!/^[a-f0-9]{32}$/.test(String(id || ''))) return false;
  const h = hashId(id);
  const t = now();
  // слишком частые повторы от одного лаунчера игнорируем (кроме события «запуск игры»)
  const prev = db.prepare('SELECT last_seen, in_game FROM launcher_clients WHERE id = ?').get(h);
  if (prev && t - prev.last_seen < 30_000 && event !== 'launch' && Boolean(prev.in_game) === Boolean(inGame)) return true;
  db.prepare(`INSERT INTO launcher_clients (id, last_seen, in_game, version) VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen, in_game = excluded.in_game, version = excluded.version`)
    .run(h, t, inGame ? 1 : 0, String(version).slice(0, 20));
  const day = dayKey(t);
  const isNew = db.prepare('INSERT OR IGNORE INTO launcher_day_clients (day, id) VALUES (?, ?)').run(day, h).changes > 0;
  db.prepare('INSERT OR IGNORE INTO launcher_daily (day) VALUES (?)').run(day);
  if (isNew) db.prepare('UPDATE launcher_daily SET uniques = uniques + 1 WHERE day = ?').run(day);
  if (event === 'launch') bumpDaily({ launches: 1 });
  return true;
}

/** Раз в 5 минут: снимок для графиков, пики, уборка */
function snapshot() {
  const c = current();
  const s = serversOnline();
  db.prepare('INSERT INTO stats_snapshots (ts, launcher, in_game, servers) VALUES (?, ?, ?, ?)').run(now(), c.online, c.inGame, s.p);
  bumpDaily({ peak: c.online, peak_ingame: c.inGame, peak_servers: s.p });
  db.prepare('DELETE FROM stats_snapshots WHERE ts < ?').run(now() - 35 * DAY);
  db.prepare('DELETE FROM launcher_day_clients WHERE day < ?').run(dayKey(now() - 35 * DAY));
  db.prepare('DELETE FROM launcher_clients WHERE last_seen < ?').run(now() - 90 * DAY);
}

/** Скачивание установщика: одно на IP в день, без ботов и докачек */
const BOT_RE = /bot|crawl|spider|slurp|curl|wget|python|headless|preview|monitor/i;
function trackDownload(ip, ua, range) {
  if (!ua || BOT_RE.test(ua)) return;
  if (range && !/^bytes=0-/.test(range)) return; // докачка куска — не новое скачивание
  const day = dayKey();
  if (db.prepare('INSERT OR IGNORE INTO download_day_ips (day, ip) VALUES (?, ?)').run(day, hashId(`ip:${ip}`)).changes === 0) return;
  db.prepare('INSERT INTO download_daily (day, count) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET count = count + 1').run(day);
}

/** Для админки: всегда настоящие цифры, независимо от настроек показа на сайте */
function adminSummary() {
  const s = summary();
  const sumDl = (days) => db.prepare('SELECT COALESCE(SUM(count), 0) AS n FROM download_daily WHERE day >= ?').get(dayKey(now() - (days - 1) * DAY)).n;
  const t = now();
  return {
    online: s.launcher.online, inGame: s.launcher.inGame,
    today: s.launcher.today, week: s.launcher.week, month: s.launcher.month,
    peakInGameToday: Math.max(db.prepare('SELECT peak_ingame FROM launcher_daily WHERE day = ?').get(dayKey())?.peak_ingame || 0, s.launcher.inGame),
    installs: db.prepare('SELECT COUNT(*) AS n FROM launcher_clients').get().n,
    installsNewWeek: db.prepare('SELECT COUNT(*) AS n FROM (SELECT id, MIN(day) d FROM launcher_day_clients GROUP BY id) WHERE d >= ?').get(dayKey(t - 6 * DAY)).n,
    versions: db.prepare('SELECT version, COUNT(*) AS n FROM launcher_clients WHERE last_seen > ? GROUP BY version ORDER BY n DESC LIMIT 6').all(t - 30 * DAY),
    downloads: { today: sumDl(1), week: sumDl(7), month: sumDl(30), total: db.prepare('SELECT COALESCE(SUM(count), 0) AS n FROM download_daily').get().n },
    day: db.prepare('SELECT ts, launcher, in_game FROM stats_snapshots WHERE ts >= ? ORDER BY ts').all(t - DAY),
  };
}

function start() {
  setTimeout(snapshot, 5000);
  setInterval(snapshot, 5 * 60 * 1000).unref();
}

/** Уникальные за последние N дней (по дневным спискам) */
function uniquesSince(days) {
  return db.prepare('SELECT COUNT(DISTINCT id) AS n FROM launcher_day_clients WHERE day >= ?').get(dayKey(now() - (days - 1) * DAY)).n;
}

function summary() {
  const c = current();
  const s = serversOnline();
  const today = db.prepare('SELECT * FROM launcher_daily WHERE day = ?').get(dayKey()) || { uniques: 0, launches: 0, peak: 0, peak_ingame: 0, peak_servers: 0 };
  return {
    launcher: { online: c.online, inGame: c.inGame, today: { uniques: today.uniques, launches: today.launches, peak: Math.max(today.peak, c.online) }, week: uniquesSince(7), month: uniquesSince(30) },
    servers: { online: s.p, count: s.n, peakToday: Math.max(today.peak_servers, s.p) },
    showLauncher: settings.get('show_launcher_online') === '1',
    demo: false,
  };
}

/** История: 24 часа по снимкам и 30 дней по дневной статистике */
function history() {
  const from = now() - DAY;
  const day = db.prepare('SELECT ts, launcher, in_game, servers FROM stats_snapshots WHERE ts >= ? ORDER BY ts').all(from);
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const k = dayKey(now() - i * DAY);
    const r = db.prepare('SELECT * FROM launcher_daily WHERE day = ?').get(k);
    days.push({ day: k, uniques: r?.uniques || 0, launches: r?.launches || 0, peak: r?.peak || 0, peakServers: r?.peak_servers || 0 });
  }
  return { day, days };
}

/* ---------- ДЕМО (только для админа, с пометкой) ---------- */
// Плавная «синусоида дня» 2000–3000 с шумом: для проверки вёрстки и графиков на больших числах.
function demoValue(t, salt2 = 0) {
  const h = ((t + MSK) / 3600000) % 24;
  const wave = 0.5 + 0.5 * Math.sin(((h - 9) / 24) * Math.PI * 2);
  const noise = Math.sin(t / 420000 + salt2) * 0.06 + Math.sin(t / 97000 + salt2 * 3) * 0.03;
  return Math.round(2000 + 1000 * Math.min(1, Math.max(0, wave + noise)));
}
function demoSummary() {
  const t = now();
  const online = demoValue(t);
  return {
    launcher: { online, inGame: Math.round(online * 0.62), today: { uniques: 9000 + (Math.floor(t / 3600000) % 7) * 310, launches: 14000 + (Math.floor(t / 600000) % 50) * 37, peak: 2987 }, week: 31240, month: 87410 },
    servers: { online: online * 7 + 1200, count: 120, peakToday: 24800 },
    showLauncher: true,
    demo: true,
  };
}
function demoHistory() {
  const t = now();
  const day = [];
  for (let x = t - DAY; x <= t; x += 5 * 60000) { const v = demoValue(x); day.push({ ts: x, launcher: v, in_game: Math.round(v * 0.62), servers: v * 7 + 1200 }); }
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const k = dayKey(t - i * DAY);
    const w = new Date(k).getUTCDay();
    const base = (w === 0 || w === 6 ? 1.15 : 1) * (1 + (29 - i) * 0.006);
    days.push({ day: k, uniques: Math.round(8600 * base + ((i * 37) % 400)), launches: Math.round(13200 * base + ((i * 53) % 700)), peak: Math.round(2700 * base + ((i * 13) % 250)), peakServers: Math.round(23000 * base) });
  }
  return { day, days };
}

const demoAllowed = (req) => settings.get('demo_stats') === '1' && req.user?.role === 'admin';

module.exports = { ping, start, snapshot, summary, history, demoSummary, demoHistory, demoAllowed, dayKey, trackDownload, adminSummary };
