// SEO: человекочитаемые адреса, абсолютные ссылки, структурированные данные
const { settings } = require('./db');

const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };

/** «Техно Мир» → «tehno-mir» */
function slugify(s) {
  return String(s || '').toLowerCase().split('').map((c) => (c in TR ? TR[c] : c)).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'server';
}

/** Адрес страницы сервера: /server/12-craftlands */
const serverPath = (s) => `/server/${s.id}-${slugify(s.name)}`;

const siteUrl = () => (settings.get('site_url') || '').replace(/\/$/, '');
const abs = (p) => (/^https?:\/\//.test(p || '') ? p : siteUrl() + (p || '/'));

module.exports = { slugify, serverPath, siteUrl, abs };
