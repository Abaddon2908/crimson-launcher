// Автоматическая разметка скинов игроков: примерно определяем «парень / девушка» по картинке.
// Признаки: тонкие руки (Alex), длинные волосы по бокам лица, волосы на спине, цвет губ.
// Это эвристика: сомнительные скины остаются без пола, ошибки можно поправить в админке.
const zlib = require('zlib');

/** Мини-декодер PNG: 8 бит, RGBA / RGB / палитра / серый, без чересстрочности */
function decode(buf) {
  if (!buf || buf.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return null;
  let w = 0, h = 0, depth = 0, type = 0, inter = 0, pal = null, trns = null;
  const idat = [];
  for (let p = 8; p + 8 <= buf.length;) {
    const len = buf.readUInt32BE(p), t = buf.toString('latin1', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (t === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; type = d[9]; inter = d[12]; }
    else if (t === 'PLTE') pal = d;
    else if (t === 'tRNS') trns = d;
    else if (t === 'IDAT') idat.push(d);
    else if (t === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 8 || inter || w > 128 || h > 128) return null;
  const bpp = { 6: 4, 2: 3, 3: 1, 0: 1, 4: 2 }[type];
  if (!bpp) return null;
  let raw;
  try { raw = zlib.inflateSync(Buffer.concat(idat)); } catch { return null; }
  const stride = w * bpp, out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      line[i] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4, s = x * bpp;
      if (type === 6) line.copy(out, o, s, s + 4);
      else if (type === 2) { out[o] = line[s]; out[o + 1] = line[s + 1]; out[o + 2] = line[s + 2]; out[o + 3] = 255; }
      else if (type === 3) { const k = line[s]; out[o] = pal[k * 3]; out[o + 1] = pal[k * 3 + 1]; out[o + 2] = pal[k * 3 + 2]; out[o + 3] = trns && k < trns.length ? trns[k] : 255; }
      else if (type === 0) { out[o] = out[o + 1] = out[o + 2] = line[s]; out[o + 3] = 255; }
      else { out[o] = out[o + 1] = out[o + 2] = line[s]; out[o + 3] = line[s + 1]; }
    }
    prev = line;
  }
  return { w, h, px: out };
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function avg(list) {
  const ok = list.filter(Boolean);
  if (!ok.length) return null;
  return [0, 1, 2].map((i) => ok.reduce((s, c) => s + c[i], 0) / ok.length);
}

/** 'f' | 'm' | '' */
function guessGender(png, variant) {
  const img = decode(png);
  if (!img || img.w !== 64) return '';
  const at = (x, y) => {
    if (y >= img.h) return null;
    const o = (y * 64 + x) * 4;
    return img.px[o + 3] > 128 ? [img.px[o], img.px[o + 1], img.px[o + 2]] : null;
  };
  // цвет волос: верх головы (второй слой, если он есть)
  const top = []; for (let y = 0; y < 8; y++) for (let x = 8; x < 16; x++) top.push(at(x + 32, y) || at(x, y));
  const hair = avg(top);
  // цвет кожи: щёки и подбородок
  const skin = avg([at(9, 13), at(14, 13), at(10, 15), at(13, 15), at(9, 14), at(14, 14)]);
  if (!hair || !skin || dist(hair, skin) < 40) return variant === 'slim' ? 'f' : ''; // лысые / шлемы / маски — только по рукам
  const isHair = (c) => c && dist(c, hair) < 60 && dist(c, skin) > 45;

  let score = variant === 'slim' ? 1.5 : -0.5;
  // длинные волосы по бокам лица: крайние столбцы лица ниже глаз (и второй слой)
  let side = 0;
  for (let y = 12; y < 16; y++) for (const x of [8, 15]) if (isHair(at(x + 32, y) || at(x, y))) side++;
  if (side >= 6) score += 2; else if (side >= 3) score += 1;
  // волосы на боковых гранях головы до низа
  let sides = 0;
  for (let y = 13; y < 16; y++) for (const x of [0, 1, 22, 23]) if (isHair(at(x + 32, y) || at(x, y))) sides++;
  if (sides >= 8) score += 1;
  // волосы спускаются на спину (второй слой туловища)
  let back = 0;
  for (let y = 36; y < 39; y++) for (let x = 33; x < 39; x++) if (isHair(at(x, y))) back++;
  if (back >= 8) score += 1;
  // губы: розовый/красный рот
  const mouth = avg([at(11, 14), at(12, 14)]);
  if (mouth && mouth[0] - mouth[1] > skin[0] - skin[1] + 25 && mouth[0] > skin[0] * 0.8) score += 0.7; // губы краснее кожи, а не просто темнее

  if (score >= 2.5) return 'f';
  if (score <= 0) return 'm';
  return '';
}

module.exports = { guessGender, decode };
