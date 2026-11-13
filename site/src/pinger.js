// Фоновый опрос серверов: статус, онлайн, история для графиков
const util = require('minecraft-server-util');
const { db, now, DAY } = require('./db');

function splitAddr(address) {
  const [host, port] = String(address).trim().split(':');
  return { host, port: Number(port) || 25565 };
}

async function ping(address) {
  const { host, port } = splitAddr(address);
  try {
    const r = await util.status(host, port, { timeout: 5000, enableSRV: true });
    return {
      online: 1, players: r.players.online, max: r.players.max,
      motd: r.motd.clean.replace(/\s+/g, ' ').trim().slice(0, 200),
      favicon: r.favicon || '', ping: r.roundTripLatency, version: (r.version.name || '').slice(0, 60),
    };
  } catch {
    return { online: 0, players: 0, max: 0 };
  }
}

async function pingServer(s) {
  const r = await ping(s.address);
  const t = now();
  if (r.online) {
    db.prepare('UPDATE servers SET online = 1, players = ?, max_players = ?, motd = ?, favicon = ?, ping_ms = ?, game_version = ?, last_ping = ? WHERE id = ?')
      .run(r.players, r.max, r.motd, r.favicon, r.ping, r.version, t, s.id);
  } else {
    db.prepare('UPDATE servers SET online = 0, players = 0, last_ping = ? WHERE id = ?').run(t, s.id);
  }
  db.prepare('INSERT INTO pings (server_id, ts, online, players) VALUES (?, ?, ?, ?)').run(s.id, t, r.online, r.players);
  return r;
}

async function cycle() {
  const list = db.prepare(`SELECT id, address FROM servers WHERE status IN ('approved', 'pending')`).all();
  for (let i = 0; i < list.length; i += 10) await Promise.all(list.slice(i, i + 10).map(pingServer));
  db.prepare('DELETE FROM pings WHERE ts < ?').run(now() - 30 * DAY);
}

function start(intervalMin = Number(process.env.PING_INTERVAL_MIN) || 5) {
  const run = () => cycle().catch((e) => console.error('[pinger]', e.message));
  setTimeout(run, 3000);
  setInterval(run, intervalMin * 60 * 1000);
}

/** История онлайна для графика: среднее по интервалам */
function history(serverId, rangeMs, buckets = 48) {
  const from = now() - rangeMs;
  const rows = db.prepare('SELECT ts, players FROM pings WHERE server_id = ? AND ts >= ? ORDER BY ts').all(serverId, from);
  const size = rangeMs / buckets;
  const out = Array.from({ length: buckets }, (_, i) => ({ t: from + i * size, sum: 0, n: 0 }));
  for (const r of rows) {
    const b = out[Math.min(buckets - 1, Math.floor((r.ts - from) / size))];
    b.sum += r.players; b.n++;
  }
  return out.map((b) => ({ t: b.t, v: b.n ? Math.round(b.sum / b.n) : null }));
}

module.exports = { start, ping, pingServer, history };
