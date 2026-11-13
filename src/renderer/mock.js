// Мок API для предпросмотра интерфейса в обычном браузере (в Electron не используется)
if (!window.api) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let settings = { memoryMin: 1024, memoryMax: 4096, autoJava: true, javaPath: '', width: 1280, height: 720, fullscreen: false, jvmArgs: '', closeOnLaunch: false, showConsole: false, animations: true, servers: [{ name: 'Мой сервер', address: 'mc.example.ru' }] };
  let accounts = { active: 'offline:1', list: [{ id: 'offline:1', type: 'offline', name: 'Notch', uuid: '1' }, { id: 'ms:2', type: 'microsoft', name: 'jeb_', uuid: '853c80ef3c3749fdaa49938b674adae6' }] };
  let instances = [
    { id: 'a1', name: 'Fabric 1.21.1 — PvP', mc: '1.21.1', loader: 'fabric', loaderVersion: '0.16.9', playtime: 18400 },
    { id: 'a2', name: 'Vanilla 1.21.4', mc: '1.21.4', loader: 'vanilla', playtime: 0 },
    { id: 'a3', name: 'Forge Техно', mc: '1.20.1', loader: 'forge', loaderVersion: '47.3.0', playtime: 5200 },
  ];
  const listeners = {};
  window.api = {
    win: { min() {}, max() {}, close() {}, show() {} },
    openUrl: async () => {}, openPath: async () => {}, copy: () => {},
    info: async () => ({ config: { brand: 'NLauncher', company: 'NeoDev', tagline: 'Играй красиво.', featuredServers: [{ name: 'Hypixel', address: 'mc.hypixel.net', tag: 'Мини-игры' }, { name: '2b2t', address: '2b2t.org', tag: 'Анархия' }] }, version: '0.1.0', platform: 'win32', totalMemory: 16384, root: 'C:\\Users\\you\\AppData\\Roaming\\.crimson' }),
    settings: { get: async () => settings, set: async (p) => (settings = { ...settings, ...p }) },
    accounts: { list: async () => accounts, offline: async (n) => { accounts.list.push({ id: 'o:' + n, type: 'offline', name: n, uuid: n }); accounts.active = 'o:' + n; return accounts; }, microsoft: async () => { throw new Error('Только в приложении'); }, remove: async (id) => { accounts.list = accounts.list.filter((a) => a.id !== id); return accounts; }, select: async (id) => { accounts.active = id; return accounts; } },
    versions: { mc: async () => ({ latest: { release: '1.21.4' }, versions: ['1.21.4', '1.21.3', '1.21.1', '1.20.6', '1.20.1', '1.19.4', '1.18.2', '1.16.5', '1.12.2'].map((id) => ({ id, type: 'release' })) }), loaders: async () => [{ id: '0.16.9', stable: true }, { id: '0.16.8', stable: true }] },
    instances: { list: async () => instances, create: async (d) => { const i = { id: 'n' + Date.now(), playtime: 0, ...d, name: d.name || 'Новая' }; instances.unshift(i); return i; }, update: async (id, p) => Object.assign(instances.find((i) => i.id === id), p), remove: async (id) => (instances = instances.filter((i) => i.id !== id)), folder: async () => {} },
    mods: {
      search: async () => { await wait(300); return { total: 3, hits: [
        { id: 'P7dR8mSH', slug: 'fabric-api', title: 'Fabric API', description: 'Lightweight and modular API providing common hooks and intercompatibility measures.', icon: 'https://cdn.modrinth.com/data/P7dR8mSH/icon.png', downloads: 98000000, author: 'modmuss50', categories: ['library'] },
        { id: 'AANobbMI', slug: 'sodium', title: 'Sodium', description: 'The fastest and most compatible rendering optimization mod for Minecraft.', icon: 'https://cdn.modrinth.com/data/AANobbMI/icon.png', downloads: 61000000, author: 'jellysquid3', categories: ['optimization'] },
        { id: 'gvQqBUqZ', slug: 'lithium', title: 'Lithium', description: 'No-compromises game logic optimization mod.', icon: 'https://cdn.modrinth.com/data/gvQqBUqZ/icon.png', downloads: 30000000, author: 'jellysquid3', categories: ['optimization'] },
      ] }; },
      install: async () => { await wait(700); return ['x.jar']; },
      local: async () => [{ file: 'sodium-0.6.jar', name: 'sodium-0.6.jar', enabled: true, size: 1200000 }, { file: 'journeymap.jar.disabled', name: 'journeymap.jar', enabled: false, size: 4200000 }],
      toggle: async () => [], remove: async () => [], folder: async () => {}, onProgress() {},
    },
    servers: { ping: async (a) => { await wait(400 + Math.random() * 600); return a.includes('example') && !a.startsWith('play') ? { online: false } : { online: true, players: Math.floor(Math.random() * 40000), max: 100000, ping: 30 + Math.floor(Math.random() * 90), version: 'Requires MC 1.8 / 1.21', motd: 'Лучший сервер — заходи!' }; } },
    feed: async () => ({ banner: { title: 'Здесь будет ваш мониторинг', text: 'Топ серверов, продвижение и рекламные места — прямо в лаунчере.', cta: 'Разместить рекламу', url: '#' }, news: [{ title: 'Лаунчер вышел в бету', date: '2026-11-13', text: 'Лицензия и офлайн, моды через Modrinth, Fabric / Quilt / Forge.' }, { title: 'Мониторинг серверов скоро', date: '2026-11-10', text: 'Голосуйте за любимые сервера и получайте награды.' }], promoted: [{ name: 'Ваш сервер', address: 'play.example.com', tag: 'Промо', ad: true, desc: 'Здесь может быть ваш сервер' }] }),
    game: {
      launch: async () => { const e = listeners.ev; const steps = [['auth', 'Авторизация'], ['java', 'Java 21', 30, 100], ['download', 'assets', 420, 1000], ['download', 'natives', 9, 10]]; for (const [stage, task, loaded, total] of steps) { e && e({ stage, task, loaded, total }); await wait(600); } e && e({ stage: 'started' }); return true; },
      stop: async () => listeners.ev && listeners.ev({ stage: 'closed', code: 0 }), status: async () => null, onEvent: (cb) => (listeners.ev = cb),
    },
  };
}
