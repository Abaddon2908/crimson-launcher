// Генератор оригинального каталога скинов и плащей NLauncher.
// Всё рисуется кодом (без чужих картинок), поэтому каталог можно свободно раздавать.
// Результат детерминирован: одинаковый набор при каждом запуске (seed).
const zlib = require('zlib');

/* ---------- PNG ---------- */
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, px) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(px.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/* ---------- цвета и случайность ---------- */
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
const shade = (c, f) => c && [clamp(c[0] * f), clamp(c[1] * f), clamp(c[2] * f)];
const mix = (a, b, t) => [clamp(a[0] + (b[0] - a[0]) * t), clamp(a[1] + (b[1] - a[1]) * t), clamp(a[2] + (b[2] - a[2]) * t)];

class Tex {
  constructor(w, h, rnd) { this.w = w; this.h = h; this.px = new Uint8Array(w * h * 4); this.rnd = rnd; }
  set(x, y, c, noise = 0.035) {
    if (!c || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const n = 1 + (this.rnd() * 2 - 1) * noise;
    const i = (y * this.w + x) * 4;
    this.px[i] = clamp(c[0] * n); this.px[i + 1] = clamp(c[1] * n); this.px[i + 2] = clamp(c[2] * n); this.px[i + 3] = 255;
  }
  /**
   * Коробка развёртки Minecraft: u,v — угол, w×h×d — размер. paint(face, x, y, W, H) → цвет или null.
   * face: top, bottom, right, front, left, back. Для боковых граней передаём f — «насколько близко к лицу» (0..1).
   */
  box(u, v, w, h, d, paint) {
    const faces = [
      ['top', u + d, v, w, d], ['bottom', u + d + w, v, w, d],
      ['right', u, v + d, d, h], ['front', u + d, v + d, w, h],
      ['left', u + d + w, v + d, d, h], ['back', u + 2 * d + w, v + d, w, h],
    ];
    const light = { top: 1.08, bottom: 0.78, right: 0.88, front: 1, left: 0.88, back: 0.93 };
    for (const [face, fx, fy, W, H] of faces) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const f = face === 'right' ? (W > 1 ? x / (W - 1) : 1) : face === 'left' ? (W > 1 ? 1 - x / (W - 1) : 1) : face === 'front' ? 1 : 0;
        const c = paint(face, x, y, W, H, f);
        if (c) this.set(fx + x, fy + y, shade(c, light[face] * (1 - 0.05 * (y / Math.max(1, H - 1)))));
      }
    }
  }
}

/* ---------- палитры ---------- */
const SKIN = ['#f5d6b8', '#eac29f', '#d9a47e', '#bd825c', '#93603f', '#634029'].map(hex);
const HAIR = [
  ['#1e1a1b'], ['#3a2417'], ['#6a4226'], ['#986639'], ['#d8b064'], ['#ece0c2'], ['#b4532a'], ['#962a32'], ['#e58db6'], ['#4a6ed0'], ['#e8e8ee'], ['#7b4fc0'],
].map(([h]) => hex(h));
const EYES = ['#5a3a22', '#3c6fd6', '#3e9a4f', '#6b7280', '#b8791f', '#8a4fd0', '#2b2b33'].map(hex);
// [цвет, им. м.р., предл. м/ср, предл. ж, предл. мн]
const COLORS = [
  ['#b8323c', 'красный', 'красном', 'красной', 'красных'], ['#3557b7', 'синий', 'синем', 'синей', 'синих'],
  ['#2f8a4c', 'зелёный', 'зелёном', 'зелёной', 'зелёных'], ['#26232a', 'чёрный', 'чёрном', 'чёрной', 'чёрных'],
  ['#e9e6e2', 'белый', 'белом', 'белой', 'белых'], ['#6f727a', 'серый', 'сером', 'серой', 'серых'],
  ['#e3b33a', 'жёлтый', 'жёлтом', 'жёлтой', 'жёлтых'], ['#6b3fb0', 'фиолетовый', 'фиолетовом', 'фиолетовой', 'фиолетовых'],
  ['#e38fb4', 'розовый', 'розовом', 'розовой', 'розовых'], ['#7a2030', 'бордовый', 'бордовом', 'бордовой', 'бордовых'],
  ['#e07a2e', 'оранжевый', 'оранжевом', 'оранжевой', 'оранжевых'], ['#2aa3a0', 'бирюзовый', 'бирюзовом', 'бирюзовой', 'бирюзовых'],
  ['#4b5f3a', 'хаки', 'хаки', 'хаки', 'хаки'], ['#8a5a3a', 'коричневый', 'коричневом', 'коричневой', 'коричневых'],
].map(([h, ...n]) => ({ c: hex(h), n }));
const METALS = [
  { c: hex('#c9ccd2'), name: 'железных', fem: 'железных' }, { c: hex('#e6bb3f'), name: 'золотых' },
  { c: hex('#5fd3cf'), name: 'бирюзовых' }, { c: hex('#c06a3c'), name: 'медных' }, { c: hex('#4a4450'), name: 'тёмных' },
];
const DENIM = [hex('#34507e'), hex('#2a3a5c'), hex('#4f6a96'), hex('#2b2b30'), hex('#7a6a58'), hex('#5a5f66')];

/* ---------- части тела ---------- */
// [u, v] базового и второго слоя; руки: ширина 4 (Steve) или 3 (Alex)
const P = {
  head: [0, 0], hat: [32, 0], body: [16, 16], jacket: [16, 32],
  rArm: [40, 16], rSleeve: [40, 32], lArm: [32, 48], lSleeve: [48, 48],
  rLeg: [0, 16], rPant: [0, 32], lLeg: [16, 48], lPant: [0, 48],
};

function character(o, rnd) {
  const t = new Tex(64, 64, rnd);
  const aw = o.slim ? 3 : 4;
  const { skin, hair, eye } = o;
  const light = (hair[0] + hair[1] + hair[2]) / 3 > 170; // светлые волосы — мягче рисунок, иначе выглядят «в клетку»
  const hairCol = (x, y) => shade(hair, (x * 7 + y * 3) % 5 === 0 ? (light ? 1.04 : 1.12) : (x + y) % 3 === 0 ? (light ? 0.95 : 0.9) : 1);

  /* голова */
  t.box(...P.head, 8, 8, 8, (face, x, y, W, H, f) => {
    if (face === 'top') return hairCol(x, y);
    if (face === 'bottom') return shade(skin, 0.9);
    const long = o.hairStyle === 'long' || o.hairStyle === 'pony' || o.hairStyle === 'bob';
    if (face === 'back') return (long || y < 6) ? hairCol(x, y) : skin;
    if (face === 'right' || face === 'left') {
      if (o.hairStyle === 'long') return hairCol(x, y);
      if (o.hairStyle === 'bob') return y < 6 ? hairCol(x, y) : skin;
      if (o.hairStyle === 'buzz') return y < 2 || (f < 0.4 && y < 5) ? hairCol(x, y) : skin;
      return y < 3 || (f < 0.6 && y < 6) ? hairCol(x, y) : skin;
    }
    // лицо
    if (y < 2 || (y === 2 && o.hairStyle === 'side' && x < 5) || (y === 2 && o.hairStyle === 'fringe')) return o.hairStyle === 'buzz' && y === 1 ? skin : hairCol(x, y);
    if ((o.hairStyle === 'long' || o.hairStyle === 'bob') && (x === 0 || x === 7) && y < (o.hairStyle === 'long' ? 8 : 6)) return hairCol(x, y);
    if (y === 3 && (x === 1 || x === 2 || x === 5 || x === 6)) return o.female ? shade(hair, 0.55) : shade(hair, 0.8); // брови / ресницы
    if (y === 4) {
      if (x === 1 || x === 6) return [245, 245, 245];
      if (x === 2 || x === 5) return eye;
    }
    if (o.female && y === 5 && (x === 1 || x === 6)) return mix(skin, [232, 120, 130], 0.28); // румянец
    if (y === 6 && (x === 3 || x === 4)) return o.female ? mix(skin, [190, 70, 85], 0.45) : shade(skin, 0.78);
    if (y === 5 && (x === 3 || x === 4)) return shade(skin, 0.93);
    return skin;
  });

  /* объём причёски и головные уборы — второй слой головы */
  t.box(...P.hat, 8, 8, 8, (face, x, y, W, H, f) => {
    if (o.headwear === 'hood') {
      if (face === 'front') return (y < 2 || x === 0 || x === 7) ? shade(o.main, y === 1 && x > 0 && x < 7 ? 0.8 : 1) : null;
      if (face === 'bottom') return null;
      return shade(o.main, 0.95);
    }
    if (o.headwear === 'mask' && face === 'front' && y >= 5) return shade(o.main, 0.95);
    if (o.headwear === 'mask' && (face === 'left' || face === 'right') && y >= 5) return shade(o.main, 0.9);
    if (o.headwear === 'band' && y === 2 && face !== 'top' && face !== 'bottom') return o.accent;
    if (o.headwear === 'cap') {
      if (face === 'top') return y < 7 ? o.accent : shade(o.accent, 0.8);
      if (face === 'front') return y === 0 ? o.accent : y === 1 ? shade(o.accent, 0.75) : null;
      if (face === 'right' || face === 'left' || face === 'back') return y < 2 ? o.accent : null;
      return null;
    }
    if (o.headwear === 'helmet') {
      if (face === 'top') return shade(o.metal, 1.05);
      if (face === 'bottom') return null;
      if (face === 'front') return y < 2 || ((x === 0 || x === 7) && y < 6) || (y < 4 && (x === 3 || x === 4)) ? shade(o.metal, y === 1 ? 0.85 : 1) : null;
      return y < 6 ? shade(o.metal, y === 5 ? 0.8 : 1) : null;
    }
    // объём волос
    if (o.hairStyle === 'long' || o.hairStyle === 'pony') {
      if (face === 'back') return hairCol(x, y);
      if ((face === 'right' || face === 'left') && f < 0.5) return hairCol(x, y);
      if (face === 'top' && y < 6) return hairCol(x, y);
    }
    if (o.hairStyle === 'spiky' && (face === 'top' || (face === 'front' && y === 0 && x % 2 === 0))) return hairCol(x, y);
    return null;
  });

  /* туловище */
  const top = o.top;
  t.box(...P.body, 8, 12, 4, (face, x, y, W) => {
    const front = face === 'front';
    if (top === 'armor') {
      const edge = x === 0 || x === W - 1 || y === 0 || y === 11;
      if (front && y >= 9) return y === 9 ? shade(o.metal, 0.7) : o.pants;
      return shade(o.metal, edge ? 0.78 : front && (x === 3 || x === 4) && y < 8 ? 1.12 : 1);
    }
    if (top === 'robe') {
      if (front && (x === 3 || x === 4)) return o.accent;
      if (y === 7) return shade(o.accent, 0.8);
      return o.main;
    }
    if (top === 'suit') {
      if (front && (x === 3 || x === 4) && y < 9) return y === 0 ? [240, 240, 240] : (o.tie ? o.accent : [240, 240, 240]);
      if (front && (x === 2 || x === 5) && y < 7) return [235, 235, 235];
      return o.main;
    }
    if (top === 'dress') {
      if (y === 6) return o.accent;
      if (front && y === 0 && x > 1 && x < 6) return skin;
      return o.main;
    }
    if (top === 'sport') {
      if (front && y >= 3 && y <= 6 && (x === 3 || x === 4)) return o.accent; // номер
      if (y === 0) return o.accent;
      if (y >= 9) return o.pants;
      return o.main;
    }
    if (top === 'ninja') {
      if (y === 7 || y === 8) return o.accent;
      if (front && y < 6 && x === 3 + (y % 2)) return shade(o.main, 0.75);
      return o.main;
    }
    // футболка, свитер, худи, куртка: база — рубашка
    if (front && y === 0 && x > 2 && x < 5 && top === 'tshirt') return skin;
    if (front && top === 'tshirt' && o.print && y >= 3 && y <= 5 && x >= 2 && x <= 5 && ((x + y) % 2 === 0 || y === 4)) return o.accent;
    if (y >= 10 && top !== 'jacket') return shade(o.main, 0.82);
    return top === 'jacket' ? o.shirt : o.main;
  });

  /* второй слой туловища: куртки, худи, капюшоны */
  t.box(...P.jacket, 8, 12, 4, (face, x, y, W) => {
    const front = face === 'front';
    if (face === 'top' || face === 'bottom') return null;
    if (top === 'jacket') {
      if (front && x >= 3 && x <= 4) return null;
      if (front && (x === 2 || x === 5) && y < 4) return shade(o.main, 0.8); // лацканы
      return shade(o.main, y === 11 ? 0.85 : 1);
    }
    if (top === 'hoodie') {
      if (front && y >= 1 && y <= 4 && (x === 3 || x === 4) && y % 3 !== 0) return [238, 238, 238]; // шнурки
      if (front && y >= 7 && y <= 9 && x >= 1 && x <= 6) return shade(o.main, 0.85); // карман
      if (face === 'back' && y < 3) return shade(o.main, 0.8); // капюшон
      if (y === 11) return shade(o.main, 0.85);
      return null;
    }
    if (o.hairStyle === 'long' && face === 'back' && y < 4) return hairCol(x, y); // волосы на спине
    if (o.hairStyle === 'pony' && face === 'back' && y < 5 && x >= 3 && x <= 4) return hairCol(x, y);
    if (top === 'robe' && y >= 8) return o.main;
    if (top === 'armor' && front && y >= 2 && y <= 6 && x >= 2 && x <= 5) return (x === 2 || x === 5 || y === 2 || y === 6) ? shade(o.metal, 1.15) : o.accent; // герб
    return null;
  });

  /* руки */
  const arm = (uv, sleeveUv) => {
    t.box(...uv, aw, 12, 4, (face, x, y) => {
      if (face === 'bottom') return shade(skin, 0.95);
      if (top === 'armor') return y >= 9 ? shade(o.metal, 0.9) : y < 4 ? o.metal : o.under;
      if (top === 'tshirt' || top === 'sport') return y < 4 ? (y === 3 ? shade(o.main, 0.85) : o.main) : (face === 'top' ? o.main : skin);
      if (top === 'dress') return o.sleeves && y < 3 ? o.main : (face === 'top' && o.sleeves ? o.main : skin);
      if (y === 11) return skin;
      if (top === 'jacket') return o.shirt;
      if (top === 'robe' && y >= 9) return o.accent;
      return y === 10 ? shade(o.main, 0.85) : o.main;
    });
    t.box(...sleeveUv, aw, 12, 4, (face, x, y) => {
      if (face === 'top' || face === 'bottom') return null;
      if (top === 'jacket') return y < 11 ? shade(o.main, y === 10 ? 0.85 : 1) : null;
      if (top === 'armor') return y < 4 ? shade(o.metal, y === 3 ? 0.8 : 1.05) : null;
      if (top === 'robe') return y >= 8 && y < 11 ? o.main : null;
      return null;
    });
  };
  arm(P.rArm, P.rSleeve); arm(P.lArm, P.lSleeve);

  /* ноги */
  const leg = (uv, pantUv) => {
    t.box(...uv, 4, 12, 4, (face, x, y) => {
      if (face === 'bottom') return shade(o.shoes, 0.8);
      if (y >= 10) return shade(o.shoes, y === 11 ? 0.85 : 1);
      if (top === 'dress' || o.skirt) return y < 5 ? o.main : (o.socks ? o.socks : skin);
      if (top === 'robe') return o.main;
      if (top === 'armor') return y >= 6 ? o.metal : o.pants;
      if (top === 'sport') return y < 5 ? o.pants : y < 9 ? o.socks || [240, 240, 240] : skin;
      if (o.jeans && face === 'front' && x === 1 && y > 2) return shade(o.pants, 0.86);
      return o.pants;
    });
    t.box(...pantUv, 4, 12, 4, (face, x, y) => {
      if (face === 'top' || face === 'bottom') return null;
      if (top === 'dress' && y < 6) return y === 5 ? shade(o.main, 0.85) : o.main;
      if (top === 'robe' && y < 9) return y === 8 ? o.accent : o.main;
      if (top === 'armor' && y >= 6 && y < 9) return shade(o.metal, y === 6 ? 1.12 : 1);
      return null;
    });
  };
  leg(P.rLeg, P.rPant); leg(P.lLeg, P.lPant);
  return png(64, 64, t.px);
}

/* ---------- плащи (64×32) ---------- */
const CAPES = [
  ['nl', 'Багровый NL', '#8f2b36', '#e9b8bd'], ['night', 'Звёздная ночь', '#1d2147', '#f5e9a8'],
  ['flame', 'Пламя', '#b8321e', '#f3c242'], ['ocean', 'Океан', '#164a78', '#6fd0e6'],
  ['forest', 'Лес', '#2c5a2f', '#a8d47a'], ['royal', 'Королевский', '#4b2a86', '#e8c35a'],
  ['snow', 'Снежный', '#e6edf3', '#7aa4c8'], ['shadow', 'Тень', '#19171c', '#a3454f'],
  ['sunset', 'Закат', '#d0583a', '#5b2a6e'], ['mint', 'Мята', '#3fb59c', '#eaf7ef'],
  ['checker', 'Шахматный', '#2b2b30', '#e7e3dc'], ['heart', 'Сердце', '#e48fb0', '#b02a4a'],
  ['gold', 'Золотой', '#c8952c', '#fff1b8'], ['stripes', 'Полосатый', '#2d4f8c', '#e9e6e2'],
].map(([id, name, a, b]) => ({ id, name, a: hex(a), b: hex(b) }));

// NL 8×9 — пиксельные буквы для фирменного плаща
const NL = ['N...N.L.', 'NN..N.L.', 'N.N.N.L.', 'N..NN.L.', 'N...N.L.', 'N...N.L.', 'N...N.LLL', '', ''];
const STAR = ['..x..', '.xxx.', 'xxxxx', '.xxx.', '..x..'];
const HEART = ['.xx.xx.', 'xxxxxxx', 'xxxxxxx', '.xxxxx.', '..xxx..', '...x...'];

function cape(c, rnd) {
  const t = new Tex(64, 32, rnd);
  const face = (x, y, inside) => {
    if (inside) return shade(c.a, 0.7);
    const edge = x === 0 || x === 9 || y === 15;
    switch (c.id) {
      case 'nl': { const r = NL[y - 4]; if (r && r[x - 1] && r[x - 1] !== '.') return c.b; return edge ? shade(c.a, 0.7) : c.a; }
      case 'night': return (x * 7 + y * 13) % 17 === 0 || (x * 3 + y * 5) % 23 === 0 ? c.b : mix(c.a, [8, 8, 20], y / 30);
      case 'flame': return mix(c.a, c.b, Math.max(0, Math.min(1, (y - 3 + ((x * 5) % 3)) / 12)));
      case 'ocean': return (y + Math.round(Math.sin(x) * 1.2)) % 4 === 0 ? c.b : mix(c.a, [10, 30, 60], y / 24);
      case 'forest': return (y > 9 && (x + y) % 3 !== 0) || (y > 5 && x % 3 === 1 && y % 2 === 0) ? shade(c.b, 0.8) : c.a;
      case 'royal': if (edge || y === 1) return c.b; { const r = STAR[y - 5]; return r && r[x - 2] === 'x' ? c.b : c.a; }
      case 'snow': return (x * 5 + y * 7) % 11 === 0 ? c.b : c.a;
      case 'shadow': return edge ? c.b : c.a;
      case 'sunset': return mix(c.a, c.b, y / 15);
      case 'mint': return x === 4 || x === 5 ? c.b : c.a;
      case 'checker': return ((x >> 1) + (y >> 1)) % 2 ? c.a : c.b;
      case 'heart': { const r = HEART[y - 5]; return r && r[x - 1] === 'x' ? c.b : c.a; }
      case 'gold': return edge ? c.b : (x + y) % 4 === 0 ? shade(c.a, 1.15) : c.a;
      case 'stripes': return Math.floor(y / 2) % 2 ? c.b : c.a;
      default: return c.a;
    }
  };
  // плащ: 10×16×1 от (0,0)
  for (let y = 0; y < 16; y++) for (let x = 0; x < 10; x++) { t.set(1 + x, 1 + y, face(x, y, false)); t.set(12 + x, 1 + y, face(x, y, true)); }
  for (let y = 0; y < 16; y++) { t.set(0, 1 + y, shade(c.a, 0.8)); t.set(11, 1 + y, shade(c.a, 0.8)); }
  for (let x = 0; x < 10; x++) { t.set(1 + x, 0, shade(c.a, 0.9)); t.set(11 + x, 0, shade(c.a, 0.7)); }
  // элитры (22,0) 12×22 — в цвет плаща
  for (let y = 0; y < 22; y++) for (let x = 22; x < 46; x++) t.set(x, y, face((x - 22) % 10, Math.min(15, Math.floor(y * 0.75)), false));
  return png(64, 32, t.px);
}

/* ---------- каталог ---------- */
const FEM = { tshirt: 'футболке', sweater: 'свитере', hoodie: 'худи', jacket: 'куртке', suit: 'костюме', dress: 'платье', sport: 'форме', robe: 'мантии' };
// род предмета для согласования цвета: m — м/ср род (-ом), f — ж род (-ой)
const GENDER = { tshirt: 'f', sweater: 'm', hoodie: 'm', jacket: 'f', suit: 'm', dress: 'm', sport: 'f', robe: 'f' };
const STYLES = {
  tshirt: 'Повседневные', sweater: 'Повседневные', jacket: 'Повседневные', dress: 'Повседневные',
  hoodie: 'Спортивные', sport: 'Спортивные', suit: 'Деловые', armor: 'Воины', robe: 'Маги', ninja: 'Ниндзя',
};

function catalog() {
  const r = rng(20261126);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const capes = CAPES.map((c) => ({ id: c.id, name: c.name, png: cape(c, rng(c.id.length * 977 + c.name.length)) }));
  const out = [];
  const seen = new Set();
  const plan = [
    ['tshirt', 18, 0.5], ['sweater', 12, 0.5], ['hoodie', 18, 0.5], ['jacket', 16, 0.5], ['suit', 10, 0.4],
    ['dress', 14, 1], ['sport', 12, 0.4], ['armor', 18, 0.35], ['robe', 14, 0.5], ['ninja', 10, 0.4],
  ];
  for (const [top, count, femShare] of plan) {
    for (let i = 0; i < count; i++) {
      const female = r() < femShare;
      const col = pick(COLORS.filter((c) => !(top === 'suit' && ['розовый', 'жёлтый', 'оранжевый'].includes(c.n[0]))));
      const acc = pick(COLORS.filter((c) => c !== col));
      const metal = pick(METALS);
      const o = {
        female, slim: female, skin: pick(SKIN), eye: pick(EYES),
        hair: pick(female ? HAIR : HAIR.slice(0, 8).concat(HAIR.slice(9, 11))),
        hairStyle: female ? pick(['long', 'long', 'pony', 'bob', 'fringe']) : pick(['short', 'side', 'spiky', 'buzz', 'fringe']),
        top, main: top === 'ninja' ? pick([hex('#1e1c22'), hex('#2a2440'), hex('#3a1c20')]) : col.c, accent: acc.c,
        shirt: pick([hex('#efece6'), hex('#2a282e'), acc.c]), pants: top === 'suit' ? col.c : pick(DENIM),
        shoes: pick([hex('#2a2522'), hex('#5a3a26'), hex('#e8e6e2'), hex('#3a3f4a')]), jeans: r() < 0.6,
        metal: metal.c, under: hex('#4a3d34'), print: r() < 0.5, tie: !female || r() < 0.3, sleeves: r() < 0.5,
        socks: top === 'sport' ? acc.c : null, skirt: false,
        headwear: top === 'ninja' ? 'mask' : top === 'armor' && r() < 0.6 ? 'helmet' : top === 'robe' && r() < 0.45 ? 'hood'
          : top === 'sport' && r() < 0.4 ? 'cap' : top === 'hoodie' && r() < 0.25 ? 'hood' : r() < 0.08 ? 'band' : '',
      };
      if (top === 'ninja') o.pants = shade(o.main, 0.9);
      if (top === 'ninja') o.accent = pick([hex('#b8323c'), hex('#3557b7'), hex('#e3b33a'), hex('#2f8a4c'), hex('#eeeeee')]);
      if (female && top !== 'dress' && top !== 'armor' && top !== 'robe' && top !== 'ninja' && r() < 0.25) { o.skirt = true; o.socks = r() < 0.5 ? hex('#26232a') : null; }
      const buf = character(o, rng(Math.floor(r() * 1e9)));
      const key = buf.toString('base64');
      if (seen.has(key)) continue;
      seen.add(key);
      let title;
      if (top === 'armor') title = `${female ? 'Воительница' : 'Рыцарь'} в ${metal.name} доспехах`;
      else if (top === 'ninja') title = female ? 'Куноити' : 'Ниндзя';
      else if (top === 'robe') title = `${female ? 'Волшебница' : 'Маг'} в ${col.n[2]} мантии`;
      else if (top === 'sport') title = `${female ? 'Спортсменка' : 'Спортсмен'} в ${col.n[2]} форме`;
      else title = `${female ? 'Девушка' : 'Парень'} в ${GENDER[top] === 'f' ? col.n[2] : col.n[1]} ${FEM[top]}`;
      const hasCape = (top === 'armor' || top === 'robe') ? r() < 0.6 : r() < 0.2;
      out.push({
        title, png: buf, variant: female ? 'slim' : 'classic', gender: female ? 'f' : 'm', style: STYLES[top],
        cape: hasCape ? pick(capes).id : null,
      });
    }
  }
  return { skins: out, capes };
}

/** Только плащи NLauncher */
const CAPES_PNG = () => CAPES.map((c) => ({ id: c.id, name: c.name, png: cape(c, rng(c.id.length * 977 + c.name.length)) }));

module.exports = { catalog, png, CAPES, CAPES_PNG };
