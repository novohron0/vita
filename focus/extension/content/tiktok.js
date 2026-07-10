vfocusBoot({
  id: 'vita-focus-tt',
  defaults: { tt_foryou: false, tt_discover: false, tt_live: false, tt_sidebar: false },
  rules: {
    tt_discover: `
      a[href*="/explore"],
      [data-e2e="nav-explore"],
      [data-e2e="explore-icon"]
    `,
    tt_live: `
      a[href*="/live"],
      [data-e2e="nav-live"],
      [data-e2e="live-icon"]
    `,
    tt_sidebar: `
      [class*="DivSideNavContainer"] [class*="RecommendUser"],
      [class*="DivUserContainer"],
      aside[class*="AsideContainer"]
    `,
  },
  beforeTick(s) {
    if (!s.tt_foryou) return;
    const p = location.pathname;
    if (p === '/' || p === '/foryou' || p === '/foryou/') location.replace('/following');
  },
});
