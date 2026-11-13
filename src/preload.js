const { contextBridge, ipcRenderer, clipboard } = require('electron');

const call = async (ch, ...args) => {
  const r = await ipcRenderer.invoke(ch, ...args);
  if (!r.ok) throw new Error(r.error);
  return r.data;
};

contextBridge.exposeInMainWorld('api', {
  win: {
    min: () => ipcRenderer.send('win:min'),
    max: () => ipcRenderer.send('win:max'),
    close: () => ipcRenderer.send('win:close'),
    show: () => ipcRenderer.send('game:closed-show'),
  },
  openUrl: (u) => call('open:url', u),
  openPath: (p) => call('open:path', p),
  copy: (text) => clipboard.writeText(String(text)),
  info: () => call('app:info'),
  settings: { get: () => call('settings:get'), set: (p) => call('settings:set', p) },
  accounts: {
    list: () => call('accounts:list'),
    offline: (n) => call('accounts:offline', n),
    microsoft: () => call('accounts:microsoft'),
    remove: (id) => call('accounts:remove', id),
    select: (id) => call('accounts:select', id),
  },
  versions: { mc: () => call('versions:mc'), loaders: (l, mc) => call('versions:loaders', l, mc) },
  instances: {
    list: () => call('instances:list'),
    create: (d) => call('instances:create', d),
    update: (id, p) => call('instances:update', id, p),
    remove: (id) => call('instances:remove', id),
    folder: (id) => call('instances:folder', id),
  },
  mods: {
    search: (q) => call('mods:search', q),
    install: (q) => call('mods:install', q),
    local: (id, t) => call('mods:local', id, t),
    toggle: (id, f, t) => call('mods:toggle', id, f, t),
    remove: (id, f, t) => call('mods:remove', id, f, t),
    folder: (id, t) => call('mods:folder', id, t),
    onProgress: (cb) => ipcRenderer.on('mods:progress', (_e, d) => cb(d)),
  },
  servers: { ping: (a) => call('servers:ping', a) },
  feed: () => call('feed:load'),
  game: {
    launch: (id, server) => call('game:launch', id, server),
    stop: () => call('game:stop'),
    status: () => call('game:status'),
    onEvent: (cb) => ipcRenderer.on('game:event', (_e, d) => cb(d)),
  },
});
