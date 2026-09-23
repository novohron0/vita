/* Дверь в Vita: вход и регистрация одной страницей.

   Раньше это было окно поверх главной, и человек читал форму сквозь обои.
   Теперь страница своя: чёрный фон, логотип, капсула «Вход / Регистрация»,
   пароль спрашиваем один раз. Забытый пароль идёт тут же тремя шагами:
   почта → код из письма → новый пароль. */
const $ = id => document.getElementById(id);

// Адрес решает, какая половина капсулы открыта: /register — регистрация,
// /login — вход. Сторож с главной приводит новых людей на /register: без
// аккаунта входить некуда.
let mode = location.pathname === '/login' ? 'login' : 'register';
                                          // login | register | forgot | reset | tag

// Возвращаемся туда, откуда человека сюда отправили. Берём только свой путь:
// «//чужой.сайт» и абсолютные адреса игнорируем, иначе это открытый редирект.
const next = (() => {
  const raw = new URLSearchParams(location.search).get('next') || '/';
  return /^\/(?!\/)/.test(raw) ? raw : '/';
})();

/* ---------- отрисовка состояния ---------- */

function paint() {
  const entry = mode === 'login' || mode === 'register';
  const reg = mode === 'register';

  $('authTabs').hidden = !entry;
  $('stepEntry').hidden = !entry;
  $('tagRow').hidden = !reg;
  $('stepTag').hidden = mode !== 'tag';
  $('stepForgot').hidden = mode !== 'forgot';
  $('stepReset').hidden = mode !== 'reset';
  $('tgBox').hidden = !entry || !tgReady;
  $('authForgotLink').hidden = mode !== 'login';
  $('authBack').hidden = entry || mode === 'tag';

  $('authTabs').querySelectorAll('button')
    .forEach(b => b.classList.toggle('on', b.dataset.v === mode));
  // пилюля стоит слева на регистрации и переезжает вправо на вход
  $('authTabs').classList.toggle('at-login', mode === 'login');
  $('authOr').hidden = !entry || !tgReady;

  const label = mode === 'forgot' ? 'Отправить код'
    : mode === 'reset' ? 'Сменить пароль'
    : mode === 'tag' ? 'Готово'
    : reg ? 'Создать аккаунт' : 'Войти';
  $('authGo').textContent = label;
  // Оферту принимают, когда входят или заводят аккаунт. На шагах смены пароля
  // строка про согласие не к месту — прячем её вместе с подвалом.
  $('legalAction').textContent = label;
  document.querySelector('.login-legal').hidden = !entry;

  $('authPass').autocomplete = reg ? 'new-password' : 'current-password';
  $('authPass').placeholder = reg ? 'От шести знаков' : 'Твой пароль';
  $('authErr').hidden = true;
}

function fail(message) {
  const box = $('authErr');
  box.textContent = message;
  box.hidden = false;
}

/* ---------- тег: выбирают при регистрации, один на человека ---------- */

const TAG_RE = /^[a-z][a-z0-9_]{1,22}[a-z0-9]$/;
const TAG_RULE = 'Тег: 3–24 знака, латиница, цифры и _, начинается с буквы';
const cleanTag = v => String(v || '').trim().replace(/^@+/, '').toLowerCase();
const tagOk = t => TAG_RE.test(t) && !t.includes('__');

function watchTag(input, hint, idle) {
  let timer = 0;
  const say = (text, cls = '') => { hint.textContent = text; hint.className = 'tag-hint ' + cls; };
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const tag = cleanTag(input.value);
    if (!tag) { say(idle); return; }
    if (!tagOk(tag)) { say(TAG_RULE, 'err'); return; }
    timer = setTimeout(async () => {
      try {
        const data = await (await fetch('/api/tag-free?tag=' + encodeURIComponent(tag))).json();
        if (cleanTag(input.value) !== tag) return;
        if (!data.ok) say(data.why, 'err');
        else if (!data.free) say('@' + tag + ' уже занят — придумай другой', 'err');
        else say('@' + tag + ' свободен', 'ok');
      } catch {}
    }, 320);
  });
}
watchTag($('authTag'), $('tagHint'), 'латиница, цифры и _ — по нему тебя найдут');
watchTag($('authTag2'), $('tagHint2'), 'латиница, цифры и _');

function needTag(value) {
  const tag = cleanTag(value);
  if (!tag) throw new Error('Придумай тег — по нему тебя найдут в Vita');
  if (!tagOk(tag)) throw new Error(TAG_RULE);
  return tag;
}

// Вошёл, а тега у аккаунта ещё нет (телеграм, старый аккаунт) — дверь не
// открываем, пока не выберет. Ник из телеграма подставляем, если подходит.
function afterAuth(data) {
  const profile = data && data.profile;
  if (profile && profile.handleChosen === false) {
    const tg = cleanTag(data.telegram);
    if (tagOk(tg)) $('authTag2').value = tg;
    mode = 'tag';
    paint();
    $('authTag2').focus();
    return;
  }
  done();
}

/* ---------- четыре клетки кода ведут себя как одно поле ---------- */

const cells = [...$('codeRow').querySelectorAll('.code-cell')];
const codeValue = () => cells.map(c => c.value).join('');

cells.forEach((cell, i) => {
  cell.addEventListener('input', () => {
    cell.value = cell.value.replace(/\D/g, '').slice(-1);
    if (cell.value && i < cells.length - 1) cells[i + 1].focus();
  });
  cell.addEventListener('keydown', e => {
    if (e.key === 'Backspace' && !cell.value && i > 0) cells[i - 1].focus();
  });
  cell.addEventListener('paste', e => {
    const digits = (e.clipboardData?.getData('text') || '').replace(/\D/g, '');
    if (!digits) return;
    e.preventDefault();
    cells.forEach((c, n) => { c.value = digits[n] || ''; });
    cells[Math.min(digits.length, cells.length) - 1].focus();
  });
});

/* ---------- переключатели ---------- */

$('authTabs').addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  mode = btn.dataset.v;
  paint();
  // адрес идёт за капсулой: ссылку на нужную половину можно дать кому угодно
  const path = mode === 'login' ? '/login' : '/register';
  history.replaceState(null, '', path + location.search);
  $('authEmail').focus();
});

// Пароль спрашиваем один раз, поэтому даём на него посмотреть — это честнее,
// чем заставлять вслепую печатать его дважды.
$('passEye').addEventListener('click', () => {
  const input = $('authPass');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  $('passEye').classList.toggle('on', show);
  $('passEye').setAttribute('aria-label', show ? 'Скрыть пароль' : 'Показать пароль');
  input.focus();
});

$('authForgotLink').addEventListener('click', () => {
  $('authForgotEmail').value = $('authEmail').value.trim();
  mode = 'forgot';
  paint();
  $('authNote').hidden = true;
  $('authForgotEmail').focus();
});

$('authBack').addEventListener('click', () => {
  mode = 'login';
  paint();
  $('authNote').hidden = true;
});

/* ---------- отправка ---------- */

$('authForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('authGo');
  const label = btn.textContent;
  $('authErr').hidden = true;
  btn.disabled = true;
  btn.textContent = 'Минутку…';

  try {
    if (mode === 'register') {
      const tag = needTag($('authTag').value);
      await VitaID.register($('authEmail').value.trim(), $('authPass').value, tag);
    } else if (mode === 'login') {
      afterAuth(await VitaID.login($('authEmail').value.trim(), $('authPass').value));
      if (mode === 'tag') { btn.disabled = false; return; }
      return;
    } else if (mode === 'tag') {
      await VitaID.updateProfile({ handle: needTag($('authTag2').value) });
    } else if (mode === 'forgot') {
      const email = $('authForgotEmail').value.trim();
      if (!email) throw new Error('Впиши почту, на которую регистрировался');
      const data = await VitaID.forgot(email);
      $('authNote').textContent = data.hint;
      $('authNote').hidden = false;
      if (data.sent) {
        mode = 'reset';
        cells.forEach(c => { c.value = ''; });
        paint();
        $('authNote').hidden = false;
        cells[0].focus();
      }
      btn.disabled = false;
      btn.textContent = $('authGo').textContent;
      return;
    } else {
      if (codeValue().length < cells.length) throw new Error('Впиши все четыре цифры');
      await VitaID.resetPass($('authForgotEmail').value.trim(), codeValue(), $('authNewPass').value);
    }
    done();
    return;
  } catch (error) {
    fail(error.message || 'Не получилось');
  }
  btn.disabled = false;
  btn.textContent = label;
});

function done() {
  try {
    localStorage.setItem('vitaAuthSeen', '1');
    localStorage.setItem('vitaSignedIn', '1');
  } catch (e) {}
  location.replace(next);
}

/* ---------- телеграм и уже открытая дверь ---------- */

let tgReady = false;

(async () => {
  let access = null;
  try { access = await VitaID.access(); } catch { paint(); return; }

  // Уже вошёл — держать его перед формой незачем, если тег уже выбран
  if (access.email || access.telegram) {
    try { afterAuth({ profile: await VitaID.ensure(), telegram: access.telegram }); }
    catch { done(); }
    return;
  }

  if (access.tgBot && window.VitaTG) {
    tgReady = VitaTG.mount($('tgBox'), access, afterAuth) !== false;
  }
  paint();
})();

paint();

/* ---------- тема ---------- */

const themeBtn = $('themeBtn');
function syncTheme() {
  const light = document.documentElement.dataset.theme === 'light';
  themeBtn.classList.toggle('is-light', light);
  themeBtn.setAttribute('aria-label', light ? 'Тёмная тема' : 'Светлая тема');
  themeBtn.setAttribute('aria-pressed', light ? 'true' : 'false');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = light ? '#f1ece3' : '#000000';
}
themeBtn.addEventListener('click', () => {
  const light = document.documentElement.dataset.theme === 'light';
  if (light) document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = 'light';
  try { localStorage.setItem('vita-theme', light ? 'dark' : 'light'); } catch (e) {}
  syncTheme();
});
syncTheme();
