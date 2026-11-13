const { html, fmt } = require('./html');
const { layout, icon, csrfField } = require('./layout');
const { favicon, statusDot } = require('./public');
const { ORDER, STATUS, PROVIDER } = require('./cabinet');

const SECTIONS = [
  ['/admin', 'Обзор', 'chart'],
  ['/admin/servers', 'Сервера', 'server'],
  ['/admin/orders', 'Заказы', 'card'],
  ['/admin/products', 'Тарифы', 'tag'],
  ['/admin/news', 'Новости', 'news'],
  ['/admin/users', 'Пользователи', 'users'],
  ['/admin/settings', 'Настройки', 'settings'],
];

function shell(req, active, title, body, { flash, actions } = {}) {
  return layout(req, {
    title: `Админка · ${title}`, wide: true, flash,
    body: html`
    <div class="admin">
      <aside class="admin-nav card">
        ${SECTIONS.map(([h, l, i]) => html`<a class="${active === h ? 'active' : ''}" href="${h}">${icon(i)}${l}</a>`)}
      </aside>
      <section class="admin-main">
        <div class="page-head"><div><span class="eyebrow">Админка</span><h1>${title}</h1></div>${actions || ''}</div>
        ${body}
      </section>
    </div>`,
  });
}

const btnPost = (req, action, label, cls = 'ghost', extra = '', confirm = '') => html`
  <form method="post" action="${action}" class="inline">${csrfField(req)}${extra}<button class="btn ${cls} sm" ${confirm ? html`data-confirm="${confirm}"` : ''}>${label}</button></form>`;

function dashboard(req, d) {
  const max = Math.max(1, ...d.revenueDays.map((x) => x.v));
  return shell(req, '/admin', 'Обзор', html`
    <div class="stats four">
      <div class="stat card"><small>Выручка за месяц</small><b>${fmt.rub(d.revenueMonth)}</b><small class="muted">всего ${fmt.rub(d.revenueTotal)}</small></div>
      <div class="stat card"><small>Оплаченных заказов</small><b>${fmt.num(d.paidOrders)}</b><small class="muted">ожидают оплаты: ${d.pendingOrders}</small></div>
      <div class="stat card"><small>Сервера</small><b>${fmt.num(d.servers)}</b><small class="muted">${d.pendingServers ? html`<a class="link" href="/admin/servers?status=pending">${d.pendingServers} на модерации</a>` : 'очередь пуста'}</small></div>
      <div class="stat card"><small>Игроков онлайн</small><b>${fmt.num(d.players)}</b><small class="muted">голосов за месяц: ${fmt.num(d.votes)}</small></div>
    </div>
    <div class="card pad">
      <h3>Выручка за 30 дней</h3>
      <div class="bars">${d.revenueDays.map((x) => html`<span title="${fmt.date(x.t)} — ${fmt.rub(x.v)}" style="height:${Math.max(2, (x.v / max) * 100)}%"></span>`)}</div>
    </div>
    <div class="two">
      <div class="card pad"><h3>Активная реклама</h3>
        ${d.active.length ? html`<table class="table compact"><tbody>${d.active.map((o) => html`<tr><td>${o.title}</td><td>${o.server_name || '—'}</td><td class="muted small right">до ${fmt.date(o.ends)}</td></tr>`)}</tbody></table>` : html`<p class="muted">Сейчас ничего не крутится.</p>`}
      </div>
      <div class="card pad"><h3>Последние заказы</h3>
        ${d.recent.length ? html`<table class="table compact"><tbody>${d.recent.map((o) => html`<tr><td class="muted">#${o.id}</td><td>${o.title}</td><td>${fmt.rub(o.amount)}</td><td class="right"><span class="badge ${ORDER[o.status][1]}">${ORDER[o.status][0]}</span></td></tr>`)}</tbody></table>` : html`<p class="muted">Заказов ещё нет.</p>`}
      </div>
    </div>`, { flash: d.flash });
}

function servers(req, { list, status, flash }) {
  const f = (v, l) => html`<a class="chip ${status === v ? 'active' : ''}" href="/admin/servers${v ? `?status=${v}` : ''}">${l}</a>`;
  return shell(req, '/admin/servers', 'Сервера', html`
    <div class="chips">${f('', 'Все')}${f('pending', 'На модерации')}${f('approved', 'Опубликованы')}${f('rejected', 'Отклонены')}</div>
    <div class="card table-wrap"><table class="table">
      <thead><tr><th></th><th>Сервер</th><th>Владелец</th><th>Онлайн</th><th>Голоса</th><th>Статус</th><th></th></tr></thead>
      <tbody>${list.map((s) => html`<tr>
        <td>${favicon(s, 'fav sm')}</td>
        <td><a href="/server/${s.id}"><b>${s.name}</b></a><br/><small class="muted">${s.address}</small></td>
        <td class="small">${s.owner_email || '—'}</td>
        <td class="small">${statusDot(s)} ${s.online ? `${s.players}/${s.max_players}` : 'офлайн'}</td>
        <td>${s.votes}</td>
        <td><span class="badge ${STATUS[s.status][1]}">${STATUS[s.status][0]}</span></td>
        <td class="right nowrap">
          ${s.status !== 'approved' ? btnPost(req, `/admin/servers/${s.id}/approve`, 'Одобрить', 'primary') : ''}
          ${s.status !== 'rejected' ? html`<form method="post" action="/admin/servers/${s.id}/reject" class="inline">${csrfField(req)}<input type="hidden" name="reason" value="" /><button class="btn ghost sm" data-prompt="Причина отказа (увидит владелец):">Отклонить</button></form>` : ''}
          ${btnPost(req, `/admin/servers/${s.id}/promo`, 'PROMO 7 дн', 'ghost', '', 'Выдать PROMO на 7 дней бесплатно?')}
          ${btnPost(req, `/admin/servers/${s.id}/delete`, 'Удалить', 'ghost danger', '', `Удалить ${s.name}? Голоса и история тоже удалятся.`)}
        </td></tr>`)}</tbody></table>
      ${list.length ? '' : html`<div class="empty"><b>Пусто</b></div>`}
    </div>`, { flash });
}

function orders(req, { list, status, flash }) {
  const f = (v, l) => html`<a class="chip ${status === v ? 'active' : ''}" href="/admin/orders${v ? `?status=${v}` : ''}">${l}</a>`;
  return shell(req, '/admin/orders', 'Заказы', html`
    <div class="chips">${f('', 'Все')}${f('paid', 'Оплачены')}${f('pending', 'Ожидают')}${f('cancelled', 'Отменены')}</div>
    <div class="card table-wrap"><table class="table">
      <thead><tr><th>#</th><th>Создан</th><th>Покупатель</th><th>Сервер</th><th>Услуга</th><th>Сумма</th><th>Оплата</th><th>Статус / период</th><th></th></tr></thead>
      <tbody>${list.map((o) => html`<tr>
        <td class="muted">${o.id}</td><td class="small">${fmt.datetime(o.created)}</td><td class="small">${o.user_email || '—'}</td>
        <td>${o.server_name || '—'}</td><td>${o.title}${o.kind === 'banner' && o.banner_title ? html`<br/><small class="muted">«${o.banner_title}»</small>` : ''}</td>
        <td>${fmt.rub(o.amount)}</td><td class="small">${PROVIDER[o.provider] || '—'}</td>
        <td><span class="badge ${ORDER[o.status][1]}">${ORDER[o.status][0]}</span>${o.status === 'paid' ? html`<br/><small class="muted">${fmt.date(o.starts)} — ${fmt.date(o.ends)}</small>` : ''}</td>
        <td class="right nowrap">
          ${o.status === 'pending' ? btnPost(req, `/admin/orders/${o.id}/paid`, 'Отметить оплаченным', 'primary', '', 'Подтвердить оплату вручную?') : ''}
          ${o.status !== 'cancelled' ? btnPost(req, `/admin/orders/${o.id}/cancel`, 'Отменить', 'ghost danger', '', 'Отменить заказ? Реклама сразу перестанет показываться.') : ''}
        </td></tr>`)}</tbody></table>
      ${list.length ? '' : html`<div class="empty"><b>Заказов нет</b></div>`}
    </div>`, { flash });
}

function products(req, { list, flash }) {
  const kinds = { promo: 'PROMO в топе', banner: 'Баннер', highlight: 'Выделение' };
  return shell(req, '/admin/products', 'Тарифы', html`
    <p class="muted">Цены и сроки меняются сразу. «Мест» — сколько одновременно может крутиться (0 — без ограничений). Уже оплаченные заказы не пересчитываются.</p>
    <div class="cards">${list.map((p) => html`
      <form method="post" action="/admin/products/${p.id}" class="card pad product-form">${csrfField(req)}
        <div class="row between"><span class="badge red">${kinds[p.kind]}</span><label class="check"><input type="checkbox" name="active" ${p.active ? 'checked' : ''} /> Продаётся</label></div>
        <label class="field"><span>Название</span><input class="input" name="title" value="${p.title}" required /></label>
        <label class="field"><span>Описание</span><input class="input" name="description" value="${p.description}" /></label>
        <div class="row three">
          <label class="field"><span>Цена, ₽</span><input class="input" type="number" name="price" min="1" value="${p.price}" required /></label>
          <label class="field"><span>Дней</span><input class="input" type="number" name="days" min="1" value="${p.days}" required /></label>
          <label class="field"><span>Мест</span><input class="input" type="number" name="slots" min="0" value="${p.slots}" /></label>
        </div>
        <button class="btn primary sm">Сохранить</button>
      </form>`)}
    </div>
    <form method="post" action="/admin/products/new" class="card pad product-form new">${csrfField(req)}
      <h3>Новый тариф</h3>
      <div class="row three">
        <label class="field"><span>Тип</span><select class="select" name="kind"><option value="promo">PROMO в топе</option><option value="banner">Баннер</option><option value="highlight">Выделение</option></select></label>
        <label class="field"><span>Цена, ₽</span><input class="input" type="number" name="price" min="1" required /></label>
        <label class="field"><span>Дней</span><input class="input" type="number" name="days" min="1" required /></label>
      </div>
      <label class="field"><span>Название</span><input class="input" name="title" required /></label>
      <button class="btn primary sm">${icon('plus')}Добавить</button>
    </form>`, { flash });
}

function news(req, { list, flash }) {
  return shell(req, '/admin/news', 'Новости', html`
    <p class="muted">Новости показываются на сайте и на главном экране NLauncher.</p>
    <form method="post" action="/admin/news" class="card pad">${csrfField(req)}
      <label class="field"><span>Заголовок</span><input class="input" name="title" required maxlength="80" /></label>
      <label class="field"><span>Текст</span><textarea class="input" name="text" rows="3" maxlength="400"></textarea></label>
      <label class="field"><span>Ссылка (необязательно)</span><input class="input" name="url" placeholder="https://" /></label>
      <button class="btn primary sm">${icon('plus')}Опубликовать</button>
    </form>
    <div class="card table-wrap"><table class="table"><tbody>${list.map((n) => html`<tr>
      <td class="small muted">${fmt.date(n.created)}</td><td><b>${n.title}</b><br/><small class="muted">${n.text}</small></td>
      <td class="right nowrap">${btnPost(req, `/admin/news/${n.id}/toggle`, n.published ? 'Скрыть' : 'Показать')}${btnPost(req, `/admin/news/${n.id}/delete`, 'Удалить', 'ghost danger', '', 'Удалить новость?')}</td>
    </tr>`)}</tbody></table></div>`, { flash });
}

function users(req, { list, flash }) {
  return shell(req, '/admin/users', 'Пользователи', html`
    <div class="card table-wrap"><table class="table">
      <thead><tr><th>#</th><th>Имя</th><th>Email</th><th>Серверов</th><th>Потратил</th><th>Регистрация</th><th></th></tr></thead>
      <tbody>${list.map((u) => html`<tr>
        <td class="muted">${u.id}</td><td>${u.name} ${u.role === 'admin' ? html`<span class="badge red">админ</span>` : ''}${u.banned ? html`<span class="badge bad">бан</span>` : ''}</td>
        <td class="small">${u.email}</td><td>${u.servers}</td><td>${fmt.rub(u.spent)}</td><td class="small muted">${fmt.date(u.created)}</td>
        <td class="right nowrap">${u.id !== req.user.id ? html`
          ${btnPost(req, `/admin/users/${u.id}/role`, u.role === 'admin' ? 'Снять админа' : 'Сделать админом', 'ghost', '', 'Изменить роль?')}
          ${btnPost(req, `/admin/users/${u.id}/ban`, u.banned ? 'Разбанить' : 'Забанить', 'ghost danger', '', u.banned ? 'Разбанить?' : 'Забанить пользователя? Он не сможет войти.')}` : html`<span class="muted small">это вы</span>`}</td>
      </tr>`)}</tbody></table></div>`, { flash });
}

function settingsPage(req, { s, flash, hooks }) {
  const f = (k, label, ph = '', type = 'text') => html`<label class="field"><span>${label}</span><input class="input" type="${type}" name="${k}" value="${s[k] || ''}" placeholder="${ph}" autocomplete="off" /></label>`;
  return shell(req, '/admin/settings', 'Настройки', html`
    <form method="post" class="settings-grid">${csrfField(req)}
      <div class="card pad"><h3>Сайт</h3>
        ${f('site_name', 'Название')}
        ${f('site_url', 'Адрес сайта (для ссылок оплаты)', 'https://monitoring.example.ru')}
        ${f('default_banner_title', 'Баннер по умолчанию — заголовок')}
        ${f('default_banner_text', 'Баннер по умолчанию — текст')}
      </div>
      <div class="card pad"><h3>ЮMoney</h3>
        ${f('yoomoney_wallet', 'Номер кошелька', '4100…')}
        ${f('yoomoney_secret', 'Секрет для уведомлений', '', 'password')}
        <p class="muted small">В ЮMoney: <a class="link" href="https://yoomoney.ru/transfer/myservices/http-notification" target="_blank" rel="noopener">HTTP-уведомления</a> → адрес: <code>${hooks.yoomoney}</code></p>
      </div>
      <div class="card pad"><h3>Heleket (криптовалюта)</h3>
        ${f('heleket_merchant', 'UUID мерчанта')}
        ${f('heleket_api_key', 'Payment API key', '', 'password')}
        <p class="muted small">Вебхук: <code>${hooks.heleket}</code> (передаётся автоматически при создании счёта)</p>
      </div>
      <div class="card pad"><h3>NLauncher</h3>
        <p class="muted small">Укажите в <code>config.json</code> лаунчера:</p>
        <pre class="code">"feedUrl": "${hooks.feed}"</pre>
        <p class="muted small">Лаунчер получает оттуда баннер, новости, PROMO-сервера и топ.</p>
      </div>
      <div class="row end full"><button class="btn primary">Сохранить настройки</button></div>
    </form>`, { flash });
}

module.exports = { dashboard, servers, orders, products, news, users, settingsPage };
