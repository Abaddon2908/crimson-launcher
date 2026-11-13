// Сквозной тест ядра лаунчера без Electron: офлайн-аккаунт → сборки → загрузка → запуск игры.
// Успех запуска = игра дошла до строки "Setting user" (JVM, classpath, аргументы и загрузчик работают).
const Module = require('module');
const path = require('path');
const os = require('os');
const fs = require('fs');

const DATA = path.join(os.tmpdir(), 'nlauncher-e2e');
fs.rmSync(DATA, { recursive: true, force: true });
fs.mkdirSync(DATA, { recursive: true });
const stub = path.join(DATA, 'electron-stub.js');
fs.writeFileSync(stub, `module.exports = { app: { getPath: () => ${JSON.stringify(DATA)} } };`);
const orig = Module._resolveFilename;
Module._resolveFilename = function (r, ...a) { return r === 'electron' ? stub : orig.call(this, r, ...a); };

const C = path.join(__dirname, '..', 'src', 'core');
const auth = require(path.join(C, 'auth'));
const instances = require(path.join(C, 'instances'));
const versions = require(path.join(C, 'versions'));
const mods = require(path.join(C, 'mods'));
const servers = require(path.join(C, 'servers'));
const launch = require(path.join(C, 'launch'));

const results = [];
const ok = (name, detail = '') => { results.push({ name, ok: true, detail }); console.log(`✅ ${name} ${detail}`); };
const fail = (name, err) => { results.push({ name, ok: false, detail: String(err?.message || err) }); console.log(`❌ ${name}: ${err?.stack || err}`); };

function runGame(inst, timeoutMs = 15 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    let done = false, tail = [];
    const finish = (fn, v) => { if (!done) { done = true; clearTimeout(t); launch.stop(); fn(v); } };
    const t = setTimeout(() => finish(reject, new Error('timeout\n' + tail.join('\n'))), timeoutMs);
    launch.start(inst.id, (e) => {
      if (e.log) {
        tail.push(e.log.trim()); tail = tail.slice(-40);
        if (/Setting user:/.test(e.log)) finish(resolve, e.log.trim());
        // Forge открывает окно загрузки до "Setting user"; на CI без видеокарты оно падает, поэтому
        // для Forge успехом считаем старт ModLauncher с нашими аргументами (установка и classpath верны).
        if (inst.loader === 'forge' && /ModLauncher running: args/.test(e.log)) finish(resolve, 'ModLauncher running (CI без GPU)');
      } else if (e.stage === 'closed') {
        finish(reject, new Error(`игра закрылась (код ${e.code}) до "Setting user"\n` + tail.join('\n')));
      } else if (e.stage && e.stage !== 'download') console.log(`   · ${e.stage} ${e.task || ''}`);
    }).catch((err) => finish(reject, err));
  });
}

(async () => {
  const only = process.argv[2];
  try { auth.addOffline('NeoTest'); const a = await auth.authorization(); ok('офлайн-аккаунт', a.name); } catch (e) { fail('офлайн-аккаунт', e); }
  try { const m = await versions.minecraft(); ok('манифест версий', `latest=${m.latest.release}, всего ${m.versions.length}`); } catch (e) { fail('манифест версий', e); }
  for (const l of [['fabric', '1.21.1'], ['quilt', '1.21.1'], ['forge', '1.20.1']]) {
    try { const v = await versions.loaders(...l); if (!v.length) throw new Error('пусто'); ok(`версии ${l[0]} ${l[1]}`, v[0].id); } catch (e) { fail(`версии ${l[0]}`, e); }
  }

  const fab = instances.create({ name: 'E2E Fabric', mc: '1.21.1', loader: 'fabric' });
  try {
    const r = await mods.search({ query: 'sodium', instanceId: fab.id });
    ok('поиск Modrinth', r.hits.slice(0, 3).map((h) => h.title).join(', '));
    const files = await mods.install({ projectId: 'AANobbMI', instanceId: fab.id });
    ok('установка мода + зависимости', files.join(', '));
    const files2 = await mods.install({ projectId: 'mOgUt4GM', instanceId: fab.id }); // Mod Menu (требует Fabric API)
    ok('установка Mod Menu', files2.join(', '));
    const loc = mods.local(fab.id); mods.toggle(fab.id, loc[0].file); mods.toggle(fab.id, loc[0].file + '.disabled');
    ok('вкл/выкл мода', `${loc.length} файлов`);
  } catch (e) { fail('моды', e); }

  try { const p = await servers.ping('mc.hypixel.net'); if (!p.online) throw new Error(p.error); ok('пинг сервера', `${p.players}/${p.max}, ${p.ping}мс`); } catch (e) { fail('пинг сервера', e); }

  const games = [
    ['vanilla', { name: 'E2E Vanilla', mc: '1.21.1', loader: 'vanilla' }],
    ['fabric', fab],
    ['quilt', { name: 'E2E Quilt', mc: '1.20.1', loader: 'quilt' }],
    ['forge', { name: 'E2E Forge', mc: '1.20.1', loader: 'forge' }],
    ['old', { name: 'E2E 1.12.2', mc: '1.12.2', loader: 'vanilla' }],
  ];
  for (const [key, spec] of games) {
    if (only && only !== key) continue;
    const inst = spec.id ? spec : instances.create(spec);
    const t0 = Date.now();
    try { const line = await runGame(inst); ok(`запуск ${inst.name}`, `${Math.round((Date.now() - t0) / 1000)}с — ${line.slice(-60)}`); }
    catch (e) { fail(`запуск ${inst.name}`, e); }
    await new Promise((r) => setTimeout(r, 3000));
  }

  const md = ['| Проверка | Итог | Детали |', '|---|---|---|', ...results.map((r) => `| ${r.name} | ${r.ok ? '✅' : '❌'} | ${r.detail.split('\n')[0].replace(/\|/g, '/').slice(0, 140)} |`)].join('\n');
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
  console.log('\n' + md);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
})();
