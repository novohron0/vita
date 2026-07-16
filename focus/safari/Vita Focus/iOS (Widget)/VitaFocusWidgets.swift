import WidgetKit
import SwiftUI
import UIKit
#if canImport(AppIntents)
import AppIntents
#endif

// MARK: - Timeline

struct FocusEntry: TimelineEntry {
    let date: Date
    let snapshot: FocusSnapshot
    let dots: VitaDotsGrid
    let habit: VitaHabitSnapshot?
    let accent: Color
    let widgetTheme: VitaWidgetTheme
    let dotStyle: VitaDotStyle
}

private enum FocusEntryFactory {
    static func makeEntry(date: Date = .now, habit: VitaHabitSnapshot?) -> FocusEntry {
        let model = VitaGoalDotsStore.load()
        let theme = VitaWidgetThemeStore.load()
        let configuredAccent = Color(hex: model.accentHex)
            ?? Color(red: 0.66, green: 0.33, blue: 0.97)
        return FocusEntry(
            date: date,
            snapshot: FocusSnapshotStore.load(),
            dots: VitaGoalDotsStore.grid(for: date),
            habit: habit,
            accent: accent(for: theme, fallback: configuredAccent),
            widgetTheme: theme,
            dotStyle: VitaDotStyleStore.load()
        )
    }

    private static func accent(for theme: VitaWidgetTheme, fallback: Color) -> Color {
        switch theme {
        case .violet:
            return Color(red: 0.76, green: 0.36, blue: 1)
        case .ocean:
            return Color(red: 0.18, green: 0.80, blue: 0.96)
        case .ember:
            return Color(red: 1, green: 0.49, blue: 0.22)
        case .graphite, .photo:
            return fallback
        }
    }

    static func makeTimeline(habit: VitaHabitSnapshot?) -> Timeline<FocusEntry> {
        let now = Date.now
        let entry = makeEntry(date: now, habit: habit)
        let next = Calendar.current.date(byAdding: .minute, value: 30, to: now)
            ?? now.addingTimeInterval(1800)
        return Timeline(entries: [entry], policy: .after(next))
    }
}

/// Month dots and the YouTube launcher only read local App Group state. They
/// must not wake the goal API every time WidgetKit refreshes them.
struct LocalFocusProvider: TimelineProvider {
    func placeholder(in context: Context) -> FocusEntry {
        FocusEntryFactory.makeEntry(habit: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (FocusEntry) -> Void) {
        completion(FocusEntryFactory.makeEntry(habit: context.isPreview ? .placeholder : nil))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<FocusEntry>) -> Void) {
        completion(FocusEntryFactory.makeTimeline(habit: nil))
    }
}

struct HabitFocusProvider: TimelineProvider {
    func placeholder(in context: Context) -> FocusEntry {
        FocusEntryFactory.makeEntry(habit: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (FocusEntry) -> Void) {
        let habit = VitaHabitStore.loadSnapshot() ?? (context.isPreview ? .placeholder : nil)
        completion(FocusEntryFactory.makeEntry(habit: habit))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<FocusEntry>) -> Void) {
        let cached = VitaHabitStore.loadSnapshot()
        guard let code = VitaHabitStore.activeCode else {
            completion(FocusEntryFactory.makeTimeline(habit: nil))
            return
        }
        Task {
            let habit: VitaHabitSnapshot?
            if let fresh = try? await VitaHabitClient.fetch(code: code),
               VitaHabitStore.activeCode == code {
                VitaHabitStore.save(fresh)
                habit = fresh
            } else {
                habit = VitaHabitStore.activeCode == code ? cached : VitaHabitStore.loadSnapshot()
            }
            completion(FocusEntryFactory.makeTimeline(habit: habit))
        }
    }
}

// MARK: - Shared styling

private struct VitaWidgetBackground: View {
    let theme: VitaWidgetTheme
    let accent: Color

    var body: some View {
        ZStack {
            if theme == .photo, let image = photoImage {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                LinearGradient(
                    stops: [
                        .init(color: .black.opacity(0.42), location: 0),
                        .init(color: .black.opacity(0.18), location: 0.42),
                        .init(color: .black.opacity(0.82), location: 1),
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
            } else {
                LinearGradient(
                    colors: baseColors,
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                RadialGradient(
                    colors: [glow.opacity(0.48), glow.opacity(0)],
                    center: .topTrailing,
                    startRadius: 0,
                    endRadius: 210
                )
                RadialGradient(
                    colors: [secondaryGlow.opacity(0.16), secondaryGlow.opacity(0)],
                    center: .bottomLeading,
                    startRadius: 0,
                    endRadius: 190
                )
                VitaMicroPattern()
            }
            LinearGradient(
                colors: [.white.opacity(0.08), .clear, .black.opacity(0.16)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
        .clipped()
    }

    private var photoImage: UIImage? {
        guard let url = VitaWidgetThemeStore.photoURL else { return nil }
        return UIImage(contentsOfFile: url.path)
    }

    private var baseColors: [Color] {
        switch theme {
        case .graphite:
            return [Color(red: 0.13, green: 0.14, blue: 0.17), Color(red: 0.025, green: 0.027, blue: 0.035)]
        case .violet:
            return [Color(red: 0.18, green: 0.10, blue: 0.28), Color(red: 0.035, green: 0.025, blue: 0.055)]
        case .ocean:
            return [Color(red: 0.045, green: 0.18, blue: 0.24), Color(red: 0.015, green: 0.045, blue: 0.065)]
        case .ember:
            return [Color(red: 0.25, green: 0.11, blue: 0.075), Color(red: 0.06, green: 0.025, blue: 0.02)]
        case .photo:
            return [.black, Color(red: 0.04, green: 0.04, blue: 0.05)]
        }
    }

    private var glow: Color {
        switch theme {
        case .graphite: return accent
        case .violet: return Color(red: 0.76, green: 0.36, blue: 1.0)
        case .ocean: return Color(red: 0.18, green: 0.76, blue: 0.96)
        case .ember: return Color(red: 1.0, green: 0.48, blue: 0.22)
        case .photo: return .clear
        }
    }

    private var secondaryGlow: Color {
        switch theme {
        case .graphite: return .white
        case .violet: return Color(red: 0.95, green: 0.4, blue: 0.72)
        case .ocean: return Color(red: 0.24, green: 0.95, blue: 0.72)
        case .ember: return Color(red: 1.0, green: 0.78, blue: 0.35)
        case .photo: return .clear
        }
    }
}

private struct VitaMicroPattern: View {
    var body: some View {
        Canvas { context, size in
            let step: CGFloat = 14
            for y in stride(from: CGFloat(7), through: size.height, by: step) {
                for x in stride(from: CGFloat(7), through: size.width, by: step) {
                    let rect = CGRect(x: x, y: y, width: 1.35, height: 1.35)
                    context.fill(Path(ellipseIn: rect), with: .color(.white.opacity(0.045)))
                }
            }
        }
        .allowsHitTesting(false)
    }
}

private extension View {
    @ViewBuilder
    func vitaBackground(_ theme: VitaWidgetTheme, accent: Color) -> some View {
        if #available(iOS 17.0, *) {
            containerBackground(for: .widget) { VitaWidgetBackground(theme: theme, accent: accent) }
        } else {
            background(VitaWidgetBackground(theme: theme, accent: accent))
        }
    }

    func vitaPanel(cornerRadius: CGFloat = 14) -> some View {
        background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(Color.white.opacity(0.10), lineWidth: 0.7)
            )
    }
}

private struct VitaBrandMark: View {
    let section: String
    let accent: Color

    var body: some View {
        HStack(spacing: 5) {
            Text("⠿")
                .font(.caption.weight(.bold))
                .foregroundStyle(accent)
            Text("vita")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white.opacity(0.88))
            Text(section.uppercased())
                .font(.system(size: 8, weight: .semibold, design: .rounded))
                .tracking(0.7)
                .foregroundStyle(.white.opacity(0.38))
        }
    }
}

private struct VitaProgressBar: View {
    let value: Double
    let accent: Color

    var body: some View {
        GeometryReader { proxy in
            let clamped = min(max(value, 0), 1)
            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.10))
                if clamped > 0 {
                    Capsule()
                        .fill(LinearGradient(colors: [accent.opacity(0.72), accent], startPoint: .leading, endPoint: .trailing))
                        .frame(width: max(4, proxy.size.width * clamped))
                }
            }
        }
        .frame(height: 4)
    }
}

// MARK: - Dots grid (как vitadots.ru)

private struct VitaDot: View {
    let filled: Bool
    let ring: Bool
    let color: Color
    let size: CGFloat
    let style: VitaDotStyle

    @ViewBuilder
    var body: some View {
        switch style {
        case .goal, .circle:
            styled(Circle())
        case .soft:
            styled(RoundedRectangle(cornerRadius: size * 0.34, style: .continuous))
        case .square:
            styled(RoundedRectangle(cornerRadius: size * 0.1, style: .continuous))
        case .diamond:
            styled(RoundedRectangle(cornerRadius: size * 0.15, style: .continuous))
                .rotationEffect(.degrees(45))
                .scaleEffect(0.8)
        case .heart:
            styled(VitaHeartShape())
        case .star:
            styled(VitaStarShape())
        case .hex:
            styled(VitaHexShape())
        }
    }

    private func styled<S: Shape>(_ shape: S) -> some View {
        ZStack {
            shape
                .fill(
                    filled
                        ? AnyShapeStyle(LinearGradient(
                            colors: [color.opacity(0.78), color],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ))
                        : AnyShapeStyle(Color.black.opacity(0.16))
                )
            shape
                .stroke(
                    ring ? color : Color.white.opacity(filled ? 0.24 : 0.17),
                    lineWidth: ring ? max(1.5, size * 0.15) : max(0.75, size * 0.07)
                )
            if filled {
                shape
                    .fill(
                        LinearGradient(
                            colors: [.white.opacity(0.34), .clear, .clear],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .padding(size * 0.10)
                    .blendMode(.screen)
            }
        }
            .frame(width: size, height: size)
            .shadow(color: ring ? color.opacity(0.62) : (filled ? color.opacity(0.16) : .clear), radius: ring ? size * 0.34 : size * 0.14)
    }
}

private struct VitaHeartShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.midX, y: rect.maxY * 0.92))
        path.addCurve(
            to: CGPoint(x: rect.minX, y: rect.height * 0.34),
            control1: CGPoint(x: rect.width * 0.34, y: rect.height * 0.74),
            control2: CGPoint(x: rect.minX, y: rect.height * 0.56)
        )
        path.addCurve(
            to: CGPoint(x: rect.midX, y: rect.height * 0.25),
            control1: CGPoint(x: rect.minX, y: rect.height * 0.06),
            control2: CGPoint(x: rect.width * 0.34, y: rect.height * 0.02)
        )
        path.addCurve(
            to: CGPoint(x: rect.maxX, y: rect.height * 0.34),
            control1: CGPoint(x: rect.width * 0.66, y: rect.height * 0.02),
            control2: CGPoint(x: rect.maxX, y: rect.height * 0.06)
        )
        path.addCurve(
            to: CGPoint(x: rect.midX, y: rect.maxY * 0.92),
            control1: CGPoint(x: rect.maxX, y: rect.height * 0.56),
            control2: CGPoint(x: rect.width * 0.66, y: rect.height * 0.74)
        )
        path.closeSubpath()
        return path
    }
}

private struct VitaStarShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let center = CGPoint(x: rect.midX, y: rect.midY)
        let outer = min(rect.width, rect.height) / 2
        let inner = outer * 0.45
        for index in 0..<10 {
            let radius = index.isMultiple(of: 2) ? outer : inner
            let angle = -Double.pi / 2 + Double(index) * Double.pi / 5
            let point = CGPoint(
                x: center.x + CGFloat(cos(angle)) * radius,
                y: center.y + CGFloat(sin(angle)) * radius
            )
            if index == 0 {
                path.move(to: point)
            } else {
                path.addLine(to: point)
            }
        }
        path.closeSubpath()
        return path
    }
}

private struct VitaHexShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let points = [
            CGPoint(x: rect.midX, y: rect.minY),
            CGPoint(x: rect.maxX, y: rect.height * 0.25),
            CGPoint(x: rect.maxX, y: rect.height * 0.75),
            CGPoint(x: rect.midX, y: rect.maxY),
            CGPoint(x: rect.minX, y: rect.height * 0.75),
            CGPoint(x: rect.minX, y: rect.height * 0.25),
        ]
        path.move(to: points[0])
        points.dropFirst().forEach { path.addLine(to: $0) }
        path.closeSubpath()
        return path
    }
}

private struct VitaDotsGridView: View {
    let grid: VitaDotsGrid
    let accent: Color
    let dotSize: CGFloat
    let spacing: CGFloat
    let style: VitaDotStyle

    var body: some View {
        let cols = Array(repeating: GridItem(.flexible(), spacing: spacing), count: grid.columns)
        LazyVGrid(columns: cols, spacing: spacing) {
            ForEach(0..<grid.total, id: \.self) { i in
                let filled = i < grid.pastFilled || grid.markedIndices.contains(i)
                let ring = grid.todayIndex == i && !grid.markedIndices.contains(i)
                VitaDot(filled: filled, ring: ring, color: accent, size: dotSize, style: style)
            }
        }
    }
}

struct VitaMonthDotsWidgetView: View {
    @Environment(\.widgetFamily) private var family
    var entry: FocusEntry

    var body: some View {
        switch family {
        case .systemMedium:
            mediumBody
        case .systemLarge:
            largeBody
        default:
            smallBody
        }
    }

    private var smallBody: some View {
        VStack(alignment: .leading, spacing: 5) {
            VitaBrandMark(section: "точки", accent: entry.accent)
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text("\(currentDay)")
                    .font(.system(size: 28, weight: .bold, design: .rounded).monospacedDigit())
                    .foregroundStyle(.white)
                Text("/ \(entry.dots.total)")
                    .font(.caption.weight(.semibold).monospacedDigit())
                    .foregroundStyle(.white.opacity(0.42))
                Spacer(minLength: 0)
                Text(entry.dots.title)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.62))
                    .lineLimit(1)
            }
            VitaProgressBar(value: progress, accent: entry.accent)
            VitaDotsGridView(
                grid: entry.dots,
                accent: entry.accent,
                dotSize: entry.dots.total > 36 ? 6 : 6.8,
                spacing: 2,
                style: resolvedDotStyle
            )
            .frame(maxWidth: .infinity, alignment: .center)
            HStack(spacing: 5) {
                todayIndicator
                Text(shortFooter)
                    .font(.system(size: 9.5, weight: .medium, design: .rounded))
                    .foregroundStyle(.white.opacity(0.56))
                    .lineLimit(1)
            }
        }
        .padding(13)
        .vitaBackground(entry.widgetTheme, accent: entry.accent)
        .widgetURL(FocusDeepLinks.appHome)
    }

    private var mediumBody: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 5) {
                VitaBrandMark(section: "точки", accent: entry.accent)
                Text(entry.dots.title)
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    Text("\(currentDay)")
                        .font(.system(size: 31, weight: .bold, design: .rounded).monospacedDigit())
                        .foregroundStyle(.white)
                    Text("из \(entry.dots.total)")
                        .font(.caption.weight(.medium).monospacedDigit())
                        .foregroundStyle(.white.opacity(0.45))
                }
                VitaProgressBar(value: progress, accent: entry.accent)
                Spacer(minLength: 0)
                markTodayControl
            }
            .frame(width: 128, alignment: .leading)

            VStack(alignment: .leading, spacing: 7) {
                Text(shortFooter)
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(.white.opacity(0.55))
                    .lineLimit(1)
                VitaDotsGridView(
                    grid: entry.dots,
                    accent: entry.accent,
                    dotSize: 9,
                    spacing: 2.8,
                    style: resolvedDotStyle
                )
                .frame(maxWidth: .infinity, alignment: .center)
                Spacer(minLength: 0)
            }
            .padding(10)
            .vitaPanel()
        }
        .padding(13)
        .vitaBackground(entry.widgetTheme, accent: entry.accent)
        .widgetURL(FocusDeepLinks.appHome)
    }

    private var largeBody: some View {
        VStack(alignment: .leading, spacing: 9) {
            VitaBrandMark(section: "точки", accent: entry.accent)
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(entry.dots.title)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    Text(entry.dots.footer)
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.55))
                }
                Spacer()
                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    Text("\(currentDay)")
                        .font(.system(size: 34, weight: .bold, design: .rounded).monospacedDigit())
                        .foregroundStyle(.white)
                    Text("/\(entry.dots.total)")
                        .font(.caption.weight(.semibold).monospacedDigit())
                        .foregroundStyle(.white.opacity(0.42))
                }
            }
            VitaProgressBar(value: progress, accent: entry.accent)
            VitaDotsGridView(
                grid: entry.dots,
                accent: entry.accent,
                dotSize: 14,
                spacing: 6,
                style: resolvedDotStyle
            )
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.vertical, 10)
            .vitaPanel(cornerRadius: 18)
            HStack {
                markTodayControl
                Spacer()
                todayIndicator
                Text("сегодня")
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(.white.opacity(0.48))
            }
        }
        .padding(16)
        .vitaBackground(entry.widgetTheme, accent: entry.accent)
        .widgetURL(FocusDeepLinks.appHome)
    }

    private var currentDay: Int {
        if let today = entry.dots.todayIndex { return min(today + 1, entry.dots.total) }
        return min(max(entry.dots.pastFilled, 0), entry.dots.total)
    }

    private var progress: Double {
        Double(currentDay) / Double(max(entry.dots.total, 1))
    }

    private var resolvedDotStyle: VitaDotStyle {
        entry.dotStyle == .goal ? .circle : entry.dotStyle
    }

    private var shortFooter: String {
        entry.dots.footer.replacingOccurrences(of: "день ", with: "")
    }

    private var todayIndicator: some View {
        Circle()
            .fill(entry.accent)
            .frame(width: 6, height: 6)
            .shadow(color: entry.accent.opacity(0.65), radius: 3)
    }

    @ViewBuilder
    private var markTodayControl: some View {
        if #available(iOS 17.0, *) {
            if entry.dots.todayIndex != nil {
                Button(intent: MarkFocusDayIntent()) {
                    Label("Отметить сегодня", systemImage: "checkmark")
                        .font(.caption2.weight(.semibold))
                        .padding(.horizontal, 9)
                        .padding(.vertical, 6)
                        .background(entry.accent.opacity(0.16), in: Capsule())
                }
                .buttonStyle(.plain)
                .foregroundStyle(entry.accent)
            } else {
                Label(
                    entry.dots.pastFilled >= entry.dots.total ? "Цель завершена" : "Скоро старт",
                    systemImage: entry.dots.pastFilled >= entry.dots.total ? "flag.checkered" : "clock"
                )
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.white.opacity(0.48))
            }
        }
    }
}

struct VitaMonthDotsWidget: Widget {
    let kind = "VitaMonthDotsWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: LocalFocusProvider()) { entry in
            VitaMonthDotsWidgetView(entry: entry)
        }
        .configurationDisplayName("Vita · точки")
        .description("Месяц или цель — как на vitadots.ru. Тап «Отметить день» на iOS 17+.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
        .contentMarginsDisabled()
    }
}

// MARK: - Habit Tracker (данные общей цели vitadots.ru)

struct VitaHabitWidgetView: View {
    @Environment(\.widgetFamily) private var family
    var entry: FocusEntry

    var body: some View {
        Group {
            if let habit = entry.habit {
                habitBody(habit)
            } else {
                emptyBody
            }
        }
        .vitaBackground(entry.widgetTheme, accent: activeAccent)
        .widgetURL(entry.habit.flatMap { VitaHabitStore.goalURL(for: $0.code) }
            ?? URL(string: "https://vitadots.ru/goals"))
    }

    @ViewBuilder
    private func habitBody(_ habit: VitaHabitSnapshot) -> some View {
        switch family {
        case .systemMedium:
            mediumBody(habit)
        case .systemLarge:
            largeBody(habit)
        default:
            smallBody(habit)
        }
    }

    private func smallBody(_ habit: VitaHabitSnapshot) -> some View {
        let grid = habit.widgetGrid(for: entry.date, maxDots: 24)
        let color = habitColor(habit)
        return VStack(alignment: .leading, spacing: 4) {
            VitaBrandMark(section: "habit", accent: color)
            Text(habit.title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white)
                .lineLimit(1)
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text("\(habit.currentStreak(on: entry.date))")
                    .font(.system(size: 24, weight: .bold, design: .rounded).monospacedDigit())
                    .foregroundStyle(.white)
                Text("дней подряд")
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(.white.opacity(0.46))
            }
            VitaDotsGridView(
                grid: grid,
                accent: color,
                dotSize: 5.5,
                spacing: 1.8,
                style: dotStyle(for: habit)
            )
            .frame(maxWidth: .infinity, alignment: .center)
            HStack(spacing: 6) {
                Text("\(habit.doneSet.count)/\(habit.days)")
                    .font(.caption2.weight(.semibold).monospacedDigit())
                    .foregroundStyle(.white.opacity(0.52))
                Spacer(minLength: 0)
                markHabitControl(habit, compact: true)
            }
        }
        .padding(12)
    }

    private func mediumBody(_ habit: VitaHabitSnapshot) -> some View {
        let grid = habit.widgetGrid(for: entry.date, maxDots: 42)
        let color = habitColor(habit)
        return HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 7) {
                VitaBrandMark(section: "habit", accent: color)
                Text(habit.title)
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(.white)
                    .lineLimit(2)
                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    Text("\(habit.currentStreak(on: entry.date))")
                        .font(.system(size: 28, weight: .bold, design: .rounded).monospacedDigit())
                        .foregroundStyle(.white)
                    Text("дней подряд")
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(.white.opacity(0.44))
                }
                Spacer(minLength: 0)
                markHabitControl(habit)
            }
            .frame(width: 138, alignment: .leading)

            VStack(alignment: .leading, spacing: 7) {
                HStack {
                    Text("ПРОГРЕСС")
                        .font(.system(size: 8, weight: .bold, design: .rounded))
                        .tracking(0.7)
                        .foregroundStyle(.white.opacity(0.4))
                    Spacer()
                    Text("\(habit.doneSet.count)/\(habit.days)")
                        .font(.caption2.weight(.semibold).monospacedDigit())
                        .foregroundStyle(.white.opacity(0.64))
                }
                VitaDotsGridView(
                    grid: grid,
                    accent: color,
                    dotSize: 8.5,
                    spacing: 2.5,
                    style: dotStyle(for: habit)
                )
                .frame(maxWidth: .infinity, alignment: .center)
                Spacer(minLength: 0)
                VitaProgressBar(value: habitProgress(habit), accent: color)
            }
            .padding(10)
            .vitaPanel()
        }
        .padding(13)
    }

    private func largeBody(_ habit: VitaHabitSnapshot) -> some View {
        let grid = habit.widgetGrid(for: entry.date, maxDots: 90)
        let color = habitColor(habit)
        return VStack(alignment: .leading, spacing: 8) {
            VitaBrandMark(section: "habit", accent: color)
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(habit.title)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(.white)
                        .lineLimit(2)
                    if !habit.reward.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Label(habit.reward, systemImage: "gift.fill")
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.52))
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 12)
                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    Text("\(habit.currentStreak(on: entry.date))")
                        .font(.system(size: 34, weight: .bold, design: .rounded).monospacedDigit())
                        .foregroundStyle(.white)
                    Text("дн.")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.white.opacity(0.42))
                }
            }
            HStack(spacing: 8) {
                habitStat("\(habit.doneSet.count)/\(habit.days)", "выполнено", color: color)
                habitStat("\(habit.bestStreak())", "рекорд", color: color)
                habitStat("\(max(habit.peers, 1))", "вместе", color: color)
            }
            VitaDotsGridView(
                grid: grid,
                accent: color,
                dotSize: 8.5,
                spacing: 3,
                style: dotStyle(for: habit)
            )
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(10)
            .vitaPanel(cornerRadius: 18)
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("\(Int((habitProgress(habit) * 100).rounded()))% пути")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.white.opacity(0.56))
                    VitaProgressBar(value: habitProgress(habit), accent: color)
                        .frame(width: 112)
                }
                Spacer()
                markHabitControl(habit)
            }
        }
        .padding(16)
    }

    private var emptyBody: some View {
        VStack(alignment: .leading, spacing: 10) {
            VitaBrandMark(section: "habit", accent: entry.accent)
            ZStack {
                Circle().fill(entry.accent.opacity(0.15))
                Image(systemName: "point.3.connected.trianglepath.dotted")
                    .font(.title3)
                    .foregroundStyle(entry.accent)
            }
            .frame(width: 42, height: 42)
            Text("Подключи привычку")
                .font(.headline)
                .foregroundStyle(.white)
            Text("Открой Vita и выбери цель с vitadots.ru")
                .font(.caption)
                .foregroundStyle(.white.opacity(0.62))
                .lineLimit(3)
            Spacer(minLength: 0)
        }
        .padding(14)
    }

    private var activeAccent: Color {
        entry.habit.map(habitColor) ?? entry.accent
    }

    private func habitStat(_ value: String, _ label: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(value)
                .font(.headline.monospacedDigit())
                .foregroundStyle(.white)
            Text(label)
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.45))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .background(color.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Color.white.opacity(0.08), lineWidth: 0.6))
    }

    private func habitColor(_ habit: VitaHabitSnapshot) -> Color {
        Color(hex: habit.color) ?? Color(red: 0.66, green: 0.33, blue: 0.97)
    }

    private func dotStyle(for habit: VitaHabitSnapshot) -> VitaDotStyle {
        entry.dotStyle == .goal ? VitaDotStyle(goalShape: habit.shape) : entry.dotStyle
    }

    private func habitProgress(_ habit: VitaHabitSnapshot) -> Double {
        Double(habit.doneSet.count) / Double(max(habit.days, 1))
    }

    private func habitCanMarkToday(_ habit: VitaHabitSnapshot) -> Bool {
        guard let start = VitaHabitStore.parseISO(habit.start) else { return false }
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: entry.date)
        let first = calendar.startOfDay(for: start)
        let last = calendar.date(byAdding: .day, value: max(habit.days, 1) - 1, to: first) ?? first
        return today >= first && today <= last
    }

    private func habitUnavailableLabel(_ habit: VitaHabitSnapshot) -> (text: String, icon: String) {
        guard let start = VitaHabitStore.parseISO(habit.start) else {
            return ("Проверь цель", "exclamationmark.circle")
        }
        if Calendar.current.startOfDay(for: entry.date) < Calendar.current.startOfDay(for: start) {
            return ("Скоро старт", "clock")
        }
        return ("Цель завершена", "flag.checkered")
    }

    @ViewBuilder
    private func markHabitControl(_ habit: VitaHabitSnapshot, compact: Bool = false) -> some View {
        if #available(iOS 17.0, *) {
            if habitCanMarkToday(habit) {
                Button(intent: ToggleVitaHabitTodayIntent(code: habit.code)) {
                    if compact {
                        Image(systemName: habit.isDone(on: entry.date) ? "checkmark" : "plus")
                            .font(.caption2.weight(.bold))
                            .frame(width: 25, height: 25)
                            .background(habitColor(habit).opacity(habit.isDone(on: entry.date) ? 0.95 : 0.16), in: Circle())
                            .foregroundStyle(habit.isDone(on: entry.date) ? Color.black : habitColor(habit))
                    } else {
                        Label(
                            habit.isDone(on: entry.date) ? "Сегодня готово" : "Отметить сегодня",
                            systemImage: habit.isDone(on: entry.date) ? "checkmark" : "plus"
                        )
                        .font(.caption2.weight(.semibold))
                        .padding(.horizontal, 9)
                        .padding(.vertical, 6)
                        .background(habitColor(habit).opacity(0.16), in: Capsule())
                    }
                }
                .buttonStyle(.plain)
                .foregroundStyle(habitColor(habit))
            } else if compact {
                Image(systemName: habitUnavailableLabel(habit).icon)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.42))
                    .frame(width: 25, height: 25)
            } else {
                let unavailable = habitUnavailableLabel(habit)
                Label(unavailable.text, systemImage: unavailable.icon)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.46))
            }
        }
    }
}

struct VitaHabitWidget: Widget {
    let kind = "VitaHabitWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: HabitFocusProvider()) { entry in
            VitaHabitWidgetView(entry: entry)
        }
        .configurationDisplayName("Vita · привычка")
        .description("Та же цель, стрик и отметки, что на vitadots.ru и в живых обоях.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
        .contentMarginsDisabled()
    }
}

// MARK: - YouTube launcher

struct YouTubeFocusWidgetView: View {
    var entry: FocusEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            VitaBrandMark(section: "focus", accent: .red)
            ZStack {
                Circle()
                    .fill(Color.red.opacity(0.14))
                    .frame(width: 52, height: 52)
                Circle()
                    .fill(LinearGradient(
                        colors: [Color(red: 1, green: 0.16, blue: 0.18), Color(red: 0.70, green: 0.01, blue: 0.05)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ))
                    .frame(width: 42, height: 42)
                    .shadow(color: .red.opacity(0.38), radius: 12)
                Image(systemName: "play.fill")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(.white)
                    .offset(x: 2)
            }
            .frame(maxWidth: .infinity)
            Text("YouTube")
                .font(.headline.weight(.semibold))
                .foregroundStyle(.white)
            Spacer(minLength: 0)
            HStack(spacing: 5) {
                Circle()
                    .fill(entry.snapshot.blocksOn > 0 ? Color.white.opacity(0.55) : Color.orange)
                    .frame(width: 6, height: 6)
                Text(entry.snapshot.blocksOn > 0 ? "Фильтры · \(entry.snapshot.blocksOn)" : "Настрой фильтры")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.62))
                Spacer()
                Image(systemName: "safari.fill")
                    .font(.caption2)
                    .foregroundStyle(.white.opacity(0.54))
            }
        }
        .padding(12)
        .vitaBackground(entry.widgetTheme, accent: .red)
        .widgetURL(FocusDeepLinks.youtubeHome)
    }
}

struct YouTubeFocusWidget: Widget {
    let kind = "YouTubeFocusWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: LocalFocusProvider()) { entry in
            YouTubeFocusWidgetView(entry: entry)
        }
        .configurationDisplayName("YouTube Focus")
        .description("Главная YouTube в Safari с активным Vita Focus.")
        .supportedFamilies([.systemSmall])
        .contentMarginsDisabled()
    }
}

// MARK: - App Intent (iOS 17+)

#if canImport(AppIntents)
@available(iOS 17.0, *)
struct MarkFocusDayIntent: AppIntent {
    static var title: LocalizedStringResource = "Отметить день"
    static var description = IntentDescription("Закрашивает сегодняшнюю точку в виджете Vita.")

    func perform() async throws -> some IntentResult {
        VitaGoalDotsStore.toggleToday()
        WidgetCenter.shared.reloadTimelines(ofKind: "VitaMonthDotsWidget")
        return .result()
    }
}

@available(iOS 17.0, *)
struct ToggleVitaHabitTodayIntent: AppIntent {
    static var title: LocalizedStringResource = "Отметить привычку сегодня"
    static var description = IntentDescription("Обновляет эту же отметку на vitadots.ru, в виджете и живых обоях Vita.")

    @Parameter(title: "Код цели")
    var code: String

    init() {
        code = ""
    }

    init(code: String) {
        self.code = code
    }

    func perform() async throws -> some IntentResult {
        guard let requestedCode = VitaHabitStore.code(from: code),
              VitaHabitStore.activeCode == requestedCode else {
            WidgetCenter.shared.reloadTimelines(ofKind: "VitaHabitWidget")
            return .result()
        }
        let isDone = try await VitaHabitClient.toggleToday(code: requestedCode)
        guard VitaHabitStore.activeCode == requestedCode else { return .result() }
        if var cached = VitaHabitStore.loadSnapshot() {
            let today = VitaHabitStore.isoDay(.now)
            cached.done.removeAll { $0 == today }
            if isDone { cached.done.append(today) }
            cached.done.sort()
            cached.updatedAt = Date().timeIntervalSince1970
            VitaHabitStore.save(cached)
            WidgetCenter.shared.reloadTimelines(ofKind: "VitaHabitWidget")
        }
        if let fresh = try? await VitaHabitClient.fetch(code: requestedCode),
           VitaHabitStore.activeCode == requestedCode {
            VitaHabitStore.save(fresh)
            WidgetCenter.shared.reloadTimelines(ofKind: "VitaHabitWidget")
        }
        return .result()
    }
}
#endif

// MARK: - Bundle

@main
struct VitaFocusWidgetBundle: WidgetBundle {
    var body: some Widget {
        VitaMonthDotsWidget()
        VitaHabitWidget()
        YouTubeFocusWidget()
    }
}

// MARK: - Color helper

private extension Color {
    init?(hex: String) {
        var raw = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if raw.hasPrefix("#") { raw.removeFirst() }
        guard raw.count == 6, let value = UInt64(raw, radix: 16) else { return nil }
        let r = Double((value >> 16) & 0xff) / 255
        let g = Double((value >> 8) & 0xff) / 255
        let b = Double(value & 0xff) / 255
        self.init(red: r, green: g, blue: b)
    }
}
