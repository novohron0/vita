// Превью и скачивание рендерятся на канвасе 1:1 с серверным рендером (app/render.py).
const W = 1179, H = 2556, GAP = 0.45, LIFE_YEARS = 90;

const COLORS = ['#f2f2f2', '#000000', '#3da9fc', '#34c759', '#ff9500', '#c7c7cc', '#a78bfa', '#ff6b81', '#ff5fa2'];
// base — опорный цвет фона: от него считаются пустые точки и контраст свотчей;
// сцены (закат/горы/океан) рисуются градиентом + силуэтами в paintBG (зеркало render.py)
const BGS = {
  black: '#000000', white: '#f4f1ec', navy: '#0d1526',
  sunset: '#2a1230', mountains: '#0e1520', ocean: '#0a1a2b',
  dembel: '#1a1f14', ramadan: '#0a1228', honeymoon: '#2a1520',
};
const SCENE_GRADS = {
  sunset: [['#331539', 0], ['#4a1c40', .45], ['#1c0d24', 1]],
  mountains: [['#16202e', 0], ['#0e1520', .6], ['#090d13', 1]],
  ocean: [['#0e2138', 0], ['#0a1a2b', .55], ['#062433', 1]],
  dembel: [['#2a3320', 0], ['#3d4a2a', .42], ['#141a0e', 1]],
  ramadan: [['#0f1a3d', 0], ['#1a1445', .48], ['#080e20', 1]],
  honeymoon: [['#4a2038', 0], ['#6b3050', .38], ['#1f1018', 1]],
};
const TITLES = { month: 'ТВОЙ МЕСЯЦ', year: 'ТВОЙ ГОД', life: 'ТВОЯ ЖИЗНЬ', goal: 'ДО ЦЕЛИ' };
const SHAPES = ['circle', 'square', 'rounded', 'heart', 'star', 'diamond', 'hex'];
const BG_TITLES = { dembel: 'ДО ДЕМБЕЛЯ', ramadan: 'МЕСЯЦ РАМАДАН', honeymoon: 'МЕДОВЫЙ МЕСЯЦ' };
const STAT_LABELS = {
  month: ['дней позади', 'впереди'],
  year: ['дней позади', 'впереди'],
  life: ['недель прожито', 'впереди'],
  goal: ['дней прошло', 'осталось'],
};

const todayISO = new Date().toISOString().slice(0, 10);
const plus30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);

const state = {
  mode: 'month', color: '#f2f2f2', bg: 'black', bgImageId: null, shape: 'circle',
  glass: false, title: TITLES.month, footer: true, brand: true, birth: '2000-01-01',
  start: todayISO, end: plus30,
};
let customTitle = false;
let bgAutoTitle = false;
let customBgImg = null;
let customColor = false;

// ——— демо-режим для съёмки рилсов: /?demo[&mode=year&color=%2334c759&bg=black&shape=rounded]
// чистый кадр (только телефон) + бесконечный цикл заполнения всей сетки
const q = new URLSearchParams(location.search);
const DEMO = q.has('demo');
// /?reel — кинематографичный луп: фраза печатается, точка падает в календарь,
// скачет с разгоном, отъезд камеры, монтаж тем, финальная карточка
const REEL = q.has('reel');
// life-рилс заполняет сетку только до «сегодня» (видно прожито/осталось), а не всю
let reelFull = true;
if (REEL) document.body.classList.add('reel');
if (DEMO) {
  document.body.classList.add('demo');
  const m = q.get('mode');
  if (TITLES[m]) { state.mode = m; state.title = TITLES[m]; }
  const c = q.get('color');
  if (/^#[0-9a-fA-F]{6}$/.test(c || '')) state.color = c;
  if (BGS[q.get('bg')]) state.bg = q.get('bg');
  if (SHAPES.includes(q.get('shape'))) state.shape = q.get('shape');
}

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
const easeOutBack = t => { const u = t - 1; return 1 + 3.6 * u * u * u + 2.6 * u * u; };

// фон: сплошной цвет, сцена или своё фото (cover-crop 1:1 с render.py)
function paintBG(c) {
  if (state.bg === 'custom' && customBgImg) {
    const iw = customBgImg.width, ih = customBgImg.height;
    const scale = Math.max(W / iw, H / ih);
    const sw = W / scale, sh = H / scale;
    const sx = (iw - sw) / 2, sy = (ih - sh) / 2;
    c.drawImage(customBgImg, sx, sy, sw, sh, 0, 0, W, H);
    c.fillStyle = 'rgba(0,0,0,0.12)';
    c.fillRect(0, 0, W, H);
    return;
  }
  const key = state.bg, base = BGS[key], stops = SCENE_GRADS[key];
  if (!stops) {
    c.fillStyle = base;
    c.fillRect(0, 0, W, H);
    return;
  }
  const g = c.createLinearGradient(0, 0, 0, H);
  stops.forEach(([col, p]) => g.addColorStop(p, col));
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  const poly = (pts, fill) => {
    c.beginPath();
    pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
    c.closePath(); c.fillStyle = fill; c.fill();
  };
  const circle = (x, y, r, fill) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = fill; c.fill(); };
  const hline = (x1, x2, y, wd, fill) => { c.fillStyle = fill; c.fillRect(x1, y - wd / 2, x2 - x1, wd); };
  const star = (cx, cy, r, fill) => {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.42 : r;
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    poly(pts, fill);
  };
  const crescent = (cx, cy, r, gold, sky) => {
    c.save();
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fillStyle = gold;
    c.fill();
    c.globalCompositeOperation = 'destination-out';
    c.beginPath();
    c.arc(cx + r * 0.38, cy - r * 0.12, r * 0.86, 0, Math.PI * 2);
    c.fill();
    c.restore();
    c.beginPath();
    c.arc(cx - r * 0.08, cy + r * 0.05, r * 0.92, 0, Math.PI * 2);
    c.strokeStyle = blend('#fff8e8', sky, 0.22);
    c.lineWidth = 2;
    c.stroke();
  };
  const lantern = (x, y, base) => {
    const w = 72, h = 96;
    c.strokeStyle = blend('#b8942e', base, 0.55);
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(x, y - 72);
    c.lineTo(x, y - 6);
    c.stroke();
    const body = c.createLinearGradient(x - w / 2, y, x + w / 2, y + h);
    body.addColorStop(0, blend('#a88420', base, 0.65));
    body.addColorStop(0.5, blend('#f5e6b8', base, 0.92));
    body.addColorStop(1, blend('#a88420', base, 0.65));
    c.fillStyle = body;
    c.beginPath();
    c.roundRect(x - w / 2, y, w, h, 10);
    c.fill();
    c.beginPath();
    c.arc(x, y, w / 2, Math.PI, 0);
    c.fill();
    const glow = c.createRadialGradient(x, y + h * 0.45, 4, x, y + h * 0.55, w * 1.1);
    glow.addColorStop(0, blend('#f5e6b8', base, 0.42));
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = glow;
    c.fillRect(x - w * 1.2, y - 20, w * 2.4, h * 2.2);
    c.fillStyle = blend('#f5e6b8', base, 0.28);
    c.beginPath();
    c.moveTo(x - w * 0.35, y + h);
    c.lineTo(x, y + h + 70);
    c.lineTo(x + w * 0.35, y + h);
    c.closePath();
    c.fill();
  };
  const pine = (x, baseH, h, fill) => {
    poly([[x, baseH - h], [x - h * 0.34, baseH - h * 0.42], [x + h * 0.34, baseH - h * 0.42]], fill);
    poly([[x, baseH - h * 0.62], [x - h * 0.28, baseH - h * 0.16], [x + h * 0.28, baseH - h * 0.16]], fill);
    c.fillStyle = fill;
    c.fillRect(x - h * 0.07, baseH - h * 0.14, h * 0.14, h * 0.14);
  };
  if (key === 'mountains') {
    circle(985, 310, 45, blend('#e8eef5', base, 0.5));
    poly([[0, 2556], [0, 2440], [300, 2280], [620, 2470], [830, 2360], [1179, 2520], [1179, 2556]], '#141c28');
    poly([[0, 2556], [150, 2430], [470, 2556]], '#0c1119');
    poly([[560, 2556], [860, 2380], [1179, 2556]], '#0c1119');
  } else if (key === 'ocean') {
    circle(985, 310, 45, blend('#dfe9f2', base, 0.45));
    hline(0, W, 2300, 3, blend('#ffffff', base, 0.14));
    [[150, 2360], [110, 2415], [70, 2470], [40, 2520]].forEach(([w2, yy]) =>
      hline(985 - w2 / 2, 985 + w2 / 2, yy, 8, blend('#dfe9f2', base, 0.16)));
  } else if (key === 'sunset') {
    circle(W / 2, 2730, 400, blend('#ff9b6a', base, 0.32));
    hline(0, W, 2330, 3, blend('#ffb37c', base, 0.20));
  } else if (key === 'dembel') {
    const glow = c.createLinearGradient(0, H * 0.52, 0, H * 0.78);
    glow.addColorStop(0, blend('#c8a86a', base, 0.2));
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = glow;
    c.fillRect(0, H * 0.52, W, H * 0.3);
    [[110, 170, 2], [260, 130, 1.8], [420, 210, 2.2], [640, 150, 1.6], [860, 190, 2], [1020, 120, 1.7], [1120, 240, 1.5]]
      .forEach(([x, y, r]) => circle(x, y, r, blend('#e8e4c8', base, 0.62)));
    star(195, 370, 40, blend('#e8d890', base, 0.72));
    star(1010, 255, 16, blend('#d4cfa0', base, 0.5));
    poly([[0, 2556], [0, 2490], [220, 2490], [220, 2410], [310, 2350], [400, 2410], [400, 2490],
      [580, 2490], [580, 2430], [680, 2370], [780, 2430], [780, 2490], [1179, 2490], [1179, 2556]], '#1c2416');
    [[95, 2490, 110], [720, 2490, 95], [980, 2490, 88]].forEach(([bx, by, bh]) => {
      c.fillStyle = '#222a18';
      c.fillRect(bx, by - bh, 130, bh);
      for (let wy = by - bh + 22; wy < by - 14; wy += 28) {
        for (let wx = bx + 18; wx < bx + 108; wx += 34) {
          c.fillStyle = blend('#f0d878', base, 0.55);
          c.fillRect(wx, wy, 16, 12);
        }
      }
    });
    pine(55, 2490, 130, '#182010');
    pine(1120, 2490, 150, '#161e10');
    pine(890, 2490, 115, '#1a2214');
    hline(0, W, 2518, 3, blend('#5a6a38', base, 0.35));
    for (let i = 0; i < 9; i++) {
      hline(80 + i * 128, 160 + i * 128, 2540, 5, blend('#4a5a30', base, 0.22));
    }
    poly([[940, 2556], [970, 2320], [1000, 2320], [1030, 2556]], '#141a0e');
  } else if (key === 'ramadan') {
    [[90, 160, 1.8], [240, 120, 1.4], [390, 200, 1.6], [540, 95, 1.3], [700, 170, 1.7], [850, 130, 1.5],
      [1000, 210, 1.6], [180, 320, 1.3], [320, 280, 1.2], [620, 340, 1.4], [1080, 320, 1.5]]
      .forEach(([x, y, r]) => circle(x, y, r, blend('#f5e6b8', base, 0.78)));
    crescent(930, 340, 62, blend('#f5e6b8', base, 0.9), base);
    lantern(210, 520, base);
    lantern(980, 560, base);
    poly([[0, 2556], [0, 2510], [1179, 2510], [1179, 2556]], '#080c18');
    c.fillStyle = '#0a0e1c';
    c.fillRect(420, 2440, 340, 116);
    c.beginPath();
    c.ellipse(590, 2440, 118, 72, 0, Math.PI, 0);
    c.fill();
    c.fillRect(455, 2440, 48, 116);
    c.beginPath();
    c.moveTo(479, 2440);
    c.lineTo(467, 2280);
    c.lineTo(491, 2280);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(467, 2280);
    c.lineTo(479, 2250);
    c.lineTo(491, 2280);
    c.closePath();
    c.fill();
    c.fillRect(677, 2460, 38, 96);
    c.beginPath();
    c.moveTo(696, 2460);
    c.lineTo(686, 2320);
    c.lineTo(706, 2320);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(686, 2320);
    c.lineTo(696, 2295);
    c.lineTo(706, 2320);
    c.closePath();
    c.fill();
    c.beginPath();
    c.ellipse(590, 2500, 42, 52, 0, 0, Math.PI * 2);
    c.fillStyle = blend('#f5e6b8', base, 0.18);
    c.fill();
    c.fillStyle = '#0a0e1c';
    c.beginPath();
    c.ellipse(590, 2500, 30, 38, 0, 0, Math.PI * 2);
    c.fill();
  } else if (key === 'honeymoon') {
    circle(W / 2, 2720, 360, blend('#ffb8c8', base, 0.28));
    circle(W / 2, 2740, 280, blend('#ffd4a8', base, 0.22));
    hline(0, W, 2380, 3, blend('#ffb8c8', base, 0.18));
    poly([[120, 2556], [120, 2280], [155, 2180], [190, 2280], [190, 2556]], '#1a0c14');
    poly([[990, 2556], [990, 2300], [1025, 2200], [1060, 2300], [1060, 2556]], '#1a0c14');
    [[200, 2440, 100], [150, 2485, 70], [100, 2520, 50]].forEach(([w2, yy]) =>
      hline(W / 2 - w2 / 2, W / 2 + w2 / 2, yy, 6, blend('#ffb8c8', base, 0.14)));
    circle(340, 520, 18, blend('#ff8fab', base, 0.35));
    circle(358, 520, 14, '#4a2038');
    circle(400, 560, 14, blend('#ff8fab', base, 0.3));
    circle(414, 560, 11, '#4a2038');
  }
}

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

function dotPath(c, x, y, d) {
  const cx = x + d / 2, cy = y + d / 2;
  c.beginPath();
  if (state.shape === 'square') {
    c.rect(x, y, d, d);
  } else if (state.shape === 'rounded') {
    c.roundRect(x, y, d, d, d * 0.3);
  } else if (state.shape === 'heart') {
    for (let deg = 0; deg < 360; deg += 15) {
      const t = deg * Math.PI / 180;
      const hx = 16 * Math.sin(t) ** 3;
      const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      const px = cx + hx * d * 0.032;
      const py = cy + hy * d * 0.032 + d * 0.06;
      deg ? c.lineTo(px, py) : c.moveTo(px, py);
    }
    c.closePath();
  } else if (state.shape === 'star') {
    const r = d * 0.48;
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.42 : r;
      const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
      i ? c.lineTo(px, py) : c.moveTo(px, py);
    }
    c.closePath();
  } else if (state.shape === 'diamond') {
    const r = d * 0.5;
    c.moveTo(cx, cy - r);
    c.lineTo(cx + r, cy);
    c.lineTo(cx, cy + r);
    c.lineTo(cx - r, cy);
    c.closePath();
  } else if (state.shape === 'hex') {
    const r = d * 0.48;
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 3;
      const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
      i ? c.lineTo(px, py) : c.moveTo(px, py);
    }
    c.closePath();
  } else {
    c.arc(cx, cy, d / 2, 0, Math.PI * 2);
  }
}

// Стандарт — как в оригинале; Стандарт 2.0 — жидкое стекло
function classicDot(c, x, y, d, color, mode = 'filled', pulse = 0, isLead = false) {
  const empty = blend(color, effectiveBgHex(), 0.18);
  dotPath(c, x, y, d);
  if (mode === 'filled') {
    c.fillStyle = color;
    c.fill();
  } else if (mode === 'ring') {
    c.strokeStyle = color;
    c.lineWidth = Math.max(2, d * 0.09);
    if (isLead) { c.shadowColor = color; c.shadowBlur = d * 0.6; }
    else if (pulse > 0) { c.shadowColor = color; c.shadowBlur = d * 0.55 * pulse; }
    c.stroke();
    c.shadowBlur = 0;
  } else {
    c.fillStyle = empty;
    c.fill();
  }
}

function glassDot(c, x, y, d, color, mode = 'filled', pulse = 0) {
  const cx = x + d / 2, cy = y + d / 2;
  const [cr, cg, cb] = rgb(color);
  c.save();
  dotPath(c, x, y, d);
  c.clip();
  if (mode === 'empty') {
    const g = c.createRadialGradient(cx - d * 0.22, cy - d * 0.28, 0, cx, cy, d * 0.78);
    g.addColorStop(0, 'rgba(255,255,255,0.34)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0.04)');
    c.fillStyle = g;
    c.fillRect(x, y, d, d);
    const frost = c.createLinearGradient(x, y, x + d, y + d);
    frost.addColorStop(0, 'rgba(255,255,255,0.08)');
    frost.addColorStop(0.5, 'rgba(255,255,255,0)');
    frost.addColorStop(1, 'rgba(255,255,255,0.06)');
    c.fillStyle = frost;
    c.fillRect(x, y, d, d);
  } else if (mode === 'ring') {
    const g = c.createRadialGradient(cx - d * 0.2, cy - d * 0.25, 0, cx, cy, d * 0.76);
    g.addColorStop(0, 'rgba(255,255,255,0.26)');
    g.addColorStop(1, `rgba(${cr},${cg},${cb},0.12)`);
    c.fillStyle = g;
    c.fillRect(x, y, d, d);
  } else {
    const g = c.createRadialGradient(cx - d * 0.32, cy - d * 0.36, d * 0.04, cx, cy, d * 0.82);
    g.addColorStop(0, 'rgba(255,255,255,0.88)');
    g.addColorStop(0.28, `rgba(${Math.min(255, cr + 40)},${Math.min(255, cg + 40)},${Math.min(255, cb + 40)},0.82)`);
    g.addColorStop(0.62, `rgba(${cr},${cg},${cb},0.78)`);
    g.addColorStop(1, `rgba(${Math.round(cr * 0.72)},${Math.round(cg * 0.72)},${Math.round(cb * 0.72)},0.62)`);
    c.fillStyle = g;
    c.fillRect(x, y, d, d);
    const sh = c.createLinearGradient(x, y + d * 0.42, x, y + d);
    sh.addColorStop(0, 'rgba(0,0,0,0)');
    sh.addColorStop(1, 'rgba(0,0,0,0.22)');
    c.fillStyle = sh;
    c.fillRect(x, y, d, d);
    const spec = c.createRadialGradient(cx - d * 0.15, cy - d * 0.22, 0, cx - d * 0.1, cy - d * 0.15, d * 0.28);
    spec.addColorStop(0, 'rgba(255,255,255,0.55)');
    spec.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = spec;
    c.fillRect(x, y, d, d);
  }
  c.restore();
  c.save();
  dotPath(c, x, y, d);
  if (mode === 'ring') {
    c.strokeStyle = color;
    c.lineWidth = Math.max(2, d * 0.09);
    if (pulse > 0) { c.shadowColor = color; c.shadowBlur = d * 0.55 * pulse; }
  } else {
    c.strokeStyle = mode === 'filled' ? 'rgba(255,255,255,0.52)' : 'rgba(255,255,255,0.26)';
    c.lineWidth = Math.max(1, d * 0.065);
  }
  c.stroke();
  c.shadowBlur = 0;
  c.restore();
}

const drawDot = (c, x, y, d, color, mode, pulse, isLead) =>
  state.glass ? glassDot(c, x, y, d, color, mode, pulse)
              : classicDot(c, x, y, d, color, mode, pulse, isLead);

function effectiveBgHex() {
  if (state.bg === 'custom') return '#1a1a1a';
  return BGS[state.bg] || '#000000';
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

function draw(reveal = 1, pulse = 0, fx = null) {
  const text = state.bg === 'white' ? '#8a857a' : '#8e8e8e';
  const { total, done: realDone, current: realCurrent } = counts();
  // демо/рилс: заполняем всю сетку, последняя точка остаётся дышащим кольцом
  const fullDone = (DEMO || (REEL && reelFull)) ? total - 1 : realDone;
  const fullCurrent = (DEMO || (REEL && reelFull)) ? total - 1 : realCurrent;
  // reveal < 1 — точки закрашиваются по одной (анимация загрузки/смены режима);
  // счётчики и подпись бегут вместе с ними
  // fx — прыжковая анимация по тапу: шарик летит по сетке (fx.p — дробный индекс),
  // точки позади него проштампованы, кольцо «сегодня» прячется до приземления
  const done = fx ? Math.min(fullDone, Math.floor(fx.p) + 1)
    : reveal >= 1 ? fullDone : Math.round(fullDone * reveal);
  const current = fx ? null : reveal >= 1 ? fullCurrent : (done < total ? done : null);
  const lead = fx || reveal >= 1 ? -2 : current; // ведущая точка при анимации подсвечивается ярче
  const cols = gridCols(total), rows = Math.ceil(total / cols);

  paintBG(ctx);

  let dot = Math.min(W * 0.72 / (cols + (cols - 1) * GAP), H * 0.50 / (rows + (rows - 1) * GAP));
  if (cols <= 10) dot = Math.min(dot, 110);
  const gap = dot * GAP;
  const gridW = cols * dot + (cols - 1) * gap, gridH = rows * dot + (rows - 1) * gap;
  const x0 = (W - gridW) / 2, y0 = H * 0.55 - gridH / 2;

  for (let i = 0; i < total; i++) {
    const x = x0 + (i % cols) * (dot + gap), y = y0 + Math.floor(i / cols) * (dot + gap);
    let dd = dot;
    if (i < done && fx) {
      const k = Math.min(1, (fx.p - i) * fx.interval / 300);
      if (k < 1) dd = dot * (0.5 + 0.5 * easeOutBack(k));
    }
    const dx = x + (dot - dd) / 2, dy = y + (dot - dd) / 2;
    if (i < done) {
      drawDot(ctx, dx, dy, dd, state.color, 'filled', 0, false);
    } else if (current !== null && i === current) {
      drawDot(ctx, x, y, dot, state.color, 'ring', pulse, i === lead);
    } else {
      drawDot(ctx, x, y, dot, state.color, 'empty', 0, false);
    }
  }

  if (fx) {
    const p = Math.min(fx.p, fx.N);
    const i0 = Math.floor(p), i1 = Math.min(i0 + 1, fx.N), frac = p - i0;
    const cx = i => x0 + (i % cols) * (dot + gap) + dot / 2;
    const cy = i => y0 + Math.floor(i / cols) * (dot + gap) + dot / 2;
    const hop = Math.max(dot * 0.9, Math.hypot(cx(i1) - cx(i0), cy(i1) - cy(i0)) * 0.22);
    const lx = cx(i0) + (cx(i1) - cx(i0)) * frac;
    const ly = cy(i0) + (cy(i1) - cy(i0)) * frac - hop * Math.sin(Math.PI * frac);
    drawDot(ctx, lx - dot / 2, ly - dot / 2, dot, state.color, 'filled', 0, false);
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (state.title.trim()) {
    ctx.fillStyle = state.color;
    ctx.font = '600 64px -apple-system, "SF Pro Display", system-ui, sans-serif';
    ctx.fillText(state.title.trim().toUpperCase(), W / 2, y0 - 190);
  }
  if (state.brand) drawWatermark(W / 2, y0 - 110, text);
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

// точки закрашиваются по одной при загрузке и смене режима — «оживает» на глазах
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let revealRAF = null, jumpRAF = null;
function animateReveal(dur = 1150) {
  cancelAnimationFrame(revealRAF);
  cancelAnimationFrame(pulseRAF);
  cancelAnimationFrame(jumpRAF);
  if (reduceMotion || (!DEMO && counts().done <= 0)) { draw(); startPulse(); return; }
  const t0 = performance.now();
  const step = now => {
    const p = Math.min(1, (now - t0) / dur);
    draw(1 - Math.pow(1 - p, 3)); // easeOutCubic
    if (p < 1) revealRAF = requestAnimationFrame(step);
    else startPulse();
  };
  revealRAF = requestAnimationFrame(step);
}

// «сегодняшняя» точка-кольцо мягко дышит — сразу видно, что обои живые
let pulseRAF = null, pulseLast = 0;
function startPulse() {
  cancelAnimationFrame(pulseRAF);
  if (reduceMotion) return;
  const loop = now => {
    pulseRAF = requestAnimationFrame(loop);
    if (document.hidden || now - pulseLast < 66) return; // ~15 кадров/с хватает
    const r = phoneEl.getBoundingClientRect();
    // телефон не виден и мини-превью скрыто — не жжём батарею
    if (!$('mini').classList.contains('show') && (r.bottom < 0 || r.top > innerHeight)) return;
    pulseLast = now;
    draw(1, 0.5 + 0.5 * Math.sin(now / 620));
  };
  pulseRAF = requestAnimationFrame(loop);
}

// тап по телефону: шарик скачет по сетке дугами и штампует точки одну за другой,
// в конце приземляется на сегодняшнюю точку и становится дышащим кольцом
function animateJump() {
  const { total, done } = counts();
  if (reduceMotion || done <= 0) { animateReveal(); return; }
  cancelAnimationFrame(revealRAF);
  cancelAnimationFrame(pulseRAF);
  cancelAnimationFrame(jumpRAF);
  const N = Math.min(done, total - 1); // финиш — на сегодняшней точке
  const interval = Math.min(2600, Math.max(700, N * 140)) / N; // мс на прыжок
  const t0 = performance.now();
  const step = now => {
    const p = Math.min(N, (now - t0) / interval);
    draw(1, 0, { p, interval, N });
    if (p < N) jumpRAF = requestAnimationFrame(step);
    else { draw(); startPulse(); }
  };
  jumpRAF = requestAnimationFrame(step);
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

// тап по телефону — точки прыгают друг за другом (в демо уже крутится свой цикл)
if (!DEMO) phoneEl.addEventListener('click', () => animateJump());

// --- контролы ---

function bindSeg(id, apply, anim) {
  const seg = $(id);
  seg.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === btn));
    apply(btn.dataset.v);
    (anim ? animateReveal : draw)();
  });
}

bindSeg('mode', v => {
  state.mode = v;
  $('birthRow').hidden = v !== 'life';
  $('goalRow').hidden = v !== 'goal';
  if (!customTitle && !bgAutoTitle) {
    state.title = TITLES[v];
    $('title').value = state.title;
  }
}, true);
bindSeg('shape', v => { state.shape = v; });
bindSeg('glass', v => { state.glass = v === '1'; }, true);
bindSeg('footer', v => { state.footer = v === '1'; });
bindSeg('brand', v => { state.brand = v === '1'; });
bindSeg('bg', v => {
  if (v === 'custom') { $('bgFile').click(); return; }
  state.bg = v;
  customBgImg = null;
  state.bgImageId = null;
  if (BG_TITLES[v]) {
    state.title = BG_TITLES[v];
    $('title').value = state.title;
    bgAutoTitle = true;
    customTitle = false;
  } else if (bgAutoTitle) {
    state.title = TITLES[state.mode];
    $('title').value = state.title;
    bgAutoTitle = false;
    customTitle = false;
  }
  refreshSwatches();
  animateReveal();
}, true);

const contrastOk = (c, bgHex = effectiveBgHex()) => Math.abs(lum(c) - lum(bgHex)) >= 0.13;

function refreshSwatches() {
  const btns = [...$('colors').querySelectorAll('.swatch')];
  for (const b of btns) {
    const c = b.dataset.v;
    const ok = contrastOk(c);
    b.disabled = false;
    b.classList.toggle('swatch-dim', !ok);
    b.title = ok ? '' : 'На этом фоне точки будут почти не видны';
  }
  if (!customColor && !contrastOk(state.color)) {
    const first = btns.find(b => contrastOk(b.dataset.v));
    if (first) {
      state.color = first.dataset.v;
      btns.forEach(b => b.classList.toggle('on', b === first));
      $('colorPick').value = state.color;
    }
  }
}

async function uploadBgFile(file) {
  const fd = new FormData();
  fd.append('file', file);
  const r = await fetch('/api/upload-bg', { method: 'POST', body: fd });
  if (!r.ok) throw new Error('upload');
  const j = await r.json();
  state.bgImageId = j.id;
}

$('bgFile').addEventListener('change', e => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = async () => {
    customBgImg = img;
    state.bg = 'custom';
    $('bg').querySelectorAll('button').forEach(b =>
      b.classList.toggle('on', b.dataset.v === 'custom'));
    refreshSwatches();
    animateReveal();
    URL.revokeObjectURL(url);
    try { await uploadBgFile(file); } catch { state.bgImageId = null; }
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
});

const swatches = $('colors');
for (const c of COLORS) {
  const b = document.createElement('button');
  b.className = 'swatch' + (c === state.color ? ' on' : '');
  b.style.background = c;
  b.dataset.v = c;
  if (lum(c) < 0.12) b.classList.add('swatch-ink');
  swatches.appendChild(b);
}
refreshSwatches(); // сразу гасим цвета, нечитаемые на стартовом фоне (иначе графит на чёрном → невидимые точки)
swatches.addEventListener('click', e => {
  const btn = e.target.closest('.swatch');
  if (!btn || btn.disabled) return;
  swatches.querySelectorAll('.swatch').forEach(s => s.classList.toggle('on', s === btn));
  state.color = btn.dataset.v;
  customColor = false;
  $('colorPick').value = state.color;
  draw();
});

$('colorPick').addEventListener('input', e => {
  customColor = true;
  state.color = e.target.value;
  swatches.querySelectorAll('.swatch').forEach(s => s.classList.remove('on'));
  draw();
});

// любое ручное изменение (включая полное стирание) — воля юзера, дефолт не навязываем
$('title').addEventListener('input', e => {
  customTitle = true;
  bgAutoTitle = false;
  state.title = e.target.value;
  draw();
});

$('birth').addEventListener('change', e => {
  state.birth = e.target.value || '2000-01-01';
  animateReveal();
});

$('goalStart').value = state.start;
$('goalEnd').value = state.end;
$('goalStart').addEventListener('change', e => { state.start = e.target.value || todayISO; animateReveal(); });
$('goalEnd').addEventListener('change', e => { state.end = e.target.value || plus30; animateReveal(); });

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
    if (state.bg === 'custom' && !state.bgImageId) {
      err.textContent = 'Сначала выбери своё фото в блоке «Фон»';
      err.hidden = false;
      return;
    }
    const res = await fetch('/api/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: state.mode, color: state.color, bg: state.bg,
        bgImage: state.bgImageId || '', shape: state.shape, glass: state.glass,
        title: state.title, footer: state.footer, brand: state.brand, birth: state.birth,
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

// ——— рилс-сценарий: сон на rAF (не троттлится в видимой вкладке, тайминг стабильный для съёмки)
const rafSleep = ms => new Promise(r => {
  const s = performance.now();
  const f = n => (n - s >= ms ? r() : requestAnimationFrame(f));
  requestAnimationFrame(f);
});

async function reelPlay() {
  const phoneBox = document.querySelector('.phone');
  const geom = () => { // геометрия месячной сетки — формулы как в draw()
    const total = counts().total, cols = 6, rows = Math.ceil(total / cols);
    const dot = Math.min(W * 0.72 / (cols + (cols - 1) * GAP), H * 0.50 / (rows + (rows - 1) * GAP), 110);
    const gap = dot * GAP;
    const gridW = cols * dot + (cols - 1) * gap;
    return { total, dot, x0: (W - gridW) / 2, y0: H * 0.55 - (rows * dot + (rows - 1) * gap) / 2 };
  };
  for (;;) {
    // сцена 0: ХУК — на чёрном набегает число «Твоя жизнь — 4 000 недель»,
    // держится и гаснет. Рифмуется со следующей фразой «Твоя жизнь — в точках».
    cancelAnimationFrame(pulseRAF);
    state.mode = 'month'; state.title = TITLES.month;
    state.bg = 'black'; state.color = '#f2f2f2'; state.shape = 'circle';
    phoneBox.style.transition = 'none';
    document.body.classList.remove('reel-out');
    void phoneBox.offsetWidth;
    phoneBox.style.transition = '';
    draw(0);
    if (!q.has('nohook')) {
      const hook = document.createElement('div');
      hook.className = 'reel-hook';
      hook.innerHTML = '<span class="l1">Твоя жизнь —</span><b class="big" id="hn">0</b><span class="l3">недель</span>';
      document.body.appendChild(hook);
      await rafSleep(280);
      hook.querySelector('.l1').classList.add('in');
      await rafSleep(430);
      hook.querySelector('.big').classList.add('in');
      const hn = hook.querySelector('#hn'), tN = performance.now(), NUM = 4000, durN = 1000;
      await new Promise(res => {
        const st = now => {
          const kk = Math.min(1, (now - tN) / durN);
          hn.textContent = (Math.round(NUM * (1 - Math.pow(1 - kk, 3)) / 10) * 10).toLocaleString('ru-RU');
          if (kk < 1) requestAnimationFrame(st); else res();
        };
        requestAnimationFrame(st);
      });
      hn.textContent = NUM.toLocaleString('ru-RU');
      hook.querySelector('.l3').classList.add('in'); // «недель» вспыхивает, когда число село
      await rafSleep(1500);
      hook.style.transition = 'opacity .5s'; hook.style.opacity = 0;
      await rafSleep(540);
      hook.remove();
    }
    // сцена 1: чёрный фон, пустая сетка, камера близко; фраза печатается
    const ov = document.createElement('div');
    ov.className = 'reel-text';
    ov.innerHTML = '<h1><span id="rt"></span><span id="rp" style="opacity:0">.</span></h1>';
    document.body.appendChild(ov);
    await rafSleep(800);
    const rt = ov.querySelector('#rt');
    for (const ch of 'Твоя жизнь — в точках') { rt.textContent += ch; await rafSleep(64); }
    const rp = ov.querySelector('#rp');
    rp.style.opacity = 1;
    await rafSleep(650);
    // сцена 2: точка вылетает из фразы, вырастает в большой светящийся шар по
    // центру, зависает и падает вниз с ускорением и отскоком — к остальным точкам
    const pr = rp.getBoundingClientRect(), cvr = cv.getBoundingClientRect();
    const g = geom(), k = cvr.width / W;
    const slotX = cvr.left + (g.x0 + g.dot / 2) * k, slotY = cvr.top + (g.y0 + g.dot / 2) * k;
    const d0 = Math.max(9, pr.width);
    const pcx = pr.left + pr.width / 2, pcy = pr.top + pr.height / 2;
    const fly = document.createElement('span');
    fly.className = 'reel-dot';
    Object.assign(fly.style, {
      left: pcx - d0 / 2 + 'px', top: pcy - d0 / 2 + 'px',
      width: d0 + 'px', height: d0 + 'px', boxShadow: '0 0 22px rgba(255,255,255,.6)',
    });
    document.body.appendChild(fly);
    rp.style.opacity = 0;
    const h1 = ov.querySelector('h1');
    h1.style.transition = 'opacity .55s'; h1.style.opacity = 0;
    const cX = innerWidth / 2, cY = innerHeight * 0.3;
    const big = Math.min(innerWidth * 0.24, 120), sBig = big / d0, sSmall = g.dot * k / d0;
    const at = (x, y, s) => `translate(${x - pcx}px, ${y - pcy}px) scale(${s})`;
    // A — вылет в центр и рост в большой шар
    await fly.animate([{ transform: 'translate(0,0) scale(1)' }, { transform: at(cX, cY, sBig) }],
      { duration: 620, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' }).finished;
    // зависание с лёгким пульсом
    await fly.animate([{ transform: at(cX, cY, sBig) }, { transform: at(cX, cY, sBig * 1.12) }, { transform: at(cX, cY, sBig) }],
      { duration: 520, easing: 'ease-in-out', fill: 'forwards' }).finished;
    // B — падение вниз с отскоком к остальным точкам
    await fly.animate([
      { transform: at(cX, cY, sBig), offset: 0 },
      { transform: at(slotX, slotY, sSmall), offset: .78, easing: 'cubic-bezier(.6,0,.9,.45)' },
      { transform: at(slotX, slotY - g.dot * k * 0.8, sSmall), offset: .88 },
      { transform: at(slotX, slotY, sSmall), offset: 1 },
    ], { duration: 840, fill: 'forwards' }).finished;
    // всплеск-кольцо на приземлении
    const rip = document.createElement('span');
    rip.style.cssText = `position:fixed;z-index:61;border-radius:50%;border:2px solid #fff;pointer-events:none;left:${slotX}px;top:${slotY}px;transform:translate(-50%,-50%)`;
    document.body.appendChild(rip);
    rip.animate([{ width: '0', height: '0', opacity: .85 }, { width: '64px', height: '64px', opacity: 0 }],
      { duration: 500, easing: 'ease-out' }).finished.then(() => rip.remove());
    fly.remove(); ov.remove();
    // сцена 3: скачки по месяцу — сначала медленно, потом быстрее; на середине отъезд камеры
    const N = g.total - 1, D = 3400, t0 = performance.now();
    let zoomedOut = false, prevP = 0, prevT = t0;
    await new Promise(res => {
      const step = now => {
        const kk = Math.min(1, (now - t0) / D);
        const p = N * Math.pow(kk, 2.2);
        const interval = Math.min(420, Math.max(60, (now - prevT) / Math.max(p - prevP, 1e-3)));
        prevP = p; prevT = now;
        draw(1, 0, { p, interval, N });
        if (!zoomedOut && kk > 0.45) { zoomedOut = true; document.body.classList.add('reel-out'); }
        if (kk < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
    draw(); startPulse();
    await rafSleep(700);
    // «вот сколько точек» — крупный счётчик итога поверх заполненного календаря
    const cnt = document.createElement('div');
    cnt.className = 'reel-hook';
    cnt.style.background = 'rgba(0,0,0,.5)';
    cnt.innerHTML = `<span class="l1 in">вот сколько точек</span><b class="big in">${g.total}</b>`;
    document.body.appendChild(cnt);
    await rafSleep(1500);
    cnt.style.transition = 'opacity .5s'; cnt.style.opacity = 0;
    await rafSleep(520); cnt.remove();
    // сцена 4: монтаж тем — горы, океан, закат, синий
    for (const [bg, color] of [
      ['mountains', '#34c759'], ['ocean', '#f2f2f2'], ['sunset', '#ff9500'],
      ['dembel', '#c8c4a0'], ['ramadan', '#f5e6b8'], ['honeymoon', '#ffb8c8'], ['navy', '#3da9fc'],
    ]) {
      state.bg = bg; state.color = color;
      draw(1, 0.5);
      await rafSleep(1150);
    }
    // сцена 5: финал — экран гаснет, остаётся одна дышащая точка и подпись
    const end = document.createElement('div');
    end.className = 'reel-end';
    end.innerHTML = '<span class="dotp"></span><p>Каждый день — одна точка.</p><b>⠿ vita · vitadots.ru</b>';
    document.body.appendChild(end);
    void end.offsetWidth;
    end.classList.add('show');
    await rafSleep(3300);
    end.classList.remove('show');
    await rafSleep(700);
    end.remove();
  }
}

if (DEMO) {
  // луп для съёмки: заполнение ~2.6с → пауза с дышащим кольцом → заново
  const cycle = () => { animateReveal(2600); setTimeout(cycle, 5600); };
  cycle();
} else if (REEL) {
  (q.get('reel') === 'life' ? reelLife : reelPlay)();
} else {
  animateReveal();
}

// ——— life-рилс: «календарь жизни» заполняется до сегодня; видно прожито/осталось.
// Персонализация: ?reel=life&born=ГГГГ-ММ-ДД — цифры про конкретного человека.
async function reelLife() {
  reelFull = false; // заполняем только прожитые недели, не всю сетку
  const phoneBox = document.querySelector('.phone');
  const born = q.get('born');
  if (born && /^\d{4}-\d{2}-\d{2}$/.test(born)) state.birth = born;
  const fmt = n => n.toLocaleString('ru-RU');
  for (;;) {
    cancelAnimationFrame(pulseRAF);
    state.mode = 'life'; state.title = TITLES.life;
    state.bg = 'black'; state.color = '#f2f2f2'; state.shape = 'square';
    // life-сетка плотная — сразу показываем весь телефон (камера не близко)
    phoneBox.style.transition = 'none';
    document.body.classList.add('reel-out');
    void phoneBox.offsetWidth;
    phoneBox.style.transition = '';
    draw(0);
    const { total, done } = counts();
    const left = total - done;
    // сцена 0: ХУК — сколько недель осталось (персонально) либо всего в жизни
    if (!q.has('nohook')) {
      const num = born ? left : total;
      const hook = document.createElement('div');
      hook.className = 'reel-hook';
      hook.innerHTML = `<span class="l1">${born ? 'Тебе осталось' : 'Вся твоя жизнь —'}</span>`
        + `<b class="big" id="hn">0</b><span class="l3">недель</span>`;
      document.body.appendChild(hook);
      await rafSleep(280);
      hook.querySelector('.l1').classList.add('in');
      await rafSleep(430);
      hook.querySelector('.big').classList.add('in');
      const hn = hook.querySelector('#hn'), tN = performance.now(), durN = 1000;
      await new Promise(res => {
        const st = now => {
          const kk = Math.min(1, (now - tN) / durN);
          hn.textContent = fmt(Math.round(num * (1 - Math.pow(1 - kk, 3))));
          if (kk < 1) requestAnimationFrame(st); else res();
        };
        requestAnimationFrame(st);
      });
      hn.textContent = fmt(num);
      hook.querySelector('.l3').classList.add('in');
      await rafSleep(1500);
      hook.style.transition = 'opacity .5s'; hook.style.opacity = 0;
      await rafSleep(540);
      hook.remove();
    }
    // сцена 1: недели набегают от рождения до сегодня — время «разгоняется»
    const dur = 3200, t0 = performance.now();
    await new Promise(res => {
      const step = now => {
        const kk = Math.min(1, (now - t0) / dur);
        draw(Math.pow(kk, 1.7)); // ускорение: медленно → быстрее
        if (kk < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
    draw(); startPulse();
    // граница прожито/осталось — гут-панч; подпись на канвасе уже её показывает
    await rafSleep(2600);
    // сцена 2: финал — тайтл про «не слей остальные»
    cancelAnimationFrame(pulseRAF);
    const end = document.createElement('div');
    end.className = 'reel-end';
    end.innerHTML = born
      ? `<span class="dotp"></span><p>Прожито ${fmt(done)}. Осталось ${fmt(left)}.<br>Не слей их.</p><b>⠿ vita · vitadots.ru</b>`
      : `<span class="dotp"></span><p>Каждая точка — неделя жизни.</p><b>⠿ vita · vitadots.ru</b>`;
    document.body.appendChild(end);
    void end.offsetWidth;
    end.classList.add('show');
    await rafSleep(3600);
    end.classList.remove('show');
    await rafSleep(700);
    end.remove();
  }
}
