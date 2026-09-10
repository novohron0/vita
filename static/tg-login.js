/* Кнопка «Войти через Telegram». Виджет отдаёт подписанные данные,
   проверяет их сервер — подделать вход, не зная токена бота, нельзя. */
(function () {
  function mount(box, botName, onDone) {
    if (!box || !botName) return false;
    window.onVitaTelegramAuth = async user => {
      const status = box.querySelector('.tg-status');
      if (status) status.textContent = 'Входим…';
      try {
        const data = await VitaID.loginTelegram(user);
        if (onDone) onDone(data);
        else location.reload();
      } catch (error) {
        if (status) status.textContent = error.message || 'Не получилось войти — попробуй ещё раз';
      }
    };
    const holder = box.querySelector('.tg-widget') || box;
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', botName);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-radius', '14');
    script.setAttribute('data-onauth', 'onVitaTelegramAuth(user)');
    holder.appendChild(script);
    box.hidden = false;
    return true;
  }
  window.VitaTG = { mount };
})();
