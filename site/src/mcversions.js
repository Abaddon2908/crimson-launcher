// Автообновление списка версий Minecraft на сайте.
// Раз в сутки забираем официальный список Mojang и добавляем в tags.VERSIONS релизы новее
// самой свежей известной версии. Снапшоты пропускаем. Найденные версии сохраняем в настройках,
// чтобы после перезапуска они были на месте даже без доступа к Mojang.
const { settings } = require('./db');
const tags = require('./tags');

const MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const KEY = 'mc_versions_auto';
const DAY = 24 * 3600 * 1000;

function saved() {
  try { return JSON.parse(settings.get(KEY) || '[]').filter(tags.isVersion); } catch { return []; }
}

/** Добавляет версии в общий список (тот же массив, на который ссылаются все страницы) */
function merge(list) {
  const added = [];
  for (const v of list) {
    if (!tags.isVersion(v) || tags.VERSIONS.includes(v)) continue;
    tags.VERSIONS.push(v);
    added.push(v);
  }
  if (added.length) tags.VERSIONS.sort((a, b) => tags.cmp(b, a));
  return added;
}

/** Новые релизы из списка Mojang: только новее самой свежей версии, что у нас уже есть */
function newReleases(manifest, known) {
  const top = known.reduce((m, v) => (tags.cmp(v, m) > 0 ? v : m), known[0] || '0');
  return (manifest.versions || [])
    .filter((v) => v.type === 'release' && tags.isVersion(v.id) && tags.cmp(v.id, top) > 0)
    .map((v) => v.id);
}

async function refresh() {
  const res = await fetch(MANIFEST, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'MC-Monitoring' } });
  if (!res.ok) throw new Error(`Mojang ответил ${res.status}`);
  const fresh = newReleases(await res.json(), tags.VERSIONS);
  const added = merge(fresh);
  if (added.length) {
    settings.set(KEY, JSON.stringify([...new Set([...saved(), ...added])]));
    console.log(`[versions] добавлены версии Minecraft: ${added.join(', ')}`);
  }
  return added;
}

function start() {
  merge(saved());
  const run = () => refresh().catch((e) => console.warn(`[versions] не удалось обновить список версий: ${e.message}`));
  setTimeout(run, 5000).unref();
  setInterval(run, DAY).unref();
}

module.exports = { start, refresh, newReleases, merge };
