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
    static var description = IntentDescription("Запускает ближайшую задачу или открывает ближайшее напоминание.")
    static var openAppWhenRun = true

    @available(iOS 26.0, *)
    static var supportedModes: IntentModes { .foreground(.immediate) }

    @MainActor
    func perform() async throws -> some IntentResult {
        let active = VitaImpulseStore.all()
            .filter { $0.isEnabled && $0.status != .completed }
            .sorted { $0.fireDate < $1.fireDate }
        if let task = active.first(where: { $0.type == .task }) {
            let interruptedIDs = active.compactMap { impulse in
                impulse.id != task.id && (impulse.status == .running || impulse.timerEndDate != nil)
                    ? impulse.id
                    : nil
            }
            if let started = try? VitaImpulseStore.startTimer(id: task.id) {
                interruptedIDs.forEach { VitaImpulseNotifications.cancelTimer(for: $0) }
                VitaImpulseDelivery.cancelReminder(for: task.id)
                let timerError = await withCheckedContinuation { (continuation: CheckedContinuation<Error?, Never>) in
                    VitaImpulseNotifications.scheduleTimer(started) { continuation.resume(returning: $0) }
                }
                if timerError == nil {
                    VitaImpulsePendingActionStore.set(type: .start, impulseID: task.id)
                } else {
                    _ = try? VitaImpulseStore.cancelTimer(id: task.id)
                    VitaImpulsePendingActionStore.set(type: .open, impulseID: task.id)
                }
            }
        } else if let reminder = active.first {
            VitaImpulsePendingActionStore.set(type: .open, impulseID: reminder.id)
        }
        NotificationCenter.default.post(name: .vitaImpulseActionRequested, object: nil)
        return .result()
    }
}

@available(iOS 26.0, *)
struct VitaImpulseAlarmActionIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Действие Vita Импульса"
    static var description = IntentDescription("Завершает напоминание или запускает таймер задачи из системного будильника.")
    static var openAppWhenRun = false

    @Parameter(title: "Импульс")
    var impulseID: String

    init() {}

    init(impulseID: String) {
        self.impulseID = impulseID
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        guard let impulse = VitaImpulseStore.load(id: impulseID), impulse.isActive else {
            return .result()
        }

        if impulse.type == .task {
            let interruptedIDs = VitaImpulseStore.all().compactMap { item in
                item.id != impulseID && (item.status == .running || item.timerEndDate != nil)
                    ? item.id
                    : nil
            }
            let started = try VitaImpulseStore.startTimer(id: impulseID)
            interruptedIDs.forEach { VitaImpulseNotifications.cancelTimer(for: $0) }
            VitaImpulseDelivery.cancelReminder(for: impulseID)
            let timerError = await withCheckedContinuation { (continuation: CheckedContinuation<Error?, Never>) in
                VitaImpulseNotifications.scheduleTimer(started) { continuation.resume(returning: $0) }
            }
            if let timerError {
                _ = try? VitaImpulseStore.cancelTimer(id: impulseID)
                VitaImpulsePendingActionStore.set(type: .open, impulseID: impulseID)
                NotificationCenter.default.post(name: .vitaImpulseActionRequested, object: nil)
                throw timerError
            }
            VitaImpulsePendingActionStore.set(type: .start, impulseID: impulseID)
        } else {
            let completed = try VitaImpulseStore.complete(id: impulseID)
            VitaImpulseDelivery.cancelAll(for: impulseID)
            if completed.isActive {
                let deliveryError = await withCheckedContinuation { (continuation: CheckedContinuation<Error?, Never>) in
                    VitaImpulseDelivery.schedule(completed) { continuation.resume(returning: $0) }
                }
                if let deliveryError {
                    VitaImpulsePendingActionStore.set(type: .open, impulseID: impulseID)
                    NotificationCenter.default.post(name: .vitaImpulseActionRequested, object: nil)
                    throw deliveryError
                }
            }
        }

        await MainActor.run {
            NotificationCenter.default.post(name: .vitaImpulseActionRequested, object: nil)
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
