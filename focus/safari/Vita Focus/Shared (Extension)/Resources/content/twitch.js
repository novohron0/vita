vfocusBoot({
  id: 'vita-focus-tw',
  defaults: { tw_rec: false, tw_clips: false, tw_sidebar: false, tw_browse: false },
  rules: {
    tw_rec: `
      [data-a-target="home-carousel"],
      [data-a-target="recommended-streams"],
      section[data-a-target="recommended-streams"],
      .home-carousel
    `,
    tw_clips: `
      a[data-a-target="top-nav-clip-link"],
      [data-a-target="clips-carousel"],
      a[href*="/clips"]
    `,
    tw_sidebar: `
      [data-a-target="side-nav-bar"] [data-a-target="recommended-channels"],
      [class*="side-nav"] [class*="recommended"],
      aside [data-a-target="followed-channels"] ~ section
    `,
    tw_browse: `
      a[data-a-target="browse-link"],
      a[href="/directory"]
    `,
  },
  beforeTick(s) {
    if (!s.tw_browse) return;
    if (/^\/directory/.test(location.pathname)) location.replace('/');
  },
});
