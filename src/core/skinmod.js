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

/** Источник скинов для CSL: файл в ExtraList, мод сам добавит его в список при запуске */
function writeSource(gameDir, site) {
  const root = `${site.replace(/\/$/, '')}/skinapi/`;
  const cfgFile = path.join(gameDir, 'CustomSkinLoader', 'CustomSkinLoader.json');
  try { if (fs.readFileSync(cfgFile, 'utf8').includes(root)) return false; } catch { /* мод ещё не запускался */ }
  const extra = path.join(gameDir, 'CustomSkinLoader', 'ExtraList');
  fs.mkdirSync(extra, { recursive: true });
  fs.writeFileSync(path.join(extra, 'NLauncher.json'), JSON.stringify({ name: 'NLauncher', type: 'CustomSkinAPI', root }, null, 2));
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
  if (writeSource(gameDir, site)) log('[NLauncher] Добавлен источник скинов NLauncher');
}

module.exports = { ensure, writeSource, hasMod };
