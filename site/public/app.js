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
      if (days && !touched && !initial) days.value = k.dataset.days;
    };
    kinds.forEach((k) => k.addEventListener('change', () => upd(false)));
    upd(true);
  }

  // страница покупки: поля баннера и итоговая сумма
  const picks = document.querySelectorAll('input[name="product_id"]');
  if (picks.length) {
    const fields = document.querySelector('.banner-fields');
    const total = document.getElementById('total');
    const upd = () => {
      const p = document.querySelector('input[name="product_id"]:checked');
      if (!p) return;
      if (fields) fields.hidden = p.dataset.kind !== 'banner';
      if (total) total.textContent = `${Number(p.dataset.price).toLocaleString('ru-RU')} ₽`;
    };
    picks.forEach((p) => p.addEventListener('change', upd));
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
