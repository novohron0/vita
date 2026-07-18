import Foundation

enum FocusAppGroup {
    static let id = "group.ru.vitadots.focus"
}

enum VitaImpulsePriority: String, Codable, CaseIterable {
    case none
    case low
    case medium
    case high
}

enum VitaImpulseRepeat: String, Codable, CaseIterable {
    case none
    case daily
    case weekdays
    case weekly
    case monthly
}

enum VitaImpulseFocusMode: String, Codable, CaseIterable {
    case none
    case deepWork
    case reading
    case study
    case workout
}

enum VitaImpulseStatus: String, Codable, CaseIterable {
    case scheduled
    case accepted
    case snoozed
    case running
    case completed
}

struct VitaImpulse: Codable, Equatable, Identifiable {
    var id: String
    var title: String
    var reason: String
    var firstStep: String
    var notes: String
    var folderID: String?
    var fireDate: Date
    var recurrenceAnchorDate: Date
    var deadline: Date?
    var deadlineAlertDate: Date?
    var usesAlarm: Bool
    var durationMinutes: Int
    var priority: VitaImpulsePriority
    var repeatRule: VitaImpulseRepeat
    var focusMode: VitaImpulseFocusMode
    var status: VitaImpulseStatus
    var createdAt: Date
    var completedAt: Date?
    var acceptedAt: Date?
    var snoozeCount: Int
    var timerEndDate: Date?
    var isEnabled: Bool

    init(
        id: String = UUID().uuidString.lowercased(),
        title: String,
        reason: String,
        firstStep: String,
        notes: String = "",
        folderID: String? = nil,
        fireDate: Date,
        recurrenceAnchorDate: Date? = nil,
        deadline: Date? = nil,
        deadlineAlertDate: Date? = nil,
        usesAlarm: Bool = false,
        durationMinutes: Int = 15,
        priority: VitaImpulsePriority = .none,
        repeatRule: VitaImpulseRepeat = .none,
        focusMode: VitaImpulseFocusMode = .none,
        status: VitaImpulseStatus = .scheduled,
        createdAt: Date = .now,
        completedAt: Date? = nil,
        acceptedAt: Date? = nil,
        snoozeCount: Int = 0,
        timerEndDate: Date? = nil,
        isEnabled: Bool = true
    ) {
        self.id = id
        self.title = title
        self.reason = reason
        self.firstStep = firstStep
        self.notes = notes
        self.folderID = folderID
        self.fireDate = fireDate
        self.recurrenceAnchorDate = recurrenceAnchorDate ?? fireDate
        self.deadline = deadline
        self.deadlineAlertDate = deadlineAlertDate
        self.usesAlarm = usesAlarm
        self.durationMinutes = durationMinutes
        self.priority = priority
        self.repeatRule = repeatRule
        self.focusMode = focusMode
        self.status = status
        self.createdAt = createdAt
        self.completedAt = completedAt
        self.acceptedAt = acceptedAt
        self.snoozeCount = snoozeCount
        self.timerEndDate = timerEndDate
        self.isEnabled = isEnabled
    }

    private enum CodingKeys: String, CodingKey {
        case id, title, reason, firstStep, notes, folderID, fireDate, recurrenceAnchorDate
        case deadline, deadlineAlertDate, usesAlarm, durationMinutes
        case priority, repeatRule, focusMode, status, createdAt, completedAt, acceptedAt
        case snoozeCount, timerEndDate, isEnabled
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        title = try values.decode(String.self, forKey: .title)
        reason = try values.decodeIfPresent(String.self, forKey: .reason) ?? ""
        firstStep = try values.decode(String.self, forKey: .firstStep)
        notes = try values.decodeIfPresent(String.self, forKey: .notes) ?? ""
        folderID = try values.decodeIfPresent(String.self, forKey: .folderID)
        fireDate = try values.decode(Date.self, forKey: .fireDate)
        recurrenceAnchorDate = try values.decodeIfPresent(Date.self, forKey: .recurrenceAnchorDate) ?? fireDate
        id = try values.decodeIfPresent(String.self, forKey: .id) ?? UUID().uuidString.lowercased()
        deadline = try values.decodeIfPresent(Date.self, forKey: .deadline)
        let hasModernAlarmFields = values.contains(.usesAlarm)
        deadlineAlertDate = try values.decodeIfPresent(Date.self, forKey: .deadlineAlertDate)
        if !hasModernAlarmFields && !values.contains(.deadlineAlertDate) {
            deadlineAlertDate = deadline
        }
        usesAlarm = try values.decodeIfPresent(Bool.self, forKey: .usesAlarm) ?? false
        durationMinutes = try values.decodeIfPresent(Int.self, forKey: .durationMinutes) ?? 15
        priority = try values.decodeIfPresent(VitaImpulsePriority.self, forKey: .priority) ?? .none
        repeatRule = try values.decodeIfPresent(VitaImpulseRepeat.self, forKey: .repeatRule) ?? .none
        focusMode = try values.decodeIfPresent(VitaImpulseFocusMode.self, forKey: .focusMode) ?? .none
        status = try values.decodeIfPresent(VitaImpulseStatus.self, forKey: .status) ?? .scheduled
        createdAt = try values.decodeIfPresent(Date.self, forKey: .createdAt) ?? fireDate
        completedAt = try values.decodeIfPresent(Date.self, forKey: .completedAt)
        acceptedAt = try values.decodeIfPresent(Date.self, forKey: .acceptedAt)
        snoozeCount = try values.decodeIfPresent(Int.self, forKey: .snoozeCount) ?? 0
        timerEndDate = try values.decodeIfPresent(Date.self, forKey: .timerEndDate)
        isEnabled = try values.decodeIfPresent(Bool.self, forKey: .isEnabled) ?? true
    }

    var notificationBody: String {
        let step = "Первый шаг: \(firstStep)"
        return reason.isEmpty ? step : "\(reason) · \(step)"
    }

    var isActive: Bool {
        isEnabled && status != .completed
    }
}

enum VitaImpulseError: LocalizedError {
    case missingTitle
    case missingFirstStep
    case invalidDate
    case invalidDeadline
    case invalidDeadlineAlert
    case invalidFolder
    case invalidSnooze
    case invalidDuration
    case tooManyActive
    case notFound

    var errorDescription: String? {
        switch self {
        case .missingTitle: return "Напиши, что хочешь начать"
        case .missingFirstStep: return "Добавь самый маленький первый шаг"
        case .invalidDate: return "Выбери время в будущем"
        case .invalidDeadline: return "Дедлайн должен быть позже напоминания"
        case .invalidDeadlineAlert: return "Напоминание о дедлайне должно быть после старта и не позже дедлайна"
        case .invalidFolder: return "Папка не найдена"
        case .invalidSnooze: return "Выбери новое время до дедлайна"
        case .invalidDuration: return "Таймер может длиться от 1 до 240 минут"
        case .tooManyActive: return "Можно держать не больше \(VitaImpulseStore.maxActiveCount) активных импульсов"
        case .notFound: return "Импульс не найден"
        }
    }
}

enum VitaImpulseStore {
    static let maxActiveCount = 32
    static let durationRange = 1...240

    // Kept for already delivered notifications and callers from the first Impulse version.
    static let notificationID = "vita.impulse.active"
    static let categoryID = "VITA_IMPULSE"
    static let startActionID = "VITA_IMPULSE_START"
    static let postponeActionID = "VITA_IMPULSE_POSTPONE"
    static let acceptActionID = startActionID
    static let snoozeActionID = postponeActionID
    static let completeActionID = "VITA_IMPULSE_COMPLETE"

    private static let key = "vitaImpulses"
    private static let legacyKey = "vitaImpulse"

    static var defaults: UserDefaults? { UserDefaults(suiteName: FocusAppGroup.id) }

    static func notificationID(for impulseID: String) -> String {
        "vita.impulse.reminder.\(impulseID)"
    }

    static func deadlineNotificationID(for impulseID: String) -> String {
        "vita.impulse.deadline.\(impulseID)"
    }

    static func timerNotificationID(for impulseID: String) -> String {
        "vita.impulse.timer.\(impulseID)"
    }

    static func all() -> [VitaImpulse] {
        if let data = defaults?.data(forKey: key),
           let impulses = try? JSONDecoder().decode([VitaImpulse].self, from: data) {
            return sorted(impulses)
        }

        guard let data = defaults?.data(forKey: legacyKey),
              let impulse = try? JSONDecoder().decode(VitaImpulse.self, from: data) else { return [] }
        persist([impulse])
        defaults?.removeObject(forKey: legacyKey)
        return [impulse]
    }

    // Compatibility helper for the original single-reminder UI.
    static func load() -> VitaImpulse? {
        let impulses = all()
        return impulses.first(where: \.isActive) ?? impulses.first
    }

    static func load(id: String) -> VitaImpulse? {
        all().first { $0.id == id }
    }

    @discardableResult
    static func upsert(_ impulse: VitaImpulse, now: Date = .now) throws -> VitaImpulse {
        var impulse = impulse
        trim(&impulse)
        try validate(impulse)

        var impulses = all()
        let index = impulses.firstIndex { $0.id == impulse.id }
        let wasActive = index.map { impulses[$0].isActive } ?? false
        let activeCount = impulses.filter(\.isActive).count
        if impulse.isActive && !wasActive && activeCount >= maxActiveCount {
            throw VitaImpulseError.tooManyActive
        }
        if let index {
            impulses[index] = impulse
        } else {
            impulses.append(impulse)
        }
        persist(impulses)
        return impulse
    }

    @discardableResult
    static func save(
        title: String,
        reason: String,
        firstStep: String,
        fireDate: Date,
        now: Date = .now
    ) throws -> VitaImpulse {
        try save(
            title: title,
            reason: reason,
            firstStep: firstStep,
            notes: "",
            fireDate: fireDate,
            now: now
        )
    }

    @discardableResult
    static func save(
        id: String? = nil,
        title: String,
        reason: String,
        firstStep: String,
        notes: String,
        fireDate: Date,
        deadline: Date? = nil,
        durationMinutes: Int = 15,
        priority: VitaImpulsePriority = .none,
        repeatRule: VitaImpulseRepeat = .none,
        focusMode: VitaImpulseFocusMode = .none,
        now: Date = .now
    ) throws -> VitaImpulse {
        let existing = id.flatMap { load(id: $0) }
        let legacyDeadlineAlert = existing?.deadline == deadline
            ? existing?.deadlineAlertDate
            : deadline
        return try save(
            id: id,
            title: title,
            reason: reason,
            firstStep: firstStep,
            notes: notes,
            fireDate: fireDate,
            deadline: deadline,
            folderID: existing?.folderID,
            deadlineAlertDate: legacyDeadlineAlert,
            usesAlarm: existing?.usesAlarm ?? false,
            durationMinutes: durationMinutes,
            priority: priority,
            repeatRule: repeatRule,
            focusMode: focusMode,
            now: now
        )
    }

    @discardableResult
    static func save(
        id: String? = nil,
        title: String,
        reason: String,
        firstStep: String,
        notes: String,
        fireDate: Date,
        deadline: Date? = nil,
        folderID: String?,
        deadlineAlertDate: Date?,
        usesAlarm: Bool,
        durationMinutes: Int = 15,
        priority: VitaImpulsePriority = .none,
        repeatRule: VitaImpulseRepeat = .none,
        focusMode: VitaImpulseFocusMode = .none,
        now: Date = .now
    ) throws -> VitaImpulse {
        let existing: VitaImpulse?
        if let id {
            existing = load(id: id)
        } else {
            existing = nil
        }
        if existing == nil || existing?.fireDate != fireDate {
            guard fireDate.timeIntervalSince(now) >= 5 else { throw VitaImpulseError.invalidDate }
        }
        let scheduleChanged = existing?.fireDate != fireDate
        let status: VitaImpulseStatus = scheduleChanged ? .scheduled : (existing?.status ?? .scheduled)
        let impulse = VitaImpulse(
            id: id ?? UUID().uuidString.lowercased(),
            title: title,
            reason: reason,
            firstStep: firstStep,
            notes: notes,
            folderID: folderID,
            fireDate: fireDate,
            recurrenceAnchorDate: scheduleChanged ? fireDate : existing?.recurrenceAnchorDate,
            deadline: deadline,
            deadlineAlertDate: deadlineAlertDate,
            usesAlarm: usesAlarm,
            durationMinutes: durationMinutes,
            priority: priority,
            repeatRule: repeatRule,
            focusMode: focusMode,
            status: status,
            createdAt: existing?.createdAt ?? now,
            completedAt: scheduleChanged ? nil : existing?.completedAt,
            acceptedAt: scheduleChanged ? nil : existing?.acceptedAt,
            snoozeCount: existing?.snoozeCount ?? 0,
            timerEndDate: scheduleChanged ? nil : existing?.timerEndDate,
            isEnabled: true
        )
        try validate(impulse)
        let deadlineAlertChanged = existing?.deadlineAlertDate != deadlineAlertDate
            || existing?.deadline != deadline
        try validateDeadlineAlert(impulse, now: deadlineAlertChanged ? now : nil)
        return try upsert(impulse, now: now)
    }

    // Compatibility helper for the original single-reminder UI.
    static func update(_ impulse: VitaImpulse) {
        _ = try? upsert(impulse)
    }

    @discardableResult
    static func delete(id: String) -> Bool {
        var impulses = all()
        let oldCount = impulses.count
        impulses.removeAll { $0.id == id }
        guard impulses.count != oldCount else { return false }
        persist(impulses)
        return true
    }

    // Compatibility helper for the original single-reminder UI.
    static func disable() {
        guard let impulse = load() else { return }
        _ = try? disable(id: impulse.id)
    }

    @discardableResult
    static func disable(id: String) throws -> VitaImpulse {
        try mutate(id: id) { impulse in
            impulse.isEnabled = false
            impulse.timerEndDate = nil
        }
    }

    @discardableResult
    static func accept(id: String, now: Date = .now) throws -> VitaImpulse {
        try mutate(id: id) { impulse in
            impulse.status = .accepted
            impulse.acceptedAt = now
            if let timerEndDate = impulse.timerEndDate, timerEndDate <= now {
                impulse.timerEndDate = nil
            }
            impulse.isEnabled = true
        }
    }

    @discardableResult
    static func reconcileExpiredTimers(now: Date = .now) -> [String] {
        var impulses = all()
        var expiredIDs: [String] = []
        for index in impulses.indices {
            guard impulses[index].status == .running,
                  let timerEndDate = impulses[index].timerEndDate,
                  timerEndDate <= now else { continue }
            expiredIDs.append(impulses[index].id)
            impulses[index].timerEndDate = nil
            impulses[index].status = .accepted
        }
        if !expiredIDs.isEmpty {
            persist(impulses)
        }
        return expiredIDs
    }

    @discardableResult
    static func snooze(id: String, until: Date, now: Date = .now) throws -> VitaImpulse {
        guard until > now else { throw VitaImpulseError.invalidSnooze }
        return try mutate(id: id) { impulse in
            if let deadline = impulse.deadline, until >= deadline {
                throw VitaImpulseError.invalidSnooze
            }
            let replacesPendingChoice = impulse.status == .snoozed && impulse.fireDate > now
            impulse.fireDate = until
            if let deadlineAlertDate = impulse.deadlineAlertDate,
               deadlineAlertDate <= until {
                impulse.deadlineAlertDate = nil
            }
            impulse.status = .snoozed
            if !replacesPendingChoice {
                impulse.snoozeCount += 1
            }
            impulse.timerEndDate = nil
            impulse.isEnabled = true
        }
    }

    @discardableResult
    static func startTimer(
        id: String,
        durationMinutes: Int? = nil,
        focusMode: VitaImpulseFocusMode? = nil,
        now: Date = .now
    ) throws -> VitaImpulse {
        var impulses = all()
        guard let selectedIndex = impulses.firstIndex(where: { $0.id == id }) else {
            throw VitaImpulseError.notFound
        }
        let selectedDuration = durationMinutes ?? impulses[selectedIndex].durationMinutes
        guard durationRange.contains(selectedDuration) else {
            throw VitaImpulseError.invalidDuration
        }

        for index in impulses.indices where index != selectedIndex {
            if impulses[index].timerEndDate != nil || impulses[index].status == .running {
                impulses[index].timerEndDate = nil
                impulses[index].status = impulses[index].acceptedAt == nil ? .scheduled : .accepted
            }
        }
        impulses[selectedIndex].durationMinutes = selectedDuration
        if let focusMode {
            impulses[selectedIndex].focusMode = focusMode
        }
        impulses[selectedIndex].status = .running
        impulses[selectedIndex].acceptedAt = impulses[selectedIndex].acceptedAt ?? now
        impulses[selectedIndex].timerEndDate = now.addingTimeInterval(TimeInterval(selectedDuration * 60))
        impulses[selectedIndex].isEnabled = true
        persist(impulses)
        return impulses[selectedIndex]
    }

    @discardableResult
    static func cancelTimer(id: String) throws -> VitaImpulse {
        try mutate(id: id) { impulse in
            impulse.timerEndDate = nil
            impulse.status = impulse.acceptedAt == nil ? .scheduled : .accepted
        }
    }

    @discardableResult
    static func complete(
        id: String,
        now: Date = .now,
        calendar: Calendar = .current
    ) throws -> VitaImpulse {
        try mutate(id: id) { impulse in
            impulse.completedAt = now
            impulse.timerEndDate = nil
            guard impulse.repeatRule != .none else {
                impulse.status = .completed
                impulse.isEnabled = false
                return
            }

            let oldAnchorDate = impulse.recurrenceAnchorDate
            let nextFireDate = try nextFireDate(
                after: oldAnchorDate,
                repeatRule: impulse.repeatRule,
                now: now,
                calendar: calendar
            )
            let recurrenceOffset = nextFireDate.timeIntervalSince(oldAnchorDate)
            if let deadline = impulse.deadline {
                impulse.deadline = deadline.addingTimeInterval(recurrenceOffset)
            }
            if let deadlineAlertDate = impulse.deadlineAlertDate {
                impulse.deadlineAlertDate = deadlineAlertDate.addingTimeInterval(recurrenceOffset)
            }
            impulse.fireDate = nextFireDate
            impulse.recurrenceAnchorDate = nextFireDate
            impulse.status = .scheduled
            impulse.acceptedAt = nil
            impulse.snoozeCount = 0
            impulse.isEnabled = true
        }
    }

    private static func mutate(
        id: String,
        change: (inout VitaImpulse) throws -> Void
    ) throws -> VitaImpulse {
        var impulses = all()
        guard let index = impulses.firstIndex(where: { $0.id == id }) else {
            throw VitaImpulseError.notFound
        }
        try change(&impulses[index])
        persist(impulses)
        return impulses[index]
    }

    private static func trim(_ impulse: inout VitaImpulse) {
        impulse.id = impulse.id.trimmingCharacters(in: .whitespacesAndNewlines)
        impulse.title = impulse.title.trimmingCharacters(in: .whitespacesAndNewlines)
        impulse.reason = impulse.reason.trimmingCharacters(in: .whitespacesAndNewlines)
        impulse.firstStep = impulse.firstStep.trimmingCharacters(in: .whitespacesAndNewlines)
        impulse.notes = impulse.notes.trimmingCharacters(in: .whitespacesAndNewlines)
        if let folderID = impulse.folderID?.trimmingCharacters(in: .whitespacesAndNewlines), !folderID.isEmpty {
            impulse.folderID = folderID
        } else {
            impulse.folderID = nil
        }
    }

    private static func validate(_ impulse: VitaImpulse) throws {
        guard !impulse.title.isEmpty else { throw VitaImpulseError.missingTitle }
        guard !impulse.firstStep.isEmpty else { throw VitaImpulseError.missingFirstStep }
        guard durationRange.contains(impulse.durationMinutes) else { throw VitaImpulseError.invalidDuration }
        if let deadline = impulse.deadline, deadline <= impulse.fireDate {
            throw VitaImpulseError.invalidDeadline
        }
        if let folderID = impulse.folderID,
           !VitaImpulseFolderStore.list().contains(where: { $0.id == folderID }) {
            throw VitaImpulseError.invalidFolder
        }
        if impulse.deadlineAlertDate != nil {
            try validateDeadlineAlert(impulse, now: nil)
        }
    }

    private static func validateDeadlineAlert(_ impulse: VitaImpulse, now: Date?) throws {
        guard let alertDate = impulse.deadlineAlertDate else { return }
        guard let deadline = impulse.deadline,
              alertDate > impulse.fireDate,
              alertDate <= deadline else {
            throw VitaImpulseError.invalidDeadlineAlert
        }
        if let now, alertDate.timeIntervalSince(now) < 5 {
            throw VitaImpulseError.invalidDeadlineAlert
        }
    }

    private static func nextFireDate(
        after fireDate: Date,
        repeatRule: VitaImpulseRepeat,
        now: Date,
        calendar: Calendar
    ) throws -> Date {
        var candidate = fireDate
        repeat {
            switch repeatRule {
            case .none:
                return candidate
            case .daily, .weekdays:
                guard let next = calendar.date(byAdding: .day, value: 1, to: candidate) else {
                    throw VitaImpulseError.invalidDate
                }
                candidate = next
                if repeatRule == .weekdays {
                    while calendar.isDateInWeekend(candidate) {
                        guard let weekday = calendar.date(byAdding: .day, value: 1, to: candidate) else {
                            throw VitaImpulseError.invalidDate
                        }
                        candidate = weekday
                    }
                }
            case .weekly:
                guard let next = calendar.date(byAdding: .day, value: 7, to: candidate) else {
                    throw VitaImpulseError.invalidDate
                }
                candidate = next
            case .monthly:
                guard let next = calendar.date(byAdding: .month, value: 1, to: candidate) else {
                    throw VitaImpulseError.invalidDate
                }
                candidate = next
            }
        } while candidate <= now
        return candidate
    }

    private static func sorted(_ impulses: [VitaImpulse]) -> [VitaImpulse] {
        impulses.sorted {
            if $0.fireDate != $1.fireDate { return $0.fireDate < $1.fireDate }
            return $0.createdAt < $1.createdAt
        }
    }

    private static func persist(_ impulses: [VitaImpulse]) {
        guard let data = try? JSONEncoder().encode(sorted(impulses)) else { return }
        defaults?.set(data, forKey: key)
    }

    fileprivate static func unlinkFolder(id: String) {
        var impulses = all()
        var changed = false
        for index in impulses.indices where impulses[index].folderID == id {
            impulses[index].folderID = nil
            changed = true
        }
        if changed {
            persist(impulses)
        }
    }
}

struct VitaImpulseFolder: Codable, Equatable, Identifiable {
    var id: String
    var name: String
    var createdAt: Date

    init(
        id: String = UUID().uuidString.lowercased(),
        name: String,
        createdAt: Date = .now
    ) {
        self.id = id
        self.name = name
        self.createdAt = createdAt
    }
}

enum VitaImpulseFolderError: LocalizedError {
    case missingName
    case duplicateName
    case notFound

    var errorDescription: String? {
        switch self {
        case .missingName: return "Добавь название списка"
        case .duplicateName: return "Такой список уже есть"
        case .notFound: return "Список не найден"
        }
    }
}

enum VitaImpulseFolderStore {
    private static let key = "vitaImpulseFolders"

    static var defaults: UserDefaults? { UserDefaults(suiteName: FocusAppGroup.id) }

    static func list() -> [VitaImpulseFolder] {
        guard let data = defaults?.data(forKey: key),
              let folders = try? JSONDecoder().decode([VitaImpulseFolder].self, from: data) else {
            return []
        }
        return sorted(folders)
    }

    @discardableResult
    static func create(name: String, now: Date = .now) throws -> VitaImpulseFolder {
        let name = trimmed(name)
        guard !name.isEmpty else { throw VitaImpulseFolderError.missingName }
        var folders = list()
        guard !contains(name: name, in: folders) else { throw VitaImpulseFolderError.duplicateName }
        let folder = VitaImpulseFolder(name: name, createdAt: now)
        folders.append(folder)
        persist(folders)
        return folder
    }

    @discardableResult
    static func rename(id: String, name: String) throws -> VitaImpulseFolder {
        let name = trimmed(name)
        guard !name.isEmpty else { throw VitaImpulseFolderError.missingName }
        var folders = list()
        guard let index = folders.firstIndex(where: { $0.id == id }) else {
            throw VitaImpulseFolderError.notFound
        }
        guard !contains(name: name, in: folders, excluding: id) else {
            throw VitaImpulseFolderError.duplicateName
        }
        folders[index].name = name
        persist(folders)
        return folders[index]
    }

    @discardableResult
    static func delete(id: String) -> Bool {
        var folders = list()
        let oldCount = folders.count
        folders.removeAll { $0.id == id }
        guard folders.count != oldCount else { return false }
        persist(folders)
        VitaImpulseStore.unlinkFolder(id: id)
        return true
    }

    private static func contains(
        name: String,
        in folders: [VitaImpulseFolder],
        excluding excludedID: String? = nil
    ) -> Bool {
        let normalizedName = normalized(name)
        return folders.contains { $0.id != excludedID && normalized($0.name) == normalizedName }
    }

    private static func trimmed(_ name: String) -> String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func normalized(_ name: String) -> String {
        trimmed(name).folding(
            options: [.caseInsensitive, .diacriticInsensitive],
            locale: Locale(identifier: "ru_RU")
        )
    }

    private static func sorted(_ folders: [VitaImpulseFolder]) -> [VitaImpulseFolder] {
        folders.sorted {
            if $0.createdAt != $1.createdAt { return $0.createdAt < $1.createdAt }
            return $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
        }
    }

    private static func persist(_ folders: [VitaImpulseFolder]) {
        guard let data = try? JSONEncoder().encode(sorted(folders)) else { return }
        defaults?.set(data, forKey: key)
    }
}

enum VitaImpulsePendingActionKind: String, Codable, Equatable {
    case accept
    case snooze
}

struct VitaImpulsePendingAction: Codable, Equatable {
    var type: VitaImpulsePendingActionKind
    var impulseID: String
    var requestedAt: Date
    var snoozeUntil: Date?
}

enum VitaImpulsePendingActionStore {
    private static let key = "vitaImpulsePendingAction"

    static var defaults: UserDefaults? { UserDefaults(suiteName: FocusAppGroup.id) }

    static func set(
        type: VitaImpulsePendingActionKind,
        impulseID: String,
        snoozeUntil: Date? = nil,
        requestedAt: Date = .now
    ) {
        let action = VitaImpulsePendingAction(
            type: type,
            impulseID: impulseID,
            requestedAt: requestedAt,
            snoozeUntil: snoozeUntil
        )
        guard let data = try? JSONEncoder().encode(action) else { return }
        defaults?.set(data, forKey: key)
    }

    static func load() -> VitaImpulsePendingAction? {
        guard let data = defaults?.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(VitaImpulsePendingAction.self, from: data)
    }

    static func consume() -> VitaImpulsePendingAction? {
        let action = load()
        clear()
        return action
    }

    static func clear() {
        defaults?.removeObject(forKey: key)
    }
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

enum VitaDotColorStore {
    static let automatic = "auto"
    static let defaultCustomHex = "#A855F7"

    private static let selectionKey = "vitaDotColor"
    private static let customKey = "vitaCustomDotColor"

    static var defaults: UserDefaults? {
        UserDefaults(suiteName: FocusAppGroup.id)
    }

    static func load() -> String {
        guard let raw = defaults?.string(forKey: selectionKey),
              let normalized = normalizedSelection(raw) else { return automatic }
        return normalized
    }

    static var customHex: String {
        guard let raw = defaults?.string(forKey: customKey),
              let normalized = normalizedSelection(raw),
              normalized != automatic else { return defaultCustomHex }
        return normalized
    }

    static var overrideHex: String? {
        let selection = load()
        return selection == automatic ? nil : selection
    }

    @discardableResult
    static func save(rawValue: String, rememberCustom: Bool = false) -> String? {
        guard let normalized = normalizedSelection(rawValue) else { return nil }
        defaults?.set(normalized, forKey: selectionKey)
        if rememberCustom && normalized != automatic {
            defaults?.set(normalized, forKey: customKey)
        }
        return normalized
    }

    static func normalizedSelection(_ rawValue: String) -> String? {
        var raw = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        if raw.lowercased() == automatic { return automatic }
        if raw.hasPrefix("#") { raw.removeFirst() }
        let hexDigits = CharacterSet(charactersIn: "0123456789abcdefABCDEF")
        guard raw.count == 6,
              raw.unicodeScalars.allSatisfy({ hexDigits.contains($0) }) else { return nil }
        return "#\(raw.uppercased())"
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

struct VitaProfileBundle: Decodable {
    struct Settings: Decodable {
        let theme: String?
        let dotStyle: String?
        let dotColor: String?

        init(theme: String? = nil, dotStyle: String? = nil, dotColor: String? = nil) {
            self.theme = theme
            self.dotStyle = dotStyle
            self.dotColor = dotColor
        }
    }

    struct Goal: Decodable {
        let code: String
        let title: String
    }

    struct Tag: Decodable, Equatable {
        let id: String
        let name: String
        let description: String
        let icon: String
        let rarity: String
        let earnedAt: String?

        private enum CodingKeys: String, CodingKey {
            case id, name, description, icon, rarity, earnedAt
        }

        init(from decoder: Decoder) throws {
            if let single = try? decoder.singleValueContainer(),
               let value = try? single.decode(String.self) {
                id = value
                name = value
                description = ""
                icon = ""
                rarity = "common"
                earnedAt = nil
                return
            }
            let container = try decoder.container(keyedBy: CodingKeys.self)
            let decodedID = try container.decodeIfPresent(String.self, forKey: .id) ?? ""
            let decodedName = try container.decodeIfPresent(String.self, forKey: .name) ?? decodedID
            id = decodedID.isEmpty ? decodedName : decodedID
            name = decodedName.isEmpty ? decodedID : decodedName
            description = try container.decodeIfPresent(String.self, forKey: .description) ?? ""
            icon = try container.decodeIfPresent(String.self, forKey: .icon) ?? ""
            rarity = try container.decodeIfPresent(String.self, forKey: .rarity) ?? "common"
            earnedAt = try container.decodeIfPresent(String.self, forKey: .earnedAt)
        }
    }

    let code: String
    let handle: String?
    let name: String?
    let bio: String?
    let avatar: String?
    let tags: [Tag]
    let settings: Settings
    let goals: [Goal]

    private enum CodingKeys: String, CodingKey {
        case code, handle, name, bio, avatar, tags, settings, goals
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        code = try container.decode(String.self, forKey: .code)
        handle = try container.decodeIfPresent(String.self, forKey: .handle)
        name = try container.decodeIfPresent(String.self, forKey: .name)
        bio = try container.decodeIfPresent(String.self, forKey: .bio)
        avatar = try container.decodeIfPresent(String.self, forKey: .avatar)
        tags = try container.decodeIfPresent([Tag].self, forKey: .tags) ?? []
        settings = try container.decodeIfPresent(Settings.self, forKey: .settings) ?? Settings()
        goals = try container.decodeIfPresent([Goal].self, forKey: .goals) ?? []
    }
}

enum VitaProfileError: LocalizedError {
    case invalidCode, invalidToken, unauthorized, notFound, invalidResponse, server(String)

    var errorDescription: String? {
        switch self {
        case .invalidCode: return "Вставь десятизначный Vita ID из личного кабинета"
        case .invalidToken: return "Не удалось подготовить аккаунт на этом устройстве"
        case .unauthorized: return "Аккаунт не найден на этом устройстве"
        case .notFound: return "Vita ID не найден"
        case .invalidResponse: return "Не удалось загрузить данные Vita ID"
        case .server(let message): return message
        }
    }
}

enum VitaProfileStore {
    private static let codeKey = "vitaProfileCode"
    private static let ownerTokenKey = "vitaProfileOwnerToken"
    private static let alphabet = CharacterSet(charactersIn: "abcdefghjkmnpqrstuvwxyz23456789")

    static var defaults: UserDefaults? { UserDefaults(suiteName: FocusAppGroup.id) }

    static var code: String? {
        guard let raw = defaults?.string(forKey: codeKey) else { return nil }
        return normalized(raw)
    }

    static var ownerToken: String? {
        guard let raw = defaults?.string(forKey: ownerTokenKey) else { return nil }
        return normalizedOwnerToken(raw)
    }

    static func normalized(_ raw: String) -> String? {
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard value.count == 10, value.unicodeScalars.allSatisfy(alphabet.contains) else { return nil }
        return value
    }

    static func save(code raw: String) -> String? {
        guard let code = normalized(raw) else { return nil }
        defaults?.set(code, forKey: codeKey)
        return code
    }

    static func normalizedOwnerToken(_ raw: String) -> String? {
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (20...200).contains(value.count),
              value.unicodeScalars.allSatisfy({ !CharacterSet.controlCharacters.contains($0) }) else { return nil }
        return value
    }

    static func makeOwnerToken() -> String {
        (UUID().uuidString + UUID().uuidString)
            .replacingOccurrences(of: "-", with: "")
            .lowercased()
    }

    @discardableResult
    static func save(ownerToken raw: String) -> String? {
        guard let ownerToken = normalizedOwnerToken(raw) else { return nil }
        defaults?.set(ownerToken, forKey: ownerTokenKey)
        return ownerToken
    }

    @discardableResult
    static func saveSession(code rawCode: String, ownerToken rawToken: String) -> Bool {
        guard let code = normalized(rawCode),
              let ownerToken = normalizedOwnerToken(rawToken) else { return false }
        defaults?.set(code, forKey: codeKey)
        defaults?.set(ownerToken, forKey: ownerTokenKey)
        return true
    }

    static func disconnect() {
        defaults?.removeObject(forKey: codeKey)
        defaults?.removeObject(forKey: ownerTokenKey)
    }

    static func apply(_ settings: VitaProfileBundle.Settings) {
        if let theme = settings.theme,
           theme != VitaWidgetTheme.photo.rawValue || VitaWidgetThemeStore.hasPhoto {
            _ = VitaWidgetThemeStore.save(rawValue: theme)
        }
        if let style = settings.dotStyle { _ = VitaDotStyleStore.save(rawValue: style) }
        if let color = settings.dotColor { _ = VitaDotColorStore.save(rawValue: color) }
    }
}

enum VitaProfileClient {
    private static let apiRoot = "https://vitadots.ru"

    static func register(ownerToken rawToken: String, name: String = "") async throws -> VitaProfileBundle {
        guard let ownerToken = VitaProfileStore.normalizedOwnerToken(rawToken) else {
            throw VitaProfileError.invalidToken
        }
        return try await sendProfileJSON(
            path: "/api/profile",
            method: "POST",
            payload: ["ownerToken": ownerToken, "name": name]
        )
    }

    static func connect(code rawCode: String, ownerToken rawToken: String) async throws -> VitaProfileBundle {
        guard let code = VitaProfileStore.normalized(rawCode) else { throw VitaProfileError.invalidCode }
        guard let ownerToken = VitaProfileStore.normalizedOwnerToken(rawToken) else {
            throw VitaProfileError.invalidToken
        }
        return try await sendProfileJSON(
            path: "/api/profile/connect",
            method: "POST",
            payload: ["ownerToken": ownerToken, "profileCode": code]
        )
    }

    static func fetchCurrent(ownerToken rawToken: String) async throws -> VitaProfileBundle {
        guard let ownerToken = VitaProfileStore.normalizedOwnerToken(rawToken) else {
            throw VitaProfileError.invalidToken
        }
        return try await sendProfileJSON(
            path: "/api/me",
            method: "POST",
            payload: ["ownerToken": ownerToken]
        )
    }

    static func update(
        ownerToken rawToken: String,
        handle: String,
        name: String,
        bio: String
    ) async throws -> VitaProfileBundle {
        guard let ownerToken = VitaProfileStore.normalizedOwnerToken(rawToken) else {
            throw VitaProfileError.invalidToken
        }
        return try await sendProfileJSON(
            path: "/api/profile",
            method: "PATCH",
            payload: ["ownerToken": ownerToken, "handle": handle, "name": name, "bio": bio]
        )
    }

    static func uploadAvatar(ownerToken rawToken: String, jpegData: Data) async throws -> VitaProfileBundle {
        guard let ownerToken = VitaProfileStore.normalizedOwnerToken(rawToken),
              let url = URL(string: apiRoot + "/api/profile/avatar") else {
            throw VitaProfileError.invalidToken
        }
        let boundary = "VitaBoundary-\(UUID().uuidString)"
        var body = Data()
        body.appendMultipartField(name: "ownerToken", value: ownerToken, boundary: boundary)
        body.appendMultipartFile(
            name: "file",
            filename: "avatar.jpg",
            mimeType: "image/jpeg",
            data: jpegData,
            boundary: boundary
        )
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 30
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.setValue(ownerToken, forHTTPHeaderField: "X-Vita-Token")
        request.httpBody = body
        return try await profileResponse(for: request)
    }

    static func fetch(code raw: String) async throws -> VitaProfileBundle {
        guard let code = VitaProfileStore.normalized(raw),
              let url = URL(string: apiRoot + "/api/profile/\(code)/bundle") else {
            throw VitaProfileError.invalidCode
        }
        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = 15
        return try await profileResponse(for: request)
    }

    static func saveCurrentSettings() async {
        let settings: [String: String] = [
            "theme": VitaWidgetThemeStore.load().rawValue,
            "dotStyle": VitaDotStyleStore.load().rawValue,
            "dotColor": VitaDotColorStore.load(),
        ]
        let path: String
        let payload: [String: Any]
        if let ownerToken = VitaProfileStore.ownerToken {
            path = "/api/profile/settings"
            payload = ["ownerToken": ownerToken, "settings": settings]
        } else if let code = VitaProfileStore.code {
            path = "/api/profile/\(code)/settings"
            payload = ["settings": settings]
        } else {
            return
        }
        guard let url = URL(string: apiRoot + path) else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: payload)
        _ = try? await URLSession.shared.data(for: request)
    }

    private static func sendProfileJSON(
        path: String,
        method: String,
        payload: [String: Any]
    ) async throws -> VitaProfileBundle {
        guard let url = URL(string: apiRoot + path) else { throw VitaProfileError.invalidResponse }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)
        return try await profileResponse(for: request)
    }

    private static func profileResponse(for request: URLRequest) async throws -> VitaProfileBundle {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw VitaProfileError.server("Нет связи с Vita — попробуй ещё раз")
        }
        guard let http = response as? HTTPURLResponse else { throw VitaProfileError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            if http.statusCode == 401 { throw VitaProfileError.unauthorized }
            if http.statusCode == 404 { throw VitaProfileError.notFound }
            if let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let detail = object["detail"] as? String,
               !detail.isEmpty {
                throw VitaProfileError.server(detail)
            }
            throw VitaProfileError.invalidResponse
        }
        do {
            return try JSONDecoder().decode(VitaProfileBundle.self, from: data)
        } catch {
            throw VitaProfileError.invalidResponse
        }
    }
}

private extension Data {
    mutating func appendMultipartField(name: String, value: String, boundary: String) {
        append("--\(boundary)\r\n".data(using: .utf8)!)
        append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n".data(using: .utf8)!)
        append("\(value)\r\n".data(using: .utf8)!)
    }

    mutating func appendMultipartFile(
        name: String,
        filename: String,
        mimeType: String,
        data: Data,
        boundary: String
    ) {
        append("--\(boundary)\r\n".data(using: .utf8)!)
        append("Content-Disposition: form-data; name=\"\(name)\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
        append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
        append(data)
        append("\r\n".data(using: .utf8)!)
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
