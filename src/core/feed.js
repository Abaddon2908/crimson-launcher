// Лента с сайта мониторинга (nlauncher.ru): баннер, новости, PROMO, топ и сервера «в игре».
// Последний удачный ответ кэшируется на диск — без интернета лаунчер показывает его.
const fs = require('fs');
const path = require('path');
const paths = require('./paths');
const { json } = require('./net');

const CACHE = path.join(paths.data, 'feed-cache.json');
const DEMO = {
  banner: {
    title: 'Здесь будет ваш мониторинг',
    text: 'Топ серверов, продвижение и рекламные места — прямо в лаунчере.',
    cta: 'Разместить рекламу',
    url: 'https://nlauncher.ru/ads',
    image: null,
  },
  news: [
    { title: 'Лаунчер вышел в бету', date: '2026-11-13', text: 'Лицензия и офлайн, моды через Modrinth, Fabric / Quilt / Forge.', url: null },
  ],
  promoted: [],
  top: [],
  ingame: [],
};

let memo = null; // { t, data }

function readCache() {
  try { return JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { return null; }
}

async function load(url, { maxAgeMs = 60_000 } = {}) {
  if (memo && Date.now() - memo.t < maxAgeMs) return memo.data;
  if (!url || url.includes('example.com')) return { ...DEMO, demo: true };
  try {
    const remote = await json(url, { signal: AbortSignal.timeout(5000) });
    const data = { ...DEMO, ...remote, demo: false };
    memo = { t: Date.now(), data };
    try { fs.writeFileSync(CACHE, JSON.stringify(data)); } catch { /* не критично */ }
    return data;
  } catch {
    const cached = readCache();
    return cached ? { ...DEMO, ...cached, cached: true } : { ...DEMO, demo: true };
  }
}

module.exports = { load };
