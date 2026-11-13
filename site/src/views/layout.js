const { html, raw } = require('./html');
const { settings } = require('../db');

const ICONS = {
  logo: '',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  bolt: '<path d="M13 3 4 14h7l-1 7 9-11h-7z"/>',
  wifi: '<path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M9 9.5h4.5a2 2 0 0 1 0 4H9V8m0 9v-3.5M11 8V6.5M11 17.5V16"/>',
  wallet: '<path d="M4 7h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12"/><circle cx="16.5" cy="13.5" r="1.3"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  news: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h10M7 17h6"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/>',
  logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
};
const icon = (n, cls = '') => raw(`<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ''}</svg>`);

function layout(req, { title, body, wide = false, flash = '', description = '' }) {
  const site = settings.get('site_name');
  const u = req.user;
  const path = req.path;
  const nav = (href, label) => html`<a href="${href}" class="${path === href || (href !== '/' && path.startsWith(href)) ? 'active' : ''}">${label}</a>`;
  return html`<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title ? `${title} — ${site}` : site}</title>
  <meta name="description" content="${description || 'Топ Minecraft-серверов: онлайн, голосование, отзывы. Мониторинг от NeoDev и NLauncher.'}" />
  <link rel="icon" href="/assets/icon.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Unbounded:wght@600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/style.css" />
</head>
<body>
  <div class="bg" aria-hidden="true"><div class="bg-img"></div></div>
  <header class="top">
    <div class="wrap top-in">
      <a href="/" class="brand"><span class="logo">N</span><span><b>${site}</b><small>by NeoDev</small></span></a>
      <nav class="nav">
        ${nav('/', 'Топ серверов')}
        ${nav('/ads', 'Реклама')}
        ${nav('/launcher', 'NLauncher')}
      </nav>
      <div class="top-right">
        ${u ? html`
          ${u.role === 'admin' ? html`<a class="btn ghost sm" href="/admin">${icon('settings')}Админка</a>` : ''}
          <a class="btn ghost sm" href="/cabinet">${icon('server')}Кабинет</a>
          <form method="post" action="/logout" class="inline"><input type="hidden" name="_csrf" value="${req.csrf}" /><button class="btn ghost sm icon" title="Выйти">${icon('logout')}</button></form>
        ` : html`
          <a class="btn ghost sm" href="/login">Войти</a>
          <a class="btn primary sm" href="/register">Добавить сервер</a>
        `}
      </div>
    </div>
  </header>
  <main class="wrap ${wide ? 'wide' : ''}">
    ${flash ? html`<div class="flash">${flash}</div>` : ''}
    ${body}
  </main>
  <footer class="foot wrap">
    <span>© ${new Date().getFullYear()} NeoDev · ${site}</span>
    <span class="muted">Не является официальным продуктом Minecraft. Не одобрено и не связано с Mojang или Microsoft.</span>
  </footer>
  <script src="/dropdown.js"></script>
  <script src="/app.js"></script>
</body>
</html>`;
}

const csrfField = (req) => html`<input type="hidden" name="_csrf" value="${req.csrf}" />`;

module.exports = { layout, icon, csrfField };
