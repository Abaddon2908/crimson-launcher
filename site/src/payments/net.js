// Понятные причины сетевых ошибок fetch (у Node это просто «fetch failed», суть — в e.cause)
const REASONS = {
  ENOTFOUND: 'сервер сайта не может найти адрес платёжной системы (DNS)',
  EAI_AGAIN: 'DNS на сервере сайта не отвечает',
  ECONNREFUSED: 'платёжная система отклонила соединение',
  ECONNRESET: 'соединение с платёжной системой оборвалось (возможна блокировка у хостинга)',
  ETIMEDOUT: 'платёжная система не ответила вовремя',
  UND_ERR_CONNECT_TIMEOUT: 'платёжная система не ответила вовремя (возможна блокировка у хостинга)',
  CERT_HAS_EXPIRED: 'ошибка SSL-сертификата платёжной системы',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'ошибка SSL-сертификата платёжной системы',
};

async function request(name, url, opts = {}) {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(20000), ...opts });
  } catch (e) {
    const code = e.cause?.code || e.code || e.name;
    const host = new URL(url).host;
    console.error(`[pay] ${name}: нет связи с ${host}:`, code, e.cause?.message || e.message);
    const reason = REASONS[code] || (e.name === 'TimeoutError' ? 'платёжная система не ответила за 20 секунд' : `нет связи с ${host}`);
    throw new Error(`${name}: ${reason}`);
  }
}

module.exports = { request };
