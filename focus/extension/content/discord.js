vfocusBoot({
  id: 'vita-focus-dc',
  defaults: { dc_activity: false, dc_discover: false, dc_nitro: false, dc_stickers: false },
  rules: {
    dc_activity: `
      [aria-label="Activity"],
      [aria-label="Активность"],
      nav a[href="/activity"],
      [class*="activityPanel"]
    `,
    dc_discover: `
      [aria-label="Discover"],
      [aria-label="Обзор"],
      nav a[href="/discovery"],
      nav a[href="/servers"]
    `,
    dc_nitro: `
      [aria-label="Shop"],
      [aria-label="Магазин"],
      nav a[href="/store"],
      [class*="premiumPromo"],
      [class*="giftBanner"]
    `,
    dc_stickers: `
      [aria-label="Sticker Picker"],
      [class*="stickerPicker"],
      button[aria-label*="Sticker"]
    `,
  },
});
