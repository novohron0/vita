vfocusBoot({
  id: 'vita-focus-oz',
  defaults: { oz_rec: false, oz_stories: false, oz_flash: false },
  rules: {
    oz_rec: `
      [data-widget="skuGridSimple"],
      [data-widget="tileGridDesktop"],
      .widget-search-result-container,
      [class*="recommended"]
    `,
    oz_stories: `
      [data-widget="stories"],
      [class*="Stories"],
      .stories-widget
    `,
    oz_flash: `
      [data-widget="flashSale"],
      [class*="FlashSale"],
      [class*="flashsale"],
      a[href*="/highlight/"]
    `,
  },
});
