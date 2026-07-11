/** Vita Focus — тёмная тема для любого сайта (invert, как Dark Reader lite). */
const STYLE_ID = 'vita-focus-dark';
const DEFAULTS = { enabled: false, brightness: 100, contrast: 95, sepia: 8 };

let cfg = { ...DEFAULTS };
let styleEl = null;
let lastDarkRev = 0;

async function readDarkCfg() {
  const local = await chrome.storage.local.get(['darkMode', 'settingsRev']);
  if (local.darkMode) return local;
  try {
    const sync = await chrome.storage.sync.get('darkMode');
    return { ...sync, ...local };
  } catch {
    return local;
  }
}

function pageFilter() {
  const parts = ['invert(1)', 'hue-rotate(180deg)'];
  if (cfg.brightness !== 100) parts.push(`brightness(${cfg.brightness}%)`);
  if (cfg.contrast !== 100) parts.push(`contrast(${cfg.contrast}%)`);
  if (cfg.sepia > 0) parts.push(`sepia(${cfg.sepia}%)`);
  return parts.join(' ');
}

const MEDIA_FIX = 'invert(1) hue-rotate(180deg)';

function shouldSkip() {
  const p = location.protocol;
  if (p === 'chrome-extension:' || p === 'moz-extension:' || p === 'safari-web-extension:') return true;
  if (location.hostname === 'vitadots.ru' && location.pathname.startsWith('/focus')) return false;
  return false;
}

function apply() {
  const root = document.documentElement;
  if (!cfg.enabled || shouldSkip()) {
    root.classList.remove('vita-dark');
    root.style.removeProperty('color-scheme');
    if (styleEl) styleEl.textContent = '';
    return;
  }

  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    (document.head || root).appendChild(styleEl);
  }

  const pageF = pageFilter();

  root.classList.add('vita-dark');
  root.style.colorScheme = 'dark';

  styleEl.textContent = `
    html.vita-dark {
      background: #1a1a1c !important;
      filter: ${pageF} !important;
    }
    html.vita-dark img,
    html.vita-dark video,
    html.vita-dark picture,
    html.vita-dark canvas,
    html.vita-dark iframe,
    html.vita-dark svg,
    html.vita-dark [role="img"],
    html.vita-dark .vita-dark-keep,
    html.vita-dark .emoji {
      filter: ${MEDIA_FIX} !important;
    }
    html.vita-dark ::-webkit-scrollbar {
      background: #2a2a2e;
    }
    html.vita-dark ::-webkit-scrollbar-thumb {
      background: #555;
    }
  `;
}

async function load() {
  try {
    const data = await readDarkCfg();
    if (data.settingsRev) lastDarkRev = data.settingsRev;
    if (data.darkMode) cfg = { ...DEFAULTS, ...data.darkMode };
    else {
      const res = await chrome.runtime.sendMessage({ type: 'vfocus:dark' });
      if (res) cfg = { ...DEFAULTS, ...res };
    }
  } catch {
    cfg = { ...DEFAULTS };
  }
  apply();
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'vfocus:settings' || msg?.type === 'vfocus:dark') load();
  if (msg?.type === 'vfocus:ping') {
    if (/youtube\.com/i.test(location.hostname)) return;
    let version = 'dev';
    try { version = chrome.runtime.getManifest().version; } catch { /* noop */ }
    sendResponse({ ok: true, version, site: 'any' });
    return true;
  }
});

try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' && area !== 'sync') return;
    if (changes.darkMode || changes.settingsRev) load();
  });
} catch { /* noop */ }

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', load, { once: true });
} else {
  load();
}
load();
setInterval(async () => {
  try {
    const local = await chrome.storage.local.get('settingsRev');
    const rev = local.settingsRev;
    if (rev && rev !== lastDarkRev) {
      lastDarkRev = rev;
      load();
    }
  } catch { /* noop */ }
}, 500);
