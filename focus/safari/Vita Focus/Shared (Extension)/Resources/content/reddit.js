const RULES = {
  rd_feed: `
    shreddit-feed,
    #SHORTCUT_FOCUSABLE_DIV > div > div:not([class*="sidebar"]),
    .ListingLayout-outerContainer .ListingLayout-main
  `,
  rd_popular: `
    a[href="/r/popular/"],
    a[href="/r/all/"],
    faceplate-tracker[noun="popular"],
    faceplate-tracker[noun="all"]
  `,
};

const DEFAULTS = { rd_feed: false, rd_popular: false };

let settings = { ...DEFAULTS };
let styleEl = null;

function applyCss() {
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'vita-focus-rd';
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

function blockPopular() {
  if (!settings.rd_popular) return;
  if (/^\/r\/(popular|all)(\/|$)/.test(location.pathname)) {
    location.replace('/');
  }
}

function tick() {
  blockPopular();
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
