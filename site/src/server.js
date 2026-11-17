// NLauncher — мониторинг серверов Minecraft, сервер приложения
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const compression = require('compression');

const { db, settings, now, DAY, KINDS, topServers, activeBanner, markPaid, monthStart, nextFreeStart, activeServices, ingameServers, logAdmin } = require('./db');
const auth = require('./auth');
const pinger = require('./pinger');
const support = require('./support');
const notify = require('./adminNotify');
const mailer = require('./mailer');
const yoomoney = require('./payments/yoomoney');
const heleket = require('./payments/heleket');
const { safeUrl, fmt } = require('./views/html');
const { serverPath, slugify, abs } = require('./seo');
const V = { pub: require('./views/public'), cab: require('./views/cabinet'), adm: require('./views/admin') };
const stats = require('./stats');
const votifier = require('./votifier');
const tags = require('./tags');
const srvstats = require('./srvstats');
const pricing = require('./pricing');

const PORT = Number(process.env.PORT) || 3000;
const LAUNCHER_DOWNLOAD = process.env.LAUNCHER_DOWNLOAD_URL || 'https://github.com/Abaddon2908/crimson-launcher/releases/latest';

// Загрузки лаунчера: файлы лежат в data/downloads (загружаются через админку или по SFTP)
const DOWNLOADS = path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'downloads');
fs.mkdirSync(DOWNLOADS, { recursive: true });
const FILE_RE = /^[\w.\- ()]+\.(exe|zip|dmg|appimage|deb|msi)$/i;
const cmpVer = (a, b) => {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
};
function launcherFiles() {
  return fs.readdirSync(DOWNLOADS, { withFileTypes: true })
    .filter((d) => d.isFile() && FILE_RE.test(d.name))
    .map((d) => {
      const st = fs.statSync(path.join(DOWNLOADS, d.name));
      const m = /(setup|portable).*?(\d+\.\d+\.\d+)/i.exec(d.name) || /(\d+\.\d+\.\d+)/.exec(d.name);
      const kind = /portable/i.test(d.name) ? 'portable' : 'setup';
      return { name: d.name, size: st.size, mtime: st.mtimeMs, kind, version: m ? m[m.length - 1] : null, url: `/downloads/${encodeURIComponent(d.name)}` };
    })
    .sort((a, b) => b.mtime - a.mtime);
}
/** Последняя версия: по номеру версии в имени файла, иначе — самый свежий .exe */
function latestLauncher() {
  const files = launcherFiles().filter((f) => /\.exe$/i.test(f.name));
  const setups = files.filter((f) => f.kind === 'setup');
  const versioned = setups.filter((f) => f.version).sort((a, b) => cmpVer(b.version, a.version));
  const setup = versioned[0] || setups[0] || files[0];
  if (!setup) return null;
  const portable = files.find((f) => f.kind === 'portable' && f.version && f.version === setup.version) || (!setup.version && files.find((f) => f.kind === 'portable'));
  return { version: setup.version, setup: setup.url, portable: portable ? portable.url : null, size: setup.size, date: setup.mtime };
}

const app = express();
app.disable('x-powered-by');
app.use(compression()); // gzip: страницы и стили грузятся в 3–5 раз быстрее
app.set('trust proxy', process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY : false);
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '7d' }));
// считаем скачивания установщика (одно на IP в день)
app.use('/downloads', (req, res, next) => {
  if (req.method === 'GET' && /\.(exe|msi|zip)$/i.test(req.path)) stats.trackDownload(req.ip, req.get('user-agent'), req.get('range'));
  next();
});
app.use('/downloads', express.static(DOWNLOADS, { maxAge: '1h', dotfiles: 'deny', setHeaders: (res) => res.set('Content-Disposition', 'attachment') }));
app.use(express.urlencoded({ extended: false, limit: '64kb' }));
app.use(express.json({ limit: '64kb' }));
app.use((req, res, next) => {
  res.set({ 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
  next();
});
// закрытые разделы — запрет индексации и заголовком (на случай, если поисковик пришёл по ссылке)
app.use(/^\/(admin|cabinet|login|register|pay)(\/|$)/, (req, res, next) => { res.set('X-Robots-Tag', 'noindex, nofollow'); next(); });
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
    return { paid: true, title: b.banner_title || b.server_name, text: b.banner_text, image: safeUrl(b.banner_image), href: url || serverPath({ id: b.server_id, name: b.server_name }), external: Boolean(url), cta: url ? 'Подробнее' : 'Смотреть сервер', address: b.address };
  }
  return { paid: false, title: settings.get('default_banner_title'), text: settings.get('default_banner_text'), image: '/assets/bg-banner.jpg', href: '/ads', external: false, cta: 'Разместить рекламу' };
}

/* ======================= Публичная часть ======================= */
/* ---- подборки: /servera-vyzhivanie/, /servera-1.21/, каталог /servera/ ---- */
function catalogCounts() {
  const all = topServers({ limit: 100000 });
  const byTag = {};
  for (const s of all) for (const t of s.tagList) byTag[t] = (byTag[t] || 0) + 1;
  const byVer = {};
  for (const v of tags.VERSIONS) byVer[v] = all.filter((s) => tags.serverSupports(s, v)).length;
  return { all, byTag, byVer };
}
app.get(['/servera', '/servera/'], (req, res) => {
  const { all, byTag, byVer } = catalogCounts();
  send(res, V.pub.catalog(req, { total: all.length, byTag, byVer }));
});
app.get('/servera-:slug', (req, res, next) => {
  const slug = String(req.params.slug).replace(/\/$/, '');
  if (!req.path.endsWith('/')) return res.redirect(301, `/servera-${slug}/`);
  const tag = tags.BY_SLUG.get(slug);
  const version = !tag && tags.isVersion(slug) ? slug : null;
  if (!tag && !version) return next();
  const all = topServers({ limit: 100000 });
  const list = tag ? all.filter((s) => s.tagList.some((t) => t.toLowerCase() === tag.name.toLowerCase())) : all.filter((s) => tags.serverSupports(s, version));
  // соседние подборки для перелинковки
  const { byTag } = catalogCounts();
  const related = tag
    ? tags.TAGS.filter((t) => t.group === tag.group && t.slug !== tag.slug && byTag[t.name]).slice(0, 12)
    : tags.VERSIONS.filter((v) => v !== version && Math.abs(tags.VERSIONS.indexOf(v) - tags.VERSIONS.indexOf(version)) <= 4);
  send(res, V.pub.listPage(req, { tag, version, servers: list.slice(0, 200), total: list.length, related, byTag }));
});
app.get('/new', (req, res) => {
  const list = topServers({ limit: 100000 }).filter((s) => s.created > now() - 30 * DAY).sort((a, b) => b.created - a.created);
  send(res, V.pub.listPage(req, { fresh: true, servers: list.slice(0, 100), total: list.length, related: [] }));
});
app.get('/favorites', (req, res) => send(res, V.pub.favorites(req)));
app.get('/favorites/list', (req, res) => {
  const ids = String(req.query.ids || '').split(',').map(Number).filter((x) => x > 0).slice(0, 100);
  const all = topServers({ limit: 100000 });
  const list = ids.map((id) => all.find((s) => s.id === id)).filter(Boolean);
  res.type('html').send(String(V.pub.serverRows(list)));
});
app.get('/votifier', (req, res) => send(res, V.pub.votifierPage(req, { service: V.cab.voteService() })));
app.get('/vote/:id', (req, res) => {
  const s = db.prepare(`SELECT id, name FROM servers WHERE id = ? AND status = 'approved'`).get(int(req.params.id));
  res.redirect(302, s ? `${serverPath(s)}#vote` : '/');
});

app.get('/', (req, res) => {
  const q = str(req.query.q, 60);
  const tag = str(req.query.tag, 30);
  // старые адреса ?tag=… → постоянные страницы подборок
  const known = tag && tags.BY_NAME.get(tag.toLowerCase());
  if (known && !q) return res.redirect(301, `/servera-${known.slug}/`);
  const servers = topServers({ q, tag });
  const tagCounts = {};
  for (const s of topServers({ limit: 500 })) for (const t of s.tagList) tagCounts[t] = (tagCounts[t] || 0) + 1;
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map((x) => x[0]);
  const news = db.prepare('SELECT * FROM news WHERE published = 1 ORDER BY created DESC LIMIT 3').all();
  send(res, V.pub.home(req, { servers, banner: bannerData(), stats: siteStats(), q, tag, tags: topTags, news }));
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
  // единый адрес страницы: /server/12 и /server/12-old-name → 301 на /server/12-craftlands
  const canonical = serverPath(s);
  if (req.path !== canonical) return res.redirect(301, canonical + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''));
  if (!owner) srvstats.track(s.id, 'views', { visitor: req.csrf, ua: req.get('user-agent') });
  const range = ['day', 'week', 'month'].includes(req.query.range) ? req.query.range : 'day';
  const ms = { day: DAY, week: 7 * DAY, month: 30 * DAY }[range];
  const ms0 = monthStart();
  const votes = db.prepare('SELECT COUNT(*) AS n FROM votes WHERE server_id = ? AND ts >= ?').get(s.id, ms0).n;

  // места в рейтингах (только среди опубликованных)
  let ranks = null;
  if (s.status === 'approved') {
    const all = topServers({ limit: 100000 });
    const total = all.length;
    const byVotes = [...all].sort((a, b) => b.votes - a.votes);
    const byOnline = [...all].sort((a, b) => b.players - a.players);
    const pos = (list) => list.findIndex((x) => x.id === s.id) + 1;
    const top = (p) => Math.max(1, Math.ceil((p / total) * 100));
    ranks = { total, overall: pos(all), votes: pos(byVotes), online: pos(byOnline) };
    ranks.votesTop = top(ranks.votes); ranks.onlineTop = top(ranks.online);
  }
  // средний онлайн за 7 дней и аптайм за 30 дней по истории пингов
  const avg7 = db.prepare('SELECT AVG(players) AS a, COUNT(*) AS n FROM pings WHERE server_id = ? AND ts >= ?').get(s.id, now() - 7 * DAY);
  const up30 = db.prepare('SELECT AVG(online) AS a, COUNT(*) AS n FROM pings WHERE server_id = ? AND ts >= ?').get(s.id, now() - 30 * DAY);
  // голоса: последние, топ голосующих, средняя оценка
  const recentVotes = db.prepare('SELECT nickname, rating, ts FROM votes WHERE server_id = ? ORDER BY ts DESC LIMIT 10').all(s.id);
  const topVoters = db.prepare('SELECT nickname, COUNT(*) AS n, MAX(ts) AS last FROM votes WHERE server_id = ? AND ts >= ? GROUP BY ulower(nickname) ORDER BY n DESC, last DESC LIMIT 10').all(s.id, ms0);
  const rating = db.prepare('SELECT AVG(rating) AS a, COUNT(*) AS n FROM votes WHERE server_id = ?').get(s.id);
  // похожие: общие теги, затем голоса
  const myTags = String(s.tags || '').split(',').map((x) => x.trim()).filter(Boolean);
  const similar = myTags.length ? topServers({ limit: 100000 })
    .filter((x) => x.id !== s.id)
    .map((x) => ({ ...x, shared: x.tagList.filter((t) => myTags.includes(t)).length }))
    .filter((x) => x.shared > 0)
    .sort((a, b) => b.shared - a.shared || b.votes - a.votes)
    .slice(0, 4) : [];

  send(res, V.pub.server(req, {
    s, votes, points: pinger.history(s.id, ms, range === 'day' ? 48 : 56), range, voted: req.query.voted === '1', error: str(req.query.error), owner,
    rank: ranks?.overall, ranks,
    avgOnline: avg7.n ? Math.round(avg7.a) : null, uptime: up30.n ? Math.round(up30.a * 1000) / 10 : null,
    recentVotes, topVoters, rating: rating.n ? { avg: Math.round(rating.a * 10) / 10, n: rating.n } : null,
    similar, copies: srvstats.totals(s.id), cooldownH: voteCooldownMs() / 3600000,
  }));
});

/* ---- виджеты для сайтов серверов ---- */
function widgetData(id) {
  const s = db.prepare(`SELECT id, name, address, online, players, max_players, favicon FROM servers WHERE id = ? AND status = 'approved'`).get(id);
  if (!s) return null;
  const votes = db.prepare('SELECT COUNT(*) AS n FROM votes WHERE server_id = ? AND ts >= ?').get(s.id, monthStart()).n;
  return { s, votes };
}
// данные для живой кнопки голосования (CORS — вызывается с чужих сайтов)
app.get('/api/server/:id/widget.json', (req, res) => {
  const w = widgetData(int(req.params.id));
  res.set({ 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=120' });
  if (!w) return res.status(404).json({ error: 'not found' });
  res.json({ id: w.s.id, name: w.s.name, votes: w.votes, online: Boolean(w.s.online), players: w.s.players, max: w.s.max_players, url: settings.get('site_url').replace(/\/$/, '') + serverPath(w.s) });
});
// SVG-виджет онлайна: <img src="https://nlauncher.ru/widget/server/ID.svg">
app.get('/widget/server/:file', (req, res) => {
  const m = /^(\d+)\.svg$/.exec(req.params.file);
  const w = m && widgetData(int(m[1]));
  if (!w) return res.status(404).type('text/plain').send('not found');
  const light = req.query.theme === 'light';
  const e = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const C = light ? { bg: '#ffffff', line: '#ecdfe0', text: '#1d1416', muted: '#7d6f71', accent: '#a3454f' } : { bg: '#171214', line: '#2a2124', text: '#eee6e7', muted: '#9b8f91', accent: '#c4747c' };
  const s = w.s;
  const name = s.name.length > 24 ? `${s.name.slice(0, 23)}…` : s.name;
  const fav = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(s.favicon || '') ? `<image href="${s.favicon}" x="14" y="14" width="56" height="56" clip-path="url(#r)"/>` : `<rect x="14" y="14" width="56" height="56" rx="12" fill="${C.accent}"/><text x="42" y="51" text-anchor="middle" font-size="24" font-weight="700" fill="#fff">${e(s.name[0] || '?')}</text>`;
  const status = s.online ? `<circle cx="88" cy="50" r="4" fill="#6fbf8e"/><text x="98" y="54" font-size="13" fill="${C.text}" font-weight="600">${s.players} / ${s.max_players} онлайн</text>` : `<circle cx="88" cy="50" r="4" fill="#c9636c"/><text x="98" y="54" font-size="13" fill="${C.muted}">офлайн</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="84" viewBox="0 0 320 84" font-family="Manrope,'Segoe UI',Arial,sans-serif">
<defs><clipPath id="r"><rect x="14" y="14" width="56" height="56" rx="12"/></clipPath></defs>
<rect x=".5" y=".5" width="319" height="83" rx="16" fill="${C.bg}" stroke="${C.line}"/>
${fav}
<text x="82" y="31" font-size="15" font-weight="700" fill="${C.text}">${e(name)}</text>
${status}
<text x="82" y="72" font-size="11.5" fill="${C.muted}">${e(s.address)}</text>
<text x="306" y="72" text-anchor="end" font-size="11" fill="${C.accent}" font-weight="700">★ ${w.votes}</text>
</svg>`;
  res.set({ 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*' }).send(svg);
});

// копирование IP (с главной, страниц подборок и страницы сервера)
app.post('/api/server/:id/copy', limiter(60_000, 30), (req, res) => {
  srvstats.track(int(req.params.id), 'copies', { visitor: req.csrf, ua: req.get('user-agent') });
  res.status(204).end();
});

/** Доставка голоса: Votifier (v1/v2) и/или HTTP-вебхук. Возвращает результат Votifier (для проверки из кабинета) */
async function deliverVote(server, nickname, voteId, ip = '') {
  let result = null;
  if (server.votifier_host && (server.votifier_key || server.votifier_token)) {
    result = await votifier.send(
      { host: server.votifier_host, port: server.votifier_port, key: server.votifier_key, token: server.votifier_token },
      { service: V.cab.voteService(), username: nickname, address: ip || '127.0.0.1' },
    );
    if (result.ok && voteId) db.prepare('UPDATE votes SET delivered = 1 WHERE id = ?').run(voteId);
    if (!result.ok) console.warn(`[votifier] ${server.name}: ${result.error}`);
  }
  const url = safeUrl(server.vote_webhook);
  if (url) {
    const timestamp = now();
    const signature = crypto.createHmac('sha256', server.vote_secret).update(`${nickname}:${timestamp}`).digest('hex');
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'MC-Monitoring' }, body: JSON.stringify({ server_id: server.id, nickname, timestamp, signature }), signal: AbortSignal.timeout(8000) });
      if (r.ok && voteId) db.prepare('UPDATE votes SET delivered = 1 WHERE id = ?').run(voteId);
    } catch { /* сервер недоступен — голос всё равно засчитан */ }
  }
  return result;
}

const voteCooldownMs = () => Math.min(168, Math.max(1, Number(settings.get('vote_cooldown_hours')) || 24)) * 3600000;

app.post('/server/:id/vote', limiter(60_000, 10), (req, res) => {
  const s = db.prepare(`SELECT * FROM servers WHERE id = ? AND status = 'approved'`).get(int(req.params.id));
  if (!s) return res.redirect('/');
  const nick = str(req.body.nickname, 16);
  const rating = Math.min(5, Math.max(1, int(req.body.rating) || 5));
  const back = (q) => res.redirect(`${serverPath(s)}?${q}#vote`);
  if (!/^[A-Za-z0-9_]{3,16}$/.test(nick)) return back(`error=${encodeURIComponent('Ник: 3–16 символов, латиница, цифры и _')}`);
  const cd = voteCooldownMs();
  const dup = db.prepare('SELECT ts FROM votes WHERE server_id = ? AND (ulower(nickname) = ? OR ip = ?) AND ts > ? ORDER BY ts DESC LIMIT 1').get(s.id, nick.toLowerCase(), req.ip, now() - cd);
  if (dup) {
    const left = Math.max(1, Math.ceil((dup.ts + cd - now()) / 3600000));
    return back(`error=${encodeURIComponent(`Вы уже голосовали. Следующий голос — через ${left} ч.`)}`);
  }
  const r = db.prepare('INSERT INTO votes (server_id, nickname, ip, ts, rating) VALUES (?, ?, ?, ?, ?)').run(s.id, nick, req.ip, now(), rating);
  deliverVote(s, nick, r.lastInsertRowid, req.ip);
  back('voted=1');
});

app.get('/ads', (req, res) => send(res, V.pub.ads(req, { products: productsWithAvailability(), stats: siteStats() })));

/* ======================= SEO: robots, sitemap, манифест ======================= */
const siteBase = () => settings.get('site_url').replace(/\/$/, '');
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').set('Cache-Control', 'public, max-age=3600').send([
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /cabinet',
    'Disallow: /login',
    'Disallow: /register',
    'Disallow: /pay/',
    'Disallow: /*?q=',
    'Disallow: /*range=',
    'Clean-param: range /server/',
    'Clean-param: q /',
    '',
    `Sitemap: ${siteBase()}/sitemap.xml`,
    '',
  ].join('\n'));
});
app.get('/sitemap.xml', (req, res) => {
  const base = siteBase();
  const day = (t) => new Date(t || now()).toISOString().slice(0, 10);
  const x = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const urls = [
    { loc: '/', changefreq: 'hourly', priority: '1.0', lastmod: day() },
    { loc: '/launcher', changefreq: 'weekly', priority: '0.8' },
    { loc: '/ads', changefreq: 'weekly', priority: '0.6' },
    { loc: '/stats', changefreq: 'hourly', priority: '0.7' },
    { loc: '/servera/', changefreq: 'daily', priority: '0.8' },
    { loc: '/new', changefreq: 'daily', priority: '0.7' },
    { loc: '/votifier', changefreq: 'monthly', priority: '0.4' },
  ];
  const tagCounts = {};
  for (const s of topServers({ limit: 5000 })) {
    urls.push({ loc: serverPath(s), changefreq: 'daily', priority: s.rank <= 20 ? '0.8' : '0.6', lastmod: day(s.last_ping || s.created) });
    for (const t of s.tagList) tagCounts[t] = (tagCounts[t] || 0) + 1;
  }
  // подборки по тегам и версиям — только непустые
  for (const t of Object.keys(tagCounts)) { const c = tags.BY_NAME.get(t.toLowerCase()); if (c) urls.push({ loc: `/servera-${c.slug}/`, changefreq: 'daily', priority: '0.8' }); }
  const allSrv = topServers({ limit: 100000 });
  for (const v of tags.VERSIONS) if (allSrv.some((s) => tags.serverSupports(s, v))) urls.push({ loc: `/servera-${v}/`, changefreq: 'daily', priority: '0.7' });
  res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.map((u) => `  <url><loc>${x(base + u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}<changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`).join('\n')
    + '\n</urlset>\n',
  );
});
app.get('/site.webmanifest', (req, res) => {
  res.type('application/manifest+json').set('Cache-Control', 'public, max-age=86400').send(JSON.stringify({
    name: settings.get('site_name'), short_name: 'NLauncher', lang: 'ru', start_url: '/', display: 'standalone',
    background_color: '#0c0a0b', theme_color: '#0c0a0b',
    icons: [{ src: '/assets/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/assets/icon.png', sizes: '512x512', type: 'image/png' }],
  }));
});
app.get('/launcher', (req, res) => {
  const l = latestLauncher();
  send(res, V.pub.launcher(req, { downloadUrl: l ? l.setup : LAUNCHER_DOWNLOAD, portableUrl: l?.portable || null, version: l?.version || null, size: l?.size || 0 }));
});
// Постоянная ссылка на последнюю версию: https://nlauncher.ru/download
app.get('/download', (req, res) => {
  const l = latestLauncher();
  res.redirect(302, req.query.portable && l?.portable ? l.portable : l ? l.setup : LAUNCHER_DOWNLOAD);
});

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
  const verifyOn = mailer.enabled();
  const r = db.prepare('INSERT INTO users (email, name, pass, email_verified, created) VALUES (?, ?, ?, ?, ?)').run(email, name, auth.hashPassword(pw), verifyOn ? 0 : 1, now());
  const id = Number(r.lastInsertRowid);
  res.login(id);
  const after = safeNext(req.body.next) === '/cabinet' ? '/cabinet/servers/new' : safeNext(req.body.next);
  if (!verifyOn) return res.redirect(after);
  mailer.sendCode({ id, email, name }); // не ждём: страница с кодом откроется сразу
  res.redirect(`/verify?next=${encodeURIComponent(after)}`);
});

/* ---- подтверждение email ---- */
const needVerify = (u) => Boolean(u && !u.email_verified && u.role !== 'admin' && mailer.enabled());
app.get('/verify', auth.requireUser, (req, res) => {
  const next = safeNext(req.query.next);
  if (!needVerify(req.user)) return res.redirect(next);
  send(res, V.pub.verifyPage(req, { next, wait: mailer.resendWait(req.user.id), sent: req.query.sent === '1' }));
});
app.post('/verify', auth.requireUser, limiter(15 * 60_000, 30), (req, res) => {
  const next = safeNext(req.body.next);
  if (!needVerify(req.user)) return res.redirect(next);
  const r = mailer.checkCode(req.user.id, req.body.code);
  if (r === 'ok') return res.redirect(`${next}${next.includes('?') ? '&' : '?'}verified=1`);
  const error = { wrong: 'Неверный код — проверьте цифры', expired: 'Код устарел — отправьте новый', locked: 'Слишком много попыток — отправьте новый код' }[r];
  send(res, V.pub.verifyPage(req, { next, error, wait: mailer.resendWait(req.user.id) }), 400);
});
app.post('/verify/resend', auth.requireUser, limiter(60 * 60_000, 10), async (req, res) => {
  const next = safeNext(req.body.next);
  if (!needVerify(req.user)) return res.redirect(next);
  if (mailer.resendWait(req.user.id) === 0) await mailer.sendCode(req.user);
  res.redirect(`/verify?sent=1&next=${encodeURIComponent(next)}`);
});

/* ---- восстановление пароля по почте ---- */
app.get('/forgot', (req, res) => send(res, V.pub.forgotPage(req, { mailOn: mailer.enabled() })));
app.post('/forgot', limiter(60 * 60_000, 5), async (req, res, next) => {
  try {
    const email = str(req.body.email, 120).toLowerCase();
    const u = db.prepare('SELECT id, email, name, banned FROM users WHERE email = ?').get(email);
    if (u && !u.banned && mailer.enabled()) await mailer.mails.reset(u, mailer.createReset(u.id));
    // ответ одинаковый, есть такой email или нет, — чтобы нельзя было проверять чужие адреса
    send(res, V.pub.forgotPage(req, { mailOn: mailer.enabled(), sent: email }));
  } catch (e) { next(e); }
});
app.get('/reset/:token', (req, res) => send(res, V.pub.resetPage(req, { token: req.params.token, valid: Boolean(mailer.checkReset(req.params.token)) })));
app.post('/reset/:token', limiter(15 * 60_000, 20), (req, res) => {
  const r = mailer.checkReset(req.params.token);
  if (!r) return send(res, V.pub.resetPage(req, { token: req.params.token, valid: false }), 400);
  const pw = String(req.body.password || '');
  if (pw.length < 8) return send(res, V.pub.resetPage(req, { token: req.params.token, valid: true, error: 'Пароль — минимум 8 символов' }), 400);
  if (pw !== String(req.body.password2 || '')) return send(res, V.pub.resetPage(req, { token: req.params.token, valid: true, error: 'Пароли не совпадают' }), 400);
  db.prepare('UPDATE users SET pass = ? WHERE id = ?').run(auth.hashPassword(pw), r.user_id);
  mailer.useReset(req.params.token);
  res.login(r.user_id);
  res.redirect('/cabinet?f=pwreset');
});

app.post('/logout', (req, res) => { res.logout(); res.redirect('/'); });

/* ======================= Кабинет ======================= */
const cab = express.Router();
cab.use(auth.requireUser);
cab.use((req, res, next) => { req.needVerify = needVerify(req.user); next(); }); // плашка «Подтвердите email»

cab.get('/', (req, res) => {
  const t = now();
  const list = db.prepare(`SELECT s.*,
      (SELECT COUNT(*) FROM votes v WHERE v.server_id = s.id AND v.ts >= ?) AS votes,
      (SELECT MAX(ends) FROM orders o WHERE o.server_id = s.id AND o.kind = 'promo' AND o.status = 'paid' AND o.ends > ?) AS promo_until
    FROM servers s WHERE owner_id = ? ORDER BY created DESC`).all(monthStart(), t, req.user.id)
    .map((s) => ({ ...s, services: activeServices(s.id) }));
  send(res, V.cab.servers(req, { list, flash: req.query.saved ? 'Сохранено' : req.query.created ? 'Сервер отправлен на модерацию — обычно это занимает до суток.' : req.query.deleted ? 'Сервер удалён' : req.query.f === 'pwreset' ? 'Пароль изменён, вы вошли в аккаунт' : '' }));
});

function readServerForm(body) {
  const vmin = tags.isVersion(body.version_min) ? body.version_min : '';
  let vmax = tags.isVersion(body.version_max) ? body.version_max : '';
  if (vmin && vmax && tags.cmp(vmax, vmin) < 0) vmax = vmin; // перепутали местами
  const d = {
    name: str(body.name, 40), address: str(body.address, 80).toLowerCase(),
    version_min: vmin, version_max: vmax,
    tags: tags.normalizeTags(body.tags).join(', '),
    description: str(body.description, 3000), website: safeUrl(body.website), discord: safeUrl(body.discord),
    banner: safeUrl(body.banner), vote_webhook: safeUrl(body.vote_webhook),
    votifier_host: str(body.votifier_host, 100), votifier_port: Math.min(65535, Math.max(1, int(body.votifier_port) || 8192)),
    votifier_key: str(body.votifier_key, 2000).replace(/\s+/g, ''), votifier_token: str(body.votifier_token, 200),
  };
  d.version = tags.versionLabel(d);
  return d;
}
function validateServer(d, selfId = 0) {
  if (!d.name) return 'Укажите название';
  if (!ADDR_RE.test(d.address)) return 'Некорректный IP-адрес';
  const dup = db.prepare('SELECT id FROM servers WHERE ulower(address) = ? AND id != ?').get(d.address, selfId);
  if (dup) return 'Сервер с таким адресом уже есть в мониторинге';
  if (d.votifier_host && !/^[A-Za-z0-9.-]+$/.test(d.votifier_host)) return 'Некорректный IP для Votifier';
  const keyErr = votifier.validateKey(d.votifier_key);
  if (keyErr) return keyErr;
  return '';
}
const SERVER_COLS = ['name', 'address', 'version', 'version_min', 'version_max', 'tags', 'description', 'website', 'discord', 'banner', 'vote_webhook', 'votifier_host', 'votifier_port', 'votifier_key', 'votifier_token'];

// без подтверждённой почты нельзя добавлять сервера и покупать
const requireVerified = (req, res, next) => (needVerify(req.user) ? res.redirect(`/verify?next=${encodeURIComponent(req.originalUrl)}`) : next());
cab.use(['/servers/new', '/buy', '/pay'], requireVerified);
cab.get('/servers/new', (req, res) => send(res, V.cab.serverForm(req, { isNew: true })));
cab.post('/servers/new', limiter(60 * 60_000, 10), (req, res) => {
  const d = readServerForm(req.body);
  const err = validateServer(d);
  if (err) return send(res, V.cab.serverForm(req, { isNew: true, s: d, error: err }), 400);
  const r = db.prepare(`INSERT INTO servers (owner_id, ${SERVER_COLS.join(', ')}, vote_secret, created) VALUES (?, ${SERVER_COLS.map(() => '?').join(', ')}, ?, ?)`)
    .run(req.user.id, ...SERVER_COLS.map((k) => d[k]), crypto.randomBytes(24).toString('hex'), now());
  pinger.pingServer({ id: Number(r.lastInsertRowid), address: d.address }).catch(() => {});
  res.redirect('/cabinet?created=1');
});

function ownServer(req) {
  const s = db.prepare('SELECT * FROM servers WHERE id = ?').get(int(req.params.id));
  return s && (s.owner_id === req.user.id || req.user.role === 'admin') ? s : null;
}
cab.get('/servers/:id/widgets', (req, res) => {
  const s = ownServer(req);
  if (!s) return res.redirect('/cabinet');
  send(res, V.cab.widgets(req, { s, base: settings.get('site_url').replace(/\/$/, ''), page: serverPath(s) }));
});
cab.get('/servers/:id/stats', (req, res) => {
  const s = ownServer(req);
  if (!s) return res.redirect('/cabinet');
  send(res, V.cab.serverStats(req, { s, hist: srvstats.history(s.id, 30), totals: srvstats.totals(s.id) }));
});
cab.get('/servers/:id', (req, res) => {
  const s = ownServer(req);
  if (!s) return send(res, V.pub.message(req, 'Не найдено', 'Сервер не найден или принадлежит другому пользователю.'), 404);
  const flash = { saved: 'Сохранено' }[req.query.f] || '';
  send(res, V.cab.serverForm(req, { s, flash }));
});
cab.post('/servers/:id', async (req, res) => {
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
  db.prepare(`UPDATE servers SET ${SERVER_COLS.map((k) => `${k} = ?`).join(', ')}, status = ? WHERE id = ?`).run(...SERVER_COLS.map((k) => d[k]), status, s.id);
  if (req.body._action === 'votifier_test') {
    const fresh = db.prepare('SELECT * FROM servers WHERE id = ?').get(s.id);
    const nick = /^[A-Za-z0-9_]{3,16}$/.test(str(req.body.test_nick, 16)) ? str(req.body.test_nick, 16) : 'NLauncherTest';
    const r = fresh.votifier_host && (fresh.votifier_key || fresh.votifier_token)
      ? await deliverVote(fresh, nick, 0, req.ip)
      : { ok: false, error: 'Заполните IP Votifier и публичный ключ или токен' };
    const msg = r.ok ? `✓ Votifier работает (${r.version}): тестовый голос от ${nick} доставлен — проверьте консоль сервера` : `✗ Votifier: ${r.error}`;
    return send(res, V.cab.serverForm(req, { s: fresh, flash: r.ok ? msg : '', error: r.ok ? '' : msg }));
  }
  res.redirect(`/cabinet/servers/${s.id}?f=saved`);
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
  const product = req.query.product === 'points' ? 'points' : int(req.query.product) || 'points';
  send(res, V.cab.buy(req, { servers, products: productsWithAvailability(), sel: { server: int(req.query.server), product }, methods: payMethods(), pricing }));
});

cab.post('/buy', limiter(60_000, 15), (req, res) => {
  const server = db.prepare(`SELECT * FROM servers WHERE id = ? AND owner_id = ? AND status = 'approved'`).get(int(req.body.server_id), req.user.id);
  const isPoints = req.body.product_id === 'points';
  const product = isPoints ? null : db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(int(req.body.product_id));
  const method = str(req.body.method, 20);
  const values = { points: int(req.body.points), days: int(req.body.days), color: str(req.body.color, 10), coupon: str(req.body.coupon, 30).toUpperCase() };
  const fail = (error) => {
    const servers = db.prepare(`SELECT id, name, address FROM servers WHERE owner_id = ? AND status = 'approved' ORDER BY name`).all(req.user.id);
    send(res, V.cab.buy(req, { servers, products: productsWithAvailability(), sel: { server: int(req.body.server_id), product: isPoints ? 'points' : int(req.body.product_id) }, methods: payMethods(), pricing, values, error }), 400);
  };
  if (!server) return fail('Выберите сервер');
  if (!isPoints && !product) return fail('Выберите услугу');
  if (!payMethods().some((m) => m.id === method)) return fail('Выберите способ оплаты');

  // цена: промо-баллы считаются по формуле, остальное — по тарифу
  let kind, title, amount, days, points = 0, packOff = 0;
  if (isPoints) {
    const q = pricing.pointsQuote(values.points, values.days);
    if (!q) return fail('Промо-баллы: от 5 до 10 000 (шаг 5) и срок из списка');
    kind = 'points'; days = q.days; points = q.points; amount = q.total; packOff = q.packDiscount;
    title = `${fmt.plural(q.points, 'промо-балл', 'промо-балла', 'промо-баллов')} на ${q.days} дн.`;
  } else {
    kind = product.kind; title = product.title; amount = product.price; days = product.days;
  }
  const c = pricing.checkCoupon(values.coupon);
  if (c.error) return fail(c.error);
  const withCoupon = pricing.applyCoupon(amount, c.pct);
  const color = kind === 'highlight' && pricing.COLORS[values.color] ? values.color : '';
  const banner = kind === 'banner'
    ? { t: str(req.body.banner_title, 60) || server.name, x: str(req.body.banner_text, 140), i: safeUrl(req.body.banner_image), u: safeUrl(req.body.banner_url) }
    : { t: '', x: '', i: '', u: '' };
  const r = db.prepare(`INSERT INTO orders (user_id, server_id, product_id, kind, title, amount, days, points, color, coupon, discount, provider, banner_title, banner_text, banner_image, banner_url, created)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(req.user.id, server.id, product ? product.id : null, kind, title, withCoupon.amount, days, points, color,
    c.coupon ? c.coupon.code : '', packOff + withCoupon.off, method.startsWith('yoomoney') ? 'yoomoney' : 'heleket', banner.t, banner.x, banner.i, banner.u, now());
  res.redirect(`/cabinet/pay/${r.lastInsertRowid}?m=${method}`);
});

// проверка купона на лету (для подсказки в форме)
cab.get('/coupon', (req, res) => {
  const c = pricing.checkCoupon(str(req.query.code, 30));
  res.json(c.error ? { ok: false, error: c.error } : { ok: Boolean(c.coupon), pct: c.pct });
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
/* ---- статистика NLauncher ---- */
// сигнал от лаунчера: { id: 32 hex, inGame, version, event: 'launch' }
// лимит на IP: за одним адресом (мобильный оператор, клуб) бывает много игроков — 120/мин ≈ 240 лаунчеров
app.post('/api/launcher/ping', limiter(60_000, 120), (req, res) => {
  const ok = stats.ping({ id: req.body?.id, inGame: Boolean(req.body?.inGame), version: str(req.body?.version, 20), event: req.body?.event === 'launch' ? 'launch' : '' });
  res.status(ok ? 204 : 400).end();
});
// текущие цифры (лаунчер и страница «Статистика»); демо — только админу и только с пометкой
app.get('/api/stats', (req, res) => {
  const demo = stats.demoAllowed(req) && req.query.demo !== '0';
  res.set('Cache-Control', demo ? 'private, no-store' : 'public, max-age=30').json(demo ? stats.demoSummary() : stats.summary());
});
app.get('/stats', (req, res) => {
  const demo = stats.demoAllowed(req);
  send(res, V.pub.statsPage(req, { s: demo ? stats.demoSummary() : stats.summary(), h: demo ? stats.demoHistory() : stats.history() }));
});

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
    // для уведомления «Доступна новая версия» в лаунчере
    launcher: (() => {
      const l = latestLauncher();
      const base = settings.get('site_url').replace(/\/$/, '');
      return l && l.version ? { version: l.version, url: `${base}/download`, setup: base + l.setup } : null;
    })(),
    // честный онлайн для строки на главной лаунчера
    stats: (() => { const s = stats.summary(); return { launcherOnline: s.showLauncher ? s.launcher.online : null, serversOnline: s.servers.online }; })(),
    site: settings.get('site_url'),
  });
});

app.get('/api/servers', (req, res) => {
  res.set('Cache-Control', 'public, max-age=60').json(topServers({ limit: 100 }).map((s) => ({
    id: s.id, rank: s.rank, name: s.name, address: s.address, online: Boolean(s.online), players: s.players, max: s.max_players, votes: s.votes, promo: Boolean(s.promo), tags: s.tagList,
  })));
});

/* ======================= Техподдержка (виджет) ======================= */
const supportToken = (req) => {
  const m = String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${support.COOKIE}=([A-Za-z0-9_-]{20,64})`));
  return m ? m[1] : '';
};
const supportCookie = (res, token) => res.append('Set-Cookie', `${support.COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${365 * 86400}${(process.env.SITE_URL || '').startsWith('https://') ? '; Secure' : ''}`);
const supportJson = (req, t, after) => ({
  messages: t ? support.messages(t.id, after) : [],
  unread: t ? t.unread_user : 0,
  closed: t ? t.status === 'closed' : false,
  needContact: !req.user && !(t && t.contact),
});
app.get('/support/messages', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const t = support.findThread(req, supportToken(req));
  const out = supportJson(req, t, int(req.query.after));
  if (t && req.query.read === '1' && t.unread_user) { support.markReadByUser(t.id); out.unread = 0; }
  res.json(out);
});
app.post('/support/messages', limiter(10 * 60_000, 30), (req, res) => {
  const text = String(req.body.text ?? '').trim().slice(0, support.MAX_TEXT);
  if (!text) return res.status(400).json({ error: 'Напишите сообщение' });
  const contact = str(req.body.contact, 120);
  let t = support.findThread(req, supportToken(req));
  if (!t) {
    if (!req.user && !contact) return res.status(400).json({ error: 'Укажите email или Telegram, чтобы мы могли ответить, даже если вы закроете сайт', needContact: true });
    t = support.createThread(req, { contact, page: str(req.body.page, 200) });
    if (!req.user) supportCookie(res, t.token);
  } else if (contact && !t.contact) {
    db.prepare('UPDATE support_threads SET contact = ? WHERE id = ?').run(contact, t.id);
  }
  support.userMessage(t.id, text);
  res.json(supportJson(req, support.get(t.id), int(req.body.after)));
});

/* ======================= Админка ======================= */
const adm = express.Router();
adm.use(auth.requireAdmin);
const flashOf = (req) => ({
  ok: 'Готово', saved: 'Сохранено', granted: 'Услуга выдана и уже работает',
  nouser: '⚠ Пользователь с таким email не найден — владелец не изменён',
  shortpw: '⚠ Пароль не изменён: нужно минимум 8 символов',
  dupcoupon: '⚠ Купон с таким кодом уже есть',
  deleted: 'Удалено', selfdel: '⚠ Себя удалить нельзя', owner: 'Владелец назначен — сервер появился у него в кабинете',
  mailok: 'Тестовое письмо отправлено на ваш email — проверьте почту (и папку «Спам»)',
  mailoff: '⚠ Сначала заполните сервер SMTP и адрес отправителя и сохраните настройки',
  mailerr: `⚠ Письмо не отправилось: ${str(req.query.e, 200)}`,
}[req.query.f] || '');
const audit = (req, action, details) => logAdmin(req.user.id, action, details);
const serverName = (id) => db.prepare('SELECT name FROM servers WHERE id = ?').get(id)?.name || `#${id}`;
const like = (q) => `%${String(q).toLowerCase()}%`; // вместе с ulower() — поиск без учёта регистра и для кириллицы

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
    launcher: stats.adminSummary(),
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
  notify.markSeen('servers');
  const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : '';
  const q = str(req.query.q, 80);
  const list = db.prepare(`SELECT s.*, u.email AS owner_email, (SELECT COUNT(*) FROM votes v WHERE v.server_id = s.id AND v.ts >= ?) AS votes
    FROM servers s LEFT JOIN users u ON u.id = s.owner_id
    WHERE (? = '' OR s.status = ?) AND (? = '' OR ulower(s.name) LIKE ? OR ulower(s.address) LIKE ? OR ulower(u.email) LIKE ?)
    ORDER BY (s.status = 'pending') DESC, s.created DESC LIMIT 500`).all(monthStart(), status, status, q, like(q), like(q), like(q))
    .map((s) => ({ ...s, services: activeServices(s.id) }));
  send(res, V.adm.servers(req, { list, status, q, flash: flashOf(req) }));
});

/* ---- импорт серверов списком: данные берутся из пинга самого сервера ---- */
/** «1.8.x-1.21.4», «Paper 1.21.1», «Requires MC 1.8 / 1.21» → { min, max }; номера прокси вроде Velocity 3.3.0 отбрасываем */
function versionsFromPing(name) {
  const found = String(name || '').match(/\d+\.\d+(?:\.\d+)?/g) || [];
  const ok = found.filter((v) => { const major = Number(v.split('.')[0]); return major === 1 || (major >= 26 && major < 100); }).sort(tags.cmp);
  return ok.length ? { min: ok[0], max: ok[ok.length - 1] } : { min: '', max: '' };
}
/** Название из адреса: play.funtime.su → Funtime */
function nameFromHost(address) {
  if (/^[\d.]+(:\d+)?$/.test(address)) return address; // голый IP — оставляем как есть
  const parts = address.split(':')[0].split('.').filter((p) => !/^(mc|play|join|srv|server|s\d*)$/i.test(p));
  const base = parts.length > 1 ? parts[parts.length - 2] : parts[0] || address;
  return base.charAt(0).toUpperCase() + base.slice(1);
}
function parseImport(text) {
  const out = [], seen = new Set();
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const [a, b] = line.includes('|') ? line.split('|').map((x) => x.trim()) : ['', line];
    const address = (b || a).replace(/^[a-z]+:\/\//i, '').replace(/\/.*$/, '').toLowerCase();
    if (!ADDR_RE.test(address) || seen.has(address)) continue;
    seen.add(address);
    out.push({ name: (b ? a : '').slice(0, 60), address });
  }
  return out.slice(0, 100);
}
adm.get('/servers/import', (req, res) => send(res, V.adm.importPage(req, {})));
adm.post('/servers/import', async (req, res, next) => {
  try {
    const items = parseImport(req.body.list);
    const addOffline = req.body.offline === '1';
    const results = [];
    for (let i = 0; i < items.length; i += 10) {
      await Promise.all(items.slice(i, i + 10).map(async (it) => {
        if (db.prepare('SELECT id FROM servers WHERE ulower(address) = ?').get(it.address)) return results.push({ ...it, result: 'exists' });
        let p = await pinger.ping(it.address);
        if (!p.online) p = await pinger.ping(it.address); // вторая попытка: первый ответ иногда не успевает
        if (!p.online && !addOffline) return results.push({ ...it, result: 'offline' });
        const v = versionsFromPing(p.version);
        const d = {
          name: it.name || nameFromHost(it.address), address: it.address, version_min: v.min, version_max: v.max !== v.min ? v.max : '',
          tags: '', description: p.motd || '', website: '', discord: '', banner: '', vote_webhook: '', votifier_host: '', votifier_port: 8192, votifier_key: '', votifier_token: '',
        };
        d.version = tags.versionLabel(d);
        const r = db.prepare(`INSERT INTO servers (owner_id, ${SERVER_COLS.join(', ')}, vote_secret, status, created) VALUES (?, ${SERVER_COLS.map(() => '?').join(', ')}, ?, 'approved', ?)`)
          .run(req.user.id, ...SERVER_COLS.map((k) => d[k]), crypto.randomBytes(24).toString('hex'), now());
        const id = Number(r.lastInsertRowid);
        if (p.online) await pinger.pingServer({ id, address: it.address }).catch(() => {});
        results.push({ ...it, name: d.name, id, players: p.players, online: p.online, result: 'added' });
      }));
    }
    const added = results.filter((r) => r.result === 'added').length;
    if (added) audit(req, 'Импорт серверов', `добавлено ${added} из ${items.length}`);
    send(res, V.adm.importPage(req, { results, list: req.body.list, offline: addOffline }));
  } catch (e) { next(e); }
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
  const before = db.prepare('SELECT s.*, u.email FROM servers s LEFT JOIN users u ON u.id = s.owner_id WHERE s.id = ?').get(id);
  db.prepare(`UPDATE servers SET status = 'approved', reject_reason = '' WHERE id = ?`).run(id);
  audit(req, 'Одобрил сервер', serverName(id));
  if (before && before.status !== 'approved' && before.email && before.owner_id !== req.user.id) mailer.mails.serverApproved(before.email, before, abs(serverPath(before)));
  res.redirect(backTo(req, '/admin/servers'));
});
adm.post('/servers/:id/reject', (req, res) => {
  const id = int(req.params.id);
  db.prepare(`UPDATE servers SET status = 'rejected', reject_reason = ? WHERE id = ?`).run(str(req.body.reason, 300), id);
  const s = db.prepare('SELECT s.*, u.email FROM servers s LEFT JOIN users u ON u.id = s.owner_id WHERE s.id = ?').get(id);
  if (s?.email && s.owner_id !== req.user.id) mailer.mails.serverRejected(s.email, s, str(req.body.reason, 300));
  audit(req, 'Отклонил сервер', `${serverName(id)}: ${str(req.body.reason, 200)}`);
  res.redirect(backTo(req, '/admin/servers'));
});
adm.post('/servers/:id/delete', (req, res) => {
  const id = int(req.params.id);
  audit(req, 'Удалил сервер', serverName(id));
  db.prepare('DELETE FROM servers WHERE id = ?').run(id);
  res.redirect('/admin/servers?f=ok');
});
/** Поиск пользователей для выбора владельца (подсказки в карточке сервера) */
adm.get('/users.json', (req, res) => {
  const q = str(req.query.q, 80);
  if (q.length < 2) return res.json([]);
  res.json(db.prepare(`SELECT u.id, u.email, u.name, (SELECT COUNT(*) FROM servers s WHERE s.owner_id = u.id) AS servers
    FROM users u WHERE ulower(u.email) LIKE ? OR ulower(u.name) LIKE ? ORDER BY u.id DESC LIMIT 10`).all(like(q), like(q)));
});
adm.post('/servers/:id/owner', (req, res) => {
  const id = int(req.params.id);
  const s = db.prepare('SELECT * FROM servers WHERE id = ?').get(id);
  if (!s) return res.redirect('/admin/servers');
  const raw = str(req.body.user ?? req.body.email, 120).toLowerCase();
  if (raw === 'none') {
    db.prepare('UPDATE servers SET owner_id = NULL WHERE id = ?').run(id);
    audit(req, 'Снял владельца', s.name);
    return res.redirect(`/admin/servers/${id}?f=saved`);
  }
  // email или номер пользователя (#12)
  const u = /^#?\d+$/.test(raw) ? db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(int(raw.replace('#', '')))
    : db.prepare('SELECT id, email, name FROM users WHERE email = ?').get(raw);
  if (!u) return res.redirect(`/admin/servers/${id}?f=nouser`);
  db.prepare('UPDATE servers SET owner_id = ? WHERE id = ?').run(u.id, id);
  audit(req, 'Сменил владельца', `${s.name} → ${u.email}`);
  if (req.body.notify && u.id !== req.user.id) mailer.mails.serverTransferred(u.email, s, abs(serverPath(s)));
  res.redirect(`/admin/servers/${id}?f=owner`);
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
  const product = kind === 'points' ? null : db.prepare('SELECT id FROM products WHERE kind = ? ORDER BY active DESC, price LIMIT 1').get(kind);
  const points = kind === 'points' ? Math.round(int(req.body.points) / 5) * 5 : 0;
  if (kind === 'points' && !(points >= 5 && points <= 10000)) return fail('Промо-баллы: от 5 до 10 000');
  const b = kind === 'banner'
    ? { t: str(req.body.banner_title, 60) || s.name, x: str(req.body.banner_text, 140), i: safeUrl(req.body.banner_image), u: safeUrl(req.body.banner_url) }
    : { t: '', x: '', i: '', u: '' };
  const title = kind === 'points' ? `${points} промо-баллов на ${days} дн. (выдано админом)` : `${KINDS[kind].label} — ${days} дн. (выдано админом)`;
  const r = db.prepare(`INSERT INTO orders (user_id, server_id, product_id, kind, title, amount, days, points, provider, banner_title, banner_text, banner_image, banner_url, note, created)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?, ?, ?, ?, ?)`)
    .run(s.owner_id, s.id, product?.id ?? null, kind, title, amount, days, points, b.t, b.x, b.i, b.u, str(req.body.note, 200), now());
  const o = markPaid(Number(r.lastInsertRowid), 'manual', `admin:${req.user.id}`, { startNow: Boolean(req.body.start_now) });
  audit(req, 'Выдал услугу', `${kind === 'points' ? `${points} промо-баллов` : KINDS[kind].label} на ${days} дн. → ${s.name}${amount ? `, ${amount} ₽` : ''} (заказ #${o.id})`);
  res.redirect(`/admin/servers/${s.id}?f=granted`);
});

/* ---- купоны ---- */
adm.get('/coupons', (req, res) => send(res, V.adm.coupons(req, { list: db.prepare('SELECT * FROM coupons ORDER BY id DESC').all(), flash: flashOf(req) })));
adm.post('/coupons', (req, res) => {
  let code = str(req.body.code, 30).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (!code) code = `ND${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const pct = Math.min(90, Math.max(1, int(req.body.percent)));
  const days = Math.max(0, int(req.body.days));
  try {
    db.prepare('INSERT INTO coupons (code, percent, max_uses, expires, note, created) VALUES (?, ?, ?, ?, ?, ?)')
      .run(code, pct, Math.max(0, int(req.body.max_uses)), days ? now() + days * DAY : null, str(req.body.note, 100), now());
    audit(req, 'Создал купон', `${code}: −${pct}%`);
    res.redirect('/admin/coupons?f=saved');
  } catch { res.redirect('/admin/coupons?f=dupcoupon'); }
});
adm.post('/coupons/:id/toggle', (req, res) => { db.prepare('UPDATE coupons SET active = 1 - active WHERE id = ?').run(int(req.params.id)); res.redirect('/admin/coupons'); });
adm.post('/coupons/:id/delete', (req, res) => {
  const c = db.prepare('SELECT code FROM coupons WHERE id = ?').get(int(req.params.id));
  db.prepare('DELETE FROM coupons WHERE id = ?').run(int(req.params.id));
  if (c) audit(req, 'Удалил купон', c.code);
  res.redirect('/admin/coupons?f=ok');
});

/* ---- заказы ---- */
function ordersQuery(status, q, limit = 300) {
  const t = now();
  const cond = status === 'active' ? `o.status = 'paid' AND o.starts <= ${t} AND o.ends > ${t}` : status ? 'o.status = ?' : '1=1';
  const params = status && status !== 'active' ? [status] : [];
  const idq = /^#?\d+$/.test(q) ? int(q.replace('#', '')) : -1;
  return db.prepare(`SELECT o.*, s.name AS server_name, u.email AS user_email FROM orders o
    LEFT JOIN servers s ON s.id = o.server_id LEFT JOIN users u ON u.id = o.user_id
    WHERE ${cond} AND (? = '' OR o.id = ? OR ulower(s.name) LIKE ? OR ulower(s.address) LIKE ? OR ulower(u.email) LIKE ?) ORDER BY o.id DESC LIMIT ${limit}`)
    .all(...params, q, idq, like(q), like(q), like(q));
}
adm.get('/orders', (req, res) => {
  notify.markSeen('orders');
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
  db.prepare('UPDATE products SET title = ?, description = ?, label = ?, price = ?, days = ?, slots = ?, active = ? WHERE id = ?')
    .run(title, str(req.body.description, 300), str(req.body.label, 20), Math.max(1, int(req.body.price)), Math.max(1, int(req.body.days)), Math.max(0, int(req.body.slots)), req.body.active ? 1 : 0, int(req.params.id));
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
  notify.markSeen('users');
  const q = str(req.query.q, 80);
  const list = db.prepare(`SELECT u.*, (SELECT COUNT(*) FROM servers s WHERE s.owner_id = u.id) AS servers,
    (SELECT COALESCE(SUM(amount), 0) FROM orders o WHERE o.user_id = u.id AND o.status = 'paid') AS spent
    FROM users u WHERE (? = '' OR ulower(u.email) LIKE ? OR ulower(u.name) LIKE ?) ORDER BY u.id DESC LIMIT 500`).all(q, like(q), like(q));
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

adm.post('/users/:id/verify', (req, res) => {
  const id = int(req.params.id);
  db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(id);
  audit(req, 'Подтвердил email вручную', userEmail(id));
  res.redirect(backTo(req, '/admin/users?f=ok'));
});
adm.post('/users/:id/delete', (req, res) => {
  const id = int(req.params.id);
  const u = db.prepare('SELECT id, email, role FROM users WHERE id = ?').get(id);
  if (!u || id === req.user.id) return res.redirect('/admin/users?f=selfdel');
  const withServers = req.body.servers === '1';
  const n = withServers ? db.prepare('DELETE FROM servers WHERE owner_id = ?').run(id).changes : 0;
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  audit(req, 'Удалил пользователя', `${u.email}${withServers ? ` вместе с серверами (${n})` : ''}`);
  res.redirect('/admin/users?f=deleted');
});

adm.get('/launcher-live.json', (req, res) => res.set('Cache-Control', 'no-store').json(stats.adminSummary()));
adm.get('/notify.json', (req, res) => { const c = notify.counts(); res.set('Cache-Control', 'no-store').json({ ...c, text: notify.describe(c) }); });

/* ---- техподдержка ---- */
adm.get('/support', (req, res) => {
  const status = ['open', 'closed', 'all'].includes(req.query.status) ? req.query.status : 'open';
  const q = str(req.query.q, 80);
  send(res, V.adm.supportList(req, { list: support.list({ status, q }), status, q, flash: flashOf(req) }));
});
adm.get('/support/:id', (req, res) => {
  const t = support.get(int(req.params.id));
  if (!t) return res.redirect('/admin/support');
  support.markReadByAdmin(t.id);
  const servers = t.user_id ? db.prepare('SELECT id, name FROM servers WHERE owner_id = ?').all(t.user_id) : [];
  send(res, V.adm.supportThread(req, { t, messages: support.messages(t.id), servers, flash: flashOf(req) }));
});
adm.get('/support/:id/messages', (req, res) => {
  const t = support.get(int(req.params.id));
  if (!t) return res.status(404).json({ error: 'not found' });
  support.markReadByAdmin(t.id);
  res.set('Cache-Control', 'no-store').json({ messages: support.messages(t.id, int(req.query.after)), unreadByUser: t.unread_user });
});
adm.post('/support/:id/reply', (req, res) => {
  const t = support.get(int(req.params.id));
  const text = String(req.body.text ?? '').trim().slice(0, support.MAX_TEXT);
  if (t && text) {
    support.adminMessage(t.id, req.user.id, text);
    const to = t.email || (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.contact) ? t.contact : '');
    if (to && !t.unread_user) mailer.mails.supportReply(to, text);
  }
  if (req.get('accept')?.includes('application/json')) return res.json({ messages: t ? support.messages(t.id, int(req.body.after)) : [] });
  res.redirect(`/admin/support/${int(req.params.id)}`);
});
adm.post('/support/:id/status', (req, res) => {
  const id = int(req.params.id);
  const status = req.body.status === 'closed' ? 'closed' : 'open';
  support.setStatus(id, status);
  res.redirect(status === 'closed' ? '/admin/support?f=ok' : `/admin/support/${id}`);
});
adm.post('/support/:id/delete', (req, res) => {
  support.remove(int(req.params.id));
  audit(req, 'Удалил переписку поддержки', `#${int(req.params.id)}`);
  res.redirect('/admin/support?f=deleted');
});

/* ---- загрузки лаунчера ---- */
adm.get('/launcher', (req, res) => {
  const site = settings.get('site_url').replace(/\/$/, '');
  send(res, V.adm.launcherPage(req, { files: launcherFiles(), latest: latestLauncher(), site, flash: flashOf(req) }));
});
// Файл приходит «как есть» (application/octet-stream), без multipart — так проще и не нужен лишний модуль
adm.post('/launcher/upload', (req, res) => {
  const name = path.basename(str(req.query.name, 120));
  if (!FILE_RE.test(name)) return res.status(400).json({ ok: false, error: 'Допустимы .exe, .zip, .msi, .dmg, .AppImage, .deb; имя — латиница, цифры, точки, дефисы' });
  const max = 500 * 1024 * 1024;
  if (Number(req.headers['content-length']) > max) return res.status(413).json({ ok: false, error: 'Файл больше 500 МБ' });
  const tmp = path.join(DOWNLOADS, `.upload-${crypto.randomBytes(6).toString('hex')}`);
  const out = fs.createWriteStream(tmp);
  let size = 0, failed = false;
  const fail = (code, error) => { if (failed) return; failed = true; out.destroy(); fs.rm(tmp, { force: true }, () => {}); if (!res.headersSent) res.status(code).json({ ok: false, error }); };
  req.on('data', (c) => { size += c.length; if (size > max) { fail(413, 'Файл больше 500 МБ'); req.destroy(); } });
  req.on('aborted', () => fail(400, 'Загрузка прервана'));
  out.on('error', (e) => fail(500, `Не удалось сохранить файл: ${e.message}`));
  out.on('finish', () => {
    if (failed) return;
    if (size === 0) return fail(400, 'Пустой файл');
    fs.renameSync(tmp, path.join(DOWNLOADS, name));
    audit(req, 'Загрузил файл лаунчера', `${name} (${(size / 1048576).toFixed(1)} МБ)`);
    res.json({ ok: true, name, size });
  });
  req.pipe(out);
});
adm.post('/launcher/delete', (req, res) => {
  const name = path.basename(str(req.body.name, 120));
  if (FILE_RE.test(name)) {
    fs.rmSync(path.join(DOWNLOADS, name), { force: true });
    audit(req, 'Удалил файл лаунчера', name);
  }
  res.redirect('/admin/launcher?f=ok');
});

/* ---- журнал ---- */
adm.get('/log', (req, res) => {
  const list = db.prepare('SELECT l.*, u.email AS admin_email FROM admin_log l LEFT JOIN users u ON u.id = l.admin_id ORDER BY l.id DESC LIMIT 500').all();
  send(res, V.adm.log(req, { list }));
});

/* ---- настройки ---- */
const SETTING_KEYS = ['site_name', 'site_url', 'default_banner_title', 'default_banner_text', 'yoomoney_wallet', 'yoomoney_secret', 'heleket_merchant', 'heleket_api_key', 'yandex_metrika_id', 'google_analytics_id', 'yandex_verification', 'google_verification', 'vote_cooldown_hours', 'points_price', 'points_label', 'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'mail_from'];
adm.get('/settings', (req, res) => {
  const site = settings.get('site_url').replace(/\/$/, '');
  send(res, V.adm.settingsPage(req, { s: settings.all(), flash: flashOf(req), hooks: { yoomoney: `${site}/pay/yoomoney/notify`, heleket: `${site}/pay/heleket/webhook`, feed: `${site}/api/launcher/feed.json`, sitemap: `${site}/sitemap.xml`, robots: `${site}/robots.txt` } }));
});
adm.post('/settings', (req, res) => {
  // флажки: если галочка снята, браузер поле не отправляет — поэтому выставляем явно
  for (const k of ['show_launcher_online', 'demo_stats']) req.body[k] = req.body[k] ? '1' : '0';
  const changed = [...SETTING_KEYS, 'show_launcher_online', 'demo_stats'].filter((k) => k in req.body && settings.get(k) !== str(req.body[k], 300));
  for (const k of changed) settings.set(k, str(req.body[k], 300));
  if (changed.includes('demo_stats')) audit(req, req.body.demo_stats === '1' ? 'Включил демо-статистику (видна только админам)' : 'Выключил демо-статистику', '');
  if (changed.length) audit(req, 'Изменил настройки', changed.map((k) => (/secret|key|pass/.test(k) ? `${k} (скрыто)` : k)).join(', '));
  res.redirect('/admin/settings?f=saved');
});
adm.post('/settings/test-mail', async (req, res) => {
  if (!mailer.enabled()) return res.redirect('/admin/settings?f=mailoff#mail');
  try { await mailer.mails.test(req.user.email); res.redirect('/admin/settings?f=mailok#mail'); } catch (e) {
    res.redirect(`/admin/settings?f=mailerr&e=${encodeURIComponent(String(e.message).slice(0, 200))}#mail`);
  }
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
  stats.start();
  require('./mcversions').start();
  mailer.startReminders(KINDS);
  app.listen(PORT, () => console.log(`NLauncher, мониторинг: http://localhost:${PORT}`));
}

module.exports = app;
