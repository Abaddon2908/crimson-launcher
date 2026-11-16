// Анонимная статистика для nlauncher.ru/stats: «лаунчер открыт», «в игре», «запуск игры».
// Отправляется только случайный ID (не связан с ником/аккаунтом) и версия лаунчера.
// Отключается в настройках: «Анонимная статистика».
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const paths = require('./paths');
const store = require('./store');
const { UA } = require('./net');

const ID_FILE = path.join(paths.data, 'client-id');
const DEMO = process.argv.includes('--demo-stats'); // только для разработки: подставные цифры с пометкой «демо»

function clientId() {
  try {
    const id = fs.readFileSync(ID_FILE, 'utf8').trim();
    if (/^[a-f0-9]{32}$/.test(id)) return id;
  } catch { /* нет файла */ }
  const id = crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(ID_FILE, id);
  return id;
}

let cfg = null;
let isInGame = () => false;
let version = '0.0.0';

const site = () => String(cfg?.site || '').replace(/\/$/, '');
const enabled = () => store.read('settings').shareStats !== false && site() && !site().includes('example.com');

async function ping(event = '') {
  if (!enabled()) return;
  try {
    await fetch(`${site()}/api/launcher/ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
      body: JSON.stringify({ id: clientId(), inGame: isInGame(), version, ...(event ? { event } : {}) }),
      signal: AbortSignal.timeout(5000),
    });
  } catch { /* сайт недоступен — не страшно */ }
}

function start(config, opts) {
  cfg = config;
  isInGame = opts.isInGame;
  version = opts.version;
  setTimeout(() => ping(), 3000);
  setInterval(() => ping(), 2 * 60 * 1000).unref();
}

/** Онлайн для строки на главной: { launcherOnline|null, serversOnline, demo } */
async function online() {
  if (DEMO) {
    const t = Date.now();
    const v = Math.round(2500 + 450 * Math.sin(t / 3.6e6) + 50 * Math.sin(t / 9.7e4));
    return { launcherOnline: v, serversOnline: v * 7 + 1200, demo: true };
  }
  if (!site() || site().includes('example.com')) return null;
  try {
    const r = await fetch(`${site()}/api/stats`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const s = await r.json();
    return { launcherOnline: s.showLauncher ? s.launcher.online : null, serversOnline: s.servers.online, demo: false };
  } catch {
    return null;
  }
}

module.exports = { start, ping, online };
