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

  const pill = header.querySelector('.head-pill');
  const nav = header.querySelector('.nav');
  if (pill) {
    pill.append(btn);   // переключатель всегда с краю: логотип — ссылки — тема
  } else if (nav) {
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


/* Шапка-островок и появление блоков на прокрутке.
   Живут здесь, а не в app.js: тогда они одинаковы на всех страницах, а не
   только на главной. Цель ставит скролл, ведёт к ней кадровый цикл —
   на айфоне события прокрутки во время инерции приходят рывками. */
(function () {
  const pill = document.querySelector('.head-pill');
  const RISE = '.step, .stats, .controls > .field, .controls > .primary,'
    + ' .controls > .hint, .buy-price, .buy-list, .buy-form, .setup-foot';
  let target = 0, now = 0, raf = 0;
  let rising = [];

  function tick() {
    now += (target - now) * 0.16;
    if (Math.abs(target - now) < 0.0015) now = target;
    pill.style.setProperty('--k', now.toFixed(4));
    raf = now === target ? 0 : requestAnimationFrame(tick);
  }

  function aim() {
    if (!pill) return;
    target = Math.min(1, Math.max(0, (scrollY || 0) / 380));
    if (target !== now && !raf) raf = requestAnimationFrame(tick);
  }

  function lift() {
    if (!rising.length) return;
    const vh = (window.visualViewport ? visualViewport.height : innerHeight);
    rising = rising.filter(el => {
      const box = el.getBoundingClientRect();
      if (!box.height) return true;          // скрытый блок дождётся своего часа
      if (box.top > vh * 0.94) return true;
      el.classList.add('in');
      return false;
    });
  }

  function onScroll() {
    aim();
    lift();
    document.body.classList.toggle('scrolled', (scrollY || 0) > 12);
  }

  document.addEventListener('DOMContentLoaded', () => {
    // на главной своим появлением заведует app.js — он знает про скрытые поля
    if (!document.getElementById('headPill')) {
      rising = [...document.querySelectorAll(RISE)];
      for (const el of rising) el.classList.add('reveal');
      setTimeout(lift, 60);
    }
    onScroll();
  });
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('touchmove', onScroll, { passive: true });
})();
