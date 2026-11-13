// Демо-данные для предпросмотра: node scripts/demo-seed.js
// Не запускайте на боевой базе — добавит выдуманные сервера и голоса.
const crypto = require('crypto');
const { db, now, DAY, markPaid } = require('../src/db');
const { hashPassword } = require('../src/auth');

const owner = db.prepare('SELECT id FROM users WHERE email = ?').get('demo@neodev.local')?.id
  ?? Number(db.prepare(`INSERT INTO users (email, name, pass, created) VALUES ('demo@neodev.local', 'Demo', ?, ?)`).run(hashPassword('demo12345'), now()).lastInsertRowid);

const servers = [
  ['CraftLands', 'play.craftlands.example', '1.16.5 – 1.21', 'Выживание, Мини-игры', 1840, 3000],
  ['Anarchy Zone', 'anarchy.example', '1.20.1', 'Анархия, PvP', 720, 1000],
  ['SkyRealm', 'sky.example:25570', '1.21.1', 'SkyBlock, Экономика', 412, 800],
  ['Техно Мир', 'tech.example', '1.12.2', 'Моды, Индустриальный', 233, 500],
  ['Ванилла+', 'vanilla.example', '1.21.4', 'Выживание, Ванилла', 96, 200],
  ['PixelRPG', 'rpg.example', '1.20.4', 'RPG, Данжи', 54, 300],
];

for (const [name, address, version, tags, players, max] of servers) {
  if (db.prepare('SELECT 1 FROM servers WHERE address = ?').get(address)) continue;
  const id = Number(db.prepare(`INSERT INTO servers (owner_id, name, address, version, tags, description, status, online, players, max_players, motd, ping_ms, game_version, last_ping, vote_secret, created)
    VALUES (?, ?, ?, ?, ?, ?, 'approved', 1, ?, ?, ?, ?, ?, ?, ?, ?)`).run(owner, name, address, version, tags,
    `${name} — дружелюбный сервер с ${tags.toLowerCase()}.\nЕженедельные ивенты, честная администрация и без доната на силу.`,
    players, max, `Добро пожаловать на ${name}!`, 20 + Math.floor(Math.random() * 60), version, now(), crypto.randomBytes(24).toString('hex'), now() - 40 * DAY).lastInsertRowid);
  const ins = db.prepare('INSERT INTO pings (server_id, ts, online, players) VALUES (?, ?, 1, ?)');
  for (let t = now() - 30 * DAY; t < now(); t += 30 * 60000) {
    const h = new Date(t).getHours();
    const wave = 0.55 + 0.45 * Math.sin(((h - 9) / 24) * Math.PI * 2);
    ins.run(id, t, Math.max(0, Math.round(players * wave * (0.85 + Math.random() * 0.3))));
  }
  const votes = Math.floor(players / 3 + Math.random() * 80);
  const vi = db.prepare('INSERT INTO votes (server_id, nickname, ip, ts) VALUES (?, ?, ?, ?)');
  for (let i = 0; i < votes; i++) vi.run(id, `Player${i}`, `10.0.${id}.${i}`, now() - Math.random() * 10 * DAY);
}

const byName = (n) => db.prepare('SELECT id FROM servers WHERE name = ?').get(n).id;
const order = (server, code, extra = {}) => {
  const p = db.prepare('SELECT * FROM products WHERE code = ?').get(code);
  const r = db.prepare(`INSERT INTO orders (user_id, server_id, product_id, kind, title, amount, days, provider, banner_title, banner_text, created)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'yoomoney', ?, ?, ?)`).run(owner, server, p.id, p.kind, p.title, p.price, p.days, extra.t || '', extra.x || '', now());
  markPaid(Number(r.lastInsertRowid), 'yoomoney', 'demo');
};
if (!db.prepare(`SELECT 1 FROM orders WHERE provider_ref = 'demo'`).get()) {
  order(byName('SkyRealm'), 'promo_7');
  order(byName('CraftLands'), 'banner_7', { t: 'CraftLands — новый сезон!', x: 'Вайп 15 ноября: новые данжи, кланы и ивенты каждые выходные.' });
  order(byName('Техно Мир'), 'highlight_30');
}
if (!db.prepare('SELECT 1 FROM news').get()) {
  db.prepare('INSERT INTO news (title, text, created) VALUES (?, ?, ?)').run('Мониторинг запущен', 'Добавляйте свои сервера — модерация до 24 часов.', now() - DAY);
  db.prepare('INSERT INTO news (title, text, created) VALUES (?, ?, ?)').run('NLauncher 0.2', 'Новый дизайн, свои списки и чекбоксы, автотесты на Windows.', now());
}
console.log('Демо-данные добавлены. Владелец: demo@neodev.local / demo12345');
