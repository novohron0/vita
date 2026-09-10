/* Кнопка «Войти через Telegram».

   Готовый виджет телеграма приходит синим айфреймом и в тёмной карточке Vita
   выглядит заплаткой, поэтому кнопку рисуем свою, а окно входа открываем
   родным SDK. Данные телеграм подписывает сам, сервер проверяет подпись —
   подделать вход, не зная токена бота, нельзя. */
(function () {
  let sdk = null;

  function loadSdk() {
    if (sdk) return sdk;
    sdk = new Promise((resolve, reject) => {
      if (window.Telegram?.Login) return resolve(window.Telegram.Login);
      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://telegram.org/js/telegram-widget.js?22';
      script.onload = () => window.Telegram?.Login
        ? resolve(window.Telegram.Login)
        : reject(new Error('Телеграм не отвечает'));
      script.onerror = () => reject(new Error('Не удалось связаться с телеграмом'));
      document.head.appendChild(script);
    });
    return sdk;
  }

  function mount(box, state, onDone) {
    const botId = typeof state === 'object' ? state.tgBotId : '';
    if (!box || !botId) return false;
    const holder = box.querySelector('.tg-widget') || box;
    const status = box.querySelector('.tg-status');
    holder.innerHTML = '';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tg-btn';
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.9 4.3 18.7 19c-.24 1.06-.87 1.32-1.76.82l-4.87-3.6-2.35 2.27c-.26.26-.48.48-.98.48l.35-4.96 9.03-8.16c.39-.35-.09-.55-.61-.2L6.37 12.68l-4.8-1.5c-1.04-.33-1.06-1.04.22-1.54l18.77-7.24c.87-.32 1.63.2 1.34 1.9z"/></svg>Войти через Telegram';
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      if (status) status.textContent = 'Открываю телеграм…';
      try {
        const login = await loadSdk();
        login.auth({ bot_id: String(botId), request_access: 'write' }, async user => {
          if (!user) {
            btn.disabled = false;
            if (status) status.textContent = 'Вход отменён';
            return;
          }
          try {
            if (status) status.textContent = 'Входим…';
            const data = await VitaID.loginTelegram(user);
            if (onDone) onDone(data); else location.reload();
          } catch (error) {
            btn.disabled = false;
            if (status) status.textContent = error.message || 'Не получилось войти';
          }
        });
      } catch (error) {
        btn.disabled = false;
        if (status) status.textContent = error.message;
      }
    });

    holder.appendChild(btn);
    box.hidden = false;
    return true;
  }

  window.VitaTG = { mount };
})();
