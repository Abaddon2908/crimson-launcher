// Запуск игры через minecraft-launcher-core
const fs = require('fs');
const path = require('path');
const { Client } = require('minecraft-launcher-core');
const paths = require('./paths');
const store = require('./store');
const auth = require('./auth');
const java = require('./java');
const versions = require('./versions');
const instances = require('./instances');
const { json, download } = require('./net');

let running = null; // { client, instanceId, started }

async function prepareLoader(inst, emit) {
  if (inst.loader === 'fabric' || inst.loader === 'quilt') {
    const base = inst.loader === 'fabric' ? 'https://meta.fabricmc.net/v2' : 'https://meta.quiltmc.org/v3';
    let lv = inst.loaderVersion;
    if (!lv) {
      const list = await versions.loaders(inst.loader, inst.mc);
      lv = (list.find((x) => x.stable) || list[0])?.id;
      if (!lv) throw new Error(`${inst.loader} не поддерживает ${inst.mc}`);
    }
    emit({ stage: 'loader', task: `${inst.loader} ${lv}` });
    const profile = await json(`${base}/versions/loader/${inst.mc}/${lv}/profile/json`);
    const dir = path.join(paths.versions, profile.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${profile.id}.json`), JSON.stringify(profile));
    return { custom: profile.id };
  }
  if (inst.loader === 'forge') {
    let lv = inst.loaderVersion;
    if (!lv) {
      const list = await versions.loaders('forge', inst.mc);
      lv = list[0]?.id;
      if (!lv) throw new Error(`Forge не поддерживает ${inst.mc}`);
    }
    const full = `${inst.mc}-${lv}`;
    const jar = path.join(paths.cache, 'forge', `forge-${full}-installer.jar`);
    if (!fs.existsSync(jar)) {
      await download(
        `https://maven.minecraftforge.net/net/minecraftforge/forge/${full}/forge-${full}-installer.jar`, jar,
        (l, t) => emit({ stage: 'loader', task: `Forge ${lv}`, loaded: l, total: t }),
      );
    }
    return { forge: jar };
  }
  return {};
}

async function start(instanceId, emit, server = null) {
  if (running) throw new Error('Игра уже запущена');
  const inst = instances.get(instanceId);
  if (!inst) throw new Error('Сборка не найдена');
  const s = store.read('settings');

  emit({ stage: 'auth', task: 'Авторизация' });
  const authorization = await auth.authorization();

  emit({ stage: 'meta', task: `Minecraft ${inst.mc}` });
  const meta = await versions.versionMeta(inst.mc);

  let javaPath = s.javaPath;
  if (!javaPath || s.autoJava) {
    javaPath = await java.ensure(java.requiredJava(meta), (p) => emit({ stage: 'java', ...p }));
  }

  const loader = await prepareLoader(inst, emit);
  const gameDir = paths.instance(inst.id);
  fs.mkdirSync(gameDir, { recursive: true });

  const memMax = inst.memoryMax || s.memoryMax;
  const opts = {
    root: paths.root,
    authorization,
    javaPath,
    version: { number: inst.mc, type: meta.type, ...(loader.custom ? { custom: loader.custom } : {}) },
    ...(loader.forge ? { forge: loader.forge } : {}),
    memory: { max: `${memMax}M`, min: `${Math.min(s.memoryMin, memMax)}M` },
    window: { width: s.width, height: s.height, fullscreen: s.fullscreen },
    overrides: { gameDirectory: gameDir, detached: false },
    ...(server ? { quickPlay: { type: 'multiplayer', identifier: server } } : {}),
    customArgs: s.jvmArgs ? s.jvmArgs.split(/\s+/).filter(Boolean) : [],
  };

  const client = new Client();
  running = { client, instanceId, started: Date.now() };

  client.on('progress', (e) => emit({ stage: 'download', task: e.type, loaded: e.task, total: e.total }));
  client.on('download-status', (e) => emit({ stage: 'download', task: e.name, loaded: e.current, total: e.total }));
  client.on('debug', (d) => emit({ log: String(d) }));
  client.on('data', (d) => {
    const line = String(d);
    emit({ log: line });
    if (/Setting user:|LWJGL|Backend library/.test(line)) emit({ stage: 'running', task: 'Игра запущена' });
  });
  client.on('close', (code) => {
    const played = Math.round((Date.now() - running.started) / 1000);
    const cur = instances.get(instanceId);
    if (cur) instances.update(instanceId, { lastPlayed: Date.now(), playtime: (cur.playtime || 0) + played });
    running = null;
    emit({ stage: 'closed', code });
  });

  emit({ stage: 'download', task: 'Проверка файлов' });
  store.patch('settings', { lastInstance: instanceId });
  const proc = await client.launch(opts);
  if (!proc) {
    running = null;
    throw new Error('Не удалось запустить игру — смотрите консоль');
  }
  emit({ stage: 'started', task: 'Запуск…' });
  running.proc = proc;
  return true;
}

function stop() {
  if (running?.proc) running.proc.kill();
}

function status() { return running ? { instanceId: running.instanceId, started: running.started } : null; }

module.exports = { start, stop, status };
