/* Classic service worker — без ES modules (Safari iOS ломает type:module). */
const NATIVE_APP = 'ru.vitadots.focus';

const DEFAULT_SETTINGS = {
  yt_shorts: true, yt_recs: true, yt_comments: false, yt_related: false,
  yt_autoplay: false, yt_thumbs: false, yt_blur: false, yt_endscreen: false,
  yt_notifications: false, yt_search: false, yt_livechat: false, yt_home_subs: false,
  yt_shelf: false, yt_chips: false, yt_mix: false, yt_keywords: false, yt_kw: '',
  yt_channels: false, yt_ch: '', yt_explore: false, yt_theater: false,
  yt_watch_clean: false, yt_upnext: false,
};

async function readStore(keys) {
  const list = Array.isArray(keys) ? keys : [keys];
  const local = await chrome.storage.local.get(list);
  const needSync = list.filter(k => local[k] === undefined);
  if (!needSync.length) return local;
  try {
    const sync = await chrome.storage.sync.get(needSync);
    return { ...sync, ...local };
  } catch {
    return local;
  }
}

function inScheduleWindow(schedule) {
  const h = new Date().getHours();
  const { start, end } = schedule;
  if (start === end) return true;
  if (start < end) return h >= start && h < end;
  return h >= start || h < end;
}

async function getEffectiveSettingsBg() {
  const data = await readStore(['settings', 'schedule', 'pending']);
  let settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
  const pending = data.pending || {};
  const now = Date.now();
  for (const [id, until] of Object.entries(pending)) {
    if (until <= now) settings[id] = false;
  }
  const schedule = { enabled: false, start: 9, end: 22, ...(data.schedule || {}) };
  if (schedule.enabled && !inScheduleWindow(schedule)) {
    settings = Object.fromEntries(Object.keys(settings).map(k => [k, false]));
  }
  return settings;
}

async function getDarkModeBg() {
  const data = await readStore('darkMode');
  return { enabled: false, brightness: 100, contrast: 95, sepia: 8, ...(data.darkMode || {}) };
}

async function getScheduleBg() {
  const data = await readStore('schedule');
  return { enabled: false, start: 9, end: 22, ...(data.schedule || {}) };
}

async function buildWidgetSnapshot() {
  const [settings, schedule, meta] = await Promise.all([
    getEffectiveSettingsBg(),
    getScheduleBg(),
    readStore('activeSite'),
  ]);
  const blocksOn = Object.entries(settings).filter(([k, v]) => {
    if (!v) return false;
    if (k.endsWith('_kw') || k.endsWith('_ch') || k === 'yt_kw' || k === 'yt_ch') return false;
    return true;
  }).length;
  return {
    type: 'widget-snapshot',
    blocksOn,
    scheduleEnabled: !!schedule.enabled,
    scheduleActive: !schedule.enabled || inScheduleWindow(schedule),
    scheduleStart: schedule.start ?? 9,
    scheduleEnd: schedule.end ?? 22,
    activeSite: meta.activeSite || 'youtube',
    version: chrome.runtime.getManifest().version,
    updatedAt: Date.now(),
  };
}

async function pushWidgetSnapshot() {
  try {
    const snapshot = await buildWidgetSnapshot();
    const rt = typeof browser !== 'undefined' ? browser.runtime : chrome.runtime;
    if (rt.sendNativeMessage) await rt.sendNativeMessage(NATIVE_APP, snapshot);
  } catch { /* no native host */ }
}

async function ensureDefaults() {
  const cur = await readStore(['settings', 'schedule']);
  const patch = {};
  if (!cur.settings) patch.settings = {};
  if (!cur.schedule) patch.schedule = { enabled: false, start: 9, end: 22 };
  if (Object.keys(patch).length) {
    await chrome.storage.local.set(patch);
    try { await chrome.storage.sync.set(patch); } catch { /* noop */ }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  ensureDefaults();
  pushWidgetSnapshot();
});

async function broadcastTab(tabId) {
  if (!tabId) return;
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'vfocus:settings' });
    await chrome.tabs.sendMessage(tabId, { type: 'vfocus:dark' });
  } catch { /* no content script */ }
}

async function broadcastAll(activeFirst = false) {
  const tabs = await chrome.tabs.query({});
  let activeId = null;
  if (activeFirst) {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeId = active?.id ?? null;
    if (activeId) await broadcastTab(activeId);
  }
  for (const tab of tabs) {
    if (tab.id && tab.id !== activeId) await broadcastTab(tab.id);
  }
}

function storageChanged(changes) {
  if (changes.settings || changes.settingsRev || changes.schedule || changes.pending || changes.cooldownHours || changes.darkMode) {
    broadcastAll(true);
    pushWidgetSnapshot();
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' || area === 'sync') storageChanged(changes);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'vfocus:get') {
    getEffectiveSettingsBg().then(sendResponse);
    return true;
  }
  if (msg?.type === 'vfocus:dark') {
    getDarkModeBg().then(sendResponse);
    return true;
  }
  if (msg?.type === 'vfocus:broadcast') {
    broadcastAll(true).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg?.type === 'vfocus:broadcastTab' && sender.tab?.id) {
    broadcastTab(sender.tab.id).then(() => sendResponse({ ok: true }));
    return true;
  }
});

setInterval(() => broadcastAll(false), 60000);
setInterval(() => pushWidgetSnapshot(), 5 * 60000);
