import {
  getSettings, setSetting, setSettings, getPinState, setPin, clearPin, verifyPin,
  getSchedule, setSchedule, getCooldownHours, setCooldownHours, getPendingInfo,
  exportBundle, importBundle, getDarkMode, setDarkMode,
} from '../shared/storage.js';
import {
  siteFromUrl, featuredSites, siteCount,
  appendGroupCard, moveTabIndicator,
} from './ui.js';

const REGISTRY_URL = chrome.runtime.getURL('shared/registry.json');
const $ = s => document.querySelector(s);

let sites = [];
let presets = [];
let uiMeta = {};
let featured = [];
let restSites = [];
let active = 'youtube';
let settings = {};
let pinEnabled = false;
let tabUrl = '';
let tabId = null;
let pinResolve = null;
let statusTimer = null;
let registryCache = null;
let darkMode = { enabled: false, brightness: 100, contrast: 95, sepia: 8 };

function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);
  [...$('#themeRow').children].forEach(b => {
    b.classList.toggle('on', b.dataset.theme === mode);
  });
}

async function loadTheme() {
  const { uiTheme } = await chrome.storage.sync.get('uiTheme');
  applyTheme(uiTheme || 'system');
}

async function saveTheme(mode) {
  await chrome.storage.sync.set({ uiTheme: mode });
  applyTheme(mode);
}

function setStatus(_text, _kind = 'idle') {
  clearTimeout(statusTimer);
}

async function pushApply() {
  try {
    await chrome.runtime.sendMessage({ type: 'vfocus:broadcast' });
    setStatus('Применено на странице ✓', 'on');
  } catch {
    setStatus('Сохранено', 'on');
  }
}

async function pushDark() {
  try {
    await chrome.runtime.sendMessage({ type: 'vfocus:broadcast' });
    setStatus(darkMode.enabled ? 'Тёмная тема вкл ✓' : 'Тёмная тема выкл', 'on');
  } catch {
    setStatus('Сохранено', 'on');
  }
}

function refreshDarkUi() {
  const row = $('#darkRow');
  if (!row) return;
  row.classList.toggle('on', !!darkMode.enabled);
  $('#darkState').textContent = darkMode.enabled ? 'вкл' : 'выкл';
  $('#dmBright').value = darkMode.brightness;
  $('#dmContrast').value = darkMode.contrast;
  $('#dmBrightVal').textContent = darkMode.brightness;
  $('#dmContrastVal').textContent = darkMode.contrast;
}

async function loadDarkUi() {
  darkMode = await getDarkMode();
  refreshDarkUi();
}

async function loadRegistry() {
  if (registryCache) return registryCache;
  try {
    const cached = await chrome.storage.local.get('registryCache');
    if (cached.registryCache) {
      registryCache = cached.registryCache;
      fetch(REGISTRY_URL).then(r => r.json()).then(data => {
        registryCache = data;
        chrome.storage.local.set({ registryCache: data }).catch(() => {});
      }).catch(() => {});
      return registryCache;
    }
  } catch { /* ignore */ }
  const r = await fetch(REGISTRY_URL);
  registryCache = await r.json();
  chrome.storage.local.set({ registryCache }).catch(() => {});
  return registryCache;
}

async function init() {
  $('#ver').textContent = 'v' + chrome.runtime.getManifest().version;
  loadTheme();

  const data = await loadRegistry();
  sites = data.sites;
  uiMeta = data.ui || {};
  presets = (data.presets || []).filter(p =>
    (uiMeta.settingsPresetIds || []).includes(p.id)
  );
  ({ featured, rest: restSites } = featuredSites(sites, uiMeta));

  const [settingsData, , , , , activeSiteStored] = await Promise.all([
    getSettings(),
    loadTabContext(),
    refreshPinUi(),
    refreshScheduleUi(),
    refreshSchedBadge(),
    chrome.storage.sync.get('activeSite'),
    loadDarkUi(),
  ]);
  settings = settingsData;

  if (!tabUrl && activeSiteStored.activeSite && sites.some(s => s.id === activeSiteStored.activeSite)) {
    active = activeSiteStored.activeSite;
  }

  buildTabs();
  buildSiteList();
  buildPresets();
  refreshSiteHead();
  refreshMaster();
  renderRows();
  bindAll();
  refreshPageStatus();
  requestAnimationFrame(() => moveTabIndicator($('#tabs'), active));
}

async function loadTabContext() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabUrl = tab?.url || '';
    tabId = tab?.id ?? null;
    const hit = siteFromUrl(tabUrl, sites);
    if (hit) active = hit.id;
  } catch {
    tabUrl = '';
    tabId = null;
  }
}

async function refreshPageStatus() {
  const el = $('#pageStatus');
  if (!el) return;
  if (tabId == null || !/^https?:/i.test(tabUrl)) {
    el.hidden = true;
    return;
  }
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: 'vfocus:ping' });
    if (!res?.ok) throw new Error('no-pong');
    el.textContent = `Работает на этой вкладке · v${res.version || '?'}`;
    el.className = 'page-status ok';
  } catch {
    el.textContent = 'На этой вкладке не активен — обнови страницу';
    el.className = 'page-status off';
  }
  el.hidden = false;
}

function showMain() {
  $('#viewMain').hidden = false;
  $('#viewSettings').hidden = true;
}

function showSettings() {
  $('#viewMain').hidden = true;
  $('#viewSettings').hidden = false;
}

function askPin(title = 'Пароль') {
  return new Promise(resolve => {
    pinResolve = resolve;
    $('#pinTitle').textContent = title;
    $('#pinPrompt').value = '';
    $('#pinSheet').hidden = false;
    setTimeout(() => $('#pinPrompt').focus(), 50);
  });
}

function closePinSheet(value) {
  $('#pinSheet').hidden = true;
  if (pinResolve) {
    pinResolve(value);
    pinResolve = null;
  }
}

async function needPinToDisable(wasOn, next) {
  if (!wasOn || next) return true;
  if (!pinEnabled) return true;
  const pin = await askPin('Пароль для выключения');
  if (!pin || !(await verifyPin(pin))) return false;
  return true;
}

function allToggles() {
  return sites.flatMap(s => s.toggles);
}

function currentSite() {
  return sites.find(s => s.id === active);
}

function refreshMaster() {
  const site = currentSite();
  const btn = $('#siteMaster');
  if (!site || !btn) return;
  const n = siteCount(site, settings);
  const total = site.toggles.length;
  btn.classList.toggle('on', n > 0);
  btn.classList.toggle('part', n > 0 && n < total);
  const lbl = $('#masterLabel');
  if (lbl) {
    lbl.textContent = n === total ? 'Фокус вкл' : n ? `${n}/${total}` : 'Фокус выкл';
  }
}

async function setSiteMaster(on) {
  const site = currentSite();
  if (!site) return;
  if (!on) {
    const turningOff = site.toggles.filter(t => settings[t.id]);
    if (turningOff.length && pinEnabled) {
      const pin = await askPin('Пароль для выключения');
      if (!pin || !(await verifyPin(pin))) return;
    }
  }
  setStatus('Сохраняю…', 'busy');
  const patch = Object.fromEntries(site.toggles.map(t => [t.id, on]));
  settings = await setSettings(patch);
  renderRows();
  refreshSiteHead();
  refreshTabs();
  refreshMaster();
  await refreshScheduleUi();
  await refreshSchedBadge();
  await pushApply();
}

function refreshSiteHead() {
  const site = currentSite();
  if (!site) return;
  const n = siteCount(site, settings);
  $('#siteTitle').textContent = site.name;
  $('#siteMeta').textContent = n
    ? `${n} ${n === 1 ? 'блок включён' : n < 5 ? 'блока включено' : 'блоков включено'}`
    : 'все блокировки выключены';
}

function buildTabs() {
  const nav = $('#tabs');
  nav.querySelectorAll('.tab').forEach(n => n.remove());

  featured.forEach(s => {
    const n = siteCount(s, settings);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tab' + (s.id === active ? ' on' : '') + (n ? ' has' : '');
    b.dataset.id = s.id;
    b.innerHTML = `<span class="g">${s.glyph}</span><span>${s.name}</span><span class="tab-cnt">${n || ''}</span>`;
    b.addEventListener('click', () => selectSite(s.id));
    nav.insertBefore(b, $('#tabInd'));
  });

  if (restSites.length) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'tab more';
    more.id = 'tabMore';
    more.textContent = '⋯';
    more.title = 'Ещё сайты';
    more.addEventListener('click', openSheet);
    nav.appendChild(more);
  }
}

function refreshTabs() {
  featured.forEach(s => {
    const b = $(`#tabs .tab[data-id="${s.id}"]`);
    if (!b) return;
    const n = siteCount(s, settings);
    b.classList.toggle('on', s.id === active);
    b.classList.toggle('has', n > 0);
    const cnt = b.querySelector('.tab-cnt');
    if (cnt) cnt.textContent = n || '';
  });
  requestAnimationFrame(() => moveTabIndicator($('#tabs'), active));
}

function buildSiteList() {
  const box = $('#siteList');
  box.innerHTML = '';
  restSites.forEach(s => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'site-item' + (s.id === active ? ' on' : '');
    b.dataset.id = s.id;
    b.innerHTML = `<span class="g">${s.glyph}</span><span class="n">${s.name}</span>`;
    b.addEventListener('click', () => {
      selectSite(s.id);
      closeSheet();
    });
    box.appendChild(b);
  });
}

function filterSiteList(q) {
  const needle = q.trim().toLowerCase();
  [...$('#siteList').children].forEach(el => {
    const s = restSites.find(x => x.id === el.dataset.id);
    el.hidden = needle && !s.name.toLowerCase().includes(needle);
  });
}

function openSheet() {
  $('#siteSheet').hidden = false;
  $('#siteSearch').value = '';
  filterSiteList('');
}

function closeSheet() {
  $('#siteSheet').hidden = true;
}

function selectSite(id) {
  active = id;
  chrome.storage.sync.set({ activeSite: active });
  refreshTabs();
  refreshSiteHead();
  refreshMaster();
  renderRows();
}

function renderRows() {
  const site = currentSite();
  const box = $('#rows');
  box.innerHTML = '';
  if (!site) return;

  const mainToggles = site.toggles.filter(t => (t.group || 'main') === 'main');
  const toggles = mainToggles.length ? mainToggles : site.toggles;
  appendGroupCard(box, { label: null, toggles }, settings, false);
}

async function toggleId(id, on) {
  const hours = await getCooldownHours();
  if (!on && hours > 0 && settings[id]) {
    settings = await setSetting(id, false);
  } else {
    settings = await setSetting(id, on);
  }
  if (on && id === 'yt_thumbs') settings = await setSetting('yt_blur', false);
  if (on && id === 'yt_blur') settings = await setSetting('yt_thumbs', false);
}

function buildPresets() {
  const nav = $('#presets');
  nav.innerHTML = '';
  presets.forEach(p => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'preset';
    b.textContent = `${p.glyph || ''} ${p.name}`.trim();
    b.addEventListener('click', () => applyPreset(p));
    nav.appendChild(b);
  });
}

async function applyPreset(preset) {
  const ids = allToggles().map(t => t.id);
  const turningOff = ids.filter(id => settings[id] && !(preset.settings[id]));
  if (turningOff.length && pinEnabled) {
    const pin = await askPin('Пароль для смены профиля');
    if (!pin || !(await verifyPin(pin))) return;
  }
  setStatus('Сохраняю…', 'busy');
  const patch = Object.fromEntries(ids.map(id => [id, false]));
  Object.assign(patch, preset.settings);
  settings = await setSettings(patch);
  refreshTabs();
  refreshSiteHead();
  refreshMaster();
  renderRows();
  await refreshScheduleUi();
  await refreshSchedBadge();
  await pushApply();
}

async function refreshPinUi() {
  const st = await getPinState();
  pinEnabled = st.enabled && !!st.hash;
  $('#pinState').textContent = pinEnabled ? 'вкл' : 'выкл';
}

async function refreshScheduleUi() {
  const sched = await getSchedule();
  const hours = await getCooldownHours();
  $('#schedOn').checked = sched.enabled;
  $('#schedStart').value = sched.start;
  $('#schedEnd').value = sched.end;
  $('#schedState').textContent = sched.enabled ? `${sched.start}:00–${sched.end}:00` : 'выкл';
  $('#cooldownOn').checked = hours > 0;

  const pending = await getPendingInfo();
  const keys = Object.keys(pending);
  const msg = $('#pendingMsg');
  if (!keys.length) { msg.hidden = true; return; }
  const labels = keys.map(id => {
    const t = allToggles().find(x => x.id === id);
    const h = Math.ceil((pending[id] - Date.now()) / 3600000);
    return `${t?.label || id} (~${h}ч)`;
  });
  msg.textContent = `Снимется: ${labels.join(', ')}`;
  msg.hidden = false;
}

async function refreshSchedBadge() {
  const sched = await getSchedule();
  const badge = $('#schedBadge');
  if (!sched.enabled) { badge.hidden = true; return; }
  const h = new Date().getHours();
  const { start, end } = sched;
  const on = start === end || (start < end ? h >= start && h < end : h >= start || h < end);
  badge.hidden = false;
  badge.textContent = on ? 'сейчас: фокус' : 'сейчас: пауза';
  badge.className = 'pill ' + (on ? 'on' : 'off');
}

function pinMsg(text, show = true, ok = false) {
  const n = $('#pinMsg');
  n.textContent = text;
  n.hidden = !show;
  n.className = ok ? 'msg ok' : 'msg err';
}

function bindAll() {
  $('#openSettings').addEventListener('click', showSettings);
  $('#closeSettings').addEventListener('click', showMain);
  $('#siteMaster').addEventListener('click', async () => {
    const site = currentSite();
    if (!site) return;
    const allOn = site.toggles.every(t => settings[t.id]);
    await setSiteMaster(!allOn);
  });
  $('#closeSheet').addEventListener('click', closeSheet);
  $('#siteSheet .overlay-bg').addEventListener('click', closeSheet);
  $('#siteSearch').addEventListener('input', e => filterSiteList(e.target.value));

  $('#themeRow').addEventListener('click', e => {
    const btn = e.target.closest('.theme-btn');
    if (!btn) return;
    saveTheme(btn.dataset.theme);
  });

  $('#darkRow')?.addEventListener('click', async () => {
    darkMode.enabled = !darkMode.enabled;
    refreshDarkUi();
    setStatus('Сохраняю…', 'busy');
    await setDarkMode({ enabled: darkMode.enabled });
    await pushDark();
  });

  const saveDarkSliders = async () => {
    darkMode.brightness = Number($('#dmBright').value) || 100;
    darkMode.contrast = Number($('#dmContrast').value) || 95;
    refreshDarkUi();
    await setDarkMode({
      brightness: darkMode.brightness,
      contrast: darkMode.contrast,
    });
    await pushDark();
  };
  $('#dmBright')?.addEventListener('input', e => {
    $('#dmBrightVal').textContent = e.target.value;
  });
  $('#dmContrast')?.addEventListener('input', e => {
    $('#dmContrastVal').textContent = e.target.value;
  });
  $('#dmBright')?.addEventListener('change', saveDarkSliders);
  $('#dmContrast')?.addEventListener('change', saveDarkSliders);

  $('#rows').addEventListener('click', async e => {
    if (e.target.matches('input[data-filter]')) return;
    const row = e.target.closest('.row');
    if (!row) return;
    const id = row.dataset.id;
    const on = !!settings[id];
    const next = !on;
    if (!(await needPinToDisable(on, next))) return;

    const prev = settings[id];
    settings[id] = next;
    row.classList.toggle('on', next);
    row.classList.remove('flash');
    void row.offsetWidth;
    row.classList.add('flash');
    refreshSiteHead();
    refreshMaster();
    refreshTabs();
    setStatus('Сохраняю…', 'busy');

    try {
      await toggleId(id, next);
      row.classList.toggle('on', !!settings[id]);
      await pushApply();
    } catch {
      settings[id] = prev;
      row.classList.toggle('on', !!prev);
      refreshSiteHead();
      setStatus('Ошибка сохранения', 'idle');
    }
    await refreshScheduleUi();
    await refreshSchedBadge();
  });

  $('#rows').addEventListener('change', async e => {
    const input = e.target.closest('input[data-filter]');
    if (!input) return;
    const patch = input.dataset.filter === 'kw'
      ? { yt_kw: input.value }
      : { yt_ch: input.value };
    settings = await setSettings(patch);
    await pushApply();
  });
  $('#rows').addEventListener('blur', async e => {
    const input = e.target.closest('input[data-filter]');
    if (!input) return;
    const patch = input.dataset.filter === 'kw'
      ? { yt_kw: input.value }
      : { yt_ch: input.value };
    settings = await setSettings(patch);
    await pushApply();
  }, true);

  $('#pinSave').addEventListener('click', async () => {
    try {
      await setPin($('#pinIn').value.trim());
      $('#pinIn').value = '';
      await refreshPinUi();
      pinMsg('', false);
    } catch {
      pinMsg('Минимум 4 символа');
    }
  });
  $('#pinOff').addEventListener('click', async () => {
    const pin = $('#pinIn').value.trim() || await askPin('Текущий пароль');
    if (!pin) return;
    try {
      await clearPin(pin);
      $('#pinIn').value = '';
      await refreshPinUi();
      pinMsg('', false);
    } catch {
      pinMsg('Неверный пароль');
    }
  });

  const saveSched = async () => {
    await setSchedule({
      enabled: $('#schedOn').checked,
      start: Number($('#schedStart').value) || 9,
      end: Number($('#schedEnd').value) || 22,
    });
    await setCooldownHours($('#cooldownOn').checked ? 12 : 0);
    await refreshScheduleUi();
    await refreshSchedBadge();
    settings = await getSettings();
    renderRows();
  };
  $('#schedOn').addEventListener('change', saveSched);
  $('#schedStart').addEventListener('change', saveSched);
  $('#schedEnd').addEventListener('change', saveSched);
  $('#cooldownOn').addEventListener('change', saveSched);

  $('#exportBtn').addEventListener('click', async () => {
    const json = await exportBundle();
    try {
      await navigator.clipboard.writeText(json);
      pinMsg('Скопировано', true, true);
      setTimeout(() => pinMsg('', false), 2000);
    } catch {
      prompt('Скопируй:', json);
    }
  });
  $('#importBtn').addEventListener('click', async () => {
    const raw = prompt('JSON настроек:');
    if (!raw) return;
    try {
      await importBundle(raw);
      settings = await getSettings();
      refreshTabs();
      refreshMaster();
      renderRows();
      await refreshScheduleUi();
      await refreshSchedBadge();
      await pushApply();
      pinMsg('Импорт OK', true, true);
      setTimeout(() => pinMsg('', false), 2000);
    } catch {
      pinMsg('Битый JSON');
    }
  });

  $('#pinCancel').addEventListener('click', () => closePinSheet(null));
  $('#pinSheet .overlay-bg').addEventListener('click', () => closePinSheet(null));
  $('#pinOk').addEventListener('click', () => closePinSheet($('#pinPrompt').value.trim()));
  $('#pinPrompt').addEventListener('keydown', e => {
    if (e.key === 'Enter') closePinSheet($('#pinPrompt').value.trim());
  });
}

init();
