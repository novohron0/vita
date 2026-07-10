vfocusBoot({
  id: 'vita-focus-tg',
  defaults: { tg_stories: false, tg_suggest: false, tg_archived: false },
  rules: {
    tg_stories: `
      .stories-container,
      .StoryToggler,
      .story-circle,
      .story-item,
      [class*="StoryRibbon"],
      .stories-list
    `,
    tg_suggest: `
      .chat-list .chat-item.is-muted-for-unread,
      .search-section .search-suggestion,
      .LeftColumn .MenuItem .badge,
      .chat-list .ListItem.chat-item-clickable .status
    `,
    tg_archived: `
      .LeftColumn .ArchivedChats,
      .chat-folders .Tab--archived,
      [class*="ArchivedFolders"]
    `,
  },
});
