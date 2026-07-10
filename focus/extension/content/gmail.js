vfocusBoot({
  id: 'vita-focus-gm',
  defaults: { gm_promo: false, gm_forums: false, gm_updates: false },
  rules: {
    gm_promo: `
      div[aria-label="Promotions"],
      div[aria-label="Реклама"],
      a[href*="category/promotions"]
    `,
    gm_forums: `
      div[aria-label="Forums"],
      div[aria-label="Форумы"],
      a[href*="category/forums"]
    `,
    gm_updates: `
      div[aria-label="Updates"],
      div[aria-label="Оповещения"],
      a[href*="category/updates"]
    `,
  },
});
