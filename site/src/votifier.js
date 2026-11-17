// Отправка голоса на Minecraft-сервер по протоколу Votifier.
//  v1 (Votifier / VotifierPlus / NuVotifier в режиме v1): RSA-шифрование публичным ключом (public.key).
//  v2 (NuVotifier): подпись HMAC-SHA256 токеном (config.yml → tokens.default).
// Сервер при подключении присылает приветствие: "VOTIFIER 1.9" (v1) или "VOTIFIER 2 <challenge>" (v2).
const net = require('net');
const crypto = require('crypto');

function pemFromKey(key) {
  const k = String(key || '').replace(/-----(BEGIN|END) PUBLIC KEY-----/g, '').replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/=]{200,}$/.test(k)) throw new Error('Публичный ключ выглядит неверно — скопируйте всё содержимое файла plugins/Votifier…/rsa/public.key');
  return `-----BEGIN PUBLIC KEY-----\n${k.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----\n`;
}

/** Проверка ключа заранее (при сохранении формы) */
function validateKey(key) {
  if (!key) return '';
  try { crypto.createPublicKey(pemFromKey(key)); return ''; } catch (e) { return e.message.startsWith('Публичный') ? e.message : 'Публичный ключ не читается — скопируйте файл public.key целиком'; }
}

/**
 * @param {{host:string, port:number, key?:string, token?:string}} target
 * @param {{service:string, username:string, address:string}} vote
 * @returns {Promise<{ok:boolean, version?:string, error?:string}>}
 */
function send(target, vote, { timeout = 6000 } = {}) {
  return new Promise((resolve) => {
    const host = String(target.host || '').trim();
    const port = Number(target.port) || 8192;
    if (!host) return resolve({ ok: false, error: 'Не указан IP для Votifier' });
    let done = false;
    let buf = '';
    let phase = 'greeting';
    const sock = net.createConnection({ host, port });
    const finish = (r) => { if (done) return; done = true; sock.destroy(); resolve(r); };
    sock.setTimeout(timeout, () => finish({ ok: false, error: `Сервер Votifier не ответил за ${timeout / 1000} с (проверьте IP, порт и фаервол)` }));
    sock.on('error', (e) => finish({ ok: false, error: e.code === 'ECONNREFUSED' ? 'Подключение отклонено — Votifier не запущен или порт закрыт' : e.code === 'ENOTFOUND' ? 'Адрес не найден' : `Ошибка соединения: ${e.message}` }));
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      if (phase === 'greeting') {
        const nl = buf.indexOf('\n');
        if (nl < 0) return;
        const greet = buf.slice(0, nl).trim().split(' ');
        buf = buf.slice(nl + 1);
        if (greet[0] !== 'VOTIFIER') return finish({ ok: false, error: 'Это не Votifier (неожиданный ответ сервера)' });
        const ts = Date.now();
        // --- v2: токен NuVotifier ---
        if (greet[1] === '2' && target.token) {
          const payload = JSON.stringify({ serviceName: vote.service, username: vote.username, address: vote.address, timestamp: ts, challenge: greet[2] || '' });
          const signature = crypto.createHmac('sha256', String(target.token).trim()).update(payload).digest('base64');
          const msg = Buffer.from(JSON.stringify({ signature, payload }), 'utf8');
          const head = Buffer.alloc(4);
          head.writeUInt16BE(0x733a, 0);
          head.writeUInt16BE(msg.length, 2);
          phase = 'v2-response';
          sock.write(Buffer.concat([head, msg]));
          return undefined;
        }
        // --- v1: RSA (работает и с NuVotifier, если там включён v1) ---
        if (!target.key) {
          return finish({ ok: false, error: greet[1] === '2' ? 'Сервер использует NuVotifier v2 — укажите токен (tokens.default) или публичный ключ' : 'Укажите публичный ключ Votifier' });
        }
        try {
          const data = Buffer.from(`VOTE\n${vote.service}\n${vote.username}\n${vote.address}\n${ts}\n`, 'utf8');
          const enc = crypto.publicEncrypt({ key: pemFromKey(target.key), padding: crypto.constants.RSA_PKCS1_PADDING }, data);
          sock.write(enc);
          // v1 не отвечает — даём серверу принять данные и закрываем
          setTimeout(() => finish({ ok: true, version: `v1 (${greet[1] || '?'})` }), 400);
        } catch (e) {
          finish({ ok: false, error: e.message.startsWith('Публичный') ? e.message : `Не удалось зашифровать голос: ${e.message}` });
        }
        return undefined;
      }
      if (phase === 'v2-response') {
        try {
          const r = JSON.parse(buf.trim());
          if (r.status === 'ok') finish({ ok: true, version: 'v2 (NuVotifier)' });
          else finish({ ok: false, error: `NuVotifier отклонил голос: ${r.cause || r.error || 'ошибка'}${/signature|token/i.test(JSON.stringify(r)) ? ' — проверьте токен' : ''}` });
        } catch { /* ждём остаток ответа */ }
      }
      return undefined;
    });
    sock.on('end', () => {
      if (phase === 'v2-response') finish({ ok: false, error: 'NuVotifier закрыл соединение без ответа — проверьте токен' });
    });
  });
}

module.exports = { send, validateKey };
