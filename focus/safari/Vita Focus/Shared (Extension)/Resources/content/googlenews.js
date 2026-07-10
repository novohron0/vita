vfocusBoot({
  id: 'vita-focus-gn',
  defaults: { gn_feed: false, gn_for_you: false, gn_local: false },
  rules: {
    gn_feed: `
      main article,
      c-wiz[data-n-a-id] article,
      .iTin5e
    `,
    gn_for_you: `
      a[href*="for_you"],
      [aria-label="For you"],
      [aria-label="Для вас"]
    `,
    gn_local: `
      a[href*="geo/"],
      [aria-label="Local"],
      [aria-label="Местные"]
    `,
  },
});
