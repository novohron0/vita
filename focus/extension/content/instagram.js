vfocusBoot({
  id: 'vita-focus-ig',
  defaults: { ig_reels: false, ig_explore: false, ig_stories: false, ig_feed: false },
  rules: {
    ig_reels: `
      a[href="/reels/"],
      a[href^="/reels"],
      svg[aria-label="Reels"],
      [aria-label="Reels"],
      [aria-label="Reels "]
    `,
    ig_explore: `
      a[href="/explore/"],
      a[href^="/explore"],
      svg[aria-label="Explore"],
      [aria-label="Explore"],
      [aria-label="Интересное"]
    `,
    ig_stories: `
      div[role="menubar"] ~ div div[role="button"] canvas,
      header section ul,
      div._acaz,
      [aria-label*="Story"],
      [aria-label*="истори"]
    `,
    ig_feed: `
      main[role="main"] article,
      main article[role="presentation"],
      div[style*="flex-direction: column"] > article
    `,
  },
  beforeTick(s) {
    if (s.ig_reels && /^\/reels/.test(location.pathname)) location.replace('/');
    if (s.ig_explore && /^\/explore/.test(location.pathname)) location.replace('/');
  },
});
