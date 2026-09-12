// Превью и скачивание рендерятся на канвасе 1:1 с серверным рендером (app/render.py).
const W = 1179, H = 2556, GAP = 0.45, LIFE_YEARS = 90;

const COLORS = ['#f2f2f2', '#2b2b30', '#3da9fc', '#34c759', '#ff9500', '#c7c7cc', '#a78bfa', '#ff6b81', '#ff5fa2'];
// base — опорный цвет фона: от него считаются пустые точки и контраст свотчей;
// сцены (закат/горы/океан) рисуются градиентом + силуэтами в paintBG (зеркало render.py)
const BGS = {
  black: '#000000', white: '#f4f1ec', navy: '#0d1526',
  sunset: '#2a1230', mountains: '#0e1520', ocean: '#0a1a2b',
  dembel: '#1a1f14', ramadan: '#0a1228', honeymoon: '#2a1520',
  owncolor: '#101014',   // фон, который человек выбрал сам
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
// Шрифты заголовка. k — поправка размера: у рукописных мелкая буква, и без неё
// «Каveat» выглядит вдвое меньше соседей. Те же числа лежат в app/render.py,
// иначе превью разойдётся с настоящими обоями.
const FONTS = {
  system:     { css: '-apple-system, "SF Pro Display", system-ui, sans-serif', w: 600, k: 1 },
  montserrat: { css: 'Montserrat, sans-serif', w: 700, k: 0.96 },
  playfair:   { css: '"Playfair Display", serif', w: 700, k: 1.02 },
  oswald:     { css: 'Oswald, sans-serif', w: 600, k: 1.08 },
  unbounded:  { css: 'Unbounded, sans-serif', w: 700, k: 0.88 },
  russo:      { css: '"Russo One", sans-serif', w: 400, k: 0.98 },
  caveat:     { css: 'Caveat, cursive', w: 700, k: 1.3 },
  pacifico:   { css: 'Pacifico, cursive', w: 400, k: 0.98 },
};
// Выбранным шрифтом пишется всё на обоях: заголовок, счётчик и значок vita.
// Насыщенность подменяем только у системного — у остальных в наборе одно
// начертание, и просить у него 400 бессмысленно.
const wallFont = (px, systemWeight) => {
  const f = FONTS[state.font] || FONTS.system;
  const w = state.font === 'system' ? systemWeight : f.w;
  return `${w} ${Math.round(px * f.k)}px ${f.css}`;
};
const titleFont = (px = 64) => wallFont(px, 600);
// Строка для прогрева шрифта: в ней есть и латиница значка, и слова счётчика,
// иначе канва нарисует их запасным шрифтом — она сама файлы не ждёт.
const FONT_SAMPLE = 'vita Vita 0123456789 день дней из осталось прошло недели '
  + 'прожито впереди стрик цель закрыта награда замерли точки';
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
  mode: 'month', color: '#f2f2f2', bg: 'black', bgColor: '#101014', bgImageId: null, shape: 'circle', font: 'system',
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

// Превью — растр размером настоящих обоев (1179 точек). Пока телефон на
// странице шириной 250 точек, этого с запасом, но щипковый зум растягивает
// уже готовую картинку, и точки становятся ступенчатыми. Поэтому на зуме
// перерисовываем канву крупнее: координаты рисования те же, множитель уходит
// в transform, так что весь код рисования об этом не знает.
let cvScale = 1;
function setCanvasScale(k) {
  k = Math.min(2.5, Math.max(1, Math.round(k * 10) / 10));
  if (k === cvScale) return false;
  cvScale = k;
  cv.width = Math.round(W * k);
  cv.height = Math.round(H * k);
  return true;
}

if (window.visualViewport) {
  let zoomTimer = 0;
  const onZoom = () => {
    clearTimeout(zoomTimer);
    zoomTimer = setTimeout(() => {
      const scale = window.visualViewport.scale || 1;
      if (setCanvasScale(scale > 1.15 ? scale : 1)) draw();
    }, 160);
  };
  window.visualViewport.addEventListener('resize', onZoom);
}

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
  if (state.bg === 'owncolor') {
    c.fillStyle = state.bgColor;
    c.fillRect(0, 0, W, H);
    return;
  }
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
  if (state.bg === 'owncolor') return state.bgColor;
  return BGS[state.bg] || '#000000';
}

// Заголовок бывает длинным — хоть целой цитатой. Он переносится по словам и
// растёт вверх: последняя строка стоит на своём месте над точками, а
// написанное раньше уезжает к верхнему краю. Если строк набралось слишком
// много, шрифт сам мельчает, пока текст не влезет в свободное поле.
const TITLE_W = W * 0.84;
const TITLE_TOP = H * 0.085;   // ниже «таблетки» айфона

function wrapTitle(text, maxW) {
  const out = [];
  for (const part of String(text).split('\n')) {
    let cur = '';
    for (const word of part.split(/\s+/).filter(Boolean)) {
      const probe = cur ? cur + ' ' + word : word;
      if (ctx.measureText(probe).width <= maxW) { cur = probe; continue; }
      if (cur) { out.push(cur); cur = ''; }
      if (ctx.measureText(word).width <= maxW) { cur = word; continue; }
      // одно слово шире строки (склеенный текст) — режем по буквам
      let chunk = '';
      for (const ch of word) {
        if (!chunk || ctx.measureText(chunk + ch).width <= maxW) chunk += ch;
        else { out.push(chunk); chunk = ch; }
      }
      cur = chunk;
    }
    if (cur) out.push(cur);
  }
  return out;
}

function drawTitle(text, baseY) {
  let px = 64, lines = [], lineH = 0;
  for (;;) {
    ctx.font = titleFont(px);
    lines = wrapTitle(text, TITLE_W);
    lineH = Math.round(px * 1.2);
    const top = baseY - (lines.length - 1) * lineH - lineH * 0.7;
    if (top >= TITLE_TOP || px <= 30) break;
    px -= 3;
  }
  lines.forEach((line, i) => {
    ctx.fillText(line, W / 2, baseY - (lines.length - 1 - i) * lineH);
  });
}

function drawWatermark(cx, cy, fill) {
  const r = 5, dx = 17, dy = 15;
  ctx.font = wallFont(32, 400);
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

  ctx.setTransform(cvScale, 0, 0, cvScale, 0, 0);
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
    drawTitle(state.title.trim(), y0 - 190);
  }
  if (state.brand) drawWatermark(W / 2, y0 - 110, text);
  if (state.footer) {
    ctx.fillStyle = text;
    ctx.font = wallFont(40, 400);
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
    if (!$('miniWrap').classList.contains('show') && (r.bottom < 0 || r.top > innerHeight)) return;
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

// --- плавающий предпросмотр ---
// Выезжает, когда большой телефон скрыт больше чем наполовину. Его можно
// перетащить в любой угол (позиция запоминается) и рассмотреть двумя пальцами.
const phoneEl = document.querySelector('.phone');
const miniWrap = $('miniWrap'), miniBox = $('mini');
const headPill = document.getElementById('headPill');
let headTarget = 0, headNow = 0, headRaf = 0;
const MINI_EDGE = 14;
const CORNER_KEY = 'vitaMiniCorner';
const ORIGIN = { br: 'bottom right', bl: 'bottom left', tr: 'top right', tl: 'top left' };

let miniCorner = ['br', 'bl', 'tr', 'tl'].includes(localStorage.getItem(CORNER_KEY))
  ? localStorage.getItem(CORNER_KEY) : 'tr';
let miniZoom = 1;

// Видимая часть экрана: на айфоне снизу висит панель Safari, и обычный
// innerHeight про неё не знает — экранчик уезжал прямо под неё.
function viewport() {
  const vv = window.visualViewport;
  return {
    w: vv ? vv.width : innerWidth,
    h: vv ? vv.height : innerHeight,
    top: vv ? vv.offsetTop : 0,
    left: vv ? vv.offsetLeft : 0,
  };
}

function miniPlace(animate = true) {
  // offsetWidth/Height не учитывают масштаб: пока экранчик спрятан, он ужат
  // до 0.62, и по getBoundingClientRect он «уже» настоящего — из-за этого
  // правый угол считался неверно и половина уезжала за экран
  const w = miniBox.offsetWidth || 112;
  const h = miniBox.offsetHeight || 240;
  const v = viewport();
  const top = miniCorner.startsWith('t');
  const left = miniCorner.endsWith('l');
  const headroom = top ? 74 : MINI_EDGE; // под шапкой, а не поверх неё
  miniWrap.classList.toggle('noanim', !animate);
  miniWrap.style.left = (v.left + (left ? MINI_EDGE : v.w - w - MINI_EDGE)) + 'px';
  miniWrap.style.top = (v.top + (top ? headroom : v.h - h - MINI_EDGE)) + 'px';
  miniBox.style.transformOrigin = ORIGIN[miniCorner];
  if (!animate) setTimeout(() => miniWrap.classList.remove('noanim'), 0);
}

function miniSetZoom(k, smooth = true) {
  miniZoom = Math.min(2.8, Math.max(1, k));
  miniWrap.classList.toggle('pinching', !smooth);
  miniWrap.classList.toggle('zoomed', miniZoom > 1.05);
  miniBox.style.transform = `scale(${miniZoom})`;
}

miniPlace(false);
addEventListener('resize', () => miniPlace(false), { passive: true });
addEventListener('orientationchange', () => setTimeout(() => miniPlace(false), 250));

// Порог ровно тот, что просили: экранчик выезжает, когда телефон скрыт больше
// чем наполовину. Считаем на скролле — это работает в любом браузере, в отличие
// от наблюдателя пересечений, который в некоторых обёртках молчит.
let miniTick = 0, miniTipTimer = 0, miniTipSeen = false;
function updateMini() {
  const r = phoneEl.getBoundingClientRect();
  const vh = viewport().h;
  const visible = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
  const show = r.height > 0 && visible / r.height < 0.5;
  // свет за телефоном горит, пока сам телефон в кадре: на прокрутке он не нужен
  document.body.classList.toggle('dim', show);
  aimHead();
  if (show === miniWrap.classList.contains('show')) return;
  if (show) miniPlace(false);  // панель браузера могла сдвинуть видимую область
  miniWrap.classList.toggle('show', show);
  miniWrap.setAttribute('aria-hidden', show ? 'false' : 'true');
  // подсказку показываем при каждом выезде: с первого раза её легко не заметить.
  // Но если по экранчику уже тыкали — человек всё понял, больше не мозолим
  clearTimeout(miniTipTimer);
  if (show && !miniTipSeen) {
    miniWrap.classList.add('tip');
    miniTipTimer = setTimeout(() => miniWrap.classList.remove('tip'), 4000);
  } else {
    miniWrap.classList.remove('tip');
  }
}
function queueMini() {
  const now = performance.now();
  if (now - miniTick < 60) return;
  miniTick = now;
  updateMini();
  liftRising();
  // край стекла у шапки: зажигаем, когда под неё действительно уехал контент
  document.body.classList.toggle('scrolled', (scrollY || 0) > 12);
}
// touchmove и wheel — страховка: на айфоне во время инерции scroll иногда
// молчит до самой остановки
addEventListener('scroll', queueMini, { passive: true });
addEventListener('touchmove', queueMini, { passive: true });
addEventListener('wheel', queueMini, { passive: true });
addEventListener('resize', queueMini, { passive: true });
window.visualViewport?.addEventListener('resize', () => { miniPlace(false); queueMini(); });
window.visualViewport?.addEventListener('scroll', queueMini);
updateMini();

// Шапка садится в островок: трогается с первых пикселей прокрутки и успевает
// собраться задолго до того, как выедет экранчик. Цель считает скролл, а
// доводит до неё кадровый цикл — иначе на редких событиях айфона видны ступеньки.
function headTick() {
  headNow += (headTarget - headNow) * 0.16;
  if (Math.abs(headTarget - headNow) < 0.0015) headNow = headTarget;
  headPill.style.setProperty('--k', headNow.toFixed(4));
  headRaf = headNow === headTarget ? 0 : requestAnimationFrame(headTick);
}
function aimHead() {
  if (!headPill) return;
  headTarget = Math.min(1, Math.max(0, (scrollY || 0) / 380));
  if (headTarget !== headNow && !headRaf) headRaf = requestAnimationFrame(headTick);
}
// скролл слушаем без придержки: поставить одно число дёшево, а цель должна
// быть свежей к каждому кадру
addEventListener('scroll', aimHead, { passive: true });
addEventListener('touchmove', aimHead, { passive: true });

// Появление на прокрутке. Считаем в том же месте, что уже слушает скролл:
// наблюдатель пересечений в некоторых обёртках молчит, а пустая страница —
// слишком высокая цена за красоту. Показанные блоки выпадают из списка, и
// когда он пустеет, работа прекращается совсем.
let rising = [];
function liftRising() {
  if (!rising.length) return;
  const vh = viewport().h;
  rising = rising.filter(el => {
    const r = el.getBoundingClientRect();
    if (!r.height) return true;            // скрытое поле дождётся своего часа
    if (r.top > vh * 0.94) return true;
    el.classList.add('in');
    return false;
  });
}
rising = [...document.querySelectorAll('.stats, .controls > .field, .controls > .primary, .controls > .hint')];
for (const el of rising) el.classList.add('reveal');
// даём браузеру отрисовать исходное положение, иначе появления не видно
setTimeout(liftRising, 60);

// --- перетаскивание и щипок ---
const pointers = new Map();
let dragFrom = null, pinchFrom = null, moved = false;

miniBox.addEventListener('pointerdown', e => {
  // ткнули — подсказка больше не нужна и не должна лежать поверх картинки
  miniTipSeen = true;
  clearTimeout(miniTipTimer);
  miniWrap.classList.remove('tip');
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  // захват — приятный бонус, но не условие работы: палец спокойно уезжает за
  // край экранчика, движение мы всё равно слушаем на окне
  try { miniBox.setPointerCapture(e.pointerId); } catch {}
  if (pointers.size === 1) {
    const box = miniWrap.getBoundingClientRect();
    dragFrom = { x: e.clientX, y: e.clientY, left: box.left, top: box.top };
    moved = false;
    miniWrap.classList.add('dragging');
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchFrom = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: miniZoom };
    dragFrom = null;
  }
  e.preventDefault();
});

addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinchFrom && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    miniSetZoom(pinchFrom.zoom * (dist / pinchFrom.dist), false);
    moved = true;
    return;
  }
  if (!dragFrom) return;
  const dx = e.clientX - dragFrom.x, dy = e.clientY - dragFrom.y;
  if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
  const box = miniBox.getBoundingClientRect();
  const maxLeft = innerWidth - box.width - 4, maxTop = innerHeight - box.height - 4;
  miniWrap.style.left = Math.min(maxLeft, Math.max(4, dragFrom.left + dx)) + 'px';
  miniWrap.style.top = Math.min(maxTop, Math.max(4, dragFrom.top + dy)) + 'px';
});

function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (pointers.size === 0) {
    miniWrap.classList.remove('dragging', 'pinching');
    if (pinchFrom) {
      miniSetZoom(miniZoom < 1.15 ? 1 : miniZoom);  // почти вернул — вернём совсем
      pinchFrom = null;
    } else if (dragFrom && moved) {
      // прилипаем к ближайшему углу
      const box = miniWrap.getBoundingClientRect();
      const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
      miniCorner = (cy < innerHeight / 2 ? 't' : 'b') + (cx < innerWidth / 2 ? 'l' : 'r');
      localStorage.setItem(CORNER_KEY, miniCorner);
      miniPlace(true);
    } else if (dragFrom && !moved) {
      miniSetZoom(miniZoom > 1.05 ? 1 : 2);  // одиночный тап — приблизить и вернуть
    }
    dragFrom = null;
  } else if (pointers.size === 1) {
    pinchFrom = null;
    const [only] = [...pointers.values()];
    const box = miniWrap.getBoundingClientRect();
    dragFrom = { x: only.x, y: only.y, left: box.left, top: box.top };
  }
}
addEventListener('pointerup', endPointer);
addEventListener('pointercancel', endPointer);

// тап по телефону — точки прыгают друг за другом (в демо уже крутится свой цикл)
if (!DEMO) phoneEl.addEventListener('click', () => animateJump());

// Логотип в шапке на главной никуда не уводит — просто мотает к началу:
// перезагружать ту же страницу ради этого незачем.
const headLogo = document.querySelector('header .logo');
if (headLogo) {
  headLogo.addEventListener('click', e => {
    if (location.pathname !== '/') return;
    e.preventDefault();
    scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// Свет за телефоном вспыхивает от нажатия. Слой перезапускаем вручную: без
// снятия класса вторая вспышка подряд просто не начнётся.
const phoneFlash = document.querySelector('.phone-flash');
if (phoneFlash) {
  const unpress = () => phoneEl.classList.remove('press');
  phoneEl.addEventListener('pointerdown', () => {
    phoneEl.classList.add('press');
    phoneFlash.classList.remove('on');
    void phoneFlash.offsetWidth;
    phoneFlash.classList.add('on');
  }, { passive: true });
  addEventListener('pointerup', unpress, { passive: true });
  addEventListener('pointercancel', unpress, { passive: true });
  phoneFlash.addEventListener('animationend', () => phoneFlash.classList.remove('on'));
}

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
// Канва не умеет ждать шрифт сама: пока файл не подгружен, она молча рисует
// системным. Поэтому сначала просим шрифт под нынешний текст, потом перерисовываем.
async function useFont(key) {
  state.font = key;
  const f = FONTS[key];
  if (key !== 'system' && document.fonts) {
    const family = f.css.split(',')[0].trim();
    try { await document.fonts.load(`${f.w} 64px ${family}`, FONT_SAMPLE + (state.title || '')); } catch {}
  }
  draw();
}
bindSeg('font', v => { useFont(v); });

bindSeg('glass', v => { state.glass = v === '1'; }, true);
bindSeg('footer', v => { state.footer = v === '1'; });
// Логотип на обоях убирается только на полном доступе: клик по «Убрать» без
// покупки ничего не переключает, а объясняет, что это даёт.
let hasFullAccess = false;
const brandSeg = $('brand');
brandSeg.addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.v === '0' && !hasFullAccess) {
    $('proModal').hidden = false;
    return;
  }
  brandSeg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === btn));
  state.brand = btn.dataset.v === '1';
  draw();
});

$('proLater').addEventListener('click', () => { $('proModal').hidden = true; });
$('proModal').addEventListener('click', e => {
  if (e.target === $('proModal')) $('proModal').hidden = true;
});


// Свой заголовок сильнее фона: перебирая фоны, человек не должен терять текст,
// который написал руками. Заголовок фона подставляется только вторым нажатием
// на ту же кнопку — это осознанная просьба «возьми и текст тоже».
let bgTipTimer = 0;
function showBgTip(text) {
  const tip = $('bgTip');
  tip.textContent = text;
  tip.hidden = !text;
  clearTimeout(bgTipTimer);
  if (text) bgTipTimer = setTimeout(() => { tip.hidden = true; }, 5000);
}

bindSeg('bg', v => {
  const again = state.bg === v && !$('bgOwn').classList.contains('on');
  $('bgOwn').classList.remove('on');
  state.bg = v;
  customBgImg = null;
  state.bgImageId = null;
  if (BG_TITLES[v] && (!customTitle || again)) {
    state.title = BG_TITLES[v];
    $('title').value = state.title;
    bgAutoTitle = true;
    customTitle = false;
    showBgTip('');
  } else if (BG_TITLES[v]) {
    showBgTip('твой заголовок остался. нажми ещё раз, чтобы взять «' + BG_TITLES[v] + '»');
  } else if (bgAutoTitle) {
    state.title = TITLES[state.mode];
    $('title').value = state.title;
    bgAutoTitle = false;
    customTitle = false;
    showBgTip('');
  } else {
    showBgTip('');
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

$('bgOwn').addEventListener('click', () => $('bgFile').click());

// Свой цвет фона: выбор гасит и картинки-темы, и своё фото — фон один.
$('bgColorPick').addEventListener('input', e => {
  state.bg = 'owncolor';
  state.bgColor = e.target.value;
  state.bgImageId = null;
  customBgImg = null;
  $('bgOwn').classList.remove('on');
  $('bg').querySelectorAll('button').forEach(b => b.classList.remove('on'));
  showBgTip('');
  refreshSwatches();
  draw();
});

$('bgFile').addEventListener('change', e => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (file) cropOpen(file, 'bg');
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
  showBgTip('');
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

// Обои делают две кнопки: одна сразу под телефоном, другая внизу конструктора.
// Логика одна, поэтому вынесена — каждая показывает ход дела на себе.
async function makeWallpaper(btn, err) {
  err.hidden = true;
  if (state.bg === 'custom' && !state.bgImageId) {
    err.textContent = 'Сначала выбери своё фото в блоке «Фон»';
    err.hidden = false;
    return;
  }
  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = 'Делаю обои…';
  try {
    const res = await fetch('/api/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: state.mode, color: state.color, bg: state.bg, bgColor: state.bgColor,
        bgImage: state.bgImageId || '', shape: state.shape, glass: state.glass,
        title: state.title, font: state.font, footer: state.footer, brand: state.brand, birth: state.birth,
        start: state.start, end: state.end,
        ownerToken: window.VitaID?.token() || '',
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      err.textContent = data.detail || 'Что-то пошло не так — попробуй ещё раз';
      err.hidden = false;
      btn.disabled = false;
      btn.textContent = label;
      return;
    }
    window.location.href = data.setup;
  } catch {
    err.textContent = 'Нет связи с сервером — попробуй ещё раз';
    err.hidden = false;
    btn.disabled = false;
    btn.textContent = label;
  }
}

$('getBtn').addEventListener('click', () => makeWallpaper($('getBtn'), $('getErr')));
// Кнопка сверху не делает обои и ничего не прячет: она плавно подвозит
// человека к настройкам — там он выбирает вид и уже сам мотает дальше.
if ($('heroBtn')) $('heroBtn').addEventListener('click', () => {
  const target = $('tune');
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

// --- профиль в шапке ---
// Кружок открывает карточку: фото, имя, тег и статус prime. Всё, что человек
// меняет здесь, попадает в тот же аккаунт, что и обои.
const profModal = $('profileModal');
let profileLoaded = false;

function paintAvatar(url) {
  const btn = $('avatarBtn'), btnImg = $('avatarBtnImg'), bigImg = $('avaImg');
  btn.classList.toggle('filled', !!url);
  btnImg.hidden = !url;
  bigImg.hidden = !url;
  if (url) { btnImg.src = url; bigImg.src = url; }
}

function paintTagNote(profile) {
  const note = $('tagNote'), input = $('profTag');
  const left = profile.handleLeft ?? 2;
  input.disabled = !!profile.handleLocked;
  if (profile.handleLocked) note.textContent = 'Тег закреплён навсегда';
  else if (left === 2) note.textContent = 'Тег выбирается один раз, потом его можно поменять дважды';
  else note.textContent = left === 1 ? 'Поменять тег можно ещё один раз' : 'Замены тега закончились';
}

function paintPrime(access) {
  const row = $('primeRow'), state = $('primeState'), buy = $('primeBuy');
  const paid = !!access?.paid;
  row.classList.toggle('on', paid);
  buy.hidden = paid || !access?.payable;
  // строка молчит, когда рядом стоит кнопка покупки: она и так всё говорит
  let text = '';
  if (paid) text = 'prime открыт навсегда';
  else if (access?.until && !access.expired) text = 'идут пробные дни';
  else if (access?.expired) text = 'проба кончилась';
  else if (buy.hidden) text = 'prime не подключён';
  state.textContent = text;
  state.hidden = !text;
  hasFullAccess = paid;
  if (paid) $('brandOff').classList.remove('locked');
}

async function loadProfile() {
  try {
    const [profile, access] = await Promise.all([VitaID.ensure(), VitaID.access()]);
    const autoName = profile.name && profile.name === profile.handle;
    $('profName').value = autoName ? '' : (profile.name || '');
    $('profTag').value = (profile.handle || '').replace(/^@+/, '');
    paintTagNote(profile);
    paintAvatar(profile.avatar);
    paintPrime(access);
    $('profLogout').hidden = !(access.telegram || access.email);
    $('profMail').hidden = !!(access.telegram || access.email);
    if (!access.telegram && access.tgBotId) VitaTG.mount($('tgBoxProfile'), access);
    profileLoaded = true;
  } catch (error) {
    $('profStatus').textContent = error.message || 'Не удалось загрузить профиль';
  }
}

$('avatarBtn').addEventListener('click', () => {
  profModal.hidden = false;
  if (!profileLoaded) loadProfile();
});
$('profileClose').addEventListener('click', () => { profModal.hidden = true; });
profModal.addEventListener('click', e => { if (e.target === profModal) profModal.hidden = true; });
addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!cropModal.hidden) { $('cropCancel').click(); return; }
  profModal.hidden = true;
});

// --- выбор области фото ---
// Человек двигает снимок пальцем и меняет размер, в рамку попадает то, что
// видно; на сервер уходит уже готовый кадр, а не весь файл.
const cropModal = $('cropModal'), cropCanvas = $('cropCanvas');
const cropCtx = cropCanvas.getContext('2d');
// Два режима одного окна: кружок аватарки и фон обоев в пропорциях экрана.
// Рамка фона — ровно 1179×2556, поделённые на три, поэтому кадр уходит на
// сервер без растягивания: каждая точка холста становится тремя точками обоев.
const CROP_MODES = {
  ava: {
    cw: 560, ch: 560, ow: 512, oh: 512,
    title: 'Область фото',
    hint: 'Двигай пальцем, щипком двух пальцев меняй размер — в кружок попадёт то, что видно.',
  },
  bg: {
    cw: W / 3, ch: H / 3, ow: W, oh: H,
    title: 'Как встанет фото',
    hint: 'Двигай пальцем, меняй размер щипком — на обои попадёт то, что в рамке.',
  },
};
let cropMode = 'ava';
let cropImg = null, cropScale = 1, cropBase = 1, cropX = 0, cropY = 0;

function cropDraw() {
  const w0 = cropCanvas.width, h0 = cropCanvas.height;
  cropCtx.clearRect(0, 0, w0, h0);
  cropCtx.fillStyle = '#000';
  cropCtx.fillRect(0, 0, w0, h0);
  if (!cropImg) return;
  const k = cropBase * cropScale;
  const w = cropImg.width * k, h = cropImg.height * k;
  // не даём утащить снимок так, чтобы в рамке появилась пустота
  cropX = Math.min(0, Math.max(w0 - w, cropX));
  cropY = Math.min(0, Math.max(h0 - h, cropY));
  cropCtx.drawImage(cropImg, cropX, cropY, w, h);
  if (cropMode === 'bg') {
    // на обоях снимок приглушён, чтобы точки читались — показываем как есть
    cropCtx.fillStyle = 'rgba(0,0,0,0.12)';
    cropCtx.fillRect(0, 0, w0, h0);
  }
}

function cropFail(text) {
  if (cropMode === 'bg') showBgTip(text.toLowerCase());
  else $('profStatus').textContent = text;
}

function cropOpen(file, mode = 'ava') {
  const m = CROP_MODES[mode] || CROP_MODES.ava;
  cropMode = m === CROP_MODES.bg ? 'bg' : 'ava';
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    cropCanvas.width = m.cw;
    cropCanvas.height = m.ch;
    cropView.classList.toggle('crop-phone', cropMode === 'bg');
    $('cropTitle').textContent = m.title;
    $('cropHint').textContent = m.hint;
    cropImg = img;
    cropBase = Math.max(m.cw / img.width, m.ch / img.height);
    cropScale = 1;
    cropX = (m.cw - img.width * cropBase) / 2;
    cropY = (m.ch - img.height * cropBase) / 2;
    cropReset();
    cropModal.hidden = false;
    cropDraw();
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    cropFail('Не получилось открыть это фото');
  };
  img.src = url;
}

// Размер снимка меняется щипком двух пальцев (и колесом мыши на большом
// экране) — ползунком на телефоне попасть в нужную область было мучением.
const cropView = $('cropView');
const CROP_MAX = 4;
const cropPointers = new Map();
let cropDragFrom = null, cropPinch = null;

function cropFrame() {
  const view = cropView.getBoundingClientRect();
  return { k: cropCanvas.width / view.width, left: view.left, top: view.top };
}

function cropReset() {
  cropPointers.clear();
  cropDragFrom = null;
  cropPinch = null;
}

// приближаем так, чтобы точка снимка под пальцами осталась под пальцами
function cropZoomTo(next, mx, my, from) {
  const value = Math.min(CROP_MAX, Math.max(1, next));
  const ratio = value / from.scale;
  cropX = mx - (from.mx - from.cx) * ratio;
  cropY = my - (from.my - from.cy) * ratio;
  cropScale = value;
  cropDraw();
}

// палец добавился или пропал — жест начинается заново от нынешнего положения
function cropRegrip() {
  const pts = [...cropPointers.values()];
  cropDragFrom = null;
  cropPinch = null;
  if (pts.length >= 2) {
    const [a, b] = pts;
    const { k, left, top } = cropFrame();
    cropPinch = {
      dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      scale: cropScale,
      mx: ((a.x + b.x) / 2 - left) * k,
      my: ((a.y + b.y) / 2 - top) * k,
      cx: cropX, cy: cropY,
    };
  } else if (pts.length === 1) {
    cropDragFrom = { x: pts[0].x, y: pts[0].y, cx: cropX, cy: cropY };
  }
}

cropView.addEventListener('pointerdown', e => {
  cropPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  cropRegrip();
  e.preventDefault();
});
addEventListener('pointermove', e => {
  if (!cropPointers.has(e.pointerId)) return;
  cropPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const pts = [...cropPointers.values()];
  const { k, left, top } = cropFrame();  // экранные точки → точки холста
  if (cropPinch && pts.length >= 2) {
    const [a, b] = pts;
    const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    cropZoomTo(
      cropPinch.scale * dist / cropPinch.dist,
      ((a.x + b.x) / 2 - left) * k,
      ((a.y + b.y) / 2 - top) * k,
      cropPinch,
    );
  } else if (cropDragFrom) {
    cropX = cropDragFrom.cx + (e.clientX - cropDragFrom.x) * k;
    cropY = cropDragFrom.cy + (e.clientY - cropDragFrom.y) * k;
    cropDraw();
  }
});
function cropRelease(e) {
  cropPointers.delete(e.pointerId);
  cropRegrip();
}
addEventListener('pointerup', cropRelease);
addEventListener('pointercancel', cropRelease);

cropView.addEventListener('wheel', e => {
  if (!cropImg) return;
  e.preventDefault();
  const { k, left, top } = cropFrame();
  const mx = (e.clientX - left) * k, my = (e.clientY - top) * k;
  cropZoomTo(cropScale * (e.deltaY < 0 ? 1.12 : 1 / 1.12), mx, my,
    { scale: cropScale, mx, my, cx: cropX, cy: cropY });
}, { passive: false });

$('cropCancel').addEventListener('click', () => { cropModal.hidden = true; cropImg = null; cropReset(); });
cropModal.addEventListener('click', e => { if (e.target === cropModal) $('cropCancel').click(); });

$('cropDone').addEventListener('click', async () => {
  if (!cropImg) return;
  const m = CROP_MODES[cropMode];
  const mode = cropMode;
  const out = document.createElement('canvas');
  out.width = m.ow;
  out.height = m.oh;
  const ctx = out.getContext('2d');
  const scale = m.ow / cropCanvas.width;
  ctx.drawImage(
    cropImg,
    cropX * scale, cropY * scale,
    cropImg.width * cropBase * cropScale * scale,
    cropImg.height * cropBase * cropScale * scale,
  );
  cropModal.hidden = true;
  cropReset();
  cropImg = null;

  if (mode === 'bg') {
    // кадр уже ровно под экран, поэтому превью и обои совпадут точка в точку
    customBgImg = out;
    state.bg = 'custom';
    $('bg').querySelectorAll('button').forEach(b => b.classList.remove('on'));
    $('bgOwn').classList.add('on');
    showBgTip('');
    refreshSwatches();
    animateReveal();
    out.toBlob(async blob => {
      if (!blob) { showBgTip('не получилось обрезать фото, попробуй другое'); return; }
      try {
        await uploadBgFile(new File([blob], 'bg.jpg', { type: 'image/jpeg' }));
      } catch {
        state.bgImageId = null;
        showBgTip('фото не загрузилось — нажми «своё фото» ещё раз');
      }
    }, 'image/jpeg', 0.92);
    return;
  }

  $('profStatus').textContent = 'Загружаю фото…';
  out.toBlob(async blob => {
    if (!blob) { $('profStatus').textContent = 'Не получилось обрезать фото'; return; }
    try {
      const data = await VitaID.uploadAvatar(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
      paintAvatar(data.avatar);
      $('profStatus').textContent = 'Фото обновлено';
    } catch (error) {
      $('profStatus').textContent = error.message || 'Не получилось загрузить фото';
    }
  }, 'image/jpeg', 0.92);
});

$('avaFile').addEventListener('change', e => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (file) cropOpen(file);
});

$('profSave').addEventListener('click', async () => {
  const btn = $('profSave');
  btn.disabled = true;
  $('profStatus').textContent = 'Сохраняю…';
  try {
    const data = await VitaID.updateProfile({
      name: $('profName').value.trim(),
      handle: $('profTag').value.trim(),
    });
    $('profName').value = data.name || '';
    $('profTag').value = (data.handle || '').replace(/^@+/, '');
    paintTagNote(data);
    $('profStatus').textContent = 'Сохранено';
  } catch (error) {
    $('profStatus').textContent = error.message || 'Не удалось сохранить';
  } finally {
    btn.disabled = false;
  }
});

$('profMail').addEventListener('click', () => {
  profModal.hidden = true;
  toLogin();
});

$('profLogout').addEventListener('click', () => {
  if (!confirm('Выйти из аккаунта? Вернуться сможешь через телеграм.')) return;
  VitaID.logout();
  location.reload();
});

// --- дверь ---
// Вход и регистрация живут отдельной страницей /login. Здесь остаётся только
// сторож: не свой — отправляем к двери и запоминаем, куда он шёл.
function toLogin() {
  const back = location.pathname + location.search;
  location.replace('/register?next=' + encodeURIComponent(back));
}

async function guard() {
  let signed = false;
  try {
    const access = await VitaID.access();
    signed = !!(access.email || access.telegram);
  } catch {
    // сервер молчит — держать человека перед запертой дверью нечестно
    document.documentElement.classList.remove('gate');
    return;
  }
  if (signed) {
    document.documentElement.classList.remove('gate');
    localStorage.setItem('vitaSignedIn', '1');
    return;
  }
  localStorage.removeItem('vitaSignedIn');
  document.documentElement.classList.add('gate');
  toLogin();
}
guard();

// статус prime нужен и до открытия карточки: от него зависит замок на логотипе.
// Заодно сразу ставим аватарку: человек уже вошёл, ждать нажатия на кружок
// незачем — он видел своё фото в прошлый раз и ждёт его снова.
(async () => {
  try {
    const access = await VitaID.access();
    paintPrime(access);
    if (access.email || access.telegram) {
      const profile = await VitaID.ensure();
      paintAvatar(profile.avatar);
    }
  } catch {}
})();
