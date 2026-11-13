// Простое JSON-хранилище: settings / accounts / instances
const fs = require('fs');
const path = require('path');
const paths = require('./paths');

const DEFAULTS = {
  settings: {
    memoryMin: 1024,
    memoryMax: 4096,
    javaPath: '',
    autoJava: true,
    width: 1280,
    height: 720,
    fullscreen: false,
    jvmArgs: '',
    closeOnLaunch: false,
    showConsole: false,
    accent: 'wine',
    animations: true,
    lastInstance: null,
    servers: [],
  },
  accounts: { active: null, list: [] },
  instances: { list: [] },
};

function file(name) { return path.join(paths.data, `${name}.json`); }

function read(name) {
  try {
    const raw = JSON.parse(fs.readFileSync(file(name), 'utf8'));
    return { ...structuredClone(DEFAULTS[name]), ...raw };
  } catch {
    return structuredClone(DEFAULTS[name]);
  }
}

function write(name, data) {
  const tmp = file(name) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file(name));
  return data;
}

function patch(name, partial) { return write(name, { ...read(name), ...partial }); }

module.exports = { read, write, patch };
