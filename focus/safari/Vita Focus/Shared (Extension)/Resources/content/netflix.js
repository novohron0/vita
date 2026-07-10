vfocusBoot({
  id: 'vita-focus-nf',
  defaults: { nf_browse: false, nf_previews: false, nf_top: false },
  rules: {
    nf_browse: `
      .lolomoRow,
      .slider-item,
      [data-list-context="homepage"]
    `,
    nf_previews: `
      .previewModal-container,
      .billboard-row,
      video.preview--boxart
    `,
    nf_top: `
      [data-list-context="Top10"],
      .top10-row,
      .rowTitle:has(+ .slider) 
    `,
  },
  extraCss(s) {
    if (!s.nf_previews) return '';
    return `video, .preview--boxart { visibility: hidden !important; }`;
  },
});
