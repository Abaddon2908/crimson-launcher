// Скины игроков без лицензии внутри игры: ставим клиентский мод CustomSkinLoader
// и добавляем источник скинов nlauncher.ru (формат CustomSkinAPI).
// Так игроки NLauncher видят скины друг друга даже на серверах без SkinsRestorer.
// Любая ошибка здесь не мешает запуску игры.
const fs = require('fs');
const path = require('path');
const mods = require('./mods');

const PROJECT = 'customskinloader'; // проект на Modrinth
const LOADERS = ['fabric', 'quilt', 'forge', 'neoforge'];

function hasMod(gameDir) {
  const dir = path.join(gameDir, 'mods');
  return fs.existsSync(dir) && fs.readdirSync(dir).some((f) => /customskinloader/i.test(f) && !f.endsWith('.disabled'));
}

/**
 * Источник скинов для CSL. Мод опрашивает источники из loadlist по очереди и ждёт ответа каждого:
 * если NLauncher стоит в конце, скин появляется с задержкой (сначала Mojang, LittleSkin и др.).
 * Поэтому ставим NLauncher первым. До первого запуска мода конфига ещё нет — тогда кладём
 * файл в ExtraList (мод добавит источник сам), а на следующем запуске поправим порядок.
 */
function writeSource(gameDir, site) {
  const root = `${site.replace(/\/$/, '')}/skinapi/`;
  const entry = { name: 'NLauncher', type: 'CustomSkinAPI', root };
  const cfgFile = path.join(gameDir, 'CustomSkinLoader', 'CustomSkinLoader.json');
  let cfg = null;
  try { cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8')); } catch { /* мод ещё не запускался или конфиг повреждён */ }
  if (cfg && Array.isArray(cfg.loadlist)) {
    const first = cfg.loadlist[0];
    if (first && first.root === root && first.type === 'CustomSkinAPI') return false;
    cfg.loadlist = [entry, ...cfg.loadlist.filter((e) => e && e.name !== 'NLauncher' && e.root !== root)];
    fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2));
    return true;
  }
  const extra = path.join(gameDir, 'CustomSkinLoader', 'ExtraList');
  fs.mkdirSync(extra, { recursive: true });
  fs.writeFileSync(path.join(extra, 'NLauncher.json'), JSON.stringify(entry, null, 2));
  return true;
}

/** Перед запуском: inst — сборка, gameDir — её папка, site — адрес мониторинга */
async function ensure(inst, gameDir, site, log) {
  if (!site || !LOADERS.includes(inst.loader)) return;
  if (!hasMod(gameDir)) {
    try {
      const files = await mods.install({ projectId: PROJECT, instanceId: inst.id, type: 'mod' });
      log(`[NLauncher] Установлен мод скинов: ${files.join(', ')}`);
    } catch (e) {
      log(`[NLauncher] Мод скинов не установлен (${e.message}) — игра запустится без него`);
      return;
    }
  }
  try { if (writeSource(gameDir, site)) log('[NLauncher] Источник скинов NLauncher поставлен первым'); } catch (e) { log(`[NLauncher] Не удалось настроить мод скинов: ${e.message}`); }
}

module.exports = { ensure, writeSource, hasMod };
