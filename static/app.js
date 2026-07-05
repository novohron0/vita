// Превью и скачивание рендерятся на канвасе 1:1 с серверным рендером (app/render.py).
const W = 1179, H = 2556, GAP = 0.45, LIFE_YEARS = 90;

const COLORS = ['#f2f2f2', '#1c1c1e', '#3da9fc', '#34c759', '#ff9500', '#c7c7cc', '#a78bfa', '#ff6b81', '#ff5fa2'];
const BGS = { black: '#000000', white: '#f4f1ec', navy: '#0d1526' };
const TITLES = { month: 'ТВОЙ МЕСЯЦ', year: 'ТВОЙ ГОД', life: 'ТВОЯ ЖИЗНЬ', goal: 'ДО ЦЕЛИ' };
const STAT_LABELS = {
  month: ['дней позади', 'впереди'],
  year: ['дней позади', 'впереди'],
  life: ['недель прожито', 'впереди'],
  goal: ['дней прошло', 'осталось'],
};

const todayISO = new Date().toISOString().slice(0, 10);
const plus30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);

const state = {
  mode: 'month', color: '#f2f2f2', bg: 'black', shape: 'circle',
  title: TITLES.month, footer: true, birth: '2000-01-01',
  start: todayISO, end: plus30,
};
let customTitle = false;

const $ = id => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');
const cv2 = $('cv2'), ctx2 = cv2.getContext('2d');

const rgb = hx => [1, 3, 5].map(i => parseInt(hx.slice(i, i + 2), 16));
const blend = (fg, bg, a) => {
  const f = rgb(fg), b = rgb(bg);
  return `rgb(${f.map((v, i) => Math.round(v * a + b[i] * (1 - a))).join(',')})`;
};
const lum = hx => {
  const [r, g, b] = rgb(hx);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};

function counts() {
  const now = new Date();
  if (state.mode === 'month') {
    const total = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return { total, done: now.getDate() - 1, current: now.getDate() - 1 };
  }
  if (state.mode === 'year') {
    const doy = Math.floor((now - new Date(now.getFullYear(), 0, 1)) / 864e5) + 1;
    const total = new Date(now.getFullYear(), 1, 29).getDate() === 29 ? 366 : 365;
    return { total, done: doy - 1, current: doy - 1 };
  }
  if (state.mode === 'goal') {
    const start = new Date(state.start), end = new Date(state.end);
    const total = Math.max(1, Math.round((end - start) / 864e5));
    const done = Math.min(Math.max(Math.floor((now - start) / 864e5), 0), total);
    return { total, done, current: done < total ? done : null };
  }
  const total = LIFE_YEARS * 52;
  const birth = new Date(state.birth || '2000-01-01');
  const done = Math.min(total, Math.max(0, Math.floor((now - birth) / (7 * 864e5))));
  return { total, done, current: done < total ? done : null };
}

function gridCols(total) {
  if (state.mode === 'goal') return total <= 42 ? 6 : total <= 120 ? 10 : 14;
  return { month: 6, year: 14, life: 52 }[state.mode];
}

function weeksWord(n) {
  if (n % 100 >= 11 && n % 100 <= 14) return 'недель';
  if (n % 10 === 1) return 'неделя';
  if (n % 10 >= 2 && n % 10 <= 4) return 'недели';
  return 'недель';
}

function footerText(total, done) {
  const fmt = n => n.toLocaleString('ru-RU');
  if (state.mode === 'life') return `${fmt(done)} ${weeksWord(done)} прожито · ${fmt(total - done)} впереди`;
  if (state.mode === 'goal') return `прошло ${done} · осталось ${total - done}`;
  return `день ${Math.min(done + 1, total)} из ${total}`;
}

function dotPath(x, y, d) {
  ctx.beginPath();
  if (state.shape === 'square') ctx.rect(x, y, d, d);
  else if (state.shape === 'rounded') ctx.roundRect(x, y, d, d, d * 0.3);
  else ctx.arc(x + d / 2, y + d / 2, d / 2, 0, Math.PI * 2);
}

function drawWatermark(cx, cy, fill) {
  const r = 5, dx = 17, dy = 15;
  ctx.font = '400 32px -apple-system, system-ui, sans-serif';
  const textW = ctx.measureText('vita').width;
  const dotsW = 2 * dx + 2 * r;
  const x = cx - (dotsW + 14 + textW) / 2;
  ctx.fillStyle = fill;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
    ctx.beginPath();
    ctx.arc(x + r + i * dx, cy + (j - 0.5) * dy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.textAlign = 'left';
  ctx.fillText('vita', x + dotsW + 14, cy);
  ctx.textAlign = 'center';
}

function draw() {
  const bgHex = BGS[state.bg];
  const empty = blend(state.color, bgHex, 0.18);
  const text = state.bg === 'white' ? '#8a857a' : '#8e8e8e';
  const { total, done, current } = counts();
  const cols = gridCols(total), rows = Math.ceil(total / cols);

  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, W, H);

  let dot = Math.min(W * 0.72 / (cols + (cols - 1) * GAP), H * 0.50 / (rows + (rows - 1) * GAP));
  if (cols <= 10) dot = Math.min(dot, 110);
  const gap = dot * GAP;
  const gridW = cols * dot + (cols - 1) * gap, gridH = rows * dot + (rows - 1) * gap;
  const x0 = (W - gridW) / 2, y0 = H * 0.55 - gridH / 2;

  for (let i = 0; i < total; i++) {
    const x = x0 + (i % cols) * (dot + gap), y = y0 + Math.floor(i / cols) * (dot + gap);
    dotPath(x, y, dot);
    if (i < done) {
      ctx.fillStyle = state.color;
      ctx.fill();
    } else if (current !== null && i === current) {
      ctx.strokeStyle = state.color;
      ctx.lineWidth = Math.max(2, dot * 0.09);
      ctx.stroke();
    } else {
      ctx.fillStyle = empty;
      ctx.fill();
    }
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (state.title.trim()) {
    ctx.fillStyle = state.color;
    ctx.font = '600 64px -apple-system, "SF Pro Display", system-ui, sans-serif';
    ctx.fillText(state.title.trim().toUpperCase(), W / 2, y0 - 190);
  }
  drawWatermark(W / 2, y0 - 110, text);
  if (state.footer) {
    ctx.fillStyle = text;
    ctx.font = '400 40px -apple-system, system-ui, sans-serif';
    ctx.fillText(footerText(total, done), W / 2, y0 + gridH + 130);
  }

  const fmt = n => n.toLocaleString('ru-RU');
  const [l1, l2] = STAT_LABELS[state.mode];
  $('stat1').textContent = fmt(done);
  $('stat1l').textContent = l1;
  $('stat2').textContent = fmt(total - done);
  $('stat2l').textContent = l2;

  ctx2.drawImage(cv, 0, 0);
}

// мини-превью в углу, пока большой телефон не виден — не нужно мотать вверх
const phoneEl = document.querySelector('.phone');
function updateMini() {
  $('mini').classList.toggle('show', phoneEl.getBoundingClientRect().bottom < 40);
}
addEventListener('scroll', updateMini, { passive: true });
addEventListener('resize', updateMini, { passive: true });

$('mini').addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// --- контролы ---

function bindSeg(id, apply) {
  const seg = $(id);
  seg.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === btn));
    apply(btn.dataset.v);
    draw();
  });
}

bindSeg('mode', v => {
  state.mode = v;
  $('birthRow').hidden = v !== 'life';
  $('goalRow').hidden = v !== 'goal';
  if (!customTitle) {
    state.title = TITLES[v];
    $('title').value = state.title;
  }
});
bindSeg('shape', v => { state.shape = v; });
bindSeg('footer', v => { state.footer = v === '1'; });
bindSeg('bg', v => {
  state.bg = v;
  refreshSwatches();
});

// цвета, сливающиеся с фоном, отключаем; если выбранный стал недоступен — берём первый доступный
// порог 0.13: серый на белом ещё читается, чёрный на чёрном уже нет
const usable = c => Math.abs(lum(c) - lum(BGS[state.bg])) >= 0.13;

function refreshSwatches() {
  const btns = [...$('colors').querySelectorAll('.swatch')];
  for (const b of btns) b.disabled = !usable(b.dataset.v);
  if (!usable(state.color)) {
    const first = btns.find(b => !b.disabled);
    state.color = first.dataset.v;
    btns.forEach(b => b.classList.toggle('on', b === first));
  }
}

const swatches = $('colors');
for (const c of COLORS) {
  const b = document.createElement('button');
  b.className = 'swatch' + (c === state.color ? ' on' : '');
  b.style.background = c;
  b.dataset.v = c;
  swatches.appendChild(b);
}
swatches.addEventListener('click', e => {
  const btn = e.target.closest('.swatch');
  if (!btn || btn.disabled) return;
  swatches.querySelectorAll('.swatch').forEach(s => s.classList.toggle('on', s === btn));
  state.color = btn.dataset.v;
  draw();
});

// любое ручное изменение (включая полное стирание) — воля юзера, дефолт не навязываем
$('title').addEventListener('input', e => {
  customTitle = true;
  state.title = e.target.value;
  draw();
});

$('birth').addEventListener('change', e => {
  state.birth = e.target.value || '2000-01-01';
  draw();
});

$('goalStart').value = state.start;
$('goalEnd').value = state.end;
$('goalStart').addEventListener('change', e => { state.start = e.target.value || todayISO; draw(); });
$('goalEnd').addEventListener('change', e => { state.end = e.target.value || plus30; draw(); });

$('dl').addEventListener('click', () => {
  cv.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'vita.png';
    a.click();
    URL.revokeObjectURL(a.href);
  });
});

$('getBtn').addEventListener('click', () => { $('modal').hidden = false; });
$('modalClose').addEventListener('click', () => { $('modal').hidden = true; });
$('modal').addEventListener('click', e => { if (e.target === $('modal')) $('modal').hidden = true; });

$('ideaSend').addEventListener('click', async () => {
  const btn = $('ideaSend'), err = $('ideaErr');
  btn.disabled = true;
  err.hidden = true;
  try {
    const res = await fetch('/api/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: state.mode, color: state.color, bg: state.bg, shape: state.shape,
        title: state.title, footer: state.footer, birth: state.birth,
        start: state.start, end: state.end,
        idea: $('idea').value, contact: $('contact').value,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      err.textContent = data.detail || 'Что-то пошло не так — попробуй ещё раз';
      err.hidden = false;
      return;
    }
    window.location.href = data.setup;
  } catch {
    err.textContent = 'Нет связи с сервером — попробуй ещё раз';
    err.hidden = false;
  } finally {
    btn.disabled = false;
  }
});

draw();
