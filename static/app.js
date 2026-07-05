// Превью и скачивание рендерятся на канвасе 1:1 с серверным рендером (app/render.py).
const W = 1179, H = 2556, GAP = 0.45, LIFE_YEARS = 90;

const THEMES = {
  obsidian: { bg: '#000000', filled: '#f2f2f2', empty: '#262626', text: '#8e8e8e' },
  ivory:    { bg: '#f4f1e8', filled: '#141414', empty: '#d9d4c7', text: '#8a857a' },
  ocean:    { bg: '#020407', filled: '#4aa8ff', empty: '#0e2338', text: '#57748f' },
  forest:   { bg: '#020604', filled: '#3ddc84', empty: '#0e2c1b', text: '#5e8a71' },
  sunset:   { bg: '#070302', filled: '#ff8c42', empty: '#33190c', text: '#8f6a55' },
};
const COLS = { month: 6, year: 14, life: 52 };
const TITLES = { month: 'ТВОЙ МЕСЯЦ', year: 'ТВОЙ ГОД', life: 'ТВОЯ ЖИЗНЬ' };

const state = { mode: 'month', theme: 'obsidian', shape: 'circle', title: TITLES.month, footer: true, birth: '2000-01-01' };
let customTitle = false;

const $ = id => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');

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
  const total = LIFE_YEARS * 52;
  const birth = new Date(state.birth || '2000-01-01');
  const done = Math.min(total, Math.max(0, Math.floor((now - birth) / (7 * 864e5))));
  return { total, done, current: done < total ? done : null };
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
  return `день ${Math.min(done + 1, total)} из ${total}`;
}

function dotPath(x, y, d) {
  ctx.beginPath();
  if (state.shape === 'square') ctx.rect(x, y, d, d);
  else if (state.shape === 'rounded') ctx.roundRect(x, y, d, d, d * 0.3);
  else ctx.arc(x + d / 2, y + d / 2, d / 2, 0, Math.PI * 2);
}

function draw() {
  const t = THEMES[state.theme];
  const { total, done, current } = counts();
  const cols = COLS[state.mode], rows = Math.ceil(total / cols);

  ctx.fillStyle = t.bg;
  ctx.fillRect(0, 0, W, H);

  let dot = Math.min(W * 0.72 / (cols + (cols - 1) * GAP), H * 0.50 / (rows + (rows - 1) * GAP));
  if (state.mode === 'month') dot = Math.min(dot, 110);
  const gap = dot * GAP;
  const gridW = cols * dot + (cols - 1) * gap, gridH = rows * dot + (rows - 1) * gap;
  const x0 = (W - gridW) / 2, y0 = H * 0.55 - gridH / 2;

  for (let i = 0; i < total; i++) {
    const x = x0 + (i % cols) * (dot + gap), y = y0 + Math.floor(i / cols) * (dot + gap);
    dotPath(x, y, dot);
    if (i < done) {
      ctx.fillStyle = t.filled;
      ctx.fill();
    } else if (current !== null && i === current) {
      ctx.strokeStyle = t.filled;
      ctx.lineWidth = Math.max(2, dot * 0.09);
      ctx.stroke();
    } else {
      ctx.fillStyle = t.empty;
      ctx.fill();
    }
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (state.title.trim()) {
    ctx.fillStyle = t.filled;
    ctx.font = '600 64px -apple-system, "SF Pro Display", system-ui, sans-serif';
    ctx.fillText(state.title.trim().toUpperCase(), W / 2, y0 - 170);
  }
  if (state.footer) {
    ctx.fillStyle = t.text;
    ctx.font = '400 40px -apple-system, system-ui, sans-serif';
    ctx.fillText(footerText(total, done), W / 2, y0 + gridH + 130);
  }
}

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
  if (!customTitle) {
    state.title = TITLES[v];
    $('title').value = state.title;
  }
});
bindSeg('shape', v => { state.shape = v; });
bindSeg('footer', v => { state.footer = v === '1'; });

const swatches = $('themes');
for (const name of Object.keys(THEMES)) {
  const b = document.createElement('button');
  b.className = 'swatch' + (name === state.theme ? ' on' : '');
  b.style.background = THEMES[name].filled;
  b.dataset.v = name;
  b.title = name;
  swatches.appendChild(b);
}
swatches.addEventListener('click', e => {
  const btn = e.target.closest('.swatch');
  if (!btn) return;
  swatches.querySelectorAll('.swatch').forEach(s => s.classList.toggle('on', s === btn));
  state.theme = btn.dataset.v;
  draw();
});

$('title').addEventListener('input', e => {
  customTitle = e.target.value.trim() !== '';
  state.title = customTitle ? e.target.value : TITLES[state.mode];
  if (!customTitle) e.target.value = state.title;
  draw();
});

$('birth').addEventListener('change', e => {
  state.birth = e.target.value || '2000-01-01';
  draw();
});

$('dl').addEventListener('click', () => {
  cv.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'vita.png';
    a.click();
    URL.revokeObjectURL(a.href);
  });
});

$('mklink').addEventListener('click', async () => {
  const btn = $('mklink');
  btn.disabled = true;
  try {
    const res = await fetch('/api/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: state.mode, theme: state.theme, shape: state.shape,
        title: state.title, footer: state.footer, birth: state.birth,
      }),
    });
    const { url } = await res.json();
    $('linkUrl').textContent = url;
    $('linkBox').hidden = false;
    $('copyBtn').onclick = () => navigator.clipboard.writeText(url);
  } finally {
    btn.disabled = false;
  }
});

draw();
