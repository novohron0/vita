import {
  getSettings, setSetting, setSettings, getPinState, setPin, clearPin, verifyPin,
  getSchedule, setSchedule, getCooldownHours, setCooldownHours, getPendingInfo,
  exportBundle, importBundle,
} from '../shared/storage.js';

const REGISTRY_URL = chrome.runtime.getURL('shared/registry.json');

const $ = s => document.querySelector(s);
let sites = [];
let presets = [];
let active = 'youtube';
let settings = {};
let pinEnabled = false;

async function init() {
  const r = await fetch(REGISTRY_URL);
  const data = await r.json();
  sites = data.sites;
  presets = data.presets || [];
  settings = await getSettings();
  const stored = await chrome.storage.sync.get('activeSite');
  if (stored.activeSite && sites.some(s => s.id === stored.activeSite)) active = stored.activeSite;
  await refreshPinUi();
  await refreshScheduleUi();
  await refreshSchedBadge();
  buildPresets();
  buildTabs();
  renderRows();
  updateYtExtras();
  updateScore();
  bindPin();
  bindSchedule();
  bindIO();
  bindYtExtras();
  bindSiteBulk();
  bindToggleFilter();
  const ver = chrome.runtime.getManifest().version;
  $('header b').textContent = `⠿ vita focus · ${ver}`;
}

function scheduleActive(sched) {
  if (!sched.enabled) return null;
  const h = new Date().getHours();
  const { start, end } = sched;
  let on;
  if (start === end) on = true;
  else if (start < end) on = h >= start && h < end;
  else on = h >= start || h < end;
  return on;
}

async function refreshSchedBadge() {
  const sched = await getSchedule();
  const badge = $('#schedBadge');
  const st = scheduleActive(sched);
  if (st === null) {
    badge.hidden = true;
    return;
  }
  badge.hidden = false;
  if (st) {
    badge.textContent = 'фокус';
    badge.className = 'badge-on';
  } else {
    badge.textContent = 'пауза';
    badge.className = 'badge-off';
  }
}

function allToggles() {
  return sites.flatMap(s => s.toggles);
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
  if (!keys.length) {
    msg.hidden = true;
    return;
  }
  const labels = keys.map(id => {
    const t = allToggles().find(x => x.id === id);
    const h = Math.ceil((pending[id] - Date.now()) / 3600000);
    return `${t?.label || id} (~${h}ч)`;
  });
  msg.textContent = `Отключится: ${labels.join(', ')}`;
  msg.style.color = '#7fd4a3';
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
  const pin = prompt('Введи PIN, чтобы выключить блок');
  if (!pin) return false;
  if (!(await verifyPin(pin))) {
    pinMsg('Неверный PIN');
    return false;
  }
  pinMsg('', false);
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
    const pin = prompt('Введи PIN для смены профиля');
    if (!pin || !(await verifyPin(pin))) {
      pinMsg('Неверный PIN');
      return;
    }
    pinMsg('', false);
  }
  const patch = Object.fromEntries(ids.map(id => [id, false]));
  Object.assign(patch, preset.settings);
  settings = await setSettings(patch);
  renderRows();
  updateScore();
  await refreshScheduleUi();
  await refreshSchedBadge();
}

function buildTabs() {
  const nav = $('#tabs');
  nav.innerHTML = '';
  sites.forEach(s => {
    const b = document.createElement('button');
    b.className = 'tab' + (s.id === active ? ' on' : '');
    b.textContent = `${s.glyph} ${s.name}`;
    b.addEventListener('click', () => {
      active = s.id;
      chrome.storage.sync.set({ activeSite: active });
      $('#toggleFilter').value = '';
      buildTabs();
      renderRows();
      updateYtExtras();
    });
    nav.appendChild(b);
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
  const saveKw = async () => { settings = await setSettings({ yt_kw: $('#kwIn').value }); };
  const saveCh = async () => { settings = await setSettings({ yt_ch: $('#chIn').value }); };
  $('#kwIn').addEventListener('change', saveKw);
  $('#kwIn').addEventListener('blur', saveKw);
  $('#chIn').addEventListener('change', saveCh);
  $('#chIn').addEventListener('blur', saveCh);
}

function updateSiteScore() {
  const site = sites.find(s => s.id === active);
  if (!site) return;
  const act = site.toggles.filter(t => settings[t.id]).length;
  $('#siteScore').textContent = `${site.glyph} ${act}/${site.toggles.length}`;
}

function bindSiteBulk() {
  $('#siteAllOn').addEventListener('click', async () => {
    const site = sites.find(s => s.id === active);
    if (!site) return;
    const patch = Object.fromEntries(site.toggles.map(t => [t.id, true]));
    settings = await setSettings(patch);
    renderRows();
    updateScore();
    updateSiteScore();
    await refreshSchedBadge();
  });
  $('#siteAllOff').addEventListener('click', async () => {
    const site = sites.find(s => s.id === active);
    if (!site) return;
    const onIds = site.toggles.filter(t => settings[t.id]).map(t => t.id);
    if (onIds.length && pinEnabled) {
      const pin = prompt('Введи PIN для выключения');
      if (!pin || !(await verifyPin(pin))) {
        pinMsg('Неверный PIN');
        return;
      }
      pinMsg('', false);
    }
    const patch = Object.fromEntries(site.toggles.map(t => [t.id, false]));
    settings = await setSettings(patch);
    renderRows();
    updateScore();
    updateSiteScore();
    await refreshScheduleUi();
    await refreshSchedBadge();
  });
}

function bindToggleFilter() {
  $('#toggleFilter').addEventListener('input', renderRows);
}

function renderRows() {
  const site = sites.find(s => s.id === active);
  const box = $('#rows');
  box.innerHTML = '';
  if (!site) return;
  const q = ($('#toggleFilter')?.value || '').trim().toLowerCase();
  site.toggles.forEach(t => {
    if (q && !`${t.label} ${t.desc}`.toLowerCase().includes(q)) return;
    const on = !!settings[t.id];
    const row = document.createElement('div');
    row.className = 'row' + (on ? ' on' : '');
    row.innerHTML = `<div><b>${t.label}</b><span>${t.desc}</span></div><div class="sw"></div>`;
    row.addEventListener('click', async () => {
      const next = !settings[t.id];
      if (!(await needPinToDisable(on, next))) return;
      const hours = await getCooldownHours();
      if (!next && hours > 0 && on) {
        settings = await setSetting(t.id, false);
        row.classList.toggle('on', !!settings[t.id]);
        updateScore();
        await refreshScheduleUi();
        await refreshSchedBadge();
        return;
      }
      settings = await setSetting(t.id, next);
      row.classList.toggle('on', !!settings[t.id]);
      updateScore();
      await refreshScheduleUi();
      await refreshSchedBadge();
    });
    box.appendChild(row);
  });
  updateSiteScore();
}

function updateScore() {
  const total = allToggles().length;
  const act = allToggles().filter(t => settings[t.id]).length;
  $('#score').textContent = `${act} / ${total}`;
}

function bindPin() {
  $('#pinSave').addEventListener('click', async () => {
    const pin = $('#pinIn').value.trim();
    try {
      await setPin(pin);
      $('#pinIn').value = '';
      await refreshPinUi();
      pinMsg('PIN установлен', false);
    } catch {
      pinMsg('Минимум 4 символа');
    }
  });
  $('#pinOff').addEventListener('click', async () => {
    const pin = $('#pinIn').value.trim() || prompt('Текущий PIN для снятия защиты');
    if (!pin) return;
    try {
      await clearPin(pin);
      $('#pinIn').value = '';
      await refreshPinUi();
      pinMsg('Защита снята', false);
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
    updateScore();
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
      const msg = $('#pinMsg');
      msg.style.color = '#7fd4a3';
      msg.textContent = 'Настройки скопированы';
      msg.hidden = false;
      setTimeout(() => { msg.hidden = true; }, 2000);
    } catch {
      prompt('Скопируй настройки:', json);
    }
  });
  $('#importBtn').addEventListener('click', async () => {
    const raw = prompt('Вставь JSON настроек Vita Focus:');
    if (!raw) return;
    try {
      await importBundle(raw);
      settings = await getSettings();
      buildTabs();
      renderRows();
      updateYtExtras();
      updateScore();
      await refreshScheduleUi();
      await refreshSchedBadge();
      const msg = $('#pinMsg');
      msg.style.color = '#7fd4a3';
      msg.textContent = 'Импорт OK';
      msg.hidden = false;
      setTimeout(() => { msg.hidden = true; }, 2000);
    } catch {
      pinMsg('Битый JSON');
    }
  });
}

init();
