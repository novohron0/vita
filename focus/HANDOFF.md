# Vita Focus — handoff / шпаргалка

**Что это:** Safari Web Extension + iOS-оболочка. «Чистый YouTube в Safari» — UnTrap + SocialFocus в одном, для себя. Сайт: [vitadots.ru/focus](https://vitadots.ru/focus).

**Текущая версия: `0.29.1`** (источник правды — `focus/extension/manifest.json`).

Критично понимать: расширение работает **только в Safari**. Выключено расширение → не работает ничего (ни иконка, ни скрытие «парашютов»).

---

## Пути

```
Repo:      /Users/kamilimangulov/vita
Источник:  focus/extension/            ← редактировать ЗДЕСЬ
Xcode:     focus/safari/Vita Focus/Vita Focus.xcodeproj
Копия:     focus/safari/.../Shared (Extension)/Resources/   ← rsync, не править
Синк:      cd focus && ./sync-safari.sh
Bundle:    ru.vitadots.focus / ru.vitadots.focus.Extension  (Team 655542C66J)
```

Рабочий цикл: правка в `focus/extension/` → `./sync-safari.sh` → Xcode: Clean Build Folder (⇧⌘K) → ⌘R на iPhone.

---

## Что сделано в 0.29.1 (11.07.2026)

### Баг G — тумблеры «не работают»
После клика popup делал `renderRows()` + повторное чтение storage → на iOS тумблер
откатывался, страница не получала настройки вовремя.
Фикс: optimistic UI без перерисовки, `pushApply()` fire-and-forget,
content script слушает `settingsRev` (250ms) + fallback poll 2s.

---

## Что сделано в 0.29.0 (11.07.2026)

### Баг D — пустой popup (SyntaxError)
`visibleToggles` использовался в `popup.js`, но не был экспортирован из `ui.js` —
Safari падал на import, popup оставался белым. Фикс: экспорт + импорт,
`init().catch(...)` с сообщением об ошибке в `#rows`.

### Баг E — неожиданный редирект «Главная → Подписки»
Тумблер `yt_home_subs` был в пресетах, но скрыт из popup (`group: "extra"`).
Пользователи с профилем «Приложение» / «Работа» получали редирект без контроля.
Фикс: убран из пресетов; одноразовая миграция `migration_v290` в `storage.js`
сбрасывает `yt_home_subs: false` у существующих установок.

### Баг F — popup: счётчики и master-toggle
Master-toggle и meta-счётчик считали только 4 main-тумблера, а badge на табе
YouTube — все 21 (включая extra из пресетов). Фикс: везде `visibleToggles()`.

### Прочее
- Баннер паузы по расписанию (`#pauseBanner`) — видно, когда фильтры выключены вне окна.
- `pushApply()` надёжнее на iOS Safari (fallback через active tab + broadcast).
- Киллер парашютов из 0.28.0 без изменений логики — проверить на устройстве.

---

## Что сделано в 0.28.0 (11.07.2026)

### Баг A — синяя иконка в Safari
Диагноз: иконка была фактически grayscale (перепад RGB-каналов ≤16), Safari iOS
считает такие «шаблоном» и перекрашивает в системный синий.
Фикс: `focus/scripts/prepare-extension-icons.py` переписан — точки получают
лиловый отлив, центральная точка — явный фиолетовый акцент, фон — слабый
цветной градиент. Теперь ~15% пикселей с сильной сатурацией (diff ≥30) —
детектор Safari обязан увидеть цвет. Из манифеста удалён невалидный для MV3
ключ `browser_action` (иконки остались в `icons` и `action.default_icon`).
`icons/` подключена в Xcode как folder reference — новые PNG попадают в .appex
автоматически.
**Если снова синяя:** удалить приложение с iPhone → Clean Build → поставить
заново (Safari кэширует иконки агрессивно).

### Баг B — «New videos right to you» (парашюты) на ленте подписок
В `content/youtube.js` теперь три эшелона:
1. **CSS на document_start** (`youtube.css`): все известные empty-state теги +
   новые `ytm/ytd-feed-nudge-renderer`, `ytm/ytd-background-promo-renderer`,
   `yt-empty-state-view-model`; плюс структурное правило — на
   `page-subtype="subscriptions"` прячется любой ребёнок `#contents` без видео.
2. **Ранний JS-киллер** (sweep каждые 400ms + MutationObserver): текстовый
   матчер поднимается до самого верхнего предка без видео и прячет его —
   работает при ЛЮБОЙ вёрстке, даже если YouTube переименует все теги.
   Проверено на стенде: два «парашюта» в незнакомых `div`-ах скрываются,
   секция с видео остаётся.
3. Старые `nukeSubsParachutes()` / `hideFeedEmptyStates()` дополнены новыми тегами.

**Диагностика (главное!):** если парашюты всё ещё видны — почти наверняка
скрипт вообще не выполняется. Проверка за 5 секунд: открыть popup Vita Focus
на вкладке YouTube — под названием сайта теперь строка статуса:
- 🟢 «Работает на этой вкладке · v0.29.1» — скрипт жив, копай DOM
  (Mac Safari → Разработка → iPhone → вкладка → Console, искать `[Vita Focus]`;
  на `<html>` должен быть атрибут `data-vita-focus="0.29.1"`).
- 🟠 «На этой вкладке не активен» — расширение выключено / нет разрешения
  «на всех сайтах» / старый билд / это не Safari.

### Баг C — кнопка «Safari → Расширения» не проваливается в Extensions
Ограничение Apple: на iOS 18+ deep links в под-страницы Настроек сломаны,
надёжного URL нет (Apple Forums thread 759900). Каскад URL оставлен
(`ViewController.swift → openSafariExtensionSettings()`), но фолбэк-алерт и
онбординг теперь дают точный ручной путь:
**Настройки → Приложения → Safari → Расширения → Vita Focus**, либо прямо в
Safari: **⋯ / АА в адресной строке → Управлять расширениями**.

---

## Чеклист проверки на iPhone (после ⌘R)

```
□ Настройки → Safari → Расширения → Vita Focus → ВКЛ + «Разрешить на всех сайтах»
□ Safari → m.youtube.com/feed/subscriptions
□ Popup Vita Focus → строка статуса зелёная «Работает… v0.29.1»
□ Парашюты «New videos right to you» исчезли
□ ⋯ → Управлять расширениями → иконка тёмная с фиолетовым акцентом (не синяя)
□ Тумблеры: Shorts / размыть / только текст / похожие — работают
```

---

## Архитектура (кратко)

- `manifest.json` MV3, Safari strict_min_version 16.4
- `content/youtube.js` — вся YouTube-логика (~1000 строк), `content/youtube.css` — мгновенное скрытие
- `content/darkmode.js` — тёмная тема любого сайта, бежит на всех URL (+ отвечает на ping)
- `background.js` — хранит настройки (chrome.storage.sync), broadcast по вкладкам
- `popup/` — UI: 4 тумблера YouTube, 5 сайтов в табах, остальное в «⋯»
- `shared/registry.json` — реестр сайтов/тумблеров (master в `focus/shared/`)
- Сообщения: `vfocus:get` (настройки), `vfocus:settings` (пуш), `vfocus:ping` → `{ok, version}` (статус)
- Виджет (`iOS (Widget)`) — вторично, были проблемы с signing на Personal Team

## Онбординг iOS-app

`Shared (App)/Resources/Base.lproj/Main.html` — 2 шага: включить расширение,
открыть YouTube (кнопка → `https://m.youtube.com/feed/subscriptions` через
`FocusShared.swift → FocusDeepLinks.youtubeSubs`) + «На экран Домой».

## Быстрый тест без iPhone

- Chrome: `chrome://extensions` → Load unpacked → `focus/extension` (логика YouTube, но не iOS-поведение иконок)
- Стенд для киллера парашютов: см. историю — синтетический DOM + стаб `chrome`, youtube.js скрывает не-видео секции структурно

## Ссылки

- Синяя иконка/tint: https://developer.apple.com/forums/thread/660596, lapcatsoftware.com/articles/2021-7-7.html
- Deep links в Настройки сломаны на iOS 18: https://developer.apple.com/forums/thread/759900
- settings-navigation URL: https://github.com/FifiTheBulldog/ios-settings-urls/issues/93

## История версий

| Версия | Что |
|--------|-----|
| 0.24–0.26 | 4 тумблера, упрощённый popup, safari-safe иконки, deep links |
| 0.27.0 | color icons v2, ранний киллер парашютов |
| 0.28.0 | цветные иконки v3, структурный киллер + feed-nudge/background-promo, статус скрипта в popup, честные подсказки пути в Настройки, манифест без browser_action |
| **0.29.0** | фикс пустого popup (visibleToggles), миграция yt_home_subs, согласованные счётчики табов, баннер паузы по расписанию, pushApply для iOS |
| **0.29.1** | фикс тумблеров: без renderRows после клика, settingsRev sync, быстрый poll на странице |
