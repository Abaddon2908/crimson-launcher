// Heleket: приём оплаты криптовалютой. Документация: https://doc.heleket.com
//   - UUID мерчанта и Payment API key → админка → Настройки
//   - вебхук приходит на {SITE_URL}/pay/heleket/webhook
const crypto = require('crypto');
const { settings } = require('../db');

const API = 'https://api.heleket.com/v1';
const enabled = () => Boolean(settings.get('heleket_merchant') && settings.get('heleket_api_key'));

// Подпись: md5( base64( json_body ) + API_KEY ). PHP json_encode экранирует "/" — учитываем оба варианта.
const signOf = (json, key) => crypto.createHash('md5').update(Buffer.from(json).toString('base64') + key).digest('hex');

async function call(path, payload) {
  const body = JSON.stringify(payload);
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', merchant: settings.get('heleket_merchant'), sign: signOf(body, settings.get('heleket_api_key')) },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.state !== 0) throw new Error(data.message || `Heleket HTTP ${res.status}`);
  return data.result;
}

/** Создать счёт; вернёт ссылку на оплату */
async function createInvoice(order) {
  const site = settings.get('site_url').replace(/\/$/, '');
  const r = await call('/payment', {
    amount: String(order.amount),
    currency: 'RUB',
    order_id: `nd-${order.id}`,
    url_callback: `${site}/pay/heleket/webhook`,
    url_return: `${site}/cabinet/orders`,
    url_success: `${site}/cabinet/orders?paid=${order.id}`,
    lifetime: 3600 * 3,
  });
  return { url: r.url, ref: r.uuid };
}

/** Проверка вебхука: подпись + повторный запрос статуса в API */
async function verify(body) {
  const key = settings.get('heleket_api_key');
  if (!key || !body || !body.sign) return null;
  const { sign, ...data } = body;
  const plain = JSON.stringify(data);
  const escaped = plain.replace(/\//g, '\\/');
  if (sign !== signOf(plain, key) && sign !== signOf(escaped, key)) return null;
  const m = /^nd-(\d+)$/.exec(data.order_id || '');
  if (!m) return null;
  // перепроверяем статус напрямую у Heleket — вебхуку одному не доверяем
  const info = await call('/payment/info', { uuid: data.uuid }).catch(() => null);
  const status = info?.payment_status || info?.status || data.status;
  if (!['paid', 'paid_over'].includes(status)) return { orderId: Number(m[1]), paid: false };
  return { orderId: Number(m[1]), paid: true, ref: data.uuid };
}

module.exports = { enabled, createInvoice, verify };
