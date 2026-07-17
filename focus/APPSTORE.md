## TestFlight / App Store

1. Оформить Apple Developer Program ($99/год). `Personal Team` позволяет
   ставить development-сборку на своё устройство, но не даёт TestFlight.
2. В Xcode выбрать платную Team для app, Safari extension и Widget.
3. Создать приложение `ru.vitadots.focus` в App Store Connect.
4. Product → Archive → Distribute → App Store Connect.
5. App Store Connect → TestFlight → добавить тестеров.
6. На iPhone: TestFlight → установить Vita Focus.
7. Настройки → Safari → Расширения → Vita Focus.

`Shared/PrivacyInfo.xcprivacy` включён в три iOS bundle и декларирует
`UserDefaults` App Group с approved reason `1C8F.1`.

Основное приложение также выставляет `ITSAppUsesNonExemptEncryption = NO`:
Vita использует только системное HTTPS-шифрование и не содержит собственной
криптографии.

Скриншоты для Store: popup, YouTube до/после, лендинг vitadots.ru/focus.
