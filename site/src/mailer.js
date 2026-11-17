// Отправка писем по SMTP (настройки — Админка → Настройки → «Почта»).
// Пока почта не настроена, письма просто не отправляются, а сайт работает как раньше.
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { db, settings, now } = require('./db');
const { esc } = require('./views/html');

db.exec(`
CREATE TABLE IF NOT EXISTS email_codes (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
`);
{
  // напоминание об окончании рекламы отправляется один раз на заказ
  const have = db.prepare('PRAGMA table_info(orders)').all().some((c) => c.name === 'notified_end');
  if (!have) db.exec('ALTER TABLE orders ADD COLUMN notified_end INTEGER NOT NULL DEFAULT 0');
}

const cfg = () => {
  const s = settings.all();
  const port = Number(s.smtp_port) || 465;
  return { host: (s.smtp_host || '').trim(), port, secure: port === 465, user: (s.smtp_user || '').trim(), pass: s.smtp_pass || '', from: (s.mail_from || s.smtp_user || '').trim() };
};
const enabled = () => { const c = cfg(); return Boolean(c.host && c.from); };

let cached = null, cachedKey = '';
function transport() {
  const c = cfg();
  const key = JSON.stringify(c);
  if (!cached || key !== cachedKey) {
    cached = nodemailer.createTransport({
      host: c.host, port: c.port, secure: c.secure,
      auth: c.user ? { user: c.user, pass: c.pass } : undefined,
      connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000,
    });
    cachedKey = key;
  }
  return cached;
}

const siteUrl = () => (settings.get('site_url') || '').replace(/\/$/, '');
const siteName = () => settings.get('site_name') || 'NLauncher';

/** Письмо в фирменном оформлении: заголовок, абзацы, кнопка */
function layout({ title, lines = [], button }) {
  const p = lines.map((l) => `<p style="margin:0 0 14px;color:#d8cdcf;font-size:15px;line-height:1.55">${l}</p>`).join('');
  const btn = button ? `<p style="margin:22px 0 6px"><a href="${esc(button.url)}" style="display:inline-block;background:#a3454f;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:12px">${esc(button.text)}</a></p>` : '';
  return `<!doctype html><html><body style="margin:0;background:#0c0a0b;padding:28px 12px;font-family:Segoe UI,Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;background:#171214;border-radius:18px;padding:28px">
<p style="margin:0 0 18px;font-weight:800;color:#c4747c;letter-spacing:.08em;font-size:12px;text-transform:uppercase">${esc(siteName())} · мониторинг серверов Minecraft</p>
<h1 style="margin:0 0 16px;color:#eee6e7;font-size:21px">${esc(title)}</h1>${p}${btn}
</div>
<p style="max-width:520px;margin:14px auto 0;color:#645a5c;font-size:12px;text-align:center">Письмо отправлено автоматически с ${esc(siteUrl().replace(/^https?:\/\//, ''))}. Отвечать на него не нужно.</p>
</body></html>`;
}
const toText = ({ title, lines = [], button }) => [title, '', ...lines.map((l) => l.replace(/<[^>]+>/g, '')), button ? `\n${button.text}: ${button.url}` : ''].join('\n');

/** Отправить письмо. Возвращает true/false, ошибку пишет в лог и не роняет запрос */
async function send(to, subject, content, { throwErrors = false } = {}) {
  if (!enabled() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to || ''))) return false;
  try {
    await transport().sendMail({ from: `"${siteName()}" <${cfg().from}>`, to, subject, html: layout(content), text: toText(content) });
    return true;
  } catch (e) {
    console.warn(`[mail] не отправлено на ${to}: ${e.message}`);
    if (throwErrors) throw e;
    return false;
  }
}

/* ---- восстановление пароля ---- */
const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');
function createReset(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('DELETE FROM password_resets WHERE user_id = ? OR expires < ?').run(userId, now());
  db.prepare('INSERT INTO password_resets (token_hash, user_id, expires) VALUES (?, ?, ?)').run(hash(token), userId, now() + 3600_000);
  return token;
}
function checkReset(token) {
  return db.prepare('SELECT * FROM password_resets WHERE token_hash = ? AND used = 0 AND expires > ?').get(hash(String(token || '')), now()) || null;
}
const useReset = (token) => db.prepare('UPDATE password_resets SET used = 1 WHERE token_hash = ?').run(hash(String(token || '')));

/* ---- подтверждение email кодом ---- */
const CODE_TTL = 15 * 60_000, RESEND_AFTER = 60_000, MAX_ATTEMPTS = 5;
/** Через сколько секунд можно отправить код ещё раз (0 — можно сейчас) */
function resendWait(userId) {
  const r = db.prepare('SELECT sent_at FROM email_codes WHERE user_id = ?').get(userId);
  return r ? Math.max(0, Math.ceil((r.sent_at + RESEND_AFTER - now()) / 1000)) : 0;
}
async function sendCode(user) {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  db.prepare(`INSERT INTO email_codes (user_id, code_hash, expires, attempts, sent_at) VALUES (?, ?, ?, 0, ?)
    ON CONFLICT(user_id) DO UPDATE SET code_hash = excluded.code_hash, expires = excluded.expires, attempts = 0, sent_at = excluded.sent_at`)
    .run(user.id, hash(`${user.id}:${code}`), now() + CODE_TTL, now());
  return mails.verifyCode(user, code);
}
/** 'ok' | 'wrong' | 'expired' | 'locked' */
function checkCode(userId, code) {
  const r = db.prepare('SELECT * FROM email_codes WHERE user_id = ?').get(userId);
  if (!r || r.expires < now()) return 'expired';
  if (r.attempts >= MAX_ATTEMPTS) return 'locked';
  if (r.code_hash !== hash(`${userId}:${String(code || '').replace(/\D/g, '')}`)) {
    db.prepare('UPDATE email_codes SET attempts = attempts + 1 WHERE user_id = ?').run(userId);
    return r.attempts + 1 >= MAX_ATTEMPTS ? 'locked' : 'wrong';
  }
  db.prepare('DELETE FROM email_codes WHERE user_id = ?').run(userId);
  db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
  return 'ok';
}

/* ---- готовые письма ---- */
const mails = {
  reset: (user, token) => send(user.email, 'Восстановление пароля', {
    title: 'Восстановление пароля',
    lines: [`Здравствуйте, ${esc(user.name || '')}! Кто-то (надеемся, вы) запросил смену пароля на сайте.`, 'Ссылка действует 1 час. Если вы ничего не запрашивали, просто проигнорируйте письмо — пароль не изменится.'],
    button: { text: 'Задать новый пароль', url: `${siteUrl()}/reset/${token}` },
  }),
  verifyCode: (user, code) => send(user.email, `Код подтверждения: ${code}`, {
    title: 'Подтвердите email',
    lines: [`Здравствуйте, ${esc(user.name || '')}! Ваш код для подтверждения почты:`,
      `<span style="display:inline-block;font-size:30px;font-weight:800;letter-spacing:.3em;color:#eee6e7;background:#241b1e;border-radius:12px;padding:12px 18px">${code}</span>`,
      'Код действует 15 минут. Если вы не регистрировались на сайте, просто проигнорируйте письмо.'],
  }),
  supportReply: (to, text) => send(to, 'Ответ поддержки', {
    title: 'Поддержка ответила на ваше сообщение',
    lines: [`«${esc(text.length > 400 ? `${text.slice(0, 400)}…` : text)}»`, 'Продолжить переписку можно на сайте: кнопка «Поддержка» внизу справа.'],
    button: { text: 'Открыть переписку', url: `${siteUrl()}/?support=1` },
  }),
  serverApproved: (to, s, url) => send(to, `Сервер ${s.name} опубликован`, {
    title: 'Сервер прошёл модерацию',
    lines: [`<b>${esc(s.name)}</b> (${esc(s.address)}) теперь в топе мониторинга. Игроки могут голосовать за него и заходить через NLauncher.`, 'Чтобы подняться выше, настройте награды за голоса через Votifier и разместите на своём сайте кнопку «Голосовать».'],
    button: { text: 'Открыть страницу сервера', url },
  }),
  serverRejected: (to, s, reason) => send(to, `Сервер ${s.name} не прошёл модерацию`, {
    title: 'Сервер не прошёл модерацию',
    lines: [`<b>${esc(s.name)}</b> (${esc(s.address)}) отклонён.`, reason ? `Причина: ${esc(reason)}` : 'Причина не указана.', 'Исправьте анкету в кабинете — сервер снова уйдёт на проверку. Если есть вопросы, напишите в поддержку на сайте.'],
    button: { text: 'Открыть кабинет', url: `${siteUrl()}/cabinet` },
  }),
  adEnding: (to, o, kindLabel, serverName) => send(to, `Реклама «${kindLabel}» заканчивается`, {
    title: 'Реклама скоро закончится',
    lines: [`«${esc(kindLabel)}» для сервера <b>${esc(serverName)}</b> закончится ${new Date(o.ends).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}.`, 'Продлите заранее — новый срок начнётся сразу после текущего, и сервер не потеряет место.'],
    button: { text: 'Продлить', url: `${siteUrl()}/cabinet/buy?server=${o.server_id}` },
  }),
  test: (to) => send(to, 'Тестовое письмо', { title: 'Почта настроена', lines: ['Если вы читаете это письмо, сайт умеет отправлять почту: восстановление пароля и уведомления работают.'] }, { throwErrors: true }),
};

/** Раз в час: напоминание владельцам, у кого реклама заканчивается в ближайшие 3 дня */
function startReminders(KINDS) {
  const run = async () => {
    if (!enabled()) return;
    const t = now();
    const list = db.prepare(`SELECT o.*, s.name AS server_name, u.email FROM orders o
      JOIN servers s ON s.id = o.server_id JOIN users u ON u.id = o.user_id
      WHERE o.status = 'paid' AND o.notified_end = 0 AND o.ends > ? AND o.ends <= ? AND o.ends - o.starts >= ?
        AND NOT EXISTS (SELECT 1 FROM orders n WHERE n.server_id = o.server_id AND n.kind = o.kind AND n.status = 'paid' AND n.starts >= o.ends - 60000)`)
      .all(t, t + 3 * 86400_000, 4 * 86400_000);
    for (const o of list) {
      db.prepare('UPDATE orders SET notified_end = 1 WHERE id = ?').run(o.id);
      await mails.adEnding(o.email, o, KINDS[o.kind]?.label || o.kind, o.server_name);
    }
  };
  setTimeout(() => run().catch((e) => console.warn('[mail]', e.message)), 20_000).unref();
  setInterval(() => run().catch((e) => console.warn('[mail]', e.message)), 3600_000).unref();
}

module.exports = { enabled, send, mails, createReset, checkReset, useReset, startReminders, sendCode, checkCode, resendWait };
