import { getSettings, setSetting } from '../shared/storage.js';

const REGISTRY_URL = chrome.runtime.getURL('shared/registry.json');

const $ = s => document.querySelector(s);
let sites = [];
let active = 'youtube';
let settings = {};

async function init() {
  const r = await fetch(REGISTRY_URL);
  const data = await r.json();
  sites = data.sites;
  settings = await getSettings();
  const stored = await chrome.storage.sync.get('activeSite');
  if (stored.activeSite && sites.some(s => s.id === stored.activeSite)) active = stored.activeSite;
  buildTabs();
  renderRows();
  updateScore();
}

function allToggles() {
  return sites.flatMap(s => s.toggles);
}

function buildTabs() {
  const nav = $('#tabs');
  nav.innerHTML = '';
  sites.forEach(s => {
    const b = document.createElement('button');
    b.className = 'tab' + (s.id === active ? ' on' : '');
    b.textContent = `${s.glyph} ${s.name}`;
    b.addEventListener('click', () => {
      active = s.id;
      chrome.storage.sync.set({ activeSite: active });
      buildTabs();
      renderRows();
    });
    nav.appendChild(b);
  });
}

function renderRows() {
  const site = sites.find(s => s.id === active);
  const box = $('#rows');
  box.innerHTML = '';
  if (!site) return;
  site.toggles.forEach(t => {
    const on = !!settings[t.id];
    const row = document.createElement('div');
    row.className = 'row' + (on ? ' on' : '');
    row.innerHTML = `<div><b>${t.label}</b><span>${t.desc}</span></div><div class="sw"></div>`;
    row.addEventListener('click', async () => {
      const next = !settings[t.id];
      settings = await setSetting(t.id, next);
      row.classList.toggle('on', next);
      updateScore();
    });
    box.appendChild(row);
  });
}

function updateScore() {
  const total = allToggles().length;
  const act = allToggles().filter(t => settings[t.id]).length;
  $('#score').textContent = `${act} / ${total}`;
}

init();
