// Мелкие улучшения страниц: копирование IP, подтверждения, страница покупки
(function () {
  function toast(text) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    document.body.append(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 1800);
  }

  document.addEventListener('click', (e) => {
    const c = e.target.closest('[data-copy]');
    if (c) {
      e.preventDefault();
      navigator.clipboard.writeText(c.dataset.copy).then(() => toast(`IP скопирован: ${c.dataset.copy}`), () => toast(c.dataset.copy));
      return;
    }
    const conf = e.target.closest('[data-confirm]');
    if (conf && !confirm(conf.dataset.confirm)) { e.preventDefault(); return; }
    const pr = e.target.closest('[data-prompt]');
    if (pr) {
      const v = prompt(pr.dataset.prompt, pr.dataset.promptDefault || '');
      if (v === null || (pr.dataset.promptField && pr.dataset.promptField !== 'reason' && !v.trim())) { e.preventDefault(); return; }
      const inp = pr.form.querySelector(`input[name="${pr.dataset.promptField || 'reason'}"]`);
      if (inp) inp.value = v;
    }
    const ds = e.target.closest('[data-days-set]');
    if (ds) {
      e.preventDefault();
      const inp = document.querySelector('input[name="days"]');
      if (inp) inp.value = ds.dataset.daysSet;
    }
  });

  // админка → лаунчер: загрузка файлов с прогрессом
  const drop = document.getElementById('drop');
  if (drop) {
    const input = document.getElementById('upFile');
    const list = document.getElementById('upList');
    const csrf = document.querySelector('input[name="_csrf"]')?.value || '';
    const uploadOne = (file) => new Promise((resolve) => {
      const row = document.createElement('div');
      row.className = 'up-row';
      row.innerHTML = '<span class="up-name"></span><span class="up-pct">0%</span><div class="pbar"><span></span></div>';
      row.querySelector('.up-name').textContent = file.name;
      list.append(row);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/admin/launcher/upload?name=${encodeURIComponent(file.name)}`);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.setRequestHeader('X-CSRF-Token', csrf);
      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        const p = Math.round((e.loaded / e.total) * 100);
        row.querySelector('.up-pct').textContent = `${p}%`;
        row.querySelector('.pbar span').style.width = `${p}%`;
      };
      xhr.onload = () => {
        let r = {};
        try { r = JSON.parse(xhr.responseText); } catch { r = { error: xhr.status === 413 ? 'Файл слишком большой для веб-сервера (проверьте client_max_body_size)' : `Ошибка ${xhr.status}` }; }
        row.querySelector('.up-pct').textContent = r.ok ? 'готово' : r.error || 'ошибка';
        row.classList.add(r.ok ? 'ok' : 'err');
        resolve(r.ok);
      };
      xhr.onerror = () => { row.querySelector('.up-pct').textContent = 'ошибка сети'; row.classList.add('err'); resolve(false); };
      xhr.send(file);
    });
    const run = async (files) => {
      let ok = true;
      for (const f of files) ok = (await uploadOne(f)) && ok;
      if (ok) setTimeout(() => location.reload(), 600);
    };
    input.addEventListener('change', () => input.files.length && run([...input.files]));
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => e.dataTransfer.files.length && run([...e.dataTransfer.files]));
  }

  // админка → выдать услугу: поля баннера и срок по умолчанию для выбранной услуги
  const kinds = document.querySelectorAll('input[name="kind"]');
  if (kinds.length) {
    const fields = document.querySelector('.banner-fields');
    const days = document.querySelector('input[name="days"]');
    let touched = false;
    if (days) days.addEventListener('input', () => { touched = true; });
    const upd = (initial) => {
      const k = document.querySelector('input[name="kind"]:checked');
      if (!k) return;
      if (fields) fields.hidden = k.value !== 'banner';
      const pf = document.querySelector('.points-fields'); if (pf) pf.hidden = k.value !== 'points';
      if (days && !touched && !initial) days.value = k.dataset.days;
    };
    kinds.forEach((k) => k.addEventListener('change', () => upd(false)));
    upd(true);
  }

  // страница покупки: поля по услуге, расчёт цены промо-баллов, купон
  const form = document.getElementById('buyForm');
  if (form) {
    const rub = (n) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;
    const durations = JSON.parse(form.dataset.durations);
    const packs = JSON.parse(form.dataset.packs);
    const ppp = Number(form.dataset.pointPrice);
    const total = document.getElementById('total');
    const lines = document.getElementById('priceLines');
    let couponPct = 0, couponMsg = '';
    const show = (sel, on) => { const el = form.querySelector(sel); if (el) el.hidden = !on; };
    const upd = () => {
      const p = form.querySelector('input[name="product_id"]:checked');
      if (!p) return;
      const kind = p.dataset.kind;
      show('.points-fields', kind === 'points'); show('.banner-fields', kind === 'banner'); show('.color-fields', kind === 'highlight');
      let base = Number(p.dataset.price) || 0, pack = 0, packPct = 0;
      if (kind === 'points') {
        const n = Math.round((Number(form.points.value) || 0) / 5) * 5;
        const d = durations.find((x) => x[0] === Number(form.days.value)) || durations[0];
        base = n * ppp * d[1];
        packPct = (packs.find((x) => n >= x[0]) || [0, 0])[1];
        pack = Math.round((base * packPct) / 100);
      }
      const after = base - pack;
      const coupon = couponPct ? Math.min(after - 1, Math.round((after * couponPct) / 100)) : 0;
      lines.innerHTML = '';
      const add = (l, v, cls = '') => { const d = document.createElement('div'); d.className = `pl ${cls}`; d.innerHTML = '<span></span><b></b>'; d.firstChild.textContent = l; d.lastChild.textContent = v; lines.append(d); };
      if (pack) { add('Без скидки', rub(base)); add(`Пакетная скидка ${packPct}%`, `−${rub(pack)}`, 'ok'); }
      if (coupon) add(`Купон −${couponPct}%`, `−${rub(coupon)}`, 'ok');
      if (couponMsg) add(couponMsg, '', 'bad');
      total.textContent = rub(Math.max(1, after - coupon));
    };
    form.addEventListener('change', upd);
    form.addEventListener('input', (e) => { if (e.target.name === 'points') upd(); });
    form.querySelectorAll('[data-points-set]').forEach((b) => b.addEventListener('click', () => { form.points.value = b.dataset.pointsSet; upd(); }));
    let ct;
    form.coupon.addEventListener('input', () => {
      clearTimeout(ct);
      ct = setTimeout(async () => {
        const code = form.coupon.value.trim();
        couponPct = 0; couponMsg = '';
        if (code) {
          try { const r = await (await fetch(`/cabinet/coupon?code=${encodeURIComponent(code)}`)).json(); if (r.ok) couponPct = r.pct; else couponMsg = r.error; } catch { /* нет сети */ }
        }
        upd();
      }, 400);
    });
    upd();
  }
})();

// телефон: активный пункт меню админки — на виду
(function () {
  const a = document.querySelector('.admin-nav a.active');
  const nav = a && a.parentElement;
  if (nav && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = a.offsetLeft - nav.clientWidth / 2 + a.offsetWidth / 2;
})();

// уведомление о cookie (показывается, если включены счётчики)
(function () {
  const c = document.getElementById('cookie');
  if (!c) return;
  let seen = false;
  try { seen = localStorage.getItem('cookieOk') === '1'; } catch { /* приватный режим */ }
  if (seen) return;
  c.hidden = false;
  document.getElementById('cookieOk').addEventListener('click', () => {
    c.hidden = true;
    try { localStorage.setItem('cookieOk', '1'); } catch { /* ничего */ }
  });
})();

// страница «Статистика»: живое обновление с плавной анимацией чисел
(function () {
  const box = document.getElementById('liveStats');
  if (!box) return;
  const fmt = (n) => Number(n).toLocaleString('ru-RU');
  const get = (o, path) => path.split('.').reduce((a, k) => (a ? a[k] : undefined), o);
  const animate = (el, to) => {
    const from = Number(el.dataset.value) || 0;
    if (from === to) return;
    const t0 = performance.now(), dur = 900;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(Math.round(from + (to - from) * e));
      if (k < 1) requestAnimationFrame(step); else el.dataset.value = String(to);
    };
    requestAnimationFrame(step);
  };
  const tick = async () => {
    try {
      const r = await fetch('/api/stats', { cache: 'no-store' });
      const s = await r.json();
      box.querySelectorAll('[data-stat]').forEach((el) => { const v = get(s, el.dataset.stat); if (typeof v === 'number') animate(el, v); });
    } catch { /* нет сети — попробуем позже */ }
  };
  setInterval(tick, 30000);
})();

// учёт копирований IP (для статистики владельца) — без личных данных
document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-copy][data-server]');
  if (c) fetch(`/api/server/${c.dataset.server}/copy`, { method: 'POST', keepalive: true }).catch(() => {});
});

// избранное: хранится в браузере, без регистрации
(function () {
  const KEY = 'favServers';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
  const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* приватный режим */ } };
  const paint = () => document.querySelectorAll('[data-fav]').forEach((b) => {
    const on = read().includes(Number(b.dataset.fav));
    b.classList.toggle('on', on);
    const s = b.querySelector('span'); if (s) s.textContent = on ? 'В избранном' : 'В избранное';
  });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fav]');
    if (!b) return;
    e.preventDefault();
    const id = Number(b.dataset.fav);
    const list = read();
    write(list.includes(id) ? list.filter((x) => x !== id) : [id, ...list].slice(0, 100));
    paint();
  });
  paint();
  // страница /favorites: подгружаем список
  const box = document.getElementById('favList');
  if (box) {
    const ids = read();
    if (!ids.length) { box.innerHTML = '<div class="empty"><b>Пока пусто</b>Нажмите «В избранное» на странице сервера — он появится здесь.</div>'; return; }
    fetch(`/favorites/list?ids=${ids.join(',')}`).then((r) => r.text()).then((h) => { box.innerHTML = h; });
  }
})();

// форма сервера: не больше 12 тегов
(function () {
  const boxes = document.querySelectorAll('.tag-picker input[name="tags"]');
  if (!boxes.length) return;
  const out = document.getElementById('tagCount');
  const upd = () => {
    const n = [...boxes].filter((b) => b.checked).length;
    boxes.forEach((b) => { b.disabled = !b.checked && n >= 12; });
    if (out) out.textContent = `Выбрано: ${n} из 12`;
  };
  boxes.forEach((b) => b.addEventListener('change', upd));
  upd();
})();

// кабинет → виджеты: копирование кода
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-copy-code]');
  if (!b) return;
  const ta = b.parentElement.querySelector('textarea');
  navigator.clipboard.writeText(ta.value).then(() => { const t = b.lastChild.textContent; b.lastChild.textContent = 'Скопировано'; setTimeout(() => { b.lastChild.textContent = t; }, 1500); }, () => { ta.select(); });
});

// Счётчик новых событий на кнопке «Админка»: обновляется раз в минуту без перезагрузки
(() => {
  const badge = document.getElementById('admBadge');
  if (!badge) return;
  const btn = badge.closest('a');
  const tick = async () => {
    if (!document.hidden) {
      try {
        const r = await fetch('/admin/notify.json', { credentials: 'same-origin' });
        if (r.ok) {
          const c = await r.json();
          badge.textContent = c.total > 99 ? '99+' : String(c.total);
          badge.hidden = !c.total;
          btn.title = c.text;
        }
      } catch { /* нет связи — попробуем позже */ }
    }
    setTimeout(tick, 60000);
  };
  setTimeout(tick, 60000);
})();
