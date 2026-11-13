// Версии Minecraft и модлоадеров
const fs = require('fs');
const path = require('path');
const paths = require('./paths');
const { cachedJson } = require('./net');

// Кэш на диске — чтобы играть без интернета после первого запуска
const diskFile = path.join(paths.cache, 'version_manifest.json');
async function withDisk(file, fn) {
  try {
    const v = await fn();
    fs.writeFileSync(file, JSON.stringify(v));
    return v;
  } catch (e) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    throw new Error('Нет подключения к интернету');
  }
}

const MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

async function minecraft() {
  const m = await withDisk(diskFile, () => cachedJson(MANIFEST));
  return {
    latest: m.latest,
    versions: m.versions.map((v) => ({ id: v.id, type: v.type, url: v.url, releaseTime: v.releaseTime })),
  };
}

async function versionMeta(id) {
  const { versions } = await minecraft();
  const v = versions.find((x) => x.id === id);
  if (!v) throw new Error(`Версия ${id} не найдена`);
  const file = path.join(paths.versions, id, `${id}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return withDisk(file, () => cachedJson(v.url, 24 * 3600 * 1000));
}

async function fabricLoaders(mc) {
  const list = await cachedJson(`https://meta.fabricmc.net/v2/versions/loader/${mc}`);
  return list.map((x) => ({ id: x.loader.version, stable: x.loader.stable }));
}

async function quiltLoaders(mc) {
  const list = await cachedJson(`https://meta.quiltmc.org/v3/versions/loader/${mc}`);
  return list.map((x) => ({ id: x.loader.version, stable: !/beta|pre/.test(x.loader.version) }));
}

async function forgeLoaders(mc) {
  const promos = await cachedJson('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json');
  const out = [];
  const rec = promos.promos[`${mc}-recommended`];
  const lat = promos.promos[`${mc}-latest`];
  if (rec) out.push({ id: rec, stable: true });
  if (lat && lat !== rec) out.push({ id: lat, stable: false });
  return out;
}

async function loaders(loader, mc) {
  try {
    if (loader === 'fabric') return await fabricLoaders(mc);
    if (loader === 'quilt') return await quiltLoaders(mc);
    if (loader === 'forge') return await forgeLoaders(mc);
  } catch (e) {
    // 4xx — загрузчик не поддерживает версию; сетевые ошибки пробрасываем
    if (!/HTTP 4\d\d/.test(e.message)) throw new Error('Нет подключения к серверам загрузчика');
  }
  return [];
}

module.exports = { minecraft, versionMeta, loaders };
