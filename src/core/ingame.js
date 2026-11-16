// Платная услуга «Сервер в игре»: перед запуском добавляем оплаченные сервера
// в начало списка «Сетевая игра» (servers.dat) сборки.
// Правила:
//  - записи, которые игрок добавил сам, не трогаем никогда (даже если это тот же сервер);
//  - лаунчер помнит, что вставил сам (.nlauncher-ads.json), и убирает это, когда реклама закончилась.
const fs = require('fs');
const path = require('path');
const { T, read, write } = require('./nbt');

const MARK_FILE = '.nlauncher-ads.json';
const norm = (a) => String(a || '').trim().toLowerCase().replace(/:25565$/, '');
const emptyRoot = () => ({ name: '', value: { servers: { type: T.LIST, value: { elemType: T.COMPOUND, items: [] } } } });

/**
 * @param {string} gameDir папка сборки
 * @param {{name:string,address:string,icon?:string}[]} ads оплаченные сервера (по порядку показа)
 */
function apply(gameDir, ads = []) {
  const file = path.join(gameDir, 'servers.dat');
  const markFile = path.join(gameDir, MARK_FILE);
  let previous = [];
  try { previous = JSON.parse(fs.readFileSync(markFile, 'utf8')).map(norm); } catch { /* ещё ничего не вставляли */ }

  const wanted = [];
  const seen = new Set();
  for (const a of ads) {
    if (!a || !a.address || !a.name) continue;
    const k = norm(a.address);
    if (!/^[a-z0-9._-]+(:\d{1,5})?$/.test(k) || seen.has(k)) continue;
    seen.add(k); wanted.push(a);
    if (wanted.length >= 10) break;
  }
  if (!wanted.length && !previous.length) return { added: 0, removed: 0 };

  let root;
  if (fs.existsSync(file)) {
    try { root = read(fs.readFileSync(file)); } catch (e) {
      console.warn('[ingame] servers.dat не прочитан, не трогаем:', e.message);
      return { added: 0, removed: 0 };
    }
  } else root = emptyRoot();
  if (!root.value.servers || root.value.servers.type !== T.LIST) root.value.servers = emptyRoot().value.servers;

  const all = root.value.servers.value.items;
  const ipOf = (e) => norm(e && e.ip && e.ip.value);
  // записи игрока = всё, кроме того, что вставлял лаунчер
  const prev = new Set(previous);
  const user = all.filter((e) => !prev.has(ipOf(e)));
  const userIps = new Set(user.map(ipOf));
  const removed = all.length - user.length;

  // не дублируем сервер, который у игрока уже есть
  const insert = wanted.filter((a) => !userIps.has(norm(a.address)));
  const entries = insert.map((a) => {
    const e = { name: { type: T.STRING, value: String(a.name).slice(0, 64) }, ip: { type: T.STRING, value: String(a.address).trim() } };
    const icon = String(a.icon || '').replace(/^data:image\/png;base64,/, '');
    if (icon && /^[A-Za-z0-9+/=]+$/.test(icon) && icon.length < 60000) e.icon = { type: T.STRING, value: icon };
    return e;
  });

  root.value.servers.value = { elemType: T.COMPOUND, items: [...entries, ...user] };
  fs.mkdirSync(gameDir, { recursive: true });
  if (fs.existsSync(file) && !fs.existsSync(`${file}.nlauncher.bak`)) fs.copyFileSync(file, `${file}.nlauncher.bak`);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, write(root));
  fs.renameSync(tmp, file);
  fs.writeFileSync(markFile, JSON.stringify(insert.map((a) => a.address)));
  return { added: entries.length, removed };
}

module.exports = { apply };
