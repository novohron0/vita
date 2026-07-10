vfocusBoot({
  id: 'vita-focus-li',
  defaults: { li_feed: false, li_news: false, li_suggestions: false },
  rules: {
    li_feed: `
      div.scaffold-finite-scroll,
      main.scaffold-layout__main .feed-shared-update-v2,
      div.feed-container-theme,
      .core-rail .scaffold-finite-scroll__content
    `,
    li_news: `
      aside .news-module,
      section.news-module,
      div[data-test-id="news-module"],
      .scaffold-layout__aside .artdeco-carousel
    `,
    li_suggestions: `
      aside section.artdeco-card,
      div[componentkey*="suggested"],
      aside .artdeco-card.mb4
    `,
  },
});
