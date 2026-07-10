vfocusBoot({
  id: 'vita-focus-wa',
  defaults: { wa_status: false, wa_channels: false, wa_stickers: false },
  rules: {
    wa_status: `
      #side [data-testid="status-v3-main-panel"],
      #side [aria-label="Status"],
      #side [aria-label="Статус"]
    `,
    wa_channels: `
      #side [data-testid="channels"],
      #side [aria-label="Channels"],
      #side [aria-label="Каналы"]
    `,
    wa_stickers: `
      [data-testid="sticker-picker"],
      [data-testid="mi-sticker-store"]
    `,
  },
});
