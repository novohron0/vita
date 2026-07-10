/* Общий раннер для content scripts Vita Focus */
function vfocusBoot({ id, defaults, rules, extraCss, beforeTick }) {
  let settings = { ...defaults };
  let styleEl = null;
  let tickScheduled = false;

  function applyCss() {
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = id;
      (document.head || document.documentElement).appendChild(styleEl);
    }
    const blocks = [];
    for (const [key, sel] of Object.entries(rules)) {
      if (settings[key]) {
        blocks.push(`${sel.trim().split(/\s*,\s*/).join(', ')} { display: none !important; visibility: hidden !important; }`);
      }
    }
    const extra = extraCss?.(settings);
    if (extra) blocks.push(extra);
    styleEl.textContent = blocks.join('\n');
  }

  function tick() {
    tickScheduled = false;
    beforeTick?.(settings);
    applyCss();
  }

  function scheduleTick() {
    if (tickScheduled) return;
    tickScheduled = true;
    requestAnimationFrame(tick);
  }

  async function loadSettings() {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'vfocus:get' });
      if (res) settings = { ...defaults, ...res };
    } catch {
      settings = { ...defaults };
    }
    tick();
  }

  chrome.runtime.onMessage.addListener(msg => {
    if (msg?.type === 'vfocus:settings') loadSettings();
  });

  const obs = new MutationObserver(scheduleTick);
  function watch() {
    tick();
    if (document.body) obs.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watch, { once: true });
  } else {
    watch();
  }
  loadSettings();
  setInterval(loadSettings, 60000);
}
