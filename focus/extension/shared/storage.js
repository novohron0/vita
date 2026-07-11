const DEFAULT_DARK = { enabled: false, brightness: 100, contrast: 95, sepia: 8 };

export async function getDarkMode() {
  const data = await chrome.storage.sync.get('darkMode');
  return { ...DEFAULT_DARK, ...(data.darkMode || {}) };
}

export async function setDarkMode(patch) {
  const darkMode = { ...(await getDarkMode()), ...patch };
  await chrome.storage.sync.set({ darkMode });
  return darkMode;
}

/** Vita Focus — настройки в browser.storage.sync (Safari / Chrome). */
const DEFAULT_SETTINGS = {
  yt_shorts: true,
  yt_recs: true,
  yt_comments: false,
  yt_related: false,
  yt_autoplay: false,
  yt_thumbs: false,
  yt_blur: false,
  yt_endscreen: false,
  yt_notifications: false,
  yt_search: false,
  yt_livechat: false,
  yt_home_subs: false,
  yt_shelf: false,
  yt_chips: false,
  yt_mix: false,
  yt_keywords: false,
  yt_kw: '',
  yt_channels: false,
  yt_ch: '',
  yt_explore: false,
  yt_theater: false,
  yt_watch_clean: false,
  yt_upnext: false,
};

const DEFAULT_SCHEDULE = { enabled: false, start: 9, end: 22 };

export async function getSettings() {
  const data = await chrome.storage.sync.get('settings');
  return { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
}

export async function getSchedule() {
  const data = await chrome.storage.sync.get('schedule');
  return { ...DEFAULT_SCHEDULE, ...(data.schedule || {}) };
}

export async function setSchedule(patch) {
  const schedule = { ...(await getSchedule()), ...patch };
  await chrome.storage.sync.set({ schedule });
  return schedule;
}

export async function getCooldownHours() {
  const data = await chrome.storage.sync.get('cooldownHours');
  return data.cooldownHours ?? 0;
}

export async function setCooldownHours(h) {
  const hours = Math.max(0, Math.min(48, Number(h) || 0));
  await chrome.storage.sync.set({ cooldownHours: hours });
  return hours;
}

async function getPending() {
  const data = await chrome.storage.sync.get('pending');
  return data.pending || {};
}

function inScheduleWindow(schedule) {
  const h = new Date().getHours();
  const { start, end } = schedule;
  if (start === end) return true;
  if (start < end) return h >= start && h < end;
  return h >= start || h < end;
}

function applyPending(settings, pending) {
  const now = Date.now();
  const out = { ...settings };
  let changed = false;
  const nextPending = { ...pending };
  for (const [id, until] of Object.entries(pending)) {
    if (until <= now) {
      out[id] = false;
      delete nextPending[id];
      changed = true;
    }
  }
  if (changed) chrome.storage.sync.set({ pending: nextPending });
  return out;
}

/** Настройки с учётом расписания и отложенного выключения. */
export async function getEffectiveSettings() {
  const raw = await getSettings();
  const schedule = await getSchedule();
  const pending = await getPending();
  let settings = applyPending({ ...raw }, pending);

  if (schedule.enabled && !inScheduleWindow(schedule)) {
    settings = Object.fromEntries(Object.keys(settings).map(k => [k, false]));
  }
  return settings;
}

export async function setSetting(id, on) {
  const settings = await getSettings();
  const pending = await getPending();

  if (!on && settings[id]) {
    const hours = await getCooldownHours();
    if (hours > 0) {
      pending[id] = Date.now() + hours * 3600000;
      await chrome.storage.sync.set({ pending });
      return getEffectiveSettings();
    }
  }

  if (on && pending[id]) {
    delete pending[id];
    await chrome.storage.sync.set({ pending });
  }

  settings[id] = !!on;
  await chrome.storage.sync.set({ settings });
  return getEffectiveSettings();
}

export async function setSettings(patch) {
  const settings = { ...(await getSettings()), ...patch };
  await chrome.storage.sync.set({ settings });
  return getEffectiveSettings();
}

export async function getPendingInfo() {
  const pending = await getPending();
  const now = Date.now();
  return Object.fromEntries(
    Object.entries(pending).filter(([, until]) => until > now)
  );
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

export async function exportBundle() {
  const data = await chrome.storage.sync.get(['settings', 'schedule', 'cooldownHours', 'activeSite', 'darkMode', 'uiTheme']);
  return JSON.stringify({ v: 1, exportedAt: new Date().toISOString(), ...data }, null, 2);
}

export async function importBundle(raw) {
  const data = JSON.parse(raw);
  if (!data || typeof data.settings !== 'object') throw new Error('bad');
  const patch = { settings: data.settings };
  if (data.schedule) patch.schedule = data.schedule;
  if (data.cooldownHours != null) patch.cooldownHours = data.cooldownHours;
  if (data.activeSite) patch.activeSite = data.activeSite;
  if (data.darkMode) patch.darkMode = data.darkMode;
  if (data.uiTheme) patch.uiTheme = data.uiTheme;
  await chrome.storage.sync.set(patch);
  return getEffectiveSettings();
}
