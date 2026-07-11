import { getEffectiveSettings, getDarkMode, getSchedule } from './shared/storage.js';

const NATIVE_APP = 'ru.vitadots.focus';

function inScheduleWindow(schedule) {
  const h = new Date().getHours();
  const { start, end } = schedule;
  if (start === end) return true;
  if (start < end) return h >= start && h < end;
  return h >= start || h < end;
}

async function buildWidgetSnapshot() {
  const [settings, schedule, meta] = await Promise.all([
    getEffectiveSettings(),
    getSchedule(),
    chrome.storage.sync.get(['activeSite']),
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

chrome.runtime.onInstalled.addListener(async () => {
  const cur = await chrome.storage.sync.get(['settings', 'schedule']);
  if (!cur.settings) await chrome.storage.sync.set({ settings: {} });
  if (!cur.schedule) await chrome.storage.sync.set({ schedule: { enabled: false, start: 9, end: 22 } });
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

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  if (changes.settings || changes.schedule || changes.pending || changes.cooldownHours || changes.darkMode) {
    broadcastAll(true);
    pushWidgetSnapshot();
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'vfocus:get') {
    getEffectiveSettings().then(sendResponse);
    return true;
  }
  if (msg?.type === 'vfocus:dark') {
    getDarkMode().then(sendResponse);
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
