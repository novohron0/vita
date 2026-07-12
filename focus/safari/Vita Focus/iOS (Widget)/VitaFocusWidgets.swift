import WidgetKit
import SwiftUI
#if canImport(AppIntents)
import AppIntents
#endif

// MARK: - Timeline

struct FocusEntry: TimelineEntry {
    let date: Date
    let snapshot: FocusSnapshot
    let dots: VitaDotsGrid
    let accent: Color
}

struct FocusProvider: TimelineProvider {
    func placeholder(in context: Context) -> FocusEntry {
        makeEntry(date: .now)
    }

    func getSnapshot(in context: Context, completion: @escaping (FocusEntry) -> Void) {
        completion(makeEntry(date: .now))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<FocusEntry>) -> Void) {
        let entry = makeEntry(date: .now)
        let next = Calendar.current.date(byAdding: .hour, value: 1, to: .now)
            ?? .now.addingTimeInterval(3600)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }

    private func makeEntry(date: Date) -> FocusEntry {
        let model = VitaGoalDotsStore.load()
        return FocusEntry(
            date: date,
            snapshot: FocusSnapshotStore.load(),
            dots: VitaGoalDotsStore.grid(for: date),
            accent: Color(hex: model.accentHex) ?? Color(red: 0.66, green: 0.33, blue: 0.97)
        )
    }
}

// MARK: - Shared styling

private struct VitaWidgetBackground: View {
    var body: some View {
        LinearGradient(
            colors: [
                Color(red: 0.11, green: 0.11, blue: 0.13),
                Color(red: 0.07, green: 0.07, blue: 0.09),
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

private extension View {
    @ViewBuilder
    func vitaBackground() -> some View {
        if #available(iOS 17.0, *) {
            containerBackground(for: .widget) { VitaWidgetBackground() }
        } else {
            background(VitaWidgetBackground())
        }
    }
}

private func statusLine(_ snap: FocusSnapshot) -> String {
    if snap.blocksOn > 0 { return "\(snap.blocksOn) блоков вкл" }
    return "Нажми — чистый YouTube"
}

// MARK: - Dots grid (как vitadots.ru)

private struct VitaDot: View {
    let filled: Bool
    let ring: Bool
    let color: Color
    let size: CGFloat

    var body: some View {
        Circle()
            .strokeBorder(ring ? color : Color.white.opacity(filled ? 0.45 : 0.22), lineWidth: ring ? max(1.5, size * 0.14) : max(1, size * 0.08))
            .background(
                Circle().fill(filled ? color.opacity(0.95) : Color.clear)
            )
            .frame(width: size, height: size)
            .shadow(color: ring ? color.opacity(0.45) : .clear, radius: ring ? size * 0.25 : 0)
    }
}

private struct VitaDotsGridView: View {
    let grid: VitaDotsGrid
    let accent: Color
    let dotSize: CGFloat
    let spacing: CGFloat

    var body: some View {
        let cols = Array(repeating: GridItem(.flexible(), spacing: spacing), count: grid.columns)
        LazyVGrid(columns: cols, spacing: spacing) {
            ForEach(0..<grid.total, id: \.self) { i in
                let filled = i < grid.pastFilled || grid.markedIndices.contains(i)
                let ring = grid.todayIndex == i && !grid.markedIndices.contains(i)
                VitaDot(filled: filled, ring: ring, color: accent, size: dotSize)
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
        VStack(alignment: .leading, spacing: 8) {
            header
            VitaDotsGridView(grid: entry.dots, accent: entry.accent, dotSize: 9, spacing: 4)
            Spacer(minLength: 0)
            Text(entry.dots.footer)
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.62))
        }
        .padding(14)
        .vitaBackground()
        .widgetURL(FocusDeepLinks.youtubeSubs)
    }

    private var mediumBody: some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                header
                Text(entry.dots.footer)
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.7))
                if entry.snapshot.blocksOn > 0 {
                    Text("\(entry.snapshot.blocksOn) блоков Safari")
                        .font(.caption2)
                        .foregroundStyle(.white.opacity(0.45))
                }
                Spacer(minLength: 0)
                markTodayControl
            }
            .frame(width: 118, alignment: .leading)
            VitaDotsGridView(grid: entry.dots, accent: entry.accent, dotSize: 11, spacing: 5)
        }
        .padding(14)
        .vitaBackground()
        .widgetURL(FocusDeepLinks.youtubeSubs)
    }

    private var largeBody: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            Text(entry.dots.footer)
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.72))
            VitaDotsGridView(grid: entry.dots, accent: entry.accent, dotSize: 14, spacing: 7)
            Spacer(minLength: 0)
            HStack {
                markTodayControl
                Spacer()
                if entry.snapshot.blocksOn > 0 {
                    Text("Safari · \(entry.snapshot.blocksOn) блоков")
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.45))
                }
            }
        }
        .padding(16)
        .vitaBackground()
        .widgetURL(FocusDeepLinks.youtubeSubs)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("vita")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white.opacity(0.5))
            Text(entry.dots.title)
                .font(.headline)
                .foregroundStyle(.white)
                .lineLimit(1)
        }
    }

    @ViewBuilder
    private var markTodayControl: some View {
        if #available(iOS 17.0, *) {
            Button(intent: MarkFocusDayIntent()) {
                Label("Отметить день", systemImage: "checkmark.circle")
                    .font(.caption.weight(.medium))
            }
            .buttonStyle(.plain)
            .foregroundStyle(entry.accent)
        }
    }
}

struct VitaMonthDotsWidget: Widget {
    let kind = "VitaMonthDotsWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: FocusProvider()) { entry in
            VitaMonthDotsWidgetView(entry: entry)
        }
        .configurationDisplayName("Vita · точки")
        .description("Месяц или цель — как на vitadots.ru. Тап «Отметить день» на iOS 17+.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

// MARK: - Legacy / utility widgets

struct YouTubeFocusWidgetView: View {
    var entry: FocusEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("vita")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.55))
                Spacer()
                Text("YT")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.red.opacity(0.9))
            }
            Text("YouTube Focus")
                .font(.headline)
                .foregroundStyle(.white)
            Text(statusLine(entry.snapshot))
                .font(.caption)
                .foregroundStyle(.white.opacity(0.65))
                .lineLimit(2)
        }
        .padding(14)
        .vitaBackground()
        .widgetURL(FocusDeepLinks.youtubeSubs)
    }
}

struct YouTubeFocusWidget: Widget {
    let kind = "YouTubeFocusWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: FocusProvider()) { entry in
            YouTubeFocusWidgetView(entry: entry)
        }
        .configurationDisplayName("YouTube Focus")
        .description("Подписки в Safari без Shorts.")
        .supportedFamilies([.systemSmall])
    }
}

struct FocusStatusWidgetView: View {
    var entry: FocusEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("vita focus")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white.opacity(0.55))
            Text("\(max(entry.snapshot.blocksOn, 0))")
                .font(.system(size: 34, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
            Text(statusLine(entry.snapshot))
                .font(.caption)
                .foregroundStyle(.white.opacity(0.7))
            Spacer(minLength: 0)
        }
        .padding(14)
        .vitaBackground()
        .widgetURL(FocusDeepLinks.youtubeSubs)
    }
}

struct FocusStatusWidget: Widget {
    let kind = "FocusStatusWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: FocusProvider()) { entry in
            FocusStatusWidgetView(entry: entry)
        }
        .configurationDisplayName("Статус Focus")
        .description("Сколько блоков активно.")
        .supportedFamilies([.systemSmall])
    }
}

struct QuickLaunchWidgetView: View {
    var entry: FocusEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("vita focus")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white.opacity(0.55))
            HStack(spacing: 10) {
                launchTile(url: FocusDeepLinks.youtubeSubs, title: "YouTube")
                launchTile(url: FocusDeepLinks.instagram, title: "Instagram")
                launchTile(url: FocusDeepLinks.x, title: "X")
            }
        }
        .padding(14)
        .vitaBackground()
    }

    @ViewBuilder
    private func launchTile(url: URL, title: String) -> some View {
        Link(destination: url) {
            Text(title)
                .font(.caption2.weight(.medium))
                .foregroundStyle(.white.opacity(0.9))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(Color.white.opacity(0.1), in: RoundedRectangle(cornerRadius: 10))
        }
    }
}

struct QuickLaunchWidget: Widget {
    let kind = "QuickLaunchWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: FocusProvider()) { entry in
            QuickLaunchWidgetView(entry: entry)
        }
        .configurationDisplayName("Быстрый запуск")
        .description("YouTube, Instagram, X в Safari.")
        .supportedFamilies([.systemMedium])
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
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}
#endif

// MARK: - Bundle

@main
struct VitaFocusWidgetBundle: WidgetBundle {
    var body: some Widget {
        VitaMonthDotsWidget()
        YouTubeFocusWidget()
        FocusStatusWidget()
        QuickLaunchWidget()
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
