import { getEffectiveSettings } from './shared/storage.js';

chrome.runtime.onInstalled.addListener(async () => {
  const cur = await chrome.storage.sync.get(['settings', 'schedule']);
  if (!cur.settings) await chrome.storage.sync.set({ settings: {} });
  if (!cur.schedule) await chrome.storage.sync.set({ schedule: { enabled: false, start: 9, end: 22 } });
});

async function broadcastTab(tabId) {
  if (!tabId) return;
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'vfocus:settings' });
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
  if (changes.settings || changes.schedule || changes.pending || changes.cooldownHours) {
    broadcastAll(true);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'vfocus:get') {
    getEffectiveSettings().then(sendResponse);
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
