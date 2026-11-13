// Автоматическая установка нужной Java (Eclipse Temurin JRE через Adoptium API)
const fs = require('fs');
const path = require('path');
const os = require('os');
const paths = require('./paths');
const { download } = require('./net');

const OS = { win32: 'windows', darwin: 'mac', linux: 'linux' }[process.platform];
const ARCH = { x64: 'x64', arm64: 'aarch64', ia32: 'x32' }[process.arch] || 'x64';
const EXE = process.platform === 'win32' ? 'javaw.exe' : 'java';

function findJava(dir) {
  if (!fs.existsSync(dir)) return null;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.name === EXE && path.basename(d) === 'bin') return full;
    }
  }
  return null;
}

/** Нужная мажорная версия Java по метаданным версии MC */
function requiredJava(meta) {
  return meta?.javaVersion?.majorVersion || 8;
}

async function ensure(major, onProgress) {
  // Adoptium не публикует 16 — берём 17
  if (major === 16) major = 17;
  const dir = path.join(paths.runtime, `java-${major}`);
  const existing = findJava(dir);
  if (existing) return existing;

  const ext = OS === 'windows' ? 'zip' : 'tar.gz';
  const url = `https://api.adoptium.net/v3/binary/latest/${major}/ga/${OS}/${ARCH}/jre/hotspot/normal/eclipse`;
  const archive = path.join(paths.cache, `java-${major}.${ext}`);
  await download(url, archive, (l, t) => onProgress && onProgress({ task: `Java ${major}`, loaded: l, total: t }));

  fs.mkdirSync(dir, { recursive: true });
  if (ext === 'zip') {
    const AdmZip = require('adm-zip');
    new AdmZip(archive).extractAllTo(dir, true);
  } else {
    const tar = require('tar');
    await tar.x({ file: archive, cwd: dir });
  }
  fs.rmSync(archive, { force: true });

  const bin = findJava(dir);
  if (!bin) throw new Error('Не удалось распаковать Java');
  if (process.platform !== 'win32') fs.chmodSync(bin, 0o755);
  return bin;
}

module.exports = { ensure, requiredJava, totalMemoryMb: () => Math.floor(os.totalmem() / 1024 / 1024) };
