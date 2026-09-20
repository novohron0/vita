// Темы-сцены для обоев: шесть фонов и новые формы точек.
// Пара — app/scenes.py: каждый шаг повторён там в том же порядке и с тем же
// генератором случайности (mulberry32), иначе превью разойдётся с обоями.
// Штрихи рисуются непрозрачными, пятна и холмы — с прозрачностью поверх.
(() => {
  const W = 1179, H = 2556, TAU = 6.283, PI2 = Math.PI * 2;

  const SCENES = ['pole', 'romashki', 'taiga', 'tush', 'manga', 'tuman'];
  const SCENE_BASE = {
    pole: '#c4e0f5', romashki: '#1a2517', taiga: '#172017',
    tush: '#0b0b0a', manga: '#6e6e6e', tuman: '#262e30',
  };
  const EMPTY_ALPHA = { pole: 0.24, romashki: 0.14, taiga: 0.18, tush: 0.14, manga: 0.22, tuman: 0.2 };
  const DAISY_CENTER = '#e8b92f';
  const NEW_SHAPES = ['daisy', 'sakura', 'fir', 'leaf', 'drop', 'moon', 'ink', 'tone'];

  // Тема целиком: фон, точки, шрифт и цвета текста. Одобрены владельцем 19.09.
  const THEMES = {
    pole: { bg: 'pole', color: '#5b7f35', shape: 'circle', font: 'oswald', glass: false, glow: false,
      textColor: '#46642a', textMuted: '#557040', textStroke: '' },
    romashki: { bg: 'romashki', color: '#f5f2ea', shape: 'daisy', font: 'unbounded', glass: false, glow: false,
      textColor: '#eeebe3', textMuted: '#9ba7b3', textStroke: '' },
    taiga: { bg: 'taiga', color: '#cf9f5c', shape: 'fir', font: 'ptnarrow', glass: false, glow: false,
      textColor: '#cbc3b5', textMuted: '#8f887c', textStroke: '' },
    tush: { bg: 'tush', color: '#e9e4d8', shape: 'ink', font: 'playfair', glass: false, glow: false,
      textColor: '#ebe6da', textMuted: '#8f8a80', textStroke: '' },
    manga: { bg: 'manga', color: '#f7f7f7', shape: 'tone', font: 'russo', glass: false, glow: false,
      textColor: '#f7f7f7', textMuted: '#e2e2e2', textStroke: '#111111' },
    tuman: { bg: 'tuman', color: '#dfe7ea', shape: 'circle', font: 'ptserif', glass: true, glow: true,
      textColor: '#e4eaec', textMuted: '#aab4b8', textStroke: '' },
    // старые сцены — тоже темы: к фону свой шрифт и свои точки
    mountains: { bg: 'mountains', color: '#dfe9f2', shape: 'fir', font: 'ptnarrow', glass: false, glow: false,
      textColor: '', textMuted: '', textStroke: '' },
    ocean: { bg: 'ocean', color: '#7cc4f0', shape: 'drop', font: 'montserrat', glass: false, glow: false,
      textColor: '', textMuted: '', textStroke: '' },
    sunset: { bg: 'sunset', color: '#ffb37c', shape: 'circle', font: 'pacifico', glass: true, glow: true,
      textColor: '', textMuted: '', textStroke: '' },
    dembel: { bg: 'dembel', color: '#e8d890', shape: 'star', font: 'russo', glass: false, glow: false,
      textColor: '', textMuted: '', textStroke: '' },
    ramadan: { bg: 'ramadan', color: '#f5e6b8', shape: 'moon', font: 'playfair', glass: false, glow: false,
      textColor: '', textMuted: '', textStroke: '' },
    honeymoon: { bg: 'honeymoon', color: '#ff8fab', shape: 'heart', font: 'caveat', glass: false, glow: false,
      textColor: '', textMuted: '', textStroke: '' },
  };

  // ------------------------------------------------------------ основа

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), a | 1);
      t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const rgb = hx => [1, 3, 5].map(i => parseInt(hx.slice(i, i + 2), 16));
  const mix = (a, b, t) => {
    const x = rgb(a), y = rgb(b);
    return x.map((v, i) => Math.round(v + (y[i] - v) * t));
  };
  const css = c => `rgb(${c[0]},${c[1]},${c[2]})`;
  const hexs = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');

  function vfill(c, stops, y0 = 0, y1 = H) {
    const g = c.createLinearGradient(0, y0, 0, y1);
    for (const [col, p] of stops) g.addColorStop(p, col);
    return g;
  }

  function blob(c, cx, cy, r, color, alpha = 255, stops = null, sx = 1, sy = 1) {
    stops = stops || [[0, alpha], [0.55, alpha * 0.45], [1, 0]];
    const [R, G, B] = rgb(color);
    c.save();
    c.translate(cx, cy);
    c.scale(sx, sy);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, r);
    for (const [p, a] of stops) g.addColorStop(p, `rgba(${R},${G},${B},${Math.max(0, Math.min(255, a)) / 255})`);
    c.fillStyle = g;
    c.fillRect(-r, -r, 2 * r, 2 * r);
    c.restore();
  }

  function trace(c, pts) {
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
  }

  function poly(c, pts, fill, alpha = 1) {
    trace(c, pts);
    c.globalAlpha = alpha;
    c.fillStyle = fill;
    c.fill();
    c.globalAlpha = 1;
  }

  function circle(c, x, y, r, fill, alpha = 1) {
    c.beginPath();
    c.arc(x, y, r, 0, PI2);
    c.globalAlpha = alpha;
    c.fillStyle = fill;
    c.fill();
    c.globalAlpha = 1;
  }

  function line(c, x1, y1, x2, y2, stroke, width) {
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.strokeStyle = stroke;
    c.lineWidth = width;
    c.stroke();
  }

  function gradPoly(c, pts, top, bot, yTop, yBot) {
    trace(c, pts);
    c.fillStyle = vfill(c, [[top, 0], [bot, 1]], yTop, yBot);
    c.fill();
  }

  function ridge(y0, amp, seed, parts, step = 6) {
    const r = rng(seed);
    const ph = parts.map(() => r() * TAU);
    const out = [];
    for (let x = -10; x <= W + 10; x += step) {
      let v = 0;
      parts.forEach(([f, a], k) => { v += a * Math.sin(x * f * 3 + ph[k]); });
      out.push([x, y0 + amp * v]);
    }
    return out;
  }

  // ------------------------------------------------------------ формы точек

  function daisyPts(cx, cy, d, rot = 0, petals = 13, wid = 0.8, rc = 0.16, rt = 0.47, steps = 16) {
    const n = petals * steps, sector = PI2 / petals, out = [];
    for (let j = 0; j < n; j++) {
      const th = j / n * PI2;
      const s = (th - rot) / sector;
      const phi = 2 * (s - Math.floor(s + 0.5));
      const g = Math.max(0, 1 - (phi / wid) ** 2) ** 0.5;
      const rr = d * (rc + (rt - rc) * g);
      out.push([cx + Math.cos(th) * rr, cy + Math.sin(th) * rr]);
    }
    return out;
  }

  function sakuraPts(cx, cy, d, rot = -Math.PI / 2) {
    const n = 5 * 24, sector = PI2 / 5, out = [];
    for (let j = 0; j < n; j++) {
      const th = j / n * PI2;
      const s = (th - rot) / sector;
      const phi = 2 * (s - Math.floor(s + 0.5));
      const lobe = Math.max(0, 1 - phi * phi) ** 0.5;
      const notch = 0.2 * Math.max(0, 1 - Math.abs(phi) / 0.16);
      const rr = d * (0.1 + 0.39 * (lobe - notch));
      out.push([cx + Math.cos(th) * rr, cy + Math.sin(th) * rr]);
    }
    return out;
  }

  function firPts(x, y, d) {
    const w = d * 0.92, h = d * 1.08;
    const ox = x + (d - w) / 2, oy = y + (d - h) / 2, cx = w / 2;
    const tiers = [[0.36, 0.28], [0.60, 0.37], [0.85, 0.47]];
    const right = [[cx, 0]];
    tiers.forEach(([bot, half], i) => {
      right.push([cx + half * w, bot * h]);
      if (i < tiers.length - 1) right.push([cx + half * w * 0.45, bot * h - 0.015 * h]);
    });
    const trunk = [[cx + 0.075 * w, 0.85 * h], [cx + 0.075 * w, h], [cx - 0.075 * w, h], [cx - 0.075 * w, 0.85 * h]];
    const left = right.slice(1).reverse().map(([px, py]) => [2 * cx - px, py]);
    return [...right, ...trunk, ...left].map(([px, py]) => [ox + px, oy + py]);
  }

  function leafPts(cx, cy, d) {
    const L = d * 0.49, hw = d * 0.27, rot = -Math.PI / 4, n = 24, out = [];
    for (let k = 0; k <= n; k++) {
      const u = -1 + 2 * k / n;
      out.push([u * L, -hw * (1 - u * u) ** 0.85]);
    }
    for (let k = n - 1; k > 0; k--) {
      const u = -1 + 2 * k / n;
      out.push([u * L, hw * (1 - u * u) ** 0.85]);
    }
    const c = Math.cos(rot), s = Math.sin(rot);
    return out.map(([px, py]) => [cx + px * c - py * s, cy + px * s + py * c]);
  }

  function dropPts(x, y, d) {
    const cx = x + d * 0.5, cy = y + d * 0.62, r = d * 0.35;
    const tip = [cx, y + d * 0.02];
    const alpha = Math.asin(r / (cy - tip[1]));
    const a0 = -alpha, a1 = Math.PI + alpha, n = 36, out = [tip];
    for (let k = 0; k <= n; k++) {
      const a = a0 + (a1 - a0) * k / n;
      out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    return out;
  }

  function moonPts(x, y, d) {
    const c1x = x + d * 0.5, c1y = y + d * 0.5, r1 = d * 0.46;
    const c2x = c1x + d * 0.2, c2y = c1y - d * 0.09, r2 = d * 0.39;
    const dx = c2x - c1x, dy = c2y - c1y, dist = Math.hypot(dx, dy), base = Math.atan2(dy, dx);
    const b1 = Math.acos((r1 * r1 - r2 * r2 + dist * dist) / (2 * dist * r1));
    const b2 = Math.acos((r2 * r2 - r1 * r1 + dist * dist) / (2 * dist * r2));
    const n = 40, out = [];
    const of = base + b1, ot = base + PI2 - b1;
    const inf = base + Math.PI + b2, int = base + Math.PI - b2;
    for (let k = 0; k <= n; k++) {
      const a = of + (ot - of) * k / n;
      out.push([c1x + Math.cos(a) * r1, c1y + Math.sin(a) * r1]);
    }
    for (let k = 1; k < n; k++) {
      const a = inf + (int - inf) * k / n;
      out.push([c2x + Math.cos(a) * r2, c2y + Math.sin(a) * r2]);
    }
    return out;
  }

  function inkPts(x, y, d, seed, rough = 0.07) {
    const r = rng(seed);
    const amps = [], phs = [];
    for (let j = 0; j < 6; j++) amps.push((r() - 0.5) * 2);
    for (let j = 0; j < 6; j++) phs.push(r() * TAU);
    const cx = x + d / 2, cy = y + d / 2, rad = d * 0.47, out = [];
    for (let i = 0; i < 40; i++) {
      const a = i / 40 * TAU;
      let k = 0;
      for (let j = 0; j < 6; j++) k += amps[j] * Math.sin((j + 2) * a + phs[j]);
      k = 1 + rough * k / 2.2;
      k += (r() - 0.5) * rough * 0.5;
      out.push([cx + Math.cos(a) * rad * k, cy + Math.sin(a) * rad * k]);
    }
    return out;
  }

  function shapePts(shape, x, y, d, i = 0) {
    if (shape === 'daisy') return daisyPts(x + d / 2, y + d / 2, d * 1.16, ((i * 37) % 360) * Math.PI / 180);
    if (shape === 'sakura') return sakuraPts(x + d / 2, y + d / 2, d * 1.06);
    if (shape === 'fir') return firPts(x, y, d);
    if (shape === 'leaf') return leafPts(x + d / 2, y + d / 2, d);
    if (shape === 'drop') return dropPts(x, y, d);
    if (shape === 'moon') return moonPts(x, y, d);
    if (shape === 'ink') return inkPts(x, y, d, 1000 + i);
    return null;
  }

  function shapeCenter(shape, x, y, d) {
    if (shape === 'daisy') return [x + d / 2, y + d / 2, d * 1.16 * 0.15];
    if (shape === 'sakura') return [x + d / 2, y + d / 2, d * 0.1];
    return null;
  }

  const sakuraCenter = color => hexs(mix(color, '#7a2745', 0.45));

  function flowerCenter(c, shape, x, y, d, color, mode, bgHex, emptyA) {
    const ctr = shapeCenter(shape, x, y, d);
    if (!ctr) return;
    const accent = shape === 'daisy' ? DAISY_CENTER : sakuraCenter(color);
    if (mode !== 'empty') { circle(c, ctr[0], ctr[1], ctr[2], accent); return; }
    if (emptyA == null) circle(c, ctr[0], ctr[1], ctr[2], css(mix(bgHex, accent, 0.18)));
    else circle(c, ctr[0], ctr[1], ctr[2], accent, Math.min(1, emptyA + 0.1));
  }

  // Энсо — круг одним мазком: разрыв, к концу мазок сужается и сохнет.
  // Шаги и толщина сухих дорожек считаются от увеличенного размера D, как в
  // scenes.py, а рисуем сразу в настоящем — canvas сглаживает сам.
  const ensoCache = new Map();
  function ensoSprite(w, color, widthK, seed, start, span, s) {
    const key = [Math.round(w), color, widthK, seed, start, span, s].join('|');
    let cv = ensoCache.get(key);
    if (cv) return cv;
    const D = Math.floor(w * s), k = w / D;
    cv = document.createElement('canvas');
    cv.width = cv.height = Math.max(1, Math.ceil(w));
    const o = cv.getContext('2d');
    const cc = D / 2, rad = D * 0.40, r = rng(seed);
    const steps = Math.max(90, Math.floor(D / 18));
    o.fillStyle = color;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1), a = start + span * t;
      const rr = rad * (1 + 0.035 * Math.sin(a * 3 + 1.3));
      const wid = D * widthK * (0.55 + 0.6 * Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.7) * (1 - 0.75 * t ** 3);
      o.beginPath();
      o.arc((cc + Math.cos(a) * rr) * k, (cc + Math.sin(a) * rr) * k, wid / 2 * k, 0, PI2);
      o.fill();
    }
    o.globalCompositeOperation = 'destination-out';
    o.lineWidth = Math.max(2, Math.floor(D * 0.012)) * k;
    for (let j = 0; j < 7; j++) {
      const off = (r() - 0.5) * D * widthK * 0.9;
      const a0 = start + span * (0.55 + r() * 0.35), a1 = start + span;
      o.beginPath();
      for (let q = 0; q < 30; q++) {
        const a = a0 + (a1 - a0) * q / 29;
        const X = (cc + Math.cos(a) * (rad + off)) * k, Y = (cc + Math.sin(a) * (rad + off)) * k;
        q ? o.lineTo(X, Y) : o.moveTo(X, Y);
      }
      o.stroke();
    }
    if (ensoCache.size > 24) ensoCache.delete(ensoCache.keys().next().value);
    ensoCache.set(key, cv);
    return cv;
  }

  function enso(c, x0, y0, w, color, { widthK = 0.13, seed = 7, alpha = 1, start = -1.25, span = 5.55, s = 4 } = {}) {
    const cv = ensoSprite(w, color, widthK, seed, start, span, s);
    c.globalAlpha = alpha;
    c.drawImage(cv, Math.round(x0), Math.round(y0));
    c.globalAlpha = 1;
  }

  // «сегодня» у туши — энсо чуть шире точки
  function ensoDot(c, x, y, d, color, i, pulse = 0) {
    if (pulse > 0) blob(c, x + d / 2, y + d / 2, d * 0.8, color, 0, [[0, 90 * pulse], [0.5, 40 * pulse], [1, 0]]);
    enso(c, x - d * 0.08, y - d * 0.08, d * 1.16, color, { seed: i + 3 });
  }

  function ringBand(c, cx, cy, R, w) {
    c.moveTo(cx + R, cy);
    c.arc(cx, cy, R, 0, PI2);
    c.moveTo(cx + R - w, cy);
    c.arc(cx, cy, R - w, 0, PI2, true);
  }

  // Точка-манга: белая в чёрной обводке, будущие — растром (скринтон)
  function tone(c, x, y, d, color, ink, mode, pulse = 0) {
    const cx = x + d / 2, cy = y + d / 2, R = d / 2;
    if (mode === 'filled') {
      circle(c, cx, cy, R, ink);
      circle(c, cx, cy, R - 0.075 * d, color);
    } else if (mode === 'ring') {
      c.save();
      if (pulse > 0) { c.shadowColor = color; c.shadowBlur = d * 0.55 * pulse; }
      c.beginPath();
      ringBand(c, cx, cy, R, 0.12 * d);
      c.fillStyle = color;
      c.fill();
      c.restore();
      c.beginPath();
      ringBand(c, cx, cy, R - 0.12 * d, 0.05 * d);
      c.fillStyle = ink;
      c.fill();
    } else {
      c.save();
      c.beginPath();
      c.arc(cx, cy, R, 0, PI2);
      c.clip();
      c.beginPath();
      const step = d / 7.5, rr = step * 0.26;
      for (let yy = -1; yy < 9; yy++) {
        for (let xx = -1; xx < 9; xx++) {
          const px = x + xx * step + (yy % 2 ? step / 2 : 0), py = y + yy * step;
          c.moveTo(px + rr, py);
          c.arc(px, py, rr, 0, PI2);
        }
      }
      ringBand(c, cx, cy, R, 0.03 * d);
      c.globalAlpha = 0.82;
      c.fillStyle = ink;
      c.fill();
      c.restore();
    }
  }

  function toneInk(bgHex, color) {
    const [r, g, b] = rgb(bgHex);
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return lum > 0.25 ? '#111111' : hexs(mix(bgHex, color, 0.45));
  }

  // свечение под точкой — мягкий ореол её же цвета
  const glow = (c, x, y, d, color) => blob(c, x + d / 2, y + d / 2, d * 0.95, color, 0, [[0, 110], [0.45, 60], [1, 0]]);

  // ------------------------------------------------------------ сцены

  function cumulus(c, r, sky, baseY, n) {
    const lumps = [];
    for (let k = 0; k < n; k++) {
      const cx = -120 + r() * (W + 240);
      const top = sky(cx);
      if (top >= baseY) continue;
      const rr = 60 + r() * 110;
      const cy = top + rr * 0.7 + r() * Math.max(1, baseY - top - rr * 0.7);
      lumps.push([cx, cy, rr]);
    }
    for (const [cx, cy, rr] of lumps) blob(c, cx, cy + rr * 0.32, rr * 1.05, '#c2d2e1', 0, [[0, 170], [0.6, 120], [1, 0]]);
    for (const [cx, cy, rr] of [...lumps].sort((p, q) => q[1] - p[1])) {
      blob(c, cx, cy, rr, '#ffffff', 0, [[0, 255], [0.55, 235], [0.82, 150], [1, 0]]);
    }
  }

  function pole(c) {
    c.fillStyle = vfill(c, [['#74ade2', 0], ['#97c5ee', 0.28], ['#c4e0f5', 0.58], ['#e4f0f6', 0.77]]);
    c.fillRect(0, 0, W, H);
    blob(c, 150, 220, 1050, '#ffffff', 0, [[0, 130], [0.5, 55], [1, 0]]);
    const r = rng(161);
    for (let k = 0; k < 18; k++) {
      const x = -80 + r() * 600, y = 610 + r() * 280, rad = 55 + r() * 70, a = 70 + r() * 50;
      blob(c, x, y, rad, '#ffffff', a, null, 2.4, 0.6);
    }
    const sky = x => 1640 - 230 * Math.exp(-(((x - 800) / 300) ** 2)) - 140 * Math.exp(-(((x - 230) / 240) ** 2));
    cumulus(c, r, sky, 2010, 150);
    blob(c, W / 2, 1990, 900, '#eef6f9', 150, null, 1.5, 0.18);
    const far = ridge(1990, 24, 5, [[0.0016, 1], [0.0041, 0.5], [0.009, 0.15]]);
    gradPoly(c, [...far, [W + 10, H], [-10, H]], '#a9c68c', '#86a86a', 1950, 2150);
    const mid = ridge(2085, 40, 11, [[0.0012, 1], [0.0035, 0.35], [0.008, 0.12]]);
    gradPoly(c, [...mid, [W + 10, H], [-10, H]], '#8ab356', '#557f2f', 2030, 2300);
    blob(c, 330, 2110, 300, '#c9df8f', 70, null, 1.6, 0.35);
    const near = ridge(2245, 66, 23, [[0.001, 1], [0.0027, 0.4], [0.007, 0.1]]);
    gradPoly(c, [...near, [W + 10, H], [-10, H]], '#6e9f3d', '#2a5118', 2170, H);
    const greens = ['#82b049', '#4d7d27', '#35611c', '#97c05c'];
    for (let k = 0; k < 3200; k++) {
      const x = r() * W, y = 2190 + r() * 380;
      if (y < near[Math.min(near.length - 1, Math.floor((x + 10) / 6))][1] + 12) continue;
      const ln = 8 + r() * 20 * (0.6 + (y - 2190) / 380);
      const col = greens[Math.floor(r() * 4)];
      const dx = (r() - 0.5) * 7;
      line(c, x, y, x + dx, y - ln, col, 2);
    }
    // овечка на гребне среднего холма
    const ox = 770, oy = mid[Math.floor(810 / 6)][1] - 40;
    for (const lx of [38, 50, 70, 82]) {
      poly(c, [[ox + lx / 2 - 1.25, oy + 26], [ox + lx / 2 + 1.25, oy + 26], [ox + lx / 2 + 1.25, oy + 37], [ox + lx / 2 - 1.25, oy + 37]], '#3c3a34');
    }
    for (const [bx, by, br] of [[40, 38, 18], [58, 32, 20], [76, 36, 19], [50, 48, 18], [70, 48, 18]]) {
      circle(c, ox + bx / 2, oy + by / 2, br / 2, '#f6f4ec');
    }
    circle(c, ox + 48, oy + 20, 5, '#46423c');
  }

  function romashki(c) {
    c.fillStyle = vfill(c, [['#223020', 0], ['#1a2517', 0.5], ['#121b10', 1]]);
    c.fillRect(0, 0, W, H);
    const r = rng(162);
    const grass = ['#2c3d25', '#34492a', '#1c2818', '#3d5530', '#26361f'];
    for (let k = 0; k < 9000; k++) {
      const x = r() * W, y = r() * H, ln = 14 + r() * 40;
      const ang = -Math.PI / 2 + (r() - 0.5) * 1.2;
      const col = grass[Math.floor(r() * 5)];
      line(c, x, y, x + Math.cos(ang) * ln, y + Math.sin(ang) * ln, col, 3);
    }
    blob(c, W / 2, 1380, 820, '#0b1109', 0, [[0, 190], [0.6, 130], [1, 0]], 1, 1.45);
    const zone = y => (y < 560 || y > 2140 ? 1 : y < 700 || y > 2020 ? 0.35 : 0);
    for (let k = 0; k < 60; k++) {
      const y = r() * H;
      if ((y > 420 && y < 2260) || r() > zone(y)) continue;
      const x = r() * W, rad = 24 + r() * 34;
      blob(c, x, y, rad, '#f2efe6', 0, [[0, 46], [0.6, 34], [1, 0]]);
    }
    const flowers = [];
    for (let k = 0; k < 900; k++) {
      const y = r() * H;
      if (r() > zone(y)) continue;
      const x = r() * W, size = Math.floor(18 + r() ** 1.6 * 34), t = r(), a = r();
      flowers.push([x, y, size, t, a]);
    }
    for (const [x, y, size, t, a] of flowers) {
      const tint = t < 0.66 ? '#f6f3ea' : t < 0.84 ? '#f0d3cc' : '#f3e2c8';
      const al = (150 + a * 105) / 255;
      poly(c, daisyPts(x, y, size, ((Math.floor(t * 997) % 360) * Math.PI) / 180), tint, al);
      circle(c, x, y, size * 0.15, '#dcae2c', al);
    }
  }

  function firRow(c, yBase, hmin, hmax, count, r, cols) {
    for (let k = 0; k < count; k++) {
      const x = r() * W, hh = hmin + r() * (hmax - hmin), w = hh * 0.34;
      const pts = [[x, yBase - hh]];
      for (let t = 1; t <= 5; t++) {
        const yy = yBase - hh + hh * t / 5, ww = w * (0.35 + 0.65 * t / 5);
        pts.push([x + ww, yy]);
        if (t < 5) pts.push([x + ww * 0.45, yy - hh * 0.03]);
      }
      const left = pts.slice(1).reverse().map(([px, py]) => [2 * x - px, py]);
      poly(c, [...pts, ...left], cols[Math.floor(r() * cols.length)]);
    }
  }

  function taiga(c) {
    c.fillStyle = vfill(c, [['#cdbfa8', 0], ['#b4a488', 0.06], ['#948468', 0.12]]);
    c.fillRect(0, 0, W, H);
    blob(c, 980, 60, 520, '#f6dcaa', 110);
    const r = rng(163);
    const far = ridge(245, 30, 3, [[0.0013, 1], [0.004, 0.4], [0.01, 0.1]]);
    gradPoly(c, [...far, [W + 10, H], [-10, H]], '#958b77', '#7b705b', 200, 420);
    const lit = ridge(360, 36, 9, [[0.0017, 1], [0.0052, 0.3], [0.012, 0.1]]);
    gradPoly(c, [...lit, [W + 10, H], [-10, H]], '#6f6146', '#35301f', 320, 800);
    const trees = [];
    for (let k = 0; k < 3400; k++) {
      const y = 345 + r() * 450, x = r() * W, t1 = r(), t2 = r();
      trees.push([x, y, t1, t2]);
    }
    trees.sort((p, q) => p[1] - q[1]);
    for (const [x, y, t1, t2] of trees) {
      const k = (y - 345) / 450, hh = 7 + k * 20 + t1 * 7, w2 = hh * (0.3 + t2 * 0.1);
      poly(c, [[x, y - hh], [x - w2, y], [x, y]], css(mix('#d9bb7d', '#8a7652', k * 0.7 + t2 * 0.3)));
      poly(c, [[x, y - hh], [x, y], [x + w2, y]], css(mix('#6a5a3c', '#2e2a1c', k * 0.7 + t2 * 0.3)));
    }
    for (const [cx, cy, rr] of [[210, 520, 260], [760, 610, 300], [1080, 450, 200], [470, 700, 220]]) {
      blob(c, cx, cy, rr, '#2c2718', 120, null, 1.7, 0.45);
    }
    blob(c, 900, 380, 420, '#f0d59c', 55, null, 1.6, 0.35);
    gradPoly(c, [[-10, 690], [W * 0.35, 752], [W * 0.7, 728], [W + 10, 782], [W + 10, H], [-10, H]], '#223022', '#0e140e', 680, H);
    blob(c, W / 2, 790, 820, '#0f150f', 140, null, 1, 0.25);
    const needles = ['#1c261c', '#243024', '#172017', '#2a372a'];
    for (let k = 0; k < 3800; k++) {
      const x = r() * W, y = 760 + r() * (H - 760), hh = 10 + r() * 18;
      poly(c, [[x, y - hh], [x - hh * 0.3, y], [x + hh * 0.3, y]], needles[Math.floor(r() * 4)]);
    }
    blob(c, 250, 1500, 520, '#2a3a2a', 50);
    firRow(c, H + 40, 260, 420, 16, r, ['#0a0f0b', '#0d130d']);
    firRow(c, H + 60, 360, 560, 7, r, ['#060907']);
  }

  function tush(c) {
    c.fillStyle = '#0b0b0a';
    c.fillRect(0, 0, W, H);
    const r = rng(164);
    blob(c, W * 0.12, H * 0.66, 760, '#2c2b27', 150, null, 1, 1.2);
    blob(c, W * 0.95, H * 0.18, 560, '#1c1b19', 120);
    const big = 1500;
    enso(c, W / 2 - big / 2, H * 0.555 - big / 2, big, '#2e2c28',
      { widthK: 0.085, seed: 41, start: -Math.PI / 2 + 0.66, span: PI2 - 1.3, s: 2 });
    for (let k = 0; k < 30000; k++) {
      const x = r() * W, y = r() * H, v = Math.floor(22 + r() * 30);
      c.fillStyle = `rgb(${v},${v},${v - 2})`;
      c.fillRect(Math.floor(x), Math.floor(y), 1, 1);
    }
  }

  function manga(c) {
    c.fillStyle = vfill(c, [['#1f1f1f', 0], ['#404040', 0.3], ['#707070', 0.68], ['#9a9a9a', 0.83]]);
    c.fillRect(0, 0, W, H);
    const r = rng(165);
    for (let k = 0; k < 16; k++) {
      const x = r() * W, y = 1250 + r() * 700, rad = 120 + r() * 200, a = 70 + r() * 60;
      blob(c, x, y, rad, '#f2f2f2', a, null, 4.6, 0.16);
    }
    for (let k = 0; k < 9; k++) {
      const x = r() * W, y = 330 + r() * 700, rad = 140 + r() * 180, a = 60 + r() * 40;
      blob(c, x, y, rad, '#141414', a, null, 4.2, 0.2);
    }
    line(c, 120, 690, 1060, 540, '#f5f5f5', 3);
    line(c, 520, 640, 1110, 560, '#f5f5f5', 2);
    c.fillStyle = '#0e0e0e';
    c.beginPath();
    for (let yy = 0; yy < 820; yy += 22) {
      for (let xx = 0; xx < W + 22; xx += 22) {
        const ox = Math.floor(yy / 22) % 2 ? 11 : 0;
        const rr = 5 * (1 - yy / 820) ** 1.4;
        if (rr < 0.7) continue;
        c.moveTo(xx + ox + rr, yy);
        c.arc(xx + ox, yy, rr, 0, PI2);
      }
    }
    c.fill();
    const hy = 2140;
    const peaks = [[-10, hy - 20], [90, hy - 110], [160, hy - 80], [250, hy - 185], [330, hy - 120], [420, hy - 150],
      [520, hy - 95], [640, hy - 130], [760, hy - 75], [900, hy - 105], [1010, hy - 60], [1100, hy - 90], [W + 10, hy - 50]];
    gradPoly(c, [...peaks, [W + 10, hy + 20], [-10, hy + 20]], '#707070', '#8e8e8e', hy - 190, hy + 20);
    for (let k = 0; k < peaks.length - 1; k++) {
      const [x1, y1] = peaks[k], [x2, y2] = peaks[k + 1];
      if (y1 < y2) line(c, x1, y1, x1 + (x2 - x1) * 0.4, y1 + (y2 - y1) * 0.4, '#ececec', 4);
    }
    for (const [tx, th, tw] of [[630, 120, 110], [700, 150, 130], [790, 135, 120], [870, 165, 150], [950, 125, 110],
      [1020, 100, 90], [130, 75, 64], [190, 90, 76], [260, 70, 58]]) {
      line(c, tx, hy + 8, tx, hy + 8 - th * 0.45, '#1a1a1a', Math.max(3, Math.floor(tw * 0.08)));
      const n = Math.floor(22 + tw / 5);
      for (let k = 0; k < n; k++) {
        const ang = r() * 3.1416, dist = r() ** 0.6;
        const cx = tx + Math.cos(ang) * tw * 0.5 * dist;
        const cy = hy + 8 - th * 0.5 - Math.sin(ang) * th * 0.42 * dist;
        const rr = tw * (0.07 + r() * 0.09), v = 20 + Math.floor(r() * 18);
        circle(c, cx, cy, rr, `rgb(${v},${v},${v})`);
      }
    }
    gradPoly(c, [[-10, hy + 12], [W + 10, hy + 6], [W + 10, H], [-10, H]], '#7a7a7a', '#141414', hy, H);
    for (let k = 0; k < 6000; k++) {
      const x = r() * W, y = hy + 14 + r() ** 0.8 * (H - hy - 14);
      const depth = (y - hy) / (H - hy);
      const ln = 8 + depth * 80 * (0.5 + r());
      const bend = (r() - 0.5) * ln * 0.5;
      const v = r() < 0.6 ? Math.floor(20 + r() * 40) : Math.floor(150 + r() * 90);
      line(c, x, y, x + bend, y - ln, `rgb(${v},${v},${v})`, Math.max(1, Math.floor(1 + depth * 3)));
    }
  }

  const RAY_STEPS = [[0.35, 1], [0.6, 0.8], [0.85, 0.6], [1.1, 0.45], [1.45, 0.3]];
  const TUMAN_CLUSTERS = [[-20, 90, 560], [330, -10, 420], [860, 40, 480], [1180, 280, 520], [-80, 640, 400],
    [1200, 860, 330], [140, 400, 260], [1010, 520, 240], [620, -150, 330]];

  function tuman(c) {
    c.fillStyle = vfill(c, [['#0c140e', 0], ['#121b16', 0.28], ['#222a2c', 0.52], ['#394145', 0.72],
      ['#7e8689', 0.8], ['#4b5356', 0.88], ['#1f2527', 1]]);
    c.fillRect(0, 0, W, H);
    const r = rng(166);
    const sx = W * 0.56, sy = 520;
    // лучи копятся на отдельном слое, потом гаснут книзу
    const rays = document.createElement('canvas');
    rays.width = W; rays.height = H;
    const o = rays.getContext('2d');
    o.fillStyle = 'rgb(226,236,232)';
    for (let k = 0; k < 11; k++) {
      const a = Math.PI / 2 + (k - 5) * 0.14 + (r() - 0.5) * 0.07;
      const half = 0.022 + r() * 0.03, baseA = 10 + r() * 12;
      for (const [f, fa] of RAY_STEPS) {
        const hw = half * f;
        o.globalAlpha = Math.floor(baseA * fa) / 255;
        trace(o, [[sx, sy], [sx + Math.cos(a - hw) * 2400, sy + Math.sin(a - hw) * 2400],
          [sx + Math.cos(a + hw) * 2400, sy + Math.sin(a + hw) * 2400]]);
        o.fill();
      }
    }
    o.globalAlpha = 1;
    o.globalCompositeOperation = 'destination-in';
    o.fillStyle = vfill(o, [['rgba(0,0,0,0)', 0], ['rgba(0,0,0,0)', 0.19], ['rgba(0,0,0,1)', 0.3],
      ['rgba(0,0,0,0.69)', 0.6], ['rgba(0,0,0,0)', 0.8]]);
    o.fillRect(0, 0, W, H);
    c.drawImage(rays, 0, 0);
    for (let k = 0; k < 110; k++) {
      const x = r() * W, y = 1990 + r() * 220, rad = 170 + r() * 190, a = 60 + r() * 60;
      blob(c, x, y, rad, '#bcc4c6', a, null, 2.4, 0.42);
    }
    blob(c, W / 2, 2080, 900, '#aeb6b8', 90, null, 1.4, 0.3);
    blob(c, sx, 2420, 150, '#f2f5f5', 140, null, 0.8, 1.5);
    c.fillStyle = 'rgb(226,232,234)';
    for (let k = 0; k < 300; k++) {
      const y = 2250 + r() ** 0.9 * 306;
      const spread = 80 + (y - 2250) * 0.9;
      const x = sx + (r() - 0.5) * 2 * spread * (0.4 + r());
      const w = 8 + r() * 46 * Math.max(0, 1 - Math.abs(x - sx) / (spread * 1.6 + 1));
      if (w < 6) continue;
      r(); // в макете тут бралась прозрачность блика — число берём, чтобы не сбить ряд
      c.beginPath();
      c.ellipse(x, y, w, 2.5, 0, 0, PI2);
      c.fill();
    }
    for (const [cx, cy, cr] of TUMAN_CLUSTERS) blob(c, cx, cy, cr * 0.95, '#08100a', 0, [[0, 245], [0.65, 225], [1, 0]]);
    const lits = ['#86a852', '#a6c46a', '#c4da8c'], darks = ['#0b150c', '#112013', '#172a17', '#1f3520'];
    for (const [cx, cy, cr] of TUMAN_CLUSTERS) {
      const n = Math.floor(cr * 1.6);
      for (let k = 0; k < n; k++) {
        const ang = r() * TAU, dist = cr * r() ** 0.55;
        const x = cx + Math.cos(ang) * dist, y = cy + Math.sin(ang) * dist * 0.85;
        const s = 8 + r() * 16;
        const near = Math.hypot(x - sx, y - sy) < 470;
        const lit = near && dist > cr * 0.55 && r() < 0.5;
        const col = lit ? lits[Math.floor(r() * 3)] : darks[Math.floor(r() * 4)];
        const rot = r() * 3.1416, pts = [];
        for (let j = 0; j < 10; j++) {
          const t = j / 10 * TAU, px = Math.cos(t) * s, py = Math.sin(t) * s * 0.5;
          pts.push([x + px * Math.cos(rot) - py * Math.sin(rot), y + px * Math.sin(rot) + py * Math.cos(rot)]);
        }
        poly(c, pts, col, (lit ? 200 : 240) / 255);
      }
    }
    blob(c, sx, sy, 300, '#f6f9ee', 0, [[0, 150], [0.4, 60], [1, 0]]);
    blob(c, sx, sy, 60, '#ffffff', 0, [[0, 255], [0.45, 210], [1, 0]]);
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4 + 0.35, L = k % 2 ? 110 : 170;
      line(c, sx, sy, sx + Math.cos(a) * L, sy + Math.sin(a) * L, '#ffffff', 3);
    }
  }

  const PAINTERS = { pole, romashki, taiga, tush, manga, tuman };

  // Готовая сцена одна на всех — рисуем раз и держим пару последних: так
  // перерисовка превью 15 раз в секунду не рисует лес заново.
  const sceneCache = new Map();
  function scene(key) {
    let cv = sceneCache.get(key);
    if (cv) {
      sceneCache.delete(key);
      sceneCache.set(key, cv);
      return cv;
    }
    cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const c = cv.getContext('2d');
    c.lineCap = 'butt';
    PAINTERS[key](c);
    sceneCache.set(key, cv);
    while (sceneCache.size > 2) sceneCache.delete(sceneCache.keys().next().value);
    return cv;
  }

  window.VitaScenes = {
    W, H, SCENES, SCENE_BASE, EMPTY_ALPHA, NEW_SHAPES, THEMES, DAISY_CENTER,
    rng, scene, shapePts, trace, flowerCenter, ensoDot, tone, toneInk, glow, blob,
  };
})();
