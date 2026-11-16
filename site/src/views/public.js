const { html, raw, fmt, safeUrl } = require('./html');
const { layout, icon, csrfField } = require('./layout');
const { serverPath, abs, siteUrl } = require('../seo');
const { settings } = require('../db');

const favicon = (s, cls = 'fav') => (s.favicon && s.favicon.startsWith('data:image/')
  ? html`<img class="${cls}" src="${s.favicon}" alt="Иконка сервера ${s.name}" loading="lazy" width="64" height="64" />`
  : html`<span class="${cls} fav-ph">${(s.name || '?')[0].toUpperCase()}</span>`);

const statusDot = (s) => html`<span class="dot ${s.online ? 'ok' : 'bad'}"></span>`;

function playersBar(s) {
  const p = s.max_players ? Math.min(100, Math.round((s.players / s.max_players) * 100)) : 0;
  return html`<div class="pbar"><span style="width:${p}%"></span></div>`;
}

function serverRow(s) {
  return html`
  <a class="srow ${s.promo ? 'promo' : ''} ${s.highlight ? 'hl' : ''}" href="${serverPath(s)}">
    <span class="rank">${s.promo ? icon('bolt') : s.rank}</span>
    ${favicon(s)}
    <span class="srow-main">
      <b>${s.name}${s.promo ? html`<span class="badge gold">PROMO</span>` : ''}</b>
      <small>${s.motd || s.description || s.address}</small>
      <span class="tags">${s.version ? html`<span class="badge">${s.version}</span>` : ''}${s.tagList.slice(0, 3).map((t) => html`<span class="badge">${t}</span>`)}</span>
    </span>
    <span class="srow-ip" data-copy="${s.address}" title="Скопировать IP">${icon('copy')}<span>${s.address}</span></span>
    <span class="srow-players">
      <span class="num">${statusDot(s)}${s.online ? html`${fmt.num(s.players)}<i>/ ${fmt.num(s.max_players)}</i>` : 'офлайн'}</span>
      ${playersBar(s)}
    </span>
    <span class="srow-votes"><b>${fmt.num(s.votes)}</b><small>голосов</small></span>
  </a>`;
}

function home(req, { servers, banner, stats, q, tag, tags, news }) {
  const b = banner;
  const site = settings.get('site_name');
  const base = siteUrl();
  const jsonld = [
    {
      '@context': 'https://schema.org', '@type': 'WebSite', name: site, url: `${base}/`, inLanguage: 'ru',
      potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: `${base}/?q={search_term_string}` }, 'query-input': 'required name=search_term_string' },
    },
    { '@context': 'https://schema.org', '@type': 'Organization', name: 'NeoDev', url: `${base}/`, logo: `${base}/assets/icon.png` },
    servers.length && {
      '@context': 'https://schema.org', '@type': 'ItemList', name: tag ? `Сервера Minecraft: ${tag}` : 'Топ серверов Minecraft',
      itemListElement: servers.slice(0, 30).map((sv, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(serverPath(sv)), name: sv.name })),
    },
  ];
  const h1 = tag ? `Сервера Minecraft: ${tag}` : 'Лучшие сервера Minecraft';
  return layout(req, {
    title: tag ? `${h1} — IP-адреса, онлайн и рейтинг` : '',
    description: tag
      ? `Сервера Minecraft с режимом «${tag}»: IP-адреса, онлайн в реальном времени, голосование и рейтинг. ${stats.servers} серверов в мониторинге.`
      : `Топ серверов Minecraft: ${stats.servers} серверов с IP-адресами, онлайн в реальном времени, графики и голосование. Выживание, анархия, мини-игры и моды — найдите сервер по душе.`,
    canonical: tag ? `/?tag=${encodeURIComponent(tag)}` : '/',
    noindex: Boolean(q), // результаты поиска не индексируем
    jsonld,
    body: html`
    <section class="hero">
      <div class="hero-in">
        <span class="eyebrow">Мониторинг NeoDev</span>
        <h1>${h1}</h1>
        <p class="muted">Онлайн в реальном времени, честное голосование и быстрый вход через NLauncher.</p>
        <form class="hero-search" method="get" action="/">
          ${icon('search')}<input name="q" value="${q}" placeholder="Название, IP или режим…" />
          ${tag ? html`<input type="hidden" name="tag" value="${tag}" />` : ''}
          <button class="btn primary">Найти</button>
        </form>
        <div class="hero-stats">
          <div><b>${fmt.num(stats.servers)}</b><small>серверов</small></div>
          <div><b>${fmt.num(stats.players)}</b><small>игроков онлайн</small></div>
          <div><b>${fmt.num(stats.votes)}</b><small>голосов за месяц</small></div>
        </div>
      </div>
    </section>

    <a class="banner" href="${b.href}" ${b.external ? raw('target="_blank" rel="noopener sponsored"') : ''} style="${b.image ? `background-image:linear-gradient(90deg,rgba(12,10,11,.92),rgba(12,10,11,.35)),url('${encodeURI(b.image)}')` : ''}">
      <span class="ad-tag">${b.paid ? 'Реклама' : 'Рекламное место'}</span>
      <p class="banner-title">${b.title}</p>
      <p>${b.text}</p>
      <span class="cta">${b.cta} ${icon('arrow')}</span>
    </a>

    <div class="list-head">
      <h2>Топ серверов</h2>
      <div class="chips">
        <a class="chip ${!tag ? 'active' : ''}" href="/${q ? `?q=${encodeURIComponent(q)}` : ''}">Все</a>
        ${tags.map((t) => html`<a class="chip ${tag === t ? 'active' : ''}" href="/?tag=${encodeURIComponent(t)}${q ? `&q=${encodeURIComponent(q)}` : ''}">${t}</a>`)}
      </div>
    </div>
    <div class="slist">
      ${servers.length ? servers.map(serverRow) : html`<div class="empty"><b>Ничего не нашлось</b>Попробуйте другой запрос — или <a href="/cabinet/servers/new">добавьте свой сервер</a>.</div>`}
    </div>

    ${news.length ? html`
    <h2 class="sec">Новости</h2>
    <div class="news-grid">
      ${news.map((n) => html`<article class="card news"><small>${fmt.date(n.created)}</small><b>${n.title}</b><p>${n.text}</p>${safeUrl(n.url) ? html`<a class="link" href="${safeUrl(n.url)}" target="_blank" rel="noopener">Подробнее ${icon('arrow')}</a>` : ''}</article>`)}
    </div>` : ''}
    `,
  });
}

/** SVG-график онлайна */
function chart(points) {
  const W = 760, H = 180, P = 6;
  const vals = points.map((p) => p.v).filter((v) => v != null);
  if (!vals.length) return html`<div class="chart-empty">Данных пока нет — график появится после первых опросов сервера.</div>`;
  const max = Math.max(1, ...vals);
  const step = (W - P * 2) / (points.length - 1);
  const pts = points.map((p, i) => (p.v == null ? null : [P + i * step, H - P - (p.v / max) * (H - P * 2 - 14)]));
  let line = '', area = '', seg = [];
  const flush = () => {
    if (seg.length) {
      line += `M${seg.map((q) => q.join(',')).join('L')}`;
      area += `M${seg[0][0]},${H - P}L${seg.map((q) => q.join(',')).join('L')}L${seg[seg.length - 1][0]},${H - P}Z`;
    }
    seg = [];
  };
  pts.forEach((q) => (q ? seg.push(q.map((n) => n.toFixed(1))) : flush())); flush();
  const tip = points.map((p, i) => (p.v == null ? '' : `<rect x="${(P + i * step - step / 2).toFixed(1)}" y="0" width="${step.toFixed(1)}" height="${H}" fill="transparent"><title>${new Date(p.t).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} — ${p.v} игроков</title></rect>`)).join('');
  return raw(`<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c4747c" stop-opacity=".35"/><stop offset="1" stop-color="#c4747c" stop-opacity="0"/></linearGradient></defs>
    <path d="${area}" fill="url(#g)"/><path d="${line}" fill="none" stroke="#c4747c" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
    <text x="${W - P}" y="12" text-anchor="end" class="chart-max">макс. ${max}</text>${tip}
  </svg>`);
}

function server(req, { s, votes, points, range, voted, error, owner, rank }) {
  const links = [['Сайт', safeUrl(s.website)], ['Discord', safeUrl(s.discord)]].filter((l) => l[1]);
  const ver = s.version || s.game_version;
  const desc = [
    `${s.name} — сервер Minecraft${ver ? ` ${ver}` : ''}. IP: ${s.address}.`,
    s.tags ? `Режимы: ${s.tags}.` : '',
    s.online ? `Сейчас онлайн ${s.players} из ${s.max_players}.` : '',
    (s.description || s.motd || '').replace(/\s+/g, ' ').slice(0, 140),
  ].filter(Boolean).join(' ');
  return layout(req, {
    title: `${s.name} — IP ${s.address}${ver ? `, Minecraft ${ver}` : ''}`,
    description: desc,
    canonical: serverPath(s),
    image: safeUrl(s.banner) || undefined,
    ogType: 'article',
    noindex: s.status !== 'approved',
    jsonld: [{
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Топ серверов', item: abs('/') },
        { '@type': 'ListItem', position: 2, name: s.name, item: abs(serverPath(s)) },
      ],
    }],
    body: html`
    <section class="srv-hero" style="${safeUrl(s.banner) ? `background-image:linear-gradient(0deg,rgba(12,10,11,.95),rgba(12,10,11,.2)),url('${encodeURI(safeUrl(s.banner))}')` : ''}">
      ${favicon(s, 'fav big')}
      <div class="srv-hero-main">
        <div class="row">${s.promo ? html`<span class="badge gold">PROMO</span>` : ''}${rank ? html`<span class="badge">#${rank} в топе</span>` : ''}${s.status !== 'approved' ? html`<span class="badge red">${s.status === 'pending' ? 'На модерации' : 'Отклонён'}</span>` : ''}</div>
        <h1>${s.name}</h1>
        <button class="ip-copy" data-copy="${s.address}">${icon('copy')}<span>${s.address}</span><small>скопировать</small></button>
      </div>
      ${owner ? html`<a class="btn ghost sm" href="/cabinet/servers/${s.id}">${icon('edit')}Редактировать</a>` : ''}
    </section>

    <div class="srv-grid">
      <div class="col">
        <div class="stats">
          <div class="stat card"><b>${statusDot(s)}${s.online ? 'Онлайн' : 'Офлайн'}</b><small>обновлено ${fmt.ago(s.last_ping)}</small></div>
          <div class="stat card"><b>${fmt.num(s.players)}<i> / ${fmt.num(s.max_players)}</i></b><small>игроков</small></div>
          <div class="stat card"><b>${s.ping_ms || '—'}<i> мс</i></b><small>пинг от мониторинга</small></div>
          <div class="stat card"><b>${fmt.num(votes)}</b><small>голосов за месяц</small></div>
        </div>
        <div class="card pad">
          <div class="card-head"><h3>Онлайн</h3>
            <div class="seg">
              <a class="${range === 'day' ? 'active' : ''}" href="?range=day">24 часа</a>
              <a class="${range === 'week' ? 'active' : ''}" href="?range=week">7 дней</a>
              <a class="${range === 'month' ? 'active' : ''}" href="?range=month">30 дней</a>
            </div>
          </div>
          ${chart(points)}
        </div>
        <div class="card pad">
          <h3>О сервере</h3>
          <div class="prose">${s.description || 'Владелец пока не добавил описание.'}</div>
          ${s.motd ? html`<div class="motd">${s.motd}</div>` : ''}
          <dl class="kv">
            <dt>Версия</dt><dd>${s.version || s.game_version || '—'}</dd>
            <dt>Режимы</dt><dd>${s.tags || '—'}</dd>
            <dt>В мониторинге с</dt><dd>${fmt.date(s.created)}</dd>
            ${links.map(([k, v]) => html`<dt>${k}</dt><dd><a class="link" href="${v}" target="_blank" rel="noopener nofollow">${v.replace(/^https?:\/\//, '')}</a></dd>`)}
          </dl>
        </div>
      </div>
      <aside class="col side">
        <div class="card pad vote">
          <h3>Голосовать</h3>
          <p class="muted">Один голос в сутки. ${s.vote_webhook ? 'Сервер выдаёт награду за голос.' : ''}</p>
          ${voted ? html`<div class="ok-box">${icon('check')}Спасибо! Голос засчитан.</div>` : ''}
          ${error ? html`<div class="err-box">${error}</div>` : ''}
          <form method="post" action="/server/${s.id}/vote">${csrfField(req)}
            <input class="input" name="nickname" maxlength="16" placeholder="Ваш ник в игре" required pattern="[A-Za-z0-9_]{3,16}" />
            <button class="btn primary block">${icon('star')}Отдать голос</button>
          </form>
        </div>
        <a class="card pad launcher-cta" href="/launcher">
          <b>Играть через NLauncher</b>
          <p class="muted">Лицензия и офлайн, моды и сборки в пару кликов.</p>
          <span class="link">Скачать ${icon('download')}</span>
        </a>
        ${!s.promo ? html`<a class="card pad promo-cta" href="/ads"><b>Это ваш сервер?</b><p class="muted">Поднимите его над топом и в лаунчере с меткой PROMO.</p><span class="link">Тарифы ${icon('arrow')}</span></a>` : ''}
      </aside>
    </div>`,
  });
}

function ads(req, { products, stats }) {
  const kindIcon = { promo: 'bolt', banner: 'news', highlight: 'star', ingame: 'server' };
  return layout(req, {
    title: 'Реклама Minecraft-сервера в мониторинге и лаунчере',
    description: 'Продвижение Minecraft-сервера: PROMO в топе, баннер в NLauncher, выделение и сервер в списке «Сетевая игра» у игроков лаунчера. Оплата картой, ЮMoney или криптовалютой.',
    body: html`
    <section class="page-hero">
      <span class="eyebrow">Продвижение</span>
      <h1>Реклама в мониторинге и NLauncher</h1>
      <p class="muted">Ваш сервер увидят игроки на сайте и прямо в лаунчере — на главном экране, перед нажатием «Играть».</p>
      <div class="hero-stats"><div><b>${fmt.num(stats.servers)}</b><small>серверов в топе</small></div><div><b>${fmt.num(stats.players)}</b><small>игроков онлайн сейчас</small></div></div>
    </section>
    <div class="plans">
      ${products.map((p) => html`
      <div class="plan card ${p.kind === 'promo' && p.days >= 30 ? 'best' : ''}">
        <span class="plan-ic">${icon(kindIcon[p.kind] || 'tag')}</span>
        <h3>${p.title}</h3>
        <p class="muted">${p.description}</p>
        <div class="price">${fmt.rub(p.price)}<small> / ${fmt.plural(p.days, 'день', 'дня', 'дней')}</small></div>
        ${p.slots ? html`<small class="slots">${p.free > 0 ? `Свободно мест: ${p.free} из ${p.slots}` : `Все места заняты — старт ${fmt.date(p.nextStart)}`}</small>` : html`<small class="slots">Без ограничений</small>`}
        <a class="btn primary block" href="/cabinet/buy?product=${p.id}">Купить</a>
      </div>`)}
    </div>
    <div class="card pad faq">
      <h3>Как это работает</h3>
      <ol>
        <li>Зарегистрируйтесь и добавьте сервер — после модерации он появится в топе.</li>
        <li>Выберите тариф в кабинете и оплатите картой (ЮMoney) или криптовалютой (Heleket).</li>
        <li>Размещение включается автоматически сразу после оплаты. Если места заняты — встаёте в очередь, дата старта видна в кабинете.</li>
      </ol>
    </div>`,
  });
}

function authForm(req, { mode, error, values = {}, next = '' }) {
  const reg = mode === 'register';
  return layout(req, {
    title: reg ? 'Регистрация' : 'Вход',
    body: html`
    <div class="auth card">
      <div class="auth-cover"></div>
      <h1>${reg ? 'Регистрация' : 'Вход'}</h1>
      <p class="muted">${reg ? 'Аккаунт владельца сервера: добавляйте сервера, покупайте продвижение.' : 'С возвращением!'}</p>
      ${error ? html`<div class="err-box">${error}</div>` : ''}
      <form method="post">${csrfField(req)}
        <input type="hidden" name="next" value="${next}" />
        ${reg ? html`<label class="field"><span>Имя</span><input class="input" name="name" value="${values.name || ''}" required maxlength="40" /></label>` : ''}
        <label class="field"><span>Email</span><input class="input" type="email" name="email" value="${values.email || ''}" required /></label>
        <label class="field"><span>Пароль</span><input class="input" type="password" name="password" required minlength="${reg ? 8 : 1}" /></label>
        <button class="btn primary block">${reg ? 'Создать аккаунт' : 'Войти'}</button>
      </form>
      <p class="muted center">${reg ? html`Уже есть аккаунт? <a class="link" href="/login">Войти</a>` : html`Нет аккаунта? <a class="link" href="/register">Регистрация</a>`}</p>
    </div>`,
  });
}

function launcher(req, { downloadUrl, portableUrl, version, size }) {
  return layout(req, {
    title: 'NLauncher — лаунчер Minecraft с модами, лицензией и офлайн-входом',
    description: 'Скачать NLauncher — бесплатный лаунчер Minecraft для Windows: вход с лицензией и без, любые версии, Fabric, Quilt и Forge, моды из Modrinth в один клик, топ серверов.',
    jsonld: [{
      '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'NLauncher',
      operatingSystem: 'Windows 10, Windows 11', applicationCategory: 'GameApplication',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'RUB' },
      downloadUrl: abs(downloadUrl), ...(version ? { softwareVersion: version } : {}),
      author: { '@type': 'Organization', name: 'NeoDev' }, image: abs('/assets/icon.png'),
    }],
    body: html`
    <section class="page-hero launcher-hero">
      <span class="eyebrow">NeoDev</span>
      <h1>NLauncher</h1>
      <p class="muted">Минималистичный лаунчер Minecraft: лицензия и офлайн, любые версии, Fabric / Quilt / Forge, моды из Modrinth и сервера из этого мониторинга прямо на главном экране.</p>
      <div class="row">
        <a class="btn primary lg" href="${downloadUrl}">${icon('download')}Скачать для Windows</a>
        ${portableUrl ? html`<a class="btn ghost lg" href="${portableUrl}">Портативная версия</a>` : ''}
      </div>
      ${version ? html`<p class="muted small" style="margin-top:12px">Версия ${version}${size ? ` · ${(size / 1048576).toFixed(0)} МБ` : ''} · Windows 10/11</p>` : ''}
    </section>
    <div class="plans">
      <div class="card pad"><h3>Лицензия и офлайн</h3><p class="muted">Вход через Microsoft или просто по нику.</p></div>
      <div class="card pad"><h3>Сборки и моды</h3><p class="muted">Каталог Modrinth с автоматической установкой зависимостей.</p></div>
      <div class="card pad"><h3>Сервера</h3><p class="muted">Топ этого мониторинга и подключение в один клик.</p></div>
    </div>`,
  });
}

function statsPage(req, { s, h }) {
  const L = s.launcher, S = s.servers;
  const big = (key, value, label, hint = '') => html`<div class="stat card live"><b data-stat="${key}" data-value="${value}">${fmt.num(value)}</b><small>${label}</small>${hint ? html`<i class="muted">${hint}</i>` : ''}</div>`;
  const toPts = (key) => h.day.map((x) => ({ t: x.ts, v: x[key] }));
  const maxU = Math.max(1, ...h.days.map((d) => (s.showLauncher ? d.uniques : d.peakServers)));
  const dayLabel = (k) => new Date(`${k}T12:00:00Z`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  return layout(req, {
    title: 'Статистика: онлайн Minecraft-серверов и NLauncher',
    description: `Онлайн в реальном времени: ${fmt.num(S.online)} игроков на серверах мониторинга${s.showLauncher ? `, ${fmt.num(L.online)} в NLauncher` : ''}. Ежедневная статистика за 30 дней.`,
    noindex: s.demo,
    body: html`
    <section class="page-hero stats-hero" id="liveStats" data-demo="${s.demo ? '1' : ''}">
      <span class="eyebrow">Статистика ${s.demo ? html`<span class="badge demo">ДЕМО · видите только вы</span>` : ''}</span>
      <h1>Онлайн прямо сейчас</h1>
      <p class="muted"><span class="dot ok pulse"></span> Обновляется автоматически каждые 30 секунд</p>
      <div class="stats ${s.showLauncher ? 'four' : 'two-col'}">
        ${big('servers.online', S.online, 'игроков на серверах мониторинга', `${fmt.num(S.count)} серверов онлайн`)}
        ${s.showLauncher ? big('launcher.online', L.online, 'запущено NLauncher', 'лаунчеров открыто сейчас') : ''}
        ${s.showLauncher ? big('launcher.inGame', L.inGame, 'играют через NLauncher', 'в игре прямо сейчас') : ''}
        ${big('servers.peakToday', S.peakToday, 'пик на серверах сегодня')}
      </div>
    </section>

    <div class="card pad">
      <div class="card-head"><h2 class="h3">Онлайн за 24 часа</h2><small class="muted">снимок каждые 5 минут</small></div>
      ${s.showLauncher ? html`<p class="muted small">NLauncher</p>${chart(toPts('launcher'))}<p class="muted small" style="margin-top:14px">Сервера мониторинга</p>` : ''}
      ${chart(toPts('servers'))}
    </div>

    ${s.showLauncher ? html`
    <div class="stats four" style="margin-top:18px">
      <div class="stat card"><b>${fmt.num(L.today.uniques)}</b><small>игроков сегодня</small></div>
      <div class="stat card"><b>${fmt.num(L.today.launches)}</b><small>запусков игры сегодня</small></div>
      <div class="stat card"><b>${fmt.num(L.week)}</b><small>игроков за 7 дней</small></div>
      <div class="stat card"><b>${fmt.num(L.month)}</b><small>игроков за 30 дней</small></div>
    </div>` : ''}

    <div class="card pad" style="margin-top:18px">
      <div class="card-head"><h2 class="h3">${s.showLauncher ? 'Игроков NLauncher по дням' : 'Пик онлайна серверов по дням'}</h2><small class="muted">последние 30 дней</small></div>
      <div class="bars days">${h.days.map((d) => { const v = s.showLauncher ? d.uniques : d.peakServers; return html`<span title="${dayLabel(d.day)}: ${fmt.num(v)}" style="height:${Math.max(2, (v / maxU) * 100)}%"></span>`; })}</div>
      <div class="bars-axis"><span>${dayLabel(h.days[0].day)}</span><span>сегодня</span></div>
      <div class="table-wrap" style="margin-top:16px"><table class="table compact">
        <thead><tr><th>День</th>${s.showLauncher ? html`<th>Игроков</th><th>Запусков</th><th>Пик в лаунчере</th>` : ''}<th>Пик на серверах</th></tr></thead>
        <tbody>${h.days.slice(-7).reverse().map((d) => html`<tr><td class="nowrap">${dayLabel(d.day)}</td>${s.showLauncher ? html`<td>${fmt.num(d.uniques)}</td><td>${fmt.num(d.launches)}</td><td>${fmt.num(d.peak)}</td>` : ''}<td>${fmt.num(d.peakServers)}</td></tr>`)}</tbody>
      </table></div>
    </div>

    <div class="card pad faq" style="margin-top:18px">
      <h2 class="h3">Как мы считаем</h2>
      <ul>
        <li><b>Сервера мониторинга</b> — сумма игроков на всех серверах топа: сайт опрашивает их каждые 5 минут.</li>
        ${s.showLauncher ? html`<li><b>NLauncher</b> — запущенный лаунчер раз в 2 минуты отправляет анонимный случайный идентификатор и признак «в игре». Никаких ников, IP-адресов и других личных данных мы не храним. Отправку можно отключить в настройках лаунчера.</li>` : ''}
        ${s.demo
          ? html`<li><b>Сейчас включён демо-режим:</b> цифры на этой странице вымышленные и видны только администраторам. Посетители видят настоящую статистику. Выключить: Админка → Настройки.</li>`
          : html`<li>Все цифры настоящие и обновляются автоматически.</li>`}
      </ul>
    </div>`,
  });
}

function message(req, title, text, status = 200) {
  return layout(req, { title, noindex: true, body: html`<div class="empty big"><b>${title}</b>${text}<br/><br/><a class="btn ghost" href="/">На главную</a></div>` });
}

module.exports = { home, server, ads, authForm, launcher, statsPage, message, favicon, statusDot, chart };
