// ЮMoney: приём оплаты на кошелёк через форму QuickPay + HTTP-уведомления.
// Настройка кошелька: https://yoomoney.ru/transfer/myservices/http-notification
//   - адрес уведомлений:  {SITE_URL}/pay/yoomoney/notify
//   - секрет из той же страницы → админка → Настройки → «Секрет ЮMoney»
const crypto = require('crypto');
const { settings } = require('../db');

const enabled = () => Boolean(settings.get('yoomoney_wallet') && settings.get('yoomoney_secret'));

/** Данные для автосабмит-формы оплаты */
function checkoutForm(order, { method = 'AC' } = {}) {
  const site = settings.get('site_url').replace(/\/$/, '');
  return {
    action: 'https://yoomoney.ru/quickpay/confirm',
    fields: {
      receiver: settings.get('yoomoney_wallet'),
      'quickpay-form': 'button',
      paymentType: method, // AC — банковская карта, PC — кошелёк ЮMoney
      sum: String(order.amount),
      label: `order-${order.id}`,
      successURL: `${site}/cabinet/orders?paid=${order.id}`,
    },
  };
}

/**
 * Проверка уведомления. Возвращает { orderId, paidAmount } или null.
 * sha1(notification_type&operation_id&amount&currency&datetime&sender&codepro&secret&label)
 */
function verify(body) {
  const secret = settings.get('yoomoney_secret');
  if (!secret) return null;
  const str = [body.notification_type, body.operation_id, body.amount, body.currency, body.datetime, body.sender, body.codepro, secret, body.label].join('&');
  const hash = crypto.createHash('sha1').update(str).digest('hex');
  if (!body.sha1_hash || hash !== String(body.sha1_hash).toLowerCase()) return null;
  if (body.codepro === 'true' || body.unaccepted === 'true') return null; // защищённые/непринятые переводы не засчитываем
  const m = /^order-(\d+)$/.exec(body.label || '');
  if (!m) return null;
  // withdraw_amount — сколько списано с плательщика (amount — после комиссии)
  return { orderId: Number(m[1]), paidAmount: Number(body.withdraw_amount || body.amount), ref: body.operation_id };
}

module.exports = { enabled, checkoutForm, verify };
