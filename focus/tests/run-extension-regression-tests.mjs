#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const extensionDir = join(root, 'focus/extension');
const safariDir = join(root, 'focus/safari/Vita Focus/Shared (Extension)/Resources');
const youtubePath = join(extensionDir, 'content/youtube.js');
const popupPath = join(extensionDir, 'popup/popup.js');
const registryPath = join(extensionDir, 'shared/registry.json');
const manifestPath = join(extensionDir, 'manifest.json');
const staticFocusPath = join(root, 'static/focus.html');
const appResourcesDir = join(root, 'focus/safari/Vita Focus/Shared (App)/Resources');
const appScriptPath = join(appResourcesDir, 'Script.js');
const appMainPath = join(appResourcesDir, 'Base.lproj/Main.html');
const appStylePath = join(appResourcesDir, 'Style.css');
const appControllerPath = join(root, 'focus/safari/Vita Focus/Shared (App)/ViewController.swift');

let passed = 0;
let failed = 0;
const tests = [];

function test(name, body) {
  tests.push({ name, body });
}

function section(source, start, end) {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `Не найден маркер: ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(to, -1, `Не найден маркер: ${end}`);
  return source.slice(from, to);
}

function normalizeSelector(selector) {
  return selector.replace(/\s+/g, ' ').trim();
}

function cssRules(css) {
  const rules = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = pattern.exec(css))) {
    rules.push({
      selectors: match[1].split(',').map(normalizeSelector).filter(Boolean),
      declarations: match[2],
    });
  }
  return rules;
}

function relativeFiles(directory) {
  const files = [];
  const walk = current => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === '.DS_Store') continue;
      const absolute = join(current, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) files.push(relative(directory, absolute));
    }
  };
  walk(directory);
  return files.sort();
}

test('mobile text-only CSS keeps video rows and hides only their thumbnails', () => {
  const source = readFileSync(youtubePath, 'utf8');
  const declarations = [
    section(source, 'const ROW_SEL =', 'const THUMB_HIDE_SEL ='),
    section(source, 'function scopedRowDescendants(', 'const TEXT_ONLY_MOBILE_CSS ='),
    section(source, 'const TEXT_ONLY_MOBILE_CSS =', 'const EMPTY_COMPONENT_SEL ='),
  ].join('\n');
  const result = vm.runInNewContext(
    `${declarations}\n({ rowSelectors: ROW_SEL, css: TEXT_ONLY_MOBILE_CSS })`,
    Object.create(null),
    { filename: youtubePath },
  );

  assert.ok(result.css.trim(), 'TEXT_ONLY_MOBILE_CSS оказался пустым');
  assert.match(
    result.css,
    /ytm-browse yt-lockup-view-model a\.ytLockupViewModelContentImage/,
    'CSS не содержит точечного правила для нового мобильного thumbnail-контейнера',
  );

  const rows = new Set(result.rowSelectors.split(',').map(normalizeSelector).filter(Boolean));
  const rules = cssRules(result.css);
  const selectors = rules.flatMap(rule => rule.selectors);
  const bareRows = selectors.filter(selector => {
    if (rows.has(selector)) return true;
    for (const row of rows) {
      if (selector === `ytm-browse ${row}`) return true;
    }
    return false;
  });
  assert.deepEqual(bareRows, [], `В CSS попали bare ROW_SEL: ${bareRows.join(', ')}`);

  const hiddenLockupRows = rules
    .filter(rule => /display\s*:\s*none\b/i.test(rule.declarations))
    .flatMap(rule => rule.selectors)
    .filter(selector => /(?:^|[\s>])yt-lockup-view-model$/.test(selector));
  assert.deepEqual(
    hiddenLockupRows,
    [],
    `Текстовый режим скрывает yt-lockup-view-model целиком: ${hiddenLockupRows.join(', ')}`,
  );
});

test('extension source is byte-for-byte synced with Safari Resources', () => {
  assert.ok(statSync(safariDir).isDirectory(), 'Safari Resources не найден');
  const sourceFiles = relativeFiles(extensionDir);
  const safariFiles = relativeFiles(safariDir);
  assert.deepEqual(safariFiles, sourceFiles, 'Наборы файлов source и Safari Resources отличаются');

  const changed = sourceFiles.filter(file => {
    const source = readFileSync(join(extensionDir, file));
    const safari = readFileSync(join(safariDir, file));
    return !source.equals(safari);
  });
  assert.deepEqual(changed, [], `Не синхронизированы: ${changed.join(', ')}`);
});

test('Safari extension manifest declares nativeMessaging', () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.ok(Array.isArray(manifest.permissions), 'manifest.permissions должен быть массивом');
  assert.ok(
    manifest.permissions.includes('nativeMessaging'),
    'В manifest.permissions отсутствует nativeMessaging',
  );
});

test('YouTube presets cannot leave text-only with blur or hidden recommendations', () => {
  const popup = readFileSync(popupPath, 'utf8');
  const conflictFunction = section(
    popup,
    'function conflictingYouTubeModes(',
    'function refreshMaster(',
  );
  const conflictingYouTubeModes = vm.runInNewContext(
    `${conflictFunction}\nconflictingYouTubeModes`,
    Object.create(null),
    { filename: popupPath },
  );
  assert.deepEqual(
    [...conflictingYouTubeModes('yt_thumbs')].sort(),
    ['yt_blur', 'yt_recs'],
  );
  assert.deepEqual([...conflictingYouTubeModes('yt_blur')], ['yt_thumbs']);
  assert.deepEqual([...conflictingYouTubeModes('yt_recs')], ['yt_thumbs']);

  const applyPreset = section(popup, 'async function applyPreset(', 'async function refreshPinUi(');
  assert.match(
    applyPreset,
    /if\s*\(patch\.yt_thumbs\)\s*\{[\s\S]*?patch\.yt_blur\s*=\s*false;[\s\S]*?patch\.yt_recs\s*=\s*false;[\s\S]*?\}/,
    'applyPreset не нормализует несовместимые YouTube-режимы',
  );

  const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
  for (const preset of registry.presets) {
    const normalized = { ...preset.settings };
    if (normalized.yt_thumbs) {
      normalized.yt_blur = false;
      normalized.yt_recs = false;
    }
    if (!normalized.yt_thumbs) continue;
    assert.equal(normalized.yt_blur, false, `${preset.id}: text-only + blur`);
    assert.equal(normalized.yt_recs, false, `${preset.id}: text-only + recommendations hidden`);
  }
});

test('expired pending disables its setting and is removed in both storage implementations', async () => {
  const storagePaths = [
    join(extensionDir, 'popup/storage-shim.js'),
    join(extensionDir, 'shared/storage.js'),
  ];

  for (const storagePath of storagePaths) {
    const source = readFileSync(storagePath, 'utf8');
    const applyPendingSource = section(
      source,
      'async function applyPending(',
      '/** Настройки с учётом расписания',
    );
    const writes = [];
    const applyPending = vm.runInNewContext(
      `${applyPendingSource}\napplyPending`,
      { writeStore: async patch => writes.push(patch) },
      { filename: storagePath },
    );

    const now = Date.now();
    const result = await applyPending(
      { yt_shorts: true, yt_recs: true },
      { yt_shorts: now - 1, yt_recs: now + 60_000 },
    );

    assert.equal(result.yt_shorts, false, `${storagePath}: expired setting остался включён`);
    assert.equal(result.yt_recs, true, `${storagePath}: будущий pending применился раньше времени`);
    assert.equal(writes.length, 1, `${storagePath}: результат expired pending не персистится`);
    assert.equal(
      writes[0].settings.yt_shorts,
      false,
      `${storagePath}: в persisted settings нет false`,
    );
    assert.equal(
      Object.hasOwn(writes[0].pending, 'yt_shorts'),
      false,
      `${storagePath}: expired pending не удалён`,
    );
    assert.equal(
      writes[0].pending.yt_recs,
      now + 60_000,
      `${storagePath}: будущий pending потерян`,
    );
  }
});

test('popup persistence, cooldown, effective push, and static mode priority stay coherent', () => {
  const popup = readFileSync(popupPath, 'utf8');

  const rowClick = section(
    popup,
    "$('#rows').addEventListener('click'",
    "$('#rows').addEventListener('change'",
  );
  assert.match(
    rowClick,
    /settings\s*=\s*await\s+persistToggle\(id,\s*next\)/,
    'UI не присваивает возвращённое persistToggle состояние в settings',
  );

  const siteMaster = section(popup, 'async function setSiteMaster(', 'function refreshSiteHead(');
  assert.match(
    siteMaster,
    /if\s*\(!on\s*&&\s*await\s+getCooldownHours\(\)\s*>\s*0\)\s*\{[\s\S]*?await\s+setSetting\(toggle\.id,\s*false\)/,
    'Master выключает настройки пачкой, обходя cooldown/setSetting',
  );

  const applyPreset = section(popup, 'async function applyPreset(', 'async function refreshPinUi(');
  assert.match(
    applyPreset,
    /if\s*\(turningOff\.length\s*&&\s*await\s+getCooldownHours\(\)\s*>\s*0\)\s*\{[\s\S]*?await\s+setSetting\(id,\s*false\)/,
    'Preset выключает настройки пачкой, обходя cooldown/setSetting',
  );

  const pushApply = section(popup, 'async function pushApply(', 'async function pushDark(');
  assert.match(pushApply, /getEffectiveSettings\(\)/, 'pushApply не читает effective settings');
  assert.match(
    pushApply,
    /settings\s*:\s*effective/,
    'pushApply не отправляет вычисленные effective settings',
  );
  assert.doesNotMatch(
    pushApply,
    /settings\s*:\s*settings\b|type\s*:\s*['"]vfocus:settings['"]\s*,\s*settings\s*}/,
    'pushApply отправляет raw settings',
  );

  const staticFocus = readFileSync(staticFocusPath, 'utf8');
  const normalizeSource = section(
    staticFocus,
    'function normalizeYouTubeModes(',
    'function buildPresets(',
  );
  const runNormalize = (changedId, initial) => {
    const context = { settings: { ...initial } };
    const normalize = vm.runInNewContext(
      `${normalizeSource}\nnormalizeYouTubeModes`,
      context,
      { filename: staticFocusPath },
    );
    normalize(changedId);
    return context.settings;
  };

  const blurWins = runNormalize('yt_blur', {
    yt_thumbs: true,
    yt_blur: true,
    yt_recs: false,
  });
  assert.equal(blurWins.yt_blur, true, 'Включённый blur был снят старым text-only режимом');
  assert.equal(blurWins.yt_thumbs, false, 'Изменённый blur не получил приоритет над text-only');

  const recsWins = runNormalize('yt_recs', {
    yt_thumbs: true,
    yt_blur: false,
    yt_recs: true,
  });
  assert.equal(recsWins.yt_recs, true, 'Включённый recs был снят старым text-only режимом');
  assert.equal(recsWins.yt_thumbs, false, 'Изменённый recs не получил приоритет над text-only');

  const thumbsWins = runNormalize('yt_thumbs', {
    yt_thumbs: true,
    yt_blur: true,
    yt_recs: true,
  });
  assert.equal(thumbsWins.yt_blur, false, 'Text-only не снимает blur');
  assert.equal(thumbsWins.yt_recs, false, 'Text-only не снимает hidden recommendations');
});

test('Impulse keeps a virtual Other folder and drills into folder contents', () => {
  const script = readFileSync(appScriptPath, 'utf8');
  const main = readFileSync(appMainPath, 'utf8');
  const folderIdentity = section(script, 'function impulseFolderKey(', 'function animateImpulsePane(');
  const folderOverview = section(script, 'function renderImpulseFolderOverview(', 'function openImpulseFolder(');
  const folderNavigation = section(script, 'function openImpulseFolder(', 'function revealImpulse(');
  const listRender = section(script, 'function renderImpulseList(', 'function fillImpulseEditor(');

  assert.match(script, /const\s+impulseOtherFolderID\s*=\s*"__vita_other__"/, 'Нет стабильного id виртуальной папки «Другое»');
  assert.match(
    folderIdentity,
    /impulseFolder\(item\?\.folderID\)\s*\?\s*String\(item\.folderID\)\s*:\s*impulseOtherFolderID/,
    'Нераспределённые или осиротевшие импульсы не попадают в «Другое»',
  );
  assert.match(folderIdentity, /id\s*===\s*impulseOtherFolderID[\s\S]*?return\s+"Другое"/, 'Виртуальная папка потеряла название');
  assert.match(
    folderOverview,
    /tiles\.push\(makeImpulseFolderTile\(impulseOtherFolderID,\s*"Другое",\s*otherCount,\s*tiles\.length,\s*true\)\)/,
    '«Другое» не добавляется последней плиткой рядом с пользовательскими папками',
  );
  assert.match(folderNavigation, /activeImpulseFolderID\s*=\s*normalized/, 'Открытая папка не сохраняется в состоянии UI');
  assert.match(folderNavigation, /overview\.hidden\s*=\s*true[\s\S]*?view\.hidden\s*=\s*false[\s\S]*?renderImpulseList\(\)/, 'Drill-down не переключает обзор на список папки');
  assert.match(
    listRender,
    /items\.filter\(\(item\)\s*=>\s*impulseFolderKey\(item\)\s*===\s*activeImpulseFolderID\)/,
    'Открытая папка не фильтрует список импульсов',
  );
  assert.match(main, /id="impulseFolderOverview"[\s\S]*?id="impulseFolderView"[\s\S]*?id="backImpulseFolders"/, 'В HTML отсутствует доступный переход папка → список → назад');
});

test('Impulse folder rows stay compact and expose repeat labels through drill-down', () => {
  const script = readFileSync(appScriptPath, 'utf8');
  const repeatLabels = section(script, 'const impulseCompactRepeatLabels =', 'const impulsePriorityLabels =');
  const listRender = section(script, 'function renderImpulseList(', 'function fillImpulseEditor(');

  assert.match(repeatLabels, /daily:\s*"Ежедневно"/, 'Ежедневный повтор не имеет компактной подписи');
  assert.match(repeatLabels, /weekdays:\s*"По будням"/, 'Повтор по будням не имеет компактной подписи');
  assert.match(repeatLabels, /weekly:\s*"Еженедельно"/, 'Еженедельный повтор не имеет компактной подписи');
  assert.match(repeatLabels, /monthly:\s*"Ежемесячно"/, 'Ежемесячный повтор не имеет компактной подписи');
  assert.match(listRender, /summaryButton\.dataset\.impulseAction\s*=\s*"toggle"/, 'Компактная строка не раскрывается нажатием');
  assert.match(listRender, /impulseCompactDate\(item\.fireDate\)[\s\S]*?compactMeta\.append\(date,\s*time\)/, 'Компактная строка не показывает дату и время');
  assert.match(listRender, /impulseCompactRepeatLabels\[item\.repeatRule\][\s\S]*?repeat\.textContent\s*=\s*repeatLabel/, 'Компактная строка не показывает повтор');
  assert.match(listRender, /detailsShell\.setAttribute\("aria-hidden",\s*String\(!expanded\)\)[\s\S]*?detailsShell\.inert\s*=\s*!expanded/, 'Свёрнутые детали остаются доступны фокусу');
});

test('Impulse action matrix differs for reminders and tasks without old Accept', () => {
  const script = readFileSync(appScriptPath, 'utf8');
  const listRender = section(script, 'function renderImpulseList(', 'function fillImpulseEditor(');
  const actions = section(listRender, 'let actionButtons;', 'const deleteButton =');
  const sheetView = section(script, 'function showImpulseSheetView(', 'function revealImpulseSheetLayer(');

  assert.match(actions, /if\s*\(completed\)[\s\S]*?makeImpulseButton\("Удалить",\s*"delete"/, 'Завершённый импульс должен оставлять только удаление');
  assert.match(
    actions,
    /else if\s*\(type\s*===\s*"task"\)[\s\S]*?makeImpulseButton\("Начать",\s*"start",\s*"primary"\)[\s\S]*?makeImpulseButton\("Отложить",\s*"snooze"\)[\s\S]*?makeImpulseButton\("Удалить",\s*"delete"/,
    'У задачи должны быть действия «Начать / Отложить / Удалить»',
  );
  assert.match(
    actions,
    /else\s*\{[\s\S]*?makeImpulseButton\("Готово",\s*"complete",\s*"primary"\)[\s\S]*?makeImpulseButton\("Изменить",\s*"edit"\)[\s\S]*?makeImpulseButton\("Удалить",\s*"delete"/,
    'У напоминания должны быть действия «Готово / Изменить / Удалить»',
  );
  assert.doesNotMatch(actions, /makeImpulseButton\("Принять"/, 'В карточки вернулось старое действие «Принять»');
  assert.match(sheetView, /back\.hidden\s*=\s*view\s*===\s*"snooze"\s*&&\s*isTask/, 'Задача через «Назад» не должна открывать reminder-only действия');
});

test('Impulse save payload carries type and task duration into the native bridge', () => {
  const script = readFileSync(appScriptPath, 'utf8');
  const main = readFileSync(appMainPath, 'utf8');
  const controller = readFileSync(appControllerPath, 'utf8');
  const submit = section(
    script,
    'document.getElementById("impulseEditor")?.addEventListener("submit"',
    'document.querySelectorAll("[data-sheet-close]")',
  );

  assert.match(main, /name="impulseType"\s+value="reminder"\s+checked/, 'В редакторе нет типа reminder по умолчанию');
  assert.match(main, /name="impulseType"\s+value="task"/, 'В редакторе нельзя выбрать задачу');
  assert.match(main, /id="impulseDuration"[^>]*min="1"[^>]*max="240"/, 'Время задачи не ограничено диапазоном 1…240 минут');
  assert.match(submit, /const\s+type\s*=\s*selectedImpulseType\(\)/, 'Submit не читает выбранный тип');
  assert.match(submit, /const\s+durationMinutes\s*=\s*type\s*===\s*"task"[\s\S]*?:\s*null/, 'Reminder ошибочно отправляет длительность задачи');
  assert.match(submit, /action:\s*"save-impulse"[\s\S]*?\btype,\s*[\s\S]*?\bdurationMinutes,/, 'Save payload потерял type или durationMinutes');
  assert.match(controller, /typeRaw:\s*payload\["type"\][\s\S]*?durationMinutes:\s*\(payload\["durationMinutes"\]/, 'Native bridge не принимает type и durationMinutes');
});

test('expired Impulse timers request one native refresh and reconciliation', () => {
  const script = readFileSync(appScriptPath, 'utf8');
  const controller = readFileSync(appControllerPath, 'utf8');
  const countdown = section(script, 'function syncImpulseCountdowns(', 'function refreshImpulseCountdownTimer(');
  const refreshBridge = section(controller, 'if action == "refresh-impulses"', 'if action == "snooze-impulse"');
  const reconcile = section(controller, 'private func reconcileImpulseTimers(', 'private func completeImpulse(');

  assert.match(script, /const\s+refreshedExpiredImpulseTimers\s*=\s*new Set\(\)/, 'Нет защиты от повторных refresh для одного истёкшего таймера');
  assert.match(countdown, /if\s*\(end\s*<=\s*now\)/, 'Истечение таймера не распознаётся');
  assert.match(countdown, /if\s*\(!refreshedExpiredImpulseTimers\.has\(refreshKey\)\)[\s\S]*?refreshedExpiredImpulseTimers\.add\(refreshKey\)[\s\S]*?post\(\{\s*action:\s*"refresh-impulses"\s*\}\)/, 'Истёкший таймер не запрашивает ровно одно обновление состояния');
  assert.match(refreshBridge, /reconcileImpulseTimers\(in:\s*webView\)/, 'Native bridge не обрабатывает refresh-impulses');
  assert.match(reconcile, /VitaImpulseStore\.reconcileExpiredTimers\(\)[\s\S]*?pushImpulseState\(to:\s*webView\)/, 'Native refresh не reconcile-ит таймеры и не возвращает новое состояние');
});

test('Impulse creation stays a bottom row and visible UI has no old Accept action', () => {
  const script = readFileSync(appScriptPath, 'utf8');
  const main = readFileSync(appMainPath, 'utf8');
  const style = readFileSync(appStylePath, 'utf8');

  assert.match(
    main,
    /<\/div>\s*<button id="newImpulse"[^>]*class="impulse-new-row"[^>]*>[\s\S]*?Новый импульс<\/button>\s*<form id="impulseEditor"/,
    'Новая запись должна оставаться нижней строкой перед редактором',
  );
  assert.match(script, /getElementById\("newImpulse"\)\?\.addEventListener\("click",\s*\(\)\s*=>\s*openImpulseEditor\(null,\s*activeImpulseFolderID\)\)/, 'Нижняя строка не открывает редактор в текущей папке');
  assert.match(style, /\.impulse-new-row\s*\{[\s\S]*?background:\s*transparent[\s\S]*?box-shadow:\s*none/, 'Нижняя строка снова выглядит как тяжёлая CTA-кнопка');
  assert.doesNotMatch(main, />\s*Принять\s*</, 'В видимый HTML вернулось старое действие «Принять»');
  assert.doesNotMatch(script, /(?:textContent\s*=|makeImpulseButton\()\s*"Принять"/, 'JS снова создаёт видимое действие «Принять»');
});

test('Impulse transitions keep reduced-motion hooks', () => {
  const script = readFileSync(appScriptPath, 'utf8');
  const style = readFileSync(appStylePath, 'utf8');
  const paneAnimation = section(script, 'function animateImpulsePane(', 'function impulseItem(');
  const reducedMotion = section(
    style,
    '@media (prefers-reduced-motion: reduce)',
    '@media (prefers-reduced-transparency: reduce)',
  );

  assert.match(script, /matchMedia\("\(prefers-reduced-motion:\s*reduce\)"\)/, 'JS не учитывает reduced motion');
  assert.match(paneAnimation, /if\s*\(!element\s*\|\|\s*appReduceMotion\.matches\)\s*return/, 'Folder animation запускается при reduced motion');
  assert.match(style, /\.impulse-browser-pane\.is-entering-forward\s*\{\s*animation:/, 'Нет анимации перехода в папку');
  assert.match(style, /\.impulse-item-details-shell\s*\{[\s\S]*?transition:/, 'Нет плавного раскрытия карточки');
  assert.match(style, /\.impulse-sheet\s*\{[\s\S]*?transition:/, 'Нет плавного появления sheet');
  assert.match(reducedMotion, /\.impulse-browser-pane[\s\S]*?animation:\s*none\s*!important/, 'Reduced motion не отключает навигационные анимации');
  assert.match(reducedMotion, /\.impulse-item-details-shell[\s\S]*?\.impulse-sheet-backdrop[\s\S]*?transition:\s*none\s*!important/, 'Reduced motion не отключает переходы карточек и sheet');
});

for (const { name, body } of tests) {
  try {
    await body();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}`);
    console.error(`  ${error.message}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
