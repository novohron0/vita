//
//  AppDelegate.swift
//  iOS (App)
//
//  Created by Камиль Имангулов on 10.07.2026.
//

import UIKit
import UserNotifications
#if canImport(AlarmKit)
import ActivityKit
import AlarmKit
import AppIntents
import SwiftUI
#endif

@main
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        center.setNotificationCategories(VitaImpulseNotifications.categories)
        reconcileImpulseTimers()
        return true
    }

    func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        reconcileImpulseTimers()
        if #available(iOS 16.0, *) {
            UNUserNotificationCenter.current().setBadgeCount(0)
        } else {
            application.applicationIconBadgeNumber = 0
        }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        reconcileImpulseTimers()
        let notificationImpulseID = response.notification.request.content.userInfo[VitaImpulseNotifications.impulseIDKey] as? String
        let legacyImpulses = notificationImpulseID == nil ? VitaImpulseStore.all() : []
        let legacyImpulseID = legacyImpulses.count == 1 ? legacyImpulses[0].id : nil
        guard let impulseID = notificationImpulseID ?? legacyImpulseID,
              let impulse = VitaImpulseStore.load(id: impulseID) else {
            completionHandler()
            return
        }

        let action = response.actionIdentifier
        if action == VitaImpulseStore.snoozeActionID || action == VitaImpulseStore.postponeActionID {
            VitaImpulsePendingActionStore.set(
                type: impulse.type == .task ? .snooze : .open,
                impulseID: impulseID
            )
            notifyImpulseAction()
            completionHandler()
            return
        }

        if action == VitaImpulseStore.completeActionID {
            do {
                let updated = try VitaImpulseStore.complete(id: impulseID)
                VitaImpulseDelivery.cancelAll(for: impulseID)
                notifyImpulseAction()
                if updated.isEnabled && updated.status != .completed {
                    VitaImpulseDelivery.schedule(updated, completion: { _ in completionHandler() })
                } else {
                    completionHandler()
                }
            } catch {
                completionHandler()
            }
            return
        }

        if action == VitaImpulseStore.deleteActionID {
            VitaImpulseDelivery.cancelAll(for: impulseID)
            _ = VitaImpulseStore.delete(id: impulseID)
            VitaImpulsePendingActionStore.clear()
            notifyImpulseAction()
            completionHandler()
            return
        }

        if action == VitaImpulseStore.editActionID {
            VitaImpulsePendingActionStore.set(type: .edit, impulseID: impulseID)
            notifyImpulseAction()
            completionHandler()
            return
        }

        if action == VitaImpulseStore.startActionID || action == VitaImpulseStore.acceptActionID {
            let interruptedIDs = VitaImpulseStore.all().compactMap { item in
                item.id != impulseID && (item.status == .running || item.timerEndDate != nil)
                    ? item.id
                    : nil
            }
            guard let started = try? VitaImpulseStore.startTimer(id: impulseID) else {
                VitaImpulsePendingActionStore.set(type: .open, impulseID: impulseID)
                notifyImpulseAction()
                completionHandler()
                return
            }
            interruptedIDs.forEach { VitaImpulseNotifications.cancelTimer(for: $0) }
            VitaImpulseDelivery.cancelReminder(for: impulseID)
            VitaImpulsePendingActionStore.set(type: .start, impulseID: impulseID)
            notifyImpulseAction()
            VitaImpulseNotifications.scheduleTimer(started) { [weak self] error in
                if error != nil {
                    _ = try? VitaImpulseStore.cancelTimer(id: impulseID)
                    VitaImpulsePendingActionStore.set(type: .open, impulseID: impulseID)
                    self?.notifyImpulseAction()
                }
                completionHandler()
            }
            return
        }

        if action == UNNotificationDefaultActionIdentifier {
            VitaImpulsePendingActionStore.set(type: .open, impulseID: impulseID)
            notifyImpulseAction()
        }
        completionHandler()
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        reconcileImpulseTimers()
        notifyImpulseAction()
        completionHandler([.banner, .sound, .badge])
    }

    private func notifyImpulseAction() {
        DispatchQueue.main.async {
            NotificationCenter.default.post(name: .vitaImpulseActionRequested, object: nil)
        }
    }

    private func reconcileImpulseTimers() {
        let expiredIDs = VitaImpulseStore.reconcileExpiredTimers()
        for id in expiredIDs {
            VitaImpulseDelivery.cancelAll(for: id)
            if let impulse = VitaImpulseStore.load(id: id), impulse.isActive {
                VitaImpulseDelivery.schedule(impulse, completion: { _ in })
            }
        }
        for impulse in VitaImpulseStore.all()
            where impulse.status == .running && (impulse.timerEndDate?.timeIntervalSinceNow ?? -1) > 0 {
            VitaImpulseNotifications.scheduleTimer(impulse, completion: { _ in })
        }
    }
}

enum VitaImpulseNotifications {
    static let impulseIDKey = "vitaImpulseID"
    static let deadlineCategoryID = "VITA_IMPULSE_DEADLINE"
    static let taskDeadlineCategoryID = "VITA_IMPULSE_TASK_DEADLINE"

    static var categories: Set<UNNotificationCategory> {
        let start = UNNotificationAction(
            identifier: VitaImpulseStore.startActionID,
            title: "Начать",
            options: [.foreground]
        )
        let snooze = UNNotificationAction(
            identifier: VitaImpulseStore.snoozeActionID,
            title: "Отложить",
            options: [.foreground]
        )
        let complete = UNNotificationAction(
            identifier: VitaImpulseStore.completeActionID,
            title: "Готово",
            options: []
        )
        let edit = UNNotificationAction(
            identifier: VitaImpulseStore.editActionID,
            title: "Изменить",
            options: [.foreground]
        )
        let delete = UNNotificationAction(
            identifier: VitaImpulseStore.deleteActionID,
            title: "Удалить",
            options: [.destructive]
        )
        return [
            UNNotificationCategory(
                identifier: VitaImpulseStore.categoryID,
                actions: [start, snooze, complete],
                intentIdentifiers: [],
                options: [.customDismissAction]
            ),
            UNNotificationCategory(
                identifier: VitaImpulseStore.reminderCategoryID,
                actions: [complete, edit, delete],
                intentIdentifiers: [],
                options: []
            ),
            UNNotificationCategory(
                identifier: VitaImpulseStore.taskCategoryID,
                actions: [start, snooze, delete],
                intentIdentifiers: [],
                options: []
            ),
            UNNotificationCategory(
                identifier: deadlineCategoryID,
                actions: [complete, edit, delete],
                intentIdentifiers: [],
                options: []
            ),
            UNNotificationCategory(
                identifier: taskDeadlineCategoryID,
                actions: [start, delete],
                intentIdentifiers: [],
                options: []
            ),
            UNNotificationCategory(
                identifier: VitaImpulseStore.timerCategoryID,
                actions: [delete],
                intentIdentifiers: [],
                options: []
            ),
        ]
    }

    static func requestAccess(completion: @escaping (Bool) -> Void) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            completion(granted)
        }
    }

    static func schedule(
        _ impulse: VitaImpulse,
        includeReminder: Bool = true,
        completion: @escaping (Error?) -> Void
    ) {
        let center = UNUserNotificationCenter.current()
        let identifiers = [
            VitaImpulseStore.notificationID,
            VitaImpulseStore.notificationID(for: impulse.id),
            VitaImpulseStore.deadlineNotificationID(for: impulse.id),
            VitaImpulseStore.timerNotificationID(for: impulse.id),
        ]
        center.removePendingNotificationRequests(withIdentifiers: identifiers)

        guard impulse.isEnabled, impulse.status != .completed else {
            completion(nil)
            return
        }

        let now = Date()
        var requests: [UNNotificationRequest] = []
        let reminderPrecedesDeadline = impulse.deadline.map { impulse.fireDate.timeIntervalSince($0) < -0.5 } ?? true
        if includeReminder,
           reminderPrecedesDeadline,
           impulse.fireDate.timeIntervalSince(now) >= 1,
           impulse.status == .scheduled || impulse.status == .snoozed {
            requests.append(reminderRequest(for: impulse, now: now))
        }
        if let deadline = impulse.deadline,
           let alertDate = impulse.deadlineAlertDate,
           alertDate.timeIntervalSince(now) >= 1 {
            requests.append(deadlineRequest(
                for: impulse,
                deadline: deadline,
                alertDate: alertDate,
                now: now
            ))
        }
        add(requests, at: 0, center: center, completion: completion)
    }

    static func cancelReminder(for impulseID: String) {
        UNUserNotificationCenter.current().removePendingNotificationRequests(
            withIdentifiers: [
                VitaImpulseStore.notificationID,
                VitaImpulseStore.notificationID(for: impulseID),
            ]
        )
    }

    static func cancelTimer(for impulseID: String) {
        UNUserNotificationCenter.current().removePendingNotificationRequests(
            withIdentifiers: [VitaImpulseStore.timerNotificationID(for: impulseID)]
        )
    }

    static func scheduleTimer(_ impulse: VitaImpulse, completion: @escaping (Error?) -> Void) {
        let center = UNUserNotificationCenter.current()
        let identifier = VitaImpulseStore.timerNotificationID(for: impulse.id)
        center.removePendingNotificationRequests(withIdentifiers: [identifier])
        guard impulse.type == .task,
              impulse.status == .running,
              let timerEndDate = impulse.timerEndDate,
              timerEndDate.timeIntervalSinceNow >= 1 else {
            completion(nil)
            return
        }
        let content = baseContent(for: impulse)
        content.title = "Время задачи вышло"
        content.body = impulse.title
        content.categoryIdentifier = VitaImpulseStore.timerCategoryID
        center.add(request(
            identifier: identifier,
            content: content,
            date: timerEndDate,
            now: .now
        ), withCompletionHandler: completion)
    }

    static func cancelAll(for impulseID: String) {
        let identifiers = [
            VitaImpulseStore.notificationID,
            VitaImpulseStore.notificationID(for: impulseID),
            VitaImpulseStore.deadlineNotificationID(for: impulseID),
            VitaImpulseStore.timerNotificationID(for: impulseID),
        ]
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: identifiers)
        center.removeDeliveredNotifications(withIdentifiers: identifiers)
    }

    static func cancel() {
        if let impulse = VitaImpulseStore.load() {
            cancelAll(for: impulse.id)
        }
    }

    private static func reminderRequest(for impulse: VitaImpulse, now: Date) -> UNNotificationRequest {
        let content = baseContent(for: impulse)
        content.title = reminderTitle(for: impulse)
        content.body = "Для начала \(impulse.firstStep)"
        content.categoryIdentifier = impulse.type == .task
            ? VitaImpulseStore.taskCategoryID
            : VitaImpulseStore.reminderCategoryID
        return request(
            identifier: VitaImpulseStore.notificationID(for: impulse.id),
            content: content,
            date: impulse.fireDate,
            now: now
        )
    }

    private static func deadlineRequest(
        for impulse: VitaImpulse,
        deadline: Date,
        alertDate: Date,
        now: Date
    ) -> UNNotificationRequest {
        let content = baseContent(for: impulse)
        content.title = "Дедлайн!"
        content.body = "\(impulse.title) — до \(deadlineText(deadline))"
        content.categoryIdentifier = impulse.type == .task
            ? taskDeadlineCategoryID
            : deadlineCategoryID
        return request(
            identifier: VitaImpulseStore.deadlineNotificationID(for: impulse.id),
            content: content,
            date: alertDate,
            now: now
        )
    }

    private static func deadlineText(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = .current
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }

    private static func baseContent(for impulse: VitaImpulse) -> UNMutableNotificationContent {
        let content = UNMutableNotificationContent()
        content.sound = .default
        content.badge = 1
        content.threadIdentifier = "vita.impulses"
        content.userInfo = [impulseIDKey: impulse.id]
        content.interruptionLevel = .active
        return content
    }

    private static func request(identifier: String, content: UNNotificationContent, date: Date, now: Date) -> UNNotificationRequest {
        UNNotificationRequest(
            identifier: identifier,
            content: content,
            trigger: UNTimeIntervalNotificationTrigger(timeInterval: max(1, date.timeIntervalSince(now)), repeats: false)
        )
    }

    static func reminderTitle(for impulse: VitaImpulse) -> String {
        let count: Int
        switch impulse.priority {
        case .high: count = 3
        case .medium: count = 2
        default: count = 1
        }
        return "Напоминание" + String(repeating: "!", count: count)
    }

    private static func add(
        _ requests: [UNNotificationRequest],
        at index: Int,
        center: UNUserNotificationCenter,
        completion: @escaping (Error?) -> Void
    ) {
        guard index < requests.count else {
            completion(nil)
            return
        }
        center.add(requests[index]) { error in
            guard error == nil else {
                completion(error)
                return
            }
            add(requests, at: index + 1, center: center, completion: completion)
        }
    }
}

enum VitaImpulseAlarmError: LocalizedError {
    case unavailable
    case denied
    case invalidID

    var errorDescription: String? {
        switch self {
        case .unavailable: return "Будильники доступны на iOS 26 и новее"
        case .denied: return "Разреши будильники Vita Focus в настройках"
        case .invalidID: return "Не удалось создать будильник"
        }
    }
}

#if canImport(AlarmKit)
@available(iOS 26.0, *)
private struct VitaImpulseAlarmMetadata: AlarmMetadata {
    let impulseID: String
    let firstStep: String
}
#endif

enum VitaImpulseAlarms {
    static var isSupported: Bool {
        if #available(iOS 26.0, *) { return true }
        return false
    }

    static func schedule(_ impulse: VitaImpulse) async throws {
#if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            guard let id = UUID(uuidString: impulse.id) else {
                throw VitaImpulseAlarmError.invalidID
            }
            let manager = AlarmManager.shared
            var authorization = manager.authorizationState
            if authorization == .notDetermined {
                authorization = try await manager.requestAuthorization()
            }
            guard authorization == .authorized else {
                throw VitaImpulseAlarmError.denied
            }

            try? manager.cancel(id: id)
            let title = VitaImpulseNotifications.reminderTitle(for: impulse)
            let displayTitle: LocalizedStringResource = "\(title) — Для начала \(impulse.firstStep)"
            let actionButton = AlarmButton(
                text: impulse.type == .task ? "Начать" : "Готово",
                textColor: .white,
                systemImageName: impulse.type == .task ? "play.fill" : "checkmark"
            )
            let alert: AlarmPresentation.Alert
            if #available(iOS 26.1, *) {
                alert = .init(
                    title: displayTitle,
                    secondaryButton: actionButton,
                    secondaryButtonBehavior: .custom
                )
            } else {
                alert = .init(
                    title: displayTitle,
                    stopButton: AlarmButton(
                        text: "Выключить",
                        textColor: .white,
                        systemImageName: "stop.circle"
                    ),
                    secondaryButton: actionButton,
                    secondaryButtonBehavior: .custom
                )
            }
            let attributes = AlarmAttributes(
                presentation: AlarmPresentation(alert: alert),
                metadata: VitaImpulseAlarmMetadata(
                    impulseID: impulse.id,
                    firstStep: impulse.firstStep
                ),
                tintColor: .purple
            )
            let configuration = AlarmManager.AlarmConfiguration<VitaImpulseAlarmMetadata>.alarm(
                schedule: .fixed(impulse.fireDate),
                attributes: attributes,
                secondaryIntent: VitaImpulseAlarmActionIntent(impulseID: impulse.id),
                sound: .default
            )
            _ = try await manager.schedule(id: id, configuration: configuration)
            return
        }
#endif
        throw VitaImpulseAlarmError.unavailable
    }

    static func cancel(for impulseID: String) {
#if canImport(AlarmKit)
        if #available(iOS 26.0, *), let id = UUID(uuidString: impulseID) {
            try? AlarmManager.shared.cancel(id: id)
        }
#endif
    }
}

enum VitaImpulseDeliveryError: LocalizedError {
    case alarmFallback(String)

    var errorDescription: String? {
        switch self {
        case .alarmFallback(let message):
            return "Будильник недоступен — оставили обычное уведомление. \(message)"
        }
    }
}

enum VitaImpulseDelivery {
    static func schedule(
        _ impulse: VitaImpulse,
        includeLocalNotifications: Bool = true,
        completion: @escaping (Error?) -> Void
    ) {
        VitaImpulseNotifications.cancelAll(for: impulse.id)
        VitaImpulseAlarms.cancel(for: impulse.id)
        let canScheduleReminder = (impulse.status == .scheduled || impulse.status == .snoozed)
            && impulse.fireDate.timeIntervalSinceNow >= 1
        guard impulse.usesAlarm, VitaImpulseAlarms.isSupported, canScheduleReminder else {
            if includeLocalNotifications {
                VitaImpulseNotifications.schedule(impulse, completion: completion)
            } else {
                completion(nil)
            }
            return
        }

        Task {
            do {
                try await VitaImpulseAlarms.schedule(impulse)
                guard let current = VitaImpulseStore.load(id: impulse.id) else {
                    cancelAll(for: impulse.id)
                    completion(nil)
                    return
                }
                let canStillScheduleAlarm = current.isEnabled
                    && (current.status == .scheduled || current.status == .snoozed)
                    && current.usesAlarm
                    && current.fireDate.timeIntervalSinceNow >= 1
                guard current == impulse, canStillScheduleAlarm else {
                    finishStaleSchedule(
                        current,
                        includeLocalNotifications: includeLocalNotifications,
                        completion: completion
                    )
                    return
                }
                if includeLocalNotifications {
                    VitaImpulseNotifications.schedule(
                        current,
                        includeReminder: false,
                        completion: completion
                    )
                } else {
                    completion(nil)
                }
            } catch {
                guard let current = VitaImpulseStore.load(id: impulse.id) else {
                    cancelAll(for: impulse.id)
                    completion(nil)
                    return
                }
                let canStillScheduleAlarm = current.isEnabled
                    && (current.status == .scheduled || current.status == .snoozed)
                    && current.usesAlarm
                    && current.fireDate.timeIntervalSinceNow >= 1
                guard current == impulse, canStillScheduleAlarm else {
                    finishStaleSchedule(
                        current,
                        includeLocalNotifications: includeLocalNotifications,
                        completion: completion
                    )
                    return
                }
                guard includeLocalNotifications else {
                    completion(error)
                    return
                }
                var fallback = current
                fallback.usesAlarm = false
                _ = try? VitaImpulseStore.upsert(fallback)
                VitaImpulseNotifications.schedule(fallback) { notificationError in
                    completion(
                        notificationError
                            ?? VitaImpulseDeliveryError.alarmFallback(error.localizedDescription)
                    )
                }
            }
        }
    }

    private static func finishStaleSchedule(
        _ current: VitaImpulse,
        includeLocalNotifications: Bool,
        completion: @escaping (Error?) -> Void
    ) {
        if current.status == .running, current.timerEndDate != nil {
            VitaImpulseAlarms.cancel(for: current.id)
            if includeLocalNotifications {
                VitaImpulseNotifications.scheduleTimer(current, completion: completion)
            } else {
                completion(nil)
            }
            return
        }
        guard current.isActive else {
            cancelAll(for: current.id)
            completion(nil)
            return
        }
        schedule(
            current,
            includeLocalNotifications: includeLocalNotifications,
            completion: completion
        )
    }

    static func cancelAll(for impulseID: String) {
        VitaImpulseNotifications.cancelAll(for: impulseID)
        VitaImpulseAlarms.cancel(for: impulseID)
    }

    static func cancelReminder(for impulseID: String) {
        VitaImpulseNotifications.cancelReminder(for: impulseID)
        VitaImpulseAlarms.cancel(for: impulseID)
    }
}
