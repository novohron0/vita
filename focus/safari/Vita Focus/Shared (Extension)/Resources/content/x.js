const RULES = {
  x_foryou: `
    a[href="/home"][role="tab"][aria-selected="true"] ~ div [data-testid="primaryColumn"] section,
    div[data-testid="primaryColumn"] section[role="region"],
    article[data-testid="tweet"]:not([data-focus-hidden])
  `,
  x_trends: `
    div[data-testid="sidebarColumn"] section,
    div[aria-label*="Trending"],
    div[aria-label*="тренд"]
  `,
  x_follow: `
    aside[aria-label*="Who to follow"],
    aside[aria-label*="Кого читать"],
    div[data-testid="UserCell"]
  `,
};

const DEFAULTS = { x_foryou: false, x_trends: false, x_follow: false };

let settings = { ...DEFAULTS };
let styleEl = null;

function applyCss() {
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'vita-focus-x';
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

function hideForYouFeed() {
  if (!settings.x_foryou) return;
  if (location.pathname === '/home' || location.pathname === '/') {
    document.querySelectorAll('div[data-testid="primaryColumn"] section').forEach(el => {
      el.style.setProperty('display', 'none', 'important');
    });
  }
}

function tick() {
  hideForYouFeed();
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
