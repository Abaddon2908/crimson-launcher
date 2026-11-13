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
      const v = prompt(pr.dataset.prompt, '');
      if (v === null) { e.preventDefault(); return; }
      const inp = pr.form.querySelector('input[name="reason"]');
      if (inp) inp.value = v;
    }
  });

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
