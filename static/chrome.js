// ——— Слой айфона: то, что iOS рисует поверх обоев сам ——————————————————
// Статус-бар, дата с погодой, часы, виджеты, фонарик и камера на экране
// блокировки; иконки, поиск и док на «Домой». Один код на конструктор
// (app.js) и страницу установки (setup.html) — чтобы слои больше не
// расходились. На готовые обои ничего из этого не попадает: это ориентир,
// как точки уживутся с тем, что айфон нарисует поверх.
const SCREEN_W = 1179, SCREEN_H = 2556;   // экран айфона 15 Pro — ровно размер обоев

const CHROME_FACE = '-apple-system, "SF Pro Display", system-ui, sans-serif';
const chromeFont = (px, w = 500) => `${w} ${Math.round(px)}px ${CHROME_FACE}`;
const chromeRGBA = rgb => a => `rgba(${rgb}, ${a})`;
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
// сетка «Домой»: 4×5 иконок, поиск и док
const HOME_ICON = 190, HOME_COLS = 4, HOME_ROWS = 5;
const HOME_PAD = 110, HOME_TOP = 330, HOME_STEP_Y = 300, HOME_DOCK_Y = 2145;
const HOME_NAMES = ['Фото', 'Камера', 'Почта', 'Заметки', 'Карты', 'Погода', 'Часы',
  'Музыка', 'Команды', 'Настройки', 'Календарь', 'Файлы', 'Здоровье', 'Кошелёк',
  'Браузер', 'Телефон', 'Сообщения', 'Подкасты', 'Книги', 'Дом'];

// Слой и растяжку часов человек выставляет в «Расположении» конструктора,
// страница установки читает их отсюда же.
function chromePrefs() {
  let on = true, tall = 1;
  try {
    on = localStorage.getItem('vitaChrome') !== '0';
    const v = parseFloat(localStorage.getItem('vitaClockH'));
    if (v >= 1 && v <= 1 + CLOCK_TALL) tall = v;
  } catch {}
  return { on, tall };
}

// Айфон красит свои значки по обоям: на светлых — тёмным. Смотрим на
// двадцать пять точек готового кадра — канвы или картинки. Забираем их одним
// чтением: каждый getImageData тормозит кадр на своём месте (видеопамять
// отдаёт пиксели не сразу), и двадцать пять таких чтений стоили полсотни
// миллисекунд. Пиксели те же самые — просто сперва собираем их в крошечную
// канву. Не вышло прочитать — null.
const inkPick = document.createElement('canvas');
function chromeInkOf(src) {
  const k = (src.naturalWidth || src.width) / SCREEN_W;
  let sum = 0, n = 0;
  try {
    if (inkPick.width !== 5) { inkPick.width = 5; inkPick.height = 5; }
    const ip = inkPick.getContext('2d', { willReadFrequently: true });
    for (let i = 1; i <= 5; i++) {
      const ys = [120, 520, 900, 2070, 2480];
      for (let j = 0; j < 5; j++) {
        ip.drawImage(src, Math.round(SCREEN_W * i / 6 * k), Math.round(ys[j] * k), 1, 1, i - 1, j, 1, 1);
      }
    }
    const px = ip.getImageData(0, 0, 5, 5).data;
    for (let i = 0; i < px.length; i += 4) {
      sum += (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
      n++;
    }
  } catch {}
  if (!n) return null;
  return sum / n > 0.62 ? '17, 17, 19' : '255, 255, 255';
}

// Часы: ползунок тянет их вверх ровно так, как это делает айфон — цифры
// становятся выше и немного шире, а верх остаётся на месте.
// На часах — сейчашнее время, как на айфоне: «00:00» шире почти любого
// настоящего времени, и растянутые до упора часы вылезали за края.
const clockText = () => new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

function clockGeom(c, tall) {
  const t = Math.min(1, Math.max(0, (tall - 1) / CLOCK_TALL));
  const px = CLOCK_PX * (1 + CLOCK_WIDE * t);
  const w8 = Math.round(500 + 260 * t);
  c.save();
  c.textBaseline = 'alphabetic';   // мерка ascent считается от текущей линии
  c.font = chromeFont(px, w8);
  const m = c.measureText(clockText());
  c.restore();
  const asc = m.actualBoundingBoxAscent || px * 0.73;
  // высоту берём из мерки айфона, а не из шрифта: где нет SF, цифры другой
  // высоты, а часы всё равно должны встать ровно туда, куда их ставит iOS
  const h = CLOCK_H * tall;
  return { px, w8, asc, ky: h / asc, w: m.width, h, top: CLOCK_TOP };
}

// Экран блокировки целиком. На странице установки верх и низ живут на разных
// слоях: при разблокировке часы уезжают вверх, а фонарик с камерой гаснут.
function drawChrome(c, ink, tall) {
  drawLockTop(c, ink, tall);
  drawLockBottom(c, ink);
}

// Верх: дата с погодой, часы и виджеты над фонариком.
function drawLockTop(c, ink, tall) {
  const box = (x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
  c.save();
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';

  // дата с погодой одной строкой, как на экране блокировки
  const day = new Date().toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric' });
  const left = day.charAt(0).toUpperCase() + day.slice(1), right = '14°';
  c.font = chromeFont(60, 600);
  const wL = c.measureText(left).width, wR = c.measureText(right).width;
  const gap = 22, cloudW = 66, dy = 236;
  let x = (SCREEN_W - (wL + gap + cloudW + gap + wR)) / 2;
  c.fillStyle = ink(0.88);
  c.textBaseline = 'middle';
  c.fillText(left, x, dy);
  x += wL + gap;
  c.save();                            // облачко: три шапки на общем основании
  c.translate(x, dy - 1);
  c.scale(1.22, 1.22);
  c.beginPath();
  c.arc(20, -1, 13, 0, 7);
  c.arc(34, 3, 10, 0, 7);
  c.arc(12, 6, 9, 0, 7);
  c.roundRect(4, 1, 44, 14, 7);
  c.fill();
  c.restore();
  c.fillText(right, x + cloudW + gap, dy);

  // часы
  const g = clockGeom(c, tall);
  c.save();
  c.translate(SCREEN_W / 2, g.top);
  c.scale(1, g.ky);
  c.font = chromeFont(g.px, g.w8);
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  c.fillStyle = ink(0.62);
  c.fillText(clockText(), 0, g.asc);
  c.restore();

  // виджеты снизу: список слева и две круглые кнопки справа
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.lineWidth = 4;
  for (const [cy, barW] of [[1962, 300], [2047, 300]]) {
    c.beginPath(); c.arc(125, cy, 18, 0, 7);
    c.strokeStyle = ink(0.5); c.stroke();
    box(180, cy - 13, barW, 26, 13); c.fillStyle = ink(0.5); c.fill();
  }
  for (const cx of [725, 995]) {
    c.beginPath(); c.arc(cx, 2005, 87, 0, 7);
    c.fillStyle = ink(0.14); c.fill();
  }
  c.beginPath();                      // воспроизведение
  c.moveTo(706, 1976); c.lineTo(706, 2034); c.lineTo(754, 2005);
  c.closePath();
  c.fillStyle = ink(0.72); c.fill();
  c.strokeStyle = ink(0.72);          // будильник
  c.lineWidth = 6;
  c.beginPath(); c.arc(995, 1984, 24, 0, 7); c.stroke();
  c.beginPath();
  c.moveTo(995, 1970); c.lineTo(995, 1984); c.lineTo(1006, 1984);
  c.stroke();
  box(955, 2022, 80, 18, 9); c.fillStyle = ink(0.5); c.fill();
  c.restore();
}

// Низ и края: статус-бар, фонарик и камера в нижних углах — они стоят на
// любом экране блокировки, и точки под ними не видно, — полоска «домой».
function drawLockBottom(c, ink) {
  c.save();
  c.lineCap = 'round';
  c.lineJoin = 'round';
  drawStatusBar(c, ink, '');
  for (const [cx, glyph, rule] of [[225, TORCH, 'nonzero'], [954, CAMERA, 'evenodd']]) {
    c.beginPath(); c.arc(cx, 2322, 86, 0, 7);
    c.fillStyle = ink(0.16); c.fill();
    c.save();
    c.translate(cx - 66, 2322 - 66);
    c.scale(5.5, 5.5);
    c.fillStyle = ink(0.92);
    c.fill(glyph, rule);
    c.restore();
  }
  c.beginPath(); c.roundRect(SCREEN_W / 2 - 201, 2517, 402, 15, 7.5);   // полоска «домой»
  c.fillStyle = ink(0.55); c.fill();
  c.restore();
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

// Иконки, поиск и док — только превью: на обоях их нет, их рисует сам айфон.
// pose нужен анимации разблокировки на странице установки: at(x, y) отдаёт
// масштаб s и прозрачность a для элемента с центром в (x, y) — масштаб от
// центра экрана, — bar — прозрачность статус-бара. Без pose всё стоит на месте.
function drawHomeChrome(c, ink, pose) {
  const box = (x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
  // элемент с центром (x, y) в своей позе; без позы — как есть
  const at = (x, y, draw) => {
    if (!pose) return draw();
    const { s, a } = pose.at(x, y);
    if (a <= 0) return;
    c.save();
    c.globalAlpha *= Math.min(1, a);
    if (s !== 1) {
      c.translate(SCREEN_W / 2, SCREEN_H * 0.47);
      c.scale(s, s);
      c.translate(-SCREEN_W / 2, -SCREEN_H * 0.47);
    }
    draw();
    c.restore();
  };
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
  const stepX = (SCREEN_W - 2 * HOME_PAD - HOME_ICON) / (HOME_COLS - 1);
  const mid = HOME_ICON / 2;
  c.font = chromeFont(34, 500);
  for (let i = 0; i < HOME_COLS * HOME_ROWS; i++) {
    const x = HOME_PAD + (i % HOME_COLS) * stepX;
    const y = HOME_TOP + Math.floor(i / HOME_COLS) * HOME_STEP_Y;
    at(x + mid, y + mid, () => {
      icon(x, y);
      c.fillStyle = ink(0.92);
      c.fillText(HOME_NAMES[i], x + mid, y + HOME_ICON + 38);
    });
  }
  at(SCREEN_W / 2, 1960, () => {
    box(SCREEN_W / 2 - 120, 1930, 240, 60, 30); c.fillStyle = ink(0.18); c.fill();
    c.font = chromeFont(32, 500);
    c.fillStyle = ink(0.88);
    c.fillText('Поиск', SCREEN_W / 2, 1962);
  });
  at(SCREEN_W / 2, 2240, () => {
    box(44, 2080, SCREEN_W - 88, 320, 110);        // док
    c.fillStyle = ink(0.16); c.fill();
    c.strokeStyle = ink(0.28); c.lineWidth = 3; c.stroke();
  });
  for (let i = 0; i < HOME_COLS; i++) {
    const x = HOME_PAD + i * stepX;
    at(x + mid, HOME_DOCK_Y + mid, () => icon(x, HOME_DOCK_Y));
  }
  const bar = pose ? Math.min(1, pose.bar) : 1;
  if (bar > 0) {
    c.globalAlpha *= bar;
    drawStatusBar(c, ink, clockText());
    box(SCREEN_W / 2 - 140, 2478, 280, 10, 5);   // полоска «домой»
    c.fillStyle = ink(0.55); c.fill();
  }
  c.restore();
}
