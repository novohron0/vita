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
- [x] YouTube: Shorts, рекомендации, комменты, похожие, автоплей
- [x] Instagram / X / Reddit content scripts (базовые селекторы)
- [x] Popup-панель
- [x] PIN перед выключением (popup)
- [x] Расписание блокировки (часы)
- [x] Задержка 12ч перед выключением тумблера
- [ ] Face ID
- [ ] App Store / TestFlight

## Бета-вейтлист

Контакты с сайта пишутся в `focus_wait` (таблица SQLite), видны в `/admin`.

## Заметки по YouTube

DOM YouTube меняется — селекторы в `content/youtube.js` периодически обновлять.
`MutationObserver` + инъекция CSS покрывают SPA-навигацию.
