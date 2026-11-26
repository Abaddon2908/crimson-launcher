// Скины игроков без лицензии: хранение на сайте, постоянная ссылка для SkinsRestorer (/skin url …)
// и выдача в формате CustomSkinAPI для клиентского мода CustomSkinLoader.
const crypto = require('crypto');
const { db, now } = require('./db');

db.exec(`
CREATE TABLE IF NOT EXISTS skins (
  code TEXT PRIMARY KEY,             -- первые 16 символов sha256 картинки
  png BLOB NOT NULL,
  variant TEXT NOT NULL DEFAULT 'classic',
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS skin_nicks (
  nick_lower TEXT PRIMARY KEY,
  nick TEXT NOT NULL,
  code TEXT NOT NULL REFERENCES skins(code),
  variant TEXT NOT NULL DEFAULT 'classic',
  token_hash TEXT NOT NULL,          -- ник принадлежит тому лаунчеру, который первым загрузил под ним скин
  updated INTEGER NOT NULL
);
`);

CREATE_EXTRA();
function CREATE_EXTRA() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS capes (
    code TEXT PRIMARY KEY,
    slug TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    png BLOB NOT NULL,
    hidden INTEGER NOT NULL DEFAULT 0,
    created INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS skin_catalog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL REFERENCES skins(code),
    title TEXT NOT NULL,
    gender TEXT NOT NULL DEFAULT '',     -- m | f | ''
    style TEXT NOT NULL DEFAULT '',
    cape TEXT,                           -- код плаща из capes
    variant TEXT NOT NULL DEFAULT 'classic',
    downloads INTEGER NOT NULL DEFAULT 0,
    hidden INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'admin',
    created INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS skin_catalog_code ON skin_catalog(code);
  `);
  const cols = db.prepare('PRAGMA table_info(skin_nicks)').all().map((c) => c.name);
  if (!cols.includes('cape')) db.exec('ALTER TABLE skin_nicks ADD COLUMN cape TEXT');
  // плащ игрока Minecraft / Ely.by (картинка в skins) — только для показа
  const cc = db.prepare('PRAGMA table_info(skin_catalog)').all().map((c) => c.name);
  if (!cc.includes('player_cape')) db.exec('ALTER TABLE skin_catalog ADD COLUMN player_cape TEXT');
}

const NICK_RE = /^[A-Za-z0-9_]{3,16}$/;
const STYLES = ['Повседневные', 'Спортивные', 'Деловые', 'Воины', 'Маги', 'Ниндзя'];
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

/** Проверка PNG: подпись и размер 64×64 (или старый 64×32) */
function checkPng(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 33 || buf.length > 64 * 1024) return 'Файл скина должен быть PNG до 64 КБ';
  if (buf.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || buf.subarray(12, 16).toString() !== 'IHDR') return 'Это не PNG-картинка';
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  if (w !== 64 || (h !== 64 && h !== 32)) return `Скин должен быть 64×64 пикселя (у файла ${w}×${h})`;
  return '';
}

/**
 * Загрузка скина под ником. token — секрет лаунчера: им ник «закрепляется» за этим игроком.
 * Возвращает { code, token, nick, variant } или { error, status }.
 */
function upload({ nick, variant, png, token, cape }) {
  nick = String(nick || '').trim();
  if (!NICK_RE.test(nick)) return { error: 'Ник: 3–16 символов, латиница, цифры и _', status: 400 };
  variant = variant === 'slim' ? 'slim' : 'classic';
  const err = checkPng(png);
  if (err) return { error: err, status: 400 };
  const owned = db.prepare('SELECT * FROM skin_nicks WHERE nick_lower = ?').get(nick.toLowerCase());
  const tok = typeof token === 'string' && /^[A-Za-z0-9_-]{32,64}$/.test(token) ? token : '';
  if (owned && (!tok || sha(tok) !== owned.token_hash)) {
    return { error: 'Этот ник уже занят другим игроком NLauncher. Возьмите другой ник или загрузите скин с того компьютера, где ник был занят.', status: 409 };
  }
  const capeCode = cape ? (capeByCode(cape) ? String(cape) : undefined) : null;
  if (capeCode === undefined) return { error: 'Такого плаща нет', status: 400 };
  const newToken = tok || crypto.randomBytes(24).toString('base64url');
  const code = sha(png).slice(0, 16);
  db.prepare('INSERT OR IGNORE INTO skins (code, png, variant, created) VALUES (?, ?, ?, ?)').run(code, png, variant, now());
  db.prepare(`INSERT INTO skin_nicks (nick_lower, nick, code, variant, token_hash, updated, cape) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(nick_lower) DO UPDATE SET nick = excluded.nick, code = excluded.code, variant = excluded.variant, updated = excluded.updated, cape = excluded.cape`)
    .run(nick.toLowerCase(), nick, code, variant, sha(newToken), now(), capeCode);
  return { code, token: newToken, nick, variant, cape: capeCode };
}

/** Сброс: снять скин с ника (только тот лаунчер, за которым закреплён ник) */
function reset({ nick, token }) {
  const owned = byNick(nick);
  if (!owned) return { ok: true };
  if (typeof token !== 'string' || sha(token) !== owned.token_hash) return { error: 'Сбросить скин может только лаунчер, который его загрузил', status: 403 };
  db.prepare('DELETE FROM skin_nicks WHERE nick_lower = ?').run(owned.nick_lower);
  return { ok: true };
}

const png = (code) => db.prepare('SELECT png FROM skins WHERE code = ?').get(String(code))?.png || null;
const capeByCode = (code) => db.prepare('SELECT code, slug, name FROM capes WHERE code = ? AND hidden = 0').get(String(code || '')) || null;
const capePng = (code) => db.prepare('SELECT png FROM capes WHERE code = ?').get(String(code))?.png || null;
const capes = () => db.prepare('SELECT code, slug, name FROM capes WHERE hidden = 0 ORDER BY rowid').all();

/* ---------- каталог ---------- */
const catalogItem = (id) => db.prepare('SELECT * FROM skin_catalog WHERE id = ? AND hidden = 0').get(Number(id) || 0) || null;
function catalogList({ cat = '', style = '', q = '', page = 1, per = 48, all = false } = {}) {
  const where = all ? [] : ['c.hidden = 0'], args = [];
  if (cat === 'm' || cat === 'f') { where.push('c.gender = ?'); args.push(cat); }
  if (cat === 'cape') where.push('(c.cape IS NOT NULL OR c.player_cape IS NOT NULL)');
  if (cat === 'mc') where.push("c.source IN ('mojang', 'elyby')");
  if (cat === 'nl') where.push("c.source IN ('nl', 'admin')");
  if (STYLES.includes(style)) { where.push('c.style = ?'); args.push(style); }
  q = String(q || '').trim().toLowerCase().slice(0, 40);
  if (q) { where.push('lower(c.title) LIKE ?'); args.push(`%${q.replace(/[%_]/g, '')}%`); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM skin_catalog c ${w}`).get(...args).n;
  const pages = Math.max(1, Math.ceil(total / per));
  page = Math.min(Math.max(1, Number(page) || 1), pages);
  const items = db.prepare(`SELECT c.*, k.name AS cape_name FROM skin_catalog c LEFT JOIN capes k ON k.code = c.cape ${w} ORDER BY c.id DESC LIMIT ? OFFSET ?`).all(...args, per, (page - 1) * per);
  return { items, total, page, pages };
}
const similar = (it, n = 12) => db.prepare(`SELECT * FROM skin_catalog WHERE hidden = 0 AND id != ? AND style = ? ORDER BY (gender = ?) DESC, abs(id - ?) LIMIT ?`).all(it.id, it.style, it.gender, it.id, n);
const counts = () => {
  const r = db.prepare(`SELECT COUNT(*) AS all_, SUM(gender = 'm') AS m, SUM(gender = 'f') AS f, SUM(cape IS NOT NULL OR player_cape IS NOT NULL) AS cape,
    SUM(source IN ('mojang', 'elyby')) AS mc, SUM(source IN ('nl', 'admin')) AS nl FROM skin_catalog WHERE hidden = 0`).get();
  return { all: r.all_ || 0, m: r.m || 0, f: r.f || 0, cape: r.cape || 0, mc: r.mc || 0, nl: r.nl || 0, players: count() };
};

function addCape({ name, png: buf, slug = '' }) {
  if (!Buffer.isBuffer(buf) || buf.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return { error: 'Плащ должен быть PNG' };
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  if (!((w === 64 && h === 32) || (w === 22 && h === 17))) return { error: `Плащ должен быть 64×32 (у файла ${w}×${h})` };
  const code = sha(buf).slice(0, 16);
  db.prepare('INSERT OR IGNORE INTO capes (code, slug, name, png, created) VALUES (?, ?, ?, ?, ?)').run(code, slug, String(name || 'Плащ').slice(0, 60), buf, now());
  return { code };
}

function addCatalog({ title, png: buf, variant, gender, style, cape, playerCape = null, source = 'admin' }) {
  const err = checkPng(buf);
  if (err) return { error: err };
  const code = sha(buf).slice(0, 16);
  db.prepare('INSERT OR IGNORE INTO skins (code, png, variant, created) VALUES (?, ?, ?, ?)').run(code, buf, variant === 'slim' ? 'slim' : 'classic', now());
  const r = db.prepare(`INSERT OR IGNORE INTO skin_catalog (code, title, gender, style, cape, player_cape, variant, source, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(code, String(title || 'Скин').slice(0, 80), ['m', 'f'].includes(gender) ? gender : '', STYLES.includes(style) ? style : '', capeByCode(cape) ? cape : null, playerCape || null, variant === 'slim' ? 'slim' : 'classic', source, now());
  return r.changes ? { id: Number(r.lastInsertRowid), code } : { exists: true, code };
}
const catalogSet = (id, fields) => {
  const f = {};
  if ('hidden' in fields) f.hidden = fields.hidden ? 1 : 0;
  if ('title' in fields) f.title = String(fields.title).slice(0, 80);
  if ('gender' in fields) f.gender = ['m', 'f'].includes(fields.gender) ? fields.gender : '';
  if ('style' in fields) f.style = STYLES.includes(fields.style) ? fields.style : '';
  if ('cape' in fields) f.cape = capeByCode(fields.cape) ? fields.cape : null;
  const keys = Object.keys(f);
  if (keys.length) db.prepare(`UPDATE skin_catalog SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => f[k]), Number(id));
};
const catalogDelete = (id) => db.prepare('DELETE FROM skin_catalog WHERE id = ?').run(Number(id));
const countDownload = (id) => db.prepare('UPDATE skin_catalog SET downloads = downloads + 1 WHERE id = ?').run(Number(id));

/** Плащ игрока без лицензии (только из каталога плащей) */
function setCape({ nick, token, cape }) {
  const owned = byNick(nick);
  if (!owned) return { error: 'Сначала сохраните скин', status: 404 };
  if (typeof token !== 'string' || sha(token) !== owned.token_hash) return { error: 'Плащ может сменить только лаунчер, который загрузил скин', status: 403 };
  const c = cape ? capeByCode(cape) : null;
  if (cape && !c) return { error: 'Такого плаща нет', status: 400 };
  db.prepare('UPDATE skin_nicks SET cape = ?, updated = ? WHERE nick_lower = ?').run(c ? c.code : null, now(), owned.nick_lower);
  return { ok: true, cape: c ? c.code : null };
}

/** Разметить уже собранные скины игроков: пол по картинке и плащ (один раз после обновления) */
function backfillPlayers() {
  const { settings } = require('./db');
  if (settings.get('skin_players_marked') === '1') return;
  const { guessGender } = require('./skinguess');
  const rows = db.prepare(`SELECT c.id, c.code, c.variant, l.cape FROM skin_catalog c LEFT JOIN skin_lookup l ON l.code = c.code
    WHERE c.source IN ('mojang', 'elyby')`).all();
  const up = db.prepare('UPDATE skin_catalog SET gender = CASE WHEN gender = \'\' THEN ? ELSE gender END, player_cape = COALESCE(player_cape, ?) WHERE id = ?');
  for (const r of rows) up.run(guessGender(Buffer.from(png(r.code) || []), r.variant), r.cape || null, r.id);
  settings.set('skin_players_marked', '1');
  if (rows.length) console.log(`[skins] размечено скинов игроков: ${rows.length}`);
}

/** Однократно заливаем фирменный каталог NLauncher (повторно — только при смене версии генератора) */
const CATALOG_VERSION = '1';
// Каталог показывает только скины реальных игроков (Mojang / Ely.by) и загруженные админом.
// Сгенерированные скины NLauncher убраны; плащи NLauncher остаются — их надевают игроки без лицензии.
function seedCatalog() {
  const { settings } = require('./db');
  if (settings.get('skin_capes_v') !== CATALOG_VERSION) {
    for (const c of require('./skingen').CAPES_PNG()) addCape({ name: c.name, png: c.png, slug: c.id });
    settings.set('skin_capes_v', CATALOG_VERSION);
  }
  const gone = db.prepare(`DELETE FROM skin_catalog WHERE source = 'nl'`).run().changes;
  if (gone) console.log(`[skins] убрано сгенерированных скинов: ${gone}`);
}
const byNick = (nick) => (NICK_RE.test(String(nick || '')) ? db.prepare('SELECT * FROM skin_nicks WHERE nick_lower = ?').get(String(nick).toLowerCase()) : null) || null;
/** Галерея: новые сверху, поиск по нику, фильтр модели */
function list({ q = '', model = '', page = 1, per = 48 } = {}) {
  const where = [], args = [];
  q = String(q || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 16);
  if (q) { where.push("nick_lower LIKE ? ESCAPE '\\'"); args.push(`%${q.replace(/_/g, '\\_')}%`); }
  if (model === 'slim' || model === 'classic') { where.push('variant = ?'); args.push(model); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM skin_nicks ${w}`).get(...args).n;
  const pages = Math.max(1, Math.ceil(total / per));
  page = Math.min(Math.max(1, Number(page) || 1), pages);
  const items = db.prepare(`SELECT nick, code, variant, updated FROM skin_nicks ${w} ORDER BY updated DESC LIMIT ? OFFSET ?`).all(...args, per, (page - 1) * per);
  return { items, total, page, pages, q, model };
}

/** Удаление из галереи (модерация): ник освобождается */
const remove = (nick) => db.prepare('DELETE FROM skin_nicks WHERE nick_lower = ?').run(String(nick || '').toLowerCase()).changes > 0;

const count = () => db.prepare('SELECT COUNT(*) AS n FROM skin_nicks').get().n;

module.exports = { backfillPlayers, STYLES, capeByCode, capePng, capes, catalogItem, catalogList, similar, counts, addCape, addCatalog, catalogSet, catalogDelete, countDownload, setCape, seedCatalog, list, remove, reset, upload, png, byNick, count, checkPng, NICK_RE };
