// Пароли (scrypt), подписанные cookie-сессии, CSRF
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { db, now } = require('./db');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const secretFile = path.join(DATA_DIR, 'secret.key');
function loadSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (fs.existsSync(secretFile)) return fs.readFileSync(secretFile, 'utf8');
  const s = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(secretFile, s, { mode: 0o600 });
  return s;
}
const SECRET = loadSecret();

const COOKIE = 'nd_sess';
const MAX_AGE = 30 * 86400 * 1000;

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}
function checkPassword(pw, stored) {
  const [, salt, key] = String(stored).split('$');
  if (!salt || !key) return false;
  const got = crypto.scryptSync(String(pw), Buffer.from(salt, 'hex'), 64);
  return crypto.timingSafeEqual(got, Buffer.from(key, 'hex'));
}

const sign = (v) => crypto.createHmac('sha256', SECRET).update(v).digest('base64url');
function encode(obj) { const v = Buffer.from(JSON.stringify(obj)).toString('base64url'); return `${v}.${sign(v)}`; }
function decode(str) {
  const [v, s] = String(str || '').split('.');
  if (!v || !s) return null;
  const expect = sign(v);
  if (s.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expect))) return null;
  try { const o = JSON.parse(Buffer.from(v, 'base64url').toString()); return o.exp > now() ? o : null; } catch { return null; }
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** middleware: req.user, req.csrf, res.login(), res.logout() */
function sessions(req, res, next) {
  let sess = decode(parseCookies(req.headers.cookie)[COOKIE]);
  const secure = (process.env.SITE_URL || '').startsWith('https://');
  const write = (s) => res.append('Set-Cookie', `${COOKIE}=${encodeURIComponent(encode(s))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE / 1000}${secure ? '; Secure' : ''}`);
  const fresh = (uid) => ({ ...(uid ? { uid } : {}), csrf: crypto.randomBytes(18).toString('base64url'), exp: now() + MAX_AGE });
  if (!sess) { sess = fresh(); write(sess); }
  req.csrf = sess.csrf;
  req.user = sess.uid ? db.prepare('SELECT id, email, name, role, banned FROM users WHERE id = ?').get(sess.uid) || null : null;
  if (req.user?.banned) req.user = null;
  res.login = (uid) => write(fresh(uid));
  res.logout = () => write(fresh());
  next();
}

/** Проверка CSRF-токена для POST-форм (вебхуки платёжек и API — без него) */
function csrf(req, res, next) {
  if (req.method !== 'POST' || req.path.startsWith('/pay/') || req.path.startsWith('/api/')) return next();
  const t = req.body?._csrf || req.headers['x-csrf-token'];
  if (t && t === req.csrf) return next();
  res.status(403).send('Сессия устарела — обновите страницу и попробуйте снова.');
}

const requireUser = (req, res, next) => (req.user ? next() : res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`));
const requireAdmin = (req, res, next) => (req.user?.role === 'admin' ? next() : res.status(404).send('Not found'));

/** Администратор из переменных окружения ADMIN_EMAIL / ADMIN_PASSWORD */
function bootstrapAdmin() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const pw = process.env.ADMIN_PASSWORD || '';
  if (!email || !pw) return;
  const u = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (u) db.prepare(`UPDATE users SET role = 'admin' WHERE id = ?`).run(u.id);
  else db.prepare(`INSERT INTO users (email, name, pass, role, created) VALUES (?, ?, ?, 'admin', ?)`).run(email, 'Admin', hashPassword(pw), now());
}

module.exports = { hashPassword, checkPassword, sessions, csrf, requireUser, requireAdmin, bootstrapAdmin };
