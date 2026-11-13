// Лента с собственного сайта: новости, рекламные слоты, топ серверов мониторинга.
// Формат см. README.md → «Подключение сайта».
const { json } = require('./net');

const DEMO = {
  banner: {
    title: 'Здесь будет ваш мониторинг',
    text: 'Топ серверов, продвижение и рекламные места — прямо в лаунчере.',
    cta: 'Разместить рекламу',
    url: 'https://example.com/ads',
    image: null,
  },
  news: [
    { title: 'Лаунчер вышел в бету', date: '2026-11-13', text: 'Лицензия и офлайн, моды через Modrinth, Fabric / Quilt / Forge.', url: null },
    { title: 'Мониторинг серверов скоро', date: '2026-11-10', text: 'Голосуйте за любимые сервера и получайте награды.', url: null },
  ],
  promoted: [
    { name: 'Ваш сервер', address: 'play.example.com', tag: 'Промо', ad: true },
  ],
};

async function load(url) {
  if (!url || url.includes('example.com')) return { ...DEMO, demo: true };
  try { return { ...DEMO, ...(await json(url)), demo: false }; }
  catch { return { ...DEMO, demo: true }; }
}

module.exports = { load };
