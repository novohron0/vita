/* Vita Focus — YouTube (desktop + mobile web). Селекторы с запасом. */
const RULES = {
  yt_shorts: `
    ytd-reel-shelf-renderer,
    ytd-reel-video-renderer,
    ytd-shorts,
    ytm-reel-shelf-renderer,
    ytm-shorts-lockup-view-model,
    ytm-reel-item-renderer,
    ytd-mini-guide-entry-renderer[aria-label="Shorts"],
    ytd-guide-entry-renderer a[title="Shorts"],
    a[href="/shorts"],
    a[href^="/shorts/"],
    [overlay-style="SHORTS"],
    .ytd-shorts,
    ytm-pivot-bar-renderer [tab-id="SHORTS"],
    [aria-label="Shorts"]
  `,
  yt_recs: `
    ytd-browse[page-subtype="home"] ytd-rich-grid-renderer,
    ytd-browse[page-subtype="home"] #contents ytd-rich-item-renderer,
    ytm-browse[page-subtype="home"] ytm-rich-item-renderer,
    ytm-browse[page-subtype="home"] .rich-grid-renderer-contents,
    ytd-browse[page-subtype="subscriptions"] ytd-shelf-renderer,
    ytm-item-section-renderer[section-identifier="feed"] ytm-rich-item-renderer
  `,
  yt_comments: `
    ytd-comments#comments,
    ytd-comments,
    #comments,
    ytd-item-section-renderer[target-id="comments-section"],
    ytm-comments-entry-point-header-renderer,
    ytm-comment-section-renderer,
    #sections #comments
  `,
  yt_related: `
    #secondary ytd-watch-next-secondary-results-renderer,
    ytd-watch-next-secondary-results-renderer,
    #related,
    ytm-item-section-renderer[section-identifier="related-items"],
    .related-chips-slot-wrapper
  `,
  yt_endscreen: `
    .ytp-ce-element,
    .ytp-endscreen-content,
    .html5-endscreen,
    .videowall-endscreen,
    .ytp-fullscreen-grid
  `,
  yt_notifications: `
    ytd-notification-topbar-button-renderer,
    ytd-button-renderer#button[aria-label*="Notification"],
    ytd-button-renderer#button[aria-label*="уведомлен"]
  `,
};

const DEFAULTS = {
  yt_shorts: true,
  yt_recs: true,
  yt_comments: false,
  yt_related: false,
  yt_autoplay: false,
  yt_thumbs: false,
  yt_endscreen: false,
  yt_notifications: false,
};

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
  ytd-reel-item-renderer ytd-thumbnail,
  ytm-rich-item-renderer ytm-thumbnail-cover,
  ytm-compact-video-renderer ytm-thumbnail-cover,
  ytm-video-with-context-renderer ytm-thumbnail-cover,
  ytm-item-section-renderer ytm-thumbnail-cover {
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
  ytd-compact-video-renderer .details,
  ytm-rich-item-renderer .media-item,
  ytm-compact-video-renderer .compact-media-item {
    flex-direction: column !important;
    align-items: flex-start !important;
    gap: 4px !important;
  }
  ytd-rich-item-renderer #video-title,
  ytd-video-renderer #video-title,
  ytd-compact-video-renderer #video-title,
  ytm-rich-item-renderer #video-title,
  ytm-compact-video-renderer #video-title {
    font-size: 15px !important;
    line-height: 1.35 !important;
    -webkit-line-clamp: unset !important;
    max-height: none !important;
  }
`;

let settings = { ...DEFAULTS };
let styleEl = null;
let tickScheduled = false;

function applyCss() {
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'vita-focus-css';
    (document.head || document.documentElement).appendChild(styleEl);
  }
  const blocks = [];
  for (const [id, sel] of Object.entries(RULES)) {
    if (settings[id] && id !== 'yt_endscreen') {
      blocks.push(`${sel.trim().split(/\s*,\s*/).join(', ')} { display: none !important; visibility: hidden !important; }`);
    }
  }
  if (settings.yt_endscreen) {
    blocks.push(`${RULES.yt_endscreen.trim().split(/\s*,\s*/).join(', ')} { display: none !important; visibility: hidden !important; pointer-events: none !important; }`);
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
  document.querySelectorAll('.ytp-autonav-toggle-button[aria-checked="true"]').forEach(btn => btn.click());
  const toggle = document.querySelector('button[aria-label*="Autoplay"], button[aria-label*="автовоспроизведен"]');
  if (toggle?.getAttribute('aria-checked') === 'true') toggle.click();
}

function tick() {
  tickScheduled = false;
  blockShortsNav();
  applyCss();
  tameAutoplay();
}

function scheduleTick() {
  if (tickScheduled) return;
  tickScheduled = true;
  requestAnimationFrame(tick);
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

const obs = new MutationObserver(scheduleTick);
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
setInterval(loadSettings, 60000);
