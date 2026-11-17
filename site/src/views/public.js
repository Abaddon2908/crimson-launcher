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
    description: 'Продвижение Minecraft-сервера: PROMO в топе, баннер в NLauncher, выделение и сервер в списке «Сетевая игра» у игроков лаунчера. Оплата картой, ЮMoney или криптовалютой.',
    body: html`
    <section class="page-hero">
      <span class="eyebrow">Продвижение</span>
      <h1>Реклама в мониторинге и NLauncher</h1>
      <p class="muted">Ваш сервер увидят игроки на сайте и прямо в лаунчере — на главном экране, перед нажатием «Играть».</p>
      <div class="hero-stats"><div><b>${fmt.num(stats.servers)}</b><small>серверов в топе</small></div><div><b>${fmt.num(stats.players)}</b><small>игроков онлайн сейчас</small></div></div>
    </section>
    <div class="plans">
      <div class="plan card best points-plan">
        <span class="plan-ic">${icon('chart')}</span>
        <h3>Промо-баллы</h3>
        <p class="muted">Поднимают сервер в общем топе: чем больше активных баллов, тем выше. Любое количество на срок от 7 дней до полугода, покупки складываются.</p>
        <div class="price">от ${fmt.rub(pointPrice() * 5)}<small> / 5 баллов на 7 дней</small></div>
        <small class="slots">Пакеты: 200 — −5%, 500 — −10%, 1000 — −15%</small>
        <a class="btn primary block" href="/cabinet/buy?product=points">Рассчитать и купить</a>
      </div>
      ${products.filter((p) => p.kind !== 'points').map((p) => html`
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
        <li>Выберите услугу в кабинете и оплатите картой (ЮMoney) или криптовалютой (Heleket). Есть купоны на скидку.</li>
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
    description: 'Как настроить Votifier (VotifierPlus, NuVotifier) и VotingPlugin, чтобы игроки получали награду за голос за ваш сервер в мониторинге NeoDev.',
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
  NeoDev:
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

module.exports = { home, server, ads, authForm, launcher, statsPage, listPage, catalog, favorites, votifierPage, serverRows, message, favicon, statusDot, chart };
