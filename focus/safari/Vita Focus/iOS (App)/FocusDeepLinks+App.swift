import UIKit

extension Notification.Name {
    static let vitaActiveHabitChanged = Notification.Name("vitaActiveHabitChanged")
}

extension FocusDeepLinks {
    static func openURL(_ url: URL) {
        UIApplication.shared.open(url)
    }

    static func handle(_ incoming: URL) {
        if ["vita", "vitafocus"].contains(incoming.scheme?.lowercased() ?? ""),
           incoming.host?.lowercased() == "home" {
            return
        }
        if ["vita", "vitafocus"].contains(incoming.scheme?.lowercased() ?? ""),
           incoming.host?.lowercased() == "goal",
           let code = VitaHabitStore.code(from: incoming.absoluteString),
           (try? VitaHabitStore.activate(code)) != nil {
            NotificationCenter.default.post(name: .vitaActiveHabitChanged, object: code)
            return
        }
        openURL(url(for: incoming.host))
    }
}
