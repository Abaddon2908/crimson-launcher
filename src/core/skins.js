// Скины: лицензия — официальный API Minecraft; без лицензии — загрузка на сайт мониторинга
// (постоянная ссылка для SkinsRestorer: /skin url …, и выдача для мода CustomSkinLoader).
const fs = require('fs');
const store = require('./store');
const auth = require('./auth');
const { UA } = require('./net');

const MC = 'https://api.minecraftservices.com/minecraft/profile';

/** Проверка PNG-скина: 64×64 (или старый 64×32) и не больше 64 КБ */
function checkPng(buf) {
  if (!buf || buf.length < 33 || buf.length > 64 * 1024) throw new Error('Скин должен быть PNG до 64 КБ');
  if (buf.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Это не PNG-картинка');
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  if (w !== 64 || (h !== 64 && h !== 32)) throw new Error(`Скин должен быть 64×64 пикселя, а у файла ${w}×${h}`);
}
const dataUrl = (buf) => `data:image/png;base64,${buf.toString('base64')}`;

async function fetchPng(url) {
  // текстуры Mojang отдаются по http — забираем по https; остальные адреса как есть
  const r = await fetch(url.replace(/^http:\/\/textures\.minecraft\.net\//, 'https://textures.minecraft.net/'), { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`Не удалось загрузить скин (${r.status})`);
  return Buffer.from(await r.arrayBuffer());
}

async function mcProfile(token) {
  const r = await fetch(MC, { headers: { Authorization: `Bearer ${token}`, 'User-Agent': UA } });
  if (!r.ok) throw new Error(`Сервис Minecraft ответил ${r.status}`);
  return r.json();
}

async function profileView(p) {
  const skin = (p.skins || []).find((s) => s.state === 'ACTIVE');
  return {
    type: 'microsoft',
    skin: skin ? { image: dataUrl(await fetchPng(skin.url)), variant: skin.variant === 'SLIM' ? 'slim' : 'classic' } : null,
    capes: await Promise.all((p.capes || []).map(async (c) => ({
      id: c.id, name: c.alias || 'Плащ', active: c.state === 'ACTIVE',
      // картинку загружаем только для надетого плаща: она нужна предпросмотру
      image: c.state === 'ACTIVE' ? dataUrl(await fetchPng(c.url).catch(() => Buffer.alloc(0))) : null,
    }))),
  };
}

/** Текущий скин активного аккаунта */
async function current(site) {
  const acc = auth.active();
  if (!acc) return { type: 'none' };
  if (acc.type === 'microsoft') return { name: acc.name, ...(await profileView(await mcProfile(await auth.minecraftToken(acc.id)))) };
  const saved = store.read('skins').byNick[acc.name.toLowerCase()];
  return {
    type: 'offline', name: acc.name,
    skin: saved ? { image: `data:image/png;base64,${saved.png}`, variant: saved.variant } : null,
    site: saved ? { url: saved.url, page: saved.page, command: saved.command } : null,
    cape: saved?.cape || null,
    capeImage: saved?.capePng ? `data:image/png;base64,${saved.capePng}` : null,
    siteBase: site,
  };
}

/** Прочитать выбранный пользователем файл */
function readFile(file) {
  const buf = fs.readFileSync(file);
  checkPng(buf);
  return { image: dataUrl(buf), png: buf.toString('base64') };
}

/** Лицензия: установить скин через официальный API */
async function applyMojang(pngBase64, variant) {
  const buf = Buffer.from(pngBase64, 'base64');
  checkPng(buf);
  const token = await auth.minecraftToken();
  const form = new FormData();
  form.append('variant', variant === 'slim' ? 'slim' : 'classic');
  form.append('file', new Blob([buf], { type: 'image/png' }), 'skin.png');
  const r = await fetch(`${MC}/skins`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'User-Agent': UA }, body: form });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(r.status === 429 ? 'Слишком часто — подождите минуту и попробуйте снова' : `Сервис Minecraft не принял скин (${r.status}) ${t.slice(0, 120)}`);
  }
  return profileView(await r.json());
}

/** Лицензия: надеть плащ (id) или снять (null) */
async function setCape(capeId) {
  const token = await auth.minecraftToken();
  const r = await fetch(`${MC}/capes/active`, {
    method: capeId ? 'PUT' : 'DELETE',
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': UA, 'Content-Type': 'application/json' },
    body: capeId ? JSON.stringify({ capeId }) : undefined,
  });
  if (!r.ok) throw new Error(`Не удалось сменить плащ (${r.status})`);
  return profileView(await r.json());
}

/** Без лицензии: загрузить скин на сайт мониторинга под ником активного аккаунта */
async function uploadSite(site, pngBase64, variant, cape) {
  const acc = auth.active();
  if (!acc || acc.type !== 'offline') throw new Error('Нужен аккаунт без лицензии');
  if (!site) throw new Error('В настройках лаунчера не указан сайт');
  checkPng(Buffer.from(pngBase64, 'base64'));
  const s = store.read('skins');
  const r = await fetch(`${site.replace(/\/$/, '')}/api/skins`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ nick: acc.name, variant, png: pngBase64, token: s.token || undefined, cape: cape || null }),
    signal: AbortSignal.timeout(15000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Сайт ответил ${r.status}`);
  s.token = d.token; // один секрет на этот компьютер: им закреплены ники
  const capePng = d.cape && d.capeUrl ? (await fetchPng(d.capeUrl).catch(() => null))?.toString('base64') || null : null;
  s.byNick[acc.name.toLowerCase()] = { png: pngBase64, variant: d.variant, url: d.url, page: d.page, command: d.command, code: d.code, cape: d.cape || null, capePng };
  store.write('skins', s);
  return current(site);
}

const siteBase = (site) => { if (!site) throw new Error('В настройках лаунчера не указан сайт'); return site.replace(/\/$/, ''); };
async function siteJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Сайт ответил ${r.status}`);
  return d;
}

/** Каталог скинов с сайта: { cat, style, q, page } */
function catalog(site, p = {}) {
  const q = new URLSearchParams();
  for (const k of ['cat', 'style', 'q', 'page']) if (p[k]) q.set(k, String(p[k]));
  q.set('per', '36');
  return siteJson(`${siteBase(site)}/api/skins/catalog?${q}`);
}
/** Плащи NLauncher (для игроков без лицензии) */
const capes = (site) => siteJson(`${siteBase(site)}/api/capes`);

/** Скачать выбранный скин (и плащ) из каталога для предпросмотра */
async function catalogGet(url, capeUrl) {
  const buf = await fetchPng(url);
  checkPng(buf);
  const cape = capeUrl ? await fetchPng(capeUrl).catch(() => null) : null;
  return { image: dataUrl(buf), png: buf.toString('base64'), capeImage: cape ? dataUrl(cape) : null };
}

/** Без лицензии: надеть плащ NLauncher (код) или снять (null) — скин уже должен быть на сайте */
async function siteCape(site, code) {
  const acc = auth.active();
  if (!acc || acc.type !== 'offline') throw new Error('Плащи NLauncher — для аккаунтов без лицензии');
  const s = store.read('skins');
  const saved = s.byNick[acc.name.toLowerCase()];
  if (!saved) throw new Error('Сначала сохраните скин');
  const r = await fetch(`${siteBase(site)}/api/skins/cape`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ nick: acc.name, token: s.token, cape: code || null }), signal: AbortSignal.timeout(15000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Сайт ответил ${r.status}`);
  saved.cape = d.cape || null;
  saved.capePng = d.capeUrl ? (await fetchPng(d.capeUrl).catch(() => null))?.toString('base64') || null : null;
  store.write('skins', s);
  return current(site);
}

/** Сбросить скин: лицензия — стандартный скин аккаунта; без лицензии — убрать скин с сайта */
async function reset(site) {
  const acc = auth.active();
  if (!acc) throw new Error('Нет аккаунта');
  if (acc.type === 'microsoft') {
    const token = await auth.minecraftToken(acc.id);
    const r = await fetch(`${MC}/skins/active`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}`, 'User-Agent': UA } });
    if (!r.ok) throw new Error(`Сервис Minecraft не сбросил скин (${r.status})`);
    return { name: acc.name, ...(await profileView(await r.json())) };
  }
  const s = store.read('skins');
  const key = acc.name.toLowerCase();
  if (s.byNick[key] && site) {
    const r = await fetch(`${site.replace(/\/$/, '')}/api/skins/reset`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
      body: JSON.stringify({ nick: acc.name, token: s.token }), signal: AbortSignal.timeout(15000),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Сайт ответил ${r.status}`);
  }
  delete s.byNick[key];
  store.write('skins', s);
  return current(site);
}

module.exports = { catalog, capes, catalogGet, siteCape, reset, current, readFile, applyMojang, setCape, uploadSite, checkPng };
