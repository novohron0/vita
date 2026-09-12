/* Кнопка «Войти через Telegram» — вход через бота одной кнопкой.

   Кнопка — это ссылка на бота. Человек жмёт «Старт» в телеграме, возвращается
   в браузер — и уже внутри. Сайт заранее заводит пару «старт + секрет»: старт
   уходит в ссылку t.me, секрет остаётся здесь, и без него вход не забрать.
   Пока человек в телеграме, страница тихо спрашивает сервер; вернулся —
   спрашивает сразу, не дожидаясь следующего круга. */
(function () {
  const WAIT_KEY = 'vitaTgWait';
  const GLYPH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.9 4.3 18.7 19c-.24 1.06-.87 1.32-1.76.82l-4.87-3.6-2.35 2.27c-.26.26-.48.48-.98.48l.35-4.96 9.03-8.16c.39-.35-.09-.55-.61-.2L6.37 12.68l-4.8-1.5c-1.04-.33-1.06-1.04.22-1.54l18.77-7.24c.87-.32 1.63.2 1.34 1.9z"/></svg>';
  const mounted = new WeakSet();

  // Пара переживает перезагрузку вкладки: Safari любит выгрузить страницу,
  // пока человек сидит в другом приложении.
  function saved() {
    try {
      const pair = JSON.parse(sessionStorage.getItem(WAIT_KEY) || 'null');
      return pair && pair.start && Date.now() - pair.at < pair.ttl * 1000 ? pair : null;
    } catch { return null; }
  }
  function remember(pair) { try { sessionStorage.setItem(WAIT_KEY, JSON.stringify(pair)); } catch {} }
  function forget() { try { sessionStorage.removeItem(WAIT_KEY); } catch {} }

  function mount(box, state, onDone) {
    if (!box || !state || !state.tgBot) return false;
    if (mounted.has(box)) return true;
    mounted.add(box);
    const holder = box.querySelector('.tg-widget') || box;
    const status = box.querySelector('.tg-status');
    const say = text => { if (status) status.textContent = text; };

    const btn = document.createElement('a');
    btn.className = 'tg-btn';
    btn.href = 'https://t.me/' + state.tgBot;
    btn.rel = 'noopener';
    // на компьютере телеграм откроется рядом, а эта вкладка останется ждать
    if (matchMedia('(hover: hover) and (pointer: fine)').matches) btn.target = '_blank';
    btn.innerHTML = GLYPH + 'Войти через Telegram';
    holder.innerHTML = '';
    holder.appendChild(btn);
    box.hidden = false;

    let pair = null, waiting = false, busy = false, timer = 0;
    const fresh = () => pair && Date.now() - pair.at < (pair.ttl - 120) * 1000;

    async function renew() {
      try {
        pair = { ...(await VitaID.tgStart()), at: Date.now() };
        btn.href = pair.link;
      } catch {
        pair = null;
      }
      return pair;
    }

    function wait() {
      waiting = true;
      remember(pair);
      say('Нажми «Старт» в телеграме и возвращайся сюда');
      clearInterval(timer);
      timer = setInterval(() => { if (document.visibilityState === 'visible') check(); }, 2000);
    }

    function stop() {
      waiting = false;
      clearInterval(timer);
      forget();
    }

    async function check() {
      if (!waiting || busy || !pair) return;
      busy = true;
      try {
        const data = await VitaID.tgCheck(pair.start, pair.secret);
        if (data && data.token) {
          stop();
          say('Готово, входим…');
          if (onDone) onDone(data); else location.reload();
        }
      } catch (error) {
        if (error.gone) {
          stop();
          say('Ссылка устарела — нажми кнопку ещё раз');
          renew();
        }
        // сеть моргнула — спросим на следующем круге
      } finally {
        busy = false;
      }
    }

    btn.addEventListener('click', async e => {
      if (fresh()) { wait(); return; }       // ссылка готова — телеграм откроется сам
      e.preventDefault();
      say('Открываю телеграм…');
      if (!(await renew())) { say('Телеграм сейчас не отвечает — попробуй чуть позже'); return; }
      wait();
      location.href = pair.link;
    });

    const back = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', back);
    addEventListener('focus', back);
    addEventListener('pageshow', back);

    const before = saved();
    if (before) {
      pair = before;
      btn.href = pair.link;
      wait();
      check();
    } else {
      renew();
    }
    return true;
  }

  window.VitaTG = { mount };
})();
