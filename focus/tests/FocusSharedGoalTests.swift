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
