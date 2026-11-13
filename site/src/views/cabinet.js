const { html, fmt } = require('./html');
const { layout, icon, csrfField } = require('./layout');
const { favicon, statusDot } = require('./public');

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
          <b><a href="/server/${s.id}">${s.name}</a></b>
          <small class="muted">${s.address}</small>
          <div class="row">
            <span class="badge ${STATUS[s.status][1]}">${STATUS[s.status][0]}</span>
            <span class="muted small">${statusDot(s)} ${s.online ? `${s.players}/${s.max_players}` : 'офлайн'}</span>
            <span class="muted small">${icon('star')} ${s.votes} за месяц</span>
            ${s.promo_until ? html`<span class="badge gold">PROMO до ${fmt.date(s.promo_until)}</span>` : ''}
          </div>
          ${s.status === 'rejected' && s.reject_reason ? html`<div class="err-box small">Причина: ${s.reject_reason}</div>` : ''}
        </div>
        <div class="row">
          <a class="btn ghost sm" href="/cabinet/servers/${s.id}">${icon('edit')}Изменить</a>
          ${s.status === 'approved' ? html`<a class="btn primary sm" href="/cabinet/buy?server=${s.id}">${icon('bolt')}Продвинуть</a>` : ''}
        </div>
      </div>`) : html`<div class="empty"><b>У вас пока нет серверов</b>Добавьте сервер — после проверки модератором он появится в топе.<br/><br/><a class="btn primary" href="/cabinet/servers/new">${icon('plus')}Добавить сервер</a></div>`}
    </div>`, flash);
}

function serverForm(req, { s = {}, error, isNew, site }) {
  const v = (k) => s[k] ?? '';
  return shell(req, '/cabinet', isNew ? 'Новый сервер' : `Сервер «${s.name}»`, html`
    ${error ? html`<div class="err-box">${error}</div>` : ''}
    <form method="post" class="card pad form-grid">${csrfField(req)}
      <label class="field"><span>Название</span><input class="input" name="name" value="${v('name')}" required maxlength="40" /></label>
      <label class="field"><span>IP-адрес (с портом, если не 25565)</span><input class="input" name="address" value="${v('address')}" required placeholder="play.example.ru" pattern="[A-Za-z0-9._-]+(:[0-9]{1,5})?" /></label>
      <label class="field"><span>Версия</span><input class="input" name="version" value="${v('version')}" placeholder="1.16.5 – 1.21" maxlength="30" /></label>
      <label class="field"><span>Режимы через запятую</span><input class="input" name="tags" value="${v('tags')}" placeholder="Выживание, Анархия, Мини-игры" maxlength="100" /></label>
      <label class="field full"><span>Описание</span><textarea class="input" name="description" rows="6" maxlength="3000">${v('description')}</textarea></label>
      <label class="field"><span>Сайт</span><input class="input" name="website" value="${v('website')}" placeholder="https://" /></label>
      <label class="field"><span>Discord</span><input class="input" name="discord" value="${v('discord')}" placeholder="https://discord.gg/…" /></label>
      <label class="field full"><span>Обложка (ссылка на картинку 1200×400)</span><input class="input" name="banner" value="${v('banner')}" placeholder="https://…/banner.jpg" /></label>
      <details class="full adv">
        <summary>Награды за голосование</summary>
        <p class="muted small">После каждого голоса мы отправим POST-запрос на этот адрес. Ваш плагин проверяет подпись и выдаёт награду.</p>
        <label class="field"><span>Webhook URL</span><input class="input" name="vote_webhook" value="${v('vote_webhook')}" placeholder="https://your-server.ru/vote" /></label>
        ${!isNew ? html`<div class="field"><span>Секрет для подписи</span><code class="secret">${v('vote_secret')}</code></div>
        <pre class="code">POST ${v('vote_webhook') || 'https://your-server.ru/vote'}
Content-Type: application/json

{ "server_id": ${s.id}, "nickname": "Steve", "timestamp": 1731500000000,
  "signature": hex(HMAC_SHA256(secret, nickname + ":" + timestamp)) }</pre>` : ''}
      </details>
      <div class="full row end">
        ${!isNew ? html`<button class="btn ghost danger" name="_action" value="delete" formnovalidate data-confirm="Удалить сервер из мониторинга?">${icon('trash')}Удалить</button>` : ''}
        <button class="btn primary">${isNew ? 'Отправить на модерацию' : 'Сохранить'}</button>
      </div>
      ${!isNew ? html`<p class="muted small full">Изменение адреса отправит сервер на повторную модерацию.</p>` : ''}
    </form>`);
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

function buy(req, { servers, products, sel, error, methods }) {
  const p = products.find((x) => x.id === sel.product) || products[0];
  return shell(req, '/cabinet/buy', 'Купить рекламу', html`
    ${error ? html`<div class="err-box">${error}</div>` : ''}
    ${!servers.length ? html`<div class="empty"><b>Сначала добавьте сервер</b>Продвигать можно только опубликованные сервера.<br/><br/><a class="btn primary" href="/cabinet/servers/new">${icon('plus')}Добавить сервер</a></div>` : html`
    <form method="post" class="buy-grid">${csrfField(req)}
      <div class="card pad">
        <label class="field"><span>Сервер</span>
          <select class="select" name="server_id">${servers.map((s) => html`<option value="${s.id}" ${s.id === sel.server ? 'selected' : ''}>${s.name} — ${s.address}</option>`)}</select>
        </label>
        <div class="field"><span>Тариф</span>
          <div class="plan-pick">${products.map((x) => html`
            <label class="pick"><input type="radio" name="product_id" value="${x.id}" ${x.id === p?.id ? 'checked' : ''} data-kind="${x.kind}" data-price="${x.price}" />
              <span><b>${x.title}</b><small>${fmt.rub(x.price)}${x.slots && x.free <= 0 ? ` · старт ${fmt.date(x.nextStart)}` : ''}</small></span></label>`)}
          </div>
        </div>
        <div class="banner-fields" ${p?.kind === 'banner' ? '' : 'hidden'}>
          <label class="field"><span>Заголовок баннера</span><input class="input" name="banner_title" maxlength="60" placeholder="MegaCraft — новый сезон!" /></label>
          <label class="field"><span>Текст</span><input class="input" name="banner_text" maxlength="140" placeholder="Вайп, новые данжи и ивенты каждые выходные" /></label>
          <label class="field"><span>Картинка (ссылка, 900×500)</span><input class="input" name="banner_image" placeholder="https://…" /></label>
          <label class="field"><span>Ссылка по клику (необязательно)</span><input class="input" name="banner_url" placeholder="https://… или пусто — страница сервера" /></label>
        </div>
      </div>
      <div class="card pad pay-box">
        <h3>Оплата</h3>
        <div class="total"><span class="muted">К оплате</span><b id="total">${fmt.rub(p?.price)}</b></div>
        ${methods.length ? methods.map((m, i) => html`
          <label class="pick method"><input type="radio" name="method" value="${m.id}" ${i === 0 ? 'checked' : ''} /><span>${icon(m.icon)}<b>${m.label}</b><small>${m.note}</small></span></label>`)
        : html`<div class="err-box small">Приём платежей ещё не настроен. Обратитесь к администрации.</div>`}
        <button class="btn primary block lg" ${methods.length ? '' : 'disabled'}>Перейти к оплате</button>
        <p class="muted small">Размещение включается автоматически после оплаты.</p>
      </div>
    </form>`}`);
}

module.exports = { servers, serverForm, orders, buy, ORDER, STATUS, PROVIDER };
