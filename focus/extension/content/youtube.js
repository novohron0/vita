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
  yt_thumbs: false,
};

/* Превью в списках — не трогаем плеер на странице просмотра */
const THUMB_CSS = `
  ytd-browse ytd-thumbnail,
  ytd-item-section-renderer ytd-thumbnail,
  ytd-rich-item-renderer ytd-thumbnail,
  ytd-video-renderer ytd-thumbnail,
  ytd-grid-video-renderer ytd-thumbnail,
  ytd-compact-video-renderer ytd-thumbnail,
  ytd-playlist-video-renderer ytd-thumbnail,
  ytd-watch-next-secondary-results-renderer ytd-thumbnail,
  ytd-shelf-renderer ytd-thumbnail,
  ytd-reel-item-renderer ytd-thumbnail {
    display: none !important;
    width: 0 !important;
    height: 0 !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }
  ytd-rich-item-renderer #content,
  ytd-video-renderer #dismissible,
  ytd-compact-video-renderer .details {
    flex-direction: column !important;
    align-items: flex-start !important;
    gap: 4px !important;
  }
  ytd-rich-item-renderer #video-title,
  ytd-video-renderer #video-title,
  ytd-compact-video-renderer #video-title {
    font-size: 15px !important;
    line-height: 1.35 !important;
    -webkit-line-clamp: unset !important;
    max-height: none !important;
  }
`;

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
  if (settings.yt_thumbs) blocks.push(THUMB_CSS);
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
