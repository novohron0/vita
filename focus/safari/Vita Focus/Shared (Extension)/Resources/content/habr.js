vfocusBoot({
  id: 'vita-focus-hb',
  defaults: { hb_feed: false, hb_sidebar: false, hb_companies: false },
  rules: {
    hb_feed: `
      .posts-list,
      article.tm-articles-list__item,
      .feed,
      .post_item
    `,
    hb_sidebar: `
      .sidebar-block,
      aside.tm-layout-sidebar,
      .sidebar-right
    `,
    hb_companies: `
      a[href="/companies/"],
      a[href^="/ru/companies"],
      .companies-promo
    `,
  },
  beforeTick(s) {
    if (!s.hb_companies) return;
    if (/^\/(ru\/)?companies/.test(location.pathname)) location.replace('/');
  },
});
