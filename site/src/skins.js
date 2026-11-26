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

const NICK_RE = /^[A-Za-z0-9_]{3,16}$/;
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
function upload({ nick, variant, png, token }) {
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
  const newToken = tok || crypto.randomBytes(24).toString('base64url');
  const code = sha(png).slice(0, 16);
  db.prepare('INSERT OR IGNORE INTO skins (code, png, variant, created) VALUES (?, ?, ?, ?)').run(code, png, variant, now());
  db.prepare(`INSERT INTO skin_nicks (nick_lower, nick, code, variant, token_hash, updated) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(nick_lower) DO UPDATE SET nick = excluded.nick, code = excluded.code, variant = excluded.variant, updated = excluded.updated`)
    .run(nick.toLowerCase(), nick, code, variant, sha(newToken), now());
  return { code, token: newToken, nick, variant };
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

module.exports = { list, remove, reset, upload, png, byNick, count, checkPng, NICK_RE };
