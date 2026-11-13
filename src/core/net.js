const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const UA = 'NLauncher/0.2 (+https://nlauncher.ru)';

async function json(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { 'User-Agent': UA, ...(opts.headers || {}) } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

const memo = new Map();
async function cachedJson(url, ttl = 10 * 60 * 1000) {
  const hit = memo.get(url);
  if (hit && Date.now() - hit.t < ttl) return hit.v;
  const v = await json(url);
  memo.set(url, { t: Date.now(), v });
  return v;
}

/** Скачивание файла с прогрессом: onProgress(loaded, total) */
async function download(url, dest, onProgress) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  const total = Number(res.headers.get('content-length')) || 0;
  let loaded = 0;
  const body = Readable.fromWeb(res.body);
  body.on('data', (c) => { loaded += c.length; onProgress && onProgress(loaded, total); });
  const tmp = dest + '.part';
  await pipeline(body, fs.createWriteStream(tmp));
  fs.renameSync(tmp, dest);
  return dest;
}

module.exports = { json, cachedJson, download, UA };
