vfocusBoot({
  id: 'vita-focus-dz',
  defaults: { dz_feed: false, dz_shorts: false, dz_recommend: false },
  rules: {
    dz_feed: `
      [data-testid="feed"],
      article[data-testid="card-article"],
      .feed__item,
      .zen-ui-feed__item
    `,
    dz_shorts: `
      a[href*="/video/"],
      [data-testid="shorts"],
      [class*="Shorts"]
    `,
    dz_recommend: `
      [data-testid="recommended"],
      [class*="Recommend"],
      aside[class*="sidebar"]
    `,
  },
  beforeTick(s) {
    if (!s.dz_shorts) return;
    if (/^\/video/.test(location.pathname)) location.replace('/');
  },
});
