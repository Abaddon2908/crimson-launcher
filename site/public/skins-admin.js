// Админка → Скины: загрузка PNG по одному файлу (лимит тела запроса небольшой)
(() => {
  const $ = (s) => document.querySelector(s);
  const kind = $('#skKind'); if (!kind) return;
  const csrf = document.querySelector('input[name="_csrf"]')?.value || '';
  const sync = () => document.querySelectorAll('.sk-only').forEach((e) => { e.hidden = kind.value === 'cape'; });
  kind.addEventListener('change', sync); sync();
  const b64 = (f) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = no; r.readAsDataURL(f); });
  $('#skGo').addEventListener('click', async () => {
    const files = [...$('#skFiles').files];
    if (!files.length) { $('#skLog').textContent = 'Выберите файлы'; return; }
    $('#skGo').disabled = true;
    let ok = 0; const errs = [];
    for (const [i, f] of files.entries()) {
      $('#skLog').textContent = `Загружаю ${i + 1} из ${files.length}…`;
      try {
        const title = f.name.replace(/\.png$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, 80);
        const r = await fetch('/admin/skins/upload', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
          body: JSON.stringify({ kind: kind.value, title, png: await b64(f), variant: $('#skVariant').value, gender: $('#skGender').value, style: $('#skStyle').value, cape: $('#skCape').value }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        if (d.exists) errs.push(`${f.name}: уже есть в каталоге`); else ok++;
      } catch (e) { errs.push(`${f.name}: ${e.message}`); }
    }
    $('#skLog').textContent = `Готово: добавлено ${ok}.${errs.length ? ' ' + errs.join('; ') : ''}`;
    $('#skGo').disabled = false;
    if (ok) setTimeout(() => location.reload(), 1200);
  });
})();
