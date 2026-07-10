const RULES = {
  ig_reels: `
    a[href="/reels/"],
    a[href^="/reels"],
    svg[aria-label="Reels"],
    [aria-label="Reels"],
    main section div[style*="padding-bottom"] div._aagw
  `,
  ig_explore: `
    a[href="/explore/"],
    svg[aria-label="Explore"],
    [aria-label="Explore"]
  `,
  ig_stories: `
    div[role="menubar"] + div,
    div._acaz,
    header + section div[style*="flex"] div._ac69
  `,
};

const DEFAULTS = { ig_reels: false, ig_explore: false, ig_stories: false };

let settings = { ...DEFAULTS };
let styleEl = null;

function applyCss() {
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'vita-focus-ig';
    (document.head || document.documentElement).appendChild(styleEl);
  }
  const blocks = [];
  for (const [id, sel] of Object.entries(RULES)) {
    if (settings[id]) {
      blocks.push(`${sel.trim().split(/\s*,\s*/).join(', ')} { display: none !important; visibility: hidden !important; }`);
    }
  }
  styleEl.textContent = blocks.join('\n');
}

function blockReelsNav() {
  if (!settings.ig_reels) return;
  if (/^\/reels/.test(location.pathname)) location.replace('/');
}

function tick() {
  blockReelsNav();
  applyCss();
}

async function loadSettings() {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'vfocus:get' });
    if (res) settings = { ...DEFAULTS, ...res };
  } catch {
    settings = { ...DEFAULTS };
  }
  tick();
}

chrome.runtime.onMessage.addListener(msg => {
  if (msg?.type === 'vfocus:settings') loadSettings();
});

const obs = new MutationObserver(() => tick());
function watch() {
  tick();
  if (document.body) obs.observe(document.body, { childList: true, subtree: true });
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', watch, { once: true });
} else {
  watch();
}
loadSettings();
