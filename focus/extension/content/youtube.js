/* Vita Focus — YouTube. Селекторы с запасом: YouTube часто меняет DOM. */
const RULES = {
  yt_shorts: `
    ytd-reel-shelf-renderer,
    ytd-reel-video-renderer,
    ytd-shorts,
    ytd-mini-guide-entry-renderer[aria-label="Shorts"],
    ytd-guide-entry-renderer a[title="Shorts"],
    a[href="/shorts"],
    a[href^="/shorts/"],
    [overlay-style="SHORTS"],
    .ytd-shorts
  `,
  yt_recs: `
    ytd-browse[page-subtype="home"] ytd-rich-grid-renderer,
    ytd-rich-grid-renderer#contents,
    ytd-shelf-renderer:not(#related) ytd-thumbnail
  `,
  yt_comments: `
    ytd-comments#comments,
    #comments,
    ytd-item-section-renderer[target-id="comments-section"]
  `,
  yt_related: `
    #secondary ytd-watch-next-secondary-results-renderer,
    ytd-watch-next-secondary-results-renderer,
    #related
  `,
};

const DEFAULTS = {
  yt_shorts: true,
  yt_recs: true,
  yt_comments: false,
  yt_related: false,
  yt_autoplay: false,
};

let settings = { ...DEFAULTS };
let styleEl = null;

function applyCss() {
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'vita-focus-css';
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

function blockShortsNav() {
  if (!settings.yt_shorts) return;
  if (/^\/shorts(\/|$)/.test(location.pathname)) {
    location.replace('/');
  }
}

function tameAutoplay() {
  if (!settings.yt_autoplay) return;
  const v = document.querySelector('video');
  if (v && !v.paused) v.pause();
  const btn = document.querySelector('.ytp-autonav-toggle-button[aria-checked="true"]');
  if (btn) btn.click();
}

function tick() {
  blockShortsNav();
  applyCss();
  tameAutoplay();
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
