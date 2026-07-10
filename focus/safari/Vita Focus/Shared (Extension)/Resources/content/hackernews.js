vfocusBoot({
  id: 'vita-focus-hn',
  defaults: { hn_comments: false, hn_ask: false, hn_show: false },
  rules: {
    hn_comments: `
      .commtext,
      .comment-tree,
      table.comment-tree,
      td.default .comtr
    `,
    hn_ask: `
      a[href="/ask"],
      a[href^="/ask?"]
    `,
    hn_show: `
      a[href="/show"],
      a[href^="/show?"]
    `,
  },
  beforeTick(s) {
    const p = location.pathname;
    if (s.hn_ask && /^\/ask/.test(p)) location.replace('/news');
    if (s.hn_show && /^\/show/.test(p)) location.replace('/news');
  },
});
