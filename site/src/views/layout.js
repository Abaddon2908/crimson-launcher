const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { html, raw } = require('./html');
const { settings } = require('../db');

// Версия файла в ссылке (?v=хеш): после обновления сайта браузер сразу берёт новые стили и скрипты,
// а не старые из кэша.
const PUBLIC = path.join(__dirname, '..', '..', 'public');
const versions = {};
const asset = (name) => {
  if (!versions[name]) {
    try { versions[name] = crypto.createHash('sha1').update(fs.readFileSync(path.join(PUBLIC, name))).digest('hex').slice(0, 10); } catch { versions[name] = String(Date.now()); }
  }
  return `/${name}?v=${versions[name]}`;
};

const ICONS = {
  logo: '',
  chat: '<path d="M4 5h16v11H9l-5 4V5z"/>',
  send: '<path d="M4 12 20 4l-6 16-3-7-7-1z"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/>',
  puzzle: '<path d="M10 4a2 2 0 1 1 4 0v2h4v4h-2a2 2 0 1 0 0 4h2v4h-4v-2a2 2 0 1 0-4 0v2H6v-4h2a2 2 0 1 0 0-4H6V6h4z"/>',
  shield: '<path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3z"/><path d="m9 12 2 2 4-4"/>',
  play: '<path d="M7 4.5v15l12-7.5-12-7.5z"/>',
  feather: '<path d="M20 4c-6 0-12 4-13 13l-3 3"/><path d="M7 17c6 0 10-3 11-9"/><path d="M11 13h5"/>',
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

// Закрытые от поисковиков разделы
const PRIVATE = /^\/(admin|cabinet|login|register|pay)(\/|$)/;
const DEFAULT_DESC = 'Мониторинг серверов Minecraft: топ серверов с онлайном в реальном времени, голосование, IP-адреса и быстрый вход через NLauncher.';

/** Счётчики и подтверждения прав (из админки → Настройки → SEO и метрики) */
function analytics(s) {
  const ym = /^\d{5,12}$/.test(s.yandex_metrika_id || '') ? s.yandex_metrika_id : '';
  const ga = /^G-[A-Z0-9]{4,20}$/.test(s.google_analytics_id || '') ? s.google_analytics_id : '';
  let out = '';
  if (ym) {
    out += `<script>(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");ym(${ym},"init",{clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:true});</script>`
      + `<noscript><div><img src="https://mc.yandex.ru/watch/${ym}" style="position:absolute;left:-9999px" alt="" /></div></noscript>`;
  }
  if (ga) {
    out += `<script async src="https://www.googletagmanager.com/gtag/js?id=${ga}"></script>`
      + `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${ga}');</script>`;
  }
  return { html: raw(out), enabled: Boolean(ym || ga) };
}

/**
 * @param {object} o
 *  title, description — уникальные для страницы
 *  canonical — путь или полный адрес (по умолчанию текущий путь без параметров)
 *  image — картинка для превью в соцсетях (по умолчанию /assets/og-image.png)
 *  ogType — website | article | profile
 *  jsonld — массив объектов schema.org
 *  noindex — закрыть страницу от поисковиков
 */
function layout(req, { title, body, wide = false, flash = '', description = '', canonical, image, ogType = 'website', jsonld = [], noindex = false }) {
  const s = settings.all();
  const site = s.site_name;
  const base = (s.site_url || '').replace(/\/$/, '');
  const abs = (p) => (/^https?:\/\//.test(p || '') ? p : base + (p || '/'));
  const u = req.user;
  const path = (req.baseUrl || '') + req.path; // внутри роутеров (/admin, /cabinet) req.path относительный
  const closed = noindex || PRIVATE.test(path);
  const fullTitle = title ? `${title} — ${site}` : `${site} — мониторинг серверов Minecraft`;
  const desc = (description || DEFAULT_DESC).replace(/\s+/g, ' ').trim().slice(0, 300);
  const url = abs(canonical || path);
  const img = abs(image || '/assets/og-image.png');
  const metrics = closed && PRIVATE.test(path) && path.startsWith('/admin') ? { html: '', enabled: false } : analytics(s);
  const verify = (name, v) => (/^[\w-]{6,100}$/.test(v || '') ? html`<meta name="${name}" content="${v}" />` : '');
  const nav = (href, label) => html`<a href="${href}" class="${path === href || (href !== '/' && path.startsWith(href)) ? 'active' : ''}">${label}</a>`;
  return html`<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${fullTitle}</title>
  <meta name="description" content="${desc}" />
  <meta name="robots" content="${closed ? 'noindex, nofollow' : 'index, follow, max-image-preview:large, max-snippet:-1'}" />
  ${closed ? '' : html`<link rel="canonical" href="${url}" />`}
  <meta property="og:type" content="${ogType}" />
  <meta property="og:site_name" content="${site}" />
  <meta property="og:locale" content="ru_RU" />
  <meta property="og:title" content="${title || fullTitle}" />
  <meta property="og:description" content="${desc}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${img}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title || fullTitle}" />
  <meta name="twitter:description" content="${desc}" />
  <meta name="twitter:image" content="${img}" />
  <meta name="theme-color" content="#0c0a0b" />
  ${verify('yandex-verification', s.yandex_verification)}
  ${verify('google-site-verification', s.google_verification)}
  <link rel="icon" type="image/svg+xml" href="/assets/logo-mark.svg" />
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png" />
  <link rel="apple-touch-icon" sizes="180x180" href="/assets/apple-touch-icon.png" />
  <link rel="manifest" href="/site.webmanifest" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Unbounded:wght@600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="${asset('style.css')}" />
  ${closed ? '' : jsonld.filter(Boolean).map((j) => raw(`<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`))}
  ${metrics.html}
</head>
<body>
  <div class="bg" aria-hidden="true"><div class="bg-img"></div></div>
  <header class="top">
    <div class="wrap top-in">
      <a href="/" class="brand"><img class="logo" src="/assets/logo-mark.svg" alt="" /><span><b>${site}</b><small>Мониторинг серверов Minecraft</small></span></a>
      <nav class="nav">
        ${nav('/', 'Топ серверов')}
        ${nav('/servera/', 'Подборки')}
        ${nav('/ads', 'Реклама')}
        ${nav('/stats', 'Статистика')}
        ${nav('/launcher', 'NLauncher')}
      </nav>
      <div class="top-right">
        ${u ? html`
          ${u.role === 'admin' ? html`<a class="btn ghost sm" href="/admin" title="Админка">${icon('settings')}<span class="lbl">Админка</span></a>` : ''}
          <a class="btn ghost sm" href="/cabinet" title="Кабинет">${icon('server')}<span class="lbl">Кабинет</span></a>
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
    <span>© ${new Date().getFullYear()} ${site} — мониторинг серверов Minecraft · <span class="nowrap">При поддержке <a href="https://neo-dev.ru" target="_blank" rel="noopener">NeoDev</a></span></span>
    <span class="muted">Не является официальным продуктом Minecraft. Не одобрено и не связано с Mojang или Microsoft.</span>
  </footer>
  ${metrics.enabled ? html`<div class="cookie" id="cookie" hidden><span>Мы используем cookie и сервисы веб-аналитики, чтобы сайт работал лучше. Продолжая пользоваться сайтом, вы соглашаетесь с этим.</span><button class="btn primary sm" id="cookieOk">Понятно</button></div>` : ''}
  <script src="${asset('dropdown.js')}"></script>
  <script src="${asset('app.js')}"></script>
  ${(req.originalUrl || '').startsWith('/admin') ? '' : html`
  <div class="sup-widget" id="sup" data-csrf="${req.csrf}">
    <button class="sup-fab" id="supFab" type="button" aria-expanded="false" aria-controls="supPanel">${icon('chat')}<span>Поддержка</span><i class="sup-dot" id="supDot" hidden></i></button>
    <div class="sup-panel" id="supPanel" role="dialog" aria-label="Поддержка" hidden>
      <div class="sup-head">
        <img class="logo" src="/assets/logo-mark.svg" alt="" />
        <div><b>Поддержка ${site}</b><small>Обычно отвечаем в течение дня</small></div>
        <button class="sup-x" id="supClose" type="button" aria-label="Закрыть">${icon('x')}</button>
      </div>
      <div class="sup-body" id="supBody">
        <div class="sup-msg"><p>Здравствуйте! Напишите вопрос про сайт, рекламу или NLauncher — ответим прямо здесь. Переписка сохранится, к ней можно вернуться позже.</p></div>
      </div>
      <form class="sup-input" id="supForm">
        <input class="input" name="contact" id="supContact" maxlength="120" placeholder="Email или Telegram — чтобы мы могли ответить" hidden />
        <div class="sup-row">
          <textarea name="text" id="supText" rows="1" maxlength="2000" placeholder="Сообщение…" required></textarea>
          <button class="sup-send" type="submit" aria-label="Отправить">${icon('send')}</button>
        </div>
        <small class="sup-err" id="supErr" hidden></small>
      </form>
    </div>
  </div>
  <script src="${asset('support.js')}" defer></script>`}
</body>
</html>`;
}

const csrfField = (req) => html`<input type="hidden" name="_csrf" value="${req.csrf}" />`;

module.exports = { layout, icon, csrfField };
