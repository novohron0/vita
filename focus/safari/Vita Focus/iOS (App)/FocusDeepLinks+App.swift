import UIKit

extension FocusDeepLinks {
    static func openURL(_ url: URL) {
        UIApplication.shared.open(url)
    }

    static func handle(_ incoming: URL) {
        openURL(url(for: incoming.host))
    }
}
