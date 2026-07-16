# Vita — handoff

## North star

Vita — не набор отдельных демо, а одна система:

- **Vita Focus**: UnTrap для YouTube + SocialFocus для остальных сайтов в Safari.
- **Vita Habits**: цели, ежедневные отметки, streak и WidgetKit-виджеты.
- **Обои жизни**: месяц / год / жизнь / цель на `vitadots.ru`.

Главный контракт: одна отметка привычки обновляет один серверный goal, поэтому
одновременно меняются страница цели, Habit-виджет и живые обои `/gw/{code}.png`.
Настройки блокировок Focus остаются локальными: историю браузинга и список
включённых фильтров не нужно отправлять на сервер.

## Текущее состояние (16.07.2026)

- Extension manifest: **0.30.6**.
- Все Xcode targets: `MARKETING_VERSION = 0.30.6`, build `2`.
- iOS app bundle: `ru.vitadots.focus`.
- Safari extension: `ru.vitadots.focus.Extension`.
- Widget: `ru.vitadots.focus.widget`.
- App Group: `group.ru.vitadots.focus`.
- Team: `655542C66J`.

## Что уже связано

### Сайт → приложение → виджет

1. Цель создаётся на `https://vitadots.ru/goals`.
2. Страница `/g/{code}` содержит кнопку **«Открыть в Vita»**.
3. Deep link `vita://goal/{code}` сохраняет активную цель в App Group.
4. App получает `/api/goal/{code}`, кэширует title/days/done/color/streak.
5. Виджет **«Vita · привычка»** показывает те же данные.
6. App Intent «Отметить сегодня» вызывает `/api/goal/{code}/toggle`, обновляет
   кэш и WidgetKit. `/gw/{code}.png` автоматически отражает ту же отметку.

Все виджеты используют общую тему из App Group: `graphite`, `violet`, `ocean`,
`ember` или пользовательское фото. Для точек есть четыре формы. Оформление
выбирается в native app и применяется через
`WidgetCenter.reloadAllTimelines()`.

Пока активная привычка одна. Следующий продуктовый шаг — несколько привычек и
`AppIntentConfiguration`, чтобы каждый экземпляр виджета выбирал свою цель.

### Safari Focus

```
popup.html → polyfill → storage-shim → ui-shim → popup.js
    ↓ chrome.storage.local (источник правды) + best-effort sync mirror
youtube.js / site content scripts
    ↓ CSS + DOM filters
```

- YouTube: 21 фильтр, в мобильном popup показаны 5 основных.
- Остальные сайты берутся из `focus/shared/registry.json`.
- Popup и runtime-скрипты Safari не используют ES modules.
- YouTube HUD: `VF 0.30.6 · storage OK/FAIL · …`.
- Popup: `v0.30.6 · storage OK/FAIL` + ping текущей вкладки.

Не обещать, что extension работает на iPhone, пока нет device-диагностики.
PWA «На экран Домой» не поддерживает Safari extensions — нужен Safari.
Для домашнего запуска использовать виджет **YouTube Focus**: он открывает
главную `https://www.youtube.com/` в Safari. Обычная иконка
сайта «На экран Домой» запускает web-app без extension.

Popup UI (`uiTheme`, `activeSite`) тоже local-first; `storage.sync` для этих
полей — только необязательное зеркало и не должен ронять инициализацию popup.

## Диагностика на iPhone

В native app есть блок «Диагностика»:

- версия app/build;
- встроена ли Safari `.appex` и её manifest version;
- включено ли расширение (авто-проверка только iOS 26.2+);
- работает ли App Group;
- встроен ли Widget `.appex`;
- число активных блоков и отмеченных дней.

Для следующего extension-фикса нужен один скрин этого блока и popup на вкладке
YouTube. Не bump-ить версию без проверяемой гипотезы.

## Пути и правила

```
Repo:        /Users/kamilimangulov/vita
Extension:   focus/extension/                 ← редактировать здесь
Registry:    focus/shared/registry.json
Xcode:       focus/safari/Vita Focus/Vita Focus.xcodeproj
Safari copy: focus/safari/.../Resources/      ← не править вручную
Shared iOS:  focus/safari/Vita Focus/Shared/FocusShared.swift
Widgets:     focus/safari/Vita Focus/iOS (Widget)/VitaFocusWidgets.swift
Site/API:    app/main.py + static/
```

После extension-правок:

```bash
./focus/sync-registry.sh
./focus/sync-safari.sh
```

После prod-правок:

```bash
./scripts/deploy.sh
```

## Проверки

```bash
./focus/tests/run-goal-tests.sh
node focus/tests/run-extension-regression-tests.mjs
node --check "focus/safari/Vita Focus/Shared (App)/Resources/Script.js"
plutil -lint "focus/safari/Vita Focus/Vita Focus.xcodeproj/project.pbxproj"
```

Проверено на текущей ветке:

- 37 pure Swift checks для inclusive goal ranges, habit/deep-link parsing,
  streak и rolling widget grid;
- 5 extension regression checks для text-only CSS, cooldown, manifest и sync;
- iOS app target без signing: build success;
- standalone widget target: build success;
- macOS app target без signing: build success;
- `git diff --check`, JS syntax, plist/pbx syntax: clean.

Device signing, App Group provisioning и реальное поведение Safari на iPhone
подтверждаются только запуском через Xcode на устройстве.

## Приоритет дальше

1. Устройство: проверить диагностику, появление `Vita · привычка`, deep link и
   отметку дня из WidgetKit.
2. Multiple habits: server identity для нескольких goal codes + configurable widgets.
3. Объединить native onboarding в три понятных раздела: Focus / Привычки / Обои.
4. Extension чинить только по device-сигналу, не вслепую.
