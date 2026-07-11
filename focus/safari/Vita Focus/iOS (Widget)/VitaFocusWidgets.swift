import WidgetKit
import SwiftUI

// MARK: - Timeline

struct FocusEntry: TimelineEntry {
    let date: Date
    let snapshot: FocusSnapshot
}

struct FocusProvider: TimelineProvider {
    func placeholder(in context: Context) -> FocusEntry {
        FocusEntry(date: .now, snapshot: .empty)
    }

    func getSnapshot(in context: Context, completion: @escaping (FocusEntry) -> Void) {
        completion(FocusEntry(date: .now, snapshot: FocusSnapshotStore.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<FocusEntry>) -> Void) {
        let entry = FocusEntry(date: .now, snapshot: FocusSnapshotStore.load())
        let next = Calendar.current.date(byAdding: .minute, value: 15, to: .now) ?? .now.addingTimeInterval(900)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

// MARK: - Style

private struct VitaWidgetBackground: View {
    var body: some View {
        LinearGradient(
            colors: [Color(red: 0.11, green: 0.11, blue: 0.13), Color(red: 0.07, green: 0.07, blue: 0.09)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

private func statusLine(_ snap: FocusSnapshot) -> String {
    if snap.blocksOn == 0 { return "Блоки выключены" }
    if snap.scheduleEnabled && !snap.scheduleActive {
        return "Вне расписания"
    }
    return "\(snap.blocksOn) блоков вкл"
}

// MARK: - Small — YouTube

struct YouTubeFocusWidgetView: View {
    var entry: FocusEntry

    var body: some View {
        Link(destination: FocusDeepLinks.youtubeSubs) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("⠿")
                        .font(.title2)
                    Spacer()
                    Text("▶")
                        .font(.title3)
                        .foregroundStyle(.red.opacity(0.9))
                }
                Text("YouTube")
                    .font(.headline)
                    .foregroundStyle(.white)
                Text(statusLine(entry.snapshot))
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.65))
                    .lineLimit(2)
            }
            .padding(14)
        }
        .containerBackground(for: .widget) { VitaWidgetBackground() }
    }
}

struct YouTubeFocusWidget: Widget {
    let kind = "YouTubeFocusWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: FocusProvider()) { entry in
            YouTubeFocusWidgetView(entry: entry)
        }
        .configurationDisplayName("YouTube Focus")
        .description("Подписки без Shorts и ленты — в Safari.")
        .supportedFamilies([.systemSmall])
    }
}

// MARK: - Small — Status

struct FocusStatusWidgetView: View {
    var entry: FocusEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("⠿ vita focus")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white.opacity(0.55))
            Text("\(entry.snapshot.blocksOn)")
                .font(.system(size: 36, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
            Text(statusLine(entry.snapshot))
                .font(.caption)
                .foregroundStyle(.white.opacity(0.7))
            if entry.snapshot.scheduleEnabled {
                Text("Расписание \(entry.snapshot.scheduleStart):00–\(entry.snapshot.scheduleEnd):00")
                    .font(.caption2)
                    .foregroundStyle(.white.opacity(0.45))
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .containerBackground(for: .widget) { VitaWidgetBackground() }
    }
}

struct FocusStatusWidget: Widget {
    let kind = "FocusStatusWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: FocusProvider()) { entry in
            FocusStatusWidgetView(entry: entry)
        }
        .configurationDisplayName("Статус Focus")
        .description("Сколько блоков сейчас активно.")
        .supportedFamilies([.systemSmall])
    }
}

// MARK: - Medium — Quick launch

struct QuickLaunchWidgetView: View {
    var entry: FocusEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("⠿ vita focus")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.55))
                Spacer()
                Text(statusLine(entry.snapshot))
                    .font(.caption2)
                    .foregroundStyle(.white.opacity(0.5))
            }
            HStack(spacing: 10) {
                launchTile(url: FocusDeepLinks.youtubeSubs, glyph: "▶", title: "YouTube", tint: .red)
                launchTile(url: FocusDeepLinks.instagram, glyph: "📷", title: "Instagram", tint: .purple)
                launchTile(url: FocusDeepLinks.x, glyph: "𝕏", title: "X", tint: .white)
            }
        }
        .padding(14)
        .containerBackground(for: .widget) { VitaWidgetBackground() }
    }

    @ViewBuilder
    private func launchTile(url: URL, glyph: String, title: String, tint: Color) -> some View {
        Link(destination: url) {
            VStack(spacing: 6) {
                Text(glyph)
                    .font(.title2)
                    .foregroundStyle(tint.opacity(0.95))
                Text(title)
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(.white.opacity(0.85))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
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
        .description("YouTube, Instagram, X — расширение применит блоки.")
        .supportedFamilies([.systemMedium])
    }
}

// MARK: - Bundle

@main
struct VitaFocusWidgetBundle: WidgetBundle {
    var body: some Widget {
        YouTubeFocusWidget()
        FocusStatusWidget()
        QuickLaunchWidget()
    }
}
