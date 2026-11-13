const { app, BrowserWindow, ipcMain, shell, nativeTheme } = require('electron');
const path = require('path');

app.setName('NLauncher');
nativeTheme.themeSource = 'dark';

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 720,
    minWidth: 980,
    minHeight: 620,
    frame: false,
    backgroundColor: '#0a0607',
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  if (process.argv.includes('--dev')) win.webContents.openDevTools({ mode: 'detach' });
}

app.whenReady().then(() => {
  // модули ядра требуют готового app (пути appData)
  const core = {
    config: require(path.join(__dirname, '..', 'config.json')),
    store: require('./core/store'),
    paths: require('./core/paths'),
    auth: require('./core/auth'),
    versions: require('./core/versions'),
    instances: require('./core/instances'),
    mods: require('./core/mods'),
    servers: require('./core/servers'),
    feed: require('./core/feed'),
    launch: require('./core/launch'),
    java: require('./core/java'),
  };

  const send = (ch, data) => win && !win.isDestroyed() && win.webContents.send(ch, data);

  const handle = (ch, fn) => ipcMain.handle(ch, async (_e, ...args) => {
    try { return { ok: true, data: await fn(...args) }; }
    catch (err) { console.error(ch, err); return { ok: false, error: err?.message || String(err) }; }
  });

  // окно
  ipcMain.on('win:min', () => win.minimize());
  ipcMain.on('win:max', () => (win.isMaximized() ? win.unmaximize() : win.maximize()));
  ipcMain.on('win:close', () => win.close());
  handle('open:url', (url) => shell.openExternal(url));
  handle('open:path', (p) => shell.openPath(p));

  // общее
  handle('app:info', () => ({
    config: core.config, version: app.getVersion(), platform: process.platform,
    totalMemory: core.java.totalMemoryMb(), root: core.paths.root,
  }));
  handle('settings:get', () => core.store.read('settings'));
  handle('settings:set', (p) => core.store.patch('settings', p));

  // аккаунты
  handle('accounts:list', () => core.auth.list());
  handle('accounts:offline', (name) => core.auth.addOffline(name));
  handle('accounts:microsoft', () => core.auth.addMicrosoft());
  handle('accounts:remove', (id) => core.auth.remove(id));
  handle('accounts:select', (id) => core.auth.select(id));

  // версии
  handle('versions:mc', () => core.versions.minecraft());
  handle('versions:loaders', (loader, mc) => core.versions.loaders(loader, mc));

  // сборки
  handle('instances:list', async () => {
    const list = core.instances.all();
    const fix = list.filter((i) => i.mc === '__latest__');
    if (fix.length) {
      try {
        const { latest } = await core.versions.minecraft();
        fix.forEach((i) => core.instances.update(i.id, { mc: latest.release, name: `Vanilla ${latest.release}` }));
      } catch { /* нет сети — обновим при следующем запуске */ }
    }
    return core.instances.all();
  });
  handle('instances:create', (d) => core.instances.create(d));
  handle('instances:update', (id, p) => core.instances.update(id, p));
  handle('instances:remove', (id) => core.instances.remove(id));
  handle('instances:folder', (id) => shell.openPath(core.paths.instance(id)));

  // моды
  handle('mods:search', (q) => core.mods.search(q));
  handle('mods:install', (q) => core.mods.install(q, (p) => send('mods:progress', p)));
  handle('mods:local', (id, t) => core.mods.local(id, t));
  handle('mods:toggle', (id, f, t) => core.mods.toggle(id, f, t));
  handle('mods:remove', (id, f, t) => core.mods.remove(id, f, t));
  handle('mods:folder', (id, t) => shell.openPath(core.mods.folder(id, t)));

  // сервера / сайт
  handle('servers:ping', (addr) => core.servers.ping(addr));
  handle('feed:load', () => core.feed.load(core.config.feedUrl));

  // игра
  handle('game:launch', async (id, server) => {
    await core.launch.start(id, (e) => send('game:event', e), server);
    if (core.store.read('settings').closeOnLaunch) win.hide();
    return true;
  });
  handle('game:stop', () => core.launch.stop());
  handle('game:status', () => core.launch.status());
  ipcMain.on('game:closed-show', () => win.show());

  core.instances.ensureDefault();
  createWindow();
});

app.on('window-all-closed', () => app.quit());
