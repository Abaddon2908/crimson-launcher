const { html, raw, fmt, safeUrl } = require('./html');
const { layout, icon, csrfField } = require('./layout');
const { serverPath, abs, siteUrl } = require('../seo');
const { settings } = require('../db');
const { BY_NAME, versionLabel, GROUPS, VERSIONS } = require('../tags');
const { pointPrice } = require('../pricing');

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
  <a class="srow ${s.promo ? 'promo' : ''} ${s.highlight ? `hl hl-${s.hl_color || 'red'}` : ''}" href="${serverPath(s)}">
    <span class="rank">${s.promo ? icon('bolt') : s.rank}</span>
    ${favicon(s)}
    <span class="srow-main">
      <b>${s.name}${s.promo ? html`<span class="badge gold">PROMO</span>` : ''}${s.points ? html`<span class="pts" title="Промо-баллы">⚡${fmt.num(s.points)}</span>` : ''}</b>
      <small>${s.motd || s.description || s.address}</small>
      <span class="tags">${s.version ? html`<span class="badge">${s.version}</span>` : ''}${s.tagList.slice(0, 3).map((t) => html`<span class="badge">${t}</span>`)}</span>
    </span>
    <span class="srow-ip" data-copy="${s.address}" data-server="${s.id}" title="Скопировать IP">${icon('copy')}<span>${s.address}</span></span>
    <span class="srow-players">
      <span class="num">${statusDot(s)}${s.online ? html`${fmt.num(s.players)}<i>/ ${fmt.num(s.max_players)}</i>` : 'офлайн'}</span>
      ${playersBar(s)}
    </span>
    <span class="srow-votes"><b>${fmt.num(s.votes)}</b><small>голосов</small></span>
  </a>`;
}

const HOME_FAQ = [
  ['Что такое мониторинг серверов Майнкрафт?', 'Это сайт со списком серверов Minecraft, где видно их IP-адреса, онлайн, версию и рейтинг. Мониторинг сам проверяет сервера каждые несколько минут, поэтому данные всегда свежие.'],
  ['Как выбрать сервер Minecraft?', 'Выберите режим (выживание, анархия, мини-игры, моды) и версию игры, затем посмотрите онлайн, аптайм и голоса игроков. Сервер с высоким аптаймом и живым онлайном почти всегда лучше пустого.'],
  ['Как зайти на сервер?', 'Скопируйте IP-адрес в один клик и добавьте его в «Сетевую игру» Minecraft. Ещё проще — через NLauncher: он сам подберёт версию и подключится к серверу.'],
  ['Как добавить свой сервер в мониторинг?', 'Зарегистрируйтесь, нажмите «Добавить сервер» и укажите IP-адрес. После модерации сервер появится в топе. Добавление бесплатное.'],
  ['Как поднять сервер в топе?', 'Позиция зависит от голосов игроков за месяц. Голосовать можно раз в сутки, а награды за голос выдаются через Votifier. Также можно купить рекламу: PROMO-место, промо-баллы или выделение.'],
];

function home(req, { servers, banner, stats, q, tag, tags, news }) {
  const b = banner;
  const site = settings.get('site_name');
  const base = siteUrl();
  const jsonld = [
    {
      '@context': 'https://schema.org', '@type': 'WebSite', name: site, url: `${base}/`, inLanguage: 'ru',
      potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: `${base}/?q={search_term_string}` }, 'query-input': 'required name=search_term_string' },
    },
    { '@context': 'https://schema.org', '@type': 'Organization', name: settings.get('site_name'), url: `${base}/`, logo: `${base}/assets/icon.png` },
    servers.length && {
      '@context': 'https://schema.org', '@type': 'ItemList', name: tag ? `Сервера Minecraft: ${tag}` : 'Топ серверов Minecraft',
      itemListElement: servers.slice(0, 30).map((sv, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(serverPath(sv)), name: sv.name })),
    },
  ];
  const h1 = tag ? `Сервера Minecraft: ${tag}` : 'Мониторинг серверов Майнкрафт';
  const main = !tag && !q; // SEO-текст и вопросы — только на чистой главной
  if (main) jsonld.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: HOME_FAQ.map(([qq, a]) => ({ '@type': 'Question', name: qq, acceptedAnswer: { '@type': 'Answer', text: a } })) });
  return layout(req, {
    title: tag ? `${h1} — IP-адреса, онлайн и рейтинг` : 'Мониторинг серверов Майнкрафт: топ серверов Minecraft',
    description: tag
      ? `Сервера Minecraft с режимом «${tag}»: IP-адреса, онлайн в реальном времени, голосование и рейтинг. ${stats.servers} серверов в мониторинге.`
      : `Мониторинг серверов Майнкрафт (Minecraft): топ серверов с IP-адресами, онлайном в реальном времени, графиками и голосованием. Выживание, анархия, мини-игры и моды — ${stats.servers} серверов в рейтинге.`,
    canonical: tag ? `/?tag=${encodeURIComponent(tag)}` : '/',
    noindex: Boolean(q), // результаты поиска не индексируем
    jsonld,
    body: html`
    <section class="hero">
      <div class="hero-in">
        <span class="eyebrow">${tag ? 'Мониторинг серверов Майнкрафт' : 'Топ серверов Minecraft'}</span>
        <h1>${h1}</h1>
        <p class="muted">IP-адреса, онлайн в реальном времени, честное голосование и быстрый вход через NLauncher.</p>
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
        ${tags.map((t) => { const c = BY_NAME.get(t.toLowerCase()); return html`<a class="chip ${tag === t ? 'active' : ''}" href="${c ? `/servera-${c.slug}/` : `/?tag=${encodeURIComponent(t)}`}">${t}</a>`; })}
        <a class="chip more" href="/servera/">Все подборки →</a>
        <a class="chip" href="/new">Новые</a>
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

    ${main ? html`
    <section class="seo-about">
      <div class="card pad prose-card">
        <h2 class="h3">Мониторинг серверов Minecraft</h2>
        <p>${site} — мониторинг серверов Майнкрафт с рейтингом, который обновляется в реальном времени. Каждые несколько минут мы проверяем каждый сервер: онлайн, пинг, версию и описание. На странице сервера — IP-адрес, графики онлайна за сутки, неделю и месяц, аптайм и отзывы игроков.</p>
        <p>Место в топе зависит от голосов игроков за месяц, а рекламные места всегда подписаны. Ищите сервера по режиму — <a class="link" href="/servera-vyzhivanie/">выживание</a>, <a class="link" href="/servera-anarhiya/">анархия</a>, <a class="link" href="/servera-s-mini-igrami/">мини-игры</a> — или по версии, например <a class="link" href="/servera-1.21/">сервера Майнкрафт 1.21</a>. Все подборки — в <a class="link" href="/servera/">каталоге</a>.</p>
      </div>
      <div class="card pad">
        <h2 class="h3">Частые вопросы</h2>
        ${HOME_FAQ.map(([qq, a]) => html`<details class="qa"><summary>${qq}</summary><p>${a}</p></details>`)}
      </div>
    </section>` : ''}
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

const stars = (n) => raw(`<span class="stars" aria-label="${n} из 5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= Math.round(n) ? 'on' : ''}">★</i>`).join('')}</span>`);
const plural = (n, a, b, c) => fmt.plural(n, a, b, c).replace(/^\S+ /, '');

function server(req, { s, votes, points, range, voted, error, owner, rank, ranks, avgOnline, uptime, recentVotes, topVoters, rating, similar, copies, cooldownH }) {
  const links = [['Сайт', safeUrl(s.website)], ['Discord', safeUrl(s.discord)]].filter((l) => l[1]);
  const ver = versionLabel(s) || s.game_version;
  const tagList = String(s.tags || '').split(',').map((x) => x.trim()).filter(Boolean);
  const tagLink = (t) => { const c = BY_NAME.get(t.toLowerCase()); return c ? html`<a class="badge" href="/servera-${c.slug}/">${t}</a>` : html`<span class="badge">${t}</span>`; };
  // автоматический FAQ (для людей и для поисковиков — FAQPage)
  const faq = [
    [`Как зайти на сервер ${s.name}?`, `Запустите Minecraft${ver ? ` ${ver}` : ''}, откройте «Сетевая игра» → «Добавить сервер» и введите адрес ${s.address}. Проще всего — через NLauncher: сервер уже есть в списке.`],
    [`Какой IP у сервера ${s.name}?`, `IP-адрес: ${s.address}.${ver ? ` Поддерживаемые версии: ${ver}.` : ''}`],
    [`Сколько игроков на ${s.name} и работает ли сервер?`, s.online
      ? `Сервер работает. Сейчас играют ${s.players} из ${s.max_players}${avgOnline != null ? `, средний онлайн за 7 дней — ${avgOnline}` : ''}${uptime != null ? `. Аптайм за 30 дней — ${uptime}%` : ''}.`
      : `Сейчас сервер не отвечает${uptime != null ? `; аптайм за 30 дней — ${uptime}%` : ''}.`],
    tagList.length ? [`Какие режимы есть на ${s.name}?`, `${tagList.join(', ')}.`] : null,
    [`Как часто можно голосовать за ${s.name}?`, `Раз в ${cooldownH} ${plural(cooldownH, 'час', 'часа', 'часов')}. В этом месяце сервер получил ${votes} ${plural(votes, 'голос', 'голоса', 'голосов')}.${s.votifier_host ? ' За голос сервер выдаёт награду в игре.' : ''}`],
  ].filter(Boolean);
  return layout(req, {
    title: `${s.name} — IP ${s.address}${ver ? `, Minecraft ${ver}` : ''}`,
    description: [`${s.name} — сервер Minecraft${ver ? ` ${ver}` : ''}. IP: ${s.address}.`, tagList.length ? `Режимы: ${tagList.slice(0, 5).join(', ')}.` : '', s.online ? `Сейчас онлайн ${s.players} из ${s.max_players}.` : '', (s.description || s.motd || '').replace(/\s+/g, ' ').slice(0, 120)].filter(Boolean).join(' '),
    canonical: serverPath(s),
    image: safeUrl(s.banner) || undefined,
    ogType: 'article',
    noindex: s.status !== 'approved',
    jsonld: [
      { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Топ серверов', item: abs('/') },
        ...(tagList[0] && BY_NAME.get(tagList[0].toLowerCase()) ? [{ '@type': 'ListItem', position: 2, name: `Сервера: ${tagList[0]}`, item: abs(`/servera-${BY_NAME.get(tagList[0].toLowerCase()).slug}/`) }] : []),
        { '@type': 'ListItem', position: tagList[0] && BY_NAME.get(tagList[0].toLowerCase()) ? 3 : 2, name: s.name, item: abs(serverPath(s)) },
      ] },
      { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
    ],
    body: html`
    <section class="srv-hero" style="${safeUrl(s.banner) ? `background-image:linear-gradient(0deg,rgba(12,10,11,.95),rgba(12,10,11,.2)),url('${encodeURI(safeUrl(s.banner))}')` : ''}">
      ${favicon(s, 'fav big')}
      <div class="srv-hero-main">
        <div class="row">${s.promo ? html`<span class="badge gold">PROMO</span>` : ''}${rank ? html`<span class="badge">#${rank} в топе</span>` : ''}${rating ? html`<span class="badge">${stars(rating.avg)} ${rating.avg}</span>` : ''}${s.status !== 'approved' ? html`<span class="badge red">${s.status === 'pending' ? 'На модерации' : 'Отклонён'}</span>` : ''}</div>
        <h1>${s.name}</h1>
        <div class="row">
          <button class="ip-copy" data-copy="${s.address}" data-server="${s.id}">${icon('copy')}<span>${s.address}</span><small>скопировать</small></button>
          <button class="btn ghost fav-btn" data-fav="${s.id}" title="В избранное">${icon('star')}<span>В избранное</span></button>
        </div>
      </div>
      ${owner ? html`<div class="row"><a class="btn ghost sm" href="/cabinet/servers/${s.id}">${icon('edit')}Редактировать</a><a class="btn ghost sm" href="/cabinet/servers/${s.id}/stats">${icon('chart')}Статистика</a></div>` : ''}
    </section>

    <div class="srv-grid">
      <div class="col">
        <div class="stats">
          <div class="stat card"><b>${statusDot(s)}${s.online ? 'Онлайн' : 'Офлайн'}</b><small>обновлено ${fmt.ago(s.last_ping)}</small></div>
          <div class="stat card"><b>${fmt.num(s.players)}<i> / ${fmt.num(s.max_players)}</i></b><small>${avgOnline != null ? `в среднем ${fmt.num(avgOnline)} за 7 дней` : 'игроков'}</small></div>
          <div class="stat card"><b>${uptime != null ? `${uptime}` : '—'}<i> %</i></b><small>аптайм за 30 дней</small></div>
          <div class="stat card"><b>${fmt.num(votes)}</b><small>голосов за месяц</small></div>
        </div>
        ${ranks ? html`
        <div class="ranks">
          <div class="card rank-card"><span>🏆</span><b>${ranks.overall}<i> из ${fmt.num(ranks.total)}</i></b><small>общий рейтинг</small></div>
          <div class="card rank-card"><span>👍</span><b>${ranks.votes}<i> место</i></b><small>по голосам · топ ${ranks.votesTop}%</small></div>
          <div class="card rank-card"><span>📊</span><b>${ranks.online}<i> место</i></b><small>по онлайну · топ ${ranks.onlineTop}%</small></div>
        </div>` : ''}
        <div class="card pad">
          <div class="card-head"><h2 class="h3">Онлайн</h2>
            <div class="seg">
              <a class="${range === 'day' ? 'active' : ''}" href="?range=day" rel="nofollow">24 часа</a>
              <a class="${range === 'week' ? 'active' : ''}" href="?range=week" rel="nofollow">7 дней</a>
              <a class="${range === 'month' ? 'active' : ''}" href="?range=month" rel="nofollow">30 дней</a>
            </div>
          </div>
          ${chart(points)}
        </div>
        <div class="card pad">
          <h2 class="h3">О сервере</h2>
          <div class="prose">${s.description || 'Владелец пока не добавил описание.'}</div>
          ${s.motd ? html`<div class="motd">${s.motd}</div>` : ''}
          ${tagList.length ? html`<div class="badges srv-tags">${tagList.map(tagLink)}</div>` : ''}
          <dl class="kv">
            <dt>Версии</dt><dd>${ver || '—'}</dd>
            <dt>В мониторинге с</dt><dd>${fmt.date(s.created)}</dd>
            <dt>Копирований IP</dt><dd>${fmt.num(copies.monthCopies)} в этом месяце · ${fmt.num(copies.todayCopies)} сегодня</dd>
            ${links.map(([k, v]) => html`<dt>${k}</dt><dd><a class="link" href="${v}" target="_blank" rel="noopener nofollow">${v.replace(/^https?:\/\//, '')}</a></dd>`)}
          </dl>
        </div>
        <div class="card pad">
          <div class="card-head"><h2 class="h3">Голоса</h2><small class="muted">${rating ? html`${stars(rating.avg)} ${rating.avg} · ${fmt.plural(rating.n, 'оценка', 'оценки', 'оценок')}` : 'пока нет оценок'}</small></div>
          <div class="two votes-two">
            <div><p class="muted small">Последние голоса</p>
              ${recentVotes.length ? html`<table class="table compact"><tbody>${recentVotes.map((v) => html`<tr><td><b>${v.nickname}</b></td><td>${stars(v.rating)}</td><td class="small muted right nowrap">${fmt.ago(v.ts)}</td></tr>`)}</tbody></table>` : html`<p class="muted">Будьте первым!</p>`}</div>
            <div><p class="muted small">Топ голосующих за месяц</p>
              ${topVoters.length ? html`<table class="table compact"><tbody>${topVoters.map((v, i) => html`<tr><td class="muted">${['🥇', '🥈', '🥉'][i] || i + 1}</td><td><b>${v.nickname}</b></td><td class="right nowrap">${fmt.plural(v.n, 'голос', 'голоса', 'голосов')}</td></tr>`)}</tbody></table>` : html`<p class="muted">Пока никого.</p>`}</div>
          </div>
        </div>
        <div class="card pad faq">
          <h2 class="h3">Частые вопросы</h2>
          ${faq.map(([q, a]) => html`<details class="qa"><summary>${q}</summary><p>${a}</p></details>`)}
        </div>
      </div>
      <aside class="col side">
        <div class="card pad vote" id="vote">
          <h2 class="h3">Голосовать</h2>
          <p class="muted">Раз в ${cooldownH} ${plural(cooldownH, 'час', 'часа', 'часов')}. ${s.votifier_host || s.vote_webhook ? 'За голос сервер выдаёт награду в игре.' : ''}</p>
          ${voted ? html`<div class="ok-box">${icon('check')}Спасибо! Голос засчитан.</div>` : ''}
          ${error ? html`<div class="err-box">${error}</div>` : ''}
          <form method="post" action="/server/${s.id}/vote">${csrfField(req)}
            <input class="input" name="nickname" maxlength="16" placeholder="Ваш ник в игре" required pattern="[A-Za-z0-9_]{3,16}" />
            <div class="rate" role="radiogroup" aria-label="Оценка сервера">${[5, 4, 3, 2, 1].map((n) => html`<input type="radio" id="r${n}" name="rating" value="${n}" ${n === 5 ? 'checked' : ''} /><label for="r${n}" title="${n} из 5">★</label>`)}</div>
            <button class="btn primary block">${icon('star')}Отдать голос</button>
          </form>
        </div>
        <a class="card pad launcher-cta" href="/launcher">
          <b>Играть через NLauncher</b>
          <p class="muted">Лицензия и офлайн, моды и сборки в пару кликов.</p>
          <span class="link">Скачать ${icon('download')}</span>
        </a>
        ${similar.length ? html`<div class="card pad similar"><h2 class="h3">Похожие сервера</h2>${similar.map((x) => html`<a class="sim" href="${serverPath(x)}">${favicon(x, 'fav sm')}<span><b>${x.name}</b><small>${x.online ? `${fmt.num(x.players)} онлайн` : 'офлайн'}</small></span></a>`)}</div>` : ''}
        ${!s.promo ? html`<a class="card pad promo-cta" href="/ads"><b>Это ваш сервер?</b><p class="muted">Поднимите его в топе промо-баллами, PROMO или прямо в игре у игроков NLauncher.</p><span class="link">Тарифы ${icon('arrow')}</span></a>` : ''}
      </aside>
    </div>`,
  });
}

function ads(req, { products, stats }) {
  const kindIcon = { promo: 'bolt', banner: 'news', highlight: 'star', ingame: 'server' };
  return layout(req, {
    title: 'Реклама Minecraft-сервера в мониторинге и лаунчере',
    description: 'Продвижение Minecraft-сервера: PROMO в топе, баннер в NLauncher, выделение и сервер в списке «Сетевая игра» у игроков лаунчера. Удобная оплата онлайн.',
    body: html`
    <section class="page-hero">
      <span class="eyebrow">Продвижение</span>
      <h1>Реклама в мониторинге и NLauncher</h1>
      <p class="muted">Ваш сервер увидят игроки на сайте и прямо в лаунчере — на главном экране, перед нажатием «Играть».</p>
      <div class="hero-stats"><div><b>${fmt.num(stats.servers)}</b><small>серверов в топе</small></div><div><b>${fmt.num(stats.players)}</b><small>игроков онлайн сейчас</small></div></div>
    </section>
    <div class="plans">
      <div class="plan card ${settings.get('points_label') ? 'best' : ''} points-plan">
        ${settings.get('points_label') ? html`<span class="plan-label">${settings.get('points_label')}</span>` : ''}
        <span class="plan-ic">${icon('chart')}</span>
        <h3>Промо-баллы</h3>
        <p class="muted">Поднимают сервер в общем топе: чем больше активных баллов, тем выше. Любое количество на срок от 7 дней до полугода, покупки складываются.</p>
        <div class="price">от ${fmt.rub(pointPrice() * 5)}<small> / 5 баллов на 7 дней</small></div>
        <small class="slots">Пакеты: 200 — −5%, 500 — −10%, 1000 — −15%</small>
        <a class="btn primary block" href="/cabinet/buy?product=points">Рассчитать и купить</a>
      </div>
      ${products.filter((p) => p.kind !== 'points').map((p) => html`
      <div class="plan card ${p.label ? 'best' : ''}">
        ${p.label ? html`<span class="plan-label">${p.label}</span>` : ''}
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
        <li>Выберите услугу в кабинете и удобный способ оплаты. Есть купоны на скидку.</li>
        <li><b>Порядок в топе:</b> сначала PROMO-места, затем сервера с промо-баллами (по сумме баллов), затем остальные — по голосам игроков за месяц.</li>
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
        ${reg ? '' : html`<p class="auth-forgot"><a class="link small" href="/forgot">Забыли пароль?</a></p>`}
        <button class="btn primary block">${reg ? 'Создать аккаунт' : 'Войти'}</button>
      </form>
      <p class="muted center">${reg ? html`Уже есть аккаунт? <a class="link" href="/login">Войти</a>` : html`Нет аккаунта? <a class="link" href="/register">Регистрация</a>`}</p>
    </div>`,
  });
}

const CATS = [['', 'Все'], ['m', 'Парни'], ['f', 'Девушки'], ['cape', 'С плащом'], ['players', 'Скины игроков']];
const STYLE_SEO = { 'Повседневные': 'повседневные', 'Спортивные': 'спортивные', 'Деловые': 'деловые', 'Воины': 'рыцари и воины', 'Маги': 'маги и волшебники', 'Ниндзя': 'ниндзя' };

const skinTile = (t) => html`
  <div class="skin-tile card">
    <a class="skin-prev" href="${t.href}" title="${t.title}"><canvas width="16" height="32" data-skin2d="/skins/${t.code}.png" data-slim="${t.variant === 'slim' ? '1' : ''}" aria-label="${t.title}"></canvas>${t.cape ? html`<span class="cape-badge" title="Плащ: ${t.cape}">${icon('flag')}</span>` : ''}</a>
    <div class="skin-meta"><a class="nm" href="${t.href}">${t.title}</a><small>${t.sub}</small></div>
    <a class="btn ghost sm" href="${t.dl}" ${t.dlName ? raw(`download="${t.dlName}"`) : ''} rel="nofollow">${icon('download')}PNG</a>
  </div>`;

/** Каталог скинов NLauncher + скины игроков */
function skinsPage(req, { items, total, page, pages, q, cat, style, counts, styles, found, recent = [] }) {
  const players = cat === 'players';
  const qs = (o) => { const p = new URLSearchParams(); const v = { q, cat, style, page: 1, ...o }; if (v.q) p.set('q', v.q); if (v.cat) p.set('cat', v.cat); if (v.style && v.cat !== 'players') p.set('style', v.style); if (v.page > 1) p.set('page', v.page); const t = p.toString(); return `/skins${t ? `?${t}` : ''}`; };
  const catName = { m: 'для парней', f: 'для девушек', cape: 'с плащом', players: 'игроков' }[cat] || '';
  const h1 = style ? `Скины ${STYLE_SEO[style]} для Майнкрафт` : cat && !players ? `Скины ${catName} для Майнкрафт` : players ? 'Скины игроков NLauncher' : 'Скины для Майнкрафт';
  const filtered = Boolean(q || page > 1);
  const n = (v) => (v ? html` <i>${v}</i>` : '');
  const tiles = items.map((s) => (players
    ? { href: `/skin/${s.nick}`, title: s.nick, sub: `${s.variant === 'slim' ? 'Alex' : 'Steve'} · ${fmt.date(s.updated)}`, code: s.code, variant: s.variant, dl: `/skins/${s.code}.png`, dlName: `${s.nick}.png` }
    : { href: `/skins/s/${s.id}`, title: s.title, sub: [s.gender === 'f' ? 'Девушка' : s.gender === 'm' ? 'Парень' : '', s.style].filter(Boolean).join(' · '), code: s.code, variant: s.variant, cape: s.cape_name, dl: `/skins/s/${s.id}/download` }));
  return layout(req, {
    title: page > 1 ? `${h1} — страница ${page}` : `${h1} — скачать бесплатно${players ? '' : ', 3D-просмотр'}`,
    description: players
      ? `Скины игроков NLauncher: ${fmt.plural(total, 'скин', 'скина', 'скинов')}. 3D-просмотр, PNG и команда для SkinsRestorer.`
      : `${h1}: ${fmt.plural(total, 'скин', 'скина', 'скинов')} в 3D. Скачайте PNG бесплатно или поставьте в один клик в NLauncher — с плащом и без.`,
    canonical: qs({ q: '', page: 1 }), noindex: filtered || total === 0,
    body: html`
    <section class="page-hero list-hero">
      <span class="eyebrow">Скины</span>
      <h1>${h1}</h1>
      <p class="muted">${players
        ? html`Скины, которые игроки NLauncher поставили себе: ${fmt.plural(total, 'скин', 'скина', 'скинов')}.`
        : html`${fmt.plural(counts.all, 'скин', 'скина', 'скинов')} от NLauncher: парни и девушки, рыцари, маги, ниндзя, ${counts.cape} — с плащами. Смотрите в 3D, скачивайте PNG или ставьте в лаунчере в один клик.`}</p>
    </section>
    <form class="skins-bar" method="get" action="/skins">
      <input class="input" name="q" value="${q}" placeholder="${players ? 'Ник игрока' : 'Ник любого игрока или: маг, рыцарь, худи…'}" maxlength="40" autocomplete="off" />
      ${cat ? html`<input type="hidden" name="cat" value="${cat}" />` : ''}${style && !players ? html`<input type="hidden" name="style" value="${style}" />` : ''}
      <button class="btn primary">${icon('search')}Найти</button>
    </form>
    <div class="chips skin-cats">${CATS.map(([v, l]) => html`<a class="chip ${cat === v ? 'active' : ''}" href="${qs({ cat: v, style: v === 'players' ? '' : style, q: '' })}">${l}${n(v === '' ? counts.all : counts[v])}</a>`)}</div>
    ${players ? '' : html`<div class="chips skin-styles">
      <a class="chip ${!style ? 'active' : ''}" href="${qs({ style: '' })}">Любой стиль</a>
      ${styles.map((st) => html`<a class="chip ${style === st ? 'active' : ''}" href="${qs({ style: st })}">${st}</a>`)}
    </div>`}
    ${found ? html`<h2 class="h3 skin-sec">Скин игрока ${found.nick}</h2>
    <div class="skin-grid">${skinTile({ href: `/skin/${found.nick}`, title: found.nick, sub: found.sourceName, code: found.code, variant: found.variant, dl: `/skins/${found.code}.png`, dlName: `${found.nick}.png` })}</div>
    ${items.length ? html`<h2 class="h3 skin-sec">Из каталога</h2>` : ''}` : ''}
    ${q && !found && !items.length && /^[A-Za-z0-9_]{2,16}$/.test(q) ? html`<p class="muted">Игрок «${q}» не найден или у него стандартный скин.</p>` : ''}
    ${recent.length ? html`<h2 class="h3 skin-sec">Недавно искали</h2>
    <div class="skin-grid">${recent.map((l) => skinTile({ href: `/skin/${l.nick}`, title: l.nick, sub: l.source === 'elyby' ? 'Ely.by' : 'Лицензия', code: l.code, variant: l.variant, dl: `/skins/${l.code}.png`, dlName: `${l.nick}.png` }))}</div>
    <h2 class="h3 skin-sec">Каталог NLauncher</h2>` : ''}
    ${items.length ? html`<div class="skin-grid">${tiles.map(skinTile)}</div>
      ${pages > 1 ? html`<nav class="pager">
        ${page > 1 ? html`<a class="btn ghost sm" href="${qs({ page: page - 1 })}">← Назад</a>` : ''}
        <span class="muted">Страница ${page} из ${pages}</span>
        ${page < pages ? html`<a class="btn ghost sm" href="${qs({ page: page + 1 })}">Дальше →</a>` : ''}
      </nav>` : ''}`
    : found ? '' : html`<div class="empty big"><b>${q ? 'Ничего не нашлось' : 'Скинов пока нет'}</b>${q ? html`Попробуйте другой запрос или <a class="link" href="/skins">все скины</a>.` : players ? 'Поставьте скин в NLauncher — он появится здесь.' : ''}</div>`}
    <div class="card pad skins-how">
      <h2 class="h3">Скин любого игрока</h2>
      <p class="muted">Введите ник в поиск — покажем скин этого игрока: с лицензии Minecraft или с Ely.by. Его можно посмотреть в 3D, скачать или поставить себе. Прямая ссылка: <code>${siteUrl()}/skin/ник</code>.</p>
      <h2 class="h3" style="margin-top:14px">Как поставить скин</h2>
      <p class="muted"><b>В NLauncher</b> — вкладка «Скин» → «Каталог»: выберите скин и нажмите «Сохранить». Плащ из каталога увидят игроки NLauncher.<br/>
      <b>На сервере со SkinsRestorer</b> — откройте скин и скопируйте команду <code>/skin url …</code> в чат.<br/>
      <b>Своя картинка</b> — скачайте PNG и загрузите его в лаунчере или на minecraft.net, если у вас лицензия.</p>
    </div>
    <script src="/skin-tiles.js"></script>`,
  });
}

/** Скин игрока из Minecraft (лицензия) или Ely.by */
function playerSkinPage(req, { l, sourceName, url, command }) {
  return layout(req, {
    title: `Скин ${l.nick} Майнкрафт — скачать, 3D`,
    description: `Скин игрока ${l.nick} (${sourceName}): 3D-просмотр, скачать PNG, поставить себе в NLauncher или командой SkinsRestorer.`,
    canonical: `/skin/${l.nick}`, image: url,
    body: html`
    <nav class="crumbs"><a href="/skins">Скины</a> / <span>${l.nick}</span></nav>
    <section class="skin-page">
      <div class="skin-stage card">
        <canvas id="skinCanvas" data-skin="/skins/${l.code}.png" data-slim="${l.variant === 'slim' ? '1' : ''}" data-cape="${l.cape ? `/skins/${l.cape}.png` : ''}"></canvas>
        <div class="skin-ctrl">
          <button class="chip active" data-anim="idle" type="button">Стоит</button>
          <button class="chip" data-anim="walk" type="button">Идёт</button>
          <button class="chip" data-anim="run" type="button">Бежит</button>
          <button class="chip" data-anim="wave" type="button">Машет</button>
          ${l.cape ? html`<button class="chip" data-back type="button">Спина</button>` : ''}
        </div>
      </div>
      <div class="skin-info">
        <span class="eyebrow">Скин игрока · ${sourceName}</span>
        <h1>${l.nick}</h1>
        <p class="muted">Модель: ${l.variant === 'slim' ? 'тонкая (Alex)' : 'классическая (Steve)'}${l.cape ? ' · есть плащ' : ''}</p>
        <div class="card pad skin-cmd">
          <h2 class="h3">Поставить себе</h2>
          <p class="muted small">В NLauncher: вкладка «Скин» → «Каталог» → введите ник <b>${l.nick}</b> → «Сохранить». Или на сервере со SkinsRestorer отправьте в чат:</p>
          <div class="ip-copy" data-copy="${command}" data-copy-msg="Команда скопирована — вставьте её в чат на сервере"><code>${command}</code>${icon('copy')}</div>
        </div>
        <div class="row" style="margin-top:14px">
          <a class="btn primary" href="/skins/${l.code}.png" download="${l.nick}.png" rel="nofollow">${icon('download')}Скачать скин</a>
          <a class="btn ghost" href="/skins">Все скины</a>
        </div>
        <p class="muted small" style="margin-top:12px">Скин принадлежит игроку ${l.nick}. Мы показываем его из открытого API ${sourceName === 'Ely.by' ? 'Ely.by' : 'Minecraft'} и обновляем раз в несколько часов.</p>
      </div>
    </section>
    <script src="/vendor/skinview3d.bundle.js"></script>
    <script src="${'/skin-view.js'}"></script>`,
  });
}

/** Скин из каталога NLauncher */
function catalogSkinPage(req, { it, cape, url, command, similar }) {
  const who = it.gender === 'f' ? 'Девушка' : it.gender === 'm' ? 'Парень' : '';
  return layout(req, {
    title: `Скин «${it.title}» для Майнкрафт — скачать${cape ? ' с плащом' : ''}`,
    description: `Скин «${it.title}» для Minecraft${it.style ? ` (${it.style.toLowerCase()})` : ''}${cape ? `, с плащом «${cape.name}»` : ''}. Модель ${it.variant === 'slim' ? 'Alex' : 'Steve'}. 3D-просмотр, PNG и команда для SkinsRestorer.`,
    canonical: `/skins/s/${it.id}`, image: url,
    jsonld: [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Скины', item: `${siteUrl()}/skins` },
      ...(it.style ? [{ '@type': 'ListItem', position: 2, name: it.style, item: `${siteUrl()}/skins?style=${encodeURIComponent(it.style)}` }] : []),
      { '@type': 'ListItem', position: it.style ? 3 : 2, name: it.title, item: `${siteUrl()}/skins/s/${it.id}` },
    ] }],
    body: html`
    <nav class="crumbs"><a href="/skins">Скины</a>${it.style ? html` / <a href="/skins?style=${encodeURIComponent(it.style)}">${it.style}</a>` : ''} / <span>${it.title}</span></nav>
    <section class="skin-page">
      <div class="skin-stage card">
        <canvas id="skinCanvas" data-skin="${`/skins/${it.code}.png`}" data-slim="${it.variant === 'slim' ? '1' : ''}" data-cape="${cape ? `/capes/${cape.code}.png` : ''}"></canvas>
        <div class="skin-ctrl">
          <button class="chip active" data-anim="idle" type="button">Стоит</button>
          <button class="chip" data-anim="walk" type="button">Идёт</button>
          <button class="chip" data-anim="run" type="button">Бежит</button>
          <button class="chip" data-anim="wave" type="button">Машет</button>
          ${cape ? html`<button class="chip" data-back type="button">Спина</button>` : ''}
        </div>
      </div>
      <div class="skin-info">
        <span class="eyebrow">Скин NLauncher</span>
        <h1>${it.title}</h1>
        <div class="chips" style="margin:8px 0 4px">
          ${who ? html`<a class="chip" href="/skins?cat=${it.gender}">${who}</a>` : ''}
          ${it.style ? html`<a class="chip" href="/skins?style=${encodeURIComponent(it.style)}">${it.style}</a>` : ''}
          <span class="chip">${it.variant === 'slim' ? 'Тонкие руки (Alex)' : 'Широкие руки (Steve)'}</span>
          ${cape ? html`<a class="chip" href="/skins?cat=cape">Плащ «${cape.name}»</a>` : ''}
        </div>
        <div class="card pad skin-cmd">
          <h2 class="h3">Поставить в NLauncher</h2>
          <p class="muted small">Вкладка «Скин» → «Каталог» → этот скин → «Сохранить». ${cape ? 'Плащ наденется вместе со скином — его увидят игроки NLauncher.' : ''}</p>
          <h2 class="h3" style="margin-top:14px">На сервере со SkinsRestorer</h2>
          <div class="ip-copy" data-copy="${command}" data-copy-msg="Команда скопирована — вставьте её в чат на сервере"><code>${command}</code>${icon('copy')}</div>
          ${cape ? html`<p class="muted small">Плащ через SkinsRestorer поставить нельзя — его видят только игроки NLauncher.</p>` : ''}
        </div>
        <div class="row" style="margin-top:14px">
          <a class="btn primary" href="/skins/s/${it.id}/download" rel="nofollow">${icon('download')}Скачать скин</a>
          ${cape ? html`<a class="btn ghost" href="/capes/${cape.code}.png" download="nlauncher-cape-${cape.slug || cape.code}.png" rel="nofollow">${icon('download')}Плащ PNG</a>` : ''}
          <a class="btn ghost" href="/launcher">NLauncher</a>
        </div>
        ${it.downloads ? html`<p class="muted small" style="margin-top:10px">Скачали ${fmt.plural(it.downloads, 'раз', 'раза', 'раз')}</p>` : ''}
      </div>
    </section>
    ${similar.length ? html`<h2 class="h3" style="margin:30px 0 14px">Похожие скины</h2>
    <div class="skin-grid">${similar.map((s) => skinTile({ href: `/skins/s/${s.id}`, title: s.title, sub: [s.gender === 'f' ? 'Девушка' : s.gender === 'm' ? 'Парень' : '', s.style].filter(Boolean).join(' · '), code: s.code, variant: s.variant, cape: s.cape ? 'есть' : '', dl: `/skins/s/${s.id}/download` }))}</div>
    <script src="/skin-tiles.js"></script>` : ''}
    <script src="/vendor/skinview3d.bundle.js"></script>
    <script src="${'/skin-view.js'}"></script>`,
  });
}

function skinPage(req, { nick, s, cape, url, command }) {
  if (!s) {
    return layout(req, {
      title: `Скин ${nick}`, noindex: true,
      body: html`<div class="empty big"><b>У игрока ${nick} нет скина на NLauncher</b>Скин можно загрузить в лаунчере: вкладка «Скин».<br/><br/><a class="btn primary" href="/launcher">${icon('download')}Скачать NLauncher</a></div>`,
    });
  }
  return layout(req, {
    title: `Скин ${s.nick} для Minecraft`, noindex: true, image: url,
    description: `Скин игрока ${s.nick}: 3D-просмотр, PNG и команда для SkinsRestorer.`,
    body: html`
    <section class="skin-page">
      <div class="skin-stage card">
        <canvas id="skinCanvas" data-skin="/skins/${s.code}.png" data-slim="${s.variant === 'slim' ? '1' : ''}" data-cape="${cape ? `/capes/${cape.code}.png` : ''}"></canvas>
        <div class="skin-ctrl">
          <button class="chip active" data-anim="idle" type="button">Стоит</button>
          <button class="chip" data-anim="walk" type="button">Идёт</button>
          <button class="chip" data-anim="run" type="button">Бежит</button>
          <button class="chip" data-anim="wave" type="button">Машет</button>
        </div>
      </div>
      <div class="skin-info">
        <span class="eyebrow">Скин игрока</span>
        <h1>${s.nick}</h1>
        <p class="muted">Модель: ${s.variant === 'slim' ? 'тонкая (Alex)' : 'классическая (Steve)'} · обновлён ${fmt.date(s.updated)}</p>
        <div class="card pad skin-cmd">
          <h2 class="h3">Поставить скин на сервере</h2>
          <p class="muted small">На серверах со SkinsRestorer отправьте в чат команду — скин увидят все игроки сервера:</p>
          <div class="ip-copy" data-copy="${command}" data-copy-msg="Команда скопирована — вставьте её в чат на сервере"><code>${command}</code>${icon('copy')}</div>
          <p class="muted small">Если сервер не разрешает ставить скин по ссылке, игроки NLauncher всё равно увидят этот скин.</p>
        </div>
        <div class="row" style="margin-top:14px">
          <a class="btn ghost" href="${url}" download="${s.nick}.png">${icon('download')}Скачать PNG</a>
          <a class="btn primary" href="/launcher">Сменить скин в NLauncher</a>
        </div>
        <p class="muted small" style="margin-top:14px"><a class="link" href="/skins?cat=players">← Скины игроков</a> · <a class="link" href="/skins">Каталог скинов</a></p>
        ${req.user?.role === 'admin' ? html`<form method="post" action="/admin/skins/${s.nick}/delete" style="margin-top:10px">${csrfField(req)}<button class="btn ghost sm danger" data-confirm="Убрать скин ${s.nick} из галереи? Ник освободится.">Удалить скин (админ)</button></form>` : ''}
      </div>
    </section>
    <script src="/vendor/skinview3d.bundle.js"></script>
    <script src="${'/skin-view.js'}"></script>`,
  });
}

function verifyPage(req, { next, error, wait = 0, sent }) {
  return layout(req, {
    title: 'Подтверждение email', noindex: true,
    body: html`
    <div class="auth card">
      <div class="auth-cover"></div>
      <h1>Подтвердите email</h1>
      <p class="muted">Мы отправили 6-значный код на <b>${req.user.email}</b>. Письма нет — загляните в папку «Спам».</p>
      ${error ? html`<div class="err-box">${error}</div>` : sent ? html`<div class="ok-box">Новый код отправлен</div>` : ''}
      <form method="post" action="/verify">${csrfField(req)}
        <input type="hidden" name="next" value="${next}" />
        <label class="field"><span>Код из письма</span><input class="input code-input" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}" maxlength="7" placeholder="000000" required autofocus /></label>
        <button class="btn primary block">Подтвердить</button>
      </form>
      <form method="post" action="/verify/resend" class="center" style="margin-top:12px">${csrfField(req)}
        <input type="hidden" name="next" value="${next}" />
        <button class="btn ghost sm" id="resendBtn" data-wait="${wait}" ${wait ? 'disabled' : ''}>${wait ? `Отправить ещё раз через ${wait} с` : 'Отправить код ещё раз'}</button>
      </form>
      <p class="muted center small">Не приходит код? Напишите в поддержку — кнопка внизу справа. А пока можно <a class="link" href="/">смотреть сайт</a>: подтверждение нужно, чтобы добавлять сервера и покупать рекламу.</p>
    </div>
    <script>(() => { const b = document.getElementById('resendBtn'); let w = Number(b.dataset.wait) || 0; if (!w) return;
      const t = setInterval(() => { w -= 1; if (w <= 0) { clearInterval(t); b.disabled = false; b.textContent = 'Отправить код ещё раз'; } else b.textContent = 'Отправить ещё раз через ' + w + ' с'; }, 1000); })();</script>`,
  });
}

function forgotPage(req, { mailOn, sent }) {
  return layout(req, {
    title: 'Восстановление пароля', noindex: true,
    body: html`
    <div class="auth card">
      <div class="auth-cover"></div>
      <h1>Восстановление пароля</h1>
      ${sent ? html`<p class="muted">Если аккаунт <b>${sent}</b> существует, мы отправили на него письмо со ссылкой. Она действует 1 час. Письма нет — проверьте папку «Спам».</p>
        <p class="muted center"><a class="link" href="/login">Вернуться ко входу</a></p>`
      : mailOn ? html`<p class="muted">Укажите email аккаунта — пришлём ссылку для нового пароля.</p>
        <form method="post">${csrfField(req)}
          <label class="field"><span>Email</span><input class="input" type="email" name="email" required autofocus /></label>
          <button class="btn primary block">Отправить ссылку</button>
        </form>
        <p class="muted center"><a class="link" href="/login">Вспомнили пароль? Войти</a></p>`
      : html`<p class="muted">Восстановление по почте пока не работает. Напишите в поддержку — кнопка внизу справа: укажите email аккаунта, и мы поможем сменить пароль.</p>
        <p class="muted center"><a class="link" href="/login">Вернуться ко входу</a></p>`}
    </div>`,
  });
}

function resetPage(req, { token, valid, error }) {
  return layout(req, {
    title: 'Новый пароль', noindex: true,
    body: html`
    <div class="auth card">
      <div class="auth-cover"></div>
      <h1>Новый пароль</h1>
      ${valid ? html`
        ${error ? html`<div class="err-box">${error}</div>` : ''}
        <form method="post" action="/reset/${token}">${csrfField(req)}
          <label class="field"><span>Новый пароль</span><input class="input" type="password" name="password" minlength="8" required autofocus /></label>
          <label class="field"><span>Ещё раз</span><input class="input" type="password" name="password2" minlength="8" required /></label>
          <button class="btn primary block">Сохранить и войти</button>
        </form>`
      : html`<p class="muted">Ссылка устарела или уже использована. Запросите новую.</p>
        <p class="muted center"><a class="btn primary" href="/forgot">Запросить ссылку</a></p>`}
    </div>`,
  });
}

const LP_FEATURES = [
  ['users', 'Лицензия и без лицензии', 'Вход через Microsoft или просто по нику. Несколько аккаунтов — переключение в один клик.'],
  ['layers', 'Любые версии', 'От старых классических до самой свежей. Лаунчер сам скачает игру и подходящую Java.'],
  ['puzzle', 'Моды в один клик', 'Каталог Modrinth прямо в лаунчере: поиск и установка без возни с файлами.'],
  ['server', 'Сервера из топа', 'Лучшие сервера мониторинга на главном экране — подключение сразу, без ввода IP.'],
  ['star', 'Скины в 3D', 'Предпросмотр скина и плаща. С лицензией скин ставится в аккаунт, без лицензии — работает на серверах со SkinsRestorer.'],
  ['shield', 'Безопасный вход', 'Пароль от Microsoft вводится на официальной странице Microsoft, лаунчер его не видит.'],
];
const LP_FAQ = [
  ['NLauncher бесплатный?', 'Да, полностью. Платить нужно только за саму игру, если вы хотите играть с лицензией.'],
  ['Можно играть без лицензии?', 'Да. Выберите вход по нику — так можно играть в одиночной игре и на серверах, которые пускают игроков без лицензии.'],
  ['Нужно ли устанавливать Java?', 'Нет. Лаунчер сам скачает подходящую версию Java для выбранной версии Minecraft.'],
  ['Windows пишет «Система Windows защитила ваш компьютер». Что делать?', 'Так Windows реагирует на новые программы, у которых ещё мало скачиваний. Нажмите «Подробнее» → «Выполнить в любом случае».'],
  ['Чем отличается версия «Без установки»?', 'Это один .exe-файл, который запускается без установки, например с флешки. Возможности те же.'],
];

function launcher(req, { downloadUrl, portableUrl, version, size }) {
  return layout(req, {
    title: 'Скачать лаунчер Minecraft бесплатно — с модами, лицензией и без',
    description: 'Скачать NLauncher — бесплатный лаунчер Minecraft для Windows: вход с лицензией и без, любые версии, Fabric, Quilt и Forge, моды из Modrinth в один клик, топ серверов.',
    jsonld: [{
      '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'NLauncher',
      operatingSystem: 'Windows 10, Windows 11', applicationCategory: 'GameApplication',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'RUB' },
      downloadUrl: abs(downloadUrl), ...(version ? { softwareVersion: version } : {}),
      author: { '@type': 'Organization', name: 'NeoDev' }, image: abs('/assets/icon.png'), screenshot: abs('/assets/launcher-home.jpg'),
    }, {
      '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: LP_FAQ.map(([qq, a]) => ({ '@type': 'Question', name: qq, acceptedAnswer: { '@type': 'Answer', text: a } })),
    }],
    body: html`
    <section class="lp-hero">
      <div class="lp-copy">
        <span class="eyebrow">Бесплатно · Windows 10 и 11</span>
        <h1>Лаунчер Minecraft, в котором всё под рукой</h1>
        <p class="lp-lead">Играйте с лицензией или без, на любой версии. Моды и сборки ставятся в один клик, а лучшие сервера уже ждут на главном экране.</p>
        <div class="lp-actions">
          <a class="btn primary lg" href="${downloadUrl}">${icon('download')}Скачать NLauncher</a>
          ${portableUrl ? html`<a class="btn ghost lg" href="${portableUrl}">Без установки</a>` : ''}
        </div>
        <p class="lp-meta">${version ? `Версия ${version} · ` : ''}${size ? `${(size / 1048576).toFixed(0)} МБ · ` : ''}Windows 10/11</p>
      </div>
      <div class="lp-shot">
        <img src="/assets/launcher-home.jpg" width="1920" height="1200" alt="Главный экран NLauncher: выбор сборки, кнопка «Играть» и сервера из мониторинга" fetchpriority="high" />
      </div>
    </section>

    <section class="lp-features">
      ${LP_FEATURES.map(([ic, t, d]) => html`<div class="lp-feat"><span class="lp-ic">${icon(ic)}</span><h2>${t}</h2><p>${d}</p></div>`)}
    </section>

    <section class="lp-split card">
      <div class="lp-split-text">
        <span class="eyebrow">Сборки</span>
        <h2>Своя сборка под каждую игру</h2>
        <p>Отдельная папка, версия и загрузчик модов для каждой сборки: PvP-сборка на Fabric не мешает техно-сборке на Forge. Переключайтесь между ними за секунду.</p>
        <ul class="lp-list">
          <li>${icon('check')}Vanilla, Fabric, Quilt и Forge</li>
          <li>${icon('check')}Моды, ресурспаки и шейдеры из Modrinth</li>
          <li>${icon('check')}Зависимости модов ставятся сами</li>
        </ul>
      </div>
      <img src="/assets/launcher-instances.jpg" width="1356" height="435" alt="Список сборок в NLauncher" loading="lazy" />
    </section>

    <section class="lp-steps">
      <h2 class="sec">Как начать</h2>
      <ol>
        <li><b>Скачайте и установите</b><span>Обычный установщик, пара кликов. Java не нужна — лаунчер скачает её сам.</span></li>
        <li><b>Войдите</b><span>Через аккаунт Microsoft, если у вас лицензия, или просто введите ник.</span></li>
        <li><b>Играйте</b><span>Выберите версию или сервер из топа и нажмите «Играть».</span></li>
      </ol>
    </section>

    <section class="lp-faq card pad">
      <h2 class="h3">Частые вопросы</h2>
      ${LP_FAQ.map(([qq, a]) => html`<details class="qa"><summary>${qq}</summary><p>${a}</p></details>`)}
    </section>

    <section class="lp-final">
      <h2>Готовы играть?</h2>
      <p class="muted">NLauncher бесплатный${size ? ` и весит всего ${(size / 1048576).toFixed(0)} МБ` : ''}.</p>
      <a class="btn primary lg" href="${downloadUrl}">${icon('download')}Скачать для Windows</a>
    </section>`,
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

const serverRows = (list) => html`${list.map(serverRow)}`;

/** Подборка: по тегу, по версии или «новые сервера» */
function listPage(req, { tag, version, fresh, servers, total, related, byTag = {} }) {
  const h1 = tag ? `Сервера Майнкрафт: ${tag.name}` : version ? `Сервера Майнкрафт ${version}` : 'Новые сервера Майнкрафт';
  const lead = tag
    ? `${fmt.plural(total, 'сервер', 'сервера', 'серверов')} с тегом «${tag.name}» — с IP-адресами, онлайном в реальном времени и голосованием. Сначала продвигаемые, затем по голосам игроков.`
    : version
      ? `${fmt.plural(total, 'сервер', 'сервера', 'серверов')}, на которые можно зайти с Minecraft ${version}${version.split('.').length === 2 ? ` (любая ${version}.x)` : ''}. IP-адреса, онлайн и рейтинг.`
      : `Сервера, добавленные в мониторинг за последние 30 дней: ${fmt.plural(total, 'сервер', 'сервера', 'серверов')}. Свежие проекты часто дают стартовые бонусы.`;
  const path = tag ? `/servera-${tag.slug}/` : version ? `/servera-${version}/` : '/new';
  const base = siteUrl();
  return layout(req, {
    title: tag ? `Сервера Майнкрафт ${tag.name.toLowerCase()} — IP, онлайн, топ ${new Date().getFullYear()}` : version ? `Сервера Майнкрафт ${version} — IP-адреса, онлайн и топ` : 'Новые сервера Майнкрафт — свежие проекты с IP',
    description: lead.slice(0, 250),
    canonical: path,
    noindex: total === 0, // пустые подборки не индексируем
    jsonld: [
      { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Топ серверов', item: `${base}/` },
        { '@type': 'ListItem', position: 2, name: 'Подборки', item: `${base}/servera/` },
        { '@type': 'ListItem', position: 3, name: h1, item: base + path },
      ] },
      servers.length && { '@context': 'https://schema.org', '@type': 'ItemList', name: h1, itemListElement: servers.slice(0, 30).map((s, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(serverPath(s)), name: s.name })) },
    ],
    body: html`
    <nav class="crumbs"><a href="/">Топ серверов</a> / <a href="/servera/">Подборки</a> / <span>${tag ? tag.name : version || 'Новые'}</span></nav>
    <section class="page-hero list-hero">
      <span class="eyebrow">${tag ? tag.group : version ? 'Версия игры' : 'Новинки'}</span>
      <h1>${h1}</h1>
      <p class="muted">${lead}</p>
    </section>
    ${related.length ? html`<div class="chips related">${related.map((r) => (typeof r === 'string'
      ? html`<a class="chip" href="/servera-${r}/">${r}</a>`
      : html`<a class="chip" href="/servera-${r.slug}/">${r.name} <i>${byTag[r.name] || ''}</i></a>`))}<a class="chip more" href="/servera/">Все подборки →</a></div>` : ''}
    <div class="slist">${servers.length ? serverRows(servers) : html`<div class="empty"><b>Пока нет серверов</b>Станьте первым — <a class="link" href="/cabinet/servers/new">добавьте свой сервер</a>.</div>`}</div>`,
  });
}

/** Каталог всех подборок */
function catalog(req, { total, byTag, byVer }) {
  return layout(req, {
    title: 'Подборки серверов Майнкрафт — по режимам, мини-играм и версиям',
    description: `Все подборки серверов Minecraft: выживание, анархия, бед варс, скайблок, с модами и без, по версиям от 1.7.10 до 26.x. Всего ${total} серверов в мониторинге.`,
    canonical: '/servera/',
    body: html`
    <section class="page-hero list-hero">
      <span class="eyebrow">Каталог</span>
      <h1>Подборки серверов</h1>
      <p class="muted">Выберите режим, мини-игру или версию — покажем подходящие сервера с IP и онлайном.</p>
    </section>
    <div class="cat-grid">
      ${GROUPS.map(([g, names]) => html`<div class="card pad cat"><h2 class="h3">${g}</h2><div class="chips">${names.map((n) => { const t = BY_NAME.get(n.toLowerCase()); return html`<a class="chip ${byTag[n] ? '' : 'dim'}" href="/servera-${t.slug}/">${n} <i>${byTag[n] || 0}</i></a>`; })}</div></div>`)}
      <div class="card pad cat wide"><h2 class="h3">Версии</h2><div class="chips">${VERSIONS.map((v) => html`<a class="chip ${byVer[v] ? '' : 'dim'}" href="/servera-${v}/">${v} <i>${byVer[v] || 0}</i></a>`)}</div></div>
    </div>`,
  });
}

function favorites(req) {
  return layout(req, {
    title: 'Избранные сервера', noindex: true,
    body: html`
    <div class="page-head"><div><span class="eyebrow">Избранное</span><h1>Ваши сервера</h1><p class="muted">Хранятся в этом браузере — регистрация не нужна.</p></div></div>
    <div class="slist" id="favList"><div class="skeleton-row"></div></div>`,
  });
}

function votifierPage(req, { service }) {
  return layout(req, {
    title: 'Votifier: награды игрокам за голосование',
    description: 'Как настроить Votifier (VotifierPlus, NuVotifier) и VotingPlugin, чтобы игроки получали награду за голос за ваш сервер в нашем мониторинге.',
    body: html`
    <section class="page-hero"><span class="eyebrow">Для владельцев серверов</span><h1>Награды за голоса через Votifier</h1>
      <p class="muted">Игрок голосует за сервер на сайте → мы сразу сообщаем вашему серверу → плагин выдаёт награду в игре.</p></section>
    <div class="card pad prose-card">
      <h2 class="h3">1. Плагины</h2>
      <p>Нужны два плагина: приёмник голосов — <b>NuVotifier</b> (или VotifierPlus) и выдача наград — <b>VotingPlugin</b>. Скопируйте .jar в папку <code>plugins/</code> и перезапустите сервер.</p>
      <h2 class="h3">2. Порт</h2>
      <p>Votifier слушает отдельный порт (по умолчанию <code>8192</code>) — откройте его в фаерволе. Это не игровой порт 25565.</p>
      <h2 class="h3">3. Ключ или токен</h2>
      <p><b>NuVotifier (v2, рекомендуем):</b> откройте <code>plugins/Votifier/config.yml</code> и скопируйте значение <code>tokens → default</code>.<br/>
      <b>Votifier v1 / VotifierPlus:</b> скопируйте всё содержимое файла <code>plugins/…/rsa/public.key</code>.</p>
      <h2 class="h3">4. Настройка в кабинете</h2>
      <p>Кабинет → ваш сервер → «Награды за голосование»: укажите <b>IP</b> (именно IP, не домен), порт и ключ или токен. Нажмите «Сохранить и проверить Votifier» — в консоли сервера появится тестовый голос.</p>
      <h2 class="h3">5. Награды в VotingPlugin</h2>
      <p>Название нашего сервиса для настроек плагина: <code>${service}</code>. Пример наград:</p>
      <pre class="code">VoteSites:
  Monitoring:
    ServiceSite: '${service}'
    VoteURL: '${siteUrl()}/vote/ВАШ_ID'
    Enabled: true
    Rewards:
      Commands:
        - 'eco give %player% 500'
        - 'give %player% diamond 1'</pre>
      <p class="muted small">Ссылка для голосования вашего сервера: <code>${siteUrl()}/vote/ID</code> — ID виден в адресе страницы сервера. Её же можно поставить на кнопку в игре или на сайте (см. «Виджеты» в кабинете).</p>
    </div>`,
  });
}

function message(req, title, text, status = 200) {
  return layout(req, { title, noindex: true, body: html`<div class="empty big"><b>${title}</b>${text}<br/><br/><a class="btn ghost" href="/">На главную</a></div>` });
}

module.exports = { skinsPage, playerSkinPage, catalogSkinPage, skinPage, verifyPage, forgotPage, resetPage, home, server, ads, authForm, launcher, statsPage, listPage, catalog, favorites, votifierPage, serverRows, message, favicon, statusDot, chart };
