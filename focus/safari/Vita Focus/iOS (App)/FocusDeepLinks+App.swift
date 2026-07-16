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
        if isGoalDeepLink(incoming) {
            if let code = goalCode(from: incoming),
               (try? VitaHabitStore.activate(code)) != nil {
                NotificationCenter.default.post(name: .vitaActiveHabitChanged, object: code)
                return
            }
            openURL(fallbackURL(for: incoming))
            return
        }
        openURL(fallbackURL(for: incoming))
    }
}
