const { html, fmt } = require('./html');
const { serverPath } = require('../seo');
const { layout, icon, csrfField } = require('./layout');
const { favicon, statusDot } = require('./public');
const { ORDER, STATUS, PROVIDER } = require('./cabinet');
const { KINDS } = require('../db');
const notify = require('../adminNotify');

const SECTIONS = [
  ['/admin', 'Обзор', 'chart'],
  ['/admin/servers', 'Сервера', 'server'],
  ['/admin/grant', 'Выдать услугу', 'bolt'],
  ['/admin/orders', 'Заказы', 'card'],
  ['/admin/products', 'Тарифы', 'tag'],
  ['/admin/coupons', 'Купоны', 'card'],
  ['/admin/support', 'Поддержка', 'chat'],
  ['/admin/news', 'Новости', 'news'],
  ['/admin/launcher', 'Лаунчер', 'download'],
  ['/admin/users', 'Пользователи', 'users'],
  ['/admin/log', 'Журнал', 'edit'],
  ['/admin/settings', 'Настройки', 'settings'],
];

function shell(req, active, title, body, { flash, actions } = {}) {
  return layout(req, {
    title: `Админка · ${title}`, wide: true, flash,
    body: html`
    <div class="admin">
      <aside class="admin-nav card">
        ${(() => {
          const c = notify.counts();
          const by = { '/admin/support': c.support, '/admin/servers': c.servers, '/admin/users': c.users, '/admin/orders': c.orders };
          return SECTIONS.map(([h, l, i]) => html`<a class="${active === h ? 'active' : ''}" href="${h}">${icon(i)}${l}${by[h] ? html`<span class="nav-count">${by[h]}</span>` : ''}</a>`);
        })()}
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

/** Кнопка с запросом значения (prompt) → скрытое поле name */
const btnPrompt = (req, action, label, name, question, cls = 'ghost', def = '') => html`
  <form method="post" action="${action}" class="inline">${csrfField(req)}<input type="hidden" name="${name}" value="" />
    <button class="btn ${cls} sm" data-prompt="${question}" data-prompt-field="${name}" data-prompt-default="${def}">${label}</button></form>`;

const search = (action, q, placeholder, extra = '') => html`
  <form class="admin-search" method="get" action="${action}">${extra}
    ${icon('search')}<input name="q" value="${q || ''}" placeholder="${placeholder}" />
    ${q ? html`<a class="link small" href="${action}">сбросить</a>` : ''}
  </form>`;

const kindBadges = (services) => Object.entries(services || {}).map(([k, ends]) => html`<span class="badge ${k === 'promo' || k === 'ingame' ? 'gold' : 'red'}" title="до ${fmt.date(ends)}">${KINDS[k]?.short || k} · до ${fmt.date(ends)}</span>`);

function dashboard(req, d) {
  const max = Math.max(1, ...d.revenueDays.map((x) => x.v));
  return shell(req, '/admin', 'Обзор', html`
    <div class="stats four">
      <div class="stat card"><small>Выручка за месяц</small><b>${fmt.rub(d.revenueMonth)}</b><small class="muted">всего ${fmt.rub(d.revenueTotal)}</small></div>
      <div class="stat card"><small>Оплаченных заказов</small><b>${fmt.num(d.paidOrders)}</b><small class="muted">ожидают оплаты: ${d.pendingOrders}</small></div>
      <div class="stat card"><small>Сервера</small><b>${fmt.num(d.servers)}</b><small class="muted">${d.pendingServers ? html`<a class="link" href="/admin/servers?status=pending">${d.pendingServers} на модерации</a>` : 'очередь пуста'}</small></div>
      <div class="stat card"><small>Игроков онлайн</small><b>${fmt.num(d.players)}</b><small class="muted">голосов за месяц: ${fmt.num(d.votes)} · пользователей: ${fmt.num(d.users)}</small></div>
    </div>
    <div class="card pad">
      <div class="card-head"><h3>Выручка за 30 дней</h3><a class="btn ghost sm" href="/admin/grant">${icon('bolt')}Выдать услугу</a></div>
      <div class="bars">${d.revenueDays.map((x) => html`<span title="${fmt.date(x.t)} — ${fmt.rub(x.v)}" style="height:${Math.max(2, (x.v / max) * 100)}%"></span>`)}</div>
    </div>
    <div class="two">
      <div class="card pad"><h3>Активная реклама</h3>
        ${d.active.length ? html`<table class="table compact"><tbody>${d.active.map((o) => html`<tr><td><span class="badge ${o.kind === 'promo' || o.kind === 'ingame' ? 'gold' : 'red'}">${KINDS[o.kind]?.short || o.kind}</span></td><td><a href="/admin/servers/${o.server_id}">${o.server_name || '—'}</a></td><td class="muted small right">до ${fmt.date(o.ends)}</td></tr>`)}</tbody></table>` : html`<p class="muted">Сейчас ничего не крутится.</p>`}
      </div>
      <div class="card pad"><h3>Последние заказы</h3>
        ${d.recent.length ? html`<table class="table compact"><tbody>${d.recent.map((o) => html`<tr><td class="muted">#${o.id}</td><td>${o.title}</td><td>${fmt.rub(o.amount)}</td><td class="right"><span class="badge ${ORDER[o.status][1]}">${ORDER[o.status][0]}</span></td></tr>`)}</tbody></table>` : html`<p class="muted">Заказов ещё нет.</p>`}
      </div>
    </div>`, { flash: d.flash });
}

function servers(req, { list, status, q, flash }) {
  const f = (v, l) => html`<a class="chip ${status === v ? 'active' : ''}" href="/admin/servers${v ? `?status=${v}` : ''}">${l}</a>`;
  return shell(req, '/admin/servers', 'Сервера', html`
    <div class="admin-tools">
      <div class="chips">${f('', 'Все')}${f('pending', 'На модерации')}${f('approved', 'Опубликованы')}${f('rejected', 'Отклонены')}</div>
      ${search('/admin/servers', q, 'Название, IP или email владельца', status ? html`<input type="hidden" name="status" value="${status}" />` : '')}
      <a class="btn ghost sm" href="/admin/servers/import">${icon('plus')}Импорт списком</a>
    </div>
    <div class="card table-wrap"><table class="table">
      <thead><tr><th></th><th>Сервер</th><th>Владелец</th><th>Онлайн</th><th>Голоса</th><th>Статус / услуги</th><th></th></tr></thead>
      <tbody>${list.map((s) => html`<tr>
        <td>${favicon(s, 'fav sm')}</td>
        <td><a class="srv-link" href="/admin/servers/${s.id}"><b>${s.name}</b></a><br/><small class="muted">${s.address}</small></td>
        <td class="small">${s.owner_email || '—'}</td>
        <td class="small nowrap">${statusDot(s)} ${s.online ? `${s.players}/${s.max_players}` : 'офлайн'}</td>
        <td>${s.votes}</td>
        <td><div class="badges"><span class="badge ${STATUS[s.status][1]}">${STATUS[s.status][0]}</span>${kindBadges(s.services)}</div></td>
        <td class="right nowrap">
          ${s.status === 'pending' ? html`${btnPost(req, `/admin/servers/${s.id}/approve`, 'Одобрить', 'primary')}${btnPrompt(req, `/admin/servers/${s.id}/reject`, 'Отклонить', 'reason', 'Причина отказа (увидит владелец):')}` : ''}
          ${s.status === 'rejected' ? btnPost(req, `/admin/servers/${s.id}/approve`, 'Одобрить', 'ghost') : ''}
          <a class="btn ghost sm" href="/admin/grant?server=${s.id}" title="Выдать услугу">${icon('bolt')}Выдать</a>
        </td></tr>`)}</tbody></table>
      ${list.length ? '' : html`<div class="empty"><b>Ничего не найдено</b></div>`}
    </div>`, { flash });
}

function serverDetail(req, { s, owner, services, orders, votes, voteStats, flash }) {
  return shell(req, '/admin/servers', s.name, html`
    <div class="admin-grid">
      <div class="col">
        <div class="card pad">
          <div class="row between"><div class="row">${favicon(s, 'fav')}<div><b>${s.name}</b><br/><small class="muted">${s.address}</small></div></div>
            <div class="row"><a class="btn ghost sm" href="${serverPath(s)}" target="_blank">На сайте</a><a class="btn ghost sm" href="/cabinet/servers/${s.id}/stats">${icon('chart')}Статистика</a><a class="btn ghost sm" href="/cabinet/servers/${s.id}">${icon('edit')}Редактировать</a></div></div>
          <dl class="kv">
            <dt>Статус</dt><dd><span class="badge ${STATUS[s.status][1]}">${STATUS[s.status][0]}</span>${s.reject_reason ? html` <small class="muted">${s.reject_reason}</small>` : ''}</dd>
            <dt>Онлайн</dt><dd>${statusDot(s)} ${s.online ? `${s.players} / ${s.max_players}, ${s.ping_ms} мс` : 'офлайн'} · <small class="muted">${fmt.ago(s.last_ping)}</small></dd>
            <dt>Владелец</dt><dd>${owner ? html`<a class="link" href="/admin/users?q=${encodeURIComponent(owner.email)}">${owner.email}</a>` : '—'}</dd>
            <dt>Добавлен</dt><dd>${fmt.date(s.created)}</dd>
            <dt>Вебхук голосов</dt><dd class="small">${s.vote_webhook || '—'}</dd>
          </dl>
          <div class="row" style="margin-top:16px">
            ${s.status !== 'approved' ? btnPost(req, `/admin/servers/${s.id}/approve`, 'Одобрить', 'primary') : ''}
            ${s.status !== 'rejected' ? btnPrompt(req, `/admin/servers/${s.id}/reject`, 'Отклонить', 'reason', 'Причина отказа (увидит владелец):') : ''}
            ${btnPrompt(req, `/admin/servers/${s.id}/owner`, 'Сменить владельца', 'email', 'Email нового владельца:')}
            ${btnPost(req, `/admin/servers/${s.id}/delete`, 'Удалить сервер', 'ghost danger', '', `Удалить ${s.name}? Голоса, история и заказы сервера будут отвязаны.`)}
          </div>
        </div>

        <div class="card pad">
          <div class="card-head"><h3>Услуги</h3><a class="btn primary sm" href="/admin/grant?server=${s.id}">${icon('bolt')}Выдать услугу</a></div>
          ${Object.keys(services).length ? html`<div class="badges">${kindBadges(services)}</div>` : html`<p class="muted">Активных услуг нет.</p>`}
          ${orders.length ? html`<div class="svc-list">${orders.map((o) => {
            const live = o.status === 'paid' && o.ends > Date.now();
            return html`
            <div class="svc ${live ? 'live' : ''}">
              <div class="svc-main">
                <b>${o.title.replace(/ \(выдано админом\)$/, '')}</b>
                <div class="svc-meta">
                  <span class="badge ${o.status === 'paid' && !live ? '' : ORDER[o.status][1]}">${o.status === 'paid' && !live ? 'Завершён' : ORDER[o.status][0]}</span>
                  <span>${o.status === 'paid' ? fmt.period(o.starts, o.ends) : fmt.date(o.created)}</span>
                  <span>${o.provider === 'manual' ? 'выдано админом' : fmt.rub(o.amount)}</span>
                  <span class="muted">#${o.id}</span>
                </div>
                ${o.note ? html`<small class="muted">${o.note}</small>` : ''}
              </div>
              ${live ? html`<div class="svc-actions">${btnPrompt(req, `/admin/orders/${o.id}/extend`, '+ дни', 'days', 'На сколько дней продлить? (можно минус, чтобы сократить)', 'ghost', '7')}${btnPost(req, `/admin/orders/${o.id}/end`, 'Завершить', 'ghost danger', '', 'Завершить показ прямо сейчас?')}</div>` : ''}
            </div>`;
          })}</div>` : ''}
        </div>
      </div>

      <div class="col">
        <div class="card pad">
          <div class="card-head"><h3>Голоса</h3>${btnPost(req, `/admin/servers/${s.id}/reset-votes`, 'Обнулить за месяц', 'ghost danger', '', 'Удалить все голоса этого сервера за текущий месяц? (накрутка)')}</div>
          <div class="stats three">
            <div class="stat"><b>${voteStats.month}</b><small>за месяц</small></div>
            <div class="stat"><b>${voteStats.day}</b><small>за сутки</small></div>
            <div class="stat"><b>${voteStats.ips}</b><small>уникальных IP за месяц</small></div>
          </div>
          ${voteStats.topIps.length ? html`<p class="muted small" style="margin:10px 0 4px">Больше всего голосов с IP (за месяц):</p>
            <table class="table compact"><tbody>${voteStats.topIps.map((v) => html`<tr><td class="small"><code>${v.ip}</code></td><td>${v.n}</td><td class="right">${btnPost(req, `/admin/servers/${s.id}/delete-ip-votes`, 'Удалить', 'ghost danger', html`<input type="hidden" name="ip" value="${v.ip}" />`, `Удалить все голоса с ${v.ip}?`)}</td></tr>`)}</tbody></table>` : ''}
          <p class="muted small" style="margin:14px 0 4px">Последние голоса:</p>
          <table class="table compact"><tbody>${votes.map((v) => html`<tr><td>${v.nickname}</td><td class="small"><code>${v.ip}</code></td><td class="small muted">${fmt.datetime(v.ts)}</td><td>${v.delivered ? html`<span class="badge ok" title="награда доставлена">✓</span>` : ''}</td><td class="right">${btnPost(req, `/admin/votes/${v.id}/delete`, '×', 'ghost danger')}</td></tr>`)}</tbody></table>
          ${votes.length ? '' : html`<p class="muted">Голосов пока нет.</p>`}
        </div>
      </div>
    </div>`, { flash });
}

function grant(req, { servers, sel, kindDefaults, error }) {
  return shell(req, '/admin/grant', 'Выдать услугу', html`
    <p class="muted">Бесплатная или ручная выдача любой платной услуги на любой срок — для партнёров, компенсаций или оплат вне сайта. Всё попадает в «Заказы» и в журнал.</p>
    ${error ? html`<div class="err-box">${error}</div>` : ''}
    <form method="post" class="buy-grid">${csrfField(req)}
      <div class="card pad">
        <label class="field"><span>Сервер</span>
          <select class="select" name="server_id" required>${servers.map((s) => html`<option value="${s.id}" ${s.id === sel.server ? 'selected' : ''}>${s.name} — ${s.address}${s.status !== 'approved' ? ` (${STATUS[s.status][0].toLowerCase()})` : ''}</option>`)}</select>
        </label>
        <div class="field"><span>Услуга</span>
          <div class="plan-pick">${Object.entries(KINDS).map(([k, v]) => html`
            <label class="pick"><input type="radio" name="kind" value="${k}" data-kind="${k}" data-days="${kindDefaults[k] || 7}" ${k === (sel.kind || 'promo') ? 'checked' : ''} /><span><b>${v.label}</b><small>${{ promo: 'Над топом на сайте и в NLauncher с меткой PROMO', banner: 'Баннер на главной лаунчера и сайта', highlight: 'Подсветка карточки в топе', ingame: 'Первым в списке «Сетевая игра» у игроков NLauncher', points: 'Подъём в общем топе — по сумме активных баллов' }[k]}</small></span></label>`)}
          </div>
        </div>
        <div class="points-fields" hidden>
          <label class="field"><span>Количество промо-баллов</span><input class="input" type="number" name="points" min="5" max="10000" step="5" value="100" /></label>
        </div>
        <div class="banner-fields" hidden>
          <label class="field"><span>Заголовок баннера</span><input class="input" name="banner_title" maxlength="60" /></label>
          <label class="field"><span>Текст</span><input class="input" name="banner_text" maxlength="140" /></label>
          <label class="field"><span>Картинка (ссылка)</span><input class="input" name="banner_image" placeholder="https://" /></label>
          <label class="field"><span>Ссылка по клику</span><input class="input" name="banner_url" placeholder="https:// или пусто — страница сервера" /></label>
        </div>
      </div>
      <div class="card pad pay-box">
        <h3>Параметры</h3>
        <label class="field"><span>Срок, дней</span><input class="input" type="number" name="days" min="1" max="3650" value="${sel.days || 7}" required /></label>
        <div class="row" style="gap:6px;margin:-6px 0 12px">${[1, 3, 7, 14, 30, 90].map((d) => html`<button type="button" class="chip" data-days-set="${d}">${d} дн</button>`)}</div>
        <label class="field"><span>Сумма, ₽ (0 — бесплатно; для учёта оплат вне сайта)</span><input class="input" type="number" name="amount" min="0" value="0" /></label>
        <label class="field"><span>Комментарий (видно только админам)</span><input class="input" name="note" maxlength="200" placeholder="Например: партнёрство, компенсация" /></label>
        <label class="check"><input type="checkbox" name="start_now" checked /> Начать сразу (без очереди и без продления текущей)</label>
        <button class="btn primary block lg" style="margin-top:14px">${icon('bolt')}Выдать</button>
      </div>
    </form>`);
}

function orders(req, { list, status, q, flash }) {
  const f = (v, l) => html`<a class="chip ${status === v ? 'active' : ''}" href="/admin/orders${v ? `?status=${v}` : ''}">${l}</a>`;
  return shell(req, '/admin/orders', 'Заказы', html`
    <div class="admin-tools">
      <div class="chips">${f('', 'Все')}${f('active', 'Сейчас крутятся')}${f('paid', 'Оплачены')}${f('pending', 'Ожидают')}${f('cancelled', 'Отменены')}</div>
      ${search('/admin/orders', q, '№ заказа, сервер или email', status ? html`<input type="hidden" name="status" value="${status}" />` : '')}
    </div>
    <div class="card table-wrap"><table class="table">
      <thead><tr><th>#</th><th>Создан</th><th>Покупатель</th><th>Сервер</th><th>Услуга</th><th>Сумма</th><th>Оплата</th><th>Статус / период</th><th></th></tr></thead>
      <tbody>${list.map((o) => html`<tr>
        <td class="muted">${o.id}</td><td class="small nowrap">${fmt.datetime(o.created)}</td><td class="small">${o.user_email || '—'}</td>
        <td>${o.server_id ? html`<a href="/admin/servers/${o.server_id}">${o.server_name || '—'}</a>` : '—'}</td>
        <td>${o.title}${o.kind === 'banner' && o.banner_title ? html`<br/><small class="muted">«${o.banner_title}»</small>` : ''}${o.note ? html`<br/><small class="muted">${o.note}</small>` : ''}</td>
        <td class="nowrap">${fmt.rub(o.amount)}</td><td class="small">${PROVIDER[o.provider] || '—'}</td>
        <td><span class="badge ${ORDER[o.status][1]}">${ORDER[o.status][0]}</span>${o.status === 'paid' ? html`<br/><small class="muted nowrap">${fmt.date(o.starts)} — ${fmt.date(o.ends)}</small>` : ''}</td>
        <td class="right nowrap">
          ${o.status === 'pending' ? btnPost(req, `/admin/orders/${o.id}/paid`, 'Отметить оплаченным', 'primary', '', 'Подтвердить оплату вручную?') : ''}
          ${o.status === 'paid' && o.ends > Date.now() ? html`${btnPrompt(req, `/admin/orders/${o.id}/extend`, '+ дни', 'days', 'На сколько дней продлить? (можно минус, чтобы сократить)', 'ghost', '7')}${btnPost(req, `/admin/orders/${o.id}/end`, 'Завершить', 'ghost', '', 'Завершить показ прямо сейчас?')}` : ''}
          ${o.status !== 'cancelled' ? btnPost(req, `/admin/orders/${o.id}/cancel`, 'Отменить', 'ghost danger', '', 'Отменить заказ? Реклама сразу перестанет показываться.') : ''}
        </td></tr>`)}</tbody></table>
      ${list.length ? '' : html`<div class="empty"><b>Заказов нет</b></div>`}
    </div>`, { flash, actions: html`<a class="btn ghost" href="/admin/orders.csv">${icon('download')}Выгрузить CSV</a>` });
}

function products(req, { list, flash }) {
  const opts = (sel) => Object.entries(KINDS).filter(([k]) => k !== 'points').map(([k, v]) => html`<option value="${k}" ${k === sel ? 'selected' : ''}>${v.label}</option>`);
  return shell(req, '/admin/products', 'Тарифы', html`
    <datalist id="planLabels"><option value="Выгодно"></option><option value="Хит"></option><option value="Популярное"></option><option value="Новинка"></option><option value="Скидка"></option></datalist>
    <p class="muted">Метка («Выгодно», «Хит» и любая своя) выделяет карточку на странице «Реклама»; оставьте пустой, чтобы убрать. Цены и сроки меняются сразу. «Мест» — сколько одновременно может крутиться (0 — без ограничений). Уже оплаченные заказы не пересчитываются.</p>
    <div class="cards">${list.map((p) => html`
      <form method="post" action="/admin/products/${p.id}" class="card pad product-form">${csrfField(req)}
        <div class="row between"><span class="badge ${p.kind === 'promo' || p.kind === 'ingame' ? 'gold' : 'red'}">${KINDS[p.kind]?.label || p.kind}</span><label class="check"><input type="checkbox" name="active" ${p.active ? 'checked' : ''} /> Продаётся</label></div>
        <label class="field"><span>Название</span><input class="input" name="title" value="${p.title}" required /></label>
        <label class="field"><span>Описание</span><input class="input" name="description" value="${p.description}" /></label>
        <label class="field"><span>Метка на карточке</span><input class="input" name="label" value="${p.label || ''}" maxlength="20" placeholder="пусто — без метки" list="planLabels" /></label>
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
        <label class="field"><span>Тип</span><select class="select" name="kind">${opts('promo')}</select></label>
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
      <td class="small muted nowrap">${fmt.date(n.created)}</td><td><b>${n.title}</b>${n.published ? '' : html` <span class="badge">скрыта</span>`}<br/><small class="muted">${n.text}</small></td>
      <td class="right nowrap">${btnPost(req, `/admin/news/${n.id}/toggle`, n.published ? 'Скрыть' : 'Показать')}${btnPost(req, `/admin/news/${n.id}/delete`, 'Удалить', 'ghost danger', '', 'Удалить новость?')}</td>
    </tr>`)}</tbody></table></div>`, { flash });
}

function users(req, { list, q, flash }) {
  return shell(req, '/admin/users', 'Пользователи', html`
    <div class="admin-tools">${search('/admin/users', q, 'Email или имя')}</div>
    <div class="card table-wrap"><table class="table">
      <thead><tr><th>#</th><th>Имя</th><th>Email</th><th>Серверов</th><th>Потратил</th><th>Регистрация</th><th></th></tr></thead>
      <tbody>${list.map((u) => html`<tr>
        <td class="muted">${u.id}</td><td class="nowrap"><div class="badges">${u.name}${u.role === 'admin' ? html`<span class="badge red">админ</span>` : ''}${u.banned ? html`<span class="badge bad">бан</span>` : ''}${u.id === req.user.id ? html`<span class="badge">это вы</span>` : ''}</div></td>
        <td class="small">${u.email}</td><td>${u.servers ? html`<a class="link" href="/admin/servers?q=${encodeURIComponent(u.email)}">${u.servers}</a>` : 0}</td><td class="nowrap">${fmt.rub(u.spent)}</td><td class="small muted nowrap">${fmt.date(u.created)}</td>
        <td class="right nowrap">${btnPrompt(req, `/admin/users/${u.id}/password`, 'Новый пароль', 'password', `Новый пароль для ${u.email} (минимум 8 символов):`)}${u.id !== req.user.id ? html`
          ${btnPost(req, `/admin/users/${u.id}/role`, u.role === 'admin' ? 'Снять админа' : 'Сделать админом', 'ghost', '', 'Изменить роль?')}
          ${btnPost(req, `/admin/users/${u.id}/ban`, u.banned ? 'Разбанить' : 'Забанить', 'ghost danger', '', u.banned ? 'Разбанить?' : 'Забанить пользователя? Он не сможет войти.')}
          ${btnPost(req, `/admin/users/${u.id}/delete`, html`${icon('trash')}Удалить`, 'ghost danger', '', `Удалить ${u.email} навсегда?${u.servers ? ` Его сервера (${u.servers}) останутся без владельца — их можно передать другому.` : ''}`)}
          ${u.servers ? btnPost(req, `/admin/users/${u.id}/delete`, 'Удалить с серверами', 'ghost danger', html`<input type="hidden" name="servers" value="1" />`, `Удалить ${u.email} и все его сервера (${u.servers}) вместе с голосами и статистикой? Это нельзя отменить.`) : ''}` : ''}</td>
      </tr>`)}</tbody></table>
      ${list.length ? '' : html`<div class="empty"><b>Никого не найдено</b></div>`}
    </div>`, { flash });
}

function launcherPage(req, { files, latest, site, flash }) {
  const mb = (n) => `${(n / 1048576).toFixed(1)} МБ`;
  return shell(req, '/admin/launcher', 'Лаунчер', html`
    <div class="two">
      <div class="card pad">
        <h3>Загрузить новую версию</h3>
        <p class="muted small">Скачайте установщик из GitHub Releases и загрузите сюда, не переименовывая: версия берётся из имени файла (например, NLauncher-Setup-0.2.6.exe). Портативную версию можно загрузить так же.</p>
        <label class="drop" id="drop">
          <input type="file" id="upFile" multiple accept=".exe,.zip,.msi,.dmg,.AppImage,.deb" hidden />
          ${icon('download')}<b>Выберите файлы</b><span class="muted small">или перетащите сюда · до 500 МБ</span>
        </label>
        <div class="up-list" id="upList"></div>
      </div>
      <div class="card pad">
        <h3>Что видят игроки</h3>
        ${latest ? html`
          <dl class="kv">
            <dt>Версия на сайте</dt><dd><b>${latest.version || 'не указана в имени файла'}</b></dd>
            <dt>Кнопка «Скачать»</dt><dd><a class="link" href="/download">${site}/download</a></dd>
            <dt>Установщик</dt><dd class="small">${latest.setup}</dd>
            ${latest.portable ? html`<dt>Портативная</dt><dd class="small">${latest.portable}</dd>` : ''}
          </dl>
          <p class="muted small" style="margin-top:12px">Лаунчеры с меньшей версией покажут игрокам «Доступно обновление» со ссылкой на эту версию.</p>`
        : html`<p class="muted">Файлов ещё нет — кнопка «Скачать» ведёт на GitHub Releases.</p>`}
      </div>
    </div>
    <div class="card table-wrap"><table class="table">
      <thead><tr><th>Файл</th><th>Версия</th><th>Размер</th><th>Загружен</th><th></th></tr></thead>
      <tbody>${files.map((f) => html`<tr>
        <td><a class="link" href="${f.url}">${f.name}</a></td><td>${f.version || '—'} ${f.kind === 'portable' ? html`<span class="badge">портативная</span>` : ''}</td>
        <td class="nowrap">${mb(f.size)}</td><td class="small muted nowrap">${fmt.datetime(f.mtime)}</td>
        <td class="right">${btnPost(req, '/admin/launcher/delete', 'Удалить', 'ghost danger', html`<input type="hidden" name="name" value="${f.name}" />`, `Удалить ${f.name}?`)}</td>
      </tr>`)}</tbody></table>
      ${files.length ? '' : html`<div class="empty"><b>Пока пусто</b>Загрузите установщик лаунчера.</div>`}
    </div>`, { flash });
}

function coupons(req, { list, flash }) {
  return shell(req, '/admin/coupons', 'Купоны', html`
    <p class="muted">Скидка в процентах на любую услугу. Учитывается при оплате; лимит использований и срок — по желанию.</p>
    <form method="post" action="/admin/coupons" class="card pad product-form">${csrfField(req)}
      <h3>Новый купон</h3>
      <div class="row three">
        <label class="field"><span>Код</span><input class="input mono" name="code" placeholder="авто" maxlength="30" style="text-transform:uppercase" /></label>
        <label class="field"><span>Скидка, %</span><input class="input" type="number" name="percent" min="1" max="90" value="10" required /></label>
        <label class="field"><span>Использований (0 — без лимита)</span><input class="input" type="number" name="max_uses" min="0" value="0" /></label>
      </div>
      <div class="row three">
        <label class="field"><span>Действует дней (0 — бессрочно)</span><input class="input" type="number" name="days" min="0" value="30" /></label>
        <label class="field" style="grid-column: span 2"><span>Заметка</span><input class="input" name="note" maxlength="100" placeholder="Для партнёров / акция на Новый год" /></label>
      </div>
      <button class="btn primary sm">${icon('plus')}Создать купон</button>
    </form>
    <div class="card table-wrap"><table class="table">
      <thead><tr><th>Код</th><th>Скидка</th><th>Использован</th><th>Действует до</th><th>Заметка</th><th></th></tr></thead>
      <tbody>${list.map((c) => html`<tr>
        <td><code>${c.code}</code> ${c.active ? '' : html`<span class="badge">выключен</span>`}${c.expires && c.expires < Date.now() ? html`<span class="badge bad">истёк</span>` : ''}</td>
        <td>${c.percent}%</td><td>${c.used}${c.max_uses ? ` из ${c.max_uses}` : ''}</td>
        <td class="small muted nowrap">${c.expires ? fmt.date(c.expires) : 'бессрочно'}</td><td class="small muted">${c.note}</td>
        <td class="right nowrap">${btnPost(req, `/admin/coupons/${c.id}/toggle`, c.active ? 'Выключить' : 'Включить')}${btnPost(req, `/admin/coupons/${c.id}/delete`, 'Удалить', 'ghost danger', '', `Удалить купон ${c.code}?`)}</td>
      </tr>`)}</tbody></table>
      ${list.length ? '' : html`<div class="empty"><b>Купонов пока нет</b></div>`}
    </div>`, { flash });
}

function log(req, { list }) {
  return shell(req, '/admin/log', 'Журнал действий', html`
    <p class="muted">Все действия администраторов: модерация, выдача услуг, изменения заказов, тарифов и настроек.</p>
    <div class="card table-wrap"><table class="table"><tbody>${list.map((l) => html`<tr>
      <td class="small muted nowrap">${fmt.datetime(l.ts)}</td><td class="small">${l.admin_email || '—'}</td><td><b>${l.action}</b></td><td class="small muted">${l.details}</td>
    </tr>`)}</tbody></table>
    ${list.length ? '' : html`<div class="empty"><b>Пока пусто</b></div>`}</div>`);
}

function settingsPage(req, { s, flash, hooks }) {
  const f = (k, label, ph = '', type = 'text') => html`<label class="field"><span>${label}</span><input class="input" type="${type}" name="${k}" value="${s[k] || ''}" placeholder="${ph}" autocomplete="off" /></label>`;
  return shell(req, '/admin/settings', 'Настройки', html`
    <form method="post" class="settings-grid">${csrfField(req)}
      <div class="card pad"><h3>Сайт</h3>
        ${f('site_name', 'Название')}
        ${f('site_url', 'Адрес сайта (для ссылок оплаты)', 'https://nlauncher.ru')}
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
        <p class="muted small">Лента для лаунчера (уже прописана в NLauncher):</p>
        <pre class="code">${hooks.feed}</pre>
        <p class="muted small">Оттуда лаунчер берёт баннер, новости, PROMO, топ и сервера для списка «Сетевая игра».</p>
      </div>
      <div class="card pad"><h3>Голосование и промо-баллы</h3>
        ${f('vote_cooldown_hours', 'Голосовать можно раз в … часов', '24', 'number')}
        ${f('points_price', 'Цена 1 промо-балла на 7 дней, ₽', '10', 'number')}
        ${f('points_label', 'Метка на карточке промо-баллов', 'пусто — без метки')}
        <p class="muted small">Голоса доставляются на сервера через Votifier. Имя сервиса для плагинов — домен сайта. Цена баллов на другие сроки и скидки за пакеты считаются автоматически (см. «Реклама»).</p>
      </div>
      <div class="card pad full"><h3>Статистика и онлайн</h3>
        <label class="check big"><input type="checkbox" name="show_launcher_online" ${s.show_launcher_online === '1' ? 'checked' : ''} />
          <span><b>Показывать «игроков в NLauncher»</b><small class="muted">Реальный онлайн лаунчера на сайте и в самом лаунчере. Пока игроков мало, можно выключить — тогда виден только общий онлайн серверов мониторинга.</small></span></label>
        <label class="check big"><input type="checkbox" name="demo_stats" ${s.demo_stats === '1' ? 'checked' : ''} />
          <span><b>Демо-статистика для тестов</b><small class="muted">Подставляет на странице «Статистика» случайные 2000–3000 онлайн и вымышленные дневные цифры — <b>только для администраторов</b> и с пометкой «ДЕМО». Посетители и лаунчер всегда видят настоящие данные.</small></span></label>
        <p class="muted small"><a class="link" href="/stats" target="_blank">Открыть страницу «Статистика»</a></p>
      </div>
      <div class="card pad full"><h3>SEO и метрики</h3>
        <div class="settings-grid inner">
          <div>
            ${f('yandex_metrika_id', 'Яндекс Метрика — номер счётчика', '12345678')}
            <p class="muted small">Создайте счётчик на <a class="link" href="https://metrika.yandex.ru" target="_blank" rel="noopener">metrika.yandex.ru</a> → скопируйте его номер. Вебвизор и карта кликов включаются автоматически.</p>
            ${f('google_analytics_id', 'Google Analytics — идентификатор', 'G-XXXXXXXXXX')}
            <p class="muted small"><a class="link" href="https://analytics.google.com" target="_blank" rel="noopener">analytics.google.com</a> → Администратор → Потоки данных → «Идентификатор потока».</p>
          </div>
          <div>
            ${f('yandex_verification', 'Яндекс Вебмастер — код подтверждения', 'только значение content')}
            <p class="muted small"><a class="link" href="https://webmaster.yandex.ru" target="_blank" rel="noopener">webmaster.yandex.ru</a> → добавить сайт → способ «Мета-тег» → скопируйте только значение <code>content="…"</code>.</p>
            ${f('google_verification', 'Google Search Console — код подтверждения', 'только значение content')}
            <p class="muted small"><a class="link" href="https://search.google.com/search-console" target="_blank" rel="noopener">Search Console</a> → «Префикс URL» → способ «Тег HTML» → значение <code>content="…"</code>.</p>
          </div>
        </div>
        <p class="muted small">Карта сайта для вебмастеров: <code>${hooks.sitemap}</code> · robots.txt: <code>${hooks.robots}</code>. Когда включены счётчики, посетители видят уведомление о cookie.</p>
      </div>
      <div class="row end full"><button class="btn primary">Сохранить настройки</button></div>
    </form>`, { flash });
}

// Стартовый список: публичные адреса известных серверов. Каждый проверяется пингом, мёртвые не добавятся.
const STARTER = `FunTime | mc.funtime.su
HolyWorld | mc.holyworld.ru
ReallyWorld | mc.reallyworld.ru
MusteryWorld | mc.musteryworld.net
MineBlaze | mc.mineblaze.net
DexLand | mc.dexland.org
MasedWorld | mc.masedworld.net
SpookyTime | mc.spookytime.net
JetMine | mc.jetmine.ru
SaturnX | mc.saturn-x.space
MineLand | mc.mineland.net
LastCraft | mc.lastcraft.net
ProstoCraft | mc.prostocraft.ru`;
const IMPORT_RESULT = { added: ['Добавлен', 'ok'], exists: ['Уже есть', ''], offline: ['Не отвечает', 'warn'] };

function importPage(req, { results, list, offline }) {
  return shell(req, '/admin/servers', 'Импорт серверов', html`
    <div class="card pad">
      <p class="muted">По одному серверу на строку: <code>адрес</code> или <code>Название | адрес</code>. Сайт опросит каждый сервер и сам возьмёт описание (MOTD), иконку, версию и онлайн. Сервера сразу публикуются, владельцем записываетесь вы — потом его можно передать настоящему владельцу в карточке сервера. Теги и описание поправьте вручную. До 100 строк за раз.</p>
      <form method="post" action="/admin/servers/import" style="display:grid;gap:14px;margin-top:14px">
        ${csrfField(req)}
        <textarea class="input mono" name="list" rows="14" spellcheck="false">${list ?? STARTER}</textarea>
        <label class="check"><input type="checkbox" name="offline" value="1" ${offline ? 'checked' : ''} /><span>Добавлять и те, что сейчас не отвечают</span></label>
        <div class="row"><button class="btn primary">${icon('plus')}Проверить и добавить</button><span class="muted small">Опрос занимает до 5 секунд на каждые 10 серверов.</span></div>
      </form>
    </div>
    ${results ? html`
    <div class="card table-wrap" style="margin-top:18px"><table class="table">
      <thead><tr><th>Сервер</th><th>Адрес</th><th>Онлайн</th><th>Результат</th></tr></thead>
      <tbody>${results.map((r) => html`<tr>
        <td>${r.id ? html`<a class="srv-link" href="/admin/servers/${r.id}"><b>${r.name || '—'}</b></a>` : r.name || '—'}</td>
        <td class="small">${r.address}</td>
        <td class="small">${r.result === 'added' ? (r.online ? `${r.players}` : 'офлайн') : ''}</td>
        <td><span class="badge ${IMPORT_RESULT[r.result][1]}">${IMPORT_RESULT[r.result][0]}</span></td></tr>`)}</tbody></table>
      ${results.length ? '' : html`<div class="empty"><b>Не нашлось ни одного адреса</b></div>`}
    </div>` : ''}`);
}

/* ---- техподдержка ---- */
const who = (t) => t.email || t.contact || `Гость #${t.id}`;
function supportList(req, { list, status, q, flash }) {
  const f = (v, l) => html`<a class="chip ${status === v ? 'active' : ''}" href="/admin/support${v !== 'open' ? `?status=${v}` : ''}">${l}</a>`;
  return shell(req, '/admin/support', 'Поддержка', html`
    <div class="admin-tools">
      <div class="chips">${f('open', 'Открытые')}${f('closed', 'Закрытые')}${f('all', 'Все')}</div>
      ${search('/admin/support', q, 'Email, Telegram или текст', status !== 'open' ? html`<input type="hidden" name="status" value="${status}" />` : '')}
    </div>
    <div class="card sup-list">
      ${list.map((t) => html`<a class="sup-item ${t.unread_admin ? 'unread' : ''}" href="/admin/support/${t.id}">
        <span class="sup-ava">${(who(t)[0] || '?').toUpperCase()}</span>
        <span class="sup-main"><b>${who(t)}${t.user_id ? '' : html`<span class="badge">гость</span>`}${t.status === 'closed' ? html`<span class="badge">закрыт</span>` : ''}</b>
          <small class="muted">${t.last_from_admin ? 'Вы: ' : ''}${t.last_text || ''}</small></span>
        <span class="sup-meta"><small class="muted">${fmt.datetime(t.updated)}</small>${t.unread_admin ? html`<span class="nav-count">${t.unread_admin}</span>` : ''}</span>
      </a>`)}
      ${list.length ? '' : html`<div class="empty"><b>${status === 'open' ? 'Новых обращений нет' : 'Ничего не найдено'}</b>Кнопка «Поддержка» есть внизу справа на каждой странице сайта.</div>`}
    </div>`, { flash });
}

function supportThread(req, { t, messages, servers, flash }) {
  return shell(req, '/admin/support', who(t), html`
    <div class="sup-wrap">
      <div class="card sup-chat">
        <div class="sup-msgs" id="supMsgs" data-thread="${t.id}" data-last="${messages.length ? messages[messages.length - 1].id : 0}">
          ${messages.map((m) => html`<div class="sup-msg ${m.from_admin ? 'me' : ''}" data-id="${m.id}"><p>${m.text}</p><small>${fmt.datetime(m.ts)}</small></div>`)}
        </div>
        <form class="sup-form" id="supForm" method="post" action="/admin/support/${t.id}/reply">${csrfField(req)}
          <textarea class="input" name="text" rows="2" maxlength="2000" placeholder="Ответ… (Enter — отправить, Shift+Enter — новая строка)" required></textarea>
          <button class="btn primary">${icon('arrow')}Отправить</button>
        </form>
      </div>
      <aside class="card pad sup-side">
        <h3>${t.user_id ? 'Пользователь' : 'Гость'}</h3>
        ${t.email ? html`<p><a class="link" href="/admin/users?q=${encodeURIComponent(t.email)}">${t.email}</a></p>` : ''}
        ${t.contact ? html`<p class="small">Контакт: <b>${t.contact}</b></p>` : ''}
        ${t.page ? html`<p class="small muted">Написал со страницы ${t.page}</p>` : ''}
        <p class="small muted">Начало: ${fmt.datetime(t.created)}</p>
        ${servers.length ? html`<p class="small">Сервера: ${servers.map((s, i) => html`${i ? ', ' : ''}<a class="link" href="/admin/servers/${s.id}">${s.name}</a>`)}</p>` : ''}
        <p class="small muted" id="supSeen">${t.unread_user ? 'Последний ответ ещё не прочитан' : 'Пользователь видел все ответы'}</p>
        <div class="row" style="margin-top:12px">
          ${btnPost(req, `/admin/support/${t.id}/status`, t.status === 'closed' ? 'Открыть снова' : 'Закрыть', 'ghost', html`<input type="hidden" name="status" value="${t.status === 'closed' ? 'open' : 'closed'}" />`)}
          ${btnPost(req, `/admin/support/${t.id}/delete`, 'Удалить', 'ghost danger', '', 'Удалить переписку целиком?')}
        </div>
      </aside>
    </div>
    <script src="/support-admin.js"></script>`, { flash });
}

module.exports = { supportList, supportThread, importPage, dashboard, servers, serverDetail, grant, orders, products, coupons, news, users, launcherPage, log, settingsPage };
