import {
  getSettings, setSetting, setSettings, getPinState, setPin, clearPin, verifyPin,
  getSchedule, setSchedule, getCooldownHours, setCooldownHours, getPendingInfo,
  exportBundle, importBundle,
} from '../shared/storage.js';

const REGISTRY_URL = chrome.runtime.getURL('shared/registry.json');
const YT_MAIN = new Set([
  'yt_shorts', 'yt_recs', 'yt_comments', 'yt_related', 'yt_autoplay',
  'yt_thumbs', 'yt_blur', 'yt_endscreen', 'yt_home_subs', 'yt_watch_clean',
]);
const $ = s => document.querySelector(s);

let sites = [];
let presets = [];
let active = 'youtube';
let settings = {};
let pinEnabled = false;

function hostMatch(host, pattern) {
  const h = host.replace(/^www\./, '');
  const p = pattern.replace(/^www\./, '');
  return h === p || h.endsWith('.' + p);
}

async function detectSiteFromTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url?.startsWith('http')) return null;
    const host = new URL(tab.url).hostname;
    return sites.find(s => (s.hosts || []).some(h => hostMatch(host, h)))?.id || null;
  } catch {
    return null;
  }
}

async function init() {
  $('#ver').textContent = chrome.runtime.getManifest().version;

  const r = await fetch(REGISTRY_URL);
  const data = await r.json();
  sites = data.sites;
  presets = (data.presets || []).filter(p => ['work', 'youtube', 'social', 'off'].includes(p.id));
  settings = await getSettings();

  const fromTab = await detectSiteFromTab();
  const stored = await chrome.storage.sync.get('activeSite');
  if (fromTab) active = fromTab;
  else if (stored.activeSite && sites.some(s => s.id === stored.activeSite)) active = stored.activeSite;

  await refreshPinUi();
  await refreshScheduleUi();
  await refreshSchedBadge();
  buildPresets();
  buildSiteList();
  updateSiteHeader();
  renderRows();
  updateYtExtras();
  bindRows();
  bindYtExtras();
  bindPin();
  bindSchedule();
  bindIO();
  bindNav();
  bindSitePicker();
}

function showMain() {
  $('#viewMain').hidden = false;
  $('#viewSettings').hidden = true;
}

function showSettings() {
  $('#viewMain').hidden = true;
  $('#viewSettings').hidden = false;
}

function bindNav() {
  $('#openSettings').addEventListener('click', showSettings);
  $('#closeSettings').addEventListener('click', showMain);
}

function openSheet() {
  $('#siteSheet').hidden = false;
  $('#siteSearch').value = '';
  filterSiteList('');
  $('#siteSearch').focus();
}

function closeSheet() {
  $('#siteSheet').hidden = true;
}

function bindSitePicker() {
  $('#sitePick').addEventListener('click', openSheet);
  $('#closeSheet').addEventListener('click', closeSheet);
  $('.sheet-backdrop').addEventListener('click', closeSheet);
  $('#siteSearch').addEventListener('input', e => filterSiteList(e.target.value));
}

function buildSiteList() {
  const box = $('#siteList');
  box.innerHTML = '';
  sites.forEach(s => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'site-item' + (s.id === active ? ' on' : '');
    b.dataset.id = s.id;
    b.innerHTML = `<span class="g">${s.glyph}</span><span class="n">${s.name}</span><span class="c">${siteCount(s)}/${s.toggles.length}</span>`;
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

function scheduleActive(sched) {
  if (!sched.enabled) return null;
  const h = new Date().getHours();
  const { start, end } = sched;
  if (start === end) return true;
  if (start < end) return h >= start && h < end;
  return h >= start || h < end;
}

async function refreshSchedBadge() {
  const sched = await getSchedule();
  const badge = $('#schedBadge');
  const st = scheduleActive(sched);
  if (st === null) { badge.hidden = true; return; }
  badge.hidden = false;
  badge.textContent = st ? 'сейчас: фокус' : 'сейчас: пауза';
  badge.className = 'pill ' + (st ? 'on' : 'off');
}

function allToggles() {
  return sites.flatMap(s => s.toggles);
}

function siteCount(s) {
  return s.toggles.filter(t => settings[t.id]).length;
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

function pinMsg(text, show = true) {
  const n = $('#pinMsg');
  n.textContent = text;
  n.hidden = !show;
}

async function needPinToDisable(wasOn, next) {
  if (!wasOn || next) return true;
  if (!pinEnabled) return true;
  const pin = prompt('PIN, чтобы выключить');
  if (!pin || !(await verifyPin(pin))) return false;
  return true;
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
    const pin = prompt('PIN для смены профиля');
    if (!pin || !(await verifyPin(pin))) return;
  }
  const patch = Object.fromEntries(ids.map(id => [id, false]));
  Object.assign(patch, preset.settings);
  settings = await setSettings(patch);
  updateSiteHeader();
  renderRows();
  buildSiteList();
  await refreshScheduleUi();
  await refreshSchedBadge();
}

function updateSiteHeader() {
  const site = sites.find(s => s.id === active);
  if (!site) return;
  $('#siteGlyph').textContent = site.glyph;
  $('#siteName').textContent = site.name;
  $('#siteCnt').textContent = `${siteCount(site)} из ${site.toggles.length} включено`;
}

function selectSite(id) {
  active = id;
  chrome.storage.sync.set({ activeSite: active });
  updateSiteHeader();
  renderRows();
  updateYtExtras();
  [...$('#siteList').children].forEach(el => {
    el.classList.toggle('on', el.dataset.id === active);
    const s = sites.find(x => x.id === el.dataset.id);
    if (s) el.querySelector('.c').textContent = `${siteCount(s)}/${s.toggles.length}`;
  });
}

function updateYtExtras() {
  const box = $('#ytExtras');
  const show = active === 'youtube';
  box.hidden = !show;
  if (show) {
    $('#kwIn').value = settings.yt_kw || '';
    $('#chIn').value = settings.yt_ch || '';
  }
}

function bindYtExtras() {
  const save = async () => {
    settings = await setSettings({ yt_kw: $('#kwIn').value, yt_ch: $('#chIn').value });
  };
  $('#kwIn').addEventListener('change', save);
  $('#kwIn').addEventListener('blur', save);
  $('#chIn').addEventListener('change', save);
  $('#chIn').addEventListener('blur', save);
}

function makeRow(t) {
  const on = !!settings[t.id];
  const row = document.createElement('div');
  row.className = 'row' + (on ? ' on' : '');
  row.dataset.id = t.id;
  row.innerHTML = `<b>${t.label}</b><div class="sw"></div>`;
  row.title = t.desc || '';
  return row;
}

function makeGroup(title, toggles) {
  if (!toggles.length) return null;
  const wrap = document.createElement('section');
  wrap.className = 'group';
  if (title) {
    const h = document.createElement('div');
    h.className = 'group-h';
    h.textContent = title;
    wrap.appendChild(h);
  }
  const card = document.createElement('div');
  card.className = 'card';
  toggles.forEach(t => card.appendChild(makeRow(t)));
  wrap.appendChild(card);
  return wrap;
}

function renderRows() {
  const site = sites.find(s => s.id === active);
  const box = $('#rows');
  box.innerHTML = '';
  if (!site) return;

  if (site.id === 'youtube') {
    const main = site.toggles.filter(t => YT_MAIN.has(t.id));
    const extra = site.toggles.filter(t => !YT_MAIN.has(t.id));
    box.appendChild(makeGroup(null, main));
    const more = makeGroup('Ещё', extra);
    if (more) box.appendChild(more);
  } else {
    box.appendChild(makeGroup(null, site.toggles));
  }

  $('#siteCnt').textContent = `${siteCount(site)} из ${site.toggles.length} включено`;
  refreshSiteListCounts();
}

function refreshSiteListCounts() {
  [...$('#siteList').children].forEach(el => {
    const s = sites.find(x => x.id === el.dataset.id);
    if (s) el.querySelector('.c').textContent = `${siteCount(s)}/${s.toggles.length}`;
  });
}

function bindRows() {
  $('#rows').addEventListener('click', async e => {
    const row = e.target.closest('.row');
    if (!row) return;
    const id = row.dataset.id;
    const on = !!settings[id];
    const next = !on;
    if (!(await needPinToDisable(on, next))) return;
    const hours = await getCooldownHours();
    if (!next && hours > 0 && on) {
      settings = await setSetting(id, false);
    } else {
      settings = await setSetting(id, next);
    }
    row.classList.toggle('on', !!settings[id]);
    const site = sites.find(s => s.id === active);
    if (site) $('#siteCnt').textContent = `${siteCount(site)} из ${site.toggles.length} включено`;
    refreshSiteListCounts();
    await refreshScheduleUi();
    await refreshSchedBadge();
  });
}

function bindPin() {
  $('#pinSave').addEventListener('click', async () => {
    const pin = $('#pinIn').value.trim();
    try {
      await setPin(pin);
      $('#pinIn').value = '';
      await refreshPinUi();
      pinMsg('', false);
    } catch {
      pinMsg('Минимум 4 символа');
    }
  });
  $('#pinOff').addEventListener('click', async () => {
    const pin = $('#pinIn').value.trim() || prompt('Текущий PIN');
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
}

function bindSchedule() {
  const save = async () => {
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
  $('#schedOn').addEventListener('change', save);
  $('#schedStart').addEventListener('change', save);
  $('#schedEnd').addEventListener('change', save);
  $('#cooldownOn').addEventListener('change', save);
}

function bindIO() {
  $('#exportBtn').addEventListener('click', async () => {
    const json = await exportBundle();
    try {
      await navigator.clipboard.writeText(json);
      pinMsg('Скопировано', true);
      $('#pinMsg').className = 'msg ok';
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
      updateSiteHeader();
      renderRows();
      buildSiteList();
      updateYtExtras();
      await refreshScheduleUi();
      await refreshSchedBadge();
      pinMsg('Импорт OK', true);
      $('#pinMsg').className = 'msg ok';
      setTimeout(() => pinMsg('', false), 2000);
    } catch {
      pinMsg('Битый JSON');
      $('#pinMsg').className = 'msg err';
    }
  });
}

init();
