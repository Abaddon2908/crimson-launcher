// ЮKassa: карты, СБП, SberPay и другие способы на странице оплаты ЮKassa.
// Документация: https://yookassa.ru/developers/api
//   - shopId и секретный ключ → админка → Настройки → ЮKassa
//   - HTTP-уведомления: личный кабинет ЮKassa → Интеграция → HTTP-уведомления
//     адрес {SITE_URL}/pay/yookassa/webhook, событие payment.succeeded
const crypto = require('crypto');
const { settings } = require('../db');
const { request } = require('./net');

const API = process.env.YOOKASSA_API || 'https://api.yookassa.ru/v3'; // подмена — только для тестов
const enabled = () => Boolean(settings.get('yookassa_shop_id') && settings.get('yookassa_secret'));
const authHeader = () => 'Basic ' + Buffer.from(`${settings.get('yookassa_shop_id').trim()}:${settings.get('yookassa_secret').trim()}`).toString('base64');

async function api(method, path, body) {
  const res = await request('ЮKassa', `${API}${path}`, {
    method,
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
      ...(method === 'POST' ? { 'Idempotence-Key': crypto.randomUUID() } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.description || `ЮKassa HTTP ${res.status}`);
  return data;
}

const money = (rub) => ({ value: Number(rub).toFixed(2), currency: 'RUB' });

/** Создать платёж; вернёт ссылку на страницу оплаты ЮKassa */
async function createPayment(order, email) {
  const site = settings.get('site_url').replace(/\/$/, '');
  const description = `Заказ №${order.id}: ${order.title}`.slice(0, 128);
  const payload = {
    amount: money(order.amount),
    capture: true,
    confirmation: { type: 'redirect', return_url: `${site}/cabinet/orders?paid=${order.id}` },
    description,
    metadata: { order_id: String(order.id) },
  };
  // чек по 54-ФЗ — если в ЮKassa подключена отправка чеков
  if (settings.get('yookassa_receipt') === '1') {
    payload.receipt = {
      customer: { email },
      items: [{
        description: order.title.slice(0, 128), quantity: '1.00', amount: money(order.amount),
        vat_code: Number(settings.get('yookassa_vat_code')) || 1, payment_mode: 'full_payment', payment_subject: 'service',
      }],
    };
  }
  const p = await api('POST', '/payments', payload);
  return { url: p.confirmation?.confirmation_url, ref: p.id };
}

/**
 * Уведомление ЮKassa. Подписи у уведомлений нет, поэтому статус и сумму
 * всегда берём повторным запросом платежа по API с нашими ключами.
 */
async function verify(body) {
  const id = body?.object?.id;
  if (!enabled() || body?.type !== 'notification' || typeof id !== 'string' || !/^[\w-]{10,64}$/.test(id)) return null;
  const p = await api('GET', `/payments/${encodeURIComponent(id)}`).catch(() => null);
  if (!p) return null;
  const orderId = Number(p.metadata?.order_id);
  if (!orderId) return null;
  return { orderId, paid: p.status === 'succeeded' && p.paid === true, ref: p.id, paidAmount: Number(p.amount?.value) };
}

module.exports = { enabled, createPayment, verify };
