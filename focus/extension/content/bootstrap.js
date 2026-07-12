/* Vita Focus — первый скрипт на каждой странице (Safari iOS). */
(function () {
  if (typeof globalThis.browser !== 'undefined' && typeof globalThis.chrome === 'undefined') {
    globalThis.chrome = globalThis.browser;
  }
})();
