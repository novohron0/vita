/* Vita Focus — минимальная панель, которая работает даже при сбое полной UI. */
(function () {
  'use strict';

  const api = globalThis.browser || globalThis.chrome;
  if (!api) return;
  if (!globalThis.chrome) globalThis.chrome = api;

  const TOGGLES = [
    { id: 'yt_shorts', label: 'Убрать Shorts', desc: 'Вкладка, полки и короткие видео' },
    { id: 'yt_recs', label: 'Убрать рекомендации', desc: 'Очистить главную и лишние подборки' },
    { id: 'yt_blur', label: 'Размыть превью', desc: 'Серый blur вместо картинок' },
    { id: 'yt_thumbs', label: 'Только текст', desc: 'Без превью — только названия' },
    { id: 'yt_related', label: 'Похожие видео', desc: 'Скрыть рекомендации под плеером' },
  ];
  const DEFAULTS = { yt_shorts: false, yt_recs: false };
  let settings = { ...DEFAULTS };
  let running = true;
  let masterBound = false;

  const byId = id => document.getElementById(id);

  async function readSettings() {
    try {
      const local = await api.storage.local.get('settings');
      if (local?.settings) return { ...DEFAULTS, ...local.settings };
      const sync = await api.storage.sync.get('settings');
      return { ...DEFAULTS, ...(sync?.settings || {}) };
    } catch {
      return { ...DEFAULTS };
    }
  }

  async function writeSettings(next) {
    settings = next;
    const patch = { settings, settingsRev: Date.now() };
    await api.storage.local.set(patch);
    try { await api.storage.sync.set(patch); } catch { /* local — источник истины */ }
  }

  async function commitSettings(next) {
    const changed = Object.keys(next).filter(id => next[id] !== settings[id]);
    const turningOff = changed.filter(id => settings[id] && !next[id]);
    const store = globalThis.VFocusStorage;

    if (store && turningOff.length) {
      const pin = await store.getPinState();
      if (pin.enabled && pin.hash) {
        showStatus('Защита включена — открой полную панель и введи пароль', true);
        return false;
      }
      if (await store.getCooldownHours() > 0) {
        for (const id of turningOff) await store.setSetting(id, false);
        settings = await store.getSettings();
        showStatus('Старый режим снимется после задержки', false);
        return false;
      }
    }

    if (store) {
      const patch = Object.fromEntries(changed.map(id => [id, next[id]]));
      settings = await store.setSettings(patch);
    } else {
      await writeSettings(next);
    }
    return true;
  }

  async function notifyPage() {
    try {
      const store = globalThis.VFocusStorage;
      let effective = null;
      if (store) {
        try { effective = await store.getEffectiveSettings(); } catch { /* background will retry */ }
      }
      const message = effective
        ? { type: 'vfocus:settings', settings: effective }
        : { type: 'vfocus:settings' };
      api.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
        if (tab?.id != null) api.tabs.sendMessage(tab.id, message).catch(() => {});
      }).catch(() => {});
      api.runtime.sendMessage({ type: 'vfocus:broadcast' }).catch(() => {});
    } catch { /* страница применит настройки при обновлении */ }
  }

  function updateHeader() {
    const count = TOGGLES.filter(t => settings[t.id]).length;
    const meta = byId('siteMeta');
    const master = byId('siteMaster');
    const label = byId('masterLabel');
    if (meta) meta.textContent = count ? `${count} из ${TOGGLES.length} включено` : 'все блокировки выключены';
    if (master) {
      master.classList.toggle('on', count > 0);
      master.classList.toggle('part', count > 0 && count < TOGGLES.length);
    }
    if (label) label.textContent = count === TOGGLES.length ? 'Фокус вкл' : count ? `${count}/${TOGGLES.length}` : 'Фокус выкл';
  }

  async function toggleOne(row) {
    const id = row.dataset.id;
    const next = { ...settings, [id]: !settings[id] };
    if (next[id] && id === 'yt_thumbs') {
      next.yt_blur = false;
      next.yt_recs = false;
    }
    if (next[id] && id === 'yt_blur') next.yt_thumbs = false;
    if (next[id] && id === 'yt_recs') next.yt_thumbs = false;
    try {
      await commitSettings(next);
      render();
      notifyPage();
    } catch {
      showStatus('Не удалось сохранить настройку', true);
    }
  }

  function showStatus(text, isError = false) {
    const status = byId('pageStatus');
    if (!status) return;
    status.textContent = text;
    status.className = `page-status ${isError ? 'off' : 'ok'}`;
    status.hidden = false;
  }

  async function checkPage() {
    try {
      const [tab] = await api.tabs.query({ active: true, currentWindow: true });
      if (!running || !tab?.id || !/youtube\.com/i.test(tab.url || '')) return;
      const result = await api.tabs.sendMessage(tab.id, { type: 'vfocus:youtube-ping' });
      if (!running) return;
      if (result?.ok) {
        const status = byId('pageStatus');
        if (status) status.hidden = true;
      }
    } catch {
      if (running) showStatus('Разреши Vita Focus доступ к YouTube и обнови страницу', true);
    }
  }

  async function toggleAll() {
    const on = !TOGGLES.some(t => settings[t.id]);
    const next = { ...settings };
    TOGGLES.forEach(t => { next[t.id] = on; });
    if (on) {
      next.yt_recs = false;
      next.yt_blur = false;
    }
    try {
      await commitSettings(next);
      render();
      notifyPage();
    } catch {
      showStatus('Не удалось сохранить настройки', true);
    }
  }

  function bindMaster() {
    const master = byId('siteMaster');
    if (!master || masterBound) return;
    master.addEventListener('click', toggleAll);
    masterBound = true;
  }

  function render(message) {
    if (!running) return;
    const box = byId('rows');
    if (!box) return;
    box.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'group-card';
    TOGGLES.forEach(toggle => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `row${settings[toggle.id] ? ' on' : ''}`;
      row.dataset.id = toggle.id;
      row.innerHTML = `<span class="row-txt"><b>${toggle.label}</b><span>${toggle.desc}</span></span><span class="sw"></span>`;
      row.addEventListener('click', () => toggleOne(row));
      card.appendChild(row);
    });
    box.appendChild(card);
    updateHeader();
    bindMaster();
    if (message) showStatus(message, true);
  }

  function stop() {
    running = false;
    const master = byId('siteMaster');
    if (master && masterBound) master.removeEventListener('click', toggleAll);
    masterBound = false;
  }

  globalThis.VFocusFallback = { render, stop };
  render();
  readSettings().then(value => {
    settings = value;
    render();
    checkPage();
  });
})();
