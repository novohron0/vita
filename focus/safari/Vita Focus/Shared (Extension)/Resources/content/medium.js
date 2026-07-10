vfocusBoot({
  id: 'vita-focus-md',
  defaults: { md_feed: false, md_rec: false, md_meter: false },
  rules: {
    md_feed: `
      main article,
      [data-testid="post-preview"],
      div[data-post-id]
    `,
    md_rec: `
      aside [data-testid="sidebar"],
      [class*="recommendedStories"],
      [class*="FollowSuggestions"]
    `,
    md_meter: `
      [data-testid="meteredContent"],
      [class*="meter"],
      div[aria-label*="member-only"]
    `,
  },
});
