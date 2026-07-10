vfocusBoot({
  id: 'vita-focus-am',
  defaults: { am_rec: false, am_deals: false, am_sponsored: false },
  rules: {
    am_rec: `
      #rhf,
      #desktop-grid-gwm,
      [data-component-type="s-carousel"],
      .feed-carousel
    `,
    am_deals: `
      a[href*="/deals"],
      a[href*="/goldbox"],
      #nav-deals
    `,
    am_sponsored: `
      .s-sponsored-list-item,
      [data-component-type="sp-sponsored-result"],
      .AdHolder
    `,
  },
});
