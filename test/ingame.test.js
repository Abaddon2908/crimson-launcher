// Тест «Сервер в игре»: чтение/запись servers.dat (сверка с prismarine-nbt). Запуск: npm test
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const pnbt = require('prismarine-nbt');
const ROOT = path.join(__dirname, '..');
const os = require('os');
const { read, write } = require(path.join(ROOT, 'src/core/nbt'));
const ingame = require(path.join(ROOT, 'src/core/ingame'));

const dir = path.join(os.tmpdir(), 'nlauncher-ingame-test');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir);
const file = path.join(dir, 'servers.dat');

const srv = (name, ip, extra = {}) => pnbt.comp({ name: pnbt.string(name), ip: pnbt.string(ip), ...extra });
const userServers = [
  srv('Мой сервер 🎮', 'my.server.ru', { acceptTextures: pnbt.byte(1), hidden: pnbt.byte(0) }),
  srv('Друзья', 'friends.example:25570'),
  srv('Уже есть', 'promo-b.example'),
];
const original = pnbt.writeUncompressed({ type: 'compound', name: '', value: { servers: pnbt.list(pnbt.comp(userServers.map((s) => s.value))) } }, 'big');
fs.writeFileSync(file, original);

// 1. байт-в-байт (без эмодзи) и корректное чтение эмодзи
const plain = pnbt.writeUncompressed({ type: 'compound', name: '', value: { servers: pnbt.list(pnbt.comp(userServers.slice(1).map((s) => s.value))) } }, 'big');
assert.deepStrictEqual(write(read(plain)), plain, 'roundtrip не совпал');
assert.strictEqual(read(original).value.servers.value.items[0].name.value, 'Мой сервер 🎮');
assert.strictEqual(read(write(read(original))).value.servers.value.items[0].name.value, 'Мой сервер 🎮');
// как пишет сама игра (Java modified UTF-8): эмодзи = две 3-байтовые половинки
const { encodeMUTF8 } = require(path.join(ROOT, 'src/core/nbt'));
assert.deepStrictEqual([...encodeMUTF8('🎮')], [0xed, 0xa0, 0xbc, 0xed, 0xbe, 0xae]);
assert.deepStrictEqual([...encodeMUTF8('\u0000')], [0xc0, 0x80]);
console.log('✅ roundtrip байт-в-байт, эмодзи читаются в обоих форматах, запись как в Java');

const list = async () => read(fs.readFileSync(file)).value.servers.value.items.map((e) => ({ name: { value: e.name.value }, ip: { value: e.ip.value }, icon: e.icon, acceptTextures: e.acceptTextures && { value: e.acceptTextures.value } })).map((e) => `${e.name.value} | ${e.ip.value}${e.icon ? ' | icon' : ''}${e.acceptTextures ? ' | textures=' + e.acceptTextures.value : ''}`);

(async () => {
  // 2. вставка рекламы
  const icon = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  let r = ingame.apply(dir, [{ name: 'PROMO A', address: 'promo-a.example', icon: 'data:image/png;base64,' + icon }, { name: 'PROMO B', address: 'promo-b.example' }]);
  let l = await list();
  console.log('после вставки:', r, l);
  assert.strictEqual(l[0], 'PROMO A | promo-a.example | icon');
  assert.strictEqual(l.length, 4, 'promo-b не должен дублироваться — он уже есть у игрока');
  assert.ok(l.includes('Мой сервер 🎮 | my.server.ru | textures=1'), 'поля игрока/эмодзи потеряны');

  // 3. повторный запуск — ничего не задваивается
  ingame.apply(dir, [{ name: 'PROMO A', address: 'promo-a.example' }, { name: 'PROMO B', address: 'promo-b.example' }]);
  assert.strictEqual((await list()).length, 4);
  console.log('✅ повторный запуск без дублей');

  // 4. реклама закончилась — убираем только своё
  r = ingame.apply(dir, []);
  l = await list();
  console.log('после окончания рекламы:', r, l);
  assert.deepStrictEqual(l, ['Мой сервер 🎮 | my.server.ru | textures=1', 'Друзья | friends.example:25570', 'Уже есть | promo-b.example']);
  console.log('✅ свои записи игрока сохранены, реклама убрана');

  // 5. servers.dat ещё нет
  fs.rmSync(file); fs.rmSync(path.join(dir, '.nlauncher-ads.json'), { force: true });
  ingame.apply(dir, [{ name: 'Новый', address: 'new.example' }]);
  assert.deepStrictEqual(await list(), ['Новый | new.example']);
  console.log('✅ создание servers.dat с нуля');

  // 6. битый файл не трогаем
  fs.writeFileSync(file, Buffer.from([1, 2, 3]));
  r = ingame.apply(dir, [{ name: 'X', address: 'x.example' }]);
  assert.deepStrictEqual(fs.readFileSync(file), Buffer.from([1, 2, 3]));
  console.log('✅ повреждённый servers.dat не перезаписан', r);
  // prismarine читает то, что записали мы (без эмодзи, т.к. CESU он не декодирует)
  fs.rmSync(file); fs.rmSync(path.join(dir, '.nlauncher-ads.json'), { force: true });
  fs.writeFileSync(file, plain);
  ingame.apply(dir, [{ name: 'PROMO', address: 'p.example' }]);
  const pp = (await pnbt.parse(fs.readFileSync(file))).parsed.value.servers.value.value.map((e) => e.ip.value);
  assert.deepStrictEqual(pp, ['p.example', 'friends.example:25570', 'promo-b.example']);
  console.log('✅ результат корректно читает независимая библиотека prismarine-nbt');
  console.log('ВСЕ ТЕСТЫ ПРОЙДЕНЫ');
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
