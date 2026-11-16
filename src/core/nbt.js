// Минимальный NBT (Java Edition, без сжатия) — для servers.dat.
// Значения хранятся как { type, value }, чтобы при записи сохранить все поля и типы как были.
const T = { END: 0, BYTE: 1, SHORT: 2, INT: 3, LONG: 4, FLOAT: 5, DOUBLE: 6, BYTE_ARRAY: 7, STRING: 8, LIST: 9, COMPOUND: 10, INT_ARRAY: 11, LONG_ARRAY: 12 };

/* ---- Modified UTF-8 (Java DataOutput.writeUTF) ---- */
function encodeMUTF8(str) {
  const out = [];
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i); // UTF-16 code unit: суррогаты кодируются по отдельности (CESU-8)
    if (c !== 0 && c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  return Buffer.from(out);
}
function decodeMUTF8(buf) {
  let s = '';
  for (let i = 0; i < buf.length;) {
    const a = buf[i++];
    if (a < 0x80) s += String.fromCharCode(a);
    else if ((a & 0xe0) === 0xc0) s += String.fromCharCode(((a & 0x1f) << 6) | (buf[i++] & 0x3f));
    else if ((a & 0xf8) === 0xf0) {
      // обычный 4-байтовый UTF-8 (так пишут сторонние редакторы) — тоже понимаем
      const b = buf[i++], c = buf[i++], d = buf[i++];
      s += String.fromCodePoint(((a & 0x07) << 18) | ((b & 0x3f) << 12) | ((c & 0x3f) << 6) | (d & 0x3f));
    }
    else { const b = buf[i++], c = buf[i++]; s += String.fromCharCode(((a & 0x0f) << 12) | ((b & 0x3f) << 6) | (c & 0x3f)); }
  }
  return s;
}

/* ---- чтение ---- */
function read(buf) {
  let o = 0;
  const u8 = () => buf.readUInt8(o++);
  const i8 = () => buf.readInt8(o++);
  const i16 = () => { const v = buf.readInt16BE(o); o += 2; return v; };
  const u16 = () => { const v = buf.readUInt16BE(o); o += 2; return v; };
  const i32 = () => { const v = buf.readInt32BE(o); o += 4; return v; };
  const i64 = () => { const v = buf.readBigInt64BE(o); o += 8; return v; };
  const str = () => { const n = u16(); const v = decodeMUTF8(buf.subarray(o, o + n)); o += n; return v; };
  function payload(type) {
    switch (type) {
      case T.BYTE: return i8();
      case T.SHORT: return i16();
      case T.INT: return i32();
      case T.LONG: return i64();
      case T.FLOAT: { const v = buf.readFloatBE(o); o += 4; return v; }
      case T.DOUBLE: { const v = buf.readDoubleBE(o); o += 8; return v; }
      case T.BYTE_ARRAY: { const n = i32(); const v = Buffer.from(buf.subarray(o, o + n)); o += n; return v; }
      case T.STRING: return str();
      case T.LIST: { const et = u8(); const n = i32(); const items = []; for (let k = 0; k < n; k++) items.push(payload(et)); return { elemType: et, items }; }
      case T.COMPOUND: {
        const obj = {};
        for (;;) { const t = u8(); if (t === T.END) break; const name = str(); obj[name] = { type: t, value: payload(t) }; }
        return obj;
      }
      case T.INT_ARRAY: { const n = i32(); const v = []; for (let k = 0; k < n; k++) v.push(i32()); return v; }
      case T.LONG_ARRAY: { const n = i32(); const v = []; for (let k = 0; k < n; k++) v.push(i64()); return v; }
      default: throw new Error(`NBT: неизвестный тип ${type}`);
    }
  }
  const t = u8();
  if (t !== T.COMPOUND) throw new Error('NBT: корень не compound');
  const name = str();
  return { name, value: payload(T.COMPOUND) };
}

/* ---- запись ---- */
function write(root) {
  const parts = [];
  const push = (b) => parts.push(b);
  const u8 = (v) => { const b = Buffer.alloc(1); b.writeUInt8(v); push(b); };
  const i8 = (v) => { const b = Buffer.alloc(1); b.writeInt8(v); push(b); };
  const i16 = (v) => { const b = Buffer.alloc(2); b.writeInt16BE(v); push(b); };
  const i32 = (v) => { const b = Buffer.alloc(4); b.writeInt32BE(v); push(b); };
  const i64 = (v) => { const b = Buffer.alloc(8); b.writeBigInt64BE(BigInt(v)); push(b); };
  const str = (s) => { const e = encodeMUTF8(String(s)); if (e.length > 65535) throw new Error('NBT: строка слишком длинная'); const b = Buffer.alloc(2); b.writeUInt16BE(e.length); push(b); push(e); };
  function payload(type, v) {
    switch (type) {
      case T.BYTE: return i8(v);
      case T.SHORT: return i16(v);
      case T.INT: return i32(v);
      case T.LONG: return i64(v);
      case T.FLOAT: { const b = Buffer.alloc(4); b.writeFloatBE(v); return push(b); }
      case T.DOUBLE: { const b = Buffer.alloc(8); b.writeDoubleBE(v); return push(b); }
      case T.BYTE_ARRAY: i32(v.length); return push(Buffer.from(v));
      case T.STRING: return str(v);
      case T.LIST: { const et = v.items.length ? v.elemType : (v.elemType || T.END); u8(et); i32(v.items.length); for (const it of v.items) payload(et, it); return undefined; }
      case T.COMPOUND: for (const [k, e] of Object.entries(v)) { u8(e.type); str(k); payload(e.type, e.value); } return u8(T.END);
      case T.INT_ARRAY: i32(v.length); for (const x of v) i32(x); return undefined;
      case T.LONG_ARRAY: i32(v.length); for (const x of v) i64(x); return undefined;
      default: throw new Error(`NBT: неизвестный тип ${type}`);
    }
  }
  u8(T.COMPOUND); str(root.name || ''); payload(T.COMPOUND, root.value);
  return Buffer.concat(parts);
}

module.exports = { T, read, write, encodeMUTF8, decodeMUTF8 };
