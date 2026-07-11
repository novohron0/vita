import Foundation

enum FocusAppGroup {
    static let id = "group.ru.vitadots.focus"
}

struct FocusSnapshot: Codable {
    var blocksOn: Int
    var scheduleEnabled: Bool
    var scheduleActive: Bool
    var scheduleStart: Int
    var scheduleEnd: Int
    var activeSite: String
    var version: String
    var updatedAt: TimeInterval

    static let empty = FocusSnapshot(
        blocksOn: 0,
        scheduleEnabled: false,
        scheduleActive: true,
        scheduleStart: 9,
        scheduleEnd: 22,
        activeSite: "youtube",
        version: "0",
        updatedAt: 0
    )
}

enum FocusSnapshotStore {
    private static let key = "vitaFocusSnapshot"

    static var defaults: UserDefaults? {
        UserDefaults(suiteName: FocusAppGroup.id)
    }

    static func load() -> FocusSnapshot {
        guard let data = defaults?.data(forKey: key),
              let snap = try? JSONDecoder().decode(FocusSnapshot.self, from: data) else {
            return .empty
        }
        return snap
    }

    static func save(_ snap: FocusSnapshot) {
        guard let defaults = defaults, let data = try? JSONEncoder().encode(snap) else { return }
        defaults.set(data, forKey: key)
    }

    static func save(from dict: [String: Any]) {
        let snap = FocusSnapshot(
            blocksOn: dict["blocksOn"] as? Int ?? 0,
            scheduleEnabled: dict["scheduleEnabled"] as? Bool ?? false,
            scheduleActive: dict["scheduleActive"] as? Bool ?? true,
            scheduleStart: dict["scheduleStart"] as? Int ?? 9,
            scheduleEnd: dict["scheduleEnd"] as? Int ?? 22,
            activeSite: dict["activeSite"] as? String ?? "youtube",
            version: dict["version"] as? String ?? "0",
            updatedAt: dict["updatedAt"] as? TimeInterval ?? Date().timeIntervalSince1970 * 1000
        )
        save(snap)
    }
}

enum FocusDeepLinks {
    static let youtubeSubs = URL(string: "https://m.youtube.com/feed/subscriptions")!
    static let instagram = URL(string: "https://www.instagram.com/")!
    static let x = URL(string: "https://x.com/")!

    static func url(for host: String?) -> URL {
        switch host?.lowercased() {
        case "youtube", "yt": return youtubeSubs
        case "instagram", "ig": return instagram
        case "x", "twitter": return x
        default: return youtubeSubs
        }
    }
}
