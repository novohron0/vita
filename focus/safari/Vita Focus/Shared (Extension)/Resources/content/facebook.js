vfocusBoot({
  id: 'vita-focus-fb',
  defaults: { fb_feed: false, fb_reels: false, fb_stories: false },
  rules: {
    fb_feed: `
      div[role="feed"],
      div[role="main"] div[data-pagelet="FeedUnit"],
      div[aria-label="Stories"] ~ div[role="feed"],
      #ssrb_feed_start + div
    `,
    fb_reels: `
      a[href*="/reel/"],
      a[href*="/reels/"],
      [aria-label="Reels"],
      [aria-label="Клипы"]
    `,
    fb_stories: `
      div[aria-label="Stories"],
      div[aria-label="Истории"],
      div[role="main"] div[data-pagelet*="Stories"]
    `,
  },
  beforeTick(s) {
    if (s.fb_reels && /\/reels?(\/|$)/.test(location.pathname)) location.replace('/');
  },
});
