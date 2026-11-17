// Цены: промо-баллы (любое количество на срок), пакетные скидки, купоны, цвета выделения.
const { db, settings, now } = require('./db');

// Срок → множитель цены (чем дольше, тем дешевле в пересчёте на день)
const DURATIONS = [
  { days: 7, k: 1, label: '7 дней' },
  { days: 14, k: 1.9, label: '2 недели' },
  { days: 30, k: 3.8, label: '1 месяц' },
  { days: 60, k: 7.2, label: '2 месяца' },
  { days: 90, k: 10.2, label: '3 месяца' },
  { days: 180, k: 19, label: '6 месяцев' },
];
// Пакетная скидка за количество баллов
const PACKS = [
  { min: 1000, pct: 15 },
  { min: 500, pct: 10 },
  { min: 200, pct: 5 },
];
const COLORS = { green: 'Зелёный', blue: 'Голубой', yellow: 'Жёлтый', red: 'Красный', purple: 'Фиолетовый' };

const pointPrice = () => Math.max(1, Number(settings.get('points_price')) || 10); // ₽ за 1 балл на 7 дней
const packPct = (n) => (PACKS.find((p) => n >= p.min) || { pct: 0 }).pct;

/** Стоимость промо-баллов: { base, packDiscount, total } */
function pointsQuote(points, days) {
  const n = Math.round(Number(points) / 5) * 5;
  const d = DURATIONS.find((x) => x.days === Number(days));
  if (!d || !(n >= 5 && n <= 10000)) return null;
  const base = Math.round(n * pointPrice() * d.k);
  const packDiscount = Math.round((base * packPct(n)) / 100);
  return { points: n, days: d.days, base, packDiscount, total: base - packDiscount, pct: packPct(n) };
}

/** Проверка купона → { coupon, pct } или { error } */
function checkCoupon(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!c) return { coupon: null, pct: 0 };
  const row = db.prepare('SELECT * FROM coupons WHERE code = ?').get(c);
  if (!row || !row.active) return { error: 'Купон не найден' };
  if (row.expires && row.expires < now()) return { error: 'Срок действия купона закончился' };
  if (row.max_uses && row.used >= row.max_uses) return { error: 'Купон уже использован максимальное число раз' };
  return { coupon: row, pct: row.percent };
}

/** Применить скидку купона к сумме (не меньше 1 ₽) */
function applyCoupon(amount, pct) {
  const off = Math.min(amount - 1, Math.round((amount * pct) / 100));
  return { amount: amount - Math.max(0, off), off: Math.max(0, off) };
}

/** Купон засчитывается при оплате заказа */
function useCoupon(code) {
  if (code) db.prepare('UPDATE coupons SET used = used + 1 WHERE code = ?').run(code);
}

module.exports = { DURATIONS, PACKS, COLORS, pointPrice, packPct, pointsQuote, checkCoupon, applyCoupon, useCoupon };
