vfocusBoot({
  id: 'vita-focus-th',
  defaults: { th_feed: false, th_suggest: false, th_replies: false },
  rules: {
    th_feed: `
      main div[data-pressable-container="true"],
      main article,
      [role="main"] > div > div > div[style*="flex"]
    `,
    th_suggest: `
      [class*="FollowList"],
      [class*="Suggested"],
      div[role="tablist"] ~ div a[href*="/@"]
    `,
    th_replies: `
      div[role="button"][tabindex="0"] + div ul,
      [class*="ReplyThread"],
      div[aria-label*="repl"]
    `,
  },
});
