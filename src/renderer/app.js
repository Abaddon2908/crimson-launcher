/* global api, hydrateIcons, icon */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtNum = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n));
const fmtTime = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h} ч ${m} м` : `${m} мин`; };
const LOADERS = { vanilla: 'Vanilla', fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge' };
const LOADER_ABBR = { vanilla: 'V', fabric: 'FB', quilt: 'Q', forge: 'FG' };

const state = {
  info: null, settings: null, accounts: { list: [] }, instances: [], current: null,
  mc: null, feed: null, running: false, busy: false,
  mods: { tab: 'browse', type: 'mod', query: '', instance: null, offset: 0 },
};

/* ---------------- утилиты UI ---------------- */
function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${type === 'err' ? 'err' : ''}`;
  el.innerHTML = `<span class="dot ${type === 'err' ? 'bad' : type === 'warn' ? 'warn' : 'ok'}"></span><span>${esc(msg)}</span>`;
  $('#toasts').append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, type === 'err' ? 5200 : 3200);
}
async function safe(fn, errPrefix = '') {
  try { return await fn(); } catch (e) { toast(errPrefix + (e.message || e), 'err'); return undefined; }
}
function openModal(html, onMount) {
  $('#modalBody').innerHTML = html;
  hydrateIcons($('#modalBody'));
  $('#modal').classList.add('show');
  onMount && onMount($('#modalBody'));
}
function closeModal() { $('#modal').classList.remove('show'); }
$('#modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

const avatarUrl = (acc) => (acc ? `https://mc-heads.net/avatar/${encodeURIComponent(acc.type === 'microsoft' ? acc.uuid : acc.name)}/64` : 'https://mc-heads.net/avatar/MHF_Steve/64');
const instIcon = (i, cls = '') => `<span class="inst-icon ${i.loader} ${cls}">${LOADER_ABBR[i.loader] || 'V'}</span>`;
const instSub = (i) => `${LOADERS[i.loader]} · ${i.mc === '__latest__' ? 'последняя версия' : i.mc}${i.loaderVersion ? ' · ' + i.loaderVersion : ''}`;

// битые картинки (нет сети / нет скина) — прячем
document.addEventListener('error', (e) => { if (e.target.tagName === 'IMG') e.target.style.visibility = 'hidden'; }, true);

/* ---------------- навигация ---------------- */
function go(page) {
  $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.page === page));
  $$('.page').forEach((p) => p.classList.toggle('active', p.id === `page-${page}`));
  const btn = $(`.nav .nav-btn[data-page="${page}"]`);
  const ind = $('.nav-indicator');
  if (btn) { ind.style.opacity = 1; ind.style.transform = `translateY(${btn.offsetTop}px)`; } else ind.style.opacity = 0;
  if (page === 'mods') renderMods();
  if (page === 'servers') renderServers();
  if (page === 'instances') renderInstances();
  if (page === 'skin') renderSkin();
  if (page !== 'skin' && editor?.state.on) leaveEditor(false);
  if (page !== 'skin' && cat.on) setCatalogMode(false);
}
$$('.nav-btn').forEach((b) => b.addEventListener('click', () => go(b.dataset.page)));
document.addEventListener('click', (e) => { const g = e.target.closest('[data-goto]'); if (g) go(g.dataset.goto); });
$$('[data-win]').forEach((b) => b.addEventListener('click', () => api.win[b.dataset.win]()));

/* ---------------- аккаунты ---------------- */
function activeAccount() { return state.accounts.list.find((a) => a.id === state.accounts.active); }
function renderAccount() {
  const a = activeAccount();
  const img = $('#avatarImg');
  img.style.display = '';
  img.onerror = () => (img.style.display = 'none');
  img.src = avatarUrl(a);
  $('#avatarLetter').textContent = (a?.name || '?')[0].toUpperCase();
  $('#accountPill').innerHTML = a
    ? `<span class="dot ${a.type === 'microsoft' ? 'ok' : 'warn'}"></span><span>${esc(a.name)} · ${a.type === 'microsoft' ? 'Лицензия' : 'Офлайн'}</span>`
    : '<span class="dot bad"></span><span>Нет аккаунта — нажмите, чтобы войти</span>';
}
$('#accountPill').addEventListener('click', () => accountModal());
$('#accountBtn').addEventListener('click', () => accountModal());

function accountModal(tab = 'ms') {
  const list = state.accounts.list.map((a) => `
    <div class="acc ${a.id === state.accounts.active ? 'active' : ''}" data-id="${esc(a.id)}">
      <img src="${avatarUrl(a)}" alt="" />
      <div class="grow"><b>${esc(a.name)}</b><small class="muted">${a.type === 'microsoft' ? 'Лицензия Microsoft' : 'Без лицензии'}</small></div>
      <button class="btn ghost sm icon danger" data-del="${esc(a.id)}">${icon('trash')}</button>
    </div>`).join('');
  openModal(`
    <div class="modal-cover"></div>
    <h3>Аккаунт</h3>
    <p class="muted">Играйте с лицензией или без неё.</p>
    <div class="seg acc-tabs"><button data-t="ms" class="${tab === 'ms' ? 'active' : ''}">Лицензия</button><button data-t="off" class="${tab === 'off' ? 'active' : ''}">Без лицензии</button></div>
    <div data-pane="ms" ${tab !== 'ms' ? 'hidden' : ''}>
      <button class="btn primary ms-btn" id="msLogin"><span class="ms-logo"><span></span><span></span><span></span><span></span></span>Войти через Microsoft</button>
      <p class="hint">Откроется официальное окно входа Microsoft. Лаунчер хранит только refresh-токен — пароль не сохраняется. Доступны скины, сервера с проверкой лицензии и Realms.</p>
    </div>
    <div data-pane="off" ${tab !== 'off' ? 'hidden' : ''}>
      <label class="field"><span>Никнейм</span><input class="input" id="offName" maxlength="16" placeholder="Steve" /></label>
      <button class="btn primary ms-btn" id="offAdd">${icon('user')}Играть без лицензии</button>
      <p class="hint">Офлайн-режим: одиночная игра и сервера с <b>online-mode=false</b>. 3–16 символов: латиница, цифры, «_».</p>
    </div>
    ${list ? `<div class="acc-list">${list}</div>` : ''}
  `, (m) => {
    $$('.acc-tabs button', m).forEach((b) => b.onclick = () => {
      tab = b.dataset.t;
      $$('.acc-tabs button', m).forEach((x) => x.classList.toggle('active', x === b));
      $$('[data-pane]', m).forEach((p) => (p.hidden = p.dataset.pane !== b.dataset.t));
      if (b.dataset.t === 'off') $('#offName', m).focus();
    });
    $('#msLogin', m).onclick = async (e) => {
      e.currentTarget.disabled = true;
      const r = await safe(() => api.accounts.microsoft(), 'Вход не выполнен: ');
      e.currentTarget.disabled = false;
      if (r) { state.accounts = r; renderAccount(); closeModal(); toast(`Добро пожаловать, ${activeAccount().name}!`); }
    };
    const addOff = async () => {
      const r = await safe(() => api.accounts.offline($('#offName', m).value));
      if (r) { state.accounts = r; renderAccount(); closeModal(); toast(`Офлайн-аккаунт ${activeAccount().name} добавлен`); }
    };
    $('#offAdd', m).onclick = addOff;
    $('#offName', m).addEventListener('keydown', (e) => { if (e.key === 'Enter') addOff(); });
    $$('.acc', m).forEach((el) => el.onclick = async (e) => {
      const del = e.target.closest('[data-del]');
      const r = del ? await safe(() => api.accounts.remove(del.dataset.del)) : await safe(() => api.accounts.select(el.dataset.id));
      if (r) { state.accounts = r; renderAccount(); accountModal(tab); }
    });
  });
}

/* ---------------- сборки ---------------- */
function setCurrent(id) {
  state.current = state.instances.find((i) => i.id === id) || state.instances[0] || null;
  const i = state.current;
  $('#pickIcon').outerHTML = i ? instIcon(i).replace('class="inst-icon', 'id="pickIcon" class="inst-icon') : '<span class="inst-icon" id="pickIcon"></span>';
  $('#pickName').textContent = i ? i.name : 'Нет сборок';
  $('#pickSub').textContent = i ? instSub(i) : 'Создайте первую сборку';
  if (i && state.settings.lastInstance !== i.id) { state.settings.lastInstance = i.id; api.settings.set({ lastInstance: i.id }); }
}

async function loadInstances() {
  state.instances = (await safe(() => api.instances.list())) || [];
  setCurrent(state.current?.id || state.settings.lastInstance);
}

$('#instancePicker').addEventListener('click', () => {
  openModal(`
    <h3>Выбор сборки</h3>
    <div class="pick-list">${state.instances.map((i) => `
      <button class="pick-item ${i.id === state.current?.id ? 'active' : ''}" data-id="${i.id}">
        ${instIcon(i)}<span class="inst-meta"><b>${esc(i.name)}</b><small>${esc(instSub(i))}</small></span>
      </button>`).join('')}
    </div>
    <div class="modal-actions"><button class="btn ghost" id="pickNew">${icon('plus')}Новая сборка</button></div>
  `, (m) => {
    $$('.pick-item', m).forEach((b) => b.onclick = () => { setCurrent(b.dataset.id); closeModal(); });
    $('#pickNew', m).onclick = () => instanceModal();
  });
});

function renderInstances() {
  const g = $('#instGrid');
  g.innerHTML = state.instances.map((i) => `
    <div class="inst-card glass ${i.id === state.current?.id ? 'selected' : ''}" data-id="${i.id}">
      <div class="inst-cover ${i.loader}"></div>
      <div class="inst-body">
        <div class="inst-top">${instIcon(i)}
          <div style="min-width:0;flex:1"><b>${esc(i.name)}</b>
            <div class="inst-tags"><span class="badge red">${LOADERS[i.loader]}</span><span class="badge">${esc(i.mc)}</span></div>
          </div>
        </div>
        <div class="inst-foot">
          <span>${i.playtime ? 'Сыграно ' + fmtTime(i.playtime) : 'Ещё не запускалась'}</span>
          <div class="row">
            <button class="btn ghost sm icon" data-act="folder" data-tip="Папка">${icon('folder')}</button>
            <button class="btn ghost sm icon" data-act="edit" data-tip="Изменить">${icon('edit')}</button>
            <button class="btn ghost sm icon danger" data-act="del" data-tip="Удалить">${icon('trash')}</button>
            <button class="btn primary sm" data-act="play">${icon('play')}Играть</button>
          </div>
        </div>
      </div>
    </div>`).join('') || `<div class="empty inst-empty"><b>Пока нет сборок</b>Нажмите «Новая сборка», чтобы выбрать версию и модлоадер.</div>`;
  hydrateIcons(g);
  $$('.inst-card[data-id]', g).forEach((card) => card.addEventListener('click', async (e) => {
    const id = card.dataset.id;
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'folder') return api.instances.folder(id);
    if (act === 'edit') return instanceModal(state.instances.find((x) => x.id === id));
    if (act === 'del') return confirmModal('Удалить сборку?', 'Папка сборки (миры, моды, настройки) будет удалена безвозвратно.', async () => {
      await safe(() => api.instances.remove(id)); await loadInstances(); renderInstances(); toast('Сборка удалена');
    });
    setCurrent(id); renderInstances();
    if (act === 'play') { go('home'); play(); }
  }));
}
$('#newInstanceBtn').addEventListener('click', () => instanceModal());

function confirmModal(title, text, onYes) {
  openModal(`<h3>${esc(title)}</h3><p class="muted">${esc(text)}</p>
    <div class="modal-actions"><button class="btn ghost" id="cNo">Отмена</button><button class="btn primary" id="cYes">Подтвердить</button></div>`, (m) => {
    $('#cNo', m).onclick = closeModal;
    $('#cYes', m).onclick = async () => { closeModal(); await onYes(); };
  });
}

async function instanceModal(edit = null) {
  if (!state.mc) state.mc = await safe(() => api.versions.mc());
  if (!state.mc) return;
  const f = { name: edit?.name || '', mc: edit?.mc || state.mc.latest.release, loader: edit?.loader || 'vanilla', loaderVersion: edit?.loaderVersion || '', snapshots: false, memoryMax: edit?.memoryMax || '' };
  // сборка на снапшоте/старой версии — сразу показываем все версии, иначе версия молча сменится на релиз
  f.snapshots = Boolean(edit && state.mc.versions.find((v) => v.id === edit.mc)?.type !== 'release');

  openModal(`
    <h3>${edit ? 'Изменить сборку' : 'Новая сборка'}</h3>
    <p class="muted">Каждая сборка хранит свои миры, моды и настройки.</p>
    <label class="field"><span>Название</span><input class="input" id="iName" placeholder="Моя сборка" value="${esc(f.name)}" /></label>
    <div class="field"><span>Модлоадер</span>
      <div class="loader-grid">${Object.entries(LOADERS).map(([k, v]) => `
        <button class="loader-opt ${f.loader === k ? 'active' : ''}" data-l="${k}"><span class="inst-icon ${k}">${LOADER_ABBR[k]}</span>${v}</button>`).join('')}
      </div>
    </div>
    <label class="field"><span>Версия Minecraft</span><select class="select" id="iMc"></select></label>
    <label class="check-row"><input type="checkbox" id="iSnap" ${f.snapshots ? 'checked' : ''} /> Показывать снапшоты и старые бета-версии</label>
    <label class="field" id="iLvWrap"><span>Версия загрузчика</span><select class="select" id="iLv"></select></label>
    <label class="field"><span>ОЗУ для сборки, МБ (пусто — из настроек)</span><input class="input" id="iMem" type="number" step="256" placeholder="${state.settings.memoryMax}" value="${esc(f.memoryMax)}" /></label>
    <div class="modal-actions"><button class="btn ghost" id="iCancel">Отмена</button><button class="btn primary" id="iSave">${edit ? 'Сохранить' : 'Создать'}</button></div>
  `, (m) => {
    const fillMc = () => {
      const vs = state.mc.versions.filter((v) => f.snapshots || v.type === 'release');
      $('#iMc', m).innerHTML = vs.map((v) => `<option value="${v.id}" ${v.id === f.mc ? 'selected' : ''}>${v.id}${v.type !== 'release' ? ' · ' + v.type : ''}</option>`).join('');
      f.mc = $('#iMc', m).value;
    };
    const fillLv = async () => {
      const wrap = $('#iLvWrap', m);
      wrap.hidden = f.loader === 'vanilla';
      if (f.loader === 'vanilla') return;
      const sel = $('#iLv', m);
      sel.innerHTML = '<option>Загрузка…</option>'; sel.disabled = true;
      const list = (await safe(() => api.versions.loaders(f.loader, f.mc))) || [];
      sel.disabled = false;
      if (!list.length) { sel.innerHTML = `<option value="">${LOADERS[f.loader]} не поддерживает ${f.mc}</option>`; f.loaderVersion = ''; return; }
      sel.innerHTML = '<option value="">Рекомендуемая</option>' + list.slice(0, 60).map((l) => `<option value="${l.id}" ${l.id === f.loaderVersion ? 'selected' : ''}>${l.id}${l.stable ? '' : ' · beta'}</option>`).join('');
      f.loaderVersion = sel.value;
    };
    fillMc(); fillLv();
    $('#iSnap', m).onchange = (e) => { f.snapshots = e.target.checked; fillMc(); fillLv(); };
    $('#iMc', m).onchange = (e) => { f.mc = e.target.value; f.loaderVersion = ''; fillLv(); };
    $('#iLv', m).onchange = (e) => { f.loaderVersion = e.target.value; };
    $$('.loader-opt', m).forEach((b) => b.onclick = () => {
      f.loader = b.dataset.l; f.loaderVersion = '';
      $$('.loader-opt', m).forEach((x) => x.classList.toggle('active', x === b)); fillLv();
    });
    $('#iCancel', m).onclick = closeModal;
    $('#iSave', m).onclick = async () => {
      if (f.loader !== 'vanilla' && $('#iLv', m).options.length === 1 && !$('#iLv', m).value && /не поддерживает/.test($('#iLv', m).textContent)) {
        return toast(`${LOADERS[f.loader]} недоступен для ${f.mc}`, 'err');
      }
      const data = { name: $('#iName', m).value, mc: f.mc, loader: f.loader, loaderVersion: f.loaderVersion || null, memoryMax: Number($('#iMem', m).value) || null };
      const r = edit ? await safe(() => api.instances.update(edit.id, data)) : await safe(() => api.instances.create(data));
      if (!r) return;
      closeModal(); await loadInstances(); setCurrent(r.id); renderInstances();
      toast(edit ? 'Сборка сохранена' : `Сборка «${r.name}» создана`);
    };
  });
}

/* ---------------- запуск ---------------- */
const TASKS = { assets: 'ресурсы игры', 'assets-copy': 'ресурсы игры', natives: 'нативные библиотеки', classes: 'библиотеки', 'version-jar': 'клиент' };
const STAGES = { auth: 'Авторизация', meta: 'Метаданные', java: 'Загрузка Java', loader: 'Модлоадер', download: 'Загрузка файлов', started: 'Запуск', running: 'В игре' };
function setProgress(task, loaded, total) {
  $('#progress').classList.add('show');
  $('#progTask').textContent = task;
  const bar = $('.progress-bar');
  if (total > 0) {
    const p = Math.min(100, Math.round((loaded / total) * 100));
    bar.classList.remove('indet'); $('#progFill').style.width = p + '%'; $('#progPct').textContent = p + '%';
  } else { bar.classList.add('indet'); $('#progPct').textContent = ''; }
}
function setPlayState(s) {
  const b = $('#playBtn');
  b.classList.toggle('busy', s === 'busy'); b.classList.toggle('running', s === 'running');
  $('.play-label', b).textContent = s === 'busy' ? 'Загрузка' : s === 'running' ? 'Закрыть' : 'Играть';
  state.busy = s === 'busy'; state.running = s === 'running';
}
const log = (line) => { const pre = $('#consoleLog'); pre.textContent += line.endsWith('\n') ? line : line + '\n'; if (pre.textContent.length > 200000) pre.textContent = pre.textContent.slice(-150000); pre.scrollTop = pre.scrollHeight; };

async function play(server = null) {
  if (state.running) return api.game.stop();
  if (state.busy) return;
  if (!activeAccount()) return accountModal();
  if (!state.current) return instanceModal();
  setPlayState('busy');
  setProgress('Подготовка…', 0, 0);
  $('#consoleLog').textContent = '';
  if (state.settings.showConsole) $('#console').classList.add('show');
  const ok = await safe(() => api.game.launch(state.current.id, server), 'Ошибка запуска: ');
  if (!ok) { setPlayState('idle'); $('#progress').classList.remove('show'); }
}
$('#playBtn').addEventListener('click', () => play());
$('#stopGame').addEventListener('click', () => api.game.stop());
$('#closeConsole').addEventListener('click', () => $('#console').classList.remove('show'));

api.game.onEvent((e) => {
  if (e.log) return log(e.log);
  if (e.stage === 'closed') {
    setPlayState('idle'); $('#progress').classList.remove('show'); api.win.show();
    if (e.code && e.code !== 0) { toast(`Игра завершилась с кодом ${e.code}`, 'err'); $('#console').classList.add('show'); }
    loadInstances();
    return;
  }
  if (e.stage === 'started' || e.stage === 'running') {
    setPlayState('running'); setProgress(STAGES.running, 1, 1);
    setTimeout(() => state.running && $('#progress').classList.remove('show'), 2500);
    return;
  }
  const task = TASKS[e.task] || e.task;
  const label = task ? `${STAGES[e.stage] || ''}${STAGES[e.stage] ? ' · ' : ''}${task}` : STAGES[e.stage];
  setProgress(label, e.loaded || 0, e.total || 0);
});

/* ---------------- онлайн (nlauncher.ru/stats) ---------------- */
async function refreshOnline() {
  const o = await api.online().catch(() => null);
  const pill = $('#onlinePill');
  if (!o || (o.launcherOnline == null && !o.serversOnline)) { pill.hidden = true; return; }
  const parts = [];
  if (o.launcherOnline != null) parts.push(`${o.launcherOnline.toLocaleString('ru-RU')} в NLauncher`);
  if (o.serversOnline) parts.push(`${o.serversOnline.toLocaleString('ru-RU')} на серверах`);
  $('span:last-child', pill).textContent = parts.join(' · ') + (o.demo ? ' · демо' : '');
  pill.hidden = false;
  pill.title = o.demo ? 'Демо-цифры: лаунчер запущен с --demo-stats' : 'Онлайн по данным nlauncher.ru';
}

/* ---------------- лента сайта / мониторинг ---------------- */
function newerVersion(a, b) {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}
async function loadFeed() {
  state.feed = await safe(() => api.feed());
  const f = state.feed; if (!f) return;
  const b = f.banner || {};
  $('#adTitle').textContent = b.title || '';
  $('#adText').textContent = b.text || '';
  $('#adCta').firstChild.textContent = (b.cta || 'Подробнее') + ' ';
  if (b.image) $('#adBanner').style.backgroundImage = `linear-gradient(160deg, rgba(10,4,6,.3), rgba(10,4,6,.85)), url("${encodeURI(b.image)}")`;
  $('#adBanner').onclick = () => b.url && api.openUrl(b.url);
  $('#newsList').innerHTML = (f.news || []).map((n) => `
    <div class="news-item" ${n.url ? `data-url="${esc(n.url)}"` : ''}><small>${esc(n.date || '')}</small><b>${esc(n.title)}</b>${n.text ? `<p>${esc(n.text)}</p>` : ''}</div>`).join('') || '<p class="muted">Пока пусто</p>';
  $$('#newsList [data-url]').forEach((el) => el.onclick = () => api.openUrl(el.dataset.url));
  renderHomeServers();
  // новая версия лаунчера на сайте → кнопка «Доступно обновление»
  const up = f.launcher;
  if (up && up.version && up.url && newerVersion(up.version, state.info.version)) {
    const pill = $('#updatePill');
    $('span', pill).textContent = `Доступна версия ${up.version}`;
    pill.hidden = false;
    pill.onclick = () => api.openUrl(up.url);
  }
}

function allServers() {
  const promoted = (state.feed?.promoted || []).map((s) => ({ ...s, ad: true, group: 'promo' }));
  // топ берём с сайта мониторинга (feed.top), если он подключён; иначе — из config.json
  const featured = ((state.feed?.top?.length ? state.feed.top : state.info?.config.featuredServers) || []).map((s) => ({ ...s, group: 'top' }));
  const mine = (state.settings.servers || []).map((s) => ({ ...s, group: 'mine' }));
  return { promoted, featured, mine };
}

const pingCache = new Map();
function serverCard(s, opts = {}) {
  const id = 'srv-' + Math.random().toString(36).slice(2, 9);
  setTimeout(async () => {
    let r = pingCache.get(s.address);
    if (!r || Date.now() - r.t > 60000) { r = { t: Date.now(), v: await api.servers.ping(s.address).catch(() => ({ online: false })) }; pingCache.set(s.address, r); }
    const el = document.getElementById(id); if (!el) return;
    const v = r.v;
    if (v.favicon) $('.srv-icon', el).style.backgroundImage = `url("${v.favicon}")`;
    $('.srv-stats', el).innerHTML = v.online
      ? `<span class="row" style="gap:6px"><span class="dot ok"></span>${fmtNum(v.players)} / ${fmtNum(v.max)}</span><span>${v.ping} мс</span><span class="ver">${esc((v.version || '').slice(0, 22))}</span>`
      : '<span class="row" style="gap:6px"><span class="dot bad"></span>Оффлайн</span>';
    if (v.motd && !s.desc) $('.srv-body small', el).textContent = v.motd.replace(/\s+/g, ' ').trim();
  });
  return `
    <div class="srv glass ${s.ad ? 'ad' : ''}" id="${id}" data-addr="${esc(s.address)}">
      <div class="srv-icon"></div>
      <div class="srv-body">
        <b><span class="srv-name">${esc(s.name || s.address)}</span>${s.ad ? '<span class="badge gold">PROMO</span>' : s.tag ? `<span class="badge">${esc(s.tag)}</span>` : ''}</b>
        <small>${esc(s.desc || s.address)}</small>
        <div class="srv-stats"><span class="row" style="gap:6px"><span class="dot"></span>Проверка…</span></div>
      </div>
      <div class="srv-actions">
        <button class="btn ghost sm icon" data-a="copy" data-tip="Копировать IP">${icon('copy')}</button>
        ${opts.removable ? `<button class="btn ghost sm icon danger" data-a="rm">${icon('trash')}</button>` : ''}
        <button class="btn primary sm icon" data-a="join" data-tip="Подключиться">${icon('play')}</button>
      </div>
    </div>`;
}
function bindServers(root) {
  hydrateIcons(root);
  $$('.srv', root).forEach((el) => el.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a; const addr = el.dataset.addr;
    if (a === 'copy') { api.copy(addr); toast(`IP скопирован: ${addr}`); }
    if (a === 'rm') {
      state.settings.servers = state.settings.servers.filter((s) => s.address !== addr);
      await api.settings.set({ servers: state.settings.servers }); renderServers(); renderHomeServers();
    }
    if (a === 'join') { go('home'); play(addr); }
  }));
}
function renderHomeServers() {
  const { promoted, featured, mine } = allServers();
  const list = [...promoted, ...featured, ...mine].slice(0, 4);
  $('#homeServers').innerHTML = list.length
    ? list.map((s) => serverCard(s)).join('')
    : `<div class="strip-empty glass">Топ серверов появится здесь, когда заработает сайт мониторинга. Свои сервера можно добавить во вкладке <button class="link" data-goto="servers">Сервера ${icon('arrow')}</button></div>`;
  bindServers($('#homeServers'));
}
function renderServers() {
  const { promoted, featured, mine } = allServers();
  const sec = (t, arr, o) => (arr.length ? `<div class="section-label">${t}</div>${arr.map((s) => serverCard(s, o)).join('')}` : '');
  $('#serverGrid').innerHTML =
    sec('Продвижение', promoted) + sec('Топ мониторинга', featured) +
    (mine.length ? sec('Мои сервера', mine, { removable: true }) : '<div class="section-label">Мои сервера</div><p class="muted" style="grid-column:1/-1">Добавьте адрес сервера сверху — он появится здесь.</p>');
  bindServers($('#serverGrid'));
}
async function addServer() {
  const addr = $('#serverAddr').value.trim();
  if (!/^[\w.-]+(:\d+)?$/.test(addr)) return toast('Введите адрес вида play.server.ru:25565', 'err');
  if ((state.settings.servers || []).some((s) => s.address === addr)) return toast('Сервер уже добавлен', 'warn');
  state.settings.servers = [...(state.settings.servers || []), { name: addr.split(':')[0], address: addr }];
  await api.settings.set({ servers: state.settings.servers });
  $('#serverAddr').value = ''; renderServers(); renderHomeServers(); toast('Сервер добавлен');
}
$('#addServerBtn').addEventListener('click', addServer);
$('#serverAddr').addEventListener('keydown', (e) => e.key === 'Enter' && addServer());

/* ---------------- моды ---------------- */
function bindSeg(sel, key, after) {
  $$(`${sel} button`).forEach((b) => b.addEventListener('click', () => {
    $$(`${sel} button`).forEach((x) => x.classList.toggle('active', x === b));
    state.mods[key] = b.dataset.v; state.mods.offset = 0; after();
  }));
}
bindSeg('#modsTab', 'tab', () => renderMods());
bindSeg('#modsType', 'type', () => renderMods());
let qTimer;
$('#modsQuery').addEventListener('input', (e) => { clearTimeout(qTimer); qTimer = setTimeout(() => { state.mods.query = e.target.value; state.mods.offset = 0; renderMods(); }, 350); });
$('#modsInstance').addEventListener('change', (e) => { state.mods.instance = e.target.value; renderMods(); });
$('#modsFolderBtn').addEventListener('click', () => state.mods.instance && api.mods.folder(state.mods.instance, state.mods.type));

let modsReq = 0;
async function renderMods(append = false) {
  const sel = $('#modsInstance');
  if (!state.mods.instance || !state.instances.some((i) => i.id === state.mods.instance)) state.mods.instance = state.current?.id;
  // версию дописываем, только если её нет в названии сборки (иначе «Fabric 1.21.1 — Fabric 1.21.1»)
  const label = (i) => (i.name.includes(i.mc) ? i.name : `${i.name} · ${LOADERS[i.loader]} ${i.mc}`);
  sel.innerHTML = state.instances.map((i) => `<option value="${i.id}" ${i.id === state.mods.instance ? 'selected' : ''}>${esc(label(i))}</option>`).join('');
  const list = $('#modList');
  const inst = state.instances.find((i) => i.id === state.mods.instance);
  if (!inst) { list.innerHTML = '<div class="empty"><b>Нет сборок</b>Создайте сборку, чтобы ставить моды.</div>'; return; }
  const { tab, type, query } = state.mods;
  $('#modsQuery').closest('.search').style.display = tab === 'browse' ? '' : 'none';

  if (tab === 'browse' && type === 'mod' && inst.loader === 'vanilla') {
    list.innerHTML = `<div class="empty"><b>Ванильная сборка</b>Для модов нужна сборка на Fabric, Quilt или Forge.<br/><br/><button class="btn primary" data-goto="instances">${icon('plus')}Создать сборку с модлоадером</button></div>`;
    hydrateIcons(list); return;
  }

  const req = ++modsReq;
  if (!append) list.innerHTML = Array.from({ length: 6 }, () => '<div class="skeleton"></div>').join('');

  if (tab === 'installed') {
    const files = (await safe(() => api.mods.local(inst.id, type))) || [];
    if (req !== modsReq) return;
    list.innerHTML = files.length ? files.map((f, n) => `
      <div class="mod glass ${f.enabled ? '' : 'off'}" style="animation-delay:${n * 25}ms" data-file="${esc(f.file)}">
        <div class="mod-ph">${icon('puzzle')}</div>
        <div class="mod-body"><b>${esc(f.name)}</b><p>${(f.size / 1024 / 1024).toFixed(2)} МБ</p></div>
        ${type === 'mod' ? `<label class="switch" data-tip="${f.enabled ? 'Выключить' : 'Включить'}"><input type="checkbox" ${f.enabled ? 'checked' : ''} data-a="toggle" /><span></span></label>` : ''}
        <button class="btn ghost sm icon danger" data-a="rm">${icon('trash')}</button>
      </div>`).join('') : '<div class="empty"><b>Пока пусто</b>Найдите что-нибудь в каталоге.</div>';
    hydrateIcons(list);
    $$('.mod', list).forEach((el) => {
      el.querySelector('[data-a="toggle"]')?.addEventListener('change', async () => { await safe(() => api.mods.toggle(inst.id, el.dataset.file, type)); renderMods(); });
      el.querySelector('[data-a="rm"]').addEventListener('click', async () => { await safe(() => api.mods.remove(inst.id, el.dataset.file, type)); renderMods(); toast('Удалено'); });
    });
    return;
  }

  const r = await safe(() => api.mods.search({ query, instanceId: inst.id, type, offset: state.mods.offset, sort: query ? 'relevance' : 'downloads' }));
  if (req !== modsReq) return;
  if (!r) { list.innerHTML = '<div class="empty"><b>Нет соединения</b>Не удалось загрузить каталог Modrinth.</div>'; return; }
  const installed = new Set(((await safe(() => api.mods.local(inst.id, type))) || []).map((f) => f.name.toLowerCase()));
  const html = r.hits.map((h, n) => {
    const has = [...installed].some((f) => f.includes(h.slug.toLowerCase()));
    return `
    <div class="mod glass" style="animation-delay:${n * 25}ms">
      ${h.icon ? `<img src="${esc(h.icon)}" alt="" loading="lazy" />` : `<div class="mod-ph">${icon('puzzle')}</div>`}
      <div class="mod-body">
        <b>${esc(h.title)}<small>от ${esc(h.author)}</small></b>
        <p>${esc(h.description)}</p>
        <div class="mod-meta"><span class="badge">${icon('download').replace('data-icon', 'style="width:12px;height:12px;margin-right:4px" data-icon')}${fmtNum(h.downloads)}</span>${(h.categories || []).slice(0, 3).map((c) => `<span class="badge">${esc(c)}</span>`).join('')}</div>
      </div>
      <button class="btn ${has ? 'ghost' : 'primary'} sm" data-id="${h.id}" ${has ? 'disabled' : ''}>${icon(has ? 'check' : 'download')}${has ? 'Установлен' : 'Установить'}</button>
    </div>`;
  }).join('');
  if (append) { list.querySelector('.more')?.remove(); list.insertAdjacentHTML('beforeend', html); } else list.innerHTML = html || '<div class="empty"><b>Ничего не найдено</b>Попробуйте другой запрос.</div>';
  if (r.total > state.mods.offset + 20) list.insertAdjacentHTML('beforeend', '<button class="btn ghost more" style="align-self:center;margin-top:8px">Показать ещё</button>');
  hydrateIcons(list);
  list.querySelector('.more')?.addEventListener('click', () => { state.mods.offset += 20; renderMods(true); });
  $$('button[data-id]', list).forEach((b) => !b.dataset.bound && (b.dataset.bound = 1) && b.addEventListener('click', async () => {
    b.disabled = true; b.innerHTML = 'Загрузка…';
    const files = await safe(() => api.mods.install({ projectId: b.dataset.id, instanceId: inst.id, type }), 'Не удалось установить: ');
    if (files) { b.className = 'btn ghost sm'; b.innerHTML = `${icon('check')}Установлен`; hydrateIcons(b); toast(files.length > 1 ? `Установлено: ${files.length} файла (с зависимостями)` : 'Установлено'); }
    else { b.disabled = false; b.innerHTML = `${icon('download')}Установить`; hydrateIcons(b); }
  }));
}
api.mods.onProgress(() => {});

/* ---------------- настройки ---------------- */
function bindSettings() {
  const s = state.settings;
  const mem = $('#sMem');
  mem.max = Math.max(2048, Math.floor(state.info.totalMemory * 0.85 / 256) * 256);
  mem.value = s.memoryMax;
  const memOut = () => { $('#sMemOut').textContent = (mem.value / 1024).toFixed(1) + ' ГБ'; mem.style.setProperty('--p', ((mem.value - mem.min) / (mem.max - mem.min)) * 100 + '%'); };
  memOut();
  $('#ramHint').textContent = `Всего в системе: ${(state.info.totalMemory / 1024).toFixed(1)} ГБ · рекомендуется 4–8 ГБ`;
  mem.oninput = memOut;
  mem.onchange = () => save({ memoryMax: Number(mem.value) });

  const bindChk = (id, key, after) => { const el = $(id); el.checked = !!s[key]; el.onchange = () => { save({ [key]: el.checked }); after && after(el.checked); }; };
  const bindTxt = (id, key, num) => {
    const el = $(id); el.value = s[key] ?? '';
    el.onchange = () => {
      if (num) {
        const n = Math.round(Number(el.value));
        if (!(n >= 100 && n <= 10000)) { el.value = s[key]; return toast('Введите число от 100 до 10000', 'warn'); }
        el.value = n;
        return save({ [key]: n });
      }
      save({ [key]: el.value.trim() });
    };
  };
  bindChk('#sAutoJava', 'autoJava', (v) => ($('#sJava').disabled = v)); $('#sJava').disabled = s.autoJava;
  bindTxt('#sJava', 'javaPath'); bindTxt('#sJvm', 'jvmArgs');
  bindTxt('#sW', 'width', true); bindTxt('#sH', 'height', true);
  bindChk('#sFull', 'fullscreen'); bindChk('#sHide', 'closeOnLaunch'); bindChk('#sConsole', 'showConsole');
  bindChk('#sAnim', 'animations', (v) => document.body.classList.toggle('no-anim', !v));
  bindChk('#sStats', 'shareStats');
  bindChk('#sSkinsMod', 'skinsMod');
  $('#rootPath').textContent = state.info.root;
  $('#openRoot').onclick = () => api.openPath(state.info.root);
  $('#about').textContent = `${state.info.config.brand} Launcher v${state.info.version} · ${state.info.platform}`;
}
let saveTimer;
let pendingSave = {};
function save(p) {
  Object.assign(state.settings, p);
  Object.assign(pendingSave, p);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const patch = pendingSave; pendingSave = {};
    safe(() => api.settings.set(patch)).then((r) => r && toast('Настройки сохранены'));
  }, 300);
}

/* ---------------- скин ---------------- */
const skin = { viewer: null, cur: null, pending: null, pendingCape: undefined, pendingCapeImage: null, siteCapes: [], variant: 'classic', busy: false };
const DEFAULT_SKIN = 'assets/default-skin.png';
const SKIN_ANIMS = { idle: () => new skinview3d.IdleAnimation(), walk: () => new skinview3d.WalkingAnimation(), run: () => new skinview3d.RunningAnimation(), wave: () => new skinview3d.WaveAnimation() };

function skinViewer() {
  if (skin.viewer || !window.skinview3d) return skin.viewer;
  const box = $('.skin-stage');
  const v = new skinview3d.SkinViewer({ canvas: $('#skinCanvas'), width: box.clientWidth || 600, height: box.clientHeight || 520 });
  v.fov = 40; v.zoom = 0.78; v.autoRotate = true; v.autoRotateSpeed = 0.5;
  v.animation = SKIN_ANIMS.idle();
  $('#skinCanvas').addEventListener('pointerdown', () => { v.autoRotate = false; });
  new ResizeObserver(() => { if (box.clientWidth) v.setSize(box.clientWidth, box.clientHeight); }).observe(box);
  skin.viewer = v;
  return v;
}
function showSkin(image, variant) {
  const v = skinViewer();
  if (v) v.loadSkin(image || DEFAULT_SKIN, { model: variant === 'slim' ? 'slim' : 'default' });
}
function skinDirty() {
  const changed = Boolean(skin.pending) || Boolean(skin.cur?.skin && skin.variant !== skin.cur.skin.variant)
    || (skin.cur?.type === 'offline' && skin.pendingCape !== undefined && skin.pendingCape !== (skin.cur.cape || null));
  $('#skinSave').disabled = !changed || skin.busy || !['microsoft', 'offline'].includes(skin.cur?.type);
  $('#catSave').disabled = $('#skinSave').disabled;
  $('#skinReset').hidden = !changed;
  $('#skinBadge').hidden = !changed;
}
function setVariant(v) {
  skin.variant = v;
  $$('#skinModel button').forEach((b) => b.classList.toggle('active', b.dataset.v === v));
}

function renderSkinPanels() {
  const c = skin.cur || {};
  const lic = c.type === 'microsoft';
  const host = (state.info.config.site || '').replace(/^https?:\/\//, '') || 'сайте NLauncher';
  $('#skinSub').textContent = c.type === 'none' ? 'Добавьте аккаунт, чтобы менять скин.'
    : `${c.name} · ${lic ? 'лицензия: скин ставится в ваш аккаунт Minecraft' : `без лицензии: скин хранится на ${host}`}`;
  $('#skinSave span').textContent = lic ? 'Установить скин' : 'Сохранить скин';
  $('#skinClear').hidden = !c.skin || c.type === 'none';
  // плащи: лицензия — плащи аккаунта; без лицензии — плащи NLauncher (видят игроки NLauncher)
  const capes = c.capes || [];
  const activeCape = capes.find((x) => x.active);
  if (lic) {
    $('#skinCapes').hidden = !capes.length;
    $('#capeList').innerHTML = [`<button class="cape ${activeCape ? '' : 'active'}" data-cape="">Без плаща</button>`,
      ...capes.map((x) => `<button class="cape ${x.active ? 'active' : ''}" data-cape="${esc(x.id)}">${esc(x.name)}</button>`)].join('');
    $('#capeNote').hidden = true;
  } else if (c.type === 'offline') {
    $('#skinCapes').hidden = !skin.siteCapes.length;
    const cur = skin.pendingCape !== undefined ? skin.pendingCape : c.cape;
    $('#capeList').innerHTML = [`<button class="cape ${cur ? '' : 'active'}" data-cape="">Без плаща</button>`,
      ...skin.siteCapes.map((x) => `<button class="cape ${x.code === cur ? 'active' : ''}" data-cape="${esc(x.code)}">${esc(x.name)}</button>`)].join('');
    $('#capeNote').hidden = false;
  } else $('#skinCapes').hidden = true;
  showCape();
  // как скин попадает на сервера
  $('#skinServer').hidden = c.type === 'none';
  if (lic) {
    $('#skinServerBody').innerHTML = '<p class="muted small">Скин лицензии виден на всех серверах. На серверах без лицензии со <b>SkinsRestorer</b> он подхватится по вашему нику сам.</p>';
  } else if (c.site) {
    $('#skinServerBody').innerHTML = `
      <p class="muted small">На сервере со <b>SkinsRestorer</b> отправьте в чат один раз, и скин увидят все игроки сервера:</p>
      <button class="cmd-copy" id="skinCmd" data-tip="Скопировать"><code>${esc(c.site.command)}</code><i data-icon="copy"></i></button>
      <p class="muted small">Если сервер не разрешает ставить скин по ссылке, ваш скин всё равно увидят игроки NLauncher.</p>
      <div class="row" style="margin-top:10px"><button class="btn ghost sm" id="skinPage"><i data-icon="arrow"></i>Страница скина</button></div>`;
    hydrateIcons($('#skinServerBody'));
    $('#skinCmd').onclick = () => { api.copy(c.site.command); toast('Команда скопирована, вставьте её в чат на сервере'); };
    $('#skinPage').onclick = () => api.openUrl(c.site.page);
  } else if (c.type === 'offline') {
    $('#skinServerBody').innerHTML = '<p class="muted small">Выберите и сохраните скин. Здесь появится команда для серверов со SkinsRestorer, а игроки NLauncher будут видеть ваш скин.</p>';
  }
  skinDirty();
}

/** Плащ на модели: выбранный в каталоге → надетый сейчас */
function showCape() {
  const v = skinViewer(); if (!v) return;
  const c = skin.cur || {};
  const img = c.type === 'microsoft' ? (c.capes || []).find((x) => x.active)?.image
    : skin.pendingCape !== undefined ? skin.pendingCapeImage : c.capeImage;
  v.loadCape(img || null);
}

async function renderSkin() {
  skinViewer();
  skin.pending = null; skin.pendingCape = undefined; skin.pendingCapeImage = null;
  if (!skin.siteCapes.length) safe(() => api.skin.capes()).then((l) => { if (l?.length) { skin.siteCapes = l; renderSkinPanels(); } });
  $('#skinSub').textContent = 'Загружаю скин…';
  const c = await safe(() => api.skin.current(), 'Скин: ');
  skin.cur = c || { type: 'none' };
  setVariant(skin.cur.skin?.variant || 'classic');
  showSkin(skin.cur.skin?.image, skin.variant);
  renderSkinPanels();
}

$('#skinAnims').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b || !skin.viewer) return;
  $$('#skinAnims button').forEach((x) => x.classList.toggle('active', x === b));
  skin.viewer.animation = SKIN_ANIMS[b.dataset.v]();
});
$('#skinModel').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  setVariant(b.dataset.v);
  if (editor?.state.on) editor.set('model', skin.variant === 'slim' ? 'slim' : 'default');
  else showSkin(skin.pending?.image || skin.cur?.skin?.image, skin.variant);
  skinDirty();
});
$('#skinPick').addEventListener('click', async () => {
  const f = await safe(() => api.skin.pick());
  if (!f) return;
  skin.pending = f;
  showSkin(f.image, skin.variant);
  skinDirty();
});
$('#skinReset').addEventListener('click', () => {
  skin.pending = null; skin.pendingCape = undefined; skin.pendingCapeImage = null;
  renderSkinPanels();
  setVariant(skin.cur?.skin?.variant || 'classic');
  showSkin(skin.cur?.skin?.image, skin.variant);
  skinDirty();
});
async function saveSkin() {
  const png = skin.pending?.png || skin.cur?.skin?.image?.split(',')[1];
  if (!png) return toast('Сначала выберите скин', 'warn');
  skin.busy = true; skinDirty();
  const label = $('#skinSave span').textContent; $('#skinSave span').textContent = 'Сохраняю…'; $('#catSave span').textContent = 'Сохраняю…';
  const cape = skin.pendingCape !== undefined ? skin.pendingCape : (skin.cur.cape || null);
  const r = await safe(() => (skin.cur.type === 'microsoft' ? api.skin.mojang(png, skin.variant) : api.skin.site(png, skin.variant, cape)), 'Скин: ');
  skin.busy = false; $('#skinSave span').textContent = label; $('#catSave span').textContent = 'Сохранить';
  if (r) {
    skin.cur = { ...skin.cur, ...r };
    skin.pending = null; skin.pendingCape = undefined; skin.pendingCapeImage = null;
    toast(skin.cur.type === 'microsoft' ? 'Скин установлен, в игре он появится при следующем входе' : 'Скин сохранён');
    setVariant(skin.cur.skin?.variant || skin.variant);
    showSkin(skin.cur.skin?.image, skin.variant);
    renderSkinPanels();
  } else skinDirty();
}
$('#skinSave').addEventListener('click', saveSkin);
$('#catSave').addEventListener('click', saveSkin);
$('#skinClear').addEventListener('click', () => {
  const lic = skin.cur?.type === 'microsoft';
  openModal(`<h3>Сбросить скин?</h3>
    <p class="muted" style="margin:10px 0 18px">${lic ? 'Скин аккаунта вернётся к стандартному. Новый скин можно поставить в любой момент.'
      : 'Скин удалится с сайта, ник освободится, и игроки NLauncher снова будут видеть стандартного персонажа.<br/><br/>На серверах со SkinsRestorer скин хранится на самом сервере — там отправьте в чат <code>/skin clear</code>.'}</p>
    <div class="row" style="justify-content:flex-end"><button class="btn ghost" data-close>Отмена</button><button class="btn primary" id="skinClearOk"><i data-icon="trash"></i>Сбросить</button></div>`, (m) => {
    m.querySelector('[data-close]').onclick = closeModal;
    m.querySelector('#skinClearOk').onclick = async () => {
      closeModal();
      const r = await safe(() => api.skin.reset(), 'Скин: ');
      if (!r) return;
      skin.cur = r; skin.pending = null;
      setVariant(r.skin?.variant || 'classic');
      showSkin(r.skin?.image, skin.variant);
      renderSkinPanels();
      if (!lic) { api.copy('/skin clear'); toast('Скин сброшен. Команда /skin clear скопирована для серверов со SkinsRestorer'); } else toast('Скин сброшен на стандартный');
    };
  });
});
/* ---------- редактор скина ---------- */
const PALETTE = ['#f2e9ea', '#1b1416', '#d6aa8c', '#b07a5a', '#6b4430', '#3a221e', '#c4747c', '#a3454f', '#5b232a', '#6f8fbf', '#3d5a8a', '#6fbf8e', '#2f7a4c', '#d6a764', '#8a6a3a', '#9b8f91'];
let editor = null;
function edSync() {
  const s = editor.state;
  $$('#edTools [data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === s.tool));
  $$('#edTools [data-size]').forEach((b) => b.classList.toggle('active', Number(b.dataset.size) === s.size));
  $$('#edLayer button').forEach((b) => b.classList.toggle('active', b.dataset.v === s.layer));
  $('#edUndo').disabled = !s.canUndo; $('#edRedo').disabled = !s.canRedo;
  $('#edColor').value = s.color; $('#edColorHex').textContent = s.color;
  $$('#edPalette button').forEach((b) => b.classList.toggle('active', b.dataset.c === s.color));
}
function setEditMode(on) {
  $$('#skinMode button').forEach((b) => b.classList.toggle('active', b.dataset.v === (on ? 'edit' : 'view')));
  ['#edTools', '#edViews', '#edHint', '#edPanel'].forEach((s) => ($(s).hidden = !on));
  $('#skinAnims').hidden = on;
  $$('.skin-side > .set-card:not(#edPanel)').forEach((c) => c.classList.toggle('ed-hidden', on));
  if (!on && skin.viewer) {
    editor?.stop();
    $$('#skinAnims button').forEach((x) => x.classList.toggle('active', x.dataset.v === 'idle'));
    skin.viewer.animation = SKIN_ANIMS.idle(); skin.viewer.autoRotate = true;
    $$('#edParts button').forEach((b) => b.classList.add('active'));
  }
}
async function enterEditor(fromTemplate) {
  const v = skinViewer(); if (!v) return;
  if (!editor) {
    editor = SkinEditor.create(v);
    editor.onChange((e) => { if (e.warn) toast(e.warn, 'warn'); edSync(); });
    $('#edPalette').innerHTML = PALETTE.map((c) => `<button data-c="${c}" style="background:${c}" data-tip="${c}"></button>`).join('');
  }
  setEditMode(true);
  const src = fromTemplate ? DEFAULT_SKIN : (skin.pending?.image || skin.cur?.skin?.image || DEFAULT_SKIN);
  await editor.start(src, skin.variant === 'slim' ? 'slim' : 'default');
  editor.set('grid', $('#edGrid').checked); editor.set('mirror', $('#edMirror').checked);
  edSync();
}
$('#skinMode').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.v !== 'catalog' && cat.on) setCatalogMode(false);
  if (b.dataset.v === 'edit' && !editor?.state.on) enterEditor(false);
  if (b.dataset.v === 'view' && editor?.state.on) leaveEditor(false);
  if (b.dataset.v === 'catalog' && !cat.on) { if (editor?.state.on) leaveEditor(false); setCatalogMode(true); }
});

/* ---------- каталог скинов с сайта ---------- */
const cat = { on: false, cat: '', style: '', page: 1, pages: 1, items: [], loading: false, picked: null };
function setCatalogMode(on) {
  cat.on = on;
  $$('#skinMode button').forEach((b) => b.classList.toggle('active', b.dataset.v === (on ? 'catalog' : 'view')));
  $('#catPanel').hidden = !on;
  $$('.skin-side > .set-card:not(#catPanel)').forEach((c) => c.classList.toggle('ed-hidden', on));
  if (on && !cat.items.length) loadCatalog(true);
}
// 2D-превью персонажа спереди прямо из PNG (как на сайте)
function drawFront(c, img, slim) {
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.clearRect(0, 0, 16, 32);
  const aw = slim ? 3 : 4, old = img.height === 32;
  const p = (sx, sy, w, h, dx, dy) => x.drawImage(img, sx, sy, w, h, dx, dy, w, h);
  p(8, 8, 8, 8, 4, 0); p(20, 20, 8, 12, 4, 8); p(44, 20, aw, 12, 4 - aw, 8); p(4, 20, 4, 12, 4, 20);
  if (old) { p(44, 20, aw, 12, 12, 8); p(4, 20, 4, 12, 8, 20); } else { p(36, 52, aw, 12, 12, 8); p(20, 52, 4, 12, 8, 20); }
  p(40, 8, 8, 8, 4, 0);
  if (!old) { p(20, 36, 8, 12, 4, 8); p(44, 36, aw, 12, 4 - aw, 8); p(52, 52, aw, 12, 12, 8); p(4, 36, 4, 12, 4, 20); p(4, 52, 4, 12, 8, 20); }
}
async function loadCatalog(reset) {
  if (cat.loading) return;
  if (reset) { cat.page = 1; cat.items = []; $('#catGrid').innerHTML = '<div class="cat-empty muted small">Загружаю каталог…</div>'; }
  cat.loading = true;
  const r = await safe(() => api.skin.catalog({ cat: cat.cat, style: cat.style, page: cat.page }), 'Каталог: ');
  cat.loading = false;
  if (!r) { if (reset) $('#catGrid').innerHTML = '<div class="cat-empty muted small">Не удалось загрузить каталог. Проверьте интернет.</div>'; return; }
  cat.pages = r.pages; cat.items.push(...r.items);
  renderCatalog();
}
function renderCatalog() {
  const g = $('#catGrid');
  if (!cat.items.length) { g.innerHTML = '<div class="cat-empty muted small">Здесь пока пусто</div>'; return; }
  g.innerHTML = cat.items.map((it) => `<button class="cat-tile ${cat.picked?.id === it.id ? 'active' : ''}" data-id="${it.id}" data-tip="${esc(it.title)}">
      <canvas width="16" height="32" data-src="${esc(it.url)}" data-slim="${it.variant === 'slim' ? 1 : ''}"></canvas>${it.cape ? '<i class="cat-cape"></i>' : ''}</button>`).join('')
    + (cat.page < cat.pages ? '<button class="btn ghost sm cat-more" id="catMore">Показать ещё</button>' : '');
  g.querySelectorAll('canvas[data-src]').forEach((c) => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => { drawFront(c, img, c.dataset.slim === '1'); c.classList.add('ready'); };
    img.src = c.dataset.src;
  });
  $('#catMore')?.addEventListener('click', () => { cat.page++; loadCatalog(false); });
}
// скин любого игрока по нику
$('#catSearch').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nick = $('#catNick').value.trim();
  if (!nick) return loadCatalog(true);
  if (!/^[A-Za-z0-9_]{2,16}$/.test(nick)) return toast('Ник: латиница, цифры и _, до 16 символов', 'warn');
  $$('#catCats button').forEach((x) => x.classList.remove('active'));
  $('#catGrid').innerHTML = '<div class="cat-empty muted small">Ищу скин игрока…</div>';
  const r = await safe(() => api.skin.lookup(nick));
  cat.items = r ? [{ id: `n:${r.nick}`, title: `${r.nick} · ${r.sourceName}`, url: r.url, variant: r.variant, cape: null, capeUrl: null }] : [];
  cat.page = 1; cat.pages = 1;
  if (r) renderCatalog();
  else $('#catGrid').innerHTML = `<div class="cat-empty muted small">У игрока «${esc(nick)}» нет своего скина или ник не найден</div>`;
});
$('#catCats').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  $('#catNick').value = '';
  $$('#catCats button').forEach((x) => x.classList.toggle('active', x === b));
  cat.cat = b.dataset.v; loadCatalog(true);
});

$('#catGrid').addEventListener('click', async (e) => {
  const b = e.target.closest('.cat-tile'); if (!b) return;
  const it = cat.items.find((x) => String(x.id) === b.dataset.id); if (!it) return;
  const lic = skin.cur?.type === 'microsoft';
  $('#catPicked').textContent = 'Загружаю…';
  const f = await safe(() => api.skin.catalogGet(it.url, lic ? null : it.capeUrl), 'Скин: ');
  if (!f) { $('#catPicked').textContent = ''; return; }
  cat.picked = it;
  $$('#catGrid .cat-tile').forEach((x) => x.classList.toggle('active', x === b));
  skin.pending = { image: f.image, png: f.png };
  if (!lic) { skin.pendingCape = it.cape || null; skin.pendingCapeImage = f.capeImage; }
  setVariant(it.variant === 'slim' ? 'slim' : 'classic');
  showSkin(f.image, skin.variant); showCape();
  $('#catPicked').textContent = `${it.title}${it.cape ? (lic ? ' · плащ из каталога доступен только без лицензии' : ' · с плащом') : ''}`;
  if (!lic) renderSkinPanels(); else skinDirty();
});
$('#catDone').addEventListener('click', () => setCatalogMode(false));
function leaveEditor(apply) {
  if (apply) {
    const r = editor.result();
    skin.pending = r;
    toast('Скин готов, нажмите «Сохранить скин», чтобы установить его');
  }
  setEditMode(false);
  showSkin(skin.pending?.image || skin.cur?.skin?.image, skin.variant);
  skinDirty();
}
$('#edTools').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b || !editor) return;
  if (b.dataset.tool) editor.set('tool', b.dataset.tool);
  if (b.dataset.size) editor.set('size', Number(b.dataset.size));
  if (b.id === 'edUndo') editor.undo();
  if (b.id === 'edRedo') editor.redo();
});
document.addEventListener('keydown', (e) => {
  if (!editor?.state.on || e.ctrlKey || e.metaKey || e.target.closest?.('input, textarea')) return;
  const t = { KeyB: 'brush', KeyE: 'eraser', KeyG: 'fill', KeyI: 'pick' }[e.code];
  if (t) editor.set('tool', t);
});
$('#edViews').addEventListener('click', (e) => { const b = e.target.closest('[data-view]'); if (b && editor) editor.view(Number(b.dataset.view)); });
$('#edColor').addEventListener('input', (e) => editor.set('color', e.target.value));
$('#edPalette').addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (b) { editor.set('color', b.dataset.c); if (editor.state.tool === 'eraser' || editor.state.tool === 'pick') editor.set('tool', 'brush'); } });
$('#edLayer').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) editor.set('layer', b.dataset.v); });
$('#edGrid').addEventListener('change', (e) => editor.set('grid', e.target.checked));
$('#edMirror').addEventListener('change', (e) => editor.set('mirror', e.target.checked));
$('#edParts').addEventListener('click', (e) => {
  const b = e.target.closest('[data-part]'); if (!b) return;
  b.classList.toggle('active'); editor.part(b.dataset.part, b.classList.contains('active'));
});
$('#edClearOuter').addEventListener('click', () => editor.clearOuter());
$('#edTemplate').addEventListener('click', () => enterEditor(true));
$('#edDone').addEventListener('click', () => leaveEditor(true));
$('#edCancel').addEventListener('click', () => leaveEditor(false));
$('#edDownload').addEventListener('click', () => {
  const a = document.createElement('a'); a.href = editor.result().image; a.download = `${skin.cur?.name || 'skin'}.png`; a.click();
});

$('#capeList').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-cape]'); if (!b || b.classList.contains('active')) return;
  if (skin.cur?.type === 'offline') {
    const code = b.dataset.cape || null;
    // скин ещё не сохранён или меняется — плащ уйдёт вместе с ним по кнопке «Сохранить»
    if (!skin.cur.skin || skin.pending) {
      skin.pendingCape = code;
      skin.pendingCapeImage = code ? (await safe(() => api.skin.catalogGet(skin.siteCapes.find((x) => x.code === code).url)))?.image || null : null;
      renderSkinPanels();
      return;
    }
    const r = await safe(() => api.skin.siteCape(code), 'Плащ: ');
    if (r) { skin.cur = { ...skin.cur, ...r }; skin.pendingCape = undefined; renderSkinPanels(); toast(code ? 'Плащ надет — его увидят игроки NLauncher' : 'Плащ снят'); }
    return;
  }
  const r = await safe(() => api.skin.cape(b.dataset.cape || null), 'Плащ: ');
  if (r) { skin.cur = { ...skin.cur, ...r }; renderSkinPanels(); toast(b.dataset.cape ? 'Плащ надет' : 'Плащ снят'); }
});

/* ---------------- старт ---------------- */
(async function init() {
  hydrateIcons();
  state.info = await api.info();
  state.settings = await api.settings.get();
  state.accounts = await api.accounts.list();
  const c = state.info.config;
  $('#brandName').textContent = c.brand; $('#heroTitle').textContent = c.brand;
  $('#brandCompany').textContent = c.company ? `by ${c.company}` : ''; $('#heroCompany').textContent = c.company || '';
  document.title = c.brand; $('#heroTagline').textContent = c.tagline;
  document.body.classList.toggle('no-anim', state.settings.animations === false);
  renderAccount();
  await loadInstances();
  bindSettings();
  go('home');
  loadFeed();
  refreshOnline();
  setInterval(refreshOnline, 60000);
  const st = await api.game.status().catch(() => null);
  if (st) setPlayState('running');
  if (!activeAccount()) setTimeout(() => accountModal(), 600);
})();
