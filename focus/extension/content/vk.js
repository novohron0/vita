vfocusBoot({
  id: 'vita-focus-vk',
  defaults: { vk_feed: false, vk_clips: false, vk_stories: false, vk_recommend: false },
  rules: {
    vk_feed: `
      #feed_rows,
      .feed_wall--no-islands,
      .feed_row,
      #page_wall_posts
    `,
    vk_clips: `
      a[href*="/clips"],
      .ShortVideoTabs,
      .VideoSection__shortVideos
    `,
    vk_stories: `
      #stories_avatars,
      .stories_feed_wrap,
      .stories_list
    `,
    vk_recommend: `
      .feed_recommended,
      .ui_gallery,
      .feed_post_recommendation
    `,
  },
  beforeTick(s) {
    if (!s.vk_clips) return;
    if (/\/clips(\/|$)/.test(location.pathname)) location.replace('/feed');
  },
});
