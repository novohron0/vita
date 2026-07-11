import WidgetKit
import SwiftUI

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
        let next = Calendar.current.date(byAdding: .minute, value: 30, to: .now) ?? .now.addingTimeInterval(1800)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

private struct VitaWidgetBackground: View {
    var body: some View {
        LinearGradient(
            colors: [Color(red: 0.11, green: 0.11, blue: 0.13), Color(red: 0.07, green: 0.07, blue: 0.09)],
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

@main
struct VitaFocusWidgetBundle: WidgetBundle {
    var body: some Widget {
        YouTubeFocusWidget()
        FocusStatusWidget()
        QuickLaunchWidget()
    }
}
