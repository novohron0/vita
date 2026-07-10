import { getSettings } from './shared/storage.js';

chrome.runtime.onInstalled.addListener(async () => {
  const cur = await chrome.storage.sync.get('settings');
  if (!cur.settings) await chrome.storage.sync.set({ settings: {} });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync' || !changes.settings) return;
  chrome.tabs.query({}, tabs => {
    for (const tab of tabs) {
      if (tab.id) chrome.tabs.sendMessage(tab.id, { type: 'vfocus:settings' }).catch(() => {});
    }
  });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'vfocus:get') {
    getSettings().then(sendResponse);
    return true;
  }
});
