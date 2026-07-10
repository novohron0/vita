# Vita Focus — Safari Web Extension

Блокирует Shorts, ленты и прочий шум на YouTube (и дальше — Instagram, X, Reddit).
Настройки синкаются через `browser.storage.sync` (iCloud на Apple-устройствах).

## Структура

```
focus/
  shared/registry.json   — единый реестр сайтов и тумблеров
  extension/             — Manifest V3 (Safari / Chrome для разработки)
    manifest.json
    background.js
    content/youtube.js
    popup/               — панель как на vitadots.ru/focus
```

Сайт подтягивает тот же реестр: `/static/focus-registry.json`.

## Разработка в Chrome (быстрый тест)

1. Открой `chrome://extensions`
2. Включи «Режим разработчика»
3. «Загрузить распакованное» → папка `focus/extension`
4. Открой youtube.com, нажми иконку расширения — включи блоки

## Safari (iPhone / iPad / Mac)

Нужны **Mac + Xcode 15+** и **Apple Developer** ($99/год) для устройства и App Store.

### 1. Создать оболочку из расширения

```bash
cd focus/extension
xcrun safari-web-extension-converter . \
  --app-name "Vita Focus" \
  --bundle-identifier ru.vitadots.focus \
  --swift \
  --copy-resources \
  --project-location ../safari
```

Откроется Xcode-проект в `focus/safari/`.

### 2. Запуск на Mac

1. Открой `focus/safari/Vita Focus.xcodeproj`
2. Target → Signing → твоя Team
3. Run (⌘R) — появится пустое приложение-оболочка
4. **Safari → Настройки → Расширения** → включи **Vita Focus**
5. Разреши на youtube.com

### 3. iPhone / iPad

1. Подключи устройство, выбери его в Xcode → Run
2. На устройстве: **Настройки → Safari → Расширения** → Vita Focus → включить
3. TestFlight — когда будет готов билд для беты

## MVP (сейчас)

- [x] Реестр тумблеров (сайт + расширение)
- [x] YouTube: Shorts, реки, комменты, похожие, превью, blur, заставка, автоплей
- [x] … / Threads / Pinterest / VK / Discord / Twitch / Medium
- [x] Popup, PIN, расписание, задержка 12ч, экспорт/импорт, профили, фильтр слов
- [ ] Face ID
- [ ] App Store / TestFlight

## Синк после правок

```bash
./focus/sync-registry.sh
./focus/sync-safari.sh
```

### v0.9

- Hacker News, Spotify Web, Amazon
- Профиль **Стримы** (YouTube + Twitch)
- Popup: поиск тумблеров, версия в шапке, скролл вкладок

### v0.8

- Discord, Twitch, Medium
- YouTube **Только плеер** — всё под watch скрыто
- Popup: **Вкл всё / Выкл всё** для текущего сайта

### v0.7

- YouTube: блок каналов, тренды/Explore, theater mode
- Threads, Pinterest, VK
- Профиль **Соцсети** в popup

### v0.6

- YouTube: полки, чипсы, Mix, усиленные mobile-селекторы (комменты, похожие)
- Фильтр слов в popup (список в поле под тумблерами YouTube)
- Telegram Web, TikTok
- Фикс X: `x_feed` вместо сломанного `x_foryou`

## Бета-вейтлист

Контакты с сайта пишутся в `focus_wait` (таблица SQLite), видны в `/admin`.

## Заметки по YouTube

DOM YouTube меняется — селекторы в `content/youtube.js` периодически обновлять.
`MutationObserver` + инъекция CSS покрывают SPA-навигацию.
