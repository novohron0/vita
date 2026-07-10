vfocusBoot({
  id: 'vita-focus-x',
  defaults: { x_feed: false, x_trends: false, x_follow: false },
  rules: {
    x_feed: `
      div[data-testid="primaryColumn"] section[role="region"],
      div[data-testid="primaryColumn"] > div > div > section,
      main[role="main"] section[role="region"]
    `,
    x_trends: `
      div[data-testid="sidebarColumn"] section,
      div[data-testid="trend"],
      div[aria-label*="Trending"],
      div[aria-label*="тренд"],
      aside[aria-label*="Trending"]
    `,
    x_follow: `
      aside[aria-label*="Who to follow"],
      aside[aria-label*="Кого читать"],
      div[data-testid="UserCell"],
      section[aria-label*="Who to follow"]
    `,
  },
  beforeTick(s) {
    if (!s.x_feed) return;
    if (location.pathname === '/home' || location.pathname === '/') {
      document.querySelectorAll('div[data-testid="primaryColumn"] section').forEach(el => {
        el.style.setProperty('display', 'none', 'important');
      });
    }
  },
});
