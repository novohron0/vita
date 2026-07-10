# Снять предупреждение Safari «Deceptive Website»

Safari берёт список у **Google Safe Browsing**. Это не проблема сертификата — домен попал в чёрный список «обманных сайтов».

## 1. Пожаловаться на ложное срабатывание (главное)

1. Открой на Mac: https://safebrowsing.google.com/safebrowsing/report_error/?url=https://vitadots.ru
2. Тип: **This page is safe** («страница безопасна»)
3. URL: `https://vitadots.ru`
4. В комментарии (на английском):

```
Legitimate personal project. Wallpaper calendar app for iPhone (life-in-dots).
No login forms, no payment forms, no password or credit card collection.
Contact field is optional for beta waitlist only. Privacy policy: https://vitadots.ru/privacy
```

5. **Submit**

Обычно снимают за **1–3 дня**, иногда быстрее.

## 2. Google Search Console (ускоряет)

1. https://search.google.com/search-console
2. Добавь ресурс **vitadots.ru**
3. Подтверди владение через **DNS TXT** у регистратора
4. Раздел **Security issues** → если есть предупреждение → **Request a review**

## 3. Проверка статуса

- https://transparencyreport.google.com/safe-browsing/search?url=vitadots.ru
- `./scripts/check-site.sh`

## 4. Временный обход (только для себя)

На iPhone: **Настройки → Apps → Safari → предупреждения о мошенничестве** — выключить.

Или открыть с Mac/Chrome, пока Google не снимет блок.

## Почему могло случиться

Автоматика Google иногда помечает новые сайты, если:

- форма просит телеграм/инсту (похоже на фишинг);
- на странице есть блок «оплата», даже если кнопки выключены;
- домен новый и мало «репутации».

На сайте добавлены `/privacy` и `security.txt`, форма оплаты явно помечена «скоро».

## После снятия блока

1. `./scripts/deploy.sh`
2. Проверь Safari на iPhone в обычном режиме (не только Lockdown)
