vfocusBoot({
  id: 'vita-focus-pin',
  defaults: { pin_home: false, pin_ideas: false, pin_shopping: false },
  rules: {
    pin_home: `
      [data-test-id="homefeed"],
      main [data-test-id="pin"],
      div[data-test-id="pin-masonry"]
    `,
    pin_ideas: `
      a[href="/ideas/"],
      a[href^="/ideas"],
      [data-test-id="ideas-tab"]
    `,
    pin_shopping: `
      a[href="/shopping/"],
      a[href^="/shopping"],
      [data-test-id="shopping-tab"]
    `,
  },
  beforeTick(s) {
    if (s.pin_ideas && /^\/ideas/.test(location.pathname)) location.replace('/');
    if (s.pin_shopping && /^\/shopping/.test(location.pathname)) location.replace('/');
  },
});
