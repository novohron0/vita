const DEFAULT_DARK = { enabled: false, brightness: 100, contrast: 95, sepia: 8 };

/** Safari iOS: sync ненадёжен между popup и content script — local первичен. */
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

async function writeStore(patch) {
  const payload = { ...patch };
  if (patch.settings || patch.schedule || patch.pending || patch.darkMode || patch.cooldownHours != null) {
    payload.settingsRev = patch.settingsRev ?? Date.now();
  }
  await chrome.storage.local.set(payload);
  try { await chrome.storage.sync.set(payload); } catch { /* Safari sync optional */ }
  return payload.settingsRev;
}

export async function getDarkMode() {
  const data = await readStore('darkMode');
  return { ...DEFAULT_DARK, ...(data.darkMode || {}) };
}

export async function setDarkMode(patch) {
  const darkMode = { ...(await getDarkMode()), ...patch };
  await writeStore({ darkMode });
  return darkMode;
}

/** Vita Focus — настройки (local + sync mirror). */
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
  const data = await readStore(['settings', 'migration_v290']);
  let settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };

  if (!data.migration_v290) {
    if (settings.yt_home_subs) {
      settings = { ...settings, yt_home_subs: false };
      await writeStore({ settings, migration_v290: true });
    } else {
      await writeStore({ migration_v290: true });
    }
  }
  return settings;
}

export async function getSchedule() {
  const data = await readStore('schedule');
  return { ...DEFAULT_SCHEDULE, ...(data.schedule || {}) };
}

export async function setSchedule(patch) {
  const schedule = { ...(await getSchedule()), ...patch };
  await writeStore({ schedule });
  return schedule;
}

export async function getCooldownHours() {
  const data = await readStore('cooldownHours');
  return data.cooldownHours ?? 0;
}

export async function setCooldownHours(h) {
  const hours = Math.max(0, Math.min(48, Number(h) || 0));
  await writeStore({ cooldownHours: hours });
  return hours;
}

async function getPending() {
  const data = await readStore('pending');
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
  if (changed) writeStore({ pending: nextPending });
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
      await writeStore({ pending });
      return settings;
    }
  }

  if (on && pending[id]) {
    delete pending[id];
    await writeStore({ pending });
  }

  settings[id] = !!on;
  await writeStore({ settings });
  return settings;
}

export async function setSettings(patch) {
  const settings = { ...(await getSettings()), ...patch };
  await writeStore({ settings });
  return settings;
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
  const d = await readStore(['pinHash', 'pinEnabled']);
  return { hash: d.pinHash || '', enabled: !!d.pinEnabled };
}

export async function setPin(pin) {
  if (!pin || pin.length < 4) throw new Error('short');
  const pinHash = await hashPin(pin);
  await writeStore({ pinHash, pinEnabled: true });
}

export async function clearPin(currentPin) {
  const ok = await verifyPin(currentPin);
  if (!ok) throw new Error('bad');
  await writeStore({ pinHash: '', pinEnabled: false });
}

export async function verifyPin(pin) {
  const { hash } = await getPinState();
  if (!hash) return true;
  return (await hashPin(pin)) === hash;
}

export async function exportBundle() {
  const data = await readStore(['settings', 'schedule', 'cooldownHours', 'activeSite', 'darkMode', 'uiTheme']);
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
  await writeStore(patch);
  return getEffectiveSettings();
}
