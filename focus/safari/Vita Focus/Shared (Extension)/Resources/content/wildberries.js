vfocusBoot({
  id: 'vita-focus-wb',
  defaults: { wb_rec: false, wb_stories: false, wb_ads: false },
  rules: {
    wb_rec: `
      .main-page__content,
      .product-card-list,
      .goods-tile,
      [class*="recommend"]
    `,
    wb_stories: `
      .stories,
      [class*="Stories"],
      .story-item
    `,
    wb_ads: `
      .j-advert,
      [class*="advert"],
      [data-link="advert"]
    `,
  },
});
