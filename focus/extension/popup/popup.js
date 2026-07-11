import {
  getSettings, setSetting, setSettings, getPinState, setPin, clearPin, verifyPin,
  getSchedule, setSchedule, getCooldownHours, setCooldownHours, getPendingInfo,
  exportBundle, importBundle,
} from '../shared/storage.js';
import {
  siteFromUrl, featuredSites, siteCount, splitGroups,
  appendGroupCard, moveTabIndicator, el,
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
let pinResolve = null;

async function init() {
  $('#ver').textContent = 'v' + chrome.runtime.getManifest().version;

  const r = await fetch(REGISTRY_URL);
  const data = await r.json();
  sites = data.sites;
  uiMeta = data.ui || {};
  presets = (data.presets || []).filter(p =>
    (uiMeta.settingsPresetIds || []).includes(p.id)
  );
  ({ featured, rest: restSites } = featuredSites(sites, uiMeta));

  settings = await getSettings();
  await loadTabContext();

  const stored = await chrome.storage.sync.get('activeSite');
  if (!tabUrl && stored.activeSite && sites.some(s => s.id === stored.activeSite)) {
    active = stored.activeSite;
  }

  await refreshPinUi();
  await refreshScheduleUi();
  await refreshSchedBadge();

  buildTabs();
  buildSiteList();
  buildPresets();
  refreshSiteHead();
  renderRows();
  bindAll();
  requestAnimationFrame(() => moveTabIndicator($('#tabs'), active));
}

async function loadTabContext() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabUrl = tab?.url || '';
    const hit = siteFromUrl(tabUrl, sites);
    if (hit) active = hit.id;
  } catch {
    tabUrl = '';
  }
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
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tab' + (s.id === active ? ' on' : '');
    b.dataset.id = s.id;
    b.innerHTML = `<span class="g">${s.glyph}</span><span>${s.name}</span>`;
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
  $('#tabs').querySelectorAll('.tab[data-id]').forEach(b => {
    b.classList.toggle('on', b.dataset.id === active);
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
  renderRows();
}

function renderRows() {
  const site = currentSite();
  const box = $('#rows');
  box.innerHTML = '';
  if (!site) return;

  const { primary, advanced } = splitGroups(site, uiMeta);
  const useFilters = site.id === 'youtube';

  primary.forEach(g => appendGroupCard(box, g, settings, useFilters));

  if (advanced.length) {
    const details = el('details', 'adv');
    details.innerHTML = '<summary>Ещё настройки</summary>';
    advanced.forEach(g => appendGroupCard(details, g, settings, useFilters));
    box.appendChild(details);
  } else if (site.toggles.length && !primary.length) {
    appendGroupCard(box, { label: null, toggles: site.toggles }, settings, useFilters);
  }
}

async function toggleId(id, on) {
  const hours = await getCooldownHours();
  if (!on && hours > 0 && settings[id]) {
    settings = await setSetting(id, false);
  } else {
    settings = await setSetting(id, on);
  }
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
  const patch = Object.fromEntries(ids.map(id => [id, false]));
  Object.assign(patch, preset.settings);
  settings = await setSettings(patch);
  refreshTabs();
  refreshSiteHead();
  renderRows();
  await refreshScheduleUi();
  await refreshSchedBadge();
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
  $('#closeSheet').addEventListener('click', closeSheet);
  $('#siteSheet .overlay-bg').addEventListener('click', closeSheet);
  $('#siteSearch').addEventListener('input', e => filterSiteList(e.target.value));

  $('#rows').addEventListener('click', async e => {
    if (e.target.matches('input[data-filter]')) return;
    const row = e.target.closest('.row');
    if (!row) return;
    const id = row.dataset.id;
    const on = !!settings[id];
    const next = !on;
    if (!(await needPinToDisable(on, next))) return;
    await toggleId(id, next);
    row.classList.toggle('on', !!settings[id]);
    refreshSiteHead();
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
  });
  $('#rows').addEventListener('blur', async e => {
    const input = e.target.closest('input[data-filter]');
    if (!input) return;
    const patch = input.dataset.filter === 'kw'
      ? { yt_kw: input.value }
      : { yt_ch: input.value };
    settings = await setSettings(patch);
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
      renderRows();
      await refreshScheduleUi();
      await refreshSchedBadge();
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
