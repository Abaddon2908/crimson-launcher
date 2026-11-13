const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const ROOT = path.join(app.getPath('appData'), '.crimson');

const paths = {
  root: ROOT,
  instances: path.join(ROOT, 'instances'),
  runtime: path.join(ROOT, 'runtime'),
  cache: path.join(ROOT, 'cache'),
  versions: path.join(ROOT, 'versions'),
  data: path.join(ROOT, 'launcher'),
};

for (const p of Object.values(paths)) fs.mkdirSync(p, { recursive: true });

paths.instance = (id) => path.join(paths.instances, id);
paths.mods = (id) => path.join(paths.instances, id, 'mods');

module.exports = paths;
