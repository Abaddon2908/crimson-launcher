// Подсказки [data-tip]: один общий слой поверх окна.
// Не обрезаются контейнерами, сами выбирают сторону и не вылезают за края.
(function () {
  const tip = document.createElement('div');
  tip.className = 'tooltip';
  tip.setAttribute('role', 'tooltip');
  let target = null;
  let timer = null;

  function place() {
    if (!target || !document.contains(target)) return hide();
    const r = target.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const gap = 10, pad = 8;
    const W = window.innerWidth, H = window.innerHeight;
    // в боковой панели — справа, иначе — сверху (или снизу, если сверху нет места)
    let side = target.closest('.sidebar') ? 'right' : 'top';
    if (side === 'top' && r.top - t.height - gap < pad + 40) side = 'bottom';
    let x, y;
    if (side === 'right') { x = r.right + gap; y = r.top + r.height / 2 - t.height / 2; }
    else if (side === 'top') { x = r.left + r.width / 2 - t.width / 2; y = r.top - t.height - gap; }
    else { x = r.left + r.width / 2 - t.width / 2; y = r.bottom + gap; }
    x = Math.max(pad, Math.min(x, W - t.width - pad));
    y = Math.max(pad, Math.min(y, H - t.height - pad));
    tip.style.left = `${Math.round(x)}px`;
    tip.style.top = `${Math.round(y)}px`;
    tip.dataset.side = side;
  }

  function show(el) {
    target = el;
    tip.textContent = el.dataset.tip;
    if (!tip.isConnected) document.body.append(tip);
    tip.classList.remove('show');
    place();
    requestAnimationFrame(() => tip.classList.add('show'));
  }

  function hide() {
    clearTimeout(timer);
    target = null;
    tip.classList.remove('show');
  }

  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[data-tip]');
    if (el === target) return;
    clearTimeout(timer);
    if (!el || !el.dataset.tip) return hide();
    timer = setTimeout(() => show(el), target ? 0 : 250);
  });
  document.addEventListener('mouseout', (e) => {
    if (target && !target.contains(e.relatedTarget)) hide();
  });
  document.addEventListener('mousedown', hide, true);
  // прячем только если прокрутился контейнер, в котором находится элемент с подсказкой
  document.addEventListener('scroll', (e) => {
    const t = target;
    if (t && (e.target === document || (e.target.contains && e.target.contains(t)))) hide();
  }, true);
  document.addEventListener('keydown', hide, true);
  window.addEventListener('blur', hide);
  window.addEventListener('resize', hide);
})();
