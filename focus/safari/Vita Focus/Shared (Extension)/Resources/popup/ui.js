/** Registry-driven popup UI helpers. */

export const GROUP_ORDER = ['main', 'watch', 'feed', 'visual', 'filter'];

export function hostMatch(host, pattern) {
  const h = host.replace(/^www\./, '');
  const p = pattern.replace(/^www\./, '');
  return h === p || h.endsWith('.' + p);
}

export function siteFromUrl(url, sites) {
  if (!url?.startsWith('http')) return null;
  const host = new URL(url).hostname;
  return sites.find(s => (s.hosts || []).some(h => hostMatch(host, h))) || null;
}

export function pageContext(url, siteId) {
  if (!url?.startsWith('http') || !siteId) return '';
  try {
    const u = new URL(url);
    if (siteId === 'youtube') {
      if (u.pathname.startsWith('/shorts')) return 'Shorts';
      if (u.pathname.startsWith('/watch')) return 'Видео';
      if (u.pathname === '/feed/subscriptions') return 'Подписки';
      if (u.pathname === '/' || u.pathname === '/feed') return 'Главная';
    }
    if (siteId === 'instagram' && u.pathname.startsWith('/reels')) return 'Reels';
    if (siteId === 'tiktok' && u.pathname === '/') return 'For You';
    if (siteId === 'x' && (u.pathname === '/home' || u.pathname === '/')) return 'Лента';
  } catch { /* ignore */ }
  return '';
}

export function featuredSites(sites, ui) {
  const ids = ui?.featuredSiteIds || ['youtube'];
  const ordered = ids.map(id => sites.find(s => s.id === id)).filter(Boolean);
  const rest = sites.filter(s => !ids.includes(s.id));
  return { featured: ordered, rest };
}

export function siteCount(site, settings) {
  return site.toggles.filter(t => settings[t.id]).length;
}

export function totalActive(sites, settings) {
  const all = sites.flatMap(s => s.toggles);
  return all.filter(t => settings[t.id]).length;
}

export function groupToggles(site, groupLabels = {}) {
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
    const label = groupLabels[id] ?? (id === 'main' ? null : id);
    out.push({ id, label, toggles });
  }
  return out;
}

export function masterState(site, settings) {
  const ids = site.toggles.map(t => t.id);
  const on = ids.filter(id => settings[id]).length;
  if (!on) return 'off';
  if (on === ids.length) return 'on';
  return 'partial';
}

export function el(tag, cls, html) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (html != null) node.innerHTML = html;
  return node;
}

export function makeRow(toggle, on) {
  const row = el('div', 'row' + (on ? ' on' : ''));
  row.dataset.id = toggle.id;
  row.innerHTML = `<div class="row-txt"><b>${toggle.label}</b><span>${toggle.desc || ''}</span></div><div class="sw"></div>`;
  return row;
}

export function moveTabIndicator(tabsNav, activeId) {
  const tab = tabsNav.querySelector(`.tab[data-id="${activeId}"]`);
  const ind = tabsNav.querySelector('.tab-ind');
  if (!tab || !ind) return;
  ind.style.width = `${tab.offsetWidth}px`;
  ind.style.transform = `translateX(${tab.offsetLeft - 5}px)`;
  tab.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
}
