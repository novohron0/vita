/* Сторож для внутренних страниц.

   Гугль успел проиндексировать цели, ленту и прочую изнанку до того, как на
   них поставили noindex, и человек приходит из поиска прямо внутрь продукта —
   мимо главной, ничего про Vita не понимая. Такие страницы работают только
   для своих: не вошёл — отправляем к двери и запоминаем, куда он шёл.

   Подключать после vita-id.js. Страница прячется сразу (класс gate на <html>),
   чтобы содержимое не мигнуло перед переходом. Сервер молчит — открываем:
   держать человека перед запертой дверью из-за нашей же ошибки нечестно. */
(function () {
  document.documentElement.classList.add('gate');
  const open = () => document.documentElement.classList.remove('gate');

  if (!window.VitaID) { open(); return; }

  VitaID.access()
    .then(access => {
      if (access.email || access.telegram) { open(); return; }
      location.replace('/login?next=' + encodeURIComponent(location.pathname + location.search));
    })
    .catch(open);
})();
