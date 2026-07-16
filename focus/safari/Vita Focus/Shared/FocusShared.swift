import Foundation

enum FocusAppGroup {
    static let id = "group.ru.vitadots.focus"
}

enum VitaWidgetTheme: String, Codable, CaseIterable {
    case graphite
    case violet
    case ocean
    case ember
    case photo
}

enum VitaDotStyle: String, Codable, CaseIterable {
    case goal
    case circle
    case soft
    case square
    case diamond
    case heart
    case star
    case hex

    init(goalShape raw: String) {
        switch raw.lowercased() {
        case "rounded": self = .soft
        case "square": self = .square
        case "diamond": self = .diamond
        case "heart": self = .heart
        case "star": self = .star
        case "hex": self = .hex
        default: self = .circle
        }
    }
}

enum VitaWidgetThemeStore {
    private static let key = "vitaWidgetTheme"

    static var defaults: UserDefaults? {
        UserDefaults(suiteName: FocusAppGroup.id)
    }

    static func load() -> VitaWidgetTheme {
        guard let raw = defaults?.string(forKey: key),
              let theme = VitaWidgetTheme(rawValue: raw) else { return .graphite }
        return theme
    }

    @discardableResult
    static func save(rawValue: String) -> VitaWidgetTheme? {
        guard let theme = VitaWidgetTheme(rawValue: rawValue) else { return nil }
        defaults?.set(theme.rawValue, forKey: key)
        return theme
    }

    static var photoURL: URL? {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: FocusAppGroup.id)?
            .appendingPathComponent("vita-widget-background.jpg")
    }

    static func savePhotoData(_ data: Data) throws {
        guard let photoURL else { throw CocoaError(.fileNoSuchFile) }
        try data.write(to: photoURL, options: .atomic)
        defaults?.set(VitaWidgetTheme.photo.rawValue, forKey: key)
    }

    static var hasPhoto: Bool {
        guard let photoURL else { return false }
        return FileManager.default.fileExists(atPath: photoURL.path)
    }
}

enum VitaDotStyleStore {
    private static let key = "vitaDotStyle"

    static var defaults: UserDefaults? {
        UserDefaults(suiteName: FocusAppGroup.id)
    }

    static func load() -> VitaDotStyle {
        guard let raw = defaults?.string(forKey: key),
              let style = VitaDotStyle(rawValue: raw) else { return .goal }
        return style
    }

    @discardableResult
    static func save(rawValue: String) -> VitaDotStyle? {
        guard let style = VitaDotStyle(rawValue: rawValue) else { return nil }
        defaults?.set(style.rawValue, forKey: key)
        return style
    }
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
    static let appHome = URL(string: "vita://home")!
    static let goalsHome = URL(string: "https://vitadots.ru/goals")!
    // YouTube excludes URLs with `noapp` from its Universal Links, so iOS keeps
    // this launch in the browser instead of handing it to the YouTube app.
    static let youtubeHome = URL(string: "https://www.youtube.com/?noapp=1")!
    static let youtubeSubs = URL(string: "https://m.youtube.com/feed/subscriptions")!
    static let instagram = URL(string: "https://www.instagram.com/")!
    static let x = URL(string: "https://x.com/")!

    static func url(for host: String?) -> URL {
        switch host?.lowercased() {
        case "youtube", "yt": return youtubeHome
        case "instagram", "ig": return instagram
        case "x", "twitter": return x
        default: return youtubeHome
        }
    }

    static func isGoalDeepLink(_ incoming: URL) -> Bool {
        ["vita", "vitafocus"].contains(incoming.scheme?.lowercased() ?? "")
            && incoming.host?.lowercased() == "goal"
    }

    static func goalCode(from incoming: URL) -> String? {
        guard isGoalDeepLink(incoming),
              incoming.query == nil,
              incoming.fragment == nil else { return nil }
        let parts = incoming.path.split(separator: "/", omittingEmptySubsequences: true)
        guard parts.count == 1 else { return nil }
        return VitaHabitStore.code(from: String(parts[0]))
    }

    static func fallbackURL(for incoming: URL) -> URL {
        isGoalDeepLink(incoming) ? goalsHome : url(for: incoming.host)
    }
}

// MARK: - Vita habits (единая цель сайта, приложения, виджета и обоев)

struct VitaHabitSnapshot: Codable {
    var code: String
    var title: String
    var days: Int
    var start: String
    var reward: String
    var color: String
    var background: String
    var shape: String
    var done: [String]
    var peers: Int
    var updatedAt: TimeInterval

    static let placeholder = VitaHabitSnapshot(
        code: "demo42",
        title: "Не разрывать цепочку",
        days: 30,
        start: VitaHabitStore.isoDay(Calendar.current.date(byAdding: .day, value: -12, to: .now) ?? .now),
        reward: "",
        color: "#a855f7",
        background: "black",
        shape: "circle",
        done: (1...10).compactMap {
            Calendar.current.date(byAdding: .day, value: -$0, to: .now).map { VitaHabitStore.isoDay($0) }
        },
        peers: 1,
        updatedAt: Date().timeIntervalSince1970
    )

    var doneSet: Set<String> { Set(done) }

    func isDone(on date: Date = .now) -> Bool {
        doneSet.contains(VitaHabitStore.isoDay(date))
    }

    func currentStreak(on date: Date = .now) -> Int {
        let cal = Calendar.current
        let marks = doneSet
        var cursor = cal.startOfDay(for: date)
        if !marks.contains(VitaHabitStore.isoDay(cursor)) {
            cursor = cal.date(byAdding: .day, value: -1, to: cursor) ?? cursor
        }
        var streak = 0
        while marks.contains(VitaHabitStore.isoDay(cursor)) {
            streak += 1
            guard let previous = cal.date(byAdding: .day, value: -1, to: cursor) else { break }
            cursor = previous
        }
        return streak
    }

    func bestStreak() -> Int {
        let marks = doneSet
        guard let startDate = VitaHabitStore.parseISO(start) else { return 0 }
        let cal = Calendar.current
        var best = 0
        var current = 0
        for offset in 0..<max(1, min(days, 365)) {
            guard let date = cal.date(byAdding: .day, value: offset, to: startDate) else { continue }
            if marks.contains(VitaHabitStore.isoDay(date)) {
                current += 1
                best = max(best, current)
            } else {
                current = 0
            }
        }
        return best
    }

    func widgetGrid(for date: Date = .now, maxDots: Int = 42) -> VitaDotsGrid {
        let cal = Calendar.current
        let totalDays = max(1, min(days, 365))
        let visibleCount = max(1, min(maxDots, totalDays))
        let startDate = cal.startOfDay(for: VitaHabitStore.parseISO(start) ?? date)
        let rawToday = cal.dateComponents([.day], from: startDate, to: cal.startOfDay(for: date)).day ?? 0
        let focusIndex = min(max(rawToday, 0), totalDays - 1)
        let history = max(0, visibleCount - min(7, visibleCount))
        let windowStart = min(max(focusIndex - history, 0), totalDays - visibleCount)
        let windowEnd = windowStart + visibleCount
        let indices = Set(done.compactMap { raw -> Int? in
            guard let marked = VitaHabitStore.parseISO(raw) else { return nil }
            let fullIndex = cal.dateComponents([.day], from: startDate, to: cal.startOfDay(for: marked)).day
            guard let fullIndex, (windowStart..<windowEnd).contains(fullIndex) else { return nil }
            return fullIndex - windowStart
        })
        let todayIndex = (windowStart..<windowEnd).contains(rawToday) ? rawToday - windowStart : nil
        let columns = visibleCount <= 42 ? 6 : visibleCount <= 120 ? 10 : 14
        return VitaDotsGrid(
            total: visibleCount,
            columns: columns,
            pastFilled: 0,
            todayIndex: todayIndex,
            markedIndices: indices,
            footer: "\(doneSet.count)/\(totalDays) · \(currentStreak(on: date))🔥",
            title: title
        )
    }
}

enum VitaHabitError: LocalizedError {
    case invalidCode
    case invalidResponse
    case server(Int)

    var errorDescription: String? {
        switch self {
        case .invalidCode:
            return "Вставь ссылку на цель или её шестизначный код"
        case .invalidResponse:
            return "Сайт вернул неполные данные цели"
        case .server(404):
            return "Цель с таким кодом не найдена"
        case .server:
            return "vitadots.ru временно не отвечает"
        }
    }
}

enum VitaHabitStore {
    private static let activeCodeKey = "vitaActiveHabitCode"
    private static let snapshotKey = "vitaActiveHabitSnapshot"
    private static let codeAlphabet = CharacterSet(charactersIn: "abcdefghjkmnpqrstuvwxyz23456789")

    static var defaults: UserDefaults? {
        UserDefaults(suiteName: FocusAppGroup.id)
    }

    static var activeCode: String? {
        guard let raw = defaults?.string(forKey: activeCodeKey) else { return nil }
        return code(from: raw)
    }

    static func code(from raw: String) -> String? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if isValidCode(trimmed) { return trimmed }
        guard let url = URL(string: trimmed) else { return nil }
        let candidates = Array(url.pathComponents.reversed()) + [url.host ?? ""]
        for candidate in candidates where isValidCode(candidate) {
            return candidate
        }
        return nil
    }

    static func activate(_ raw: String) throws -> String {
        guard let code = code(from: raw) else { throw VitaHabitError.invalidCode }
        if activeCode != code {
            defaults?.removeObject(forKey: snapshotKey)
        }
        defaults?.set(code, forKey: activeCodeKey)
        return code
    }

    static func disconnect() {
        defaults?.removeObject(forKey: activeCodeKey)
        defaults?.removeObject(forKey: snapshotKey)
    }

    static func loadSnapshot() -> VitaHabitSnapshot? {
        guard let activeCode,
              let data = defaults?.data(forKey: snapshotKey),
              let snapshot = try? JSONDecoder().decode(VitaHabitSnapshot.self, from: data),
              snapshot.code == activeCode else { return nil }
        return snapshot
    }

    static func save(_ snapshot: VitaHabitSnapshot) {
        guard let code = code(from: snapshot.code), code == snapshot.code,
              activeCode == code,
              let data = try? JSONEncoder().encode(snapshot) else { return }
        defaults?.set(data, forKey: snapshotKey)
    }

    static func goalURL(for code: String) -> URL? {
        guard let code = self.code(from: code) else { return nil }
        return URL(string: "https://vitadots.ru/g/\(code)")
    }

    static func deepLinkURL(for code: String) -> URL? {
        guard let code = self.code(from: code) else { return nil }
        return URL(string: "vita://goal/\(code)")
    }

    static func isoDay(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar.current
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    static func parseISO(_ raw: String) -> Date? {
        let formatter = DateFormatter()
        formatter.calendar = Calendar.current
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false
        guard let date = formatter.date(from: raw), formatter.string(from: date) == raw else { return nil }
        return date
    }

    private static func isValidCode(_ value: String) -> Bool {
        value.count == 6 && value.unicodeScalars.allSatisfy(codeAlphabet.contains)
    }
}

enum VitaHabitClient {
    private struct GoalResponse: Decodable {
        let title: String
        let days: Int
        let start: String
        let reward: String
        let color: String
        let bg: String
        let shape: String
        let done: [String]
        let peers: Int
    }

    private struct ToggleResponse: Decodable {
        let done: Bool
    }

    static func fetch(code rawCode: String) async throws -> VitaHabitSnapshot {
        guard let code = VitaHabitStore.code(from: rawCode),
              let url = URL(string: "https://vitadots.ru/api/goal/\(code)") else {
            throw VitaHabitError.invalidCode
        }
        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = 15
        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response)
        guard let goal = try? JSONDecoder().decode(GoalResponse.self, from: data) else {
            throw VitaHabitError.invalidResponse
        }
        return VitaHabitSnapshot(
            code: code,
            title: goal.title,
            days: max(1, min(goal.days, 365)),
            start: goal.start,
            reward: goal.reward,
            color: goal.color,
            background: goal.bg,
            shape: goal.shape,
            done: Array(Set(goal.done)).sorted(),
            peers: goal.peers,
            updatedAt: Date().timeIntervalSince1970
        )
    }

    @discardableResult
    static func toggleToday(code rawCode: String, date: Date = .now) async throws -> Bool {
        guard let code = VitaHabitStore.code(from: rawCode),
              let url = URL(string: "https://vitadots.ru/api/goal/\(code)/toggle") else {
            throw VitaHabitError.invalidCode
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["day": VitaHabitStore.isoDay(date)])
        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response)
        guard let result = try? JSONDecoder().decode(ToggleResponse.self, from: data) else {
            throw VitaHabitError.invalidResponse
        }
        return result.done
    }

    private static func validate(_ response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse else { throw VitaHabitError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else { throw VitaHabitError.server(http.statusCode) }
    }
}

// MARK: - Vita goal dots (виджет «как на vitadots.ru»)

enum VitaGoalMode: String, Codable {
    case month
    case goal
}

enum VitaGoalSettingsError: LocalizedError {
    case invalidDates
    case endBeforeStart
    case rangeTooLong(maxDays: Int)

    var errorDescription: String? {
        switch self {
        case .invalidDates:
            return "Проверь даты начала и окончания"
        case .endBeforeStart:
            return "Последний день должен быть не раньше первого"
        case .rangeTooLong(let maxDays):
            return "Пока виджет поддерживает цели до \(maxDays) дней"
        }
    }
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
    static let maxGoalDays = 42

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
        var normalized = model
        normalized.markedDays = Array(Set(model.markedDays.filter { parseISO($0) != nil })).sorted()
        guard let defaults = defaults,
              let data = try? JSONEncoder().encode(normalized) else { return }
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

    @discardableResult
    static func configure(mode: VitaGoalMode, goalStart: String, goalEnd: String) throws -> VitaGoalDots {
        var model = load()
        if mode == .goal {
            let range = try validatedGoalRange(start: goalStart, end: goalEnd)
            model.goalStart = isoDay(range.start)
            model.goalEnd = isoDay(range.end)
        }
        model.mode = mode
        save(model)
        return load()
    }

    static func validatedGoalRange(start rawStart: String, end rawEnd: String) throws -> (start: Date, end: Date, total: Int) {
        guard let start = parseISO(rawStart), let end = parseISO(rawEnd) else {
            throw VitaGoalSettingsError.invalidDates
        }
        let days = (Calendar.current.dateComponents(
            [.day],
            from: Calendar.current.startOfDay(for: start),
            to: Calendar.current.startOfDay(for: end)
        ).day ?? -1) + 1
        guard days > 0 else { throw VitaGoalSettingsError.endBeforeStart }
        guard days <= maxGoalDays else {
            throw VitaGoalSettingsError.rangeTooLong(maxDays: maxGoalDays)
        }
        return (start, end, days)
    }

    static func editorDates(for model: VitaGoalDots, reference: Date = .now) -> (start: String, end: String) {
        if let start = parseISO(model.goalStart),
           let end = parseISO(model.goalEnd),
           end >= start {
            return (isoDay(start), isoDay(end))
        }
        let start = Calendar.current.startOfDay(for: reference)
        let end = Calendar.current.date(byAdding: .day, value: 29, to: start) ?? start
        return (isoDay(start), isoDay(end))
    }

    @discardableResult
    static func toggleToday() -> Bool {
        var model = load()
        let today = isoDay()
        if model.mode == .goal {
            let range = goalRange(for: model, reference: .now)
            let now = Calendar.current.startOfDay(for: .now)
            guard now >= range.start, now <= range.end else { return false }
        }
        if let i = model.markedDays.firstIndex(of: today) {
            model.markedDays.remove(at: i)
        } else {
            model.markedDays.append(today)
        }
        save(model)
        return true
    }

    static func grid(for date: Date = .now) -> VitaDotsGrid {
        let model = load()
        return grid(model: model, for: date)
    }

    static func grid(model: VitaGoalDots, for date: Date = .now) -> VitaDotsGrid {
        let cal = Calendar.current

        switch model.mode {
        case .month:
            let total = cal.range(of: .day, in: .month, for: date)?.count ?? 30
            let day = cal.component(.day, from: date)
            let past = max(0, day - 1)
            let todayIdx = day - 1
            let monthName = monthTitle(for: date)
            let marked = Set(model.markedDays.compactMap {
                dayIndex(for: $0, model: model, reference: date, total: total)
            })
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
            let range = goalRange(for: model, reference: date)
            let offset = cal.dateComponents(
                [.day],
                from: range.start,
                to: cal.startOfDay(for: date)
            ).day ?? 0
            let done = min(max(offset, 0), range.total)
            let todayIndex = (0..<range.total).contains(offset) ? offset : nil
            let marked = Set(model.markedDays.compactMap {
                dayIndex(for: $0, model: model, reference: date, total: range.total)
            })
            let footer: String
            if offset < 0 {
                footer = "старт \(shortDate(range.start)) · через \(-offset) дн."
            } else if offset >= range.total {
                footer = "цель завершена · \(shortDate(range.end))"
            } else {
                footer = "до \(shortDate(range.end)) · осталось \(range.total - offset) дн."
            }
            return VitaDotsGrid(
                total: range.total,
                columns: 6,
                pastFilled: done,
                todayIndex: todayIndex,
                markedIndices: marked,
                footer: footer,
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
        f.isLenient = false
        guard let date = f.date(from: raw), f.string(from: date) == raw else { return nil }
        return date
    }

    private static func dayIndex(for iso: String, model: VitaGoalDots, reference: Date, total: Int) -> Int? {
        guard let d = parseISO(iso) else { return nil }
        let cal = Calendar.current
        switch model.mode {
        case .month:
            guard cal.isDate(d, equalTo: reference, toGranularity: .month) else { return nil }
            let index = cal.component(.day, from: d) - 1
            return (0..<total).contains(index) ? index : nil
        case .goal:
            let range = goalRange(for: model, reference: reference)
            let index = cal.dateComponents(
                [.day],
                from: range.start,
                to: cal.startOfDay(for: d)
            ).day
            guard let index, (0..<total).contains(index) else { return nil }
            return index
        }
    }

    private static func goalRange(
        for model: VitaGoalDots,
        reference: Date
    ) -> (start: Date, end: Date, total: Int) {
        let cal = Calendar.current
        let start = cal.startOfDay(for: parseISO(model.goalStart) ?? reference)
        let requestedEnd = parseISO(model.goalEnd)
            ?? cal.date(byAdding: .day, value: 29, to: start)
            ?? start
        let rawDays = (cal.dateComponents([.day], from: start, to: requestedEnd).day ?? 29) + 1
        let total = min(max(rawDays, 1), maxGoalDays)
        let end = cal.date(byAdding: .day, value: total - 1, to: start) ?? start
        return (start, end, total)
    }

    private static func monthTitle(for date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ru_RU")
        f.dateFormat = "LLLL yyyy"
        return f.string(from: date).capitalized
    }

    private static func shortDate(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ru_RU")
        f.setLocalizedDateFormatFromTemplate("d MMMM")
        return f.string(from: date)
    }
}

// MARK: - Диагностика (что реально на устройстве)

enum FocusDiagnostics {
    struct Report {
        let appVersion: String
        let buildNumber: String
        let extensionVersion: String
        let extensionEmbedded: Bool
        let widgetEmbedded: Bool
        let appGroupOK: Bool
        let blocksOn: Int
        let markedDays: Int
        let extensionEnabled: Bool?

        var lines: [String] {
            var out: [String] = []
            out.append("Приложение: v\(appVersion) (\(buildNumber))")
            out.append("Расширение в сборке: \(extensionEmbedded ? "✅ v\(extensionVersion)" : "❌ нет .appex")")
            if let extensionEnabled {
                out.append("Safari расширение: \(extensionEnabled ? "✅ включено" : "❌ выключено")")
            } else {
                out.append("Safari расширение: ? (нужен iOS 26.2+ для авто-проверки)")
            }
            out.append("App Group: \(appGroupOK ? "✅ OK" : "❌ FAIL")")
            out.append("Виджет в сборке: \(widgetEmbedded ? "✅" : "❌")")
            out.append("Блоков (из расширения): \(blocksOn)")
            out.append("Отмечено дней (виджет): \(markedDays)")
            if extensionEnabled == false {
                out.append("→ Сначала шаг 1: включи Vita Focus в Safari")
            } else if extensionVersion == "?" || !extensionEmbedded {
                out.append("→ Xcode ⇧⌘K → ⌘R — расширение не попало в сборку")
            } else if !appGroupOK {
                out.append("→ App Group не настроен в Apple Developer")
            } else if blocksOn == 0 {
                out.append("→ Открой popup 🧩 на YouTube и включи блоки")
            }
            return out
        }
    }

    static func embeddedPlugInVersion(name: String) -> (embedded: Bool, version: String) {
        guard let plugins = Bundle.main.builtInPlugInsURL else { return (false, "?") }
        let appex = plugins.appendingPathComponent(name)
        guard let bundle = Bundle(url: appex),
              let url = bundle.url(forResource: "manifest", withExtension: "json")
                ?? bundle.url(forResource: "manifest", withExtension: "json", subdirectory: "Resources"),
              let data = try? Data(contentsOf: url),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let ver = json["version"] as? String else {
            // Widget has no manifest — use CFBundleShortVersionString
            if name.contains("Widget"), let bundle = Bundle(url: appex) {
                let v = bundle.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?"
                return (true, v)
            }
            return (FileManager.default.fileExists(atPath: appex.path), "?")
        }
        return (true, ver)
    }

    static func appGroupWorks() -> Bool {
        guard let defaults = UserDefaults(suiteName: FocusAppGroup.id) else { return false }
        let key = "vfocusDiagProbe"
        let token = UUID().uuidString
        defaults.set(token, forKey: key)
        let ok = defaults.string(forKey: key) == token
        defaults.removeObject(forKey: key)
        return ok
    }

    static func makeReport(extensionEnabled: Bool?) -> Report {
        let ext = embeddedPlugInVersion(name: "Vita Focus Extension.appex")
        let wgt = embeddedPlugInVersion(name: "Vita Focus Widget.appex")
        let snap = FocusSnapshotStore.load()
        let goal = VitaGoalDotsStore.load()
        let info = Bundle.main.infoDictionary ?? [:]
        return Report(
            appVersion: info["CFBundleShortVersionString"] as? String ?? "?",
            buildNumber: info["CFBundleVersion"] as? String ?? "?",
            extensionVersion: ext.version,
            extensionEmbedded: ext.embedded,
            widgetEmbedded: wgt.embedded,
            appGroupOK: appGroupWorks(),
            blocksOn: snap.blocksOn,
            markedDays: goal.markedDays.count,
            extensionEnabled: extensionEnabled
        )
    }
}
