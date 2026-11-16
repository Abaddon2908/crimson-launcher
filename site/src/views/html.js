// Мини-шаблонизатор: html`...` экранирует всё, кроме вложенных html`...` и raw()
class Safe { constructor(s) { this.s = s; } toString() { return this.s; } }

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

function render(v) {
  if (v == null || v === false) return '';
  if (v instanceof Safe) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  return esc(v);
}

function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += render(vals[i]) + strings[i + 1];
  return new Safe(out);
}
const raw = (s) => new Safe(String(s));

const fmt = {
  num: (n) => Number(n || 0).toLocaleString('ru-RU'),
  // неразрывные пробелы: «0 ₽» и «16 нояб. 2026 г.» не рвутся на две строки
  rub: (n) => `${Number(n || 0).toLocaleString('ru-RU')} ₽`,
  date: (t) => (t ? new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }).replace(/ /g, ' ') : '—'),
  datetime: (t) => (t ? new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(/ /g, ' ') : '—'),
  /** короткий период «16 нояб. — 23 нояб. 2026» */
  period: (a, b) => {
    if (!a || !b) return '—';
    const da = new Date(a), db = new Date(b);
    const same = da.getFullYear() === db.getFullYear();
    const f = (d, y) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', ...(y ? { year: 'numeric' } : {}) }).replace(' г.', '').replace(/ /g, ' ');
    return `${f(da, !same)} — ${f(db, true)}`;
  },
  ago: (t) => {
    if (!t) return 'никогда';
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 60) return 'только что';
    if (s < 3600) return `${Math.round(s / 60)} мин назад`;
    if (s < 86400) return `${Math.round(s / 3600)} ч назад`;
    return `${Math.round(s / 86400)} дн назад`;
  },
  plural: (n, one, few, many) => {
    const m10 = n % 10, m100 = n % 100;
    return `${n} ${m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? few : many}`;
  },
};

/** Безопасная ссылка: только http(s) */
const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '');

module.exports = { html, raw, esc, fmt, safeUrl, Safe };
