// Каталог тегов (режимы, мини-игры, донат…) и версий Minecraft.
// slug используется в адресах SEO-страниц: /servera-vyzhivanie/, /servera-1.21/
const { slugify } = require('./seo');

const GROUPS = [
  ['Режимы игры', ['Выживание', 'Анархия', 'СМП', 'Ванильные', 'PvP', 'PvE', 'Гриф', 'Приват', 'Без привата', 'Экономика', 'Кланы', 'RPG', 'Roleplay', 'Хардкор', 'Ивенты', 'Квесты', 'Города', 'Политические', 'Военные', 'Хоррор', 'Креатив']],
  ['Мини-игры', ['С мини-играми', 'Бед Варс', 'Скай Варс', 'Скайблок', 'Один блок', 'Дуэли', 'Голодные игры', 'Build battle', 'Паркур', 'Прятки', 'Тюрьма', 'Лаки блоки', 'Столбы удачи', 'Box PvP', 'Egg wars', 'Маньяк', 'Королевская битва']],
  ['Донат и бонусы', ['Без доната', 'Донат', 'Бесплатный донат', 'Бесплатная админка', 'Кит старт', 'Кейсы', 'Без вайпов']],
  ['Возможности', ['С плагинами', 'Голосовой чат', 'Питомцы', 'Магия', 'Работы', 'Авто-шахта', 'Телепорт /rtp', 'Свадьбы', 'Кастомные предметы']],
  ['Моды', ['С модами', 'Без модов', 'Техно', 'Магические моды', 'Оружие', 'Машины']],
  ['Доступ и язык', ['Лицензия', 'Пиратские', 'Без лаунчера', 'Русские', 'Украинские', 'Казахстанские', 'Большой онлайн', 'Пустые', 'Bedrock (PE)']],
];

const TAGS = [];
for (const [group, names] of GROUPS) for (const name of names) TAGS.push({ name, group, slug: slugify(name) });
const BY_SLUG = new Map(TAGS.map((t) => [t.slug, t]));
const BY_NAME = new Map(TAGS.map((t) => [t.name.toLowerCase(), t]));

// Версии Java Edition (новые сверху). 26.x — новая нумерация Mojang.
const VERSIONS = [
  '26.3', '26.2', '26.1',
  '1.21.11', '1.21.10', '1.21.8', '1.21.5', '1.21.4', '1.21.1', '1.21',
  '1.20.6', '1.20.4', '1.20.1', '1.20', '1.19.4', '1.19.2', '1.19', '1.18.2', '1.18',
  '1.17.1', '1.16.5', '1.16.4', '1.15.2', '1.14.4', '1.13.2', '1.12.2', '1.11.2', '1.10.2', '1.9.4', '1.8.9', '1.8', '1.7.10', '1.6.4', '1.5.2',
];
const cmp = (a, b) => {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
};
const isVersion = (v) => /^\d+(\.\d+){1,2}$/.test(String(v || ''));

/** Поддерживает ли сервер версию v. «1.21» на странице означает любую 1.21.x */
function serverSupports(s, v) {
  const min = s.version_min, max = s.version_max || s.version_min;
  if (!isVersion(min)) return false;
  const lo = cmp(min, max) <= 0 ? min : max;
  const hi = cmp(min, max) <= 0 ? max : min;
  const parts = v.split('.');
  // точная версия 1.21.4 или «семейство» 1.21 (все 1.21.x)
  const vMin = v, vMax = parts.length === 2 ? `${v}.99` : v;
  return cmp(lo, vMax) <= 0 && cmp(hi, vMin) >= 0;
}

/** Текст версий для карточек: «1.16.5 – 1.21.4» */
function versionLabel(s) {
  if (isVersion(s.version_min)) return s.version_max && s.version_max !== s.version_min ? `${s.version_min} – ${s.version_max}` : s.version_min;
  return s.version || '';
}

/** Нормализует теги из формы: только из каталога, до 12 штук */
function normalizeTags(list) {
  const out = [];
  for (const raw of [].concat(list || [])) {
    const t = BY_NAME.get(String(raw).trim().toLowerCase());
    if (t && !out.includes(t.name)) out.push(t.name);
  }
  return out.slice(0, 12);
}

module.exports = { GROUPS, TAGS, BY_SLUG, BY_NAME, VERSIONS, cmp, isVersion, serverSupports, versionLabel, normalizeTags };
