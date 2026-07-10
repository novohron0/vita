import { getEffectiveSettings } from './shared/storage.js';

chrome.runtime.onInstalled.addListener(async () => {
  const cur = await chrome.storage.sync.get(['settings', 'schedule']);
  if (!cur.settings) await chrome.storage.sync.set({ settings: {} });
  if (!cur.schedule) await chrome.storage.sync.set({ schedule: { enabled: false, start: 9, end: 22 } });
});

function broadcast() {
  chrome.tabs.query({}, tabs => {
    for (const tab of tabs) {
      if (tab.id) chrome.tabs.sendMessage(tab.id, { type: 'vfocus:settings' }).catch(() => {});
    }
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  if (changes.settings || changes.schedule || changes.pending || changes.cooldownHours) {
    broadcast();
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'vfocus:get') {
    getEffectiveSettings().then(sendResponse);
    return true;
  }
});

setInterval(broadcast, 60000);
