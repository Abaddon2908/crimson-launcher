const { html, raw, fmt } = require('./html');
const { serverPath } = require('../seo');
const { layout, icon, csrfField } = require('./layout');
const { favicon, statusDot } = require('./public');
const { KINDS, settings } = require('../db');
const { GROUPS, VERSIONS } = require('../tags');

const STATUS = { pending: ['На модерации', 'warn'], approved: ['Опубликован', 'ok'], rejected: ['Отклонён', 'bad'] };
const ORDER = { pending: ['Ожидает оплаты', 'warn'], paid: ['Оплачен', 'ok'], cancelled: ['Отменён', 'bad'] };
const PROVIDER = { yoomoney: 'ЮMoney', heleket: 'Heleket (крипто)', manual: 'Вручную' };

function tabs(req, active) {
  const t = (href, label, ic) => html`<a class="${active === href ? 'active' : ''}" href="${href}">${icon(ic)}${label}</a>`;
  return html`<nav class="tabs">${t('/cabinet', 'Мои сервера', 'server')}${t('/cabinet/orders', 'Заказы', 'card')}${t('/cabinet/buy', 'Купить рекламу', 'bolt')}</nav>`;
}

function shell(req, active, title, body, flash) {
  return layout(req, {
    title, flash,
    body: html`<div class="page-head"><div><span class="eyebrow">Кабинет</span><h1>${title}</h1></div>${active === '/cabinet' ? html`<a class="btn primary" href="/cabinet/servers/new">${icon('plus')}Добавить сервер</a>` : ''}</div>${tabs(req, active)}${body}`,
  });
}

function servers(req, { list, flash }) {
  return shell(req, '/cabinet', 'Мои сервера', html`
    <div class="cards">
      ${list.length ? list.map((s) => html`
      <div class="card own">
        ${favicon(s)}
        <div class="own-main">
          <b><a href="${serverPath(s)}">${s.name}</a></b>
          <small class="muted">${s.address}</small>
          <div class="row">
            <span class="badge ${STATUS[s.status][1]}">${STATUS[s.status][0]}</span>
            <span class="muted small">${statusDot(s)} ${s.online ? `${s.players}/${s.max_players}` : 'офлайн'}</span>
            <span class="muted small">${icon('star')} ${s.votes} за месяц</span>
            ${Object.entries(s.services || {}).map(([k, ends]) => html`<span class="badge ${k === 'promo' || k === 'ingame' ? 'gold' : 'red'}">${KINDS[k]?.short || k} до ${fmt.date(ends)}</span>`)}
          </div>
          ${s.status === 'rejected' && s.reject_reason ? html`<div class="err-box small">Причина: ${s.reject_reason}</div>` : ''}
        </div>
        <div class="row">
          <a class="btn ghost sm" href="/cabinet/servers/${s.id}">${icon('edit')}Изменить</a>
          ${s.status === 'approved' ? html`<a class="btn ghost sm" href="/cabinet/servers/${s.id}/stats">${icon('chart')}Статистика</a><a class="btn ghost sm" href="/cabinet/servers/${s.id}/widgets">${icon('tag')}Виджеты</a>` : ''}
          ${s.status === 'approved' ? html`<a class="btn primary sm" href="/cabinet/buy?server=${s.id}">${icon('bolt')}Продвинуть</a>` : ''}
        </div>
      </div>`) : html`<div class="empty"><b>У вас пока нет серверов</b>Добавьте сервер — после проверки модератором он появится в топе.<br/><br/><a class="btn primary" href="/cabinet/servers/new">${icon('plus')}Добавить сервер</a></div>`}
    </div>`, flash);
}

/** Имя сервиса для Votifier/VotingPlugin — домен сайта */
const voteService = () => { try { return new URL(settings.get('site_url')).hostname; } catch { return 'nlauncher.ru'; } };

function serverForm(req, { s = {}, error, isNew, site, flash }) {
  const v = (k) => s[k] ?? '';
  const tagList = String(s.tags || '').split(',').map((x) => x.trim()).filter(Boolean);
  return shell(req, '/cabinet', isNew ? 'Новый сервер' : `Сервер «${s.name}»`, html`
    ${error ? html`<div class="err-box">${error}</div>` : ''}
    <form method="post" class="card pad form-grid">${csrfField(req)}
      <label class="field"><span>Название</span><input class="input" name="name" value="${v('name')}" required maxlength="40" /></label>
      <label class="field"><span>IP-адрес (с портом, если не 25565)</span><input class="input" name="address" value="${v('address')}" required placeholder="play.example.ru" pattern="[A-Za-z0-9._-]+(:[0-9]{1,5})?" /></label>
      <div class="field"><span>Версии: от</span>
        <select class="select" name="version_min"><option value="">— выберите —</option>${VERSIONS.slice().reverse().map((x) => html`<option value="${x}" ${s.version_min === x ? 'selected' : ''}>${x}</option>`)}</select></div>
      <div class="field"><span>до</span>
        <select class="select" name="version_max"><option value="">та же</option>${VERSIONS.map((x) => html`<option value="${x}" ${s.version_max === x ? 'selected' : ''}>${x}</option>`)}</select></div>
      <div class="field full"><span>Теги — режимы, мини-игры, возможности (до 12). По ним сервер попадает в подборки: «Сервера с выживанием», «Бед Варс»…</span>
        <div class="tag-picker">${GROUPS.map(([g, names]) => html`<div class="tag-group"><b>${g}</b><div class="tag-list">${names.map((n) => html`<label class="tag-opt"><input type="checkbox" name="tags" value="${n}" ${tagList.includes(n) ? 'checked' : ''} /><span>${n}</span></label>`)}</div></div>`)}</div>
        <small class="muted" id="tagCount"></small>
      </div>
      <label class="field full"><span>Описание</span><textarea class="input" name="description" rows="6" maxlength="3000">${v('description')}</textarea></label>
      <label class="field"><span>Сайт</span><input class="input" name="website" value="${v('website')}" placeholder="https://" /></label>
      <label class="field"><span>Discord</span><input class="input" name="discord" value="${v('discord')}" placeholder="https://discord.gg/…" /></label>
      <label class="field full"><span>Обложка (ссылка на картинку 1200×400)</span><input class="input" name="banner" value="${v('banner')}" placeholder="https://…/banner.jpg" /></label>
      <details class="full adv" ${s.votifier_host || s.votifier_key || s.votifier_token ? 'open' : ''}>
        <summary>Награды за голосование (Votifier)</summary>
        <p class="muted small">Когда игрок голосует, сайт сообщает об этом вашему серверу через Votifier, и плагин (например, VotingPlugin) выдаёт награду. Подходит VotifierPlus, Votifier и NuVotifier. Название сервиса в настройках плагина: <code>${voteService()}</code>. <a class="link" href="/votifier" target="_blank">Инструкция</a></p>
        <div class="form-grid inner">
          <label class="field"><span>IP для Votifier (лучше IP, а не домен)</span><input class="input" name="votifier_host" value="${v('votifier_host')}" placeholder="123.45.67.89" /></label>
          <label class="field"><span>Порт Votifier</span><input class="input" type="number" name="votifier_port" value="${s.votifier_port || 8192}" min="1" max="65535" /></label>
          <label class="field full"><span>Публичный ключ (v1) — содержимое rsa/public.key</span><textarea class="input mono" name="votifier_key" rows="3" placeholder="MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA…">${v('votifier_key')}</textarea></label>
          <label class="field full"><span>или токен NuVotifier (v2) — config.yml → tokens.default</span><input class="input mono" name="votifier_token" value="${v('votifier_token')}" placeholder="abcd1234efgh5678…" autocomplete="off" /></label>
        </div>
        ${!isNew ? html`<div class="row votifier-test">
          <input class="input" name="test_nick" placeholder="Ник для проверки" maxlength="16" style="max-width:220px" />
          <button class="btn ghost" name="_action" value="votifier_test" formnovalidate>Сохранить и проверить Votifier</button>
        </div>` : ''}
        <details class="adv inner">
          <summary>Для разработчиков: HTTP-вебхук вместо Votifier</summary>
          <label class="field"><span>Webhook URL</span><input class="input" name="vote_webhook" value="${v('vote_webhook')}" placeholder="https://your-server.ru/vote" /></label>
          ${!isNew ? html`<div class="field"><span>Секрет для подписи</span><code class="secret">${v('vote_secret')}</code></div>
          <pre class="code">POST ${v('vote_webhook') || 'https://your-server.ru/vote'}
{ "server_id": ${s.id}, "nickname": "Steve", "timestamp": 1731500000000,
  "signature": hex(HMAC_SHA256(secret, nickname + ":" + timestamp)) }</pre>` : ''}
        </details>
      </details>
      <div class="full row end">
        ${!isNew ? html`<button class="btn ghost danger" name="_action" value="delete" formnovalidate data-confirm="Удалить сервер из мониторинга?">${icon('trash')}Удалить</button>` : ''}
        <button class="btn primary">${isNew ? 'Отправить на модерацию' : 'Сохранить'}</button>
      </div>
      ${!isNew ? html`<p class="muted small full">Изменение адреса отправит сервер на повторную модерацию.</p>` : ''}
    </form>`, flash);
}

/** Виджеты и кнопки для сайта сервера: превью + готовый код */
function widgets(req, { s, base, page }) {
  const voteUrl = `${base}/vote/${s.id}`;
  const pageUrl = base + page;
  const block = (title, hint, preview, code) => html`
    <div class="card pad widget">
      <h3>${title}</h3>${hint ? html`<p class="muted small">${hint}</p>` : ''}
      <div class="w-preview">${preview}</div>
      <div class="w-code"><textarea class="input mono" readonly rows="${Math.min(5, code.split('\n').length + 1)}">${code}</textarea><button type="button" class="btn ghost sm" data-copy-code>${icon('copy')}Скопировать</button></div>
    </div>`;
  const live = (theme, extra = '') => `<a href="${voteUrl}" class="nd-vote" data-nd-server="${s.id}"${theme === 'light' ? ' data-nd-theme="light"' : ''}${extra}>Голосовать за сервер</a>\n<script async src="${base}/widgets/vote.js"></script>`;
  const img = (file, href, alt, w, h) => `<a href="${href}" target="_blank" rel="noopener"><img src="${base}/widgets/${file}" width="${w}" height="${h}" alt="${alt}" /></a>`;
  return shell(req, '/cabinet', `Виджеты «${s.name}»`, html`
    <p class="muted" style="margin-bottom:16px">Поставьте кнопки на сайт сервера, в группу ВК или в описание — игроки чаще голосуют, а сервер поднимается в топе.</p>
    <div class="widgets">
      ${block('Кнопка голосования со счётчиком', 'Живая: число голосов за месяц подтягивается с сайта. Есть тёмная и светлая.',
        html`${raw(live('dark'))} ${raw(live('light'))} ${raw(live('dark', ' data-nd-size="sm"'))}`,
        live('dark'))}
      ${block('Виджет онлайна', 'Картинка с названием, онлайном и голосами — обновляется каждые 5 минут. Для светлого сайта добавьте ?theme=light.',
        html`<img src="/widget/server/${s.id}.svg" width="320" height="84" alt="" /> <img src="/widget/server/${s.id}.svg?theme=light" width="320" height="84" alt="" />`,
        `<a href="${pageUrl}" target="_blank" rel="noopener"><img src="${base}/widget/server/${s.id}.svg" width="320" height="84" alt="${s.name} — онлайн сервера" /></a>`)}
      ${block('Кнопка «Голосовать»', '', html`<img src="/widgets/vote-88x31.png" width="88" height="31" alt="" /> <img src="/widgets/vote-180x44.png" width="180" height="44" alt="" />`,
        img('vote-180x44.png', voteUrl, `Голосовать за сервер ${s.name}`, 180, 44))}
      ${block('Кнопка «Мы на NeoDev»', '', html`<img src="/widgets/on-88x31.png" width="88" height="31" alt="" /> <img src="/widgets/on-180x44.png" width="180" height="44" alt="" />`,
        img('on-88x31.png', pageUrl, `Сервер ${s.name} в мониторинге NeoDev`, 88, 31))}
      ${block('Кнопка «Проверено»', '', html`<img src="/widgets/checked-88x31.png" width="88" height="31" alt="" /> <img src="/widgets/checked-180x44.png" width="180" height="44" alt="" />`,
        img('checked-88x31.png', pageUrl, `Сервер ${s.name} проверен мониторингом NeoDev`, 88, 31))}
      ${block('Ссылка для голосования', 'Её же используйте в VotingPlugin (VoteURL) и в сообщениях в игре.', html`<code>${voteUrl}</code>`, voteUrl)}
    </div>
    <script async src="/widgets/vote.js"></script>`);
}

/** Статистика сервера для владельца: просмотры, копирования IP, голоса по дням + дни с рекламой */
function svgDaily(hist) {
  const W = 760, H = 200, P = 26, B = 22;
  const max = Math.max(4, ...hist.map((d) => Math.max(d.views, d.copies)));
  const step = (W - P * 2) / hist.length;
  const y = (v) => H - B - (v / max) * (H - B - 18);
  const line = (key) => hist.map((d, i) => `${i ? 'L' : 'M'}${(P + i * step + step / 2).toFixed(1)},${y(d[key]).toFixed(1)}`).join('');
  const ads = hist.map((d, i) => (d.ads.length ? `<rect x="${(P + i * step).toFixed(1)}" y="8" width="${step.toFixed(1)}" height="${H - B - 8}" fill="rgba(214,167,100,.10)"/>` : '')).join('');
  const votes = hist.map((d, i) => (d.votes ? `<rect x="${(P + i * step + step * 0.2).toFixed(1)}" y="${H - B - Math.min(40, 6 + d.votes * 3)}" width="${(step * 0.6).toFixed(1)}" height="${Math.min(40, 6 + d.votes * 3)}" rx="2" fill="rgba(196,116,124,.35)"><title>${d.day}: ${d.votes} голосов</title></rect>` : '')).join('');
  const tips = hist.map((d, i) => `<rect x="${(P + i * step).toFixed(1)}" y="0" width="${step.toFixed(1)}" height="${H}" fill="transparent"><title>${d.day.slice(8)}.${d.day.slice(5, 7)}: просмотров ${d.views}, копий IP ${d.copies}, голосов ${d.votes}${d.ads.length ? `, реклама: ${d.ads.map((k) => KINDS[k]?.short || k).join(', ')}` : ''}</title></rect>`).join('');
  const lbl = (i) => `<text x="${(P + i * step + step / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" class="chart-max">${hist[i].day.slice(8)}.${hist[i].day.slice(5, 7)}</text>`;
  return raw(`<svg class="chart tall" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${ads}${votes}
    <path d="${line('views')}" fill="none" stroke="#c4747c" stroke-width="2.2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
    <path d="${line('copies')}" fill="none" stroke="#6fbf8e" stroke-width="2.2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
    <text x="${W - P}" y="14" text-anchor="end" class="chart-max">макс. ${max}</text>${lbl(0)}${lbl(Math.floor(hist.length / 2))}${lbl(hist.length - 1)}${tips}</svg>`);
}
function serverStats(req, { s, hist, totals }) {
  const sum = (k, from = 0) => hist.slice(from).reduce((a, d) => a + d[k], 0);
  const withAds = hist.filter((d) => d.ads.length), noAds = hist.filter((d) => !d.ads.length);
  const avg = (list, k) => (list.length ? list.reduce((a, d) => a + d[k], 0) / list.length : 0);
  const lift = withAds.length && noAds.length && avg(noAds, 'views') > 0 ? Math.round(((avg(withAds, 'views') / avg(noAds, 'views')) - 1) * 100) : null;
  return shell(req, '/cabinet', `Статистика «${s.name}»`, html`
    <div class="stats four">
      <div class="stat card"><small>Просмотров страницы за 30 дней</small><b>${fmt.num(sum('views'))}</b><small class="muted">сегодня ${fmt.num(totals.todayViews)}</small></div>
      <div class="stat card"><small>Копирований IP за 30 дней</small><b>${fmt.num(sum('copies'))}</b><small class="muted">сегодня ${fmt.num(totals.todayCopies)}</small></div>
      <div class="stat card"><small>Голосов за 30 дней</small><b>${fmt.num(sum('votes'))}</b><small class="muted">за 7 дней ${fmt.num(sum('votes', 23))}</small></div>
      <div class="stat card"><small>Эффект рекламы</small><b>${lift == null ? '—' : `${lift > 0 ? '+' : ''}${lift}%`}</b><small class="muted">${lift == null ? 'появится после первой рекламы' : 'просмотров в дни с рекламой'}</small></div>
    </div>
    <div class="card pad" style="margin-top:18px">
      <div class="card-head"><h3>По дням</h3><div class="legend"><span class="l1">просмотры</span><span class="l2">копирования IP</span><span class="l3">голоса</span><span class="l4">дни с рекламой</span></div></div>
      ${svgDaily(hist)}
    </div>
    <div class="card table-wrap" style="margin-top:18px"><table class="table compact">
      <thead><tr><th>День</th><th>Просмотры</th><th>Копирования IP</th><th>Голоса</th><th>Реклама</th></tr></thead>
      <tbody>${hist.slice().reverse().slice(0, 14).map((d) => html`<tr><td class="nowrap">${d.day.slice(8)}.${d.day.slice(5, 7)}</td><td>${d.views}</td><td>${d.copies}</td><td>${d.votes}</td><td>${d.ads.map((k) => html`<span class="badge gold">${KINDS[k]?.short || k}</span>`)}</td></tr>`)}</tbody>
    </table></div>
    <p class="muted small" style="margin-top:12px">Просмотры и копирования считаются по уникальным посетителям за день, без ботов поисковиков. Ваши собственные заходы не учитываются.</p>
    <div class="row" style="margin-top:14px"><a class="btn primary" href="/cabinet/buy?server=${s.id}">${icon('bolt')}Продвинуть сервер</a><a class="btn ghost" href="/cabinet/servers/${s.id}/widgets">Виджеты для сайта</a></div>`);
}

function orders(req, { list, flash }) {
  return shell(req, '/cabinet/orders', 'Заказы', html`
    <div class="card table-wrap">
      ${list.length ? html`<table class="table">
        <thead><tr><th>#</th><th>Услуга</th><th>Сервер</th><th>Сумма</th><th>Статус</th><th>Период</th><th></th></tr></thead>
        <tbody>${list.map((o) => html`<tr>
          <td class="muted">${o.id}</td><td>${o.title}</td><td>${o.server_name || '—'}</td><td>${fmt.rub(o.amount)}</td>
          <td><span class="badge ${ORDER[o.status][1]}">${ORDER[o.status][0]}</span></td>
          <td class="muted small">${o.status === 'paid' ? `${fmt.date(o.starts)} — ${fmt.date(o.ends)}` : fmt.datetime(o.created)}</td>
          <td class="right">${o.status === 'pending' ? html`<a class="btn primary sm" href="/cabinet/pay/${o.id}">Оплатить</a>` : ''}</td>
        </tr>`)}</tbody></table>` : html`<div class="empty"><b>Заказов пока нет</b><a class="link" href="/ads">Посмотреть тарифы</a></div>`}
    </div>`, flash);
}

function buy(req, { servers, products, sel, error, methods, pricing, values = {} }) {
  const isPoints = sel.product === 'points';
  const p = isPoints ? null : products.find((x) => x.id === sel.product) || null;
  const firstKind = isPoints ? 'points' : p ? p.kind : 'points';
  const pts = values.points || 200;
  const days = values.days || 30;
  const q = pricing.pointsQuote(pts, days);
  return shell(req, '/cabinet/buy', 'Продвижение сервера', html`
    ${error ? html`<div class="err-box">${error}</div>` : ''}
    ${!servers.length ? html`<div class="empty"><b>Сначала добавьте сервер</b>Продвигать можно только опубликованные сервера.<br/><br/><a class="btn primary" href="/cabinet/servers/new">${icon('plus')}Добавить сервер</a></div>` : html`
    <form method="post" class="buy-grid" id="buyForm" data-point-price="${pricing.pointPrice()}" data-durations="${JSON.stringify(pricing.DURATIONS.map((d) => [d.days, d.k]))}" data-packs="${JSON.stringify(pricing.PACKS.map((x) => [x.min, x.pct]))}">${csrfField(req)}
      <div class="card pad">
        <label class="field"><span>Сервер</span>
          <select class="select" name="server_id">${servers.map((s) => html`<option value="${s.id}" ${s.id === sel.server ? 'selected' : ''}>${s.name} — ${s.address}</option>`)}</select>
        </label>
        <div class="field"><span>Услуга</span>
          <div class="plan-pick">
            <label class="pick"><input type="radio" name="product_id" value="points" data-kind="points" ${firstKind === 'points' ? 'checked' : ''} />
              <span><b>Промо-баллы — подъём в топе</b><small>Любое количество на выбранный срок. Чем больше баллов, тем выше сервер среди обычных (после PROMO-мест).</small></span></label>
            ${products.filter((x) => x.kind !== 'points').map((x) => html`
            <label class="pick"><input type="radio" name="product_id" value="${x.id}" ${p && x.id === p.id ? 'checked' : ''} data-kind="${x.kind}" data-price="${x.price}" />
              <span><b>${x.title}</b><small>${fmt.rub(x.price)}${x.slots && x.free <= 0 ? ` · старт ${fmt.date(x.nextStart)}` : ''}</small></span></label>`)}
          </div>
        </div>
        <div class="points-fields" ${firstKind === 'points' ? '' : 'hidden'}>
          <div class="field"><span>Количество промо-баллов (шаг 5)</span>
            <div class="row">${[50, 200, 500, 1000].map((n) => html`<button type="button" class="chip" data-points-set="${n}">${n}${pricing.packPct(n) ? html` <i>−${pricing.packPct(n)}%</i>` : ''}</button>`)}</div>
            <input class="input" type="number" name="points" min="5" max="10000" step="5" value="${pts}" style="margin-top:8px" />
          </div>
          <label class="field"><span>Срок действия</span>
            <select class="select" name="days">${pricing.DURATIONS.map((d) => html`<option value="${d.days}" ${d.days === Number(days) ? 'selected' : ''}>${d.label}${d.k < d.days / 7 ? ` (выгоднее на ${Math.round((1 - d.k / (d.days / 7)) * 100)}%)` : ''}</option>`)}</select>
          </label>
          <p class="muted small">Сервера с баллами стоят выше обычных, порядок — по сумме активных баллов. Покупки складываются: каждая действует свой срок. Пакеты от 200 баллов — скидка 5%, от 500 — 10%, от 1000 — 15%.</p>
        </div>
        <div class="color-fields" ${firstKind === 'highlight' ? '' : 'hidden'}>
          <div class="field"><span>Цвет выделения</span>
            <div class="color-pick">${Object.entries(pricing.COLORS).map(([k, label], i) => html`<label class="cp"><input type="radio" name="color" value="${k}" ${(values.color || 'green') === k || (!values.color && i === 0) ? 'checked' : ''} /><span class="sw hl-${k}"></span>${label}</label>`)}</div>
          </div>
        </div>
        <div class="banner-fields" ${firstKind === 'banner' ? '' : 'hidden'}>
          <label class="field"><span>Заголовок баннера</span><input class="input" name="banner_title" maxlength="60" placeholder="MegaCraft — новый сезон!" /></label>
          <label class="field"><span>Текст</span><input class="input" name="banner_text" maxlength="140" placeholder="Вайп, новые данжи и ивенты каждые выходные" /></label>
          <label class="field"><span>Картинка (ссылка, 900×500)</span><input class="input" name="banner_image" placeholder="https://…" /></label>
          <label class="field"><span>Ссылка по клику (необязательно)</span><input class="input" name="banner_url" placeholder="https://… или пусто — страница сервера" /></label>
        </div>
      </div>
      <div class="card pad pay-box">
        <h3>Оплата</h3>
        <label class="field"><span>Купон (если есть)</span><input class="input" name="coupon" value="${values.coupon || ''}" placeholder="NEODEV10" autocomplete="off" style="text-transform:uppercase" /></label>
        <div class="price-lines" id="priceLines"></div>
        <div class="total"><span class="muted">К оплате</span><b id="total">${fmt.rub(q ? q.total : 0)}</b></div>
        ${methods.length ? methods.map((m, i) => html`
          <label class="pick method"><input type="radio" name="method" value="${m.id}" ${i === 0 ? 'checked' : ''} /><span>${icon(m.icon)}<b>${m.label}</b><small>${m.note}</small></span></label>`)
        : html`<div class="err-box small">Приём платежей ещё не настроен. Обратитесь к администрации.</div>`}
        <button class="btn primary block lg" ${methods.length ? '' : 'disabled'}>Перейти к оплате</button>
        <p class="muted small">Услуга включается автоматически после оплаты. Скидка по купону применится к итоговой сумме.</p>
      </div>
    </form>`}`);
}

module.exports = { servers, serverForm, widgets, serverStats, orders, buy, ORDER, STATUS, PROVIDER, voteService };
