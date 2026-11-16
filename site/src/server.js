// NeoDev Мониторинг — сервер приложения
const path = require('path');
const crypto = require('crypto');
const express = require('express');

const { db, settings, now, DAY, KINDS, topServers, activeBanner, markPaid, monthStart, nextFreeStart, activeServices, ingameServers, logAdmin } = require('./db');
const auth = require('./auth');
const pinger = require('./pinger');
const yoomoney = require('./payments/yoomoney');
const heleket = require('./payments/heleket');
const { safeUrl } = require('./views/html');
const V = { pub: require('./views/public'), cab: require('./views/cabinet'), adm: require('./views/admin') };

const PORT = Number(process.env.PORT) || 3000;
const LAUNCHER_DOWNLOAD = process.env.LAUNCHER_DOWNLOAD_URL || 'https://github.com/Abaddon2908/crimson-launcher/releases/latest';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY : false);
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '7d' }));
app.use(express.urlencoded({ extended: false, limit: '64kb' }));
app.use(express.json({ limit: '64kb' }));
app.use((req, res, next) => {
  res.set({ 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
  next();
});
app.use(auth.sessions);
app.use(auth.csrf);

const send = (res, page, status = 200) => res.status(status).type('html').send(String(page));
const int = (v) => Number.parseInt(v, 10) || 0;
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const ADDR_RE = /^[A-Za-z0-9._-]+(:\d{1,5})?$/;

/** Простой ограничитель частоты по IP (в памяти) */
function limiter(windowMs, max) {
  const hits = new Map();
  setInterval(() => hits.clear(), windowMs).unref();
  return (req, res, next) => {
    const k = req.ip + req.path;
    const n = (hits.get(k) || 0) + 1;
    hits.set(k, n);
    if (n > max) return res.status(429).send('Слишком много попыток, подождите немного.');
    next();
  };
}

function siteStats() {
  const r = db.prepare(`SELECT COUNT(*) AS servers, COALESCE(SUM(players), 0) AS players FROM servers WHERE status = 'approved'`).get();
  r.votes = db.prepare('SELECT COUNT(*) AS n FROM votes WHERE ts >= ?').get(monthStart()).n;
  return r;
}

function productsWithAvailability(onlyActive = true) {
  const t = now();
  return db.prepare(`SELECT * FROM products ${onlyActive ? 'WHERE active = 1' : ''} ORDER BY sort, id`).all().map((p) => {
    const busy = db.prepare(`SELECT COUNT(*) AS n FROM orders WHERE kind = ? AND status = 'paid' AND starts <= ? AND ends > ?`).get(p.kind, t, t).n;
    return { ...p, free: p.slots ? p.slots - busy : Infinity, nextStart: nextFreeStart(p) };
  });
}

function bannerData() {
  const b = activeBanner();
  if (b) {
    const url = safeUrl(b.banner_url);
    return { paid: true, title: b.banner_title || b.server_name, text: b.banner_text, image: safeUrl(b.banner_image), href: url || `/server/${b.server_id}`, external: Boolean(url), cta: url ? 'Подробнее' : 'Смотреть сервер', address: b.address };
  }
  return { paid: false, title: settings.get('default_banner_title'), text: settings.get('default_banner_text'), image: '/assets/bg-banner.jpg', href: '/ads', external: false, cta: 'Разместить рекламу' };
}

/* ======================= Публичная часть ======================= */
app.get('/', (req, res) => {
  const q = str(req.query.q, 60);
  const tag = str(req.query.tag, 30);
  const servers = topServers({ q, tag });
  const tagCounts = {};
  for (const s of topServers({ limit: 500 })) for (const t of s.tagList) tagCounts[t] = (tagCounts[t] || 0) + 1;
  const tags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map((x) => x[0]);
  const news = db.prepare('SELECT * FROM news WHERE published = 1 ORDER BY created DESC LIMIT 3').all();
  send(res, V.pub.home(req, { servers, banner: bannerData(), stats: siteStats(), q, tag, tags, news }));
});

function loadServer(id) {
  const t = now();
  return db.prepare(`SELECT s.*,
      EXISTS (SELECT 1 FROM orders o WHERE o.server_id = s.id AND o.status = 'paid' AND o.kind = 'promo' AND o.starts <= ? AND o.ends > ?) AS promo
    FROM servers s WHERE s.id = ?`).get(t, t, id);
}

app.get('/server/:id', (req, res) => {
  const s = loadServer(int(req.params.id));
  const owner = s && req.user && (req.user.id === s.owner_id || req.user.role === 'admin');
  if (!s || (s.status !== 'approved' && !owner)) return send(res, V.pub.message(req, 'Сервер не найден', 'Возможно, он ещё на модерации или был удалён.'), 404);
  const range = ['day', 'week', 'month'].includes(req.query.range) ? req.query.range : 'day';
  const ms = { day: DAY, week: 7 * DAY, month: 30 * DAY }[range];
  const votes = db.prepare('SELECT COUNT(*) AS n FROM votes WHERE server_id = ? AND ts >= ?').get(s.id, monthStart()).n;
  const rank = s.status === 'approved' ? topServers({ limit: 1000 }).find((x) => x.id === s.id)?.rank : null;
  send(res, V.pub.server(req, { s, votes, points: pinger.history(s.id, ms, range === 'day' ? 48 : 56), range, voted: req.query.voted === '1', error: str(req.query.error), owner, rank }));
});

async function deliverVote(server, nickname, voteId) {
  const url = safeUrl(server.vote_webhook);
  if (!url) return;
  const timestamp = now();
  const signature = crypto.createHmac('sha256', server.vote_secret).update(`${nickname}:${timestamp}`).digest('hex');
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'NeoDev-Monitoring' }, body: JSON.stringify({ server_id: server.id, nickname, timestamp, signature }), signal: AbortSignal.timeout(8000) });
    if (r.ok) db.prepare('UPDATE votes SET delivered = 1 WHERE id = ?').run(voteId);
  } catch { /* сервер недоступен — голос всё равно засчитан */ }
}

app.post('/server/:id/vote', limiter(60_000, 10), (req, res) => {
  const s = db.prepare(`SELECT * FROM servers WHERE id = ? AND status = 'approved'`).get(int(req.params.id));
  if (!s) return res.redirect('/');
  const nick = str(req.body.nickname, 16);
  const back = (q) => res.redirect(`/server/${s.id}?${q}`);
  if (!/^[A-Za-z0-9_]{3,16}$/.test(nick)) return back(`error=${encodeURIComponent('Ник: 3–16 символов, латиница, цифры и _')}`);
  const since = now() - DAY;
  const dup = db.prepare('SELECT ts FROM votes WHERE server_id = ? AND (lower(nickname) = lower(?) OR ip = ?) AND ts > ? ORDER BY ts DESC LIMIT 1').get(s.id, nick, req.ip, since);
  if (dup) {
    const left = Math.ceil((dup.ts + DAY - now()) / 3600000);
    return back(`error=${encodeURIComponent(`Вы уже голосовали. Следующий голос — через ${left} ч.`)}`);
  }
  const r = db.prepare('INSERT INTO votes (server_id, nickname, ip, ts) VALUES (?, ?, ?, ?)').run(s.id, nick, req.ip, now());
  deliverVote(s, nick, r.lastInsertRowid);
  back('voted=1');
});

app.get('/ads', (req, res) => send(res, V.pub.ads(req, { products: productsWithAvailability(), stats: siteStats() })));
app.get('/launcher', (req, res) => send(res, V.pub.launcher(req, { downloadUrl: LAUNCHER_DOWNLOAD })));

/* ======================= Вход / регистрация ======================= */
const safeNext = (n) => (typeof n === 'string' && /^\/(?!\/)/.test(n) ? n : '/cabinet');
app.get('/login', (req, res) => send(res, V.pub.authForm(req, { mode: 'login', next: str(req.query.next) })));
app.get('/register', (req, res) => send(res, V.pub.authForm(req, { mode: 'register', next: str(req.query.next) })));

app.post('/login', limiter(15 * 60_000, 20), (req, res) => {
  const email = str(req.body.email, 120).toLowerCase();
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!u || !auth.checkPassword(req.body.password || '', u.pass)) return send(res, V.pub.authForm(req, { mode: 'login', error: 'Неверный email или пароль', values: { email }, next: str(req.body.next) }), 401);
  if (u.banned) return send(res, V.pub.authForm(req, { mode: 'login', error: 'Аккаунт заблокирован', values: { email } }), 403);
  res.login(u.id);
  res.redirect(safeNext(req.body.next));
});

app.post('/register', limiter(60 * 60_000, 10), (req, res) => {
  const name = str(req.body.name, 40);
  const email = str(req.body.email, 120).toLowerCase();
  const pw = String(req.body.password || '');
  const fail = (error) => send(res, V.pub.authForm(req, { mode: 'register', error, values: { name, email } }), 400);
  if (!name) return fail('Укажите имя');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Некорректный email');
  if (pw.length < 8) return fail('Пароль — минимум 8 символов');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return fail('Этот email уже зарегистрирован');
  const r = db.prepare('INSERT INTO users (email, name, pass, created) VALUES (?, ?, ?, ?)').run(email, name, auth.hashPassword(pw), now());
  res.login(Number(r.lastInsertRowid));
  res.redirect(safeNext(req.body.next) === '/cabinet' ? '/cabinet/servers/new' : safeNext(req.body.next));
});

app.post('/logout', (req, res) => { res.logout(); res.redirect('/'); });

/* ======================= Кабинет ======================= */
const cab = express.Router();
cab.use(auth.requireUser);

cab.get('/', (req, res) => {
  const t = now();
  const list = db.prepare(`SELECT s.*,
      (SELECT COUNT(*) FROM votes v WHERE v.server_id = s.id AND v.ts >= ?) AS votes,
      (SELECT MAX(ends) FROM orders o WHERE o.server_id = s.id AND o.kind = 'promo' AND o.status = 'paid' AND o.ends > ?) AS promo_until
    FROM servers s WHERE owner_id = ? ORDER BY created DESC`).all(monthStart(), t, req.user.id)
    .map((s) => ({ ...s, services: activeServices(s.id) }));
  send(res, V.cab.servers(req, { list, flash: req.query.saved ? 'Сохранено' : req.query.created ? 'Сервер отправлен на модерацию — обычно это занимает до суток.' : req.query.deleted ? 'Сервер удалён' : '' }));
});

function readServerForm(body) {
  return {
    name: str(body.name, 40), address: str(body.address, 80).toLowerCase(), version: str(body.version, 30),
    tags: str(body.tags, 100).split(',').map((t) => t.trim()).filter(Boolean).slice(0, 6).join(', '),
    description: str(body.description, 3000), website: safeUrl(body.website), discord: safeUrl(body.discord),
    banner: safeUrl(body.banner), vote_webhook: safeUrl(body.vote_webhook),
  };
}
function validateServer(d, selfId = 0) {
  if (!d.name) return 'Укажите название';
  if (!ADDR_RE.test(d.address)) return 'Некорректный IP-адрес';
  const dup = db.prepare('SELECT id FROM servers WHERE lower(address) = ? AND id != ?').get(d.address, selfId);
  if (dup) return 'Сервер с таким адресом уже есть в мониторинге';
  return '';
}

cab.get('/servers/new', (req, res) => send(res, V.cab.serverForm(req, { isNew: true })));
cab.post('/servers/new', limiter(60 * 60_000, 10), (req, res) => {
  const d = readServerForm(req.body);
  const err = validateServer(d);
  if (err) return send(res, V.cab.serverForm(req, { isNew: true, s: d, error: err }), 400);
  const r = db.prepare(`INSERT INTO servers (owner_id, name, address, version, tags, description, website, discord, banner, vote_webhook, vote_secret, created)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(req.user.id, d.name, d.address, d.version, d.tags, d.description, d.website, d.discord, d.banner, d.vote_webhook, crypto.randomBytes(24).toString('hex'), now());
  pinger.pingServer({ id: Number(r.lastInsertRowid), address: d.address }).catch(() => {});
  res.redirect('/cabinet?created=1');
});

function ownServer(req) {
  const s = db.prepare('SELECT * FROM servers WHERE id = ?').get(int(req.params.id));
  return s && (s.owner_id === req.user.id || req.user.role === 'admin') ? s : null;
}
cab.get('/servers/:id', (req, res) => {
  const s = ownServer(req);
  if (!s) return send(res, V.pub.message(req, 'Не найдено', 'Сервер не найден или принадлежит другому пользователю.'), 404);
  send(res, V.cab.serverForm(req, { s }));
});
cab.post('/servers/:id', (req, res) => {
  const s = ownServer(req);
  if (!s) return res.redirect('/cabinet');
  if (req.body._action === 'delete') {
    db.prepare('DELETE FROM servers WHERE id = ?').run(s.id);
    return res.redirect('/cabinet?deleted=1');
  }
  const d = readServerForm(req.body);
  const err = validateServer(d, s.id);
  if (err) return send(res, V.cab.serverForm(req, { s: { ...s, ...d }, error: err }), 400);
  const status = d.address !== s.address && req.user.role !== 'admin' ? 'pending' : s.status;
  db.prepare(`UPDATE servers SET name=?, address=?, version=?, tags=?, description=?, website=?, discord=?, banner=?, vote_webhook=?, status=? WHERE id=?`)
    .run(d.name, d.address, d.version, d.tags, d.description, d.website, d.discord, d.banner, d.vote_webhook, status, s.id);
  res.redirect('/cabinet?saved=1');
});

cab.get('/orders', (req, res) => {
  const list = db.prepare(`SELECT o.*, s.name AS server_name FROM orders o LEFT JOIN servers s ON s.id = o.server_id WHERE o.user_id = ? ORDER BY o.id DESC`).all(req.user.id);
  const paidId = int(req.query.paid);
  const paid = paidId && list.find((o) => o.id === paidId);
  send(res, V.cab.orders(req, { list, flash: paid ? (paid.status === 'paid' ? 'Оплата получена — реклама включена!' : 'Ждём подтверждения платежа от платёжной системы, обновите страницу через минуту.') : '' }));
});

function payMethods() {
  const m = [];
  if (yoomoney.enabled()) {
    m.push({ id: 'yoomoney_card', label: 'Банковская карта', note: 'через ЮMoney', icon: 'card' });
    m.push({ id: 'yoomoney_wallet', label: 'Кошелёк ЮMoney', note: 'оплата с баланса', icon: 'wallet' });
  }
  if (heleket.enabled()) m.push({ id: 'heleket', label: 'Криптовалюта', note: 'USDT, BTC, TON и др. · Heleket', icon: 'coin' });
  return m;
}

cab.get('/buy', (req, res) => {
  const servers = db.prepare(`SELECT id, name, address FROM servers WHERE owner_id = ? AND status = 'approved' ORDER BY name`).all(req.user.id);
  send(res, V.cab.buy(req, { servers, products: productsWithAvailability(), sel: { server: int(req.query.server), product: int(req.query.product) }, methods: payMethods() }));
});

cab.post('/buy', limiter(60_000, 15), (req, res) => {
  const server = db.prepare(`SELECT * FROM servers WHERE id = ? AND owner_id = ? AND status = 'approved'`).get(int(req.body.server_id), req.user.id);
  const product = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(int(req.body.product_id));
  const method = str(req.body.method, 20);
  const fail = (error) => {
    const servers = db.prepare(`SELECT id, name, address FROM servers WHERE owner_id = ? AND status = 'approved' ORDER BY name`).all(req.user.id);
    send(res, V.cab.buy(req, { servers, products: productsWithAvailability(), sel: { server: int(req.body.server_id), product: int(req.body.product_id) }, methods: payMethods(), error }), 400);
  };
  if (!server) return fail('Выберите сервер');
  if (!product) return fail('Выберите тариф');
  if (!payMethods().some((m) => m.id === method)) return fail('Выберите способ оплаты');
  const banner = product.kind === 'banner'
    ? { t: str(req.body.banner_title, 60) || server.name, x: str(req.body.banner_text, 140), i: safeUrl(req.body.banner_image), u: safeUrl(req.body.banner_url) }
    : { t: '', x: '', i: '', u: '' };
  const r = db.prepare(`INSERT INTO orders (user_id, server_id, product_id, kind, title, amount, days, provider, banner_title, banner_text, banner_image, banner_url, created)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(req.user.id, server.id, product.id, product.kind, product.title, product.price, product.days, method.startsWith('yoomoney') ? 'yoomoney' : 'heleket', banner.t, banner.x, banner.i, banner.u, now());
  res.redirect(`/cabinet/pay/${r.lastInsertRowid}?m=${method}`);
});

cab.get('/pay/:id', async (req, res) => {
  const o = db.prepare(`SELECT * FROM orders WHERE id = ? AND user_id = ? AND status = 'pending'`).get(int(req.params.id), req.user.id);
  if (!o) return res.redirect('/cabinet/orders');
  const m = str(req.query.m) || (o.provider === 'heleket' ? 'heleket' : 'yoomoney_card');
  try {
    if (m === 'heleket' && heleket.enabled()) {
      const inv = await heleket.createInvoice(o);
      db.prepare(`UPDATE orders SET provider = 'heleket', provider_ref = ? WHERE id = ?`).run(inv.ref, o.id);
      return res.redirect(inv.url);
    }
    if (m.startsWith('yoomoney') && yoomoney.enabled()) {
      db.prepare(`UPDATE orders SET provider = 'yoomoney' WHERE id = ?`).run(o.id);
      const f = yoomoney.checkoutForm(o, { method: m === 'yoomoney_wallet' ? 'PC' : 'AC' });
      const inputs = Object.entries(f.fields).map(([k, v]) => `<input type="hidden" name="${k}" value="${String(v).replace(/"/g, '&quot;')}">`).join('');
      return res.type('html').send(`<!doctype html><meta charset="utf-8"><title>Переход к оплате…</title><body style="background:#0c0a0b;color:#eee;font:16px system-ui;display:grid;place-items:center;height:100vh">Переходим к оплате…<form id="f" method="post" action="${f.action}">${inputs}<noscript><button>Оплатить</button></noscript></form><script src="/autosubmit.js"></script></body>`);
    }
    throw new Error('Способ оплаты недоступен');
  } catch (e) {
    console.error('[pay]', e.message);
    send(res, V.pub.message(req, 'Оплата недоступна', `Не удалось создать платёж: ${e.message}. Попробуйте другой способ или позже.`), 502);
  }
});

app.use('/cabinet', cab);

/* ======================= Вебхуки платёжек ======================= */
function applyPayment(orderId, provider, ref, paidAmount) {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!o) return console.warn(`[pay] неизвестный заказ ${orderId}`);
  if (o.status === 'cancelled') return console.warn(`[pay] оплата отменённого заказа ${orderId} — проверьте вручную`);
  if (paidAmount != null && paidAmount + 0.01 < o.amount) return console.warn(`[pay] заказ ${orderId}: оплачено ${paidAmount} < ${o.amount}`);
  markPaid(orderId, provider, ref);
  console.log(`[pay] заказ ${orderId} оплачен через ${provider}`);
}

app.post('/pay/yoomoney/notify', (req, res) => {
  const v = yoomoney.verify(req.body || {});
  if (!v) { console.warn('[yoomoney] неверная подпись уведомления'); return res.status(400).end(); }
  applyPayment(v.orderId, 'yoomoney', v.ref, v.paidAmount);
  res.status(200).end();
});

app.post('/pay/heleket/webhook', async (req, res) => {
  const v = await heleket.verify(req.body);
  if (!v) { console.warn('[heleket] неверная подпись вебхука'); return res.status(400).end(); }
  if (v.paid) applyPayment(v.orderId, 'heleket', v.ref, null);
  res.status(200).json({ ok: true });
});

/* ======================= API для NLauncher ======================= */
app.get(['/api/launcher/feed.json', '/api/launcher/feed'], (req, res) => {
  const b = bannerData();
  const top = topServers({ limit: 20 });
  res.set('Cache-Control', 'public, max-age=60').json({
    banner: { title: b.title, text: b.text, cta: b.cta, url: b.href.startsWith('/') ? settings.get('site_url').replace(/\/$/, '') + b.href : b.href, image: b.image?.startsWith('/') ? settings.get('site_url').replace(/\/$/, '') + b.image : b.image },
    news: db.prepare('SELECT title, text, url, created FROM news WHERE published = 1 ORDER BY created DESC LIMIT 5').all()
      .map((n) => ({ title: n.title, text: n.text, url: safeUrl(n.url) || null, date: new Date(n.created).toISOString().slice(0, 10) })),
    promoted: top.filter((s) => s.promo).map((s) => ({ name: s.name, address: s.address, desc: s.description.split('\n')[0].slice(0, 80) || s.motd, tag: 'Промо', ad: true })),
    top: top.filter((s) => !s.promo).slice(0, 10).map((s) => ({ name: s.name, address: s.address, tag: s.tagList[0] || `#${s.rank}`, votes: s.votes })),
    // «Сервер в игре»: лаунчер добавит их в начало списка «Сетевая игра» (иконка — PNG base64 из пинга)
    ingame: ingameServers().map((s) => ({ name: s.name, address: s.address, icon: s.favicon.startsWith('data:image/png;base64,') ? s.favicon.slice(22) : '' })),
    site: settings.get('site_url'),
  });
});

app.get('/api/servers', (req, res) => {
  res.set('Cache-Control', 'public, max-age=60').json(topServers({ limit: 100 }).map((s) => ({
    id: s.id, rank: s.rank, name: s.name, address: s.address, online: Boolean(s.online), players: s.players, max: s.max_players, votes: s.votes, promo: Boolean(s.promo), tags: s.tagList,
  })));
});

/* ======================= Админка ======================= */
const adm = express.Router();
adm.use(auth.requireAdmin);
const flashOf = (req) => ({
  ok: 'Готово', saved: 'Сохранено', granted: 'Услуга выдана и уже работает',
  nouser: '⚠ Пользователь с таким email не найден — владелец не изменён',
  shortpw: '⚠ Пароль не изменён: нужно минимум 8 символов',
}[req.query.f] || '');
const audit = (req, action, details) => logAdmin(req.user.id, action, details);
const serverName = (id) => db.prepare('SELECT name FROM servers WHERE id = ?').get(id)?.name || `#${id}`;
const like = (q) => `%${q}%`;

adm.get('/', (req, res) => {
  const t = now();
  const sum = (from) => db.prepare(`SELECT COALESCE(SUM(amount), 0) AS s FROM orders WHERE status = 'paid' AND paid_at >= ?`).get(from).s;
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const revenueDays = Array.from({ length: 30 }, (_, i) => {
    const from = d0.getTime() - (29 - i) * DAY;
    return { t: from, v: db.prepare(`SELECT COALESCE(SUM(amount), 0) AS s FROM orders WHERE status = 'paid' AND paid_at >= ? AND paid_at < ?`).get(from, from + DAY).s };
  });
  const st = siteStats();
  send(res, V.adm.dashboard(req, {
    revenueMonth: sum(monthStart()), revenueTotal: sum(0), revenueDays,
    paidOrders: db.prepare(`SELECT COUNT(*) AS n FROM orders WHERE status = 'paid'`).get().n,
    pendingOrders: db.prepare(`SELECT COUNT(*) AS n FROM orders WHERE status = 'pending'`).get().n,
    servers: db.prepare(`SELECT COUNT(*) AS n FROM servers WHERE status = 'approved'`).get().n,
    pendingServers: db.prepare(`SELECT COUNT(*) AS n FROM servers WHERE status = 'pending'`).get().n,
    users: db.prepare('SELECT COUNT(*) AS n FROM users').get().n,
    players: st.players, votes: st.votes,
    active: db.prepare(`SELECT o.*, s.name AS server_name FROM orders o LEFT JOIN servers s ON s.id = o.server_id WHERE o.status = 'paid' AND o.starts <= ? AND o.ends > ? ORDER BY o.ends`).all(t, t),
    recent: db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 8').all(),
    flash: flashOf(req),
  }));
});

/* ---- сервера ---- */
adm.get('/servers', (req, res) => {
  const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : '';
  const q = str(req.query.q, 80);
  const list = db.prepare(`SELECT s.*, u.email AS owner_email, (SELECT COUNT(*) FROM votes v WHERE v.server_id = s.id AND v.ts >= ?) AS votes
    FROM servers s LEFT JOIN users u ON u.id = s.owner_id
    WHERE (? = '' OR s.status = ?) AND (? = '' OR s.name LIKE ? OR s.address LIKE ? OR u.email LIKE ?)
    ORDER BY (s.status = 'pending') DESC, s.created DESC LIMIT 500`).all(monthStart(), status, status, q, like(q), like(q), like(q))
    .map((s) => ({ ...s, services: activeServices(s.id) }));
  send(res, V.adm.servers(req, { list, status, q, flash: flashOf(req) }));
});

adm.get('/servers/:id', (req, res) => {
  const s = db.prepare('SELECT * FROM servers WHERE id = ?').get(int(req.params.id));
  if (!s) return res.redirect('/admin/servers');
  const ms = monthStart();
  send(res, V.adm.serverDetail(req, {
    s,
    owner: s.owner_id ? db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(s.owner_id) : null,
    services: activeServices(s.id),
    orders: db.prepare('SELECT * FROM orders WHERE server_id = ? ORDER BY id DESC LIMIT 50').all(s.id),
    votes: db.prepare('SELECT * FROM votes WHERE server_id = ? ORDER BY ts DESC LIMIT 15').all(s.id),
    voteStats: {
      month: db.prepare('SELECT COUNT(*) AS n FROM votes WHERE server_id = ? AND ts >= ?').get(s.id, ms).n,
      day: db.prepare('SELECT COUNT(*) AS n FROM votes WHERE server_id = ? AND ts >= ?').get(s.id, now() - DAY).n,
      ips: db.prepare('SELECT COUNT(DISTINCT ip) AS n FROM votes WHERE server_id = ? AND ts >= ?').get(s.id, ms).n,
      topIps: db.prepare('SELECT ip, COUNT(*) AS n FROM votes WHERE server_id = ? AND ts >= ? GROUP BY ip HAVING n > 1 ORDER BY n DESC LIMIT 5').all(s.id, ms),
    },
    flash: flashOf(req),
  }));
});

/** Вернуться на страницу админки, с которой пришли (только внутри /admin) */
function backTo(req, fallback) {
  try {
    const u = new URL(req.get('referer') || '', 'http://local');
    if (/^\/admin(\/|$)/.test(u.pathname)) return u.pathname + u.search;
  } catch { /* битый referer */ }
  return fallback;
}

adm.post('/servers/:id/approve', (req, res) => {
  const id = int(req.params.id);
  db.prepare(`UPDATE servers SET status = 'approved', reject_reason = '' WHERE id = ?`).run(id);
  audit(req, 'Одобрил сервер', serverName(id));
  res.redirect(backTo(req, '/admin/servers'));
});
adm.post('/servers/:id/reject', (req, res) => {
  const id = int(req.params.id);
  db.prepare(`UPDATE servers SET status = 'rejected', reject_reason = ? WHERE id = ?`).run(str(req.body.reason, 300), id);
  audit(req, 'Отклонил сервер', `${serverName(id)}: ${str(req.body.reason, 200)}`);
  res.redirect(backTo(req, '/admin/servers'));
});
adm.post('/servers/:id/delete', (req, res) => {
  const id = int(req.params.id);
  audit(req, 'Удалил сервер', serverName(id));
  db.prepare('DELETE FROM servers WHERE id = ?').run(id);
  res.redirect('/admin/servers?f=ok');
});
adm.post('/servers/:id/owner', (req, res) => {
  const id = int(req.params.id);
  const u = db.prepare('SELECT id, email FROM users WHERE email = ?').get(str(req.body.email, 120).toLowerCase());
  if (u) { db.prepare('UPDATE servers SET owner_id = ? WHERE id = ?').run(u.id, id); audit(req, 'Сменил владельца', `${serverName(id)} → ${u.email}`); }
  res.redirect(`/admin/servers/${id}?f=${u ? 'saved' : 'nouser'}`);
});
adm.post('/servers/:id/reset-votes', (req, res) => {
  const id = int(req.params.id);
  const r = db.prepare('DELETE FROM votes WHERE server_id = ? AND ts >= ?').run(id, monthStart());
  audit(req, 'Обнулил голоса за месяц', `${serverName(id)}: ${r.changes}`);
  res.redirect(`/admin/servers/${id}?f=ok`);
});
adm.post('/servers/:id/delete-ip-votes', (req, res) => {
  const id = int(req.params.id);
  const ip = str(req.body.ip, 60);
  const r = db.prepare('DELETE FROM votes WHERE server_id = ? AND ip = ?').run(id, ip);
  audit(req, 'Удалил голоса по IP', `${serverName(id)}: ${ip} (${r.changes})`);
  res.redirect(`/admin/servers/${id}?f=ok`);
});
adm.post('/votes/:id/delete', (req, res) => {
  const v = db.prepare('SELECT * FROM votes WHERE id = ?').get(int(req.params.id));
  if (v) { db.prepare('DELETE FROM votes WHERE id = ?').run(v.id); audit(req, 'Удалил голос', `${serverName(v.server_id)}: ${v.nickname}`); }
  res.redirect(v ? `/admin/servers/${v.server_id}?f=ok` : '/admin/servers');
});

/* ---- выдача любой услуги ---- */
function kindDefaults() {
  const out = {};
  for (const k of Object.keys(KINDS)) out[k] = db.prepare('SELECT days FROM products WHERE kind = ? AND active = 1 ORDER BY price LIMIT 1').get(k)?.days || 7;
  return out;
}
const allServersForAdmin = () => db.prepare(`SELECT id, name, address, status FROM servers ORDER BY (status = 'approved') DESC, name`).all();

adm.get('/grant', (req, res) => {
  send(res, V.adm.grant(req, { servers: allServersForAdmin(), sel: { server: int(req.query.server), kind: str(req.query.kind, 20) }, kindDefaults: kindDefaults() }));
});
adm.post('/grant', (req, res) => {
  const s = db.prepare('SELECT * FROM servers WHERE id = ?').get(int(req.body.server_id));
  const kind = str(req.body.kind, 20);
  const days = int(req.body.days);
  const amount = Math.max(0, int(req.body.amount));
  const fail = (error) => send(res, V.adm.grant(req, { servers: allServersForAdmin(), sel: { server: int(req.body.server_id), kind, days }, kindDefaults: kindDefaults(), error }), 400);
  if (!s) return fail('Выберите сервер');
  if (!KINDS[kind]) return fail('Выберите услугу');
  if (!(days >= 1 && days <= 3650)) return fail('Срок — от 1 до 3650 дней');
  const product = db.prepare('SELECT id FROM products WHERE kind = ? ORDER BY active DESC, price LIMIT 1').get(kind);
  const b = kind === 'banner'
    ? { t: str(req.body.banner_title, 60) || s.name, x: str(req.body.banner_text, 140), i: safeUrl(req.body.banner_image), u: safeUrl(req.body.banner_url) }
    : { t: '', x: '', i: '', u: '' };
  const r = db.prepare(`INSERT INTO orders (user_id, server_id, product_id, kind, title, amount, days, provider, banner_title, banner_text, banner_image, banner_url, note, created)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?, ?, ?, ?, ?)`)
    .run(s.owner_id, s.id, product?.id ?? null, kind, `${KINDS[kind].label} — ${days} дн. (выдано админом)`, amount, days, b.t, b.x, b.i, b.u, str(req.body.note, 200), now());
  const o = markPaid(Number(r.lastInsertRowid), 'manual', `admin:${req.user.id}`, { startNow: Boolean(req.body.start_now) });
  audit(req, 'Выдал услугу', `${KINDS[kind].label} на ${days} дн. → ${s.name}${amount ? `, ${amount} ₽` : ''} (заказ #${o.id})`);
  res.redirect(`/admin/servers/${s.id}?f=granted`);
});

/* ---- заказы ---- */
function ordersQuery(status, q, limit = 300) {
  const t = now();
  const cond = status === 'active' ? `o.status = 'paid' AND o.starts <= ${t} AND o.ends > ${t}` : status ? 'o.status = ?' : '1=1';
  const params = status && status !== 'active' ? [status] : [];
  const idq = /^#?\d+$/.test(q) ? int(q.replace('#', '')) : -1;
  return db.prepare(`SELECT o.*, s.name AS server_name, u.email AS user_email FROM orders o
    LEFT JOIN servers s ON s.id = o.server_id LEFT JOIN users u ON u.id = o.user_id
    WHERE ${cond} AND (? = '' OR o.id = ? OR s.name LIKE ? OR s.address LIKE ? OR u.email LIKE ?) ORDER BY o.id DESC LIMIT ${limit}`)
    .all(...params, q, idq, like(q), like(q), like(q));
}
adm.get('/orders', (req, res) => {
  const status = ['pending', 'paid', 'cancelled', 'active'].includes(req.query.status) ? req.query.status : '';
  const q = str(req.query.q, 80);
  send(res, V.adm.orders(req, { list: ordersQuery(status, q), status, q, flash: flashOf(req) }));
});
adm.get('/orders.csv', (req, res) => {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const d = (t) => (t ? new Date(t).toISOString().replace('T', ' ').slice(0, 16) : '');
  const rows = ordersQuery('', '', 100000).map((o) => [o.id, d(o.created), o.user_email, o.server_name, o.kind, o.title, o.amount, o.provider, o.status, d(o.paid_at), d(o.starts), d(o.ends), o.note].map(cell).join(';'));
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"` })
    .send('﻿' + ['id;создан;покупатель;сервер;вид;услуга;сумма;оплата;статус;оплачен;начало;конец;комментарий', ...rows].join('\r\n'));
});
adm.post('/orders/:id/paid', (req, res) => {
  const o = markPaid(int(req.params.id), 'manual', `admin:${req.user.id}`);
  if (o) audit(req, 'Подтвердил оплату вручную', `заказ #${o.id}, ${o.amount} ₽`);
  res.redirect(backTo(req, '/admin/orders?f=ok'));
});
adm.post('/orders/:id/cancel', (req, res) => {
  const id = int(req.params.id);
  db.prepare(`UPDATE orders SET status = 'cancelled' WHERE id = ?`).run(id);
  audit(req, 'Отменил заказ', `#${id}`);
  res.redirect(backTo(req, '/admin/orders?f=ok'));
});
adm.post('/orders/:id/extend', (req, res) => {
  const id = int(req.params.id);
  const days = Number.parseInt(req.body.days, 10);
  const o = db.prepare(`SELECT * FROM orders WHERE id = ? AND status = 'paid'`).get(id);
  if (o && days && Math.abs(days) <= 3650) {
    const ends = Math.max(now(), o.ends + days * DAY);
    db.prepare('UPDATE orders SET ends = ?, days = days + ? WHERE id = ?').run(ends, days, id);
    audit(req, days > 0 ? 'Продлил услугу' : 'Сократил услугу', `заказ #${id} (${serverName(o.server_id)}): ${days > 0 ? '+' : ''}${days} дн.`);
  }
  res.redirect(backTo(req, '/admin/orders?f=ok'));
});
adm.post('/orders/:id/end', (req, res) => {
  const id = int(req.params.id);
  const o = db.prepare(`SELECT * FROM orders WHERE id = ? AND status = 'paid'`).get(id);
  if (o) { db.prepare('UPDATE orders SET ends = ? WHERE id = ?').run(Math.max(o.starts, now()), id); audit(req, 'Завершил услугу досрочно', `заказ #${id} (${serverName(o.server_id)})`); }
  res.redirect(backTo(req, '/admin/orders?f=ok'));
});

/* ---- тарифы ---- */
adm.get('/products', (req, res) => send(res, V.adm.products(req, { list: db.prepare('SELECT * FROM products ORDER BY sort, id').all(), flash: flashOf(req) })));
adm.post('/products/new', (req, res) => {
  const kind = KINDS[req.body.kind] ? req.body.kind : 'promo';
  const title = str(req.body.title, 80) || 'Тариф';
  db.prepare('INSERT INTO products (code, kind, title, price, days, slots, sort) VALUES (?, ?, ?, ?, ?, ?, 99)')
    .run(`${kind}_${crypto.randomBytes(3).toString('hex')}`, kind, title, Math.max(1, int(req.body.price)), Math.max(1, int(req.body.days)), kind === 'banner' ? 1 : kind === 'ingame' ? 3 : 0);
  audit(req, 'Добавил тариф', title);
  res.redirect('/admin/products?f=saved');
});
adm.post('/products/:id', (req, res) => {
  const title = str(req.body.title, 80);
  db.prepare('UPDATE products SET title = ?, description = ?, price = ?, days = ?, slots = ?, active = ? WHERE id = ?')
    .run(title, str(req.body.description, 300), Math.max(1, int(req.body.price)), Math.max(1, int(req.body.days)), Math.max(0, int(req.body.slots)), req.body.active ? 1 : 0, int(req.params.id));
  audit(req, 'Изменил тариф', `${title}: ${int(req.body.price)} ₽ / ${int(req.body.days)} дн.${req.body.active ? '' : ' (снят с продажи)'}`);
  res.redirect('/admin/products?f=saved');
});

/* ---- новости ---- */
adm.get('/news', (req, res) => send(res, V.adm.news(req, { list: db.prepare('SELECT * FROM news ORDER BY created DESC').all(), flash: flashOf(req) })));
adm.post('/news', (req, res) => {
  const title = str(req.body.title, 80);
  if (title) { db.prepare('INSERT INTO news (title, text, url, created) VALUES (?, ?, ?, ?)').run(title, str(req.body.text, 400), safeUrl(req.body.url), now()); audit(req, 'Опубликовал новость', title); }
  res.redirect('/admin/news?f=saved');
});
adm.post('/news/:id/toggle', (req, res) => { db.prepare('UPDATE news SET published = 1 - published WHERE id = ?').run(int(req.params.id)); res.redirect('/admin/news'); });
adm.post('/news/:id/delete', (req, res) => { db.prepare('DELETE FROM news WHERE id = ?').run(int(req.params.id)); audit(req, 'Удалил новость', `#${int(req.params.id)}`); res.redirect('/admin/news?f=ok'); });

/* ---- пользователи ---- */
adm.get('/users', (req, res) => {
  const q = str(req.query.q, 80);
  const list = db.prepare(`SELECT u.*, (SELECT COUNT(*) FROM servers s WHERE s.owner_id = u.id) AS servers,
    (SELECT COALESCE(SUM(amount), 0) FROM orders o WHERE o.user_id = u.id AND o.status = 'paid') AS spent
    FROM users u WHERE (? = '' OR u.email LIKE ? OR u.name LIKE ?) ORDER BY u.id DESC LIMIT 500`).all(q, like(q), like(q));
  send(res, V.adm.users(req, { list, q, flash: flashOf(req) }));
});
const userEmail = (id) => db.prepare('SELECT email FROM users WHERE id = ?').get(id)?.email || `#${id}`;
adm.post('/users/:id/role', (req, res) => {
  const id = int(req.params.id);
  if (id !== req.user.id) { db.prepare(`UPDATE users SET role = CASE role WHEN 'admin' THEN 'user' ELSE 'admin' END WHERE id = ?`).run(id); audit(req, 'Изменил роль', userEmail(id)); }
  res.redirect(backTo(req, '/admin/users?f=ok'));
});
adm.post('/users/:id/ban', (req, res) => {
  const id = int(req.params.id);
  if (id !== req.user.id) { db.prepare('UPDATE users SET banned = 1 - banned WHERE id = ?').run(id); audit(req, 'Бан / разбан', userEmail(id)); }
  res.redirect(backTo(req, '/admin/users?f=ok'));
});
adm.post('/users/:id/password', (req, res) => {
  const id = int(req.params.id);
  const pw = String(req.body.password || '');
  if (pw.length >= 8) { db.prepare('UPDATE users SET pass = ? WHERE id = ?').run(auth.hashPassword(pw), id); audit(req, 'Сменил пароль пользователю', userEmail(id)); }
  res.redirect(`/admin/users?f=${pw.length >= 8 ? 'saved' : 'shortpw'}`);
});

/* ---- журнал ---- */
adm.get('/log', (req, res) => {
  const list = db.prepare('SELECT l.*, u.email AS admin_email FROM admin_log l LEFT JOIN users u ON u.id = l.admin_id ORDER BY l.id DESC LIMIT 500').all();
  send(res, V.adm.log(req, { list }));
});

/* ---- настройки ---- */
const SETTING_KEYS = ['site_name', 'site_url', 'default_banner_title', 'default_banner_text', 'yoomoney_wallet', 'yoomoney_secret', 'heleket_merchant', 'heleket_api_key'];
adm.get('/settings', (req, res) => {
  const site = settings.get('site_url').replace(/\/$/, '');
  send(res, V.adm.settingsPage(req, { s: settings.all(), flash: flashOf(req), hooks: { yoomoney: `${site}/pay/yoomoney/notify`, heleket: `${site}/pay/heleket/webhook`, feed: `${site}/api/launcher/feed.json` } }));
});
adm.post('/settings', (req, res) => {
  const changed = SETTING_KEYS.filter((k) => k in req.body && settings.get(k) !== str(req.body[k], 300));
  for (const k of changed) settings.set(k, str(req.body[k], 300));
  if (changed.length) audit(req, 'Изменил настройки', changed.map((k) => (/secret|key/.test(k) ? `${k} (скрыто)` : k)).join(', '));
  res.redirect('/admin/settings?f=saved');
});

app.use('/admin', adm);

app.use((req, res) => send(res, V.pub.message(req, 'Страница не найдена', 'Такой страницы нет — возможно, ссылка устарела.'), 404));
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).send('Внутренняя ошибка сервера');
});

auth.bootstrapAdmin();
if (process.env.NODE_ENV !== 'test') {
  pinger.start();
  app.listen(PORT, () => console.log(`NeoDev Мониторинг: http://localhost:${PORT}`));
}

module.exports = app;
