/* Кнопка «Голосовать» со счётчиком для сайтов серверов.
   Вставка:
   <a href="https://nlauncher.ru/vote/ID" class="nd-vote" data-nd-server="ID">Голосовать за сервер</a>
   <script async src="https://nlauncher.ru/widgets/vote.js"></script>
   Параметры: data-nd-theme="light", data-nd-size="sm", data-nd-text="Проголосуй" */
(function () {
  var script = document.currentScript || [].slice.call(document.querySelectorAll('script[src*="/widgets/vote.js"]')).pop();
  var base = script ? script.src.replace(/\/widgets\/vote\.js.*$/, '') : '';
  if (!document.getElementById('nd-vote-css')) {
    var css = document.createElement('style');
    css.id = 'nd-vote-css';
    css.textContent = [
      '.nd-vote{display:inline-flex!important;align-items:center;gap:10px;height:44px;padding:0 6px 0 16px;border-radius:12px;font:700 14px/1 system-ui,-apple-system,"Segoe UI",sans-serif;text-decoration:none!important;transition:transform .2s,filter .2s;box-sizing:border-box;vertical-align:middle}',
      '.nd-vote:hover{transform:translateY(-1px);filter:brightness(1.08)}',
      '.nd-vote .nd-ic{width:18px;height:18px;flex:none}',
      '.nd-vote .nd-n{display:inline-flex;align-items:center;height:32px;padding:0 10px;border-radius:9px;font-variant-numeric:tabular-nums}',
      '.nd-vote.nd-dark{background:#a3454f;color:#fff!important}',
      '.nd-vote.nd-dark .nd-n{background:rgba(0,0,0,.22);color:#fff}',
      '.nd-vote.nd-light{background:#fff;color:#7c2e38!important;box-shadow:0 0 0 1.5px #e8cfd2}',
      '.nd-vote.nd-light .nd-n{background:#f6e9ea;color:#7c2e38}',
      '.nd-vote.nd-sm{height:34px;font-size:12.5px;padding-left:12px;gap:8px}',
      '.nd-vote.nd-sm .nd-n{height:24px;padding:0 8px}',
    ].join('');
    document.head.appendChild(css);
  }
  var icon = '<svg class="nd-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>';
  [].forEach.call(document.querySelectorAll('a.nd-vote[data-nd-server]:not([data-nd-ready])'), function (a) {
    a.setAttribute('data-nd-ready', '1');
    var id = parseInt(a.getAttribute('data-nd-server'), 10);
    if (!id) return;
    var text = a.getAttribute('data-nd-text') || a.textContent.trim() || 'Голосовать за сервер';
    a.className += ' nd-' + (a.getAttribute('data-nd-theme') === 'light' ? 'light' : 'dark') + (a.getAttribute('data-nd-size') === 'sm' ? ' nd-sm' : '');
    a.target = a.target || '_blank';
    a.rel = 'noopener';
    a.innerHTML = icon + '<span></span><span class="nd-n">…</span>';
    a.children[1].textContent = text;
    var x = new XMLHttpRequest();
    x.open('GET', base + '/api/server/' + id + '/widget.json');
    x.onload = function () {
      try { var d = JSON.parse(x.responseText); a.lastChild.textContent = Number(d.votes || 0).toLocaleString('ru-RU'); a.title = d.name + ': голосов за месяц — ' + d.votes; }
      catch (e) { a.lastChild.style.display = 'none'; }
    };
    x.onerror = function () { a.lastChild.style.display = 'none'; };
    x.send();
  });
})();
