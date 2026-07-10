vfocusBoot({
  id: 'vita-focus-sp',
  defaults: { sp_rec: false, sp_podcasts: false, sp_charts: false },
  rules: {
    sp_rec: `
      [data-testid="home-page"],
      [data-testid="home-shortcut-grid"],
      [data-testid="entityCard"],
      section[aria-label*="Recommended"],
      section[aria-label*="рекоменд"]
    `,
    sp_podcasts: `
      a[href="/genre/podcasts-page"],
      a[href*="/show/"],
      [data-testid="card-title-podcast"]
    `,
    sp_charts: `
      a[href="/charts"],
      a[href*="/playlist/"][href*="charts"]
    `,
  },
});
