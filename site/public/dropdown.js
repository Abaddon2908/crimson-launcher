// Свои выпадающие списки вместо системных <select>.
// Нативный select остаётся скрытым источником значения: .value / change работают как раньше.
(function () {
  let open = null;

  function close() {
    if (!open) return;
    open.menu.classList.remove('show');
    open.wrap.classList.remove('open');
    const m = open.menu; setTimeout(() => m.remove(), 200);
    open = null;
  }

  function label(sel) {
    const o = sel.options[sel.selectedIndex];
    return o ? o.textContent : '—';
  }

  function sync(dd) {
    dd.text.textContent = label(dd.sel);
    dd.wrap.classList.toggle('disabled', dd.sel.disabled);
  }

  function openMenu(dd) {
    if (open && open.wrap === dd.wrap) return close();
    close();
    const { sel } = dd;
    if (sel.disabled) return;
    const menu = document.createElement('div');
    menu.className = 'dd-menu';
    const opts = [...sel.options];
    const searchable = opts.length > 12;
    menu.innerHTML = (searchable ? '<div class="dd-search"><input placeholder="Поиск…" /></div>' : '') + '<div class="dd-list"></div>';
    const list = menu.querySelector('.dd-list');
    const render = (q = '') => {
      list.innerHTML = '';
      opts.filter((o) => !q || o.textContent.toLowerCase().includes(q)).forEach((o) => {
        const it = document.createElement('button');
        it.type = 'button';
        it.className = 'dd-item' + (o.value === sel.value ? ' active' : '');
        it.innerHTML = `<span></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>`;
        it.firstChild.textContent = o.textContent;
        it.onclick = () => { sel.value = o.value; sync(dd); sel.dispatchEvent(new Event('change', { bubbles: true })); close(); };
        list.append(it);
      });
      if (!list.children.length) list.innerHTML = '<div class="dd-empty">Ничего не найдено</div>';
    };
    render();
    document.body.append(menu);
    const r = dd.wrap.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 14;
    const above = r.top - 14;
    const need = Math.min(320, menu.scrollHeight);
    // вниз, если там хватает места (или там просторнее, чем сверху); высота — по выбранной стороне
    const down = below >= need || below >= above;
    const width = Math.max(r.width, 200);
    menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) + 'px';
    menu.style.width = width + 'px';
    menu.style.maxHeight = Math.max(120, Math.min(320, down ? below : above)) + 'px';
    if (down) menu.style.top = r.bottom + 6 + 'px';
    else { menu.style.bottom = window.innerHeight - r.top + 6 + 'px'; menu.style.transformOrigin = 'bottom'; }
    requestAnimationFrame(() => menu.classList.add('show'));
    dd.wrap.classList.add('open');
    open = { wrap: dd.wrap, menu };
    list.querySelector('.active')?.scrollIntoView({ block: 'center' });
    if (searchable) {
      const inp = menu.querySelector('input');
      inp.oninput = () => render(inp.value.trim().toLowerCase());
      setTimeout(() => inp.focus(), 50);
    }
  }

  function enhance(sel) {
    if (sel.dataset.dd) return;
    sel.dataset.dd = '1';
    const wrap = document.createElement('div');
    wrap.className = 'dd ' + sel.className.replace('select', '').trim();
    wrap.tabIndex = 0;
    sel.replaceWith(wrap);
    const text = document.createElement('span');
    text.className = 'dd-text';
    const arrow = document.createElement('i');
    arrow.className = 'dd-arrow';
    arrow.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
    sel.hidden = true;
    wrap.append(text, arrow, sel);
    const dd = { sel, wrap, text };
    wrap.addEventListener('click', (e) => {
      e.preventDefault(); // внутри <label> браузер иначе шлёт второй клик по скрытому select
      if (e.target === sel) return;
      openMenu(dd);
    });
    wrap.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMenu(dd); } });
    new MutationObserver(() => sync(dd)).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
    sel.addEventListener('change', () => sync(dd));
    sync(dd);
  }

  function scan(root = document) { root.querySelectorAll('select.select:not([data-dd])').forEach(enhance); }

  document.addEventListener('mousedown', (e) => { if (open && !open.menu.contains(e.target) && !open.wrap.contains(e.target)) close(); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) { e.stopImmediatePropagation(); close(); } }, true);
  window.addEventListener('resize', close);
  document.addEventListener('scroll', (e) => { if (open && !open.menu.contains(e.target)) close(); }, true);
  new MutationObserver(() => scan()).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('DOMContentLoaded', () => scan());
  scan();
})();
