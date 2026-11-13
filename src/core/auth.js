// Аккаунты: лицензия (Microsoft) и офлайн (без лицензии)
const crypto = require('crypto');
const store = require('./store');

function offlineUuid(name) {
  // Как в ванильном сервере: UUID v3 от "OfflinePlayer:<name>"
  const md5 = crypto.createHash('md5').update(`OfflinePlayer:${name}`).digest();
  md5[6] = (md5[6] & 0x0f) | 0x30;
  md5[8] = (md5[8] & 0x3f) | 0x80;
  const h = md5.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function publicView(a) {
  return { id: a.id, name: a.name, type: a.type, uuid: a.uuid };
}

function list() {
  const s = store.read('accounts');
  return { active: s.active, list: s.list.map(publicView) };
}

function save(acc) {
  const s = store.read('accounts');
  s.list = s.list.filter((x) => x.id !== acc.id);
  s.list.push(acc);
  s.active = acc.id;
  store.write('accounts', s);
  return list();
}

function addOffline(name) {
  name = String(name || '').trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) throw new Error('Ник: 3–16 символов, латиница, цифры и _');
  const uuid = offlineUuid(name);
  return save({ id: `offline:${uuid}`, type: 'offline', name, uuid });
}

async function addMicrosoft() {
  const { Auth } = require('msmc');
  const manager = new Auth('select_account');
  const xbox = await manager.launch('electron', { title: 'Вход в Microsoft', width: 520, height: 680, resizable: false });
  const mc = await xbox.getMinecraft();
  if (!mc.profile) throw new Error('На этом аккаунте нет лицензии Minecraft');
  return save({
    id: `ms:${mc.profile.id}`,
    type: 'microsoft',
    name: mc.profile.name,
    uuid: mc.profile.id,
    refresh: xbox.save(),
  });
}

function remove(id) {
  const s = store.read('accounts');
  s.list = s.list.filter((x) => x.id !== id);
  if (s.active === id) s.active = s.list[0]?.id || null;
  store.write('accounts', s);
  return list();
}

function select(id) {
  store.patch('accounts', { active: id });
  return list();
}

/** Возвращает объект авторизации для minecraft-launcher-core */
async function authorization() {
  const s = store.read('accounts');
  const acc = s.list.find((x) => x.id === s.active);
  if (!acc) throw new Error('Добавьте аккаунт, чтобы играть');

  if (acc.type === 'offline') {
    return {
      access_token: crypto.randomUUID().replace(/-/g, ''),
      client_token: crypto.randomUUID().replace(/-/g, ''),
      uuid: acc.uuid.replace(/-/g, ''),
      name: acc.name,
      user_properties: '{}',
      meta: { type: 'mojang', demo: false },
    };
  }

  const { Auth } = require('msmc');
  const manager = new Auth('select_account');
  const xbox = await manager.refresh(acc.refresh);
  const mc = await xbox.getMinecraft();
  acc.refresh = xbox.save();
  acc.name = mc.profile?.name || acc.name;
  save(acc);
  return mc.mclc();
}

module.exports = { list, addOffline, addMicrosoft, remove, select, authorization };
