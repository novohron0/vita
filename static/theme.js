/* Тема: localStorage + prefers-color-scheme, без мигания при загрузке */
(function () {
  const stored = localStorage.getItem('vita-theme');
  const light = stored === 'light'
    || (stored !== 'dark' && matchMedia('(prefers-color-scheme: light)').matches);
  if (light) document.documentElement.dataset.theme = 'light';
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = light ? '#f4f1ec' : '#000000';
})();

function syncThemeToggle(btn) {
  const light = document.documentElement.dataset.theme === 'light';
  btn.classList.toggle('is-light', light);
  btn.setAttribute('aria-label', light ? 'Тёмная тема' : 'Светлая тема');
  btn.setAttribute('aria-pressed', light ? 'true' : 'false');
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = light ? '#f4f1ec' : '#000000';
}

document.addEventListener('DOMContentLoaded', () => {
  const header = document.querySelector('header');
  if (!header || header.querySelector('.theme-toggle')) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'theme-toggle';
  btn.innerHTML = '<span class="theme-track" aria-hidden="true">'
    + '<span class="theme-ico theme-sun"></span>'
    + '<span class="theme-ico theme-moon"></span>'
    + '<span class="theme-knob"></span></span>';

  const nav = header.querySelector('.nav');
  if (nav) {
    const wrap = document.createElement('div');
    wrap.className = 'head-r';
    header.insertBefore(wrap, nav);
    wrap.append(btn, nav);
  } else {
    btn.style.marginLeft = 'auto';
    header.append(btn);
  }

  syncThemeToggle(btn);
  btn.addEventListener('click', () => {
    const light = document.documentElement.dataset.theme === 'light';
    if (light) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('vita-theme', 'dark');
    } else {
      document.documentElement.dataset.theme = 'light';
      localStorage.setItem('vita-theme', 'light');
    }
    syncThemeToggle(btn);
  });
});
