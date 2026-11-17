// Техподдержка: переписка посетителя с администрацией (виджет на сайте ↔ раздел в админке).
// Одна переписка на пользователя; гость узнаётся по случайному токену в cookie.
const crypto = require('crypto');
const { db, now } = require('./db');

db.exec(`
CREATE TABLE IF NOT EXISTS support_threads (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  token TEXT UNIQUE NOT NULL,
  contact TEXT NOT NULL DEFAULT '',        -- email или Telegram гостя
  page TEXT NOT NULL DEFAULT '',           -- страница, с которой написали впервые
  status TEXT NOT NULL DEFAULT 'open',     -- open | closed
  unread_admin INTEGER NOT NULL DEFAULT 0, -- новых сообщений для админа
  unread_user INTEGER NOT NULL DEFAULT 0,  -- новых ответов для посетителя
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS support_threads_user ON support_threads(user_id);
CREATE TABLE IF NOT EXISTS support_messages (
  id INTEGER PRIMARY KEY,
  thread_id INTEGER NOT NULL REFERENCES support_threads(id) ON DELETE CASCADE,
  from_admin INTEGER NOT NULL DEFAULT 0,
  admin_id INTEGER,
  text TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS support_messages_thread ON support_messages(thread_id, id);
`);

const COOKIE = 'nd_support';
const MAX_TEXT = 2000;

/** Переписка текущего посетителя (или null, если он ещё не писал) */
function findThread(req, token) {
  if (req.user) {
    const own = db.prepare('SELECT * FROM support_threads WHERE user_id = ? ORDER BY updated DESC LIMIT 1').get(req.user.id);
    if (own) return own;
    // гость написал, а потом вошёл — привязываем его переписку к аккаунту
    if (token) {
      const guest = db.prepare('SELECT * FROM support_threads WHERE token = ? AND user_id IS NULL').get(token);
      if (guest) { db.prepare('UPDATE support_threads SET user_id = ? WHERE id = ?').run(req.user.id, guest.id); return { ...guest, user_id: req.user.id }; }
    }
    return null;
  }
  return token ? db.prepare('SELECT * FROM support_threads WHERE token = ? AND user_id IS NULL').get(token) || null : null;
}

function createThread(req, { contact, page }) {
  const token = crypto.randomBytes(24).toString('base64url');
  const t = now();
  const r = db.prepare('INSERT INTO support_threads (user_id, token, contact, page, created, updated) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.user?.id || null, token, contact, page, t, t);
  return db.prepare('SELECT * FROM support_threads WHERE id = ?').get(Number(r.lastInsertRowid));
}

function messages(threadId, after = 0) {
  return db.prepare('SELECT id, from_admin, text, ts FROM support_messages WHERE thread_id = ? AND id > ? ORDER BY id LIMIT 500').all(threadId, after);
}

/** Сообщение посетителя: переписка снова открыта, админу +1 непрочитанное */
function userMessage(threadId, text) {
  const t = now();
  db.prepare('INSERT INTO support_messages (thread_id, from_admin, text, ts) VALUES (?, 0, ?, ?)').run(threadId, text, t);
  db.prepare(`UPDATE support_threads SET status = 'open', unread_admin = unread_admin + 1, updated = ? WHERE id = ?`).run(t, threadId);
}

/** Ответ администратора: посетителю +1 непрочитанное */
function adminMessage(threadId, adminId, text) {
  const t = now();
  db.prepare('INSERT INTO support_messages (thread_id, from_admin, admin_id, text, ts) VALUES (?, 1, ?, ?, ?)').run(threadId, adminId, text, t);
  db.prepare('UPDATE support_threads SET unread_user = unread_user + 1, unread_admin = 0, updated = ? WHERE id = ?').run(t, threadId);
}

const markReadByUser = (id) => db.prepare('UPDATE support_threads SET unread_user = 0 WHERE id = ?').run(id);
const markReadByAdmin = (id) => db.prepare('UPDATE support_threads SET unread_admin = 0 WHERE id = ?').run(id);
const setStatus = (id, status) => db.prepare('UPDATE support_threads SET status = ? WHERE id = ?').run(status, id);
const remove = (id) => db.prepare('DELETE FROM support_threads WHERE id = ?').run(id);
/** Сколько переписок ждут ответа (для значка в меню админки) */
const unreadCount = () => db.prepare(`SELECT COUNT(*) AS n FROM support_threads WHERE unread_admin > 0`).get().n;

function list({ status = 'open', q = '' } = {}) {
  const like = `%${q.toLowerCase()}%`;
  return db.prepare(`SELECT t.*, u.email, u.name,
      (SELECT text FROM support_messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_text,
      (SELECT from_admin FROM support_messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_from_admin,
      (SELECT COUNT(*) FROM support_messages m WHERE m.thread_id = t.id) AS total
    FROM support_threads t LEFT JOIN users u ON u.id = t.user_id
    WHERE (? = 'all' OR t.status = ?)
      AND (? = '' OR ulower(COALESCE(u.email, '')) LIKE ? OR ulower(t.contact) LIKE ? OR ulower(COALESCE(u.name, '')) LIKE ?
           OR EXISTS (SELECT 1 FROM support_messages m WHERE m.thread_id = t.id AND ulower(m.text) LIKE ?))
    ORDER BY (t.unread_admin > 0) DESC, t.updated DESC LIMIT 300`).all(status, status, q, like, like, like, like);
}

function get(id) {
  return db.prepare('SELECT t.*, u.email, u.name FROM support_threads t LEFT JOIN users u ON u.id = t.user_id WHERE t.id = ?').get(id) || null;
}

module.exports = { COOKIE, MAX_TEXT, findThread, createThread, messages, userMessage, adminMessage, markReadByUser, markReadByAdmin, setStatus, remove, unreadCount, list, get };
