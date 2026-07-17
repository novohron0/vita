import UIKit
#if canImport(AppIntents)
import AppIntents
#endif

extension Notification.Name {
    static let vitaActiveHabitChanged = Notification.Name("vitaActiveHabitChanged")
    static let vitaImpulseActionRequested = Notification.Name("vitaImpulseActionRequested")
}

extension FocusDeepLinks {
    private static let pendingGoalHighlightKey = "vitaPendingGoalHighlight"

    static func consumeGoalHighlight() -> Bool {
        let pending = UserDefaults.standard.bool(forKey: pendingGoalHighlightKey)
        UserDefaults.standard.removeObject(forKey: pendingGoalHighlightKey)
        return pending
    }

    static func openURL(_ url: URL) {
        UIApplication.shared.open(url)
    }

    static func handle(_ incoming: URL) {
        if ["vita", "vitafocus"].contains(incoming.scheme?.lowercased() ?? ""),
           incoming.host?.lowercased() == "home" {
            UserDefaults.standard.set(true, forKey: pendingGoalHighlightKey)
            NotificationCenter.default.post(name: .vitaActiveHabitChanged, object: nil)
            return
        }
        if isGoalDeepLink(incoming) {
            if let code = goalCode(from: incoming),
               (try? VitaHabitStore.activate(code)) != nil {
                UserDefaults.standard.set(true, forKey: pendingGoalHighlightKey)
                NotificationCenter.default.post(name: .vitaActiveHabitChanged, object: code)
                return
            }
            openURL(fallbackURL(for: incoming))
            return
        }
        openURL(fallbackURL(for: incoming))
    }
}

#if canImport(AppIntents)
@available(iOS 16.0, *)
struct OpenYouTubeFocusIntent: AppIntent {
    static var title: LocalizedStringResource = "Открыть YouTube Focus"
    static var description = IntentDescription("Открывает главную YouTube в браузере по умолчанию. Для фильтров выберите Safari.")
    static var openAppWhenRun = true

    @available(iOS 26.0, *)
    static var supportedModes: IntentModes { .foreground(.immediate) }

    @MainActor
    func perform() async throws -> some IntentResult {
        await UIApplication.shared.open(FocusDeepLinks.youtubeHome)
        return .result()
    }
}

@available(iOS 16.0, *)
struct StartVitaImpulseIntent: AppIntent {
    static var title: LocalizedStringResource = "Начать Vita Импульс"
    static var description = IntentDescription("Открывает ближайший импульс с его причиной, минимальным шагом и дедлайном.")
    static var openAppWhenRun = true

    @available(iOS 26.0, *)
    static var supportedModes: IntentModes { .foreground(.immediate) }

    @MainActor
    func perform() async throws -> some IntentResult {
        let next = VitaImpulseStore.all()
            .filter { $0.isEnabled && $0.status != .completed }
            .sorted { $0.fireDate < $1.fireDate }
            .first
        if let next {
            _ = try? VitaImpulseStore.accept(id: next.id)
            VitaImpulsePendingActionStore.set(type: .accept, impulseID: next.id)
        }
        return .result()
    }
}

@available(iOS 16.0, *)
struct VitaFocusAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: StartVitaImpulseIntent(),
            phrases: [
                "Начать импульс в \(.applicationName)",
                "Открыть напоминание в \(.applicationName)",
            ],
            shortTitle: "Vita Импульс",
            systemImageName: "bolt.fill"
        )
        AppShortcut(
            intent: OpenYouTubeFocusIntent(),
            phrases: [
                "Открыть YouTube через \(.applicationName)",
                "Запустить YouTube Focus в \(.applicationName)",
            ],
            shortTitle: "YouTube Focus",
            systemImageName: "play.rectangle.fill"
        )
    }
}
#endif
