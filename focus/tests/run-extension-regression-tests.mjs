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
