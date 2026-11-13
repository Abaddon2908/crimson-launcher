// Сборки (инстансы): своя папка игры, версия, модлоадер
const fs = require('fs');
const crypto = require('crypto');
const store = require('./store');
const paths = require('./paths');

function all() { return store.read('instances').list; }
function get(id) { return all().find((i) => i.id === id); }

function create({ name, mc, loader = 'vanilla', loaderVersion = null, icon = null }) {
  if (!mc) throw new Error('Выберите версию');
  const inst = {
    id: crypto.randomUUID().slice(0, 8),
    name: (name || '').trim() || `${loader === 'vanilla' ? 'Vanilla' : loader[0].toUpperCase() + loader.slice(1)} ${mc}`,
    mc, loader, loaderVersion, icon,
    created: Date.now(), lastPlayed: null, playtime: 0,
    memoryMax: null, // null = из общих настроек
  };
  fs.mkdirSync(paths.mods(inst.id), { recursive: true });
  const s = store.read('instances');
  s.list.unshift(inst);
  store.write('instances', s);
  return inst;
}

function update(id, partial) {
  const s = store.read('instances');
  const i = s.list.findIndex((x) => x.id === id);
  if (i < 0) throw new Error('Сборка не найдена');
  s.list[i] = { ...s.list[i], ...partial, id };
  store.write('instances', s);
  return s.list[i];
}

function remove(id, deleteFiles = true) {
  const s = store.read('instances');
  s.list = s.list.filter((x) => x.id !== id);
  store.write('instances', s);
  if (deleteFiles) fs.rmSync(paths.instance(id), { recursive: true, force: true });
  return s.list;
}

function ensureDefault() {
  if (all().length === 0) {
    return create({ name: 'Последний релиз', mc: '__latest__', loader: 'vanilla' });
  }
}

module.exports = { all, get, create, update, remove, ensureDefault };
