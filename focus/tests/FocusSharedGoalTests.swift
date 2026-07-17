import Foundation

@main
struct FocusSharedGoalTests {
    private static var checks = 0

    static func main() throws {
        try testInclusiveRange()
        try testDateBoundaries()
        try testMarkedDayBounds()
        try testValidation()
        try testHabitCodes()
        try testHabitDeepLinks()
        try testFocusLaunchLinks()
        try testHabitStreaksAndGrid()
        testGoalDotStyles()
        testDotColors()
        try testImpulseValidation()
        try testImpulseLegacyMigration()
        try testImpulseLifecycle()
        try testImpulseRecurrence()
        try testImpulseDeadlineAlertValidation()
        try testImpulseFolders()
        testImpulsePendingAction()
        testVitaProfileCodes()
        print("FocusSharedGoalTests: \(checks) checks passed")
    }

    private static func testInclusiveRange() throws {
        let range = try VitaGoalDotsStore.validatedGoalRange(
            start: "2026-07-12",
            end: "2026-08-10"
        )
        expect(range.total == 30, "12.07...10.08 must contain 30 days")
    }

    private static func testDateBoundaries() throws {
        let model = goalModel()

        let before = VitaGoalDotsStore.grid(model: model, for: try date("2026-07-11"))
        expect(before.total == 30, "goal grid must keep the inclusive total")
        expect(before.pastFilled == 0, "days before the goal must not be filled")
        expect(before.todayIndex == nil, "days before the goal must not ring the first dot")

        let first = VitaGoalDotsStore.grid(model: model, for: try date("2026-07-12"))
        expect(first.pastFilled == 0, "the first day is current, not past")
        expect(first.todayIndex == 0, "the first day must ring index 0")

        let last = VitaGoalDotsStore.grid(model: model, for: try date("2026-08-10"))
        expect(last.pastFilled == 29, "29 days are past on the final day")
        expect(last.todayIndex == 29, "the final day must ring index 29")

        let after = VitaGoalDotsStore.grid(model: model, for: try date("2026-08-11"))
        expect(after.pastFilled == 30, "all dots must fill after the goal")
        expect(after.todayIndex == nil, "no dot must ring after the goal")
    }

    private static func testMarkedDayBounds() throws {
        var model = goalModel()
        model.markedDays = [
            "2026-07-11",
            "2026-07-12",
            "2026-07-12",
            "2026-08-10",
            "2026-08-11",
        ]
        let grid = VitaGoalDotsStore.grid(model: model, for: try date("2026-07-20"))
        expect(grid.markedIndices == Set([0, 29]), "only unique in-range marks must be rendered")
    }

    private static func testValidation() throws {
        let maxRange = try VitaGoalDotsStore.validatedGoalRange(
            start: "2026-07-12",
            end: "2026-08-22"
        )
        expect(maxRange.total == 42, "42 days must be accepted")

        do {
            _ = try VitaGoalDotsStore.validatedGoalRange(start: "2026-07-12", end: "2026-07-11")
            fail("a reversed range must be rejected")
        } catch VitaGoalSettingsError.endBeforeStart {
            checks += 1
        }

        do {
            _ = try VitaGoalDotsStore.validatedGoalRange(start: "2026-07-12", end: "2026-08-23")
            fail("a 43-day range must be rejected")
        } catch VitaGoalSettingsError.rangeTooLong(let maxDays) {
            expect(maxDays == 42, "the range error must report the supported maximum")
        }

        do {
            _ = try VitaGoalDotsStore.validatedGoalRange(start: "2026-02-30", end: "2026-03-10")
            fail("an invalid calendar date must be rejected")
        } catch VitaGoalSettingsError.invalidDates {
            checks += 1
        }
    }

    private static func testHabitCodes() throws {
        expect(VitaHabitStore.code(from: "abc234") == "abc234", "a raw habit code must be accepted")
        expect(
            VitaHabitStore.code(from: "https://vitadots.ru/g/ABC234") == "abc234",
            "a goal URL must yield its normalized code"
        )
        expect(
            VitaHabitStore.code(from: "vita://goal/abc234") == "abc234",
            "a Vita deep link must yield its goal code"
        )
        expect(VitaHabitStore.code(from: "abc123") == nil, "ambiguous digits excluded by the server must be rejected")
    }

    private static func testHabitDeepLinks() throws {
        let valid = URL(string: "vita://goal/ABC234")!
        expect(FocusDeepLinks.isGoalDeepLink(valid), "a Vita goal URL must be recognized as a habit deep link")
        expect(FocusDeepLinks.goalCode(from: valid) == "abc234", "a valid habit deep link must yield its code")

        let missing = URL(string: "vita://goal")!
        expect(FocusDeepLinks.isGoalDeepLink(missing), "a goal deep link without a code must still use goal routing")
        expect(FocusDeepLinks.goalCode(from: missing) == nil, "a missing habit code must be rejected")
        expect(FocusDeepLinks.fallbackURL(for: missing) == FocusDeepLinks.goalsHome, "a missing habit code must fall back to Vita goals")

        let invalid = URL(string: "vita://goal/abc123")!
        expect(FocusDeepLinks.goalCode(from: invalid) == nil, "an invalid habit code must be rejected")
        expect(FocusDeepLinks.fallbackURL(for: invalid) != FocusDeepLinks.youtubeHome, "an invalid habit code must never fall back to YouTube")

        let malformed = URL(string: "vita://goal/abc234/extra")!
        expect(FocusDeepLinks.goalCode(from: malformed) == nil, "extra path components must not activate a habit")
        expect(FocusDeepLinks.fallbackURL(for: malformed) == FocusDeepLinks.goalsHome, "a malformed habit link must fall back to Vita goals")
    }

    private static func testFocusLaunchLinks() throws {
        let launch = URL(string: "vita://youtube")!
        expect(FocusDeepLinks.fallbackURL(for: launch) == FocusDeepLinks.youtubeHome, "the native YouTube launcher must resolve to YouTube home")

        let components = URLComponents(url: FocusDeepLinks.youtubeHome, resolvingAgainstBaseURL: false)
        let noApp = components?.queryItems?.first(where: { $0.name == "noapp" })?.value
        expect(noApp == "1", "YouTube launches must opt out of the native-app Universal Link")
    }

    private static func testHabitStreaksAndGrid() throws {
        let habit = VitaHabitSnapshot(
            code: "abc234",
            title: "Читать каждый день",
            days: 66,
            start: "2026-07-01",
            reward: "",
            color: "#34c759",
            background: "black",
            shape: "circle",
            done: ["2026-07-10", "2026-07-11", "2026-07-12"],
            peers: 1,
            updatedAt: 0
        )
        let today = try date("2026-07-12")
        expect(habit.currentStreak(on: today) == 3, "habit streak must use the shared check-ins")
        expect(habit.bestStreak() == 3, "habit best streak must scan the full goal")
        expect(habit.isDone(on: today), "today must be marked from the server snapshot")

        let firstWindow = habit.widgetGrid(for: today, maxDots: 42)
        expect(firstWindow.total == 42, "medium habit widgets must cap the visible window")
        expect(firstWindow.todayIndex == 11, "today must stay aligned inside the first window")
        expect(firstWindow.markedIndices == Set([9, 10, 11]), "server check-ins must map to visible dots")
        expect(firstWindow.pastFilled == 0, "missed habit days must remain empty")

        let laterWindow = habit.widgetGrid(for: try date("2026-08-29"), maxDots: 42)
        expect(laterWindow.todayIndex == 35, "a long habit must use a rolling 35+7 day window")
        expect(laterWindow.markedIndices.isEmpty, "old marks outside the rolling window must not leak in")
    }

    private static func testGoalDotStyles() {
        expect(VitaDotStyle(goalShape: "circle") == .circle, "circle goals must keep circular dots")
        expect(VitaDotStyle(goalShape: "rounded") == .soft, "rounded goals must map to soft dots")
        expect(VitaDotStyle(goalShape: "square") == .square, "square goals must keep square dots")
        expect(VitaDotStyle(goalShape: "diamond") == .diamond, "diamond goals must keep diamond dots")
        expect(VitaDotStyle(goalShape: "heart") == .heart, "heart goals must keep heart dots")
        expect(VitaDotStyle(goalShape: "star") == .star, "star goals must keep star dots")
        expect(VitaDotStyle(goalShape: "hex") == .hex, "hex goals must keep hexagonal dots")
        expect(VitaDotStyle(goalShape: "unknown") == .circle, "unknown goal shapes must fall back safely")
    }

    private static func testDotColors() {
        expect(VitaDotColorStore.normalizedSelection("auto") == "auto", "automatic dot color must remain automatic")
        expect(VitaDotColorStore.normalizedSelection(" #a855f7 ") == "#A855F7", "dot colors must normalize to uppercase hex")
        expect(VitaDotColorStore.normalizedSelection("38BDF8") == "#38BDF8", "dot colors may omit the hash")
        expect(VitaDotColorStore.normalizedSelection("#fff") == nil, "short hex colors must be rejected")
        expect(VitaDotColorStore.normalizedSelection("#GG55F7") == nil, "invalid hex colors must be rejected")
        expect(VitaDotColorStore.normalizedSelection("+00001") == nil, "signed values must not be accepted as hex colors")
    }

    private static func testImpulseValidation() throws {
        let now = try date("2026-07-17")
        let fireDate = now.addingTimeInterval(60)
        let impulse = try VitaImpulseStore.save(
            title: "  Тренировка ",
            reason: " Больше энергии ",
            firstStep: " Надеть кроссовки ",
            fireDate: fireDate,
            now: now
        )
        defer { _ = VitaImpulseStore.delete(id: impulse.id) }
        expect(impulse.title == "Тренировка", "impulse title must be trimmed")
        expect(impulse.notificationBody.contains("Первый шаг: Надеть кроссовки"), "notification must make starting explicit")
        do {
            _ = try VitaImpulseStore.save(title: "Читать", reason: "", firstStep: "", fireDate: fireDate, now: now)
            fail("an impulse without a first step must be rejected")
        } catch VitaImpulseError.missingFirstStep {
            checks += 1
        }
        do {
            _ = try VitaImpulseStore.save(title: "Читать", reason: "", firstStep: "Открыть книгу", fireDate: now, now: now)
            fail("an impulse in the past must be rejected")
        } catch VitaImpulseError.invalidDate {
            checks += 1
        }
    }

    private static func testImpulseLegacyMigration() throws {
        struct LegacyImpulse: Codable {
            let title: String
            let reason: String
            let firstStep: String
            let fireDate: Date
            let deadline: Date?
            let durationMinutes: Int
            let focusMode: VitaImpulseFocusMode
            let status: VitaImpulseStatus
            let timerEndDate: Date?
            let isEnabled: Bool
        }

        guard let defaults = VitaImpulseStore.defaults else {
            fail("the impulse App Group defaults must be available")
        }
        let collectionKey = "vitaImpulses"
        let legacyKey = "vitaImpulse"
        let oldCollection = defaults.data(forKey: collectionKey)
        let oldLegacy = defaults.data(forKey: legacyKey)
        defer {
            if let oldCollection { defaults.set(oldCollection, forKey: collectionKey) }
            else { defaults.removeObject(forKey: collectionKey) }
            if let oldLegacy { defaults.set(oldLegacy, forKey: legacyKey) }
            else { defaults.removeObject(forKey: legacyKey) }
        }

        defaults.removeObject(forKey: collectionKey)
        let fireDate = try date("2026-08-01")
        let deadline = fireDate.addingTimeInterval(3600)
        let timerEndDate = fireDate.addingTimeInterval(900)
        let data = try JSONEncoder().encode(LegacyImpulse(
            title: "Старый импульс",
            reason: "Важно",
            firstStep: "Начать",
            fireDate: fireDate,
            deadline: deadline,
            durationMinutes: 25,
            focusMode: .reading,
            status: .running,
            timerEndDate: timerEndDate,
            isEnabled: true
        ))
        defaults.set(data, forKey: legacyKey)

        let migrated = VitaImpulseStore.all()
        expect(migrated.count == 1, "a legacy single impulse must migrate into the collection")
        expect(!migrated[0].id.isEmpty, "legacy migration must assign a stable identifier")
        expect(migrated[0].deadlineAlertDate == deadline, "a legacy deadline must also become its alert date")
        expect(!migrated[0].usesAlarm && migrated[0].folderID == nil, "legacy reminders must default new alarm and folder fields safely")
        expect(migrated[0].durationMinutes == 25 && migrated[0].focusMode == .reading, "legacy timer and focus settings must survive migration")
        expect(migrated[0].timerEndDate == timerEndDate && migrated[0].status == .running, "legacy running timers must not be discarded")
        expect(migrated[0].recurrenceAnchorDate == fireDate, "legacy reminders must anchor recurrence to their fire date")
        expect(migrated[0].priority == .none, "legacy reminders must receive safe defaults for absent enum fields")
        expect(VitaImpulseStore.all()[0].id == migrated[0].id, "the migrated identifier must remain stable")
        expect(defaults.data(forKey: legacyKey) == nil, "the legacy storage key must be retired after migration")
    }

    private static func testImpulseLifecycle() throws {
        let now = try date("2026-07-17")
        let fireDate = now.addingTimeInterval(60)
        let deadline = now.addingTimeInterval(600)
        let impulse = try VitaImpulseStore.save(
            title: "  Прочитать главу ",
            reason: " Зачем это важно ",
            firstStep: " Открыть книгу ",
            notes: " Без телефона ",
            fireDate: fireDate,
            deadline: deadline,
            durationMinutes: 25,
            priority: .high,
            repeatRule: .none,
            focusMode: .reading,
            now: now
        )
        defer { _ = VitaImpulseStore.delete(id: impulse.id) }

        expect(VitaImpulseStore.load(id: impulse.id)?.notes == "Без телефона", "rich impulse fields must be trimmed and stored")
        expect(VitaImpulseStore.all().contains(where: { $0.id == impulse.id }), "the collection must contain every saved reminder")
        expect(VitaImpulseStore.notificationID(for: impulse.id).contains(impulse.id), "notification identifiers must be unique per impulse")

        let accepted = try VitaImpulseStore.accept(id: impulse.id, now: now.addingTimeInterval(70))
        expect(accepted.status == .accepted && accepted.acceptedAt != nil, "accept must record state and time")
        let edited = try VitaImpulseStore.save(
            id: impulse.id,
            title: "Прочитать две главы",
            reason: impulse.reason,
            firstStep: impulse.firstStep,
            notes: impulse.notes,
            fireDate: fireDate,
            deadline: deadline,
            durationMinutes: 25,
            priority: .medium,
            repeatRule: .none,
            focusMode: .reading,
            now: now
        )
        expect(edited.id == impulse.id && edited.createdAt == impulse.createdAt, "editing must preserve identity and creation time")
        expect(edited.status == .accepted, "editing must preserve the current lifecycle state")
        let disabled = try VitaImpulseStore.disable(id: impulse.id)
        expect(!disabled.isEnabled, "disabling must pause a reminder")
        let reenabled = try VitaImpulseStore.save(
            id: impulse.id,
            title: edited.title,
            reason: edited.reason,
            firstStep: edited.firstStep,
            notes: edited.notes,
            fireDate: edited.fireDate,
            deadline: edited.deadline,
            durationMinutes: edited.durationMinutes,
            priority: edited.priority,
            repeatRule: edited.repeatRule,
            focusMode: edited.focusMode,
            now: now
        )
        expect(reenabled.isEnabled, "explicitly saving a paused reminder must enable it again")
        let rescheduled = try VitaImpulseStore.save(
            id: impulse.id,
            title: reenabled.title,
            reason: reenabled.reason,
            firstStep: reenabled.firstStep,
            notes: reenabled.notes,
            fireDate: now.addingTimeInterval(90),
            deadline: reenabled.deadline,
            durationMinutes: reenabled.durationMinutes,
            priority: reenabled.priority,
            repeatRule: reenabled.repeatRule,
            focusMode: reenabled.focusMode,
            now: now
        )
        expect(rescheduled.status == .scheduled && rescheduled.acceptedAt == nil, "changing reminder time must re-arm an accepted impulse")

        let snoozed = try VitaImpulseStore.snooze(id: impulse.id, until: deadline.addingTimeInterval(-20), now: now.addingTimeInterval(80))
        expect(snoozed.status == .snoozed && snoozed.snoozeCount == 1, "snooze must move the reminder and count interruptions")
        let adjustedSnooze = try VitaImpulseStore.snooze(
            id: impulse.id,
            until: deadline.addingTimeInterval(-10),
            now: now.addingTimeInterval(81)
        )
        expect(adjustedSnooze.snoozeCount == 1, "choosing an exact time after the notification fallback must not double-count a snooze")
        _ = try VitaImpulseStore.upsert(adjustedSnooze, now: now.addingTimeInterval(81))
        do {
            _ = try VitaImpulseStore.snooze(id: impulse.id, until: deadline, now: now)
            fail("snooze at the deadline must be rejected")
        } catch VitaImpulseError.invalidSnooze {
            checks += 1
        }
        do {
            _ = try VitaImpulseStore.snooze(id: impulse.id, until: deadline.addingTimeInterval(1), now: now)
            fail("snooze after the deadline must be rejected")
        } catch VitaImpulseError.invalidSnooze {
            checks += 1
        }

        let running = try VitaImpulseStore.startTimer(
            id: impulse.id,
            durationMinutes: 10,
            focusMode: .deepWork,
            now: now.addingTimeInterval(100)
        )
        expect(running.status == .running, "starting a timer must expose the running state")
        expect(running.timerEndDate == now.addingTimeInterval(700), "the timer must use the selected duration")
        expect(running.focusMode == .deepWork, "the timer may override the selected focus mode")
        expect(VitaImpulseStore.reconcileExpiredTimers(now: now.addingTimeInterval(699)).isEmpty, "an active timer must not finish early")
        expect(VitaImpulseStore.reconcileExpiredTimers(now: now.addingTimeInterval(701)) == [impulse.id], "an expired timer must reconcile into accepted state")
        _ = try VitaImpulseStore.startTimer(id: impulse.id, durationMinutes: 10, now: now.addingTimeInterval(702))
        let second = try VitaImpulseStore.save(
            title: "Второй таймер",
            reason: "Проверка",
            firstStep: "Начать",
            fireDate: now.addingTimeInterval(120),
            now: now
        )
        defer { _ = VitaImpulseStore.delete(id: second.id) }
        _ = try VitaImpulseStore.startTimer(id: second.id, now: now.addingTimeInterval(710))
        let interrupted = VitaImpulseStore.load(id: impulse.id)
        expect(interrupted?.timerEndDate == nil && interrupted?.status == .accepted, "starting a timer must stop the previous session")
        _ = try VitaImpulseStore.startTimer(id: impulse.id, durationMinutes: 10, now: now.addingTimeInterval(715))
        let cancelled = try VitaImpulseStore.cancelTimer(id: impulse.id)
        expect(cancelled.timerEndDate == nil && cancelled.status == .accepted, "cancelling a timer must return to the accepted state")

        let completed = try VitaImpulseStore.complete(id: impulse.id, now: now.addingTimeInterval(200))
        expect(completed.status == .completed && !completed.isEnabled, "a one-off impulse must disable after completion")

        do {
            _ = try VitaImpulseStore.save(
                title: "Неверный дедлайн",
                reason: "",
                firstStep: "Начать",
                notes: "",
                fireDate: fireDate,
                deadline: fireDate,
                now: now
            )
            fail("a deadline at the reminder time must be rejected")
        } catch VitaImpulseError.invalidDeadline {
            checks += 1
        }
        do {
            _ = try VitaImpulseStore.save(
                title: "Неверный таймер",
                reason: "",
                firstStep: "Начать",
                notes: "",
                fireDate: fireDate,
                durationMinutes: 0,
                now: now
            )
            fail("a zero-duration timer must be rejected")
        } catch VitaImpulseError.invalidDuration {
            checks += 1
        }
    }

    private static func testImpulseRecurrence() throws {
        let now = try date("2026-07-17").addingTimeInterval(9 * 3600)
        let fireDate = now.addingTimeInterval(60)
        let deadline = now.addingTimeInterval(3600)
        let impulse = try VitaImpulseStore.save(
            title: "Будний ритуал",
            reason: "Ритм",
            firstStep: "Открыть план",
            notes: "",
            fireDate: fireDate,
            deadline: deadline,
            durationMinutes: 15,
            repeatRule: .weekdays,
            now: now
        )
        defer { _ = VitaImpulseStore.delete(id: impulse.id) }

        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Moscow")!
        let snoozed = try VitaImpulseStore.snooze(
            id: impulse.id,
            until: now.addingTimeInterval(1800),
            now: now.addingTimeInterval(120)
        )
        expect(snoozed.recurrenceAnchorDate == fireDate, "snooze must not move the recurrence anchor")
        let next = try VitaImpulseStore.complete(
            id: impulse.id,
            now: now.addingTimeInterval(1900),
            calendar: calendar
        )
        expect(next.status == .scheduled && next.isEnabled, "a recurring impulse must schedule its next occurrence")
        expect(calendar.component(.weekday, from: next.fireDate) == 2, "weekday recurrence must skip the weekend")
        expect(next.deadline?.timeIntervalSince(next.fireDate) == deadline.timeIntervalSince(fireDate), "recurrence must advance its deadline with the reminder")
        expect(next.snoozeCount == 0 && next.acceptedAt == nil, "a new recurrence must reset transient state")
        expect(next.deadlineAlertDate?.timeIntervalSince(next.fireDate) == deadline.timeIntervalSince(fireDate), "recurrence must advance the deadline alert too")
    }

    private static func testImpulseDeadlineAlertValidation() throws {
        let now = try date("2026-07-17")
        let fireDate = now.addingTimeInterval(60)
        let deadline = now.addingTimeInterval(600)
        let impulse = try VitaImpulseStore.save(
            title: "Завершить отчёт",
            reason: "Освободить вечер",
            firstStep: "Открыть документ",
            notes: "",
            fireDate: fireDate,
            deadline: deadline,
            folderID: nil,
            deadlineAlertDate: deadline,
            usesAlarm: true,
            now: now
        )
        defer { _ = VitaImpulseStore.delete(id: impulse.id) }
        expect(impulse.deadlineAlertDate == deadline && impulse.usesAlarm, "rich save must persist deadline alerts and alarm preference")

        let encoded = try JSONEncoder().encode(VitaImpulse(
            title: "Без сигнала дедлайна",
            reason: "",
            firstStep: "Начать",
            fireDate: fireDate,
            deadline: deadline,
            deadlineAlertDate: nil
        ))
        let decoded = try JSONDecoder().decode(VitaImpulse.self, from: encoded)
        expect(decoded.deadlineAlertDate == nil, "an explicitly absent modern deadline alert must stay absent")

        do {
            _ = try VitaImpulseStore.save(
                title: "Без дедлайна",
                reason: "",
                firstStep: "Начать",
                notes: "",
                fireDate: fireDate,
                folderID: nil,
                deadlineAlertDate: deadline,
                usesAlarm: false,
                now: now
            )
            fail("a deadline alert without a deadline must be rejected")
        } catch VitaImpulseError.invalidDeadlineAlert {
            checks += 1
        }
        do {
            _ = try VitaImpulseStore.save(
                title: "Слишком ранний сигнал",
                reason: "",
                firstStep: "Начать",
                notes: "",
                fireDate: fireDate,
                deadline: deadline,
                folderID: nil,
                deadlineAlertDate: fireDate,
                usesAlarm: false,
                now: now
            )
            fail("a deadline alert at the first reminder must be rejected")
        } catch VitaImpulseError.invalidDeadlineAlert {
            checks += 1
        }
        do {
            _ = try VitaImpulseStore.save(
                title: "Поздний сигнал",
                reason: "",
                firstStep: "Начать",
                notes: "",
                fireDate: fireDate,
                deadline: deadline,
                folderID: nil,
                deadlineAlertDate: deadline.addingTimeInterval(1),
                usesAlarm: false,
                now: now
            )
            fail("a deadline alert after the deadline must be rejected")
        } catch VitaImpulseError.invalidDeadlineAlert {
            checks += 1
        }
        let editedExpired = try VitaImpulseStore.save(
            id: impulse.id,
            title: "Завершить отчёт — уточнено",
            reason: impulse.reason,
            firstStep: impulse.firstStep,
            notes: impulse.notes,
            fireDate: fireDate,
            deadline: deadline,
            folderID: nil,
            deadlineAlertDate: deadline,
            usesAlarm: true,
            now: deadline.addingTimeInterval(10)
        )
        expect(
            editedExpired.id == impulse.id
                && editedExpired.fireDate == fireDate
                && editedExpired.deadlineAlertDate == deadline,
            "editing an expired reminder without changing its dates must stay possible"
        )
        do {
            _ = try VitaImpulseStore.save(
                id: impulse.id,
                title: editedExpired.title,
                reason: editedExpired.reason,
                firstStep: editedExpired.firstStep,
                notes: editedExpired.notes,
                fireDate: fireDate,
                deadline: deadline,
                folderID: nil,
                deadlineAlertDate: deadline.addingTimeInterval(-1),
                usesAlarm: true,
                now: deadline.addingTimeInterval(10)
            )
            fail("a changed deadline alert in the past must be rejected while editing")
        } catch VitaImpulseError.invalidDeadlineAlert {
            checks += 1
        }
    }

    private static func testImpulseFolders() throws {
        guard let defaults = VitaImpulseFolderStore.defaults else {
            fail("the impulse folder App Group defaults must be available")
        }
        let key = "vitaImpulseFolders"
        let oldFolders = defaults.data(forKey: key)
        defer {
            if let oldFolders { defaults.set(oldFolders, forKey: key) }
            else { defaults.removeObject(forKey: key) }
        }
        defaults.removeObject(forKey: key)

        let now = try date("2026-07-17")
        let folder = try VitaImpulseFolderStore.create(name: "  Работа  ", now: now)
        expect(folder.name == "Работа", "folder names must be trimmed")
        expect(VitaImpulseFolderStore.list() == [folder], "created folders must persist in the App Group")
        do {
            _ = try VitaImpulseFolderStore.create(name: "работа", now: now)
            fail("folder names must be unique ignoring case")
        } catch VitaImpulseFolderError.duplicateName {
            checks += 1
        }
        let renamed = try VitaImpulseFolderStore.rename(id: folder.id, name: "  Чтение ")
        expect(renamed.name == "Чтение" && renamed.createdAt == folder.createdAt, "renaming must preserve folder identity and creation time")
        do {
            _ = try VitaImpulseFolderStore.rename(id: folder.id, name: "  ")
            fail("empty folder names must be rejected while renaming")
        } catch VitaImpulseFolderError.missingName {
            checks += 1
        }

        let fireDate = now.addingTimeInterval(60)
        let deadline = now.addingTimeInterval(600)
        let impulse = try VitaImpulseStore.save(
            title: "Прочитать главу",
            reason: "Развитие",
            firstStep: "Открыть книгу",
            notes: "",
            fireDate: fireDate,
            deadline: deadline,
            folderID: folder.id,
            deadlineAlertDate: deadline,
            usesAlarm: true,
            focusMode: .reading,
            now: now
        )
        defer { _ = VitaImpulseStore.delete(id: impulse.id) }
        expect(impulse.folderID == folder.id, "rich save must attach an impulse to a folder")
        let editedByLegacyAPI = try VitaImpulseStore.save(
            id: impulse.id,
            title: "Прочитать две главы",
            reason: impulse.reason,
            firstStep: impulse.firstStep,
            notes: impulse.notes,
            fireDate: impulse.fireDate,
            deadline: impulse.deadline,
            durationMinutes: impulse.durationMinutes,
            priority: impulse.priority,
            repeatRule: impulse.repeatRule,
            focusMode: impulse.focusMode,
            now: now
        )
        expect(editedByLegacyAPI.folderID == folder.id && editedByLegacyAPI.usesAlarm, "the old rich save API must preserve new fields while editing")
        expect(editedByLegacyAPI.deadlineAlertDate == deadline, "the old rich save API must preserve the deadline alert")

        expect(VitaImpulseFolderStore.delete(id: folder.id), "deleting an existing folder must succeed")
        expect(VitaImpulseFolderStore.list().isEmpty, "deleted folders must leave the folder list")
        expect(VitaImpulseStore.load(id: impulse.id)?.folderID == nil, "deleting a folder must unlink its impulses")
        var staleImpulse = impulse
        staleImpulse.folderID = folder.id
        do {
            _ = try VitaImpulseStore.upsert(staleImpulse)
            fail("an impulse must not restore a deleted folder reference")
        } catch VitaImpulseError.invalidFolder {
            checks += 1
        }
        expect(!VitaImpulseFolderStore.delete(id: folder.id), "deleting an absent folder must be a no-op")
        do {
            _ = try VitaImpulseFolderStore.rename(id: folder.id, name: "Несуществующая")
            fail("renaming an absent folder must fail")
        } catch VitaImpulseFolderError.notFound {
            checks += 1
        }
    }

    private static func testImpulsePendingAction() {
        let previous = VitaImpulsePendingActionStore.load()
        defer {
            if let previous {
                VitaImpulsePendingActionStore.set(
                    type: previous.type,
                    impulseID: previous.impulseID,
                    snoozeUntil: previous.snoozeUntil,
                    requestedAt: previous.requestedAt
                )
            } else {
                VitaImpulsePendingActionStore.clear()
            }
        }

        let requestedAt = Date(timeIntervalSinceReferenceDate: 1_000)
        VitaImpulsePendingActionStore.set(type: .snooze, impulseID: "test-id", requestedAt: requestedAt)
        expect(VitaImpulsePendingActionStore.load()?.type == .snooze, "notification actions must survive until the app handles them")
        expect(VitaImpulsePendingActionStore.consume()?.impulseID == "test-id", "consume must return the pending impulse action")
        expect(VitaImpulsePendingActionStore.load() == nil, "consume must clear the pending action")
    }

    private static func testVitaProfileCodes() {
        expect(VitaProfileStore.normalized(" abcdefgh23 ") == "abcdefgh23", "Vita ID must normalize valid private codes")
        expect(VitaProfileStore.normalized("abc123") == nil, "a goal code must not be confused with a Vita ID")
        expect(VitaHabitStore.deepLinkURL(for: "abc234")?.absoluteString == "vita://goal/abc234", "goal widgets must open the Vita app")
    }

    private static func goalModel() -> VitaGoalDots {
        VitaGoalDots(
            mode: .goal,
            accentHex: "#a855f7",
            goalStart: "2026-07-12",
            goalEnd: "2026-08-10",
            markedDays: []
        )
    }

    private static func date(_ raw: String) throws -> Date {
        let formatter = DateFormatter()
        formatter.calendar = Calendar.current
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false
        guard let value = formatter.date(from: raw) else {
            throw TestFailure(message: "invalid test date: \(raw)")
        }
        return value
    }

    private static func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
        checks += 1
        if !condition() { fail(message) }
    }

    private static func fail(_ message: String) -> Never {
        fputs("FocusSharedGoalTests failed: \(message)\n", stderr)
        exit(1)
    }
}

private struct TestFailure: Error {
    let message: String
}
