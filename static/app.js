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
  ...VitaScenes.SCENE_BASE,   // темы-сцены рисует static/scenes.js (пара — app/scenes.py)
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
const SHAPES = ['circle', 'square', 'rounded', 'heart', 'star', 'diamond', 'hex', ...VitaScenes.NEW_SHAPES];
const NEW_SHAPES = new Set(VitaScenes.NEW_SHAPES);
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
  ptnarrow:   { css: '"Vita PT Narrow", sans-serif', w: 700, k: 1.1 },
  ptserif:    { css: '"Vita PT Serif", serif', w: 400, k: 1.08, st: 'italic' },
};
// Выбранным шрифтом пишется всё на обоях: заголовок, счётчик и значок vita.
// Насыщенность подменяем только у системного — у остальных в наборе одно
// начертание, и просить у него 400 бессмысленно.
const wallFont = (px, systemWeight) => {
  const f = FONTS[state.font] || FONTS.system;
  const w = state.font === 'system' ? systemWeight : f.w;
  return `${f.st ? f.st + ' ' : ''}${w} ${Math.round(px * f.k)}px ${f.css}`;
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

// дата по часам телефона: toISOString даёт Гринвич, и до трёх ночи по Москве
// «сегодня» выходило вчерашним
const localISO = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const todayISO = localISO(new Date());
const plus30 = localISO(new Date(Date.now() + 30 * 864e5));
// часовой пояс уходит на сервер вместе с обоями: он рисует «сегодня» по нему
const phoneTZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; } })();

// Расположение: у каждого элемента свои координаты (доли ширины и высоты),
// множитель размера и — у точек — число в ряду. x = null значит «как раньше»:
// надпись висит на своём отступе от сетки, сетка стоит по центру.
let placing = false;      // открыт режим «Расположение» (весь код — в конце файла)
let placeSel = 'dots';
let placeDrag = null;

const placeDefault = () => ({
  dots: { x: null, y: null, s: 1, cols: 0 },
  title: { x: null, y: null, s: 1 },
  vita: { x: null, y: null, s: 1 },
  foot: { x: null, y: null, s: 1 },
});

const state = {
  place: placeDefault(),
  mode: 'month', color: '#f2f2f2', bg: 'black', bgColor: '#101014', bgImageId: null, shape: 'circle', font: 'system',
  glass: false, glow: false, title: TITLES.month, footer: true, brand: true, birth: '2000-01-01',
  // экран «Домой»: размытие с силой, ровный цвет или своё фото (render.home_cfg)
  home: { mode: 'blur', blur: 30, color: '#101014', photo: '' },
  // цвета текста задаёт тема; пусто — заголовок цветом точек, подписи серым
  textColor: '', textMuted: '', textStroke: '',
  start: todayISO, end: plus30,
};
let customTitle = false;
let bgAutoTitle = false;
let customBgImg = null;
let customHomeImg = null;   // своё фото для «Домой», уже обрезанное под экран
let homeOn = false;         // телефон показывает «Домой», а не блокировку
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
  const th = VitaScenes.THEMES[q.get('theme')];
  if (th) Object.assign(state, th);
}

const $ = id => document.getElementById(id);
const cv = $('cv'), ctxMain = cv.getContext('2d');
// ctx — куда сейчас рисуем: большой телефон или экранчик в углу
let ctx = ctxMain;
const cv2 = $('cv2'), ctx2 = cv2.getContext('2d');

// Экранчик шириной в сотню точек, а канва у него была в полный размер обоев:
// браузер ужимал 1179 точек вчетверо простым фильтром, и точки рябили и рвались,
// сколько разрешения ни добавляй. Теперь у экранчика своя канва ровно под его
// пиксели — ретина × приближение, — а картинку в неё мы спускаем сами,
// ступенями вдвое: каждая честно усредняет четыре точки в одну.
const miniSteps = [];
let miniShown = false;

function copyToMini() {
  if (!miniShown) return;
  let src = cv, sw = cv.width, sh = cv.height, level = 0;
  while (sw / 2 >= cv2.width) {
    const step = miniSteps[level] || (miniSteps[level] = document.createElement('canvas'));
    level++;
    const w = Math.round(sw / 2), h = Math.round(sh / 2);
    if (step.width !== w || step.height !== h) { step.width = w; step.height = h; }
    const c = step.getContext('2d');
    c.imageSmoothingQuality = 'high';
    c.clearRect(0, 0, w, h);
    c.drawImage(src, 0, 0, sw, sh, 0, 0, w, h);
    src = step; sw = w; sh = h;
  }
  // drawMini рисует в экранчик в масштабе обоев и оставляет его на ctx2 —
  // копию кладём в чистых пикселях, иначе она ложится крошечной в угол
  ctx2.setTransform(1, 0, 0, 1, 0, 0);
  ctx2.imageSmoothingQuality = 'high';
  ctx2.clearRect(0, 0, cv2.width, cv2.height);
  ctx2.drawImage(src, 0, 0, sw, sh, 0, 0, cv2.width, cv2.height);
}

// Сколько точек нужно канве экранчика: её ширина на экране × ретина ×
// приближение. Больше, чем в обоях, брать неоткуда.
function miniTarget(zoom) {
  const css = cv2.clientWidth || 92;
  const page = (window.visualViewport && visualViewport.scale) || 1;
  return Math.max(1, Math.min(cv.width, Math.round(css * (window.devicePixelRatio || 1) * zoom * page)));
}

function setMiniRes(w) {
  if (w === cv2.width) return false;
  cv2.width = w;
  cv2.height = Math.round(w * H / W);
  drawMini();
  return true;
}

// Экранчик рисуем прямо в его размере: точки и буквы выходят с острыми краями,
// а не уменьшенной большой картинкой. На кадрах анимации (дыхание кольца,
// заливка по тапу) остаётся дешёвая копия — там разницы не видно, а рисовать
// всё дважды по пятнадцать раз в секунду незачем.
function drawMini() {
  if (!miniShown || cv2.width < 2) return;
  const was = ctx;
  ctx = ctx2;
  try { draw(); } finally { ctx = was; }
}

// Превью — растр размером настоящих обоев (1179 точек). Пока телефон на
// странице шириной 250 точек, этого с запасом, но щипковый зум растягивает
// уже готовую картинку, и точки становятся ступенчатыми. Поэтому на зуме
// перерисовываем канву крупнее: координаты рисования те же, множитель уходит
// в transform, так что весь код рисования об этом не знает.
let cvScale = 1;
function setCanvasScale(k) {
  // не больше 2.3: айфон не даёт канве больше 16.7 млн точек, на 2.4× она молча пустеет
  k = Math.min(2.3, Math.max(1, Math.round(k * 10) / 10));
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
      // в режиме «Расположение» щипок ведём мы сами, а окно тут меняет высоту
      // из-за адресной строки — телефон надо просто подогнать заново
      if (placing) {
        if (placeView.own) { placeFree(); placeApply(); } else placeFit();
        return;
      }
      const scale = window.visualViewport.scale || 1;
      if (setCanvasScale(scale > 1.15 ? scale : 1)) draw();
    }, 160);
  };
  window.visualViewport.addEventListener('resize', onZoom);
}

const rgb = hx => {
  // цвет приходит и из настроек, и из CSS-переменных: там пишут и #000, и
  // #000000. Короткий hex через slice давал NaN, а NaN в градиенте роняет
  // всю отрисовку точки — таблетка формы оставалась пустой
  let h = String(hx).trim().replace(/^#/, '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h.slice(0, 6), 16);
  return h.length >= 6 && Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [0, 0, 0];
};
const blend = (fg, bg, a) => {
  const f = rgb(fg), b = rgb(bg);
  return `rgb(${f.map((v, i) => Math.round(v * a + b[i] * (1 - a))).join(',')})`;
};
const lum = hx => {
  const [r, g, b] = rgb(hx);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};

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
  if (VitaScenes.SCENES.includes(state.bg)) {
    c.drawImage(VitaScenes.scene(state.bg), 0, 0, W, H);
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

function dotPath(c, x, y, d, i = 0) {
  const cx = x + d / 2, cy = y + d / 2;
  const pts = NEW_SHAPES.has(state.shape) && VitaScenes.shapePts(state.shape, x, y, d, i);
  if (pts) { VitaScenes.trace(c, pts); return; }
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
function classicDot(c, x, y, d, color, mode = 'filled', pulse = 0, isLead = false, i = 0) {
  const emptyA = VitaScenes.EMPTY_ALPHA[state.bg];
  dotPath(c, x, y, d, i);
  if (mode === 'filled') {
    c.fillStyle = color;
    c.fill();
  } else if (mode === 'ring' && NEW_SHAPES.has(state.shape)) {
    // кольцо новой формы — полоса внутри силуэта, как на сервере
    if (pulse > 0 || isLead) {
      VitaScenes.blob(c, x + d / 2, y + d / 2, d * 0.8, color, 0,
        [[0, 90 * (isLead ? 1 : pulse)], [0.5, 40 * (isLead ? 1 : pulse)], [1, 0]]);
      dotPath(c, x, y, d, i);
    }
    c.save();
    c.clip();
    c.strokeStyle = color;
    c.lineWidth = Math.max(2, Math.round(d * 0.09)) * 2;
    c.stroke();
    c.restore();
  } else if (mode === 'ring') {
    c.strokeStyle = color;
    c.lineWidth = Math.max(2, d * 0.09);
    if (isLead) { c.shadowColor = color; c.shadowBlur = d * 0.6; }
    else if (pulse > 0) { c.shadowColor = color; c.shadowBlur = d * 0.55 * pulse; }
    c.stroke();
    c.shadowBlur = 0;
  } else if (emptyA != null) {
    // на сценах пустые точки — цветом точки с прозрачностью поверх картинки
    c.globalAlpha = emptyA;
    c.fillStyle = color;
    c.fill();
    c.globalAlpha = 1;
  } else {
    c.fillStyle = blend(color, effectiveBgHex(), 0.18);
    c.fill();
  }
}

function glassDot(c, x, y, d, color, mode = 'filled', pulse = 0, i = 0) {
  const cx = x + d / 2, cy = y + d / 2;
  const [cr, cg, cb] = rgb(color);
  // ромашка и ёлка выходят за коробку точки — заливки тянем с запасом
  const p = NEW_SHAPES.has(state.shape) ? d * 0.12 : 0;
  const fx = x - p, fy = y - p, fd = d + 2 * p;
  c.save();
  dotPath(c, x, y, d, i);
  c.clip();
  if (mode === 'empty') {
    const g = c.createRadialGradient(cx - d * 0.22, cy - d * 0.28, 0, cx, cy, d * 0.78);
    g.addColorStop(0, 'rgba(255,255,255,0.34)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0.04)');
    c.fillStyle = g;
    c.fillRect(fx, fy, fd, fd);
    const frost = c.createLinearGradient(x, y, x + d, y + d);
    frost.addColorStop(0, 'rgba(255,255,255,0.08)');
    frost.addColorStop(0.5, 'rgba(255,255,255,0)');
    frost.addColorStop(1, 'rgba(255,255,255,0.06)');
    c.fillStyle = frost;
    c.fillRect(fx, fy, fd, fd);
  } else if (mode === 'ring') {
    const g = c.createRadialGradient(cx - d * 0.2, cy - d * 0.25, 0, cx, cy, d * 0.76);
    g.addColorStop(0, 'rgba(255,255,255,0.26)');
    g.addColorStop(1, `rgba(${cr},${cg},${cb},0.12)`);
    c.fillStyle = g;
    c.fillRect(fx, fy, fd, fd);
  } else {
    const g = c.createRadialGradient(cx - d * 0.32, cy - d * 0.36, d * 0.04, cx, cy, d * 0.82);
    g.addColorStop(0, 'rgba(255,255,255,0.88)');
    g.addColorStop(0.28, `rgba(${Math.min(255, cr + 40)},${Math.min(255, cg + 40)},${Math.min(255, cb + 40)},0.82)`);
    g.addColorStop(0.62, `rgba(${cr},${cg},${cb},0.78)`);
    g.addColorStop(1, `rgba(${Math.round(cr * 0.72)},${Math.round(cg * 0.72)},${Math.round(cb * 0.72)},0.62)`);
    c.fillStyle = g;
    c.fillRect(fx, fy, fd, fd);
    const sh = c.createLinearGradient(x, y + d * 0.42, x, y + d);
    sh.addColorStop(0, 'rgba(0,0,0,0)');
    sh.addColorStop(1, 'rgba(0,0,0,0.22)');
    c.fillStyle = sh;
    c.fillRect(fx, fy, fd, fd);
    const spec = c.createRadialGradient(cx - d * 0.15, cy - d * 0.22, 0, cx - d * 0.1, cy - d * 0.15, d * 0.28);
    spec.addColorStop(0, 'rgba(255,255,255,0.55)');
    spec.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = spec;
    c.fillRect(fx, fy, fd, fd);
  }
  c.restore();
  c.save();
  dotPath(c, x, y, d, i);
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

function drawDot(c, x, y, d, color, mode, pulse = 0, isLead = false, i = 0) {
  const bgHex = effectiveBgHex();
  if (state.shape === 'tone') {
    VitaScenes.tone(c, x, y, d, color, VitaScenes.toneInk(bgHex, color), mode, isLead ? 1 : pulse);
    return;
  }
  if (state.shape === 'ink' && mode === 'ring') {   // «сегодня» у туши — энсо
    VitaScenes.ensoDot(c, x, y, d, color, i, isLead ? 1 : pulse);
    return;
  }
  if (state.glass) glassDot(c, x, y, d, color, mode, pulse, i);
  else classicDot(c, x, y, d, color, mode, pulse, isLead, i);
  VitaScenes.flowerCenter(c, state.shape, x, y, d, color, mode, bgHex, VitaScenes.EMPTY_ALPHA[state.bg]);
}

// Надписи обоев: заголовок, значок vita и счётчик. Вынесены, потому что кадр
// анимации берёт сетку из слоёв, а надписи рисует сам — они стоят сотые доли
// миллисекунды, зато не надо держать их в слое и стирать под кольцом.
// Два числа под телефоном: «дней позади» и «впереди».
function drawStats(statDone, total) {
  const fmt = n => n.toLocaleString('ru-RU');
  const [l1, l2] = STAT_LABELS[state.mode];
  $('stat1').textContent = fmt(statDone);
  $('stat1l').textContent = l1;
  $('stat2').textContent = fmt(total - statDone);
  $('stat2l').textContent = l2;
}

function drawWallText(g, text, total, statDone) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (state.title.trim()) {
    ctx.fillStyle = state.textColor || state.color;
    drawTitle(state.title.trim(), g.title.y, g.title.x, g.title.px);
  }
  if (state.brand) drawWatermark(g.vita.x, g.vita.y, text, g.vita.px);
  if (state.footer) {
    ctx.fillStyle = text;
    ctx.font = wallFont(g.foot.px, 400);
    ctx.fillText(footerText(total, statDone), g.foot.x, g.foot.y);
  }
}

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

// Периметр режима «Расположение»: в нём человек двигает точки и надписи.
// Границы дал владелец — по ширине 7…93 %, по высоте от 250 до 2430: почти
// весь экран, кроме полоски под «таблеткой» сверху и узкой полосы снизу.
// Те же числа лежат в render.py (PLACE_BOX) — менять парно.
const PLACE_BOX = [Math.round(W * 0.07), 250, Math.round(W * 0.93), 2430];

// Кламп центра элемента: за периметр не пускаем. Если элемент шире поля —
// ставим его по середине, иначе он бы прыгал к краю.
function clampPlace(cx, cy, w, h) {
  const [bx0, by0, bx1, by1] = PLACE_BOX;
  const minX = bx0 + w / 2, maxX = bx1 - w / 2;
  const minY = by0 + h / 2, maxY = by1 - h / 2;
  return [
    minX > maxX ? W / 2 : Math.min(Math.max(cx, minX), maxX),
    minY > maxY ? (by0 + by1) / 2 : Math.min(Math.max(cy, minY), maxY),
  ];
}

// Диаметр точки: сперва по обычному полю (0.72 × 0.50 экрана), потом ползунком,
// и в конце — чтобы сетка влезла в периметр. Формула повторена в render.py.
function dotFit(cols, rows, maxW, maxH) {
  const d = Math.min(maxW / (cols + (cols - 1) * GAP), maxH / (rows + (rows - 1) * GAP));
  return cols <= 10 ? Math.min(d, 110) : d;
}

// Геометрия всех четырёх элементов обоев: сетка точек, заголовок, значок vita
// и счётчик снизу. Пока человек ничего не двигал, всё считается как раньше —
// надписи висят на своих отступах от сетки. Как только у элемента появились
// свои координаты, он живёт сам по себе и держится внутри периметра.
function placeGeom(totalIn) {
  const total = totalIn ?? counts().total;
  const p = state.place;
  const colsAuto = gridCols(total);
  const cols = p.dots.cols || colsAuto;
  const rows = Math.ceil(total / cols);
  const dotAuto = dotFit(colsAuto, Math.ceil(total / colsAuto), W * 0.72, H * 0.50);
  const boxW = PLACE_BOX[2] - PLACE_BOX[0], boxH = PLACE_BOX[3] - PLACE_BOX[1];
  let dot = dotFit(cols, rows, W * 0.72, H * 0.50) * p.dots.s;
  dot = Math.min(dot, boxW / (cols + (cols - 1) * GAP), boxH / (rows + (rows - 1) * GAP));
  const gap = dot * GAP;
  const gw = cols * dot + (cols - 1) * gap, gh = rows * dot + (rows - 1) * gap;
  // мельче точки — ближе подписи, иначе они повисают в пустоте
  const k = Math.min(Math.max(dot / dotAuto, 0.55), 1.6);
  let cx = W / 2, cy = H * 0.55;
  if (p.dots.x !== null) [cx, cy] = clampPlace(p.dots.x * W, p.dots.y * H, gw, gh);
  const x0 = cx - gw / 2, y0 = cy - gh / 2;
  const vitaY = y0 - Math.max(64, 110 * k);
  const el = (key, autoY, base) => {
    const q = p[key];
    return {
      x: q.x === null ? W / 2 : q.x * W,
      y: q.y === null ? autoY : q.y * H,
      px: base * q.s,
      free: q.x !== null,
    };
  };
  return {
    total, cols, dot, gap, gw, gh, x0, y0, k,
    title: el('title', vitaY - 80, 64),
    vita: el('vita', vitaY, 32),
    foot: el('foot', y0 + gh + Math.max(76, 130 * k), 40),
  };
}

// Эмодзи тут глиф шрифта, а на сервере — картинка ростом 1.08 от кегля.
// Мерить их браузерной меркой нельзя: строки порвутся не там, где на обоях.
// Поэтому и меряем, и рисуем по серверной: каждому эмодзи своё окно.
const PIC = '\\p{Extended_Pictographic}(?:[\\u{1F3FB}-\\u{1F3FF}])?(?:\\uFE0F|\\uFE0E)?';
const EMOJI_RE = new RegExp(
  `(?:[\\u{1F1E6}-\\u{1F1FF}]{2}|[0-9#*]\\uFE0F?\\u20E3|${PIC}(?:\\u200D${PIC})*)`, 'gu');

function splitEmoji(text) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(EMOJI_RE)) {
    if (m.index > last) out.push([false, text.slice(last, m.index)]);
    out.push([true, m[0]]);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push([false, text.slice(last)]);
  return out;
}

const realPx = px => Math.round(px * (FONTS[state.font] || FONTS.system).k);
const emojiSlot = px => Math.round(realPx(px) * 1.08);

function measureRich(text, px) {
  let total = 0;
  for (const [isEmoji, part] of splitEmoji(text)) {
    total += isEmoji ? emojiSlot(px) : ctx.measureText(part).width;
  }
  return total;
}

function fillRich(text, cx, y, px) {
  const slot = emojiSlot(px);
  let x = cx - measureRich(text, px) / 2;
  const prev = ctx.textAlign;
  ctx.textAlign = 'left';
  for (const [isEmoji, part] of splitEmoji(text)) {
    if (!isEmoji) {
      if (state.textStroke) {
        ctx.save();
        ctx.strokeStyle = state.textStroke;
        ctx.lineWidth = 8;
        ctx.lineJoin = 'round';
        ctx.strokeText(part, x, y);
        ctx.restore();
      }
      ctx.fillText(part, x, y);
      x += ctx.measureText(part).width;
      continue;
    }
    const own = ctx.measureText(part).width || slot;
    ctx.save();
    ctx.translate(x, y);
    if (own > slot) ctx.scale(slot / own, 1);   // чтобы не наехал на соседа
    ctx.fillText(part, 0, 0);
    ctx.restore();
    x += slot;
  }
  ctx.textAlign = prev;
}

// Пробелы человека не трогаем: ими он сам двигает слово по строке. Гасим
// только тот пробел, на котором строка сломалась, иначе следующая уехала бы
// вправо на ровном месте.
function wrapTitle(text, maxW, px) {
  const out = [];
  for (const part of String(text).split('\n')) {
    let cur = '';
    for (const token of part.match(/\s+|\S+/gu) || []) {
      if (measureRich(cur + token, px) <= maxW) { cur += token; continue; }
      if (cur) { out.push(cur); cur = ''; }
      if (!token.trim()) continue;                     // перенос съедает пробел
      if (measureRich(token, px) <= maxW) { cur = token; continue; }
      // одно слово шире строки (склеенный текст) — режем по буквам
      let chunk = '';
      for (const ch of [...token]) {
        if (!chunk || measureRich(chunk + ch, px) <= maxW) chunk += ch;
        else { out.push(chunk); chunk = ch; }
      }
      cur = chunk;
    }
    if (cur) out.push(cur);
  }
  return out;
}

// Раскладку заголовка считаем отдельно: её же меркой режим «Расположение»
// обводит заголовок рамкой, иначе рамка и текст разъедутся.
function titleLayout(text, baseY, px0 = 64) {
  let px = px0, lines = [], lineH = 0;
  for (;;) {
    ctx.font = titleFont(px);
    lines = wrapTitle(text, TITLE_W, px);
    lineH = Math.round(px * 1.2);
    const top = baseY - (lines.length - 1) * lineH - lineH * 0.7;
    if (top >= TITLE_TOP || px <= 30) break;
    px -= 3;
  }
  return { px, lines, lineH };
}

function drawTitle(text, baseY, cx = W / 2, px0 = 64) {
  const { px, lines, lineH } = titleLayout(text, baseY, px0);
  ctx.font = titleFont(px);
  lines.forEach((line, i) => {
    fillRich(line, cx, baseY - (lines.length - 1 - i) * lineH, px);
  });
}

function drawWatermark(cx, cy, fill, px = 32) {
  const q = px / 32;
  const r = 5 * q, dx = 17 * q, dy = 15 * q;
  ctx.font = wallFont(px, 400);
  const textW = ctx.measureText('vita').width;
  const dotsW = 2 * dx + 2 * r, pad = 14 * q;
  const x = cx - (dotsW + pad + textW) / 2;
  ctx.fillStyle = fill;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
    ctx.beginPath();
    ctx.arc(x + r + i * dx, cy + (j - 0.5) * dy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.textAlign = 'left';
  ctx.fillText('vita', x + dotsW + pad, cy);
  ctx.textAlign = 'center';
}

function draw(reveal = 1, pulse = 0, fill = null) {
  const text = state.textMuted || (state.bg === 'white' ? '#8a857a' : '#8e8e8e');
  const { total, done: realDone, current: realCurrent } = counts();
  // демо/рилс: заполняем всю сетку, последняя точка остаётся дышащим кольцом
  const fullDone = (DEMO || (REEL && reelFull)) ? total - 1 : realDone;
  const fullCurrent = (DEMO || (REEL && reelFull)) ? total - 1 : realCurrent;
  // reveal < 1 — точки закрашиваются по одной (анимация загрузки/смены режима);
  // счётчики и подпись бегут вместе с ними
  // fill — закрашивание по тапу: залито ровно столько точек, сколько сказано,
  // кольцо «сегодня» не рисуется, а счётчики и подпись показывают настоящий
  // день, а не место, где счёт остановился
  const done = layerDone !== null ? layerDone
    : fill !== null ? Math.min(fullDone, Math.floor(fill))
    : reveal >= 1 ? fullDone : Math.round(fullDone * reveal);
  const statDone = fill !== null ? fullDone : done;
  const current = layerDone !== null ? null
    : fill !== null ? null : reveal >= 1 ? fullCurrent : (done < total ? done : null);
  const lead = fill !== null || reveal >= 1 ? -2 : current; // ведущая точка при анимации ярче

  // множитель берём от самой канвы: у телефона он свой, у экранчика свой
  const k = ctx === ctxMain ? cvScale : ctx.canvas.width / W;

  // Дыхание «сегодняшней» точки: весь кадр под ней не изменился, поэтому
  // возвращаем из запаса квадратик и рисуем заново одну точку.
  if (pulse > 0 && fill === null && reveal >= 1 && !homeOn && !placing
      && ctx === ctxMain && pulseSpot && pulseSpot.k === k) {
    const p = pulseSpot;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(pulseBuf, 0, 0, p.rw, p.rh, p.rx, p.ry, p.rw, p.rh);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    drawDot(ctx, p.x, p.y, p.d, state.color, 'ring', pulse, false, p.i);
    for (const n of p.after) drawDot(ctx, n[0], n[1], p.d, state.color, 'empty', 0, false, n[2]);
    copyToMini();
    return;
  }

  // Кадр анимации закраски: сетку берём готовой из двух слоёв — закрашенные
  // точки лежат подряд, поэтому это два прямоугольника. Дорисовываем только
  // «сегодняшнее» кольцо и надписи.
  if (animOn && layerDone === null && (reveal < 1 || fill !== null)
      && ctx === ctxMain && !placing && !homeOn && animGeom) {
    const a = animGeom;
    const pad = a.gap * 0.5;
    const blit = (ux, uy, uw, uh) => {
      const sx = Math.max(0, Math.floor(ux * k)), sy = Math.max(0, Math.floor(uy * k));
      const sw = Math.min(cv.width - sx, Math.ceil(uw * k));
      const sh = Math.min(cv.height - sy, Math.ceil(uh * k));
      if (sw > 0 && sh > 0) ctx.drawImage(animFull, sx, sy, sw, sh, sx, sy, sw, sh);
    };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(animEmpty, 0, 0);
    if (done > 0) {
      const rows = Math.floor(done / a.cols), rem = done % a.cols;
      const step = a.dot + a.gap;
      if (rows > 0) blit(a.x0 - pad, a.y0 - pad, a.gw + 2 * pad, rows * step - a.gap + 2 * pad);
      if (rem > 0) blit(a.x0 - pad, a.y0 + rows * step - pad, rem * step - a.gap + 2 * pad, a.dot + 2 * pad);
    }
    ctx.setTransform(k, 0, 0, k, 0, 0);
    if (current !== null) {
      const rx = a.x0 + (current % a.cols) * (a.dot + a.gap);
      const ry = a.y0 + Math.floor(current / a.cols) * (a.dot + a.gap);
      // под кольцом должен быть чистый фон, а в слое там пустая точка
      ctx.save();
      ctx.beginPath();
      ctx.rect(rx - pad, ry - pad, a.dot + 2 * pad, a.dot + 2 * pad);
      ctx.clip();
      paintBG(ctx);
      ctx.restore();
      drawDot(ctx, rx, ry, a.dot, state.color, 'ring', pulse, current === lead, current);
    }
    drawWallText(a, text, total, statDone);
    drawStats(statDone, total);
    copyToMini();
    return;
  }

  // сюда дошли — значит кадр рисуется целиком, и слои больше не в ходу
  animOn = false;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  paintBG(ctx);

  const g = placeGeom(total);
  const { cols, dot, gap, gw: gridW, gh: gridH, x0, y0 } = g;

  // свечение — ореол под закрашенными точками; на крошечных точках «Жизни»
  // его не видно, а превью бы на нём захлебнулось (так же в render.py)
  const glowOn = state.glow && dot >= 14;
  if (ctx === ctxMain) pulseSpot = null;
  for (let i = 0; i < total; i++) {
    const x = x0 + (i % cols) * (dot + gap), y = y0 + Math.floor(i / cols) * (dot + gap);
    const dd = dot;
    const dx = x + (dot - dd) / 2, dy = y + (dot - dd) / 2;
    if (i < done) {
      if (glowOn) VitaScenes.glow(ctx, dx, dy, dd, state.color);
      drawDot(ctx, dx, dy, dd, state.color, 'filled', 0, false, i);
    } else if (current !== null && i === current) {
      // перед дышащей точкой запоминаем квадратик под ней: дальше каждый вдох
      // стоит один маленький drawImage вместо целого кадра
      if (ctx === ctxMain && !placing && pulse === 0 && fill === null && reveal >= 1) {
        keepPulseSpot(x, y, dot, i, k, g, total);
      }
      drawDot(ctx, x, y, dot, state.color, 'ring', pulse, i === lead, i);
    } else {
      drawDot(ctx, x, y, dot, state.color, 'empty', 0, false, i);
    }
  }

  if (layerDone === null) drawWallText(g, text, total, statDone);

  if (homeOn) paintHome(ctx);

  // хвост — только на большом телефоне: экранчик сюда заходит вторым кругом
  if (ctx !== ctxMain) return;

  drawStats(statDone, total);

  if (pulse === 0 && reveal >= 1 && fill === null) drawMini();
  else copyToMini();
  if (placing) drawPlaceHints();
}

// --- слои для анимации закраски -------------------------------------------
// Соседние кадры анимации отличаются только числом закрашенных точек. Поэтому
// сетку рисуем дважды — пустую и закрашенную целиком, — а каждый кадр собираем
// из них двумя прямоугольниками. В «Жизни» со стеклом кадр падает с 36 мс до
// сотых: там 4680 точек, и каждая стеклянная стоит четырёх градиентов.
const animEmpty = document.createElement('canvas');
const animFull = document.createElement('canvas');
let animKey = '', animGeom = null, animOn = false;
let layerDone = null;   // рисуем слой: столько точек закрашено, кольца и текста нет

function animStateKey() {
  return [state.mode, state.color, state.bg, state.bgColor, state.shape, state.glass,
    state.glow, state.birth, state.start, state.end, JSON.stringify(state.place),
    customBgImg ? customBgImg.width + 'x' + customBgImg.height : '', cv.width].join('|');
}

// Слои нужны не всегда: мелкая сетка рисуется мгновенно и без них, а ореол
// «Светятся» вылезает за клетку — прямоугольником его не вырезать.
function animLayersReady() {
  const total = counts().total;
  const g = placeGeom(total);
  if (total < 600 || (state.glow && g.dot >= 14) || cv.width > 1600) return false;
  const key = animStateKey();
  if (animKey === key && animEmpty.width === cv.width) { animGeom = g; return true; }
  for (const c of [animEmpty, animFull]) {
    if (c.width !== cv.width) { c.width = cv.width; c.height = cv.height; }
  }
  const was = ctx;
  try {
    layerDone = 0;
    ctx = animEmpty.getContext('2d');
    draw();
    layerDone = total;
    ctx = animFull.getContext('2d');
    draw();
  } finally {
    layerDone = null;
    ctx = was;
  }
  animKey = key;
  animGeom = g;
  return true;
}

// Запас под дышащей точкой: кадр целиком стоит до 38 мс, а меняется в нём одна
// точка. Храним не весь кадр (на зуме это 64 МБ), а квадратик вокруг неё —
// с запасом на свечение и тень кольца.
const pulseBuf = document.createElement('canvas');
let pulseSpot = null;

function keepPulseSpot(x, y, d, i, k, g, total) {
  const m = d;                        // запас под свечение и тень кольца
  const cw = ctx.canvas.width, ch = ctx.canvas.height;
  const bx = x - m, by = y - m, bs = d + 2 * m;
  // Надпись задевает квадратик (так бывает, если её двигали в «Расположении») —
  // тогда дыхание рисуем целиком: второй проход по тексту сгустил бы его края.
  const hits = (cx, cy, hw, hh) =>
    cx + hw > bx && cx - hw < bx + bs && cy + hh > by && cy - hh < by + bs;
  if ((state.title.trim() && hits(g.title.x, g.title.y, W * 0.45, g.title.px * 2.4))
      || (state.brand && hits(g.vita.x, g.vita.y, g.vita.px * 4, g.vita.px * 1.6))
      || (state.footer && hits(g.foot.x, g.foot.y, W * 0.3, g.foot.px * 1.6))) {
    pulseSpot = null;
    return;
  }
  const rx = Math.max(0, Math.floor(bx * k)), ry = Math.max(0, Math.floor(by * k));
  const rw = Math.min(cw - rx, Math.ceil(bs * k));
  const rh = Math.min(ch - ry, Math.ceil(bs * k));
  if (rw <= 0 || rh <= 0) { pulseSpot = null; return; }
  if (pulseBuf.width !== rw || pulseBuf.height !== rh) { pulseBuf.width = rw; pulseBuf.height = rh; }
  const b = pulseBuf.getContext('2d');
  b.clearRect(0, 0, rw, rh);
  b.drawImage(ctx.canvas, rx, ry, rw, rh, 0, 0, rw, rh);
  // Соседи, которые рисуются позже неё и задевают квадратик: у ромашки и
  // растра точка вылезает за свою клетку, и порядок отрисовки виден глазом.
  // Повторяем его точь-в-точь, иначе превью разойдётся с сервером.
  const after = [];
  const step = g.dot + g.gap;
  for (let j = i + 1; j < total && j <= i + 2 * g.cols + 2; j++) {
    const nx = g.x0 + (j % g.cols) * step, ny = g.y0 + Math.floor(j / g.cols) * step;
    if (nx + g.dot > bx && nx < bx + bs && ny + g.dot > by && ny < by + bs) after.push([nx, ny, j]);
  }
  pulseSpot = { rx, ry, rw, rh, x, y, d, i, k, after };
}

// точки закрашиваются по одной при загрузке и смене режима — «оживает» на глазах
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let revealRAF = null, fillRAF = null;
function animateReveal(dur = 1150) {
  cancelAnimationFrame(revealRAF);
  cancelAnimationFrame(pulseRAF);
  cancelAnimationFrame(fillRAF);
  if (reduceMotion || homeOn || (!DEMO && counts().done <= 0)) { draw(); startPulse(); return; }
  const fast = animLayersReady();
  const t0 = performance.now();
  const step = now => {
    const p = Math.min(1, (now - t0) / dur);
    animOn = fast && p < 1;
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
  // на «Домой» кольца «сегодня» не видно: дышать нечему, а размывать кадр
  // пятнадцать раз в секунду — впустую жечь батарею
  if (reduceMotion || homeOn) return;
  const loop = now => {
    pulseRAF = requestAnimationFrame(loop);
    if (document.hidden || now - pulseLast < 66) return; // ~15 кадров/с хватает
    // телефон не виден и мини-превью скрыто — не жжём батарею. Видимость
    // считает прокрутка (updateMini), а не сам кадр: getBoundingClientRect
    // заставляет браузер пересчитать раскладку, и делать это по кадрам вредно
    if (!phoneOnScreen && !miniShown) return;
    pulseLast = now;
    draw(1, 0.5 + 0.5 * Math.sin(now / 620));
  };
  pulseRAF = requestAnimationFrame(loop);
}

// тап по телефону: точки заливаются волной, как при загрузке главной, но не
// все — счёт останавливается на случайной точке от восьмой до пятнадцатой,
// и кадр замирает на ней
const FILL_MIN = 8, FILL_MAX = 15, FILL_MS = 520;
const fillLimit = () => FILL_MIN + Math.floor(Math.random() * (FILL_MAX - FILL_MIN + 1));
function animateFill(limit, dur = FILL_MS) {
  cancelAnimationFrame(revealRAF);
  cancelAnimationFrame(pulseRAF);
  cancelAnimationFrame(fillRAF);
  const { done } = counts();
  const N = Math.min(done, Math.max(1, limit));
  if (done <= 0 || homeOn) { draw(); startPulse(); return; }
  if (reduceMotion || N <= 1) { draw(1, 0, N); return; }
  const fast = animLayersReady();
  const t0 = performance.now();
  const step = now => {
    const k = Math.min(1, (now - t0) / dur);
    animOn = fast;
    draw(1, 0, 1 + (1 - Math.pow(1 - k, 3)) * (N - 1)); // easeOutCubic, как reveal
    if (k < 1) fillRAF = requestAnimationFrame(step);
  };
  fillRAF = requestAnimationFrame(step);
}

// --- плавающий предпросмотр ---
// Выезжает, когда большой телефон скрыт больше чем наполовину. Его можно
// перетащить в любой угол (позиция запоминается) и рассмотреть двумя пальцами.
const phoneEl = document.querySelector('.phone');
const miniWrap = $('miniWrap'), miniBox = $('mini');
const MINI_EDGE = 14;
const CORNER_KEY = 'vitaMiniCorner';
const ORIGIN = { br: 'bottom right', bl: 'bottom left', tr: 'top right', tl: 'top left' };

let miniCorner = ['br', 'bl', 'tr', 'tl'].includes(localStorage.getItem(CORNER_KEY))
  ? localStorage.getItem(CORNER_KEY) : 'tr';
let miniZoom = 1, miniShrink = 0;

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
  miniSharpen(smooth);
}

// Разрешение канвы идёт за приближением: крупнее — сразу, иначе мыло видно по
// дороге; мельче — когда экранчик доедет, иначе он мылится в начале обратного
// хода. Во время щипка растём ступенями, а не на каждое движение пальцев.
function miniSharpen(settled = true) {
  clearTimeout(miniShrink);
  const want = miniTarget(miniZoom);
  if (want > cv2.width * (settled ? 1 : 1.1)) setMiniRes(want);
  else if (want < cv2.width) miniShrink = setTimeout(() => setMiniRes(miniTarget(miniZoom)), 340);
}

miniPlace(false);
addEventListener('resize', () => miniPlace(false), { passive: true });
addEventListener('orientationchange', () => setTimeout(() => miniPlace(false), 250));

// Порог ровно тот, что просили: экранчик выезжает, когда телефон скрыт больше
// чем наполовину. Считаем на скролле — это работает в любом браузере, в отличие
// от наблюдателя пересечений, который в некоторых обёртках молчит.
let miniTick = 0, miniTipTimer = 0, miniTipSeen = false;
let phoneOnScreen = true;
function updateMini() {
  const r = phoneEl.getBoundingClientRect();
  const vh = viewport().h;
  const visible = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
  const show = r.height > 0 && visible / r.height < 0.5;
  phoneOnScreen = visible > 0;
  // свет за телефоном горит, пока сам телефон в кадре: на прокрутке он не нужен
  document.body.classList.toggle('dim', show);
  if (show === miniWrap.classList.contains('show')) return;
  if (show) miniPlace(false);  // панель браузера могла сдвинуть видимую область
  miniWrap.classList.toggle('show', show);
  miniWrap.setAttribute('aria-hidden', show ? 'false' : 'true');
  // спрятанному экранчику кадры не копируем — на выезде он получает свежий
  miniShown = show;
  if (show && !setMiniRes(miniTarget(miniZoom))) drawMini();
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
window.visualViewport?.addEventListener('resize', () => { miniPlace(false); miniSharpen(); queueMini(); });
window.visualViewport?.addEventListener('scroll', queueMini);
updateMini();
// Шапку в островок сажает theme.js — одинаково на всех страницах.

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
const phoneZone = $('phoneZone') || phoneEl;
if (!DEMO) phoneZone.addEventListener('click', e => {
  if (placing) return;   // в режиме «Расположение» телефон — холст, а не переключатель тем
  if (!e.target.closest('a, button, input')) nextTheme();
});

// Прокрутку к нужному месту ведём сами: встроенная «плавная» на айфоне
// короткая и встаёт рывком. Здесь медленный ход с мягким разгоном и посадкой,
// а палец или колесо сразу забирают управление.
let slowStop = null;
function slowScroll(top) {
  slowStop?.();
  const root = document.documentElement;
  const from = scrollY;
  const dist = Math.max(0, Math.min(root.scrollHeight - innerHeight, top)) - from;
  if (Math.abs(dist) < 2) return;
  const duration = reduceMotion ? 0 : Math.min(1600, 750 + Math.abs(dist) * 0.45);
  const grab = ['touchstart', 'wheel', 'keydown'];
  const t0 = performance.now();
  let raf = 0;
  const stop = () => {
    cancelAnimationFrame(raf);
    root.style.scrollBehavior = '';
    grab.forEach(type => removeEventListener(type, stop));
    if (slowStop === stop) slowStop = null;
  };
  slowStop = stop;
  grab.forEach(type => addEventListener(type, stop, { passive: true }));
  root.style.scrollBehavior = 'auto';   // иначе каждый шаг сам запустит встроенную плавность
  const step = now => {
    const p = duration ? Math.min(1, (now - t0) / duration) : 1;
    const e = p < 0.5 ? 4 * p ** 3 : 1 - (2 - 2 * p) ** 3 / 2;
    scrollTo(0, from + dist * e);
    if (p < 1) raf = requestAnimationFrame(step);
    else stop();
  };
  raf = requestAnimationFrame(step);
}

// Логотип в шапке на главной никуда не уводит — просто мотает к началу:
// перезагружать ту же страницу ради этого незачем.
const headLogo = document.querySelector('header .logo');
if (headLogo) {
  headLogo.addEventListener('click', e => {
    if (location.pathname !== '/') return;
    e.preventDefault();
    slowScroll(0);
  });
}

// Свет за телефоном вспыхивает от нажатия. Слой перезапускаем вручную: без
// снятия класса вторая вспышка подряд просто не начнётся.
const phoneFlash = document.querySelector('.phone-flash');
if (phoneFlash) {
  const unpress = () => phoneEl.classList.remove('press');
  (document.getElementById('phoneZone') || phoneEl).addEventListener('pointerdown', () => {
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

// Подсветка в таблетках переезжает к выбранной, а не телепортируется. Это
// отдельный слой под кнопками. По дороге передний край убегает вперёд, задний
// догоняет — подсветка вытягивается каплей и мягко садится на место. Следим за
// классом .on, а не за кликами: кнопку включает и восстановление настроек, и
// замок логотипа.
function glideSeg(seg) {
  const pill = document.createElement('span');
  pill.className = 'seg-pill';
  pill.setAttribute('aria-hidden', 'true');
  seg.prepend(pill);
  seg.classList.add('glide');
  let current = null, edges = null, moves = [];

  function sync(animate) {
    const btn = seg.querySelector('button.on');
    pill.hidden = !btn;
    if (!btn || !btn.offsetWidth) return;       // спрятанный ряд померим, когда покажут
    const to = { l: btn.offsetLeft, r: seg.clientWidth - btn.offsetLeft - btn.offsetWidth };
    const jump = animate && current && btn !== current && !reduceMotion;
    current = btn;
    pill.style.top = btn.offsetTop + 'px';
    pill.style.height = btn.offsetHeight + 'px';
    if (edges && Math.abs(edges.l - to.l) < 0.5 && Math.abs(edges.r - to.r) < 0.5) return;
    // подсветка ещё в пути — едем с того места, где она сейчас
    const now = getComputedStyle(pill);
    const from = moves.length ? { l: parseFloat(now.left), r: parseFloat(now.right) } : edges;
    moves.forEach(a => a.cancel());
    moves = [];
    edges = to;
    pill.style.left = to.l + 'px';
    pill.style.right = to.r + 'px';
    if (!jump || !from) return;
    if (seg.scrollWidth > seg.clientWidth + 1) reveal(btn);
    const T = Math.round(Math.min(640, Math.max(380, 320 + Math.abs(to.l - from.l) * 0.5)));
    const lead = { duration: T * 0.7, easing: 'cubic-bezier(.3, .7, .2, 1)' };
    const tail = { duration: T, easing: 'cubic-bezier(.6, 0, .2, 1)' };
    const right = to.l > from.l;
    const run = [
      pill.animate([{ left: from.l + 'px' }, { left: to.l + 'px' }], right ? tail : lead),
      pill.animate([{ right: from.r + 'px' }, { right: to.r + 'px' }], right ? lead : tail),
    ];
    moves = run;
    Promise.all(run.map(a => a.finished)).then(() => { if (moves === run) moves = []; }, () => {});
  }

  // в ряду, который едет вбок, выбранную таблетку подвозим в кадр
  function reveal(btn) {
    const edge = 24, l = btn.offsetLeft, r = l + btn.offsetWidth;
    if (l >= seg.scrollLeft + edge && r <= seg.scrollLeft + seg.clientWidth - edge) return;
    seg.scrollTo({ left: l + btn.offsetWidth / 2 - seg.clientWidth / 2, behavior: 'smooth' });
  }

  new MutationObserver(() => sync(true))
    .observe(seg, { subtree: true, attributes: true, attributeFilter: ['class'] });
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => sync(false));
    ro.observe(seg);
    seg.querySelectorAll('button').forEach(b => ro.observe(b));
  }
  document.fonts?.ready.then(() => sync(false));
  sync(false);
}
document.querySelectorAll('main .seg').forEach(glideSeg);

bindSeg('mode', v => {
  state.mode = v;
  state.place.dots.cols = 0;   // у каждого режима свой набор «в ряду»
  if (typeof placeSync === 'function') placeSync();
  $('birthRow').hidden = v !== 'life';
  $('goalRow').hidden = v !== 'goal';
  if (!customTitle && !bgAutoTitle) {
    state.title = TITLES[v];
    $('title').value = state.title;
  }
}, true);
bindSeg('shape', v => { state.shape = v; paintShapeChips(); });
// Канва не умеет ждать шрифт сама: пока файл не подгружен, она молча рисует
// системным. Поэтому сначала просим шрифт под нынешний текст, потом перерисовываем.
async function useFont(key) {
  state.font = key;
  const f = FONTS[key];
  if (key !== 'system' && document.fonts) {
    const family = f.css.split(',')[0].trim();
    try { await document.fonts.load(`${f.st || ''} ${f.w} 64px ${family}`.trim(), FONT_SAMPLE + (state.title || '')); } catch {}
  }
  draw();
}
bindSeg('font', v => { useFont(v); });

bindSeg('glass', v => { state.glass = v !== '0'; state.glow = v === '2'; paintShapeChips(); }, true);
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


let bgTipTimer = 0;
function showBgTip(text) {
  const tip = $('bgTip');
  tip.textContent = text;
  tip.hidden = !text;
  clearTimeout(bgTipTimer);
  if (text) bgTipTimer = setTimeout(() => { tip.hidden = true; }, 5000);
}

// Свой заголовок сильнее фона. Фон с готовым названием (Дембель, Рамадан, Мёд)
// текст, написанный руками, молча не трогает: над нажатой кнопкой всплывает
// маленький вопрос «Изменить заголовок под фон?». Раньше название брал второй
// тап по той же кнопке — и случайный двойной тап стирал текст человека.
const bgAsk = $('bgAsk');
let bgAskFor = '', bgAskGen = 0;

function askBgTitle(v) {
  const btn = $('bg').querySelector(`button[data-v="${v}"]`);
  if (!btn) return;
  bgAskFor = v;
  bgAskGen++;
  bgAsk.hidden = false;
  bgAsk.classList.remove('show');
  const f = bgAsk.parentElement.getBoundingClientRect();
  const b = btn.getBoundingClientRect();
  const w = bgAsk.offsetWidth, h = bgAsk.offsetHeight;
  const cx = b.left + b.width / 2 - f.left;
  const left = Math.max(0, Math.min(f.width - w, cx - w / 2));
  // над кнопкой, чтобы палец не закрывал вопрос; под шапкой места нет — под кнопкой
  const head = document.querySelector('header').getBoundingClientRect().bottom;
  const below = b.top - h - 10 < head + 6;
  bgAsk.classList.toggle('below', below);
  bgAsk.style.left = left + 'px';
  bgAsk.style.top = (below ? b.bottom - f.top + 10 : b.top - f.top - h - 10) + 'px';
  bgAsk.style.setProperty('--ox', (cx - left) + 'px');   // растёт из нажатой кнопки
  void bgAsk.offsetWidth;
  bgAsk.classList.add('show');
}

function hideBgAsk() {
  if (bgAsk.hidden) return;
  bgAskFor = '';
  const gen = ++bgAskGen;
  bgAsk.classList.remove('show');
  setTimeout(() => { if (gen === bgAskGen) bgAsk.hidden = true; }, 200);
}

$('bgAskYes').addEventListener('click', () => {
  const v = bgAskFor;
  hideBgAsk();
  if (!BG_TITLES[v] || state.bg !== v) return;
  state.title = BG_TITLES[v];
  $('title').value = state.title;
  bgAutoTitle = true;
  customTitle = false;
  draw();
});
$('bgAskNo').addEventListener('click', hideBgAsk);
// тап мимо окошка — тоже «нет»; тап по другому фону решает обработчик ниже
addEventListener('pointerdown', e => {
  if (!bgAsk.hidden && !e.target.closest('#bgAsk, #bg')) hideBgAsk();
}, { passive: true });

bindSeg('bg', v => {
  $('bgOwn').classList.remove('on');
  markOn('themes', '');
  state.bg = v;
  customBgImg = null;
  state.bgImageId = null;
  showBgTip('');
  dropThemeText();
  if (BG_TITLES[v] && customTitle) {
    // текст написан руками — не трогаем, только спрашиваем
    if (state.title !== BG_TITLES[v]) askBgTitle(v); else hideBgAsk();
  } else {
    hideBgAsk();
    if (BG_TITLES[v]) {
      state.title = BG_TITLES[v];
      $('title').value = state.title;
      bgAutoTitle = true;
    } else if (bgAutoTitle) {
      state.title = TITLES[state.mode];
      $('title').value = state.title;
      bgAutoTitle = false;
    }
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
  return j.id;
}

$('bgOwn').addEventListener('click', () => $('bgFile').click());

// --- темы: фон, точки, шрифт и цвета текста разом ---
function markOn(id, v) {
  const box = $(id);
  if (box) box.querySelectorAll('button[data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === String(v)));
}

function dropThemeText() {
  state.textColor = state.textMuted = state.textStroke = '';
}

function applyLook(look) {
  state.shape = look.shape;
  markOn('shape', look.shape);
  state.glass = !!look.glass;
  state.glow = !!look.glow;
  markOn('glass', look.glow ? '2' : look.glass ? '1' : '0');
  state.color = look.color;
  customColor = !COLORS.includes(look.color);
  swatches.querySelectorAll('.swatch').forEach(b => b.classList.toggle('on', b.dataset.v === look.color));
  $('colorPick').value = look.color;
  state.textColor = look.textColor || '';
  state.textMuted = look.textMuted || '';
  state.textStroke = look.textStroke || '';
  paintShapeChips();
  markOn('font', look.font);
  if (look.font !== state.font) useFont(look.font);
  showSelected('shape');
  showSelected('font');
}

const THEME_ORDER = Object.keys(VitaScenes.THEMES);

function pickTheme(key, redraw = true) {
  const t = VitaScenes.THEMES[key];
  if (!t) return;
  state.bg = t.bg;
  customBgImg = null;
  state.bgImageId = null;
  $('bgOwn').classList.remove('on');
  markOn('bg', t.bg);
  markOn('themes', key);
  showSelected('bg');
  showSelected('themes');
  hideBgAsk();
  showBgTip('');
  // у Дембеля, Рамадана и Мёда есть своё название — предлагаем его так же,
  // как это делал выбор фона
  if (BG_TITLES[key] && customTitle) {
    if (state.title !== BG_TITLES[key]) askBgTitle(key);
  } else if (BG_TITLES[key]) {
    state.title = BG_TITLES[key];
    $('title').value = state.title;
    bgAutoTitle = true;
  } else if (bgAutoTitle) {
    state.title = TITLES[state.mode];
    $('title').value = state.title;
    bgAutoTitle = false;
  }
  applyLook(t);
  refreshSwatches();
  // тема встаёт сразу; по тапу рисовать нечего — сетку тут же заливает animateFill,
  // и лишний полный кадр мелькнул бы всеми точками разом
  if (redraw) draw();
  // следующую сцену рисуем заранее, пока человек смотрит на эту
  const next = THEME_ORDER[(THEME_ORDER.indexOf(key) + 1) % THEME_ORDER.length];
  if (VitaScenes.SCENES.includes(VitaScenes.THEMES[next].bg)) {
    (window.requestIdleCallback || (f => setTimeout(f, 400)))(() => VitaScenes.scene(VitaScenes.THEMES[next].bg));
  }
}

$('themes').addEventListener('click', e => {
  const btn = e.target.closest('button[data-v]');
  if (btn) pickTheme(btn.dataset.v);
});

// Тап по телефону (и по полю вокруг него) — следующая тема. Защита от частых
// тапов: точки добегают, проходит секунда, и только потом телефон слушает снова.
let themeLock = 0, tipTimer = 0;
function nextTheme() {
  const now = performance.now();
  if (now < themeLock) return;
  const { done } = counts();
  const run = reduceMotion || done <= 0 ? 0 : FILL_MS;
  themeLock = now + run + 300;
  const i = THEME_ORDER.indexOf(state.bg);
  const key = THEME_ORDER[(i + 1) % THEME_ORDER.length];
  // сначала встаёт новая тема, и уже её точки заливают сетку
  pickTheme(key, false);
  const tip = $('phoneTip');
  if (tip) {
    tip.textContent = document.querySelector(`#themes [data-v="${key}"]`)?.textContent || '';
    tip.hidden = false;
    tip.classList.remove('gone');
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => tip.classList.add('gone'), 1600);
  }
  animateFill(fillLimit());
  try { localStorage.setItem('vitaThemeTap', '1'); } catch {}
}
try { if (localStorage.getItem('vitaThemeTap') && $('phoneTip')) $('phoneTip').classList.add('gone'); } catch {}

// --- «Ещё»: в каждой сетке видно три ряда, остальное открывается кнопкой ---
const ROWS_SHOWN = 2, GRID_GAP = 8, WRAP_PAD = 52;   // поля обёртки под свечение

function setupMore(wrap) {
  const grid = wrap.firstElementChild;
  if (!grid) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'more-btn';
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = '<span class="more-label">Ещё</span>'
    + '<svg class="more-chev" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6.5 9.5 12 15l5.5-5.5"></path></svg>';
  wrap.after(btn);
  let open = false, anim = null;

  const rowTop = el => el.offsetTop - grid.offsetTop;
  const cutAt = () => {
    const rows = [...new Set([...grid.children].map(rowTop))].sort((a, b) => a - b);
    return rows.length > ROWS_SHOWN ? rows[ROWS_SHOWN] - GRID_GAP : 0;
  };

  function settle(cut) {
    btn.hidden = !cut;
    wrap.style.height = !cut || open ? 'auto' : cut + WRAP_PAD + 'px';
    [...grid.children].forEach(el => {
      const hidden = !!cut && !open && rowTop(el) >= cut;
      el.inert = hidden;
      el.setAttribute('aria-hidden', hidden ? 'true' : 'false');
    });
  }

  function toggle(next, animate = true) {
    if (next === open) return;
    const from = wrap.getBoundingClientRect().height;
    open = next;
    btn.setAttribute('aria-expanded', String(open));
    btn.classList.toggle('open', open);
    btn.querySelector('.more-label').textContent = open ? 'Свернуть' : 'Ещё';
    const cut = cutAt();
    const shown = [...grid.children].filter(el => rowTop(el) >= cut);
    settle(cut);
    anim?.cancel();
    if (!animate || reduceMotion) return;
    const to = open ? wrap.scrollHeight : cut + WRAP_PAD;
    anim = wrap.animate([{ height: from + 'px' }, { height: to + 'px' }],
      { duration: open ? 500 : 380, easing: 'cubic-bezier(.32, .72, 0, 1)' });
    anim.onfinish = () => { wrap.style.height = open ? 'auto' : cut + WRAP_PAD + 'px'; anim = null; };
    if (open) {
      shown.forEach((el, k) => el.animate(
        [{ opacity: 0, transform: 'scale(.97)' }, { opacity: 1, transform: 'none' }],
        { duration: 380, delay: 40 + k * 22, easing: 'cubic-bezier(.32, .72, 0, 1)', fill: 'backwards' }));
    }
  }

  btn.addEventListener('click', () => toggle(!open));
  settle(cutAt());
  grid.__more = {
    refresh: () => { if (!anim) settle(cutAt()); },
    reveal: el => {
      if (open || !el) return;
      const cut = cutAt();
      if (cut && rowTop(el) >= cut) toggle(true);
    },
  };
}

function showSelected(id) {
  const grid = $(id);
  grid?.__more?.reveal(grid.querySelector('.on'));
}

document.querySelectorAll('.more-wrap').forEach(setupMore);
new MutationObserver(() => paintShapeChips())
  .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

// Форма точек — лентой, как шрифты: на таблетке нарисована сама точка,
// тем же кодом, что уйдёт на обои, и тем же цветом, что выбран.
const shapeChips = new Map();
function paintShapeChips() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const box = 34, d = 26;
  const keepShape = state.shape, keepGlass = state.glass, keepGlow = state.glow;
  // точки на таблетках всегда одного цвета — белые в тёмной теме сайта; на
  // выбранной таблетке фон белый, поэтому там точка тёмная
  const css = getComputedStyle(document.documentElement);
  const plain = css.getPropertyValue('--text').trim() || '#f2f2f2';
  const onPill = css.getPropertyValue('--seg-on-text').trim() || '#000000';
  for (const btn of $('shape').querySelectorAll('button[data-v]')) {
    let cv = shapeChips.get(btn);
    if (!cv) {
      cv = document.createElement('canvas');
      cv.className = 'shape-chip';
      cv.width = Math.round(box * dpr);
      cv.height = Math.round(box * dpr);
      btn.textContent = '';
      btn.appendChild(cv);
      shapeChips.set(btn, cv);
    }
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, box, box);
    state.shape = btn.dataset.v;
    state.glass = keepGlass;
    state.glow = false;
    drawDot(c, (box - d) / 2, (box - d) / 2, d,
      btn.classList.contains('on') ? onPill : plain, 'filled', 0, false, 3);
  }
  state.shape = keepShape;
  state.glass = keepGlass;
  state.glow = keepGlow;
}
paintShapeChips();
document.fonts?.ready.then(() => document.querySelectorAll('.more-wrap').forEach(w => w.firstElementChild?.__more?.refresh()));
addEventListener('resize', () => document.querySelectorAll('.more-wrap').forEach(w => w.firstElementChild?.__more?.refresh()));

$('bgColorPick').addEventListener('input', e => {
  markOn('themes', '');
  dropThemeText();
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

// --- экран «Домой»: что видно за иконками ---
let homeTipTimer = 0;
function showHomeTip(text) {
  const tip = $('homeTip');
  tip.textContent = text;
  tip.hidden = !text;
  clearTimeout(homeTipTimer);
  if (text) homeTipTimer = setTimeout(() => { tip.hidden = true; }, 5000);
}

function paintHomeRows() {
  const mode = state.home.mode;
  $('homeBlurRow').hidden = mode !== 'blur';
  $('homeHint').hidden = mode !== 'blur';
  $('homeColorRow').hidden = mode !== 'color';
  $('homeOwn').hidden = mode !== 'photo';
  $('homeOwn').classList.toggle('on', mode === 'photo' && !!customHomeImg);
}
paintHomeRows();

// Телефон показывает либо блокировку, либо «Домой». Тронул настройку — показали
// «Домой» сразу: иначе человек крутит ползунок и не видит, что меняется.
function setHomeOn(on) {
  if (homeOn === on) return;
  homeOn = on;
  const peek = $('homePeek');
  peek.setAttribute('aria-pressed', on ? 'true' : 'false');
  peek.textContent = on ? 'вернуть' : 'смотреть';
  peek.setAttribute('aria-label',
    on ? 'Вернуть экран блокировки' : 'Показать экран «Домой» на телефоне');
  if (on) draw(); else animateReveal(560);
}

// ползунок бежит быстрее, чем кадр успевает: лишние ходы схлопываем в один
let homeRAF = 0;
function homeDraw() {
  if (homeRAF) return;
  homeRAF = requestAnimationFrame(() => { homeRAF = 0; draw(); });
}

bindSeg('home', v => {
  state.home.mode = ['blur', 'color', 'photo'].includes(v) ? v : 'blur';
  paintHomeRows();
  if (state.home.mode === 'photo' && !customHomeImg) showHomeTip('выбери своё фото');
  setHomeOn(true);
});

$('homeBlur').addEventListener('input', e => {
  state.home.blur = Math.max(0, Math.min(100, Number(e.target.value) || 0));
  $('homeBlurVal').textContent = state.home.blur + ' %';
  setHomeOn(true);
  homeDraw();
});

$('homeColorPick').addEventListener('input', e => {
  state.home.color = e.target.value;
  setHomeOn(true);
  homeDraw();
});

$('homePeek').addEventListener('click', () => setHomeOn(!homeOn));
$('homeOwn').addEventListener('click', () => $('homeFile').click());
$('homeFile').addEventListener('change', e => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (file) cropOpen(file, 'home');
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
  hideBgAsk();
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
  if (state.home.mode === 'photo' && !state.home.photo) {
    err.textContent = 'Выбери фото для экрана «Домой» или вернись к размытию';
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
        bgImage: state.bgImageId || '', shape: state.shape, glass: state.glass, glow: state.glow,
        textColor: state.textColor, textMuted: state.textMuted, textStroke: state.textStroke,
        title: state.title, font: state.font, footer: state.footer, brand: state.brand, birth: state.birth,
        start: state.start, end: state.end, place: state.place, home: state.home,
        ownerToken: window.VitaID?.token() || '', tz: phoneTZ,
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
  // пришли по чужой ссылке — обои уже собраны, кнопка сразу их и делает
  if (sharedOn) { makeWallpaper($('heroBtn'), $('heroErr')); return; }
  const target = $('tune');
  if (!target) return;
  const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
  slowScroll(target.getBoundingClientRect().top + scrollY - margin);
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

// Строка под «Сохранить»: обычный текст, ошибка или зелёная пилюля «Сохранено».
// «Сохранить» → «Сохраняю…» → «Сохранено»: заливка уходит, остаётся белая
// рамка, будто кнопку прожали. Отдельной строки под кнопкой для этого не нужно.
function setSaveState(kind = '') {
  const btn = $('profSave');
  btn.classList.toggle('busy', kind === 'busy');
  btn.classList.toggle('done', kind === 'done');
  btn.textContent = kind === 'done' ? 'Сохранено' : kind === 'busy' ? 'Сохраняю…' : 'Сохранить';
}

function setProfStatus(text, kind = '') {
  const el = $('profStatus');
  el.classList.remove('ok', 'err');
  if (kind === 'ok') void el.offsetWidth;   // пилюля выскакивает заново и при повторном сохранении
  el.textContent = text;
  if (kind) el.classList.add(kind);
}

function paintAvatar(url) {
  const btn = $('avatarBtn'), btnImg = $('avatarBtnImg'), bigImg = $('avaImg');
  btn.classList.toggle('filled', !!url);
  btnImg.hidden = !url;
  bigImg.hidden = !url;
  if (!url) return;
  // снимок мог пропасть с сервера: тогда показываем силуэт, а не битый значок
  const fail = () => {
    btnImg.hidden = true;
    bigImg.hidden = true;
    btn.classList.remove('filled');
  };
  btnImg.onerror = fail;
  bigImg.onerror = fail;
  btnImg.src = url;
  bigImg.src = url;
}

function paintTagNote(profile, extra) {
  const note = $('tagNote'), input = $('profTag');
  if (extra) { note.textContent = extra.text; note.className = 'tag-note ' + (extra.cls || ''); return; }
  note.className = 'tag-note';
  const left = profile.handleLeft ?? 1;
  input.disabled = !!profile.handleLocked;
  if (profile.handleLocked || left < 1) note.textContent = 'Тег закреплён навсегда';
  else note.textContent = 'Изменить тег можно один раз';
}

// Занятый тег показываем прямо под полем, пока человек печатает, —
// иначе он узнаёт об этом только после «Сохранить».
let tagFreeTimer = 0, tagOwn = '';
// то же правило, что на сервере: латиница, цифры и _, начинать с буквы
const TAG_RE = /^[a-z][a-z0-9_]{1,22}[a-z0-9]$/;
const tagOk = t => TAG_RE.test(t) && !t.includes('__');
function watchTag() {
  const input = $('profTag');
  if (!input) return;
  input.addEventListener('input', () => {
    clearTimeout(tagFreeTimer);
    const tag = input.value.trim().replace(/^@+/, '').toLowerCase();
    if (!tag || tag === tagOwn) { paintTagNote(lastProfile || {}); return; }
    tagFreeTimer = setTimeout(async () => {
      try {
        if (!tagOk(tag)) {
          paintTagNote(null, { text: 'Латиница, цифры и _, начинать с буквы', cls: 'err' });
          return;
        }
        const data = await (await fetch('/api/tag-free?tag=' + encodeURIComponent(tag))).json();
        if (input.value.trim().replace(/^@+/, '').toLowerCase() !== tag) return;
        if (!data.ok) paintTagNote(null, { text: data.why, cls: 'err' });
        else if (!data.free) paintTagNote(null, { text: '@' + tag + ' уже занят — придумай другой', cls: 'err' });
        else paintTagNote(null, { text: '@' + tag + ' свободен', cls: 'ok' });
      } catch {}
    }, 320);
  });
}
let lastProfile = null;
watchTag();

function paintPrime(access) {
  const row = $('primeRow'), state = $('primeState'), buy = $('primeBuy');
  const paid = !!access?.paid;
  row.classList.toggle('on', paid);
  $('profCrown').hidden = !paid;
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
    lastProfile = profile;
    tagOwn = (profile.handle || '').replace(/^@+/, '').toLowerCase();
    $('profTag').value = (profile.handle || '').replace(/^@+/, '');
    paintTagNote(profile);
    paintAvatar(profile.avatar);
    paintPrime(access);
    $('profLogout').hidden = !(access.telegram || access.email);
    $('profMail').hidden = !!(access.telegram || access.email);
    if (!access.telegram && access.tgBot) VitaTG.mount($('tgBoxProfile'), access);
    profileLoaded = true;
  } catch (error) {
    setProfStatus(error.message || 'Не удалось загрузить профиль', 'err');
  }
}

// Карточка вырастает из кружка в шапке и уходит обратно в него. Сама карточка
// едет из точки кружка и растёт, а круглая обрезка раскрывается в её
// прямоугольник. Всё на Web Animations: передумал на полпути — движение
// просто разворачивается назад, без рывка.
const avatarBtn = $('avatarBtn');
const profCard = profModal.querySelector('.profile-modal');
const calmMotion = matchMedia('(prefers-reduced-motion: reduce)');
let profOpen = false, profAnims = [], profGen = 0;
// после «Сохранено» карточка сама уходит через секунду; «Сохранить» ждёт загрузку фото
let profCloseTimer = 0, avaUploading = null;

// Фото из шапки не остаётся висеть наверху: оно само переезжает в карточку на
// своё место и так же возвращается в шапку. Летит копия, а там, откуда фото
// улетело, остаётся пустое место.
const bigAva = profCard.querySelector('.ava-big');
let avaFlyer = null;

function avaFly(fromEl, toEl, timing) {
  avaFlyer?.remove();
  const size = bigAva.offsetWidth || 96;
  const spot = el => {
    const r = el.getBoundingClientRect();
    return `translate(${r.left + r.width / 2 - size / 2}px, ${r.top + r.height / 2 - size / 2}px) scale(${r.width / size})`;
  };
  const from = spot(fromEl), to = spot(toEl);
  // к карточке фото высветляется, обратно — притухает: так видно, что оно
  // переехало, а не телепортировалось
  const dim = toEl === bigAva
    ? ['brightness(.52)', 'brightness(1)']
    : ['brightness(1)', 'brightness(.52)'];
  avaFlyer = bigAva.cloneNode(true);
  avaFlyer.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
  avaFlyer.classList.add('ava-fly');
  avaFlyer.setAttribute('aria-hidden', 'true');
  document.body.append(avaFlyer);
  bigAva.classList.add('ava-wait');
  avatarBtn.classList.add('gone');
  return avaFlyer.animate(
    [{ transform: from, filter: dim[0] }, { transform: to, filter: dim[1] }],
    { ...timing, fill: 'both' });
}

function avaLand() {
  avaFlyer?.remove();
  avaFlyer = null;
  bigAva.classList.remove('ava-wait');
  avatarBtn.classList.toggle('gone', profOpen);
}

// Кадр «карточка сжата в кружок»: квадрат из её середины, уменьшенный до
// размера кружка и поставленный ровно на него.
function profFromAvatar() {
  const a = avatarBtn.getBoundingClientRect();
  const c = profCard.getBoundingClientRect();
  const side = Math.min(c.width, c.height);
  const dx = a.left + a.width / 2 - (c.left + c.width / 2);
  const dy = a.top + a.height / 2 - (c.top + c.height / 2);
  const round = parseFloat(getComputedStyle(profCard).borderTopLeftRadius) || 26;
  return [
    {
      transform: `translate(${dx}px, ${dy}px) scale(${a.width / side})`,
      clipPath: `inset(${(c.height - side) / 2}px ${(c.width - side) / 2}px round ${side / 2}px)`,
    },
    { transform: 'translate(0px, 0px) scale(1)', clipPath: `inset(0px 0px round ${round}px)` },
  ];
}

function profSettle(anims) {
  const gen = ++profGen;
  profAnims = anims;
  Promise.all(anims.map(a => a.finished)).then(() => {
    if (gen !== profGen) return;          // за это время движение развернули
    profAnims = [];
    profCard.classList.remove('morph');
    if (!profOpen) profModal.hidden = true;
    avaLand();                            // фото село на место — копия больше не нужна
    anims.forEach(a => a.cancel());       // снимаем удержание последнего кадра
  }).catch(() => {});
}

function openProfile() {
  if (profOpen) return;
  profOpen = true;
  clearTimeout(profCloseTimer);
  if ($('profStatus').classList.contains('ok')) setProfStatus('');
  setSaveState('');
  avatarBtn.setAttribute('aria-expanded', 'true');
  if (!profileLoaded) loadProfile();
  if (profAnims.length) {                 // карточка ещё уходила — возвращаем её
    profAnims.forEach(a => a.reverse());
    profSettle(profAnims);
    return;
  }
  // карточка встаёт прямо под шапкой, под своим кружком, и на шапку не наезжает
  const head = document.querySelector('header').getBoundingClientRect().bottom;
  profModal.style.setProperty('--prof-top', Math.round(head + 10) + 'px');
  profModal.hidden = false;
  const fade = [{ opacity: 0 }, { opacity: 1 }];
  if (calmMotion.matches) {
    profSettle([profModal.animate(fade, { duration: 200, easing: 'ease-out', fill: 'both' })]);
    return;
  }
  const grow = { duration: 560, easing: 'cubic-bezier(.32, .72, 0, 1)' };
  const fly = avaFly(avatarBtn, bigAva, grow);   // место фото меряем, пока карточка ещё не растёт
  profCard.classList.add('morph');
  profSettle([
    fly,
    profCard.animate(profFromAvatar(), { ...grow, fill: 'both' }),
    profCard.animate(fade, { duration: 140, fill: 'both' }),
    profModal.animate(fade, { duration: 380, easing: 'ease-out', fill: 'both' }),
    ...[...profCard.children].map(el =>
      el.animate(fade, { duration: 300, delay: 150, easing: 'ease-out', fill: 'both' })),
  ]);
}

function closeProfile() {
  if (!profOpen) return;
  profOpen = false;
  clearTimeout(profCloseTimer);
  avatarBtn.setAttribute('aria-expanded', 'false');
  if (profCard.contains(document.activeElement)) avatarBtn.focus({ preventScroll: true });
  if (profAnims.length) {                 // ещё вырастала — уходит тем же путём назад
    profAnims.forEach(a => a.reverse());
    profSettle(profAnims);
    return;
  }
  const fade = [{ opacity: 1 }, { opacity: 0 }];
  if (calmMotion.matches) {
    profSettle([profModal.animate(fade, { duration: 160, easing: 'ease-in', fill: 'both' })]);
    return;
  }
  const shrink = { duration: 400, easing: 'cubic-bezier(.4, 0, .1, 1)' };
  const fly = avaFly(bigAva, avatarBtn, shrink);
  profCard.classList.add('morph');
  profSettle([
    fly,
    profCard.animate(profFromAvatar().reverse(), { ...shrink, fill: 'both' }),
    // в самом конце гаснет, чтобы нырнуть под кружок, а не исчезнуть щелчком
    profCard.animate([{ opacity: 1 }, { opacity: 1, offset: 0.72 }, { opacity: 0 }], { duration: 400, fill: 'both' }),
    profModal.animate(fade, { duration: 400, easing: 'ease-in', fill: 'both' }),
    ...[...profCard.children].map(el =>
      el.animate(fade, { duration: 150, easing: 'ease-in', fill: 'both' })),
  ]);
}

avatarBtn.addEventListener('click', () => (profOpen ? closeProfile() : openProfile()));
$('profileClose').addEventListener('click', closeProfile);
// тронул карточку после «Сохранено» — значит, ещё не всё: пусть остаётся
profCard.addEventListener('pointerdown', () => clearTimeout(profCloseTimer));
profCard.addEventListener('input', () => clearTimeout(profCloseTimer));
profModal.addEventListener('click', e => { if (e.target === profModal) closeProfile(); });
addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!cropModal.hidden) { $('cropCancel').click(); return; }
  if (!bgAsk.hidden) { hideBgAsk(); return; }
  closeProfile();
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
  home: {
    cw: W / 3, ch: H / 3, ow: W, oh: H,
    title: 'Фото для экрана «Домой»',
    hint: 'Двигай пальцем, меняй размер щипком — под иконки попадёт то, что в рамке.',
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
  else if (cropMode === 'home') showHomeTip(text.toLowerCase());
  else $('profStatus').textContent = text;
}

function cropOpen(file, mode = 'ava') {
  const m = CROP_MODES[mode] || CROP_MODES.ava;
  cropMode = CROP_MODES[mode] ? mode : 'ava';
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    cropCanvas.width = m.cw;
    cropCanvas.height = m.ch;
    cropView.classList.toggle('crop-phone', cropMode !== 'ava');
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
    markOn('themes', '');
    dropThemeText();
    $('bg').querySelectorAll('button').forEach(b => b.classList.remove('on'));
    $('bgOwn').classList.add('on');
    showBgTip('');
    refreshSwatches();
    animateReveal();
    out.toBlob(async blob => {
      if (!blob) { showBgTip('не получилось обрезать фото, попробуй другое'); return; }
      try {
        state.bgImageId = await uploadBgFile(new File([blob], 'bg.jpg', { type: 'image/jpeg' }));
      } catch {
        state.bgImageId = null;
        showBgTip('фото не загрузилось — нажми «своё фото» ещё раз');
      }
    }, 'image/jpeg', 0.92);
    return;
  }

  if (mode === 'home') {
    customHomeImg = out;
    state.home.mode = 'photo';
    markOn('home', 'photo');
    paintHomeRows();
    showHomeTip('');
    setHomeOn(true);
    homeDraw();
    out.toBlob(async blob => {
      if (!blob) { showHomeTip('не получилось обрезать фото, попробуй другое'); return; }
      try {
        state.home.photo = await uploadBgFile(new File([blob], 'home.jpg', { type: 'image/jpeg' }));
      } catch {
        state.home.photo = '';
        showHomeTip('фото не загрузилось — нажми «своё фото» ещё раз');
      }
    }, 'image/jpeg', 0.92);
    return;
  }

  setProfStatus('Загружаю фото…');
  // «Сохранить» дожидается этой загрузки, иначе карточка уйдёт раньше фото
  avaUploading = new Promise(resolve => out.toBlob(async blob => {
    if (!blob) { setProfStatus('Не получилось обрезать фото', 'err'); resolve(false); return; }
    try {
      const data = await VitaID.uploadAvatar(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
      paintAvatar(data.avatar);
      if (!$('profSave').disabled) setProfStatus('Фото обновлено');   // идёт сохранение — строкой владеет оно
      resolve(true);
    } catch (error) {
      setProfStatus(error.message || 'Не получилось загрузить фото', 'err');
      resolve(false);
    }
  }, 'image/jpeg', 0.92));
});

$('avaFile').addEventListener('change', e => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (file) cropOpen(file);
});

// «Сохранить» — последний шаг: пилюля «Сохранено», секунда, чтобы её прочитать,
// и карточка сама уходит в кружок. Крестик — для тех, кто открыл случайно.
$('profSave').addEventListener('click', async () => {
  const btn = $('profSave');
  clearTimeout(profCloseTimer);
  btn.disabled = true;
  setProfStatus('');
  setSaveState('busy');
  try {
    const photo = avaUploading;
    avaUploading = null;
    if (photo && !(await photo)) {
      setProfStatus('Фото не загрузилось — выбери его ещё раз', 'err');
      setSaveState('');
      return;
    }
    const data = await VitaID.updateProfile({ handle: $('profTag').value.trim() });
    lastProfile = data;
    tagOwn = (data.handle || '').replace(/^@+/, '').toLowerCase();
    $('profTag').value = (data.handle || '').replace(/^@+/, '');
    paintTagNote(data);
    setSaveState('done');
    profCloseTimer = setTimeout(closeProfile, 1400);
  } catch (error) {
    setProfStatus(error.message || 'Не удалось сохранить', 'err');
    setSaveState('');
  } finally {
    btn.disabled = false;
  }
});

$('profMail').addEventListener('click', () => {
  closeProfile();
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
  // С главной — голый /register: дверь и так вернёт на «/». Адрес с хвостом
  // ?next=%2F Safari держал в списке мошеннических (19.09 ещё ловился на маке
  // со старой базой), а /register без хвоста там не значился.
  location.replace(back === '/' ? '/register' : '/register?next=' + encodeURIComponent(back));
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


// ——— Режим «Расположение» ———————————————————————————————————
// Человек тащит пальцем прямо по телефону: сетку точек, заголовок, значок vita
// и счётчик. Панель снизу меняет размер выбранного и число точек в ряду.
// Границы — PLACE_BOX; выше первого ряда точки не пускаем, там часы.
const PLACE_COLS = {
  month: [0, 5, 6, 10, 15],
  year: [0, 10, 14, 20, 30],
  life: [0, 26, 52, 60],
  goal: [0, 5, 6, 10, 14],
};
// ——— Слой айфона поверх превью ————————————————————————————————
// Статус-бар, дата с погодой, часы и виджеты снизу — ровно то, что айфон
// рисует поверх обоев сам. Это ориентир, чтобы видеть, как точки уживаются с
// часами и виджетами: на готовые обои ничего из этого не попадает и на сервер
// не уезжает, поэтому и живёт отдельно от state.place.
const CHROME_FACE = '-apple-system, "SF Pro Display", system-ui, sans-serif';
const chromeFont = (px, w = 500) => `${w} ${Math.round(px)}px ${CHROME_FACE}`;
// Мерки сняты 24.09.2026 со скринов редактора экрана блокировки владельца
// (iOS 26): верх цифр на 345, высота 260, «11:39» шириной 838; растянутые до
// упора — высота 1051 (низ на 55 % экрана) и ширина 1033.
const CLOCK_TOP = 345;      // верх цифр у обычных часов
const CLOCK_PX = 356;       // их кегль: SF Pro Display 500 даёт ровно 260 в высоту
const CLOCK_H = 260;        // высота цифр у обычных часов (айфон 15 Pro, 1179×2556)
const CLOCK_WIDE = 0.16;    // растянутые часы ещё и шире
const CLOCK_TALL = 3.04;    // предел растяжки по высоте, как в iOS 26
// значки фонарика и камеры внизу экрана блокировки (поле 24×24)
const TORCH = new Path2D('M8.6 3h6.8v3.4l-1.6 2.4V20a1 1 0 0 1-1 1h-1.6a1 1 0 0 1-1-1V8.8L8.6 6.4z');
const CAMERA = new Path2D('M4 8.2a1.6 1.6 0 0 1 1.6-1.6h2.2L9.3 4.8h5.4l1.5 1.8h2.2A1.6 1.6 0 0 1 20 8.2v9.2a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 17.4zM15.4 12.8a3.4 3.4 0 1 1-6.8 0a3.4 3.4 0 1 1 6.8 0z');

let chromeOn = true, clockH = 1;
try {
  chromeOn = localStorage.getItem('vitaChrome') !== '0';
  const v = parseFloat(localStorage.getItem('vitaClockH'));
  if (v >= 1 && v <= 1 + CLOCK_TALL) clockH = v;
} catch {}
function chromeSave() {
  try {
    localStorage.setItem('vitaChrome', chromeOn ? '1' : '0');
    localStorage.setItem('vitaClockH', String(clockH));
  } catch {}
}

// Айфон красит свои значки по обоям: на светлых — тёмным. Фоном бывает и фото,
// и сцена, и градиент, поэтому смотрим на готовый кадр, а не на имя фона.
// Цвет значков помним по каждому фону, а не только по последнему: человек
// щёлкает фоны туда-сюда, и каждый возврат стоил бы нового чтения пикселей.
const inkCache = new Map();
const inkPick = document.createElement('canvas');
function chromeInk(c = ctx) {
  const key = [state.bg, state.bgColor,
    customBgImg ? customBgImg.width + 'x' + customBgImg.height : '',
    // на «Домой» фон другой: цвет, фото или размытые обои — ключ это помнит
    homeOn ? [state.home.mode, state.home.color, state.home.blur,
      customHomeImg ? 'photo' : ''].join(',') : ''].join('|');
  const known = inkCache.get(key);
  if (known) return known;
  const k = c.canvas.width / W;
  let sum = 0, n = 0;
  try {
    // Двадцать пять точек забираем одним чтением: каждый getImageData тормозит
    // кадр на своём месте (видеопамять отдаёт пиксели не сразу), и двадцать
    // пять таких чтений стоили полсотни миллисекунд. Пиксели те же самые —
    // просто сперва собираем их в крошечную канву.
    if (inkPick.width !== 5) { inkPick.width = 5; inkPick.height = 5; }
    const ip = inkPick.getContext('2d', { willReadFrequently: true });
    for (let i = 1; i <= 5; i++) {
      const ys = [120, 520, 900, 2070, 2480];
      for (let j = 0; j < 5; j++) {
        ip.drawImage(c.canvas, Math.round(W * i / 6 * k), Math.round(ys[j] * k), 1, 1, i - 1, j, 1, 1);
      }
    }
    const px = ip.getImageData(0, 0, 5, 5).data;
    for (let i = 0; i < px.length; i += 4) {
      sum += (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
      n++;
    }
  } catch {}
  const ink = n && sum / n > 0.62 ? '17, 17, 19' : '255, 255, 255';
  if (n) inkCache.set(key, ink);
  return ink;
}

// Часы: ползунок тянет их вверх ровно так, как это делает айфон — цифры
// становятся выше и немного шире, а верх остаётся на месте.
// На часах — сейчашнее время, как на айфоне: «00:00» шире почти любого
// настоящего времени, и растянутые до упора часы вылезали за края.
const clockText = () => new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

function clockGeom() {
  const t = Math.min(1, Math.max(0, (clockH - 1) / CLOCK_TALL));
  const px = CLOCK_PX * (1 + CLOCK_WIDE * t);
  const w8 = Math.round(500 + 260 * t);
  ctx.save();
  ctx.textBaseline = 'alphabetic';   // мерка ascent считается от текущей линии
  ctx.font = chromeFont(px, w8);
  const m = ctx.measureText(clockText());
  ctx.restore();
  const asc = m.actualBoundingBoxAscent || px * 0.73;
  // высоту берём из мерки айфона, а не из шрифта: где нет SF, цифры другой
  // высоты, а часы всё равно должны встать ровно туда, куда их ставит iOS
  const h = CLOCK_H * clockH;
  return { px, w8, asc, ky: h / asc, w: m.width, h, top: CLOCK_TOP };
}

function drawChrome() {
  const rgb = chromeInk();
  const ink = a => `rgba(${rgb}, ${a})`;
  const box = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  drawStatusBar(ctx, ink, '');

  // дата с погодой одной строкой, как на экране блокировки
  const day = new Date().toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric' });
  const left = day.charAt(0).toUpperCase() + day.slice(1), right = '14°';
  ctx.font = chromeFont(60, 600);
  const wL = ctx.measureText(left).width, wR = ctx.measureText(right).width;
  const gap = 22, cloudW = 66, dy = 236;
  let x = (W - (wL + gap + cloudW + gap + wR)) / 2;
  ctx.fillStyle = ink(0.88);
  ctx.textBaseline = 'middle';
  ctx.fillText(left, x, dy);
  x += wL + gap;
  ctx.save();                            // облачко: три шапки на общем основании
  ctx.translate(x, dy - 1);
  ctx.scale(1.22, 1.22);
  ctx.beginPath();
  ctx.arc(20, -1, 13, 0, 7);
  ctx.arc(34, 3, 10, 0, 7);
  ctx.arc(12, 6, 9, 0, 7);
  ctx.roundRect(4, 1, 44, 14, 7);
  ctx.fill();
  ctx.restore();
  ctx.fillText(right, x + cloudW + gap, dy);

  // часы
  const g = clockGeom();
  ctx.save();
  ctx.translate(W / 2, g.top);
  ctx.scale(1, g.ky);
  ctx.font = chromeFont(g.px, g.w8);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = ink(0.62);
  ctx.fillText(clockText(), 0, g.asc);
  ctx.restore();

  // виджеты снизу: список слева и две круглые кнопки справа
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 4;
  for (const [cy, barW] of [[1962, 300], [2047, 300]]) {
    ctx.beginPath(); ctx.arc(125, cy, 18, 0, 7);
    ctx.strokeStyle = ink(0.5); ctx.stroke();
    box(180, cy - 13, barW, 26, 13); ctx.fillStyle = ink(0.5); ctx.fill();
  }
  for (const cx of [725, 995]) {
    ctx.beginPath(); ctx.arc(cx, 2005, 87, 0, 7);
    ctx.fillStyle = ink(0.14); ctx.fill();
  }
  ctx.beginPath();                      // воспроизведение
  ctx.moveTo(706, 1976); ctx.lineTo(706, 2034); ctx.lineTo(754, 2005);
  ctx.closePath();
  ctx.fillStyle = ink(0.72); ctx.fill();
  ctx.strokeStyle = ink(0.72);          // будильник
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(995, 1984, 24, 0, 7); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(995, 1970); ctx.lineTo(995, 1984); ctx.lineTo(1006, 1984);
  ctx.stroke();
  box(955, 2022, 80, 18, 9); ctx.fillStyle = ink(0.5); ctx.fill();

  // фонарик и камера в нижних углах — они стоят на любом экране блокировки,
  // и точки под ними не видно. Те же мерки у setup.html (страница установки).
  for (const [cx, glyph, rule] of [[225, TORCH, 'nonzero'], [954, CAMERA, 'evenodd']]) {
    ctx.beginPath(); ctx.arc(cx, 2322, 86, 0, 7);
    ctx.fillStyle = ink(0.16); ctx.fill();
    ctx.save();
    ctx.translate(cx - 66, 2322 - 66);
    ctx.scale(5.5, 5.5);
    ctx.fillStyle = ink(0.92);
    ctx.fill(glyph, rule);
    ctx.restore();
  }

  box(W / 2 - 201, 2517, 402, 15, 7.5);   // полоска «домой»
  ctx.fillStyle = ink(0.55); ctx.fill();
  ctx.restore();
}

// Статус-бар одинаков на блокировке и на «Домой»: слева имя оператора (или
// часы, как на экране с иконками), справа связь, вай-фай и батарея.
function drawStatusBar(c, ink, time) {
  const box = (x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
  if (time) {
    c.save();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = chromeFont(46, 600);
    c.fillStyle = ink(0.95);
    c.fillText(time, 190, 92);
    c.restore();
  } else {
    box(110, 76, 160, 28, 14); c.fillStyle = ink(0.5); c.fill();
  }
  for (let i = 0; i < 4; i++) {
    const h = 10 + i * 6;
    box(860 + i * 14, 104 - h, 9, h, 3.5);
    c.fillStyle = ink(i < 3 ? 0.9 : 0.35);
    c.fill();
  }
  c.strokeStyle = ink(0.9);
  c.lineWidth = 7;
  for (const r of [15, 24]) {
    c.beginPath();
    c.arc(945, 104, r, -Math.PI * 0.78, -Math.PI * 0.22);
    c.stroke();
  }
  c.beginPath(); c.arc(945, 100, 4.5, 0, 7); c.fillStyle = ink(0.9); c.fill();
  c.lineWidth = 5;
  c.strokeStyle = ink(0.42);
  box(990, 73, 70, 34, 11); c.stroke();
  box(996, 79, 40, 22, 7); c.fillStyle = ink(0.9); c.fill();
  box(1064, 83, 6, 14, 3); c.fillStyle = ink(0.42); c.fill();
}

// --- экран «Домой» (там, где иконки) ---------------------------------------
// Силу размытия айфон не крутит: в действии «Установить фото как обои» есть
// только «Размытие для удобочитаемости» вкл/выкл. Поэтому картинку для «Домой»
// рисует сервер и отдаёт вторым адресом /w/<код>.png?home=1. Числа ниже обязаны
// совпадать с render.render_home, иначе превью соврёт.
const HOME_BLUR_R = 0.9;   // 100 % — радиус 90 точек на ширину 1179
const HOME_SHADE = 0.10;   // и картинка темнеет на десятую, как в iOS
const HOME_ICON = 190, HOME_COLS = 4, HOME_ROWS = 5;
const HOME_PAD = 110, HOME_TOP = 330, HOME_STEP_Y = 300;
const HOME_NAMES = ['Фото', 'Камера', 'Почта', 'Заметки', 'Карты', 'Погода', 'Часы',
  'Музыка', 'Команды', 'Настройки', 'Календарь', 'Файлы', 'Здоровье', 'Кошелёк',
  'Браузер', 'Телефон', 'Сообщения', 'Подкасты', 'Книги', 'Дом'];
const homeBuf = document.createElement('canvas');

// Размытие канвы уменьшением и растяжкой. ctx.filter есть не в каждом сафари, а
// где есть — тянет с краёв прозрачность и оставляет светлую кайму, которой у
// Pillow нет. Уменьшение краёв не трогает и одинаково работает везде.
function blurCanvas(c, cw, ch, sigma) {
  if (sigma < 0.6) return;
  // Шаг в 1,8 сигмы: уменьшение усредняет квадрат, растяжка добавляет свой
  // треугольник. Множитель подобран сверкой с сервером по точкам — на силе
  // 40 % средняя разница 5 единиц из 255, глазом не видно.
  const f = Math.min(400, Math.max(2, sigma * 1.8));
  const sw = Math.max(1, Math.round(cw / f)), sh = Math.max(1, Math.round(ch / f));
  if (homeBuf.width !== sw || homeBuf.height !== sh) { homeBuf.width = sw; homeBuf.height = sh; }
  const b = homeBuf.getContext('2d');
  b.imageSmoothingQuality = 'high';
  b.clearRect(0, 0, sw, sh);
  b.drawImage(c.canvas, 0, 0, cw, ch, 0, 0, sw, sh);
  c.imageSmoothingQuality = 'high';
  c.clearRect(0, 0, cw, ch);
  c.drawImage(homeBuf, 0, 0, sw, sh, 0, 0, cw, ch);
}

// Иконки, поиск и док — только превью: на обоях их нет, их рисует сам айфон.
function drawHomeChrome(c) {
  const rgb = chromeInk(c);
  const ink = a => `rgba(${rgb}, ${a})`;
  const box = (x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
  const icon = (x, y) => {
    box(x, y, HOME_ICON, HOME_ICON, 52);
    c.fillStyle = ink(0.23); c.fill();
    c.strokeStyle = ink(0.36); c.lineWidth = 3; c.stroke();
    box(x + 10, y + 8, HOME_ICON - 20, 36, 22);   // блик по верхней кромке
    c.fillStyle = ink(0.10); c.fill();
  };
  c.save();
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const stepX = (W - 2 * HOME_PAD - HOME_ICON) / (HOME_COLS - 1);
  c.font = chromeFont(34, 500);
  for (let i = 0; i < HOME_COLS * HOME_ROWS; i++) {
    const x = HOME_PAD + (i % HOME_COLS) * stepX;
    const y = HOME_TOP + Math.floor(i / HOME_COLS) * HOME_STEP_Y;
    icon(x, y);
    c.fillStyle = ink(0.92);
    c.fillText(HOME_NAMES[i], x + HOME_ICON / 2, y + HOME_ICON + 38);
  }
  box(W / 2 - 120, 1930, 240, 60, 30); c.fillStyle = ink(0.18); c.fill();
  c.font = chromeFont(32, 500);
  c.fillStyle = ink(0.88);
  c.fillText('Поиск', W / 2, 1962);
  box(44, 2080, W - 88, 320, 110);               // док
  c.fillStyle = ink(0.16); c.fill();
  c.strokeStyle = ink(0.28); c.lineWidth = 3; c.stroke();
  for (let i = 0; i < HOME_COLS; i++) icon(HOME_PAD + i * stepX, 2145);
  drawStatusBar(c, ink, new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
  box(W / 2 - 140, 2478, 280, 10, 5);            // полоска «домой»
  c.fillStyle = ink(0.55); c.fill();
  c.restore();
}

function paintHome(c) {
  const cw = c.canvas.width, ch = c.canvas.height, k = cw / W;
  const h = state.home;
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  if (h.mode === 'color') {
    c.fillStyle = h.color;
    c.fillRect(0, 0, cw, ch);
  } else if (h.mode === 'photo' && customHomeImg) {
    const iw = customHomeImg.width, ih = customHomeImg.height;
    const scale = Math.max(cw / iw, ch / ih);
    const sw = cw / scale, sh = ch / scale;
    c.drawImage(customHomeImg, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, cw, ch);
  } else {
    // фото ещё не выбрали — показываем размытые обои, ровно как сервер
    blurCanvas(c, cw, ch, HOME_BLUR_R * h.blur * k);
    if (h.blur > 0) {
      c.fillStyle = `rgba(0, 0, 0, ${HOME_SHADE * h.blur / 100})`;
      c.fillRect(0, 0, cw, ch);
    }
  }
  c.setTransform(k, 0, 0, k, 0, 0);
  drawHomeChrome(c);
  c.restore();
}

function placeAlive(key) {
  if (key === 'clock') return chromeOn;
  if (key === 'title') return !!state.title.trim();
  if (key === 'vita') return state.brand;
  if (key === 'foot') return state.footer;
  return true;
}

// Прямоугольники элементов на обоях: по ним ловим палец и рисуем рамку.
// Меряем той же меркой, что и отрисовка, иначе рамка встанет мимо текста.
function placeBoxes() {
  const g = placeGeom();
  const { total, done } = counts();
  const out = {
    dots: {
      box: [g.x0, g.y0, g.x0 + g.gw, g.y0 + g.gh],
      at: [g.x0 + g.gw / 2, g.y0 + g.gh / 2],
    },
  };
  if (placeAlive('title')) {
    const t = state.title.trim();
    const { px, lines, lineH } = titleLayout(t, g.title.y, g.title.px);
    ctx.font = titleFont(px);
    let w = 0;
    for (const line of lines) w = Math.max(w, measureRich(line, px));
    out.title = {
      box: [g.title.x - w / 2, g.title.y - (lines.length - 1) * lineH - lineH * 0.62,
        g.title.x + w / 2, g.title.y + lineH * 0.62],
      at: [g.title.x, g.title.y],
    };
  }
  if (placeAlive('vita')) {
    const q = g.vita.px / 32;
    ctx.font = wallFont(g.vita.px, 400);
    const w = 2 * 17 * q + 2 * 5 * q + 14 * q + ctx.measureText('vita').width;
    const h = g.vita.px * 1.3;
    out.vita = {
      box: [g.vita.x - w / 2, g.vita.y - h / 2, g.vita.x + w / 2, g.vita.y + h / 2],
      at: [g.vita.x, g.vita.y],
    };
  }
  if (placeAlive('foot')) {
    ctx.font = wallFont(g.foot.px, 400);
    const w = ctx.measureText(footerText(total, done)).width;
    const h = g.foot.px * 1.3;
    out.foot = {
      box: [g.foot.x - w / 2, g.foot.y - h / 2, g.foot.x + w / 2, g.foot.y + h / 2],
      at: [g.foot.x, g.foot.y],
    };
  }
  if (placeAlive('clock')) {
    const c = clockGeom();
    out.clock = {
      box: [W / 2 - c.w / 2, c.top, W / 2 + c.w / 2, c.top + c.h],
      at: [W / 2, c.top + c.h / 2],
    };
  }
  return out;
}

// Поверх обоев: пунктир периметра и уголки у выбранного элемента.
// Рисуется только в режиме — на готовые обои с сервера это не попадает.
function drawPlaceHints() {
  if (chromeOn) drawChrome();
  const [bx0, by0, bx1, by1] = PLACE_BOX;
  ctx.save();
  ctx.setLineDash([20, 16]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.32)';
  ctx.strokeRect(bx0, by0, bx1 - bx0, by1 - by0);
  ctx.setLineDash([]);
  const b = placeBoxes()[placeSel];
  if (b) {
    const pad = 24, arm = 46;
    const x0 = b.box[0] - pad, y0 = b.box[1] - pad, x1 = b.box[2] + pad, y1 = b.box[3] + pad;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const [cx, sx] of [[x0, 1], [x1, -1]]) {
      for (const [cy, sy] of [[y0, 1], [y1, -1]]) {
        ctx.moveTo(cx + sx * arm, cy);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx, cy + sy * arm);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}

function placeColsFill() {
  const box = $('placeCols');
  if (!box) return;
  const list = PLACE_COLS[state.mode] || PLACE_COLS.month;
  box.textContent = '';
  for (const c of list) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.v = String(c);
    b.textContent = c || 'авто';
    if (state.place.dots.cols === c) b.className = 'on';
    box.appendChild(b);
  }
}

function placeSync() {
  const pick = $('placePick');
  if (!pick) return;
  for (const b of pick.children) {
    b.disabled = !placeAlive(b.dataset.v);
    b.classList.toggle('on', b.dataset.v === placeSel);
  }
  if (!placeAlive(placeSel)) placeSel = 'dots';
  const clock = placeSel === 'clock';
  const size = $('placeSize');
  size.min = clock ? 100 : 40;
  size.max = clock ? Math.round((1 + CLOCK_TALL) * 100) : 130;
  size.value = Math.round((clock ? clockH : state.place[placeSel].s) * 100);
  $('placeSizeVal').textContent = size.value + ' %';
  $('placeSizeLab').textContent = clock ? 'Высота' : 'Размер';
  $('placeColsRow').hidden = placeSel !== 'dots';
  $('placeCenter').disabled = clock;   // часы стоят там, где их ставит айфон
  placeColsFill();
  placeFree();                         // строк в пульте стало больше или меньше
  if (!placeView.own) placeFit();
}

// ——— Вид: телефон уменьшается и ездит под пальцем ————————————————
// Панель снизу закрывала нижнюю треть айфона. Теперь при входе телефон сам
// ужимается под свободное окно, а дальше его двигают пальцем по пустому месту
// и щипком в два пальца; три кнопки в углу делают то же мышью.
const VIEW_MIN = 0.3, VIEW_MAX = 2.4;
const placeView = { k: 1, x: 0, y: 0, fit: 1, own: false };
let freeBox = { w: 320, h: 520, l: 12, t: 64 };

// свободное окно = экран минус панель; её высоту отдаём вёрстке
function placeFree() {
  const zone = $('phoneZone'), bar = $('placeBar');
  if (!zone || !placing) return freeBox;
  const h = bar && !bar.hidden ? bar.getBoundingClientRect().height + 22 : 0;
  document.documentElement.style.setProperty('--place-bot', Math.round(h) + 'px');
  const cs = getComputedStyle(zone);
  const l = parseFloat(cs.paddingLeft), t = parseFloat(cs.paddingTop);
  freeBox = {
    l, t,
    w: zone.clientWidth - l - parseFloat(cs.paddingRight),
    h: zone.clientHeight - t - parseFloat(cs.paddingBottom),
  };
  return freeBox;
}

const placeMid = () => ({ x: freeBox.l + freeBox.w / 2, y: freeBox.t + freeBox.h / 2 });

function placeApply(smooth = true) {
  const phone = document.querySelector('.phone');
  if (!phone) return;
  const w = phone.offsetWidth * placeView.k, h = phone.offsetHeight * placeView.k;
  const mx = Math.max(0, (w - freeBox.w) / 2) + 40;   // за край совсем не утащить
  const my = Math.max(0, (h - freeBox.h) / 2) + 40;
  placeView.x = Math.min(mx, Math.max(-mx, placeView.x));
  placeView.y = Math.min(my, Math.max(-my, placeView.y));
  const m = placeMid();
  const st = document.documentElement.style;
  st.setProperty('--place-vk', placeView.k.toFixed(4));
  st.setProperty('--place-px', Math.round(m.x - w / 2 + placeView.x) + 'px');
  st.setProperty('--place-py', Math.round(m.y - h / 2 + placeView.y) + 'px');
  phone.classList.toggle('viewing', !smooth);
  const home = Math.abs(placeView.k - placeView.fit) < 0.01
    && Math.abs(placeView.x) < 1 && Math.abs(placeView.y) < 1;
  $('viewOut').disabled = placeView.k <= VIEW_MIN + 0.001;
  $('viewIn').disabled = placeView.k >= VIEW_MAX - 0.001;
  $('viewFit').disabled = home;
  // на зуме превью растягивало готовый растр — перерисовываем канву крупнее
  if (setCanvasScale(placeView.k > 1.15 ? placeView.k : 1)) draw();
}

function placeFit() {
  const phone = document.querySelector('.phone');
  if (!phone || !placing) return;
  const free = placeFree();
  placeView.fit = Math.max(VIEW_MIN,
    Math.min(free.w / phone.offsetWidth, free.h / phone.offsetHeight, 1));
  placeView.k = placeView.fit;
  placeView.x = placeView.y = 0;
  placeView.own = false;
  placeApply();
}

// зум вокруг точки: то, что под пальцем, под ним и остаётся
function placeZoom(k1, sx, sy, smooth = false) {
  const phone = document.querySelector('.phone');
  if (!phone) return;
  k1 = Math.min(VIEW_MAX, Math.max(VIEW_MIN, k1));
  const m = placeMid();
  const f = 1 - k1 / placeView.k;
  placeView.x += (sx - m.x - placeView.x) * f;
  placeView.y += (sy - m.y - placeView.y) * f;
  placeView.k = k1;
  placeView.own = true;
  placeApply(smooth);
}

function chromeBtnSync() {
  const b = $('viewChrome');
  if (!b) return;
  b.classList.toggle('on', chromeOn);
  b.setAttribute('aria-pressed', chromeOn ? 'true' : 'false');
}

function placeOpen(on) {
  // в «Расположении» двигают точки и надписи — за размытием «Домой» их не
  // видно, поэтому телефон возвращаем на экран блокировки
  if (on && homeOn) setHomeOn(false);
  placing = on;
  document.body.classList.toggle('placing', on);
  $('placeBar').hidden = !on;
  $('placeView').hidden = !on;
  if (on) {
    // вступительная анимация страницы держит на main живой transform, а он
    // делает main точкой отсчёта для fixed — телефон тогда сидит в его коробке
    const m = document.querySelector('main');
    if (m) m.style.animation = 'none';
    if (!placeAlive(placeSel)) placeSel = 'dots';
    chromeBtnSync();
    placeSync();
    placeFit();
  } else {
    document.body.classList.add('placed');   // вступительное появление больше не нужно
    setCanvasScale(1);
    for (const v of ['--place-vk', '--place-px', '--place-py', '--place-bot'])
      document.documentElement.style.removeProperty(v);
  }
  draw();
}

if ($('placeBtn')) {
  const cvEl = $('cv');
  const evPoint = e => {
    const r = cvEl.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
  };

  $('placeBtn').addEventListener('click', () => placeOpen(true));
  $('placeDone').addEventListener('click', () => placeOpen(false));
  $('placeReset').addEventListener('click', () => {
    state.place = placeDefault();
    clockH = 1;
    chromeSave();
    placeSel = 'dots';
    placeSync();
    draw();
  });
  $('placeCenter').addEventListener('click', () => {
    const q = state.place[placeSel];
    if (q.x !== null) { q.x = 0.5; draw(); }
  });
  $('placeSize').addEventListener('input', e => {
    const v = +e.target.value / 100;
    if (placeSel === 'clock') { clockH = Math.min(1 + CLOCK_TALL, Math.max(1, v)); chromeSave(); }
    else state.place[placeSel].s = Math.min(1.3, Math.max(0.4, v));
    $('placeSizeVal').textContent = e.target.value + ' %';
    draw();
  });
  $('placePick').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    placeSel = b.dataset.v;
    placeSync();
    draw();
  });
  $('placeCols').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    state.place.dots.cols = +b.dataset.v;
    placeColsFill();
    draw();
  });
  addEventListener('keydown', e => { if (placing && e.key === 'Escape') placeOpen(false); });

  // тащим: палец берёт элемент там, где взял, и элемент не прыгает под центр
  cvEl.addEventListener('pointerdown', e => {
    if (!placing) return;
    const p = evPoint(e);
    const boxes = placeBoxes();
    let hit = null;
    for (const key of [placeSel, 'title', 'vita', 'foot', 'dots']) {
      const b = boxes[key];
      if (!b || key === 'clock') continue;   // часы держит айфон, их не двигают
      const [x0, y0, x1, y1] = b.box;
      if (p.x >= x0 - 26 && p.x <= x1 + 26 && p.y >= y0 - 26 && p.y <= y1 + 26) { hit = key; break; }
    }
    if (!hit) return;
    e.preventDefault();
    placeSel = hit;
    placeSync();
    placeDrag = { key: hit, p0: p, at: boxes[hit].at.slice(), box: boxes[hit].box.slice(), id: e.pointerId };
    try { cvEl.setPointerCapture(e.pointerId); } catch {}   // без захвата тоже тащится
    cvEl.classList.add('dragging');
    draw();
  });
  cvEl.addEventListener('pointermove', e => {
    if (!placeDrag || e.pointerId !== placeDrag.id) return;
    const p = evPoint(e);
    const [bx0, by0, bx1, by1] = placeDrag.box;
    const midX = (bx0 + bx1) / 2, midY = (by0 + by1) / 2;
    const [ccx, ccy] = clampPlace(midX + p.x - placeDrag.p0.x, midY + p.y - placeDrag.p0.y,
      bx1 - bx0, by1 - by0);
    const q = state.place[placeDrag.key];
    q.x = (placeDrag.at[0] + ccx - midX) / W;
    q.y = (placeDrag.at[1] + ccy - midY) / H;
    draw();
  });
  const dragEnd = () => {
    if (!placeDrag) return;
    placeDrag = null;
    cvEl.classList.remove('dragging');
  };
  cvEl.addEventListener('pointerup', dragEnd);
  cvEl.addEventListener('pointercancel', dragEnd);

  // ——— жесты вида: палец по пустому месту двигает телефон, два пальца — щипок
  const zoneEl = $('phoneZone');
  const pts = new Map();
  let pinch = null, pan = null;
  const midPt = () => {
    const [a, b] = [...pts.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
  };

  zoneEl.addEventListener('pointerdown', e => {
    if (!placing) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) {
      dragEnd();                   // второй палец — это щипок, а не перетаскивание
      pan = null;
      const m = midPt(), c = placeMid();
      const cx = c.x, cy = c.y;
      pinch = { d: m.d || 1, cx, cy,
        lx: (m.x - cx - placeView.x) / placeView.k,
        ly: (m.y - cy - placeView.y) / placeView.k, k: placeView.k };
    } else if (pts.size === 1 && !placeDrag) {
      pan = { x: e.clientX, y: e.clientY, vx: placeView.x, vy: placeView.y };
      try { zoneEl.setPointerCapture(e.pointerId); } catch {}
    }
  });
  zoneEl.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size >= 2) {
      // считаем от начала щипка, иначе картинка уползает от пальцев
      const m = midPt();
      placeView.k = Math.min(VIEW_MAX, Math.max(VIEW_MIN, pinch.k * m.d / pinch.d));
      placeView.x = m.x - pinch.cx - placeView.k * pinch.lx;
      placeView.y = m.y - pinch.cy - placeView.k * pinch.ly;
      placeView.own = true;
      placeApply(false);
    } else if (pan && !placeDrag) {
      placeView.x = pan.vx + e.clientX - pan.x;
      placeView.y = pan.vy + e.clientY - pan.y;
      placeView.own = true;
      placeApply(false);
    }
  });
  const viewEnd = e => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (pts.size === 1 && !placeDrag) {     // один палец остался — дальше он и везёт
      const q = [...pts.values()][0];
      pan = { x: q.x, y: q.y, vx: placeView.x, vy: placeView.y };
    }
    if (!pts.size) { pan = null; placeApply(true); }
  };
  zoneEl.addEventListener('pointerup', viewEnd);
  zoneEl.addEventListener('pointercancel', viewEnd);
  zoneEl.addEventListener('wheel', e => {
    if (!placing) return;
    e.preventDefault();
    placeZoom(placeView.k * (e.deltaY > 0 ? 0.88 : 1.14), e.clientX, e.clientY);
  }, { passive: false });

  const zoomStep = f => {
    const r = $('phoneZone').getBoundingClientRect();
    placeZoom(placeView.k * f, r.left + r.width / 2, r.top + r.height / 2, true);
  };
  $('viewOut').addEventListener('click', () => zoomStep(1 / 1.25));
  $('viewIn').addEventListener('click', () => zoomStep(1.25));
  $('viewFit').addEventListener('click', () => placeFit());
  $('viewChrome').addEventListener('click', () => {
    chromeOn = !chromeOn;
    chromeSave();
    chromeBtnSync();
    if (!chromeOn && placeSel === 'clock') placeSel = 'dots';
    placeSync();
    draw();
  });
  addEventListener('resize', () => {
    if (!placing) return;
    if (placeView.own) { placeFree(); placeApply(); } else placeFit();
  });
}


// ——— Чужая сборка по ссылке ——————————————————————————————————
// Значок «поделиться» в «Моих обоях» даёт адрес вида /?w=<код>. По нему
// конструктор открывается уже собранным: человеку остаётся нажать одну
// кнопку, будто он всё выбрал сам, — и он всё ещё может поменять что угодно.
let sharedOn = false;

async function loadShared(code) {
  if (!/^[a-z0-9]{6}$/i.test(code)) return false;
  let cfg = null;
  try {
    const res = await fetch('/api/link/' + encodeURIComponent(code));
    if (!res.ok) return false;
    cfg = (await res.json()).config;
  } catch { return false; }
  if (!cfg || typeof cfg !== 'object') return false;
  const hex = v => /^#[0-9a-f]{6}$/i.test(String(v || ''));
  // жмём те же кнопки, что и человек: тогда ничего не разъедется
  const hit = (group, v) => {
    const box = $(group);
    if (!box) return;
    for (const b of box.querySelectorAll('button[data-v]'))
      if (b.dataset.v === String(v)) { b.click(); return; }
  };

  if (cfg.mode) hit('mode', cfg.mode);
  if (cfg.bg === 'custom' && /^[a-z0-9]{6}$/.test(cfg.bgImage || '')) {
    // своё фото лежит на сервере — без него фон уехал бы в чёрный
    await new Promise(done => {
      const img = new Image();
      img.onload = () => {
        customBgImg = img;
        state.bg = 'custom';
        state.bgImageId = cfg.bgImage;
        markOn('bg', '');
        markOn('themes', '');
        $('bgOwn').classList.add('on');
        done();
      };
      img.onerror = done;
      img.src = '/bg/' + cfg.bgImage + '.jpg';
    });
  } else if (cfg.bg) {
    hit('bg', cfg.bg);
    hideBgAsk();
    if (cfg.bg === 'owncolor' && hex(cfg.bgColor)) {
      state.bgColor = cfg.bgColor;
      $('bgColorPick').value = cfg.bgColor;
    }
  }
  if (cfg.home && typeof cfg.home === 'object') {
    const home = cfg.home;
    state.home.blur = Math.max(0, Math.min(100, Number(home.blur) || 0));
    $('homeBlur').value = state.home.blur;
    $('homeBlurVal').textContent = state.home.blur + ' %';
    if (hex(home.color)) {
      state.home.color = home.color;
      $('homeColorPick').value = home.color;
    }
    if (/^[a-z0-9]{6}$/.test(home.photo || '')) {
      state.home.photo = home.photo;
      await new Promise(done => {          // фото для «Домой» лежит там же, где фоны
        const img = new Image();
        img.onload = () => { customHomeImg = img; done(); };
        img.onerror = done;
        img.src = '/bg/' + home.photo + '.jpg';
      });
    }
    state.home.mode = ['blur', 'color', 'photo'].includes(home.mode) ? home.mode : 'blur';
    markOn('home', state.home.mode);
    paintHomeRows();
  }
  if (cfg.shape) hit('shape', cfg.shape);
  hit('glass', cfg.glow ? '2' : cfg.glass ? '1' : '0');
  hit('footer', cfg.footer === false ? '0' : '1');
  // логотип снимается только на полном доступе — чужая ссылка это не обходит
  state.brand = !(cfg.brand === false && hasFullAccess) ? true : false;
  markOn('brand', state.brand ? '1' : '0');

  if (hex(cfg.color)) {
    state.color = cfg.color;
    customColor = !COLORS.includes(cfg.color);
    swatches.querySelectorAll('.swatch').forEach(b => b.classList.toggle('on', b.dataset.v === cfg.color));
    $('colorPick').value = cfg.color;
  }
  for (const key of ['textColor', 'textMuted', 'textStroke'])
    state[key] = hex(cfg[key]) ? cfg[key] : '';

  if (typeof cfg.title === 'string') {
    state.title = cfg.title.slice(0, 200);
    $('title').value = state.title;
    customTitle = true;
    bgAutoTitle = false;
  }
  const day = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
  if (day(cfg.birth)) { state.birth = cfg.birth; $('birth').value = cfg.birth; }
  if (day(cfg.start)) { state.start = cfg.start; $('goalStart').value = cfg.start; }
  if (day(cfg.end)) { state.end = cfg.end; $('goalEnd').value = cfg.end; }
  if (cfg.place && typeof cfg.place === 'object') {
    const place = placeDefault();
    for (const key of Object.keys(place))
      if (cfg.place[key] && typeof cfg.place[key] === 'object') Object.assign(place[key], cfg.place[key]);
    state.place = place;
    if (typeof placeSync === 'function' && placing) placeSync();
  }

  if (cfg.font) { markOn('font', cfg.font); showSelected('font'); await useFont(cfg.font); }
  paintShapeChips();
  refreshSwatches();
  showSelected('shape');
  showSelected('bg');
  draw();
  return true;
}

(async () => {
  const code = new URLSearchParams(location.search).get('w');
  if (!code) return;
  if (!(await loadShared(code))) return;
  sharedOn = true;
  const hero = $('heroBtn'), note = document.querySelector('.hero-note');
  if (hero) hero.textContent = 'Поставить эти обои';
  if (note) note.innerHTML = 'Готовая сборка — можно поставить как есть или <a href="#tune">поменять</a>';
  const tip = $('phoneTip');
  if (tip) { tip.textContent = 'это чужая сборка — меняй что хочешь'; tip.classList.remove('gone'); }
})();
