// Картинки для Яндекс Директа: 1:1, 16:9, 4:3, 3:4 в фирменном стиле NLauncher
// Запуск: node marketing/yandex-direct/generate.js site <папка со шрифтами @fontsource unbounded и manrope> marketing/yandex-direct
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const [site, fontsDir, outDir] = process.argv.slice(2);
const A = path.join(site, 'public', 'assets');
const font = (pkg, file) => {
  const dir = fs.readdirSync(fontsDir).find((d) => d.includes(pkg) && !d.endsWith('.tgz'));
  return 'data:font/woff2;base64,' + fs.readFileSync(path.join(fontsDir, dir, 'package', 'files', file)).toString('base64');
};
const b64 = (f, t) => `data:${t};base64,${fs.readFileSync(path.join(A, f)).toString('base64')}`;
const fonts = `
@font-face{font-family:U;src:url(${font('unbounded', 'unbounded-cyrillic-700-normal.woff2')})format('woff2');unicode-range:U+0400-04FF}
@font-face{font-family:U;src:url(${font('unbounded', 'unbounded-latin-700-normal.woff2')})format('woff2');unicode-range:U+0000-00FF}
@font-face{font-family:M;src:url(${font('manrope', 'manrope-cyrillic-600-normal.woff2')})format('woff2');unicode-range:U+0400-04FF}
@font-face{font-family:M;src:url(${font('manrope', 'manrope-latin-600-normal.woff2')})format('woff2');unicode-range:U+0000-00FF,U+2013-2022}
@font-face{font-family:MB;src:url(${font('manrope', 'manrope-cyrillic-800-normal.woff2')})format('woff2');unicode-range:U+0400-04FF}
@font-face{font-family:MB;src:url(${font('manrope', 'manrope-latin-800-normal.woff2')})format('woff2');unicode-range:U+0000-00FF}`;
const logo = b64('icon.png', 'image/png');
const bg = b64('bg-main.jpg', 'image/jpeg');
const shot = b64('launcher-home.jpg', 'image/jpeg');

// макет списка серверов (вымышленные сервера, как на скриншотах лаунчера)
const rows = [
  ['CraftHaven', 'Выживание', '#c4747c', true], ['SkyLands', 'Скайблок', '#6f8fbf', false],
  ['Wildlands', 'Анархия', '#6fbf8e', false], ['NightRealm', 'Мини-игры', '#d6a764', false],
];
const list = (n = 4) => `<div class="list">${rows.slice(0, n).map(([name, tag, c, promo], i) => `
  <div class="srow${promo ? ' promo' : ''}"><span class="rank">${i + 1}</span><span class="ic" style="background:linear-gradient(135deg,${c},#2a1a1d)"></span>
    <span class="nm"><b>${name}${promo ? '<i>PROMO</i>' : ''}</b><small>${tag}</small></span>
    <span class="on"><em></em>онлайн</span><span class="vote">★ Голосовать</span></div>`).join('')}</div>`;

const css = (s) => `${fonts}
*{box-sizing:border-box;margin:0}
body{width:${s.w}px;height:${s.h}px;overflow:hidden;position:relative;background:#0c0a0b;color:#eee6e7;font-family:M}
.bg{position:absolute;inset:0;background:url(${bg}) 60% 60%/cover}
.bg::after{content:'';position:absolute;inset:0;background:radial-gradient(60% 70% at 75% 40%,rgba(163,69,79,.35),transparent 70%),linear-gradient(${s.dir},rgba(12,10,11,.96) 0%,rgba(12,10,11,.78) 48%,rgba(12,10,11,.35) 100%)}
.in{position:absolute;inset:0;padding:${s.pad}px}
.brand{display:flex;align-items:center;gap:${s.u * .9}px}
.brand img{width:${s.u * 4}px;height:${s.u * 4}px;filter:drop-shadow(0 ${s.u * .6}px ${s.u * 1.4}px rgba(163,69,79,.45))}
.brand b{font:700 ${s.u * 1.55}px U;letter-spacing:.01em;display:block}
.brand small{display:block;font:600 ${s.u * .62}px M;letter-spacing:.28em;color:#9b8f91;margin-top:${s.u * .3}px}
h1{font:700 ${s.h1}px/1.04 U;letter-spacing:-.02em}
h1 span{color:#d6858d}
.sub{font:600 ${s.u * 1.05}px/1.4 M;color:#cdbfc1}
.chips{display:flex;gap:${s.u * .45}px;flex-wrap:wrap}
.chips span{padding:${s.u * .38}px ${s.u * .75}px;border-radius:${s.u * .5}px;background:rgba(255,255,255,.09);font:600 ${s.u * .8}px M}
.chips span.a{background:#a3454f}
.list{display:flex;flex-direction:column;gap:${s.u * .45}px;padding:${s.u * .7}px;border-radius:${s.u * 1.1}px;background:rgba(22,17,19,.82);box-shadow:0 ${s.u * 1.5}px ${s.u * 4}px -${s.u}px rgba(0,0,0,.85),0 0 0 1px rgba(255,255,255,.06);backdrop-filter:blur(8px)}
.srow{display:flex;align-items:center;gap:${s.u * .65}px;padding:${s.u * .55}px ${s.u * .7}px;border-radius:${s.u * .75}px;background:rgba(255,255,255,.035)}
.srow.promo{background:linear-gradient(90deg,rgba(214,167,100,.14),rgba(255,255,255,.03));box-shadow:inset 0 0 0 1px rgba(214,167,100,.3)}
.rank{width:${s.u * 1.1}px;font:700 ${s.u * .8}px U;color:#9b8f91;text-align:center}
.ic{width:${s.u * 2.1}px;height:${s.u * 2.1}px;border-radius:${s.u * .55}px;flex:none}
.nm{flex:1;min-width:0}.nm b{display:flex;align-items:center;gap:${s.u * .4}px;font:700 ${s.u * .9}px MB}
.nm i{font:800 ${s.u * .5}px MB;font-style:normal;color:#e6c27f;background:rgba(214,167,100,.18);padding:${s.u * .12}px ${s.u * .35}px;border-radius:${s.u * .3}px;letter-spacing:.06em}
.nm small{display:block;color:#9b8f91;font:600 ${s.u * .65}px M;margin-top:${s.u * .12}px}
.on{display:flex;align-items:center;gap:${s.u * .3}px;font:600 ${s.u * .65}px M;color:#9fd6b2}
.on em{width:${s.u * .42}px;height:${s.u * .42}px;border-radius:50%;background:#6fbf8e;box-shadow:0 0 0 ${s.u * .18}px rgba(111,191,142,.2)}
.vote{padding:${s.u * .35}px ${s.u * .6}px;border-radius:${s.u * .45}px;background:#a3454f;font:700 ${s.u * .62}px MB;color:#fff;white-space:nowrap}
.shot{position:absolute;border-radius:${s.u * .9}px;box-shadow:0 ${s.u * 2}px ${s.u * 5}px -${s.u}px rgba(0,0,0,.9),0 0 0 1px rgba(255,255,255,.07)}
`;

// раскладки
const formats = [
  { name: 'nlauncher-direct-1x1-1080', w: 1080, h: 1080, u: 26, pad: 76, h1: 76, dir: '180deg',
    body: (s) => `<div class="in" style="display:flex;flex-direction:column;gap:${s.u * 1.3}px">
      <div class="brand"><img src="${logo}"><div><b>NLauncher</b><small>МОНИТОРИНГ СЕРВЕРОВ</small></div></div>
      <h1 style="margin-top:${s.u * .6}px">Топ серверов<br/><span>Minecraft</span></h1>
      <p class="sub">Онлайн, IP-адреса и голосование.<br/>Найдите сервер под свой стиль игры</p>
      <div style="margin-top:auto">${list(3)}</div></div>` },
  { name: 'nlauncher-direct-16x9-1920', w: 1920, h: 1080, u: 30, pad: 96, h1: 104, dir: '100deg',
    body: (s) => `<div class="in">
      <div style="position:absolute;left:${s.pad}px;top:${s.pad}px;bottom:${s.pad}px;width:950px;display:flex;flex-direction:column;justify-content:center;gap:${s.u * 1.3}px">
        <div class="brand"><img src="${logo}"><div><b>NLauncher</b><small>МОНИТОРИНГ СЕРВЕРОВ</small></div></div>
        <h1 style="margin-top:${s.u * .6}px">Топ серверов<br/><span>Minecraft</span></h1>
        <p class="sub">Онлайн в реальном времени, IP-адреса и честное голосование</p>
        <div class="chips"><span class="a">Выживание</span><span>Анархия</span><span>Мини-игры</span><span>Моды</span></div>
      </div>
      <img class="shot" src="${shot}" style="right:-170px;top:150px;width:1040px;transform:perspective(1800px) rotateY(-12deg);opacity:.55">
      <div style="position:absolute;right:${s.pad}px;top:290px;width:760px">${list(4)}</div></div>` },
  { name: 'nlauncher-direct-4x3-1440', w: 1440, h: 1080, u: 28, pad: 84, h1: 88, dir: '180deg',
    body: (s) => `<div class="in" style="display:flex;flex-direction:column;gap:${s.u * 1.2}px">
      <div class="brand"><img src="${logo}"><div><b>NLauncher</b><small>МОНИТОРИНГ СЕРВЕРОВ</small></div></div>
      <h1 style="margin-top:${s.u * .5}px">Топ серверов <span>Minecraft</span></h1>
      <p class="sub">Онлайн, IP-адреса и голосование — найдите сервер под свой стиль игры</p>
      <div style="margin-top:auto">${list(3)}</div></div>` },
  { name: 'nlauncher-direct-3x4-1080', w: 1080, h: 1440, u: 28, pad: 80, h1: 82, dir: '180deg',
    body: (s) => `<div class="in" style="display:flex;flex-direction:column;gap:${s.u * 1.3}px">
      <div class="brand"><img src="${logo}"><div><b>NLauncher</b><small>МОНИТОРИНГ СЕРВЕРОВ</small></div></div>
      <h1 style="margin-top:${s.u * .8}px">Топ<br/>серверов<br/><span>Minecraft</span></h1>
      <p class="sub">Онлайн, IP-адреса и голосование.<br/>Найдите сервер под свой стиль игры</p>
      <div class="chips"><span class="a">Выживание</span><span>Анархия</span><span>Мини-игры</span></div>
      <div style="margin-top:auto">${list(4)}</div></div>` },
];

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const b = await chromium.launch();
  for (const s of formats) {
    const p = await b.newPage({ viewport: { width: s.w, height: s.h } });
    await p.setContent(`<html><head><style>${css(s)}</style></head><body><div class="bg"></div>${s.body(s)}</body></html>`);
    await p.waitForTimeout(600);
    const file = path.join(outDir, `${s.name}.png`);
    await p.screenshot({ path: file });
    // Директ принимает до 10 МБ; JPG легче — сохраняем и его
    await p.screenshot({ path: file.replace(/\.png$/, '.jpg'), type: 'jpeg', quality: 92 });
    await p.close();
  }
  await b.close();
})();
