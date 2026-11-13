// Моды: поиск и установка через Modrinth, управление локальными файлами
const fs = require('fs');
const path = require('path');
const paths = require('./paths');
const instances = require('./instances');
const { json, download } = require('./net');

const API = 'https://api.modrinth.com/v2';

async function search({ query = '', instanceId, type = 'mod', offset = 0, sort = 'relevance' }) {
  const inst = instanceId && instances.get(instanceId);
  const facets = [[`project_type:${type}`]];
  if (inst) {
    facets.push([`versions:${inst.mc}`]);
    if (type === 'mod' && inst.loader !== 'vanilla') facets.push([`categories:${inst.loader}`]);
  }
  const q = new URLSearchParams({ query, limit: '20', offset: String(offset), index: sort, facets: JSON.stringify(facets) });
  const r = await json(`${API}/search?${q}`);
  return {
    total: r.total_hits,
    hits: r.hits.map((h) => ({
      id: h.project_id, slug: h.slug, title: h.title, description: h.description,
      icon: h.icon_url, downloads: h.downloads, author: h.author, categories: h.display_categories,
    })),
  };
}

function folderFor(type) {
  return { mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks' }[type] || 'mods';
}

async function install({ projectId, instanceId, type = 'mod' }, onProgress, seen = new Set()) {
  if (seen.has(projectId)) return [];
  seen.add(projectId);
  const inst = instances.get(instanceId);
  if (!inst) throw new Error('Сборка не найдена');

  const q = new URLSearchParams({ game_versions: JSON.stringify([inst.mc]) });
  if (type === 'mod' && inst.loader !== 'vanilla') {
    // Quilt совместим с большинством Fabric-модов
    q.set('loaders', JSON.stringify(inst.loader === 'quilt' ? ['quilt', 'fabric'] : [inst.loader]));
  }
  const versions = await json(`${API}/project/${projectId}/version?${q}`);
  if (!versions.length) throw new Error(`Нет версии под ${inst.loader} ${inst.mc}`);
  const v = versions[0];
  const file = v.files.find((f) => f.primary) || v.files[0];
  const dir = path.join(paths.instance(inst.id), folderFor(type));
  await download(file.url, path.join(dir, file.filename), (l, t) => onProgress && onProgress({ task: file.filename, loaded: l, total: t }));

  const installed = [file.filename];
  for (const dep of v.dependencies || []) {
    if (dep.dependency_type === 'required' && dep.project_id) {
      try { installed.push(...await install({ projectId: dep.project_id, instanceId, type }, onProgress, seen)); } catch { /* пропускаем */ }
    }
  }
  return installed;
}

function local(instanceId, type = 'mod') {
  const dir = path.join(paths.instance(instanceId), folderFor(type));
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => /\.(jar|zip)(\.disabled)?$/i.test(f))
    .map((f) => {
      const st = fs.statSync(path.join(dir, f));
      return { file: f, name: f.replace(/\.disabled$/, ''), enabled: !f.endsWith('.disabled'), size: st.size };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function toggle(instanceId, file, type = 'mod') {
  const dir = path.join(paths.instance(instanceId), folderFor(type));
  const next = file.endsWith('.disabled') ? file.replace(/\.disabled$/, '') : `${file}.disabled`;
  fs.renameSync(path.join(dir, file), path.join(dir, next));
  return local(instanceId, type);
}

function remove(instanceId, file, type = 'mod') {
  fs.rmSync(path.join(paths.instance(instanceId), folderFor(type), path.basename(file)), { force: true });
  return local(instanceId, type);
}

function folder(instanceId, type = 'mod') {
  const dir = path.join(paths.instance(instanceId), folderFor(type));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

module.exports = { search, install, local, toggle, remove, folder };
