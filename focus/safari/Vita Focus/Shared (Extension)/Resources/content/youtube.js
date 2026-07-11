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
    ytm-pivot-bar-item-renderer[tab-id="SHORTS"],
    ytm-pivot-bar-item-renderer[tab-selection="SHORTS"],
    ytm-mobile-topbar-renderer .shorts-tab,
    [aria-label="Shorts"]
  `,
  yt_recs: `
    ytd-browse[page-subtype="home"] ytd-rich-grid-renderer,
    ytd-browse[page-subtype="home"] #contents ytd-rich-item-renderer,
    ytm-browse[page-subtype="home"] .rich-grid-renderer-contents,
    ytm-browse[page-subtype="home"] ytm-rich-grid-renderer,
    ytm-browse[page-subtype="home"] ytm-video-with-context-renderer,
    ytd-browse[page-subtype="subscriptions"] ytd-shelf-renderer,
    ytd-browse[page-subtype="subscriptions"] ytd-rich-item-renderer[is-slim-media],
    ytm-browse[page-subtype="subscriptions"] ytm-rich-shelf-renderer,
    ytm-browse[page-subtype="subscriptions"] ytm-item-section-renderer[is-shelf],
    ytm-browse[page-subtype="home"] ytm-message-renderer,
    ytm-browse[page-subtype="home"] yt-alert-renderer,
    ytd-browse[page-subtype="home"] ytd-message-renderer,
    ytd-browse[page-subtype="home"] yt-alert-renderer,
    ytm-browse[page-subtype="subscriptions"] ytm-message-renderer,
    ytm-browse[page-subtype="subscriptions"] yt-alert-renderer,
    ytd-browse[page-subtype="subscriptions"] ytd-message-renderer,
    ytd-browse[page-subtype="subscriptions"] yt-alert-renderer
  `,
  yt_shelf: `
    ytd-rich-shelf-renderer,
    ytd-horizontal-card-list-renderer,
    ytd-reel-shelf-renderer,
    ytm-rich-shelf-renderer,
    ytm-horizontal-card-list-renderer,
    ytm-reel-shelf-renderer,
    ytd-item-section-renderer[is-shelf]
  `,
  yt_chips: `
    ytd-feed-filter-chip-bar-renderer,
    ytd-chip-cloud-chip-renderer,
    ytm-feed-filter-chip-bar-renderer,
    ytm-chip-cloud-chip-renderer,
    .ytChipCloudChipRendererHost
  `,
  yt_comments: `
    ytd-comments#comments,
    ytd-comments,
    #comments,
    ytd-item-section-renderer[target-id="comments-section"],
    ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-comments-section"],
    #engagement-panel ytd-comments,
    ytm-comments-entry-point-header-renderer,
    ytm-comment-section-renderer,
    ytm-comments-entry-point-teaser-renderer,
    ytm-engagement-panel-section-list-renderer,
    ytm-section-list-renderer[tab-id="COMMENTS"],
    ytm-item-section-renderer[section-identifier="comments-entry-point"],
    ytm-item-section-renderer[section-identifier="comment-sheet"],
    ytm-item-section-renderer[section-identifier="comments-section"],
    #sections #comments,
    #comment-dialog,
    #comment-teaser,
    .comment-teaser
  `,
  yt_related: `
    #secondary ytd-watch-next-secondary-results-renderer,
    ytd-watch-next-secondary-results-renderer,
    #related,
    ytm-watch-next-secondary-results-renderer,
    ytm-single-column-watch-next-results-renderer,
    ytm-item-section-renderer[section-identifier="related-items"],
    ytm-item-section-renderer[section-identifier="watch-next"],
    ytm-watch ytm-compact-video-renderer,
    ytm-watch #related,
    ytm-watch ytm-item-section-renderer[section-identifier="related-items"],
    ytm-watch ytm-item-section-renderer[section-identifier="watch-next"],
    .related-chips-slot-wrapper,
    ytd-compact-radio-renderer,
    ytm-compact-radio-renderer
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
  yt_search: `
    ytd-searchbox ytd-vertical-list,
    ytd-searchbox #suggestions,
    .ytSearchboxComponentSuggestionsContainer,
    ytm-searchbox-suggestions
  `,
  yt_livechat: `
    #chat,
    ytd-live-chat-frame,
    ytm-live-chat-renderer,
    ytm-live-chat-header-renderer
  `,
  yt_mix: `
    ytd-radio-renderer,
    ytd-compact-radio-renderer,
    ytm-mix-playlist-renderer,
    ytd-playlist-panel-renderer[is-mix]
  `,
  yt_explore: `
    ytd-guide-entry-renderer a[title="Explore"],
    ytd-guide-entry-renderer a[title="Trending"],
    ytd-guide-entry-renderer a[title="Обзор"],
    ytd-guide-entry-renderer a[title="В тренде"],
    ytm-pivot-bar-renderer [tab-id="EXPLORE"],
    ytd-browse[page-subtype="trending"] #contents,
    ytm-browse[page-subtype="trending"] #contents
  `,
  yt_watch_clean: `
    ytd-watch-flexy #secondary,
    ytd-watch-flexy #related,
    ytd-watch-flexy ytd-watch-metadata ~ ytd-item-section-renderer,
    ytm-watch ytm-watch-next-secondary-results-renderer,
    ytm-single-column-watch-next-results-renderer,
    ytm-watch #related,
    ytm-watch ytm-item-section-renderer[section-identifier="related-items"],
    ytm-watch ytm-item-section-renderer[section-identifier="comments-section"],
    ytm-watch ytm-item-section-renderer[section-identifier="comment-sheet"],
    ytm-watch ytm-engagement-panel-section-list-renderer,
    #below ytm-item-section-renderer
  `,
  yt_upnext: `
    .ytp-autonav-endscreen-countdown-container,
    .ytp-suggestion-set,
    .ytp-upnext,
    .ytp-ce-covering-overlay,
    .ytp-pause-overlay
  `,
};

const DEFAULTS = {
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

const THUMB_SEL = `
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
  ytm-item-section-renderer ytm-thumbnail-cover,
  ytm-media-item-thumbnail-renderer,
  ytm-thumbnail-view-model,
  ytm-compact-thumbnail,
  ytm-item-thumbnail-renderer,
  ytm-browse a.media-item-thumbnail,
  ytm-browse .media-item-thumbnail-container,
  ytm-browse .compact-media-item-image,
  ytm-search ytm-thumbnail-cover,
  ytm-search ytm-media-item-thumbnail-renderer
`;

const MOBILE_FEED_CSS = `
  ytm-video-with-context-renderer .media-item,
  ytm-compact-video-renderer .compact-media-item,
  ytm-rich-item-renderer .media-item {
    display: flex !important;
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 10px !important;
  }
  ytm-video-with-context-renderer .media-item-thumbnail-container,
  ytm-video-with-context-renderer a.media-item-thumbnail,
  ytm-compact-video-renderer .compact-media-item-image,
  ytm-rich-item-renderer ytm-thumbnail-cover,
  ytm-video-with-context-renderer ytm-thumbnail-cover,
  ytm-compact-video-renderer ytm-thumbnail-cover {
    width: 100% !important;
    max-width: 100% !important;
    flex: none !important;
    margin: 0 !important;
  }
  ytm-video-with-context-renderer .media-item-metadata,
  ytm-compact-video-renderer .compact-media-item-metadata,
  ytm-rich-item-renderer .media-item-metadata {
    width: 100% !important;
    padding-left: 0 !important;
    margin-left: 0 !important;
  }
`;

const THUMB_CSS = `
  ${THUMB_SEL.trim().split(/\s*,\s*/).join(', ')} {
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
  ytm-video-with-context-renderer .media-item,
  ytm-compact-video-renderer .compact-media-item,
  ytm-rich-item-renderer .media-item,
  ytd-rich-item-renderer #content,
  ytd-video-renderer #dismissible,
  ytd-compact-video-renderer .details {
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 8px !important;
  }
  ytm-video-with-context-renderer .media-item-thumbnail-container,
  ytm-video-with-context-renderer a.media-item-thumbnail,
  ytm-compact-video-renderer .compact-media-item-image {
    display: none !important;
    width: 0 !important;
    height: 0 !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  ytd-rich-item-renderer #video-title,
  ytd-video-renderer #video-title,
  ytd-compact-video-renderer #video-title,
  ytm-rich-item-renderer #video-title,
  ytm-compact-video-renderer #video-title,
  ytm-video-with-context-renderer #video-title {
    font-size: 15px !important;
    line-height: 1.35 !important;
    -webkit-line-clamp: unset !important;
    max-height: none !important;
    width: 100% !important;
  }
`;

const BLUR_CSS = `
  ${THUMB_SEL.trim().split(/\s*,\s*/).join(', ')} img,
  ${THUMB_SEL.trim().split(/\s*,\s*/).join(', ')} yt-image-shadow {
    filter: grayscale(1) blur(10px) !important;
    opacity: 0.35 !important;
  }
`;

let settings = { ...DEFAULTS };
let styleEl = null;
let tickTimer = null;

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
  if (settings.yt_blur && !settings.yt_thumbs) blocks.push(BLUR_CSS);
  if (document.querySelector('ytm-browse, ytm-app, ytm-mobile-topbar-renderer')) {
    blocks.push(MOBILE_FEED_CSS);
  }
  styleEl.textContent = blocks.join('\n');
}

function blockShortsNav() {
  if (!settings.yt_shorts) return;
  if (/^\/shorts(\/|$)/.test(location.pathname)) {
    location.replace('/');
  }
}

function redirectHomeToSubs() {
  if (!settings.yt_home_subs) return;
  const p = location.pathname;
  if (p === '/' || p === '/feed' || p === '/feed/') {
    location.replace('/feed/subscriptions');
  }
}

function tameAutoplay() {
  if (!settings.yt_autoplay) return;
  document.querySelectorAll('.ytp-autonav-toggle-button[aria-checked="true"]').forEach(btn => btn.click());
  const toggle = document.querySelector('button[aria-label*="Autoplay"], button[aria-label*="автовоспроизведен"]');
  if (toggle?.getAttribute('aria-checked') === 'true') toggle.click();
}

function blockExploreNav() {
  if (!settings.yt_explore) return;
  const p = location.pathname;
  if (/^\/feed\/(trending|gaming|music|news|sports|fashion|learning)/.test(p)) {
    location.replace('/feed/subscriptions');
  }
}

function tryTheaterMode() {
  if (!settings.yt_theater) return;
  if (!/\/watch/.test(location.pathname)) return;
  const btn = document.querySelector(
    'button.ytp-size-button[aria-label*="Theater"], button.ytp-size-button[aria-label*="Кинотеатр"], button[aria-label*="Theater mode"]'
  );
  if (btn && btn.getAttribute('aria-pressed') !== 'true') btn.click();
}

function parseList(raw) {
  return String(raw || '').split(/[\n,;]+/).map(w => w.trim().toLowerCase()).filter(Boolean);
}

function hideMatchingRows(selector, matcher) {
  document.querySelectorAll(selector).forEach(el => {
    const text = (el.textContent || '').toLowerCase();
    if (!matcher(text)) return;
    const row = el.closest(
      'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytm-rich-item-renderer, ytm-compact-video-renderer, ytm-video-with-context-renderer, ytd-grid-video-renderer'
    );
    if (row) row.style.setProperty('display', 'none', 'important');
  });
}

function hideKeywordVideos() {
  if (!settings.yt_keywords || !settings.yt_kw) return;
  const words = parseList(settings.yt_kw);
  if (!words.length) return;
  hideMatchingRows(
    '#video-title, ytd-video-renderer #video-title-link, ytm-video-with-context-renderer #video-title, .compact-media-item-headline',
    text => words.some(w => text.includes(w))
  );
}

function hideChannelVideos() {
  if (!settings.yt_channels || !settings.yt_ch) return;
  const channels = parseList(settings.yt_ch);
  if (!channels.length) return;
  hideMatchingRows(
    'ytd-channel-name #text, #channel-name a, ytm-badge-and-byline-renderer .badge-style-type, .ytm-badge-and-byline-renderer, ytd-video-meta-block #metadata-line a',
    text => channels.some(c => text.includes(c))
  );
}

function hideListThumbnails() {
  if (!settings.yt_thumbs) return;
  if (/\/watch/.test(location.pathname)) return;
  document.querySelectorAll(`
    ytm-thumbnail-cover,
    ytm-media-item-thumbnail-renderer,
    ytm-thumbnail-view-model,
    ytm-compact-thumbnail,
    ytd-thumbnail,
    a.media-item-thumbnail,
    .media-item-thumbnail-container,
    .compact-media-item-image
  `.trim().split(/\s*,\s*/).join(', ')).forEach(el => {
    if (el.closest('ytm-player, #player, .html5-video-player, ytd-player')) return;
    el.style.setProperty('display', 'none', 'important');
  });
}

function hideFeedEmptyStates() {
  if (!settings.yt_recs) return;
  const path = location.pathname;
  const onFeed = path === '/' || path === '/feed' || path === '/feed/'
    || path.includes('/feed/subscriptions');
  if (!onFeed) return;

  document.querySelectorAll(
    'ytm-message-renderer, yt-alert-renderer, ytd-message-renderer, ytd-alert-renderer'
  ).forEach(el => {
    el.style.setProperty('display', 'none', 'important');
  });

  document.querySelectorAll(
    'ytm-item-section-renderer, ytd-item-section-renderer, ytm-section-list-renderer, ytd-section-list-renderer'
  ).forEach(sec => {
    const text = (sec.textContent || '').slice(0, 240);
    if (/new videos right to you|subscribe to get the latest|подпишитесь|новые видео/i.test(text)) {
      sec.style.setProperty('display', 'none', 'important');
    }
  });
}

function tick() {
  blockShortsNav();
  blockExploreNav();
  redirectHomeToSubs();
  applyCss();
  tameAutoplay();
  tryTheaterMode();
  hideKeywordVideos();
  hideChannelVideos();
  hideListThumbnails();
  hideFeedEmptyStates();
}

function scheduleTick() {
  if (tickTimer) return;
  tickTimer = setTimeout(() => {
    tickTimer = null;
    tick();
  }, 32);
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
