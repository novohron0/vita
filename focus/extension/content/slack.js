vfocusBoot({
  id: 'vita-focus-sl',
  defaults: { sl_activity: false, sl_huddle: false, sl_apps: false },
  rules: {
    sl_activity: `
      [data-qa="activity_view"],
      [aria-label="Activity"],
      [aria-label="Активность"]
    `,
    sl_huddle: `
      [data-qa="huddles"],
      [aria-label="Huddles"],
      button[aria-label*="huddle"]
    `,
    sl_apps: `
      [data-qa="apps_view"],
      [aria-label="Apps"],
      [aria-label="Приложения"]
    `,
  },
});
