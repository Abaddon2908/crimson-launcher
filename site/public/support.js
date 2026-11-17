// Виджет «Поддержка»: кнопка внизу справа и окно переписки с администрацией
(() => {
  const root = document.getElementById('sup');
  if (!root) return;
  const $ = (id) => document.getElementById(id);
  const fab = $('supFab'), panel = $('supPanel'), body = $('supBody'), form = $('supForm');
  const text = $('supText'), contact = $('supContact'), err = $('supErr'), dot = $('supDot');
  let last = 0, open = false, timer = 0, busy = false;

  const time = (ts) => new Date(ts).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const atBottom = () => body.scrollHeight - body.scrollTop - body.clientHeight < 40;

  function render(data) {
    const stick = atBottom();
    for (const m of data.messages || []) {
      if (m.id <= last) continue;
      last = m.id;
      const el = document.createElement('div');
      el.className = `sup-msg${m.from_admin ? '' : ' me'}`;
      const p = document.createElement('p'); p.textContent = m.text;
      const s = document.createElement('small'); s.textContent = (m.from_admin ? 'Поддержка · ' : '') + time(m.ts);
      el.append(p, s);
      body.append(el);
    }
    if (stick || data.messages?.length) body.scrollTop = body.scrollHeight;
    contact.hidden = !data.needContact;
    dot.hidden = open || !data.unread;
    if (data.closed && !body.querySelector('.sup-note')) {
      const n = document.createElement('div'); n.className = 'sup-note';
      n.textContent = 'Обращение закрыто. Напишите, если остались вопросы, — оно откроется снова.';
      body.append(n);
    }
  }

  async function load() {
    if (document.hidden && !open) return schedule();
    try {
      const r = await fetch(`/support/messages?after=${last}&read=${open ? 1 : 0}`, { credentials: 'same-origin' });
      if (r.ok) render(await r.json());
    } catch { /* сеть пропала — попробуем позже */ }
    schedule();
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(load, open ? 5000 : 60000); }

  function toggle(v) {
    open = v;
    panel.hidden = !v;
    root.classList.toggle('open', v);
    fab.setAttribute('aria-expanded', String(v));
    if (v) { dot.hidden = true; load(); setTimeout(() => text.focus(), 50); body.scrollTop = body.scrollHeight; } else schedule();
  }
  fab.addEventListener('click', () => toggle(!open));
  $('supClose').addEventListener('click', () => toggle(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) toggle(false); });

  // поле растёт вместе с текстом; Enter — отправить, Shift+Enter — новая строка
  const grow = () => { text.style.height = 'auto'; text.style.height = `${Math.min(text.scrollHeight, 120)}px`; };
  text.addEventListener('input', grow);
  text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = text.value.trim();
    if (!msg || busy) return;
    busy = true; err.hidden = true;
    try {
      const r = await fetch('/support/messages', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': root.dataset.csrf },
        body: JSON.stringify({ text: msg, contact: contact.hidden ? '' : contact.value.trim(), page: location.pathname, after: last }),
      });
      const data = await r.json().catch(() => ({ error: 'Не удалось отправить. Обновите страницу и попробуйте снова.' }));
      if (!r.ok) {
        err.textContent = data.error || (r.status === 429 ? 'Слишком много сообщений, подождите немного.' : 'Не удалось отправить.');
        err.hidden = false;
        if (data.needContact) { contact.hidden = false; contact.focus(); }
      } else {
        text.value = ''; grow();
        body.querySelector('.sup-note')?.remove();
        render(data);
      }
    } catch {
      err.textContent = 'Нет связи с сайтом. Проверьте интернет.'; err.hidden = false;
    }
    busy = false;
  });

  // первая проверка ответов — чуть позже загрузки страницы
  timer = setTimeout(load, 1500);
})();
