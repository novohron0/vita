//
//  AppDelegate.swift
//  iOS (App)
//
//  Created by Камиль Имангулов on 10.07.2026.
//

import UIKit
import UserNotifications

@main
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        center.setNotificationCategories(VitaImpulseNotifications.categories)
        return true
    }

    func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
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
        guard let impulseID = (response.notification.request.content.userInfo[VitaImpulseNotifications.impulseIDKey] as? String)
                ?? VitaImpulseStore.load()?.id,
              let impulse = VitaImpulseStore.load(id: impulseID) else {
            completionHandler()
            return
        }

        let action = response.actionIdentifier
        if action == VitaImpulseStore.snoozeActionID || action == VitaImpulseStore.postponeActionID {
            let now = Date()
            let proposed = now.addingTimeInterval(10 * 60)
            let snoozeUntil = impulse.deadline.map { min(proposed, $0) } ?? proposed
            do {
                let updated = try VitaImpulseStore.snooze(id: impulseID, until: snoozeUntil, now: now)
                VitaImpulsePendingActionStore.set(type: .snooze, impulseID: impulseID, snoozeUntil: snoozeUntil)
                notifyImpulseAction()
                VitaImpulseNotifications.schedule(updated, completion: { _ in completionHandler() })
            } catch {
                VitaImpulsePendingActionStore.set(type: .accept, impulseID: impulseID)
                notifyImpulseAction()
                completionHandler()
            }
            return
        }

        if action == VitaImpulseStore.completeActionID {
            do {
                let updated = try VitaImpulseStore.complete(id: impulseID)
                VitaImpulseNotifications.cancelAll(for: impulseID)
                notifyImpulseAction()
                if updated.isEnabled && updated.status != .completed {
                    VitaImpulseNotifications.schedule(updated, completion: { _ in completionHandler() })
                } else {
                    completionHandler()
                }
            } catch {
                completionHandler()
            }
            return
        }

        if action == UNNotificationDismissActionIdentifier {
            let now = Date()
            let proposed = now.addingTimeInterval(10 * 60)
            let snoozeUntil = impulse.deadline.map { min(proposed, $0) } ?? proposed
            if snoozeUntil.timeIntervalSince(now) >= 5,
               let updated = try? VitaImpulseStore.snooze(id: impulseID, until: snoozeUntil, now: now) {
                notifyImpulseAction()
                VitaImpulseNotifications.schedule(updated, completion: { _ in completionHandler() })
            } else {
                completionHandler()
            }
            return
        }

        if action == VitaImpulseStore.acceptActionID
            || action == VitaImpulseStore.startActionID
            || action == UNNotificationDefaultActionIdentifier {
            _ = try? VitaImpulseStore.accept(id: impulseID)
            VitaImpulseNotifications.cancelReminder(for: impulseID)
            VitaImpulsePendingActionStore.set(type: .accept, impulseID: impulseID)
            notifyImpulseAction()
        }
        completionHandler()
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        if notification.request.content.categoryIdentifier == VitaImpulseNotifications.timerCategoryID,
           !VitaImpulseStore.reconcileExpiredTimers().isEmpty {
            notifyImpulseAction()
        }
        completionHandler([.banner, .sound, .badge])
    }

    private func notifyImpulseAction() {
        DispatchQueue.main.async {
            NotificationCenter.default.post(name: .vitaImpulseActionRequested, object: nil)
        }
    }
}

enum VitaImpulseNotifications {
    static let impulseIDKey = "vitaImpulseID"
    static let deadlineCategoryID = "VITA_IMPULSE_DEADLINE"
    static let timerCategoryID = "VITA_IMPULSE_TIMER"

    static var categories: Set<UNNotificationCategory> {
        let accept = UNNotificationAction(
            identifier: VitaImpulseStore.acceptActionID,
            title: "Принять",
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
        return [
            UNNotificationCategory(
                identifier: VitaImpulseStore.categoryID,
                actions: [accept, snooze, complete],
                intentIdentifiers: [],
                options: [.customDismissAction]
            ),
            UNNotificationCategory(
                identifier: deadlineCategoryID,
                actions: [complete, accept],
                intentIdentifiers: [],
                options: []
            ),
            UNNotificationCategory(
                identifier: timerCategoryID,
                actions: [complete, accept],
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

    static func schedule(_ impulse: VitaImpulse, completion: @escaping (Error?) -> Void) {
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
        if reminderPrecedesDeadline,
           impulse.fireDate.timeIntervalSince(now) >= 1,
           impulse.status == .scheduled || impulse.status == .snoozed {
            requests.append(reminderRequest(for: impulse, now: now))
        }
        if let deadline = impulse.deadline, deadline.timeIntervalSince(now) >= 1 {
            requests.append(deadlineRequest(for: impulse, deadline: deadline, now: now))
        }
        if let timerEnd = impulse.timerEndDate, timerEnd.timeIntervalSince(now) >= 1 {
            requests.append(timerRequest(for: impulse, timerEnd: timerEnd, now: now))
        }
        add(requests, at: 0, center: center, completion: completion)
    }

    static func scheduleTimer(_ impulse: VitaImpulse, completion: @escaping (Error?) -> Void) {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [VitaImpulseStore.timerNotificationID(for: impulse.id)])
        guard let timerEnd = impulse.timerEndDate, timerEnd.timeIntervalSinceNow >= 1 else {
            completion(nil)
            return
        }
        center.add(timerRequest(for: impulse, timerEnd: timerEnd, now: .now), withCompletionHandler: completion)
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
        content.title = priorityPrefix(for: impulse) + impulse.title
        if impulse.status == .snoozed {
            let why = impulse.reason.isEmpty ? "Ты решил вернуться к этому" : "Зачем: \(impulse.reason)"
            content.body = "Ты отложил · \(why) · Шаг: \(impulse.firstStep)"
        } else {
            content.body = impulse.notificationBody
        }
        content.categoryIdentifier = VitaImpulseStore.categoryID
        return request(
            identifier: VitaImpulseStore.notificationID(for: impulse.id),
            content: content,
            date: impulse.fireDate,
            now: now
        )
    }

    private static func deadlineRequest(for impulse: VitaImpulse, deadline: Date, now: Date) -> UNNotificationRequest {
        let content = baseContent(for: impulse)
        content.title = "Дедлайн · \(impulse.title)"
        let why = impulse.reason.isEmpty ? "" : "Зачем: \(impulse.reason) · "
        content.body = "\(why)Сейчас только минимум: \(impulse.firstStep)"
        content.categoryIdentifier = deadlineCategoryID
        return request(
            identifier: VitaImpulseStore.deadlineNotificationID(for: impulse.id),
            content: content,
            date: deadline,
            now: now
        )
    }

    private static func timerRequest(for impulse: VitaImpulse, timerEnd: Date, now: Date) -> UNNotificationRequest {
        let content = baseContent(for: impulse)
        content.title = "Таймер завершён · \(impulse.title)"
        content.body = "Отметить выполненным или продолжить ещё один короткий фокус?"
        content.categoryIdentifier = timerCategoryID
        return request(
            identifier: VitaImpulseStore.timerNotificationID(for: impulse.id),
            content: content,
            date: timerEnd,
            now: now
        )
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

    private static func priorityPrefix(for impulse: VitaImpulse) -> String {
        switch impulse.priority {
        case .high: return "‼️ "
        case .medium: return "❗️ "
        default: return ""
        }
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
