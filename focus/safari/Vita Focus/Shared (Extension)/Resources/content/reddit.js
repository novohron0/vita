vfocusBoot({
  id: 'vita-focus-rd',
  defaults: { rd_feed: false, rd_popular: false, rd_sidebar: false },
  rules: {
    rd_feed: `
      shreddit-feed,
      #SHORTCUT_FOCUSABLE_DIV > div > div:not([class*="sidebar"]) article,
      .ListingLayout-outerContainer .ListingLayout-main,
      faceplate-partial[loading="lazy"] [slot="main"]
    `,
    rd_popular: `
      a[href="/r/popular/"],
      a[href="/r/all/"],
      faceplate-tracker[noun="popular"],
      faceplate-tracker[noun="all"],
      nav a[href*="popular"]
    `,
    rd_sidebar: `
      aside,
      #right-sidebar-container,
      shreddit-async-loader[bundlename="right_sidebar"]
    `,
  },
  beforeTick(s) {
    if (s.rd_popular && /^\/r\/(popular|all)(\/|$)/.test(location.pathname)) {
      location.replace('/');
    }
  },
});
