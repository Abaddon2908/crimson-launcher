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
