// Админка → Поддержка: живая переписка (новые сообщения подгружаются без перезагрузки)
(() => {
  const box = document.getElementById('supMsgs');
  const form = document.getElementById('supForm');
  if (!box || !form) return;
  const id = box.dataset.thread;
  let last = Number(box.dataset.last) || 0, busy = false;
  const text = form.querySelector('textarea');
  const time = (ts) => new Date(ts).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  function add(list) {
    for (const m of list || []) {
      if (m.id <= last) continue;
      last = m.id;
      const el = document.createElement('div');
      el.className = `sup-msg${m.from_admin ? ' me' : ''}`;
      const p = document.createElement('p'); p.textContent = m.text;
      const s = document.createElement('small'); s.textContent = time(m.ts);
      el.append(p, s);
      box.append(el);
      box.scrollTop = box.scrollHeight;
    }
  }
  box.scrollTop = box.scrollHeight;

  async function poll() {
    try {
      const r = await fetch(`/admin/support/${id}/messages?after=${last}`, { credentials: 'same-origin' });
      if (r.ok) {
        const d = await r.json();
        add(d.messages);
        const seen = document.getElementById('supSeen');
        if (seen) seen.textContent = d.unreadByUser ? 'Последний ответ ещё не прочитан' : 'Пользователь видел все ответы';
      }
    } catch { /* повторим */ }
    setTimeout(poll, 5000);
  }
  setTimeout(poll, 5000);

  text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!text.value.trim() || busy) return;
    busy = true;
    const fd = new URLSearchParams(new FormData(form));
    fd.set('after', String(last));
    try {
      const r = await fetch(form.action, { method: 'POST', body: fd, credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (r.ok) { add((await r.json()).messages); text.value = ''; } else form.submit();
    } catch { form.submit(); }
    busy = false;
    text.focus();
  });
})();
