vfocusBoot({
  id: 'vita-focus-gh',
  defaults: { gh_feed: false, gh_trending: false, gh_explore: false, gh_sponsor: false },
  rules: {
    gh_feed: `
      [data-testid="feed-container"],
      .news-feed,
      #dashboard .js-all-activity-header ~ div
    `,
    gh_trending: `
      a[href="/trending"],
      [href*="/trending/developers"],
      [href*="/trending/repositories"]
    `,
    gh_explore: `
      a[href="/explore"],
      nav a[href^="/explore"]
    `,
    gh_sponsor: `
      [data-testid="sponsor-card"],
      .sponsorship-card,
      a[href*="/sponsors"]
    `,
  },
  beforeTick(s) {
    if (!s.gh_explore) return;
    if (/^\/explore/.test(location.pathname)) location.replace('/');
  },
});
