import {
  getSettings, setSetting, setSettings, getPinState, setPin, clearPin, verifyPin,
  getSchedule, setSchedule, getCooldownHours, setCooldownHours, getPendingInfo,
  exportBundle, importBundle,
} from '../shared/storage.js';
import {
  siteFromUrl, pageContext, featuredSites, siteCount, totalActive,
  groupToggles, masterState, makeRow, moveTabIndicator,
} from './ui.js';

const REGISTRY_URL = chrome.runtime.getURL('shared/registry.json');
const $ = s => document.querySelector(s);

let registry = {};
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
  $('#ver').textContent = chrome.runtime.getManifest().version;

  const r = await fetch(REGISTRY_URL);
  registry = await r.json();
  sites = registry.sites;
  uiMeta = registry.ui || {};
  presets = (registry.presets || []).filter(p =>
    (uiMeta.settingsPresetIds || ['work', 'youtube', 'social', 'off']).includes(p.id)
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
  refreshHeader();
  renderRows();
  updateFilterBox();
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

function askPin(title = 'PIN') {
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
  const pin = await askPin('PIN, чтобы выключить');
  if (!pin || !(await verifyPin(pin))) return false;
  return true;
}

async function needPinForBulk(offCount) {
  if (!offCount || !pinEnabled) return true;
  const pin = await askPin('PIN для выключения');
  if (!pin || !(await verifyPin(pin))) return false;
  return true;
}

function allToggles() {
  return sites.flatMap(s => s.toggles);
}

function currentSite() {
  return sites.find(s => s.id === active);
}

function mainToggles(site) {
  const main = groupToggles(site, uiMeta.groupLabels || {}).find(g => g.id === 'main');
  return main?.toggles || site.toggles;
}

function refreshHeader() {
  const site = currentSite();
  if (!site) return;

  const act = totalActive(sites, settings);
  const all = allToggles().length;
  $('#scoreAct').textContent = act;
  $('#scoreAll').textContent = all;
  $('#siteName').textContent = site.name;
  $('#siteCnt').textContent = `${siteCount(site, settings)} из ${site.toggles.length} включено`;

  const ctx = pageContext(tabUrl, site.id);
  const ctxEl = $('#pageCtx');
  if (ctx) {
    ctxEl.textContent = ctx;
    ctxEl.hidden = false;
  } else {
    ctxEl.hidden = true;
  }

  refreshMaster();
  refreshTabs();
}

function refreshMaster() {
  const site = currentSite();
  if (!site) return;
  const main = mainToggles(site);
  const on = main.filter(t => settings[t.id]).length;
  const sw = $('#masterSw');
  const row = $('#masterRow');
  sw.checked = on === main.length && main.length > 0;
  row.classList.toggle('partial', on > 0 && on < main.length);
  $('#masterHint').textContent = on === main.length
    ? 'все основные блокировки'
    : on ? `${on} из ${main.length} основных` : 'основные блокировки выкл';
}

function buildTabs() {
  const nav = $('#tabs');
  nav.querySelectorAll('.tab').forEach(n => n.remove());

  featured.forEach(s => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tab';
    b.dataset.id = s.id;
    const n = siteCount(s, settings);
    b.innerHTML = `<span class="g">${s.glyph}</span><span>${s.name}</span><span class="cnt">${n}</span>`;
    if (s.id === active) b.classList.add('on');
    if (n > 0) b.classList.add('has');
    b.addEventListener('click', () => selectSite(s.id));
    nav.insertBefore(b, $('#tabInd'));
  });

  $('#moreSites').hidden = restSites.length === 0;
}

function refreshTabs() {
  featured.forEach(s => {
    const b = $(`.tab[data-id="${s.id}"]`);
    if (!b) return;
    const n = siteCount(s, settings);
    b.querySelector('.cnt').textContent = n;
    b.classList.toggle('has', n > 0);
    b.classList.toggle('on', s.id === active);
  });
  requestAnimationFrame(() => moveTabIndicator($('#tabs'), active));
}

function buildSiteList() {
  const box = $('#siteList');
  box.innerHTML = '';
  sites.forEach(s => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'site-item' + (s.id === active ? ' on' : '');
    b.dataset.id = s.id;
    b.innerHTML = `<span class="g">${s.glyph}</span><span class="n">${s.name}</span><span class="c">${siteCount(s, settings)}/${s.toggles.length}</span>`;
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
    const s = sites.find(x => x.id === el.dataset.id);
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
  refreshHeader();
  renderRows();
  updateFilterBox();
}

function renderRows() {
  const site = currentSite();
  const box = $('#rows');
  box.innerHTML = '';
  if (!site) return;

  groupToggles(site, uiMeta.groupLabels || {}).forEach(({ label, toggles }) => {
    const wrap = document.createElement('section');
    wrap.className = 'group';
    if (label) {
      const h = document.createElement('div');
      h.className = 'group-h';
      h.textContent = label;
      wrap.appendChild(h);
    }
    toggles.forEach(t => wrap.appendChild(makeRow(t, !!settings[t.id])));
    box.appendChild(wrap);
  });
}

function updateFilterBox() {
  const box = $('#filterBox');
  const show = active === 'youtube';
  box.hidden = !show;
  if (show) {
    $('#kwIn').value = settings.yt_kw || '';
    $('#chIn').value = settings.yt_ch || '';
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

async function setSiteBulk(on) {
  const site = currentSite();
  if (!site) return;
  if (!on) {
    const offCount = site.toggles.filter(t => settings[t.id]).length;
    if (!(await needPinForBulk(offCount))) return;
  }
  const patch = Object.fromEntries(site.toggles.map(t => [t.id, on]));
  settings = await setSettings(patch);
  refreshHeader();
  renderRows();
  buildSiteList();
  await refreshScheduleUi();
  await refreshSchedBadge();
}

async function toggleMaster(on) {
  const site = currentSite();
  if (!site) return;
  const main = mainToggles(site);
  if (!on) {
    const offCount = main.filter(t => settings[t.id]).length;
    if (!(await needPinForBulk(offCount))) {
      refreshMaster();
      return;
    }
  }
  const patch = Object.fromEntries(main.map(t => [t.id, on]));
  settings = await setSettings(patch);
  refreshHeader();
  renderRows();
  buildSiteList();
  await refreshScheduleUi();
  await refreshSchedBadge();
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
    const pin = await askPin('PIN для смены профиля');
    if (!pin || !(await verifyPin(pin))) return;
  }
  const patch = Object.fromEntries(ids.map(id => [id, false]));
  Object.assign(patch, preset.settings);
  settings = await setSettings(patch);
  refreshHeader();
  renderRows();
  buildSiteList();
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
  let on = start === end || (start < end ? h >= start && h < end : h >= start || h < end);
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
  $('#moreSites').addEventListener('click', openSheet);
  $('#closeSheet').addEventListener('click', closeSheet);
  $('#siteSheet .overlay-bg').addEventListener('click', closeSheet);
  $('#siteSearch').addEventListener('input', e => filterSiteList(e.target.value));

  $('#siteAllOn').addEventListener('click', () => setSiteBulk(true));
  $('#siteAllOff').addEventListener('click', () => setSiteBulk(false));

  $('#masterRow').addEventListener('click', e => {
    if (e.target.id === 'masterSw') return;
    const sw = $('#masterSw');
    sw.checked = !sw.checked;
    toggleMaster(sw.checked);
  });
  $('#masterSw').addEventListener('change', e => {
    e.stopPropagation();
    toggleMaster(e.target.checked);
  });

  $('#rows').addEventListener('click', async e => {
    const row = e.target.closest('.row');
    if (!row) return;
    const id = row.dataset.id;
    const on = !!settings[id];
    const next = !on;
    if (!(await needPinToDisable(on, next))) return;
    await toggleId(id, next);
    row.classList.toggle('on', !!settings[id]);
    refreshHeader();
    buildSiteList();
    await refreshScheduleUi();
    await refreshSchedBadge();
  });

  const saveFilters = async () => {
    settings = await setSettings({ yt_kw: $('#kwIn').value, yt_ch: $('#chIn').value });
  };
  $('#kwIn').addEventListener('change', saveFilters);
  $('#kwIn').addEventListener('blur', saveFilters);
  $('#chIn').addEventListener('change', saveFilters);
  $('#chIn').addEventListener('blur', saveFilters);

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
    const pin = $('#pinIn').value.trim() || await askPin('Текущий PIN');
    if (!pin) return;
    try {
      await clearPin(pin);
      $('#pinIn').value = '';
      await refreshPinUi();
      pinMsg('', false);
    } catch {
      pinMsg('Неверный PIN');
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
    refreshHeader();
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
      refreshHeader();
      renderRows();
      buildSiteList();
      updateFilterBox();
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
