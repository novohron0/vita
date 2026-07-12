/* auto: Safari iOS popup shim */
"use strict";
if (typeof globalThis.browser !== 'undefined' && typeof globalThis.chrome === 'undefined') {
  globalThis.chrome = globalThis.browser;
}
/** Registry-driven popup UI — SocialFocus / UnTrap pattern. */

const GROUP_ORDER = ['main', 'watch', 'feed', 'visual', 'filter'];

function hostMatch(host, pattern) {
  const h = host.replace(/^www\./, '');
  const p = pattern.replace(/^www\./, '');
  return h === p || h.endsWith('.' + p);
}

function siteFromUrl(url, sites) {
  if (!url?.startsWith('http')) return null;
  const host = new URL(url).hostname;
  return sites.find(s => (s.hosts || []).some(h => hostMatch(host, h))) || null;
}

function featuredSites(sites, ui) {
  const ids = ui?.featuredSiteIds || ['youtube'];
  const featured = ids.map(id => sites.find(s => s.id === id)).filter(Boolean);
  const rest = sites.filter(s => !ids.includes(s.id));
  return { featured, rest };
}

function visibleToggles(site) {
  const main = site.toggles.filter(t => (t.group || 'main') === 'main');
  return main.length ? main : site.toggles;
}

function siteCount(site, settings, toggles = null) {
  const list = toggles || site.toggles;
  return list.filter(t => settings[t.id]).length;
}

function groupToggles(site, groupLabels = {}) {
  const buckets = new Map();
  site.toggles.forEach(t => {
    const g = t.group || 'main';
    if (!buckets.has(g)) buckets.set(g, []);
    buckets.get(g).push(t);
  });

  const order = [...GROUP_ORDER, ...[...buckets.keys()].filter(g => !GROUP_ORDER.includes(g))];
  const out = [];
  for (const id of order) {
    const toggles = buckets.get(id);
    if (!toggles?.length) continue;
    out.push({
      id,
      label: groupLabels[id] ?? null,
      toggles,
    });
  }
  return out;
}

function splitGroups(site, uiMeta) {
  const groups = groupToggles(site, uiMeta.groupLabels || {});
  const advancedIds = new Set(uiMeta.advancedGroups || ['watch', 'feed', 'visual', 'filter']);
  const primary = groups.filter(g => g.id === 'main' || !advancedIds.has(g.id));
  const advanced = groups.filter(g => advancedIds.has(g.id));
  if (!groups.some(g => g.id === 'main') && groups.length) {
    return { primary: [groups[0]], advanced: groups.slice(1) };
  }
  return { primary, advanced };
}

function el(tag, cls, html) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (html != null) node.innerHTML = html;
  return node;
}

function makeRow(toggle, on) {
  const row = el('div', 'row' + (on ? ' on' : ''));
  row.dataset.id = toggle.id;
  row.innerHTML = `<div class="row-txt"><b>${toggle.label}</b><span>${toggle.desc || ''}</span></div><div class="sw"></div>`;
  return row;
}

function appendGroupCard(parent, { label, toggles }, settings, filterBox) {
  const card = el('div', 'group-card');
  if (label) {
    card.appendChild(el('div', 'group-h', label));
  }
  toggles.forEach(t => {
    card.appendChild(makeRow(t, !!settings[t.id]));
    if (filterBox && t.id === 'yt_keywords') {
      const box = el('div', 'filter-in');
      box.innerHTML = '<input data-filter="kw" type="text" placeholder="Слова через запятую…" spellcheck="false">';
      box.querySelector('input').value = settings.yt_kw || '';
      card.appendChild(box);
    }
    if (filterBox && t.id === 'yt_channels') {
      const box = el('div', 'filter-in');
      box.innerHTML = '<input data-filter="ch" type="text" placeholder="Каналы через запятую…" spellcheck="false">';
      box.querySelector('input').value = settings.yt_ch || '';
      card.appendChild(box);
    }
  });
  parent.appendChild(card);
}

function moveTabIndicator(tabsNav, activeId) {
  const tab = tabsNav.querySelector(`.tab[data-id="${activeId}"]`);
  const ind = tabsNav.querySelector('.tab-ind');
  if (tab) {
    tab.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
    if (ind) {
      ind.style.width = `${tab.offsetWidth}px`;
      ind.style.transform = `translateX(${tab.offsetLeft}px)`;
    }
  }
}

globalThis.VFocusUi = {
  GROUP_ORDER,
  hostMatch,
  siteFromUrl,
  featuredSites,
  visibleToggles,
  siteCount,
  groupToggles,
  splitGroups,
  el,
  makeRow,
  appendGroupCard,
  moveTabIndicator
};
