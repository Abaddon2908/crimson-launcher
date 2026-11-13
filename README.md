# NLauncher

Minecraft-лаунчер от **NeoDev**. Сайт-мониторинг с продажей рекламы и админкой лежит в [`site/`](site/README.md).

**[⬇ Скачать для Windows](https://github.com/Abaddon2908/crimson-launcher/releases/latest)**

Минималистичный Minecraft-лаунчер в спокойной винной палитре: матовое стекло, блюры, блочные пейзажи на фоне, плавные анимации.

## Возможности

- **Лицензия и без лицензии.** Вход через Microsoft (официальное окно, хранится только refresh-токен) и офлайн-аккаунты по нику. UUID для офлайна считается так же, как в ванильном сервере. Аккаунтов может быть несколько.
- **Любые версии.** Релизы, снапшоты, старые beta/alpha (манифест Mojang).
- **Модлоадеры.** Vanilla, Fabric, Quilt, Forge. Версию загрузчика можно выбрать вручную или оставить рекомендуемую.
- **Сборки.** У каждой сборки своя папка (миры, моды, конфиги), версия, загрузчик и объём ОЗУ. Учитывается время игры.
- **Моды.** Каталог Modrinth: моды, ресурспаки и шейдеры. Фильтр под версию и загрузчик сборки, обязательные зависимости ставятся сами. Установленные моды можно включать, выключать и удалять.
- **Java ставится сама.** Нужная версия (8 / 17 / 21 …) скачивается с Adoptium (Temurin) под ОС и архитектуру. Можно указать свою.
- **Сервера.** Пинг: онлайн, задержка, MOTD, иконка. Быстрое подключение через QuickPlay, свои избранные сервера.
- **Место под сайт и мониторинг.** Рекламный баннер, новости, промо-сервера и топ на главной странице. Всё это приходит из JSON с вашего сайта.
- **Настройки.** ОЗУ, Java, аргументы JVM, разрешение, полноэкранный режим, скрытие лаунчера при запуске игры, консоль с логом, отключение анимаций.
- **Офлайн-игра.** Манифесты кэшируются на диск: после первого запуска можно играть без интернета.

## Запуск

```bash
npm install
npm start          # запуск
npm run dev        # с DevTools
npm run dist:win   # сборка установщика (.exe), также dist:linux / dist:mac
```

Нужен Node.js 18+. Данные лежат в `%APPDATA%/.nlauncher` (Windows), `~/.config/.nlauncher` (Linux) или `~/Library/Application Support/.nlauncher` (macOS).

Чтобы посмотреть интерфейс без Electron, откройте `src/renderer/index.html` в браузере. Подключится мок-API из `mock.js`.

## Брендинг: `config.json`

```json
{
  "brand": "NLauncher",
  "company": "NeoDev",
  "tagline": "Играй красиво.",
  "site": "https://your-site.ru",
  "feedUrl": "https://your-site.ru/api/launcher/feed.json",
  "featuredServers": [{ "name": "Hypixel", "address": "mc.hypixel.net", "tag": "Мини-игры" }]
}
```

Цвета задаются CSS-переменными в начале `src/renderer/styles.css` (`--accent`, `--accent-2`, `--accent-deep` …).
Фоновые картинки лежат в `src/renderer/assets/` (`bg-main.jpg`, `bg-banner.jpg`, `bg-night.jpg`, `bg-forest.jpg`). Замените их своими файлами с теми же именами.

## Подключение сайта (мониторинг и реклама)

Лаунчер запрашивает `feedUrl` и ждёт такой JSON (все поля необязательные):

```json
{
  "banner":   { "title": "Топ-1 сервер недели", "text": "…", "cta": "Играть", "url": "https://…", "image": "https://…/banner.jpg" },
  "news":     [{ "title": "…", "date": "2026-11-13", "text": "…", "url": "https://…" }],
  "promoted": [{ "name": "MegaCraft", "address": "play.megacraft.ru", "desc": "Выживание 1.21", "tag": "Промо" }]
}
```

- `banner` — рекламный слот на главной; клик открывает `url` в браузере.
- `promoted` — платные места: они идут первыми и помечены PROMO на главной и во вкладке «Сервера».
- Пока `feedUrl` указывает на `example.com`, показываются демо-данные.

Так продажа рекламы и топ мониторинга управляются целиком с сайта, без обновления лаунчера.

## Структура

```
src/
  main.js        — окно Electron и IPC
  preload.js     — безопасный мост window.api
  core/
    auth.js      — Microsoft (msmc) и офлайн-аккаунты
    versions.js  — версии MC, Fabric / Quilt / Forge
    java.js      — автоустановка Java (Adoptium)
    launch.js    — запуск (minecraft-launcher-core)
    instances.js — сборки
    mods.js      — Modrinth: поиск, установка, зависимости
    servers.js   — пинг серверов
    feed.js      — лента с сайта
  renderer/      — интерфейс (HTML / CSS / JS без фреймворков)
config.json      — бренд, сайт, сервера
```

## Идеи на будущее

Автообновление (electron-updater), импорт модпаков `.mrpack`, NeoForge, голосование за сервера с наградами через API сайта, свои скины для офлайн-игроков.

## Релизы

Готовые `.exe` лежат во вкладке **Releases**. Новый релиз собирается автоматически (GitHub Actions, Windows) при пуше тега:

```bash
git tag v0.1.1 && git push origin v0.1.1
```

Не забудьте поднять `version` в `package.json`.

Или без тегов: вкладка **Actions** → **Build & Release** → **Run workflow** — релиз получит версию из `package.json`.
