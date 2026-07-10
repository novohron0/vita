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

async function hashPin(pin) {
  const buf = new TextEncoder().encode(String(pin));
  const dig = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(dig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function getPinState() {
  const d = await chrome.storage.sync.get(['pinHash', 'pinEnabled']);
  return { hash: d.pinHash || '', enabled: !!d.pinEnabled };
}

export async function setPin(pin) {
  if (!pin || pin.length < 4) throw new Error('short');
  const pinHash = await hashPin(pin);
  await chrome.storage.sync.set({ pinHash, pinEnabled: true });
}

export async function clearPin(currentPin) {
  const ok = await verifyPin(currentPin);
  if (!ok) throw new Error('bad');
  await chrome.storage.sync.set({ pinHash: '', pinEnabled: false });
}

export async function verifyPin(pin) {
  const { hash } = await getPinState();
  if (!hash) return true;
  return (await hashPin(pin)) === hash;
}
