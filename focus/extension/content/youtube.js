/* Vita Focus — YouTube (desktop + mobile web). Селекторы с запасом. */
if (typeof globalThis.browser !== 'undefined' && typeof globalThis.chrome === 'undefined') {
  globalThis.chrome = globalThis.browser;
}
const VITA_VERSION = (() => {
  try { return chrome.runtime.getManifest().version; } catch { return 'dev'; }
})();

(function markAlive() {
  const mark = () => {
    if (document.documentElement) document.documentElement.dataset.vitaFocus = VITA_VERSION;
  };
  mark();
  document.addEventListener('DOMContentLoaded', mark, { once: true });
  try { console.info(`[Vita Focus] youtube.js v${VITA_VERSION} — ${location.href}`); } catch { /* noop */ }
})();

(function vitaHud() {
  const el = document.createElement('div');
  el.id = 'vita-focus-hud';
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = [
    'position:fixed',
    'bottom:calc(10px + env(safe-area-inset-bottom,0px))',
    'left:8px',
    'z-index:2147483647',
    'padding:7px 10px',
    'border-radius:9px',
    'font:600 11px/1.35 -apple-system,BlinkMacSystemFont,sans-serif',
    'background:rgba(107,33,168,0.94)',
    'color:#fff',
    'pointer-events:none',
    'box-shadow:0 4px 16px rgba(0,0,0,.35)',
    'letter-spacing:.02em',
  ].join(';');
  const paint = (txt) => { el.textContent = txt; };
  paint(`VF ${VITA_VERSION} boot…`);
  const attach = () => {
    const root = document.documentElement || document.body;
    if (root && !root.contains(el)) root.appendChild(el);
  };
  attach();
  document.addEventListener('DOMContentLoaded', attach, { once: true });
  window.__vitaHudUpdate = paint;
})();

(function killSubsSpamEarly() {
  const PARACHUTE = /new videos right to you|новые видео/i;
  const onSubs = () => /\/feed\/subscriptions/i.test(location.pathname)
    || !!document.querySelector('ytm-browse[page-subtype="subscriptions"], ytm-pivot-bar-item-renderer[tab-selection="SUBSCRIPTIONS"]');

  const VIDEO_SEL = 'ytm-video-with-context-renderer, ytm-compact-video-renderer, ytm-media-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, yt-lockup-view-model, ytm-shorts-lockup-view-model';
  const hasVideoIn = el => !!(el && (
    (el.matches && el.matches(VIDEO_SEL))
    || (el.querySelector && el.querySelector(`${VIDEO_SEL}, a[href^="/watch"], a[href*="/watch?"]`))
  ));

  const hideNode = el => {
    if (!el || el.dataset?.vitaEarlyHidden) return;
    el.dataset.vitaEarlyHidden = '1';
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('height', '0', 'important');
    el.style.setProperty('overflow', 'hidden', 'important');
    el.style.setProperty('margin', '0', 'important');
    el.style.setProperty('padding', '0', 'important');
    el.style.setProperty('opacity', '0', 'important');
  };

  const sweep = () => {
    if (!onSubs()) return;
    document.querySelectorAll(
      'ytm-message-renderer, ytm-empty-state-renderer, ytm-zero-state-renderer, ytm-attention-grabber-view-model, ytm-statement-banner-renderer, ytm-info-panel-content-renderer, yt-alert-renderer, ytm-feed-nudge-renderer, ytd-feed-nudge-renderer, ytm-background-promo-renderer, ytd-background-promo-renderer, yt-empty-state-view-model, ytm-empty-state-view-model'
    ).forEach(hideNode);
    // Структурно: на ленте подписок ребёнок без единого видео — пустое состояние
    // или промо, каким бы тегом YouTube его ни нарисовал.
    document.querySelectorAll('ytm-browse #contents > *, ytd-browse[page-subtype="subscriptions"] #contents > *').forEach(child => {
      const tag = (child.tagName || '').toLowerCase();
      if (/continuation|chip|header|spinner|ghost/.test(tag)) return;
      if (hasVideoIn(child)) return;
      const text = (child.textContent || '').replace(/\s+/g, ' ').trim();
      // Парашют / пустое состояние: короткий блок без видео на ленте подписок.
      if (PARACHUTE.test(text) || (text.length > 0 && text.length < 220)) hideNode(child);
    });
    const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const raw = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (!PARACHUTE.test(raw)) continue;
      // Поднимаемся до самого верхнего предка без видео — это и есть карточка-парашют.
      let box = node.parentElement;
      let candidate = null;
      for (let i = 0; i < 20 && box; i++) {
        const tag = (box.tagName || '').toLowerCase();
        if (/^(ytm-browse|ytd-browse|body|html|main)$/.test(tag) || box.id === 'contents') break;
        if (hasVideoIn(box)) break;
        candidate = box;
        box = box.parentElement;
      }
      if (candidate) hideNode(candidate);
    }
  };

  const boot = () => {
    sweep();
    new MutationObserver(sweep).observe(document.documentElement, { childList: true, subtree: true });
    setInterval(sweep, 400);
  };
  if (document.documentElement) boot();
  else document.addEventListener('DOMContentLoaded', boot, { once: true });
})();

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
    ytm-browse[page-subtype="home"] ytm-rich-section-renderer,
    ytm-browse[page-subtype="home"] ytm-item-section-renderer[is-shelf],
    ytd-browse[page-subtype="subscriptions"] ytd-shelf-renderer,
    ytd-browse[page-subtype="subscriptions"] ytd-rich-item-renderer[is-slim-media],
    ytm-browse[page-subtype="subscriptions"] ytm-rich-shelf-renderer,
    ytm-browse[page-subtype="subscriptions"] ytm-rich-section-renderer,
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
    ytm-rich-section-renderer,
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
    ytm-watch ytm-video-with-context-renderer,
    ytm-watch ytm-rich-item-renderer,
    ytm-watch #related,
    ytm-watch ytm-item-section-renderer[section-identifier="related-items"],
    ytm-watch ytm-item-section-renderer[section-identifier="watch-next"],
    ytm-watch ytm-rich-section-renderer,
    ytm-watch ytm-item-section-renderer[is-shelf],
    ytm-browse ytm-rich-section-renderer[is-shelf],
    .related-chips-slot-wrapper,
    ytd-compact-radio-renderer,
    ytm-compact-radio-renderer,
    ytm-structured-description-content-renderer ~ ytm-item-section-renderer,
    ytm-watch #items ytm-compact-video-renderer,
    ytm-watch #items ytm-video-with-context-renderer
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
    ytd-button-renderer#button[aria-label*="уведомлен"],
    ytm-notification-topbar-button-renderer,
    ytm-button-renderer[aria-label*="Notification"],
    ytm-button-renderer[aria-label*="уведомлен"],
    ytm-topbar-menu-button-renderer[aria-label*="Notification"]
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

const IS_MOBILE_HOST = /(^|\.)m\.youtube\.com$/i.test(location.hostname);

function isMobileYt() {
  if (IS_MOBILE_HOST) return true;
  return !!document.querySelector('ytm-app, ytm-mobile-topbar-renderer, ytm-browse, ytm-pivot-bar-renderer');
}

function isSubsPage() {
  if (/\/feed\/subscriptions/i.test(location.pathname)) return true;
  return !!document.querySelector(
    'ytm-pivot-bar-item-renderer[tab-selection="SUBSCRIPTIONS"], ytm-pivot-bar-renderer [tab-id="SUBSCRIPTIONS"][aria-selected="true"], ytm-browse[page-subtype="subscriptions"]'
  );
}

const ROW_SEL = `
  ytm-video-with-context-renderer,
  ytm-compact-video-renderer,
  ytm-rich-item-renderer,
  ytd-rich-item-renderer,
  ytd-video-renderer,
  ytd-compact-video-renderer,
  ytd-grid-video-renderer
`.trim().split(/\s*,\s*/).join(', ');

const THUMB_HIDE_SEL = `
  ytm-thumbnail-cover,
  ytm-media-item-thumbnail-renderer,
  ytm-thumbnail-view-model,
  ytm-thumbnail-view-model-v2,
  ytm-compact-thumbnail,
  ytm-item-thumbnail-renderer,
  ytm-thumbnail-overlay-thumbnail-view-model,
  yt-thumbnail-view-model,
  yt-thumbnail-view-model-v2,
  ytd-thumbnail,
  a.media-item-thumbnail,
  .media-item-thumbnail-container,
  .compact-media-item-image,
  .ytm-thumbnail-cover,
  yt-image,
  yt-img-shadow,
  img.ytCoreImageHost
`.trim().split(/\s*,\s*/).join(', ');

const THUMB_BLUR_SEL = `
  a.media-item-thumbnail,
  .media-item-thumbnail-container,
  .compact-media-item-image,
  ytm-thumbnail-cover,
  ytm-media-item-thumbnail-renderer,
  ytm-thumbnail-view-model,
  ytm-thumbnail-view-model-v2,
  ytm-compact-thumbnail,
  ytm-item-thumbnail-renderer,
  ytd-thumbnail,
  yt-thumbnail-view-model,
  yt-thumbnail-view-model-v2
`.trim().split(/\s*,\s*/).join(', ');

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
    box-shadow: none !important;
    filter: none !important;
  }
  ytm-thumbnail-cover yt-image-shadow,
  ytm-media-item-thumbnail-renderer yt-image-shadow,
  ytd-thumbnail yt-image-shadow {
    display: none !important;
    box-shadow: none !important;
    filter: none !important;
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

function scopedSel(scope, sel) {
  return sel.trim().split(/\s*,\s*/).map(s => `${scope} ${s}`).join(', ');
}

function blurCssBlock() {
  const scopes = ['ytm-browse', 'ytd-browse', 'ytm-search', 'ytd-search'];
  const targets = scopes.map(s => scopedSel(s, THUMB_BLUR_SEL)).join(',\n');
  const imgs = scopes.map(s => scopedSel(s, `${THUMB_BLUR_SEL}, img.ytCoreImageHost`)).join(',\n');
  return `
  ${targets} {
    filter: grayscale(1) blur(12px) !important;
    opacity: 0.4 !important;
    transform: scale(1.02) !important;
  }
  ${imgs} img,
  ${imgs} yt-image {
    filter: grayscale(1) blur(12px) !important;
    opacity: 0.4 !important;
  }
  `;
}

const EMPTY_TEXT_RE = /new videos right to you|new videos from your subscriptions|subscribe to channels|try searching to get started|start watching videos|get started|подпишитесь|новые видео|нет новых|начните смотреть|на каналы/i;

const FEED_EMPTY_CSS = `
  ytm-browse[page-subtype="home"] ytm-message-renderer,
  ytm-browse[page-subtype="subscriptions"] ytm-message-renderer,
  ytm-browse[page-subtype="home"] yt-alert-renderer,
  ytm-browse[page-subtype="subscriptions"] yt-alert-renderer,
  ytd-browse[page-subtype="home"] ytd-message-renderer,
  ytd-browse[page-subtype="subscriptions"] ytd-message-renderer,
  ytd-browse[page-subtype="home"] yt-alert-renderer,
  ytd-browse[page-subtype="subscriptions"] yt-alert-renderer,
  ytm-browse ytm-item-section-renderer:has(ytm-message-renderer),
  ytm-browse ytm-item-section-renderer:has(yt-alert-renderer),
  ytm-browse ytm-rich-item-renderer:has(ytm-message-renderer),
  ytm-browse ytm-section-list-renderer:has(ytm-message-renderer),
  ytd-browse ytd-item-section-renderer:has(ytd-message-renderer),
  ytd-browse ytd-item-section-renderer:has(yt-alert-renderer),
  ytm-statement-banner-renderer,
  ytm-attention-grabber-view-model,
  ytm-zero-state-renderer,
  ytm-info-panel-content-renderer,
  ytm-empty-state-renderer,
  ytm-feed-nudge-renderer,
  ytd-feed-nudge-renderer,
  ytm-background-promo-renderer,
  ytd-background-promo-renderer,
  yt-empty-state-view-model,
  ytm-empty-state-view-model,
  ytm-browse .empty-state,
  ytm-browse [class*="empty-state"],
  [aria-label*="New videos right to you"],
  [aria-label*="новые видео"]
  {
    display: none !important;
    visibility: hidden !important;
    height: 0 !important;
    min-height: 0 !important;
    max-height: 0 !important;
    overflow: hidden !important;
    margin: 0 !important;
    padding: 0 !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }
  ytm-browse[page-subtype="home"] #contents:empty,
  ytm-browse[page-subtype="subscriptions"] #contents:empty {
    min-height: 0 !important;
  }
`;

const TEXT_ONLY_MOBILE_CSS = `
  ytm-browse ${ROW_SEL} .media-item,
  ytm-browse ${ROW_SEL} .compact-media-item {
    display: flex !important;
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 6px !important;
  }
  ytm-browse ${ROW_SEL} .media-item-thumbnail-container,
  ytm-browse ${ROW_SEL} a.media-item-thumbnail,
  ytm-browse ${ROW_SEL} .compact-media-item-image,
  ytm-browse ${ROW_SEL} ytm-thumbnail-cover,
  ytm-browse ${ROW_SEL} ytm-media-item-thumbnail-renderer,
  ytm-browse ${ROW_SEL} ytm-thumbnail-view-model,
  ytm-browse ${ROW_SEL} ytm-thumbnail-view-model-v2,
  ytm-browse ${ROW_SEL} yt-image,
  ytm-browse ${ROW_SEL} img.ytCoreImageHost {
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
  ytm-browse ${ROW_SEL} .media-item-metadata,
  ytm-browse ${ROW_SEL} .compact-media-item-metadata {
    width: 100% !important;
    padding-left: 0 !important;
    margin-left: 0 !important;
  }
  ytm-browse ${ROW_SEL} #video-title,
  ytm-browse ${ROW_SEL} .compact-media-item-headline {
    font-size: 15px !important;
    line-height: 1.35 !important;
    -webkit-line-clamp: unset !important;
    max-height: none !important;
  }
`;

const EMPTY_COMPONENT_SEL = `
  ytm-message-renderer,
  yt-alert-renderer,
  ytd-message-renderer,
  ytd-alert-renderer,
  ytm-statement-banner-renderer,
  ytm-attention-grabber-view-model,
  ytm-zero-state-renderer,
  ytm-info-panel-content-renderer,
  ytm-empty-state-renderer,
  ytm-feed-nudge-renderer,
  ytd-feed-nudge-renderer,
  ytm-background-promo-renderer,
  ytd-background-promo-renderer,
  yt-empty-state-view-model,
  ytm-empty-state-view-model
`.trim().split(/\s*,\s*/).join(', ');

const EMPTY_CONTAINER_SEL = `
  ytm-item-section-renderer,
  ytd-item-section-renderer,
  ytm-section-list-renderer,
  ytd-section-list-renderer,
  ytm-rich-item-renderer,
  ytm-rich-grid-renderer > *,
  ytd-rich-item-renderer
`.trim().split(/\s*,\s*/).join(', ');

let settings = { ...DEFAULTS };
let styleEl = null;
let tickTimer = null;
let heavyTimer = null;

function feedText(el) {
  return (el?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 320);
}

function isEmptyFeedSection(el) {
  if (!el || hasFeedVideo(el)) return false;
  return EMPTY_TEXT_RE.test(feedText(el));
}

function isOnFeedPage() {
  const path = location.pathname;
  return path === '/' || path === '/feed' || path === '/feed/' || isSubsPage();
}

function getBrowseRoots() {
  const exact = document.querySelectorAll(
    'ytm-browse[page-subtype="home"], ytm-browse[page-subtype="subscriptions"], ytd-browse[page-subtype="home"], ytd-browse[page-subtype="subscriptions"]'
  );
  if (exact.length) return exact;
  return document.querySelectorAll('ytm-browse, ytd-browse');
}

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
  if (settings.yt_thumbs) {
    blocks.push(THUMB_CSS);
    if (isMobileYt()) blocks.push(TEXT_ONLY_MOBILE_CSS);
  }
  if (settings.yt_blur && !settings.yt_thumbs) blocks.push(blurCssBlock());
  if (settings.yt_recs || isSubsPage()) blocks.push(FEED_EMPTY_CSS);
  const mobileFeed = isMobileYt() || document.querySelector('ytm-browse, ytm-app, ytm-mobile-topbar-renderer');
  if (mobileFeed && !settings.yt_thumbs) blocks.push(MOBILE_FEED_CSS);
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

function hideRelatedOnWatch() {
  if (!settings.yt_related) return;
  if (!/\/watch/.test(location.pathname)) return;

  const hideSel = `
    ytm-watch ytm-compact-video-renderer,
    ytm-watch ytm-video-with-context-renderer,
    ytm-watch ytm-rich-item-renderer,
    ytm-watch ytm-rich-section-renderer,
    ytm-single-column-watch-next-results-renderer,
    ytm-watch-next-secondary-results-renderer,
    ytm-item-section-renderer[section-identifier="related-items"],
    ytm-item-section-renderer[section-identifier="watch-next"]
  `.trim().split(/\s*,\s*/).join(', ');

  document.querySelectorAll(hideSel).forEach(el => {
    if (el.closest('ytm-comments-entry-point, ytm-comment-section-renderer, #comments')) return;
    el.style.setProperty('display', 'none', 'important');
  });

  queryDeep(document.querySelector('ytm-watch, ytd-watch-flexy') || document, hideSel).forEach(el => {
    if (el.closest('ytm-comments-entry-point, ytm-comment-section-renderer, #comments')) return;
    el.style.setProperty('display', 'none', 'important');
  });
}

function inPlayer(el) {
  return !!el?.closest?.('ytm-player, #player, .html5-video-player, ytd-player, ytm-player-controls, .html5-video-container, #movie_player');
}

function clearThumbOverrides(root) {
  queryDeep(root, '[data-vita-thumb-hidden], [data-vita-blur]').forEach(el => {
    delete el.dataset.vitaThumbHidden;
    delete el.dataset.vitaBlur;
    el.style.removeProperty('display');
    el.style.removeProperty('width');
    el.style.removeProperty('height');
    el.style.removeProperty('min-height');
    el.style.removeProperty('margin');
    el.style.removeProperty('padding');
    el.style.removeProperty('overflow');
    el.style.removeProperty('opacity');
    el.style.removeProperty('pointer-events');
    el.style.removeProperty('filter');
    el.style.removeProperty('transform');
  });
}

function applyBlurThumbnails() {
  if (!settings.yt_blur || settings.yt_thumbs) return;
  const roots = getBrowseRoots().length ? [...getBrowseRoots()] : [document];
  if (/\/watch/.test(location.pathname)) roots.push(document);
  roots.forEach(root => {
    queryDeep(root, `${THUMB_BLUR_SEL}, img.ytCoreImageHost`).forEach(el => {
      if (inPlayer(el)) return;
      if (el.dataset?.vitaBlur) return;
      el.dataset.vitaBlur = '1';
      el.style.setProperty('filter', 'grayscale(1) blur(12px)', 'important');
      el.style.setProperty('opacity', '0.4', 'important');
      el.style.setProperty('transform', 'scale(1.02)', 'important');
    });
  });
}

function hideListThumbnails() {
  if (!settings.yt_thumbs) return;
  if (/\/watch/.test(location.pathname)) return;

  const roots = getBrowseRoots();
  const scope = roots.length ? roots : [document];
  scope.forEach(root => {
    queryDeep(root, THUMB_HIDE_SEL).forEach(el => {
      if (inPlayer(el)) return;
      hideThumbEl(el);
    });
    root.querySelectorAll(ROW_SEL).forEach(row => {
      if (inPlayer(row)) return;
      queryDeep(row, THUMB_HIDE_SEL).forEach(hideThumbEl);
      row.querySelectorAll('a.media-item-thumbnail, .media-item-thumbnail-container, .compact-media-item-image').forEach(hideThumbEl);
    });
  });
}

function hideThumbEl(el) {
  if (!el || el.dataset?.vitaThumbHidden) return;
  el.dataset.vitaThumbHidden = '1';
  el.style.setProperty('display', 'none', 'important');
  el.style.setProperty('width', '0', 'important');
  el.style.setProperty('height', '0', 'important');
  el.style.setProperty('min-height', '0', 'important');
  el.style.setProperty('margin', '0', 'important');
  el.style.setProperty('padding', '0', 'important');
  el.style.setProperty('overflow', 'hidden', 'important');
  el.style.setProperty('opacity', '0', 'important');
  el.style.setProperty('pointer-events', 'none', 'important');
}

function hideEl(el) {
  if (!el || el.dataset?.vitaEmptyHidden) return;
  el.dataset.vitaEmptyHidden = '1';
  el.style.setProperty('display', 'none', 'important');
  el.style.setProperty('visibility', 'hidden', 'important');
  el.style.setProperty('height', '0', 'important');
  el.style.setProperty('overflow', 'hidden', 'important');
  el.style.setProperty('margin', '0', 'important');
  el.style.setProperty('padding', '0', 'important');
}

function hasFeedVideo(el) {
  return !!el.querySelector(
    'ytm-video-with-context-renderer, ytm-compact-video-renderer, ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer'
  );
}

function findEmptyStateContainer(el) {
  let node = el;
  let best = null;
  for (let i = 0; i < 14 && node; i++) {
    const tag = (node.tagName || '').toLowerCase();
    if (/^(ytm-browse|ytd-browse|body|html)$/.test(tag)) break;
    if (/^(ytm-item-section-renderer|ytd-item-section-renderer|ytm-section-list-renderer|ytd-section-list-renderer|ytm-rich-item-renderer|ytd-rich-item-renderer|ytm-message-renderer|yt-alert-renderer|ytd-message-renderer|ytd-alert-renderer|ytm-statement-banner-renderer|ytm-attention-grabber-view-model|ytm-zero-state-renderer|ytm-rich-section-renderer|ytd-rich-section-renderer|ytm-feed-nudge-renderer|ytd-feed-nudge-renderer|ytm-background-promo-renderer|ytd-background-promo-renderer)$/.test(tag)) {
      best = node;
    }
    node = node.parentElement;
  }
  return best || el;
}

function queryDeep(root, selector) {
  const out = [];
  const seen = new Set();
  const walk = node => {
    if (!node || seen.has(node)) return;
    seen.add(node);
    if (node.querySelectorAll) {
      try {
        node.querySelectorAll(selector).forEach(el => out.push(el));
      } catch { /* invalid in some roots */ }
      node.querySelectorAll('*').forEach(el => {
        if (el.shadowRoot) walk(el.shadowRoot);
      });
    }
  };
  walk(root);
  return out;
}

function collapseEmptyFeed() {
  getBrowseRoots().forEach(browse => {
    const contents = browse.querySelector('#contents');
    if (!contents) return;
    contents.querySelectorAll(':scope > *').forEach(child => {
      if (isEmptyFeedSection(child)) hideEl(child);
    });
    queryDeep(contents, 'ytm-rich-section-renderer, ytm-item-section-renderer, ytm-section-list-renderer').forEach(sec => {
      if (isEmptyFeedSection(sec)) hideEl(sec);
    });
  });
}

function hideDuplicateEmptyHeadings() {
  getBrowseRoots().forEach(browse => {
    queryDeep(browse, 'h1, h2, h3, h4, .title, [role="heading"]').forEach(el => {
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!/^new videos right to you$/i.test(t)) return;
      hideEl(findEmptyStateContainer(el));
    });
    const walker = document.createTreeWalker(browse, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const raw = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (!/^new videos right to you$/i.test(raw)) continue;
      hideEl(findEmptyStateContainer(node.parentElement));
    }
  });
}

function nukeSubsParachutes() {
  if (!isSubsPage()) return;
  getBrowseRoots().forEach(browse => {
    browse.querySelectorAll('#contents > *').forEach(child => {
      if (hasFeedVideo(child)) return;
      if (isEmptyFeedSection(child) || child.querySelector(
        'ytm-message-renderer, ytm-empty-state-renderer, ytm-zero-state-renderer, ytm-attention-grabber-view-model, ytm-statement-banner-renderer, ytm-feed-nudge-renderer, ytm-background-promo-renderer, yt-empty-state-view-model'
      )) hideEl(child);
    });
    queryDeep(browse, 'ytm-rich-section-renderer, ytm-item-section-renderer, ytm-section-list-renderer').forEach(sec => {
      if (hasFeedVideo(sec)) return;
      if (isEmptyFeedSection(sec) || sec.querySelector(
        'ytm-message-renderer, ytm-empty-state-renderer, ytm-zero-state-renderer, ytm-attention-grabber-view-model, ytm-feed-nudge-renderer, ytm-background-promo-renderer, yt-empty-state-view-model'
      )) hideEl(sec);
    });
  });
  hideDuplicateEmptyHeadings();
}

function hideFeedEmptyStates() {
  const onSubs = isSubsPage();
  if (!isOnFeedPage() && !onSubs) return;
  if (!settings.yt_recs && !onSubs) return;

  if (onSubs) {
    nukeSubsParachutes();
    return;
  }

  const roots = getBrowseRoots();
  const scope = roots.length ? roots : [document];

  scope.forEach(root => {
    queryDeep(root, EMPTY_COMPONENT_SEL).forEach(hideEl);
    root.querySelectorAll('[aria-label]').forEach(el => {
      const label = el.getAttribute('aria-label') || '';
      if (/new videos right to you|новые видео/i.test(label)) hideEl(findEmptyStateContainer(el));
    });
    root.querySelectorAll(EMPTY_CONTAINER_SEL).forEach(sec => {
      if (hasFeedVideo(sec)) return;
      const text = (sec.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 280);
      if (EMPTY_TEXT_RE.test(text)) hideEl(sec);
    });
  });

  collapseEmptyFeed();
  hideDuplicateEmptyHeadings();

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const raw = (node.textContent || '').replace(/\s+/g, ' ').trim();
    if (!raw || raw.length > 220) continue;
    if (!EMPTY_TEXT_RE.test(raw)) continue;
    const parent = node.parentElement;
    if (!parent || !parent.closest('ytm-browse, ytd-browse')) continue;
    hideEl(findEmptyStateContainer(parent));
  }
}

function tickFast() {
  blockShortsNav();
  blockExploreNav();
  redirectHomeToSubs();
  applyCss();
  tameAutoplay();
  tryTheaterMode();
  hideKeywordVideos();
  hideChannelVideos();
}

function tickHeavy() {
  if (!settings.yt_thumbs && !settings.yt_blur) clearThumbOverrides(document);
  hideListThumbnails();
  applyBlurThumbnails();
  hideRelatedOnWatch();
  if (isSubsPage()) nukeSubsParachutes();
  hideFeedEmptyStates();
}

function tick() {
  tickFast();
  tickHeavy();
}

function scheduleTick() {
  if (tickTimer) return;
  tickTimer = setTimeout(() => {
    tickTimer = null;
    tickFast();
    scheduleHeavy();
  }, 48);
}

function scheduleHeavy() {
  if (heavyTimer) return;
  heavyTimer = setTimeout(() => {
    heavyTimer = null;
    tickHeavy();
  }, 120);
}

let settingsLoaded = false;
let lastSettingsRev = 0;
function anyActive() {
  return Object.entries(settings).some(([k, v]) => v && k.startsWith('yt_'));
}

function inScheduleWindowCS(schedule) {
  const h = new Date().getHours();
  const { start, end } = schedule;
  if (start === end) return true;
  if (start < end) return h >= start && h < end;
  return h >= start || h < end;
}

// Читаем storage напрямую: background-воркер в iOS Safari часто мёртв,
// и через vfocus:get настройки просто не доезжают до страницы.
// Safari iOS: local storage — единственный надёжный канал popup → content script.
async function vfocusReadStore(keys) {
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

async function readSettingsDirect() {
  const data = await vfocusReadStore(['settings', 'schedule', 'pending', 'settingsRev']);
  if (data.settingsRev) lastSettingsRev = data.settingsRev;
  const raw = { ...DEFAULTS, ...(data.settings || {}) };
  const pending = data.pending || {};
  const now = Date.now();
  for (const [id, until] of Object.entries(pending)) {
    if (until <= now) raw[id] = false;
  }
  const schedule = { enabled: false, start: 9, end: 22, ...(data.schedule || {}) };
  if (schedule.enabled && !inScheduleWindowCS(schedule)) {
    for (const k of Object.keys(raw)) raw[k] = false;
  }
  return raw;
}

async function loadSettings() {
  const prev = JSON.stringify(settings);
  let storageOk = true;
  try {
    settings = await readSettingsDirect();
  } catch (e) {
    storageOk = false;
    try {
      const res = await chrome.runtime.sendMessage({ type: 'vfocus:get' });
      if (res) settings = { ...DEFAULTS, ...res };
    } catch {
      settings = { ...DEFAULTS };
    }
  }
  const on = Object.entries(settings).filter(([k, v]) => v && k.startsWith('yt_')).map(([k]) => k.replace('yt_', '')).slice(0, 4);
  if (typeof window.__vitaHudUpdate === 'function') {
    window.__vitaHudUpdate(`VF ${VITA_VERSION} · ${storageOk ? 'storage OK' : 'storage FAIL'} · ${on.length ? on.join(',') : 'off'}`);
  }
  const next = JSON.stringify(settings);
  if (prev === next) return;
  if (!settings.yt_thumbs && !settings.yt_blur) {
    clearThumbOverrides(document);
  }
  tick();
  settingsLoaded = true;
}

try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' && area !== 'sync') return;
    if (changes.settings || changes.settingsRev || changes.schedule || changes.pending || changes.cooldownHours) loadSettings();
  });
} catch { /* нет chrome.storage — останется поллинг */ }

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'vfocus:settings') loadSettings();
  if (msg?.type === 'vfocus:ping') {
    sendResponse({ ok: true, version: VITA_VERSION, site: 'youtube' });
  }
});

const obs = new MutationObserver(mutations => {
  if (!settingsLoaded) return;
  const added = mutations.some(m => m.addedNodes.length);
  if (!anyActive() && !added) return;
  scheduleTick();
  if (added && (settings.yt_recs || settings.yt_thumbs || settings.yt_blur || settings.yt_related)) scheduleHeavy();
});
function watch() {
  tick();
  if (document.body) {
    obs.observe(document.body, { childList: true, subtree: true });
  }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', watch, { once: true });
} else {
  watch();
}
tick();
loadSettings();
[0, 50, 200, 600, 1500].forEach(ms => setTimeout(loadSettings, ms));
let pollTick = 0;
setInterval(async () => {
  pollTick++;
  try {
    const local = await chrome.storage.local.get('settingsRev');
    const rev = local.settingsRev || (await chrome.storage.sync.get('settingsRev')).settingsRev;
    if (rev && rev !== lastSettingsRev) {
      lastSettingsRev = rev;
      loadSettings();
      return;
    }
  } catch { /* ignore */ }
  if (pollTick % 8 === 0) loadSettings();
}, 250);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) loadSettings();
});
