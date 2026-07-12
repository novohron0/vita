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

// MARK: - Vita goal dots (виджет «как на vitadots.ru»)

enum VitaGoalMode: String, Codable {
    case month
    case goal
}

struct VitaGoalDots: Codable {
    var mode: VitaGoalMode
    var accentHex: String
    var goalStart: String
    var goalEnd: String
    /// ISO yyyy-MM-dd — дни, которые пользователь отметил тапом по виджету.
    var markedDays: [String]

    static let `default` = VitaGoalDots(
        mode: .month,
        accentHex: "#a855f7",
        goalStart: "",
        goalEnd: "",
        markedDays: []
    )
}

struct VitaDotsGrid {
    let total: Int
    let columns: Int
    let pastFilled: Int
    let todayIndex: Int?
    let markedIndices: Set<Int>
    let footer: String
    let title: String
}

enum VitaGoalDotsStore {
    private static let key = "vitaGoalDots"

    static var defaults: UserDefaults? {
        UserDefaults(suiteName: FocusAppGroup.id)
    }

    static func load() -> VitaGoalDots {
        guard let data = defaults?.data(forKey: key),
              let model = try? JSONDecoder().decode(VitaGoalDots.self, from: data) else {
            return .default
        }
        return model
    }

    static func save(_ model: VitaGoalDots) {
        guard let defaults = defaults,
              let data = try? JSONEncoder().encode(model) else { return }
        defaults.set(data, forKey: key)
    }

    static func ensureDefaults() {
        if defaults?.data(forKey: key) == nil {
            save(.default)
        }
    }

    static func isoDay(_ date: Date = .now) -> String {
        let f = DateFormatter()
        f.calendar = Calendar.current
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }

    static func toggleToday() {
        var model = load()
        let today = isoDay()
        if let i = model.markedDays.firstIndex(of: today) {
            model.markedDays.remove(at: i)
        } else {
            model.markedDays.append(today)
        }
        save(model)
    }

    static func grid(for date: Date = .now) -> VitaDotsGrid {
        let model = load()
        let cal = Calendar.current
        let marked = Set(model.markedDays.compactMap { dayIndex(for: $0, reference: date) })

        switch model.mode {
        case .month:
            let total = cal.range(of: .day, in: .month, for: date)?.count ?? 30
            let day = cal.component(.day, from: date)
            let past = max(0, day - 1)
            let todayIdx = day - 1
            let monthName = monthTitle(for: date)
            return VitaDotsGrid(
                total: total,
                columns: 6,
                pastFilled: past,
                todayIndex: todayIdx,
                markedIndices: marked,
                footer: "день \(min(day, total)) из \(total)",
                title: monthName
            )
        case .goal:
            let start = parseISO(model.goalStart) ?? cal.startOfDay(for: date)
            let end = parseISO(model.goalEnd) ?? cal.date(byAdding: .day, value: 29, to: start)!
            let total = max(1, cal.dateComponents([.day], from: start, to: end).day ?? 30)
            let done = min(max(cal.dateComponents([.day], from: start, to: cal.startOfDay(for: date)).day ?? 0, 0), total)
            let cols = total <= 42 ? 6 : total <= 120 ? 10 : 14
            return VitaDotsGrid(
                total: total,
                columns: cols,
                pastFilled: done,
                todayIndex: done < total ? done : nil,
                markedIndices: marked,
                footer: "прошло \(done) · осталось \(max(0, total - done))",
                title: "ДО ЦЕЛИ"
            )
        }
    }

    private static func parseISO(_ raw: String) -> Date? {
        guard !raw.isEmpty else { return nil }
        let f = DateFormatter()
        f.calendar = Calendar.current
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.date(from: raw)
    }

    private static func dayIndex(for iso: String, reference: Date) -> Int? {
        guard let d = parseISO(iso) else { return nil }
        let cal = Calendar.current
        let model = load()
        switch model.mode {
        case .month:
            guard cal.isDate(d, equalTo: reference, toGranularity: .month) else { return nil }
            return cal.component(.day, from: d) - 1
        case .goal:
            let model = load()
            let start = parseISO(model.goalStart) ?? cal.startOfDay(for: reference)
            let idx = cal.dateComponents([.day], from: cal.startOfDay(for: start), to: cal.startOfDay(for: d)).day
            guard let idx, idx >= 0 else { return nil }
            return idx
        }
    }

    private static func monthTitle(for date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ru_RU")
        f.dateFormat = "LLLL yyyy"
        return f.string(from: date).capitalized
    }
}
