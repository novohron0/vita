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
        center.setNotificationCategories([
            UNNotificationCategory(
                identifier: VitaImpulseStore.categoryID,
                actions: [
                    UNNotificationAction(identifier: VitaImpulseStore.startActionID, title: "Начать 5 минут", options: [.foreground]),
                    UNNotificationAction(identifier: VitaImpulseStore.postponeActionID, title: "Через 10 минут")
                ],
                intentIdentifiers: []
            )
        ])
        return true
    }

    func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        return UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        if response.actionIdentifier == VitaImpulseStore.postponeActionID,
           var impulse = VitaImpulseStore.load() {
            impulse.fireDate = Date().addingTimeInterval(10 * 60)
            impulse.isEnabled = true
            VitaImpulseStore.update(impulse)
            VitaImpulseNotifications.schedule(impulse) { _ in completionHandler() }
            return
        }
        if response.actionIdentifier == VitaImpulseStore.startActionID {
            VitaImpulseStore.disable()
            center.removePendingNotificationRequests(withIdentifiers: [VitaImpulseStore.notificationID])
        }
        completionHandler()
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound])
    }

}

enum VitaImpulseNotifications {
    static func requestAccess(completion: @escaping (Bool) -> Void) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            completion(granted)
        }
    }

    static func schedule(_ impulse: VitaImpulse, completion: @escaping (Error?) -> Void) {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [VitaImpulseStore.notificationID])
        let content = UNMutableNotificationContent()
        content.title = impulse.title
        content.body = impulse.notificationBody
        content.sound = .default
        content.categoryIdentifier = VitaImpulseStore.categoryID
        center.add(UNNotificationRequest(
            identifier: VitaImpulseStore.notificationID,
            content: content,
            trigger: UNTimeIntervalNotificationTrigger(timeInterval: max(1, impulse.fireDate.timeIntervalSinceNow), repeats: false)
        ), withCompletionHandler: completion)
    }

    static func cancel() {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [VitaImpulseStore.notificationID])
    }
}
