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
        try testHabitStreaksAndGrid()
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
