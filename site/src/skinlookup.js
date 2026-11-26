// Скин любого игрока по нику: лицензия (открытый API Mojang) и Ely.by (популярная система скинов без лицензии).
// Найденное кешируем в базе на 6 часов, чтобы не упираться в лимиты Mojang.
const crypto = require('crypto');
const { db, now } = require('./db');

const MOJANG_API = process.env.MOJANG_API || 'https://api.mojang.com';
const MOJANG_SESSION = process.env.MOJANG_SESSION || 'https://sessionserver.mojang.com';
const ELY = process.env.ELY_API || 'https://skinsystem.ely.by';
const TTL = 6 * 3600;
const MISS_TTL = 30 * 60;
const NICK_RE = /^[A-Za-z0-9_]{2,16}$/;

db.exec(`
CREATE TABLE IF NOT EXISTS skin_lookup (
  nick_lower TEXT PRIMARY KEY,
  nick TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',     -- mojang | elyby | '' (не найден)
  code TEXT,                           -- skins.code
  cape TEXT,                           -- skins.code картинки плаща
  variant TEXT NOT NULL DEFAULT 'classic',
  fetched INTEGER NOT NULL
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS skin_queue (
  nick_lower TEXT PRIMARY KEY,
  nick TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',     -- откуда ник: server | seed | search | admin
  added INTEGER NOT NULL
);
`);

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
const UA = { 'User-Agent': 'NLauncher-Monitoring/1.0' };

async function getJson(url) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(8000) });
  if (r.status === 204 || r.status === 404) return null;
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
async function getPng(url) {
  if (!url) return null;
  // Mojang отдаёт ссылки на textures.minecraft.net по http — берём по https
  const r = await fetch(url.replace(/^http:\/\/textures\.minecraft\.net\//, 'https://textures.minecraft.net/'), { headers: UA, signal: AbortSignal.timeout(8000) });
  if (!r.ok) return null;
  const b = Buffer.from(await r.arrayBuffer());
  return b.length < 200 * 1024 && b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' ? b : null;
}

async function fromMojang(nick) {
  const p = await getJson(`${MOJANG_API}/users/profiles/minecraft/${encodeURIComponent(nick)}`);
  if (!p?.id) return null;
  const prof = await getJson(`${MOJANG_SESSION}/session/minecraft/profile/${p.id}`);
  const prop = prof?.properties?.find((x) => x.name === 'textures');
  if (!prop) return null;
  const t = JSON.parse(Buffer.from(prop.value, 'base64').toString('utf8')).textures || {};
  if (!t.SKIN?.url) return null; // стандартный скин — показывать нечего
  return { nick: p.name || nick, source: 'mojang', skinUrl: t.SKIN.url, slim: t.SKIN.metadata?.model === 'slim', capeUrl: t.CAPE?.url };
}
async function fromEly(nick) {
  const t = await getJson(`${ELY}/textures/${encodeURIComponent(nick)}`);
  if (!t?.SKIN?.url) return null;
  return { nick, source: 'elyby', skinUrl: t.SKIN.url, slim: t.SKIN.metadata?.model === 'slim', capeUrl: t.CAPE?.url };
}

function store(found) {
  const save = (buf, variant) => {
    const code = sha(buf);
    db.prepare('INSERT OR IGNORE INTO skins (code, png, variant, created) VALUES (?, ?, ?, ?)').run(code, buf, variant, now());
    return code;
  };
  return {
    code: found.png ? save(found.png, found.slim ? 'slim' : 'classic') : null,
    cape: found.capePng ? save(found.capePng, 'cape') : null,
  };
}

const inflight = new Map();
/** Найти скин по нику. Вернёт { nick, source, code, cape, variant } или null */
async function lookup(nick) {
  nick = String(nick || '').trim();
  if (!NICK_RE.test(nick)) return null;
  const key = nick.toLowerCase();
  const cached = db.prepare('SELECT * FROM skin_lookup WHERE nick_lower = ?').get(key);
  if (cached && now() - cached.fetched < (cached.source ? TTL : MISS_TTL)) return cached.source ? cached : null;
  if (inflight.has(key)) return inflight.get(key);
  const job = (async () => {
    let f = null;
    for (const src of [fromMojang, fromEly]) {
      f = await src(nick).catch((e) => { errors++; console.warn(`[skins] ${src.name} ${nick}: ${e.message}`); return undefined; });
      if (f) break;
    }
    // источники недоступны — отдаём старый кеш, если он есть
    if (f === undefined) return cached?.source ? cached : null;
    if (f) { f.png = await getPng(f.skinUrl); f.capePng = await getPng(f.capeUrl); }
    if (!f?.png) {
      db.prepare(`INSERT INTO skin_lookup (nick_lower, nick, source, fetched) VALUES (?, ?, '', ?)
        ON CONFLICT(nick_lower) DO UPDATE SET source = '', code = NULL, cape = NULL, fetched = excluded.fetched`).run(key, nick, now());
      return null;
    }
    const s = store(f);
    const row = { nick_lower: key, nick: f.nick, source: f.source, code: s.code, cape: s.cape, variant: f.slim ? 'slim' : 'classic', fetched: now() };
    db.prepare(`INSERT INTO skin_lookup (nick_lower, nick, source, code, cape, variant, fetched) VALUES (@nick_lower, @nick, @source, @code, @cape, @variant, @fetched)
      ON CONFLICT(nick_lower) DO UPDATE SET nick = excluded.nick, source = excluded.source, code = excluded.code, cape = excluded.cape, variant = excluded.variant, fetched = excluded.fetched`).run(row);
    toCatalog(row);
    return row;
  })().finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

/** Найденный скин — в общий каталог (дубликаты одинаковых картинок отбрасываются) */
function toCatalog(row) {
  if (!row?.code) return;
  const skins = require('./skins');
  const png = skins.png(row.code);
  if (!png) return;
  const buf = Buffer.from(png);
  skins.addCatalog({ title: row.nick, png: buf, variant: row.variant, source: row.source, gender: require('./skinguess').guessGender(buf, row.variant), playerCape: row.cape || null });
}

/** Поставить ники в очередь сборщика */
const QUEUE_MAX = 100000;
function enqueue(nicks, source = '') {
  const queued = db.prepare('SELECT COUNT(*) AS n FROM skin_queue').get().n;
  if (queued >= QUEUE_MAX) return 0;
  const known = db.prepare('SELECT 1 FROM skin_lookup WHERE nick_lower = ?');
  const ins = db.prepare('INSERT OR IGNORE INTO skin_queue (nick_lower, nick, source, added) VALUES (?, ?, ?, ?)');
  let n = 0;
  for (const raw of nicks) {
    const nick = String(raw || '').trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(nick) || known.get(nick.toLowerCase())) continue;
    n += ins.run(nick.toLowerCase(), nick, source, now()).changes;
    if (queued + n >= QUEUE_MAX) break;
  }
  return n;
}

/**
 * Фоновый сборщик: по одному нику раз в STEP мс (≈1800 ников в час) — в пределах лимитов Mojang.
 * Если Mojang отвечает ошибками — делает паузу.
 */
const STEP = Number(process.env.SKIN_CRAWL_MS) || 2000;
let pauseUntil = 0;
async function crawlOne() {
  if (Date.now() < pauseUntil) return;
  const next = db.prepare('SELECT * FROM skin_queue ORDER BY added LIMIT 1').get();
  if (!next) return;
  db.prepare('DELETE FROM skin_queue WHERE nick_lower = ?').run(next.nick_lower);
  const before = errors;
  const row = await lookup(next.nick).catch(() => null);
  if (errors > before) pauseUntil = Date.now() + 5 * 60_000; // источник сбоит — отдыхаем 5 минут
  if (row) toCatalog(row);
}
let errors = 0;
function startCrawler() {
  if (process.env.SKIN_CRAWL === '0') return;
  let busy = false;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try { await crawlOne(); } catch (e) { console.warn('[skins] сборщик:', e.message); } finally { busy = false; }
  }, STEP).unref();
}
const stats = () => ({
  queue: db.prepare('SELECT COUNT(*) AS n FROM skin_queue').get().n,
  found: db.prepare(`SELECT COUNT(*) AS n FROM skin_lookup WHERE source != ''`).get().n,
  checked: db.prepare('SELECT COUNT(*) AS n FROM skin_lookup').get().n,
});

/** Недавно найденные скины (для блока «Недавно искали») */
const recent = (n = 12) => db.prepare(`SELECT * FROM skin_lookup WHERE source != '' ORDER BY fetched DESC LIMIT ?`).all(n);

const SOURCE = { mojang: 'Minecraft (лицензия)', elyby: 'Ely.by' };
module.exports = { lookup, recent, enqueue, startCrawler, stats, SOURCE, NICK_RE };
