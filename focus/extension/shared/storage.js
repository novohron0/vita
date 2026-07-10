/** Vita Focus — настройки в browser.storage.sync (Safari / Chrome). */
const DEFAULT_SETTINGS = {
  yt_shorts: true,
  yt_recs: true,
  yt_comments: false,
  yt_related: false,
  yt_autoplay: false,
};

export async function getSettings() {
  const data = await chrome.storage.sync.get('settings');
  return { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
}

export async function setSetting(id, on) {
  const settings = await getSettings();
  settings[id] = !!on;
  await chrome.storage.sync.set({ settings });
  return settings;
}

export async function setSettings(patch) {
  const settings = { ...(await getSettings()), ...patch };
  await chrome.storage.sync.set({ settings });
  return settings;
}
