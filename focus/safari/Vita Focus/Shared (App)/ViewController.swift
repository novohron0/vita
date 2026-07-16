//
//  ViewController.swift
//  Shared (App)
//
//  Created by Камиль Имангулов on 10.07.2026.
//

import WebKit
import SafariServices

#if os(iOS)
import UIKit
import WidgetKit
typealias PlatformViewController = UIViewController
#elseif os(macOS)
import Cocoa
typealias PlatformViewController = NSViewController
#endif

let extensionBundleIdentifier = "ru.vitadots.focus.Extension"

class ViewController: PlatformViewController, WKNavigationDelegate, WKScriptMessageHandler {

    @IBOutlet var webView: WKWebView!
#if os(iOS)
    private var habitObserver: NSObjectProtocol?
#endif

    override func viewDidLoad() {
        super.viewDidLoad()
#if os(iOS)
        VitaGoalDotsStore.ensureDefaults()
        habitObserver = NotificationCenter.default.addObserver(
            forName: .vitaActiveHabitChanged,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            self.refreshActiveHabit(in: self.webView, successStatus: "Цель открыта из vitadots.ru")
        }
#endif

        self.webView.navigationDelegate = self

#if os(iOS)
        self.webView.scrollView.isScrollEnabled = true
        self.webView.scrollView.alwaysBounceVertical = true
#endif

        self.webView.configuration.userContentController.add(self, name: "controller")

        self.webView.loadFileURL(Bundle.main.url(forResource: "Main", withExtension: "html")!, allowingReadAccessTo: Bundle.main.resourceURL!)
    }

    deinit {
#if os(iOS)
        if let habitObserver {
            NotificationCenter.default.removeObserver(habitObserver)
        }
#endif
    }

#if os(iOS)
    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        refreshExtensionState(in: webView)
    }
#endif

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
#if os(iOS)
        refreshExtensionState(in: webView)
        pushHabitState(to: webView, isRefreshing: VitaHabitStore.activeCode != nil)
        pushGoalDotsState(to: webView)
        pushWidgetTheme(to: webView)
        refreshActiveHabit(in: webView)
#elseif os(macOS)
        webView.evaluateJavaScript("show('mac')")

        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: extensionBundleIdentifier) { (state, error) in
            guard let state = state, error == nil else {
                // Insert code to inform the user that something went wrong.
                return
            }

            DispatchQueue.main.async {
                if #available(macOS 13, *) {
                    webView.evaluateJavaScript("show('mac', \(state.isEnabled), true)")
                } else {
                    webView.evaluateJavaScript("show('mac', \(state.isEnabled), false)")
                }
            }
        }
#endif
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
#if os(iOS)
        if let body = message.body as? String {
            if body == "open-youtube" {
                FocusDeepLinks.openURL(FocusDeepLinks.youtubeHome)
                return
            }
            if body == "open-settings" {
                openSafariExtensionSettings()
                return
            }
            if body == "open-goals" {
                FocusDeepLinks.openURL(URL(string: "https://vitadots.ru/goals")!)
                return
            }
            if body == "open-active-habit" {
                if let code = VitaHabitStore.activeCode,
                   let url = VitaHabitStore.goalURL(for: code) {
                    FocusDeepLinks.openURL(url)
                }
                return
            }
            if body == "refresh-habit" {
                refreshActiveHabit(in: webView)
                return
            }
            if body == "disconnect-habit" {
                VitaHabitStore.disconnect()
                WidgetCenter.shared.reloadTimelines(ofKind: "VitaHabitWidget")
                pushHabitState(to: webView, status: "Привычка отключена")
                return
            }
        }
        if let payload = message.body as? [String: Any],
           let action = payload["action"] as? String {
            if action == "connect-habit" {
                connectHabit(payload["value"] as? String ?? "", in: webView)
                return
            }
            if action == "configure-goal-dots" {
                saveGoalDots(
                    modeRaw: payload["mode"] as? String ?? "",
                    start: payload["goalStart"] as? String ?? "",
                    end: payload["goalEnd"] as? String ?? "",
                    in: webView
                )
                return
            }
            if action == "set-widget-theme" {
                saveWidgetTheme(payload["theme"] as? String ?? "", in: webView)
                return
            }
            if action == "set-dot-style" {
                saveDotStyle(payload["style"] as? String ?? "", in: webView)
                return
            }
            if action == "pick-widget-photo" {
                pickWidgetPhoto()
                return
            }
        }
#elseif os(macOS)
        if (message.body as! String != "open-preferences") {
            return
        }

        SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { error in
            guard error == nil else {
                return
            }

            DispatchQueue.main.async {
                NSApp.terminate(self)
            }
        }
#endif
    }

#if os(iOS)
    private func refreshExtensionState(in webView: WKWebView) {
        queryExtensionEnabled { enabled in
            DispatchQueue.main.async {
                if let enabled {
                    webView.evaluateJavaScript("show('ios', \(enabled))")
                } else {
                    webView.evaluateJavaScript("show('ios')")
                }
                self.pushDiagnostics(to: webView, extensionEnabled: enabled)
            }
        }
    }

    /// iOS 26.2+: `getStateOfExtension`. Старше — API нет, вернёт nil.
    private func queryExtensionEnabled(completion: @escaping (Bool?) -> Void) {
        if #available(iOS 26.2, *) {
            SFSafariExtensionManager.getStateOfExtension(withIdentifier: extensionBundleIdentifier) { state, _ in
                completion(state?.isEnabled)
            }
        } else {
            completion(nil)
        }
    }

    private func pushDiagnostics(to webView: WKWebView, extensionEnabled: Bool?) {
        let report = FocusDiagnostics.makeReport(extensionEnabled: extensionEnabled)
        let lines = report.lines.map { $0.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "'", with: "\\'") }
        let js = "showDiagnostics(['\(lines.joined(separator: "','"))'])"
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    private func connectHabit(_ raw: String, in webView: WKWebView) {
        do {
            _ = try VitaHabitStore.activate(raw)
            pushHabitState(to: webView, status: "Подключаем к vitadots.ru…", isRefreshing: true)
            refreshActiveHabit(in: webView, successStatus: "Готово — сайт, виджет и обои используют одну цель")
        } catch {
            pushHabitState(to: webView, status: error.localizedDescription, isError: true)
        }
    }

    private func refreshActiveHabit(in webView: WKWebView, successStatus: String? = nil) {
        guard let code = VitaHabitStore.activeCode else {
            pushHabitState(to: webView)
            return
        }
        pushHabitState(to: webView, isRefreshing: true)
        Task { [weak self, weak webView] in
            do {
                let snapshot = try await VitaHabitClient.fetch(code: code)
                guard VitaHabitStore.activeCode == code else { return }
                VitaHabitStore.save(snapshot)
                await MainActor.run {
                    guard let self, let webView,
                          VitaHabitStore.activeCode == code else { return }
                    WidgetCenter.shared.reloadTimelines(ofKind: "VitaHabitWidget")
                    self.pushHabitState(to: webView, status: successStatus)
                }
            } catch {
                await MainActor.run {
                    guard let self, let webView,
                          VitaHabitStore.activeCode == code else { return }
                    let cached = VitaHabitStore.loadSnapshot() != nil
                    self.pushHabitState(
                        to: webView,
                        status: cached ? "Нет связи — показаны сохранённые данные" : error.localizedDescription,
                        isError: !cached
                    )
                }
            }
        }
    }

    private func pushHabitState(
        to webView: WKWebView,
        status: String? = nil,
        isError: Bool = false,
        isRefreshing: Bool = false
    ) {
        let code = VitaHabitStore.activeCode
        let snapshot = VitaHabitStore.loadSnapshot()
        var payload: [String: Any] = [
            "connected": code != nil,
            "hasData": snapshot != nil,
            "code": code ?? "",
            "refreshing": isRefreshing,
        ]
        if let snapshot {
            payload["title"] = snapshot.title
            payload["days"] = snapshot.days
            payload["done"] = snapshot.doneSet.count
            payload["streak"] = snapshot.currentStreak()
            payload["best"] = snapshot.bestStreak()
            payload["color"] = snapshot.color
            payload["goalURL"] = VitaHabitStore.goalURL(for: snapshot.code)?.absoluteString ?? ""
        }
        if let status {
            payload["status"] = status
            payload["isError"] = isError
        }
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("showHabitState(\(json))", completionHandler: nil)
    }

    private func saveGoalDots(modeRaw: String, start: String, end: String, in webView: WKWebView) {
        guard let mode = VitaGoalMode(rawValue: modeRaw) else {
            pushGoalDotsState(to: webView, status: "Неизвестный режим", isError: true)
            return
        }
        do {
            _ = try VitaGoalDotsStore.configure(mode: mode, goalStart: start, goalEnd: end)
            WidgetCenter.shared.reloadTimelines(ofKind: "VitaMonthDotsWidget")
            pushGoalDotsState(to: webView, status: "Виджет обновлён")
        } catch {
            pushGoalDotsState(
                to: webView,
                status: error.localizedDescription,
                isError: true,
                draft: (mode.rawValue, start, end)
            )
        }
    }

    private func pushGoalDotsState(
        to webView: WKWebView,
        status: String? = nil,
        isError: Bool = false,
        draft: (mode: String, start: String, end: String)? = nil
    ) {
        let model = VitaGoalDotsStore.load()
        let dates = VitaGoalDotsStore.editorDates(for: model)
        var payload: [String: Any] = [
            "mode": draft?.mode ?? model.mode.rawValue,
            "start": draft?.start ?? dates.start,
            "end": draft?.end ?? dates.end,
        ]
        if let status {
            payload["status"] = status
            payload["isError"] = isError
        }
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("showGoalDotsState(\(json))", completionHandler: nil)
    }

    private func saveWidgetTheme(_ raw: String, in webView: WKWebView) {
        if raw == VitaWidgetTheme.photo.rawValue && !VitaWidgetThemeStore.hasPhoto {
            pickWidgetPhoto()
            return
        }
        guard let theme = VitaWidgetThemeStore.save(rawValue: raw) else {
            pushWidgetTheme(to: webView, status: "Неизвестная тема", isError: true)
            return
        }
        WidgetCenter.shared.reloadAllTimelines()
        pushWidgetTheme(to: webView, status: "Тема применена", theme: theme)
    }

    private func saveDotStyle(_ raw: String, in webView: WKWebView) {
        guard VitaDotStyleStore.save(rawValue: raw) != nil else {
            pushWidgetTheme(to: webView, status: "Неизвестная форма точек", isError: true)
            return
        }
        WidgetCenter.shared.reloadAllTimelines()
        pushWidgetTheme(to: webView, status: "Форма точек применена")
    }

    private func pickWidgetPhoto() {
        guard UIImagePickerController.isSourceTypeAvailable(.photoLibrary) else {
            pushWidgetTheme(to: webView, status: "Фото недоступны", isError: true)
            return
        }
        let picker = UIImagePickerController()
        picker.sourceType = .photoLibrary
        picker.delegate = self
        present(picker, animated: true)
    }

    private func pushWidgetTheme(
        to webView: WKWebView,
        status: String? = nil,
        isError: Bool = false,
        theme: VitaWidgetTheme? = nil
    ) {
        var payload: [String: Any] = [
            "theme": (theme ?? VitaWidgetThemeStore.load()).rawValue,
            "dotStyle": VitaDotStyleStore.load().rawValue,
            "hasPhoto": VitaWidgetThemeStore.hasPhoto,
        ]
        if let status {
            payload["status"] = status
            payload["isError"] = isError
        }
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("showWidgetTheme(\(json))", completionHandler: nil)
    }

    private func openSafariExtensionSettings() {
        let deepLinks = [
            "settings-navigation://com.apple.Settings.Apps/com.apple.mobilesafari/WEB_EXTENSIONS",
            "settings-navigation://com.apple.Settings.Apps/com.apple.mobilesafari/Extensions",
            "App-Prefs:com.apple.mobilesafari/WEB_EXTENSIONS",
            "App-Prefs:com.apple.mobilesafari/Extensions",
            "App-Prefs:com.apple.mobilesafari&path=WEB_EXTENSIONS",
            "App-Prefs:com.apple.mobilesafari&path=Extensions",
            "prefs:root=SAFARI&path=WEB_EXTENSIONS",
            "prefs:root=SAFARI&path=Extensions",
            "App-Prefs:root=SAFARI&path=WEB_EXTENSIONS",
        ]
        tryOpenSettingsURLs(deepLinks) { opened in
            if opened { return }
            self.tryOpenSettingsURLs(["App-Prefs:com.apple.mobilesafari"]) { _ in
                self.showExtensionsHint()
            }
        }
    }

    private func showExtensionsHint() {
        let alert = UIAlertController(
            title: "Где включить расширение",
            message: "Настройки → Приложения → Safari → Расширения → Vita Focus → ВКЛ + «Разрешить на всех сайтах».\n\nИли прямо в Safari: кнопка ⋯ (или «АА») в адресной строке → «Управлять расширениями».",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }

    private func tryOpenSettingsURLs(_ urls: [String], done: ((Bool) -> Void)? = nil) {
        tryOpenSettingsURLs(urls, index: 0, done: done)
    }

    private func tryOpenSettingsURLs(_ urls: [String], index: Int, done: ((Bool) -> Void)?) {
        guard index < urls.count else {
            done?(false)
            return
        }
        let next = urls[index]
        guard let url = URL(string: next) else {
            tryOpenSettingsURLs(urls, index: index + 1, done: done)
            return
        }
        UIApplication.shared.open(url, options: [:]) { ok in
            if ok {
                done?(true)
            } else {
                self.tryOpenSettingsURLs(urls, index: index + 1, done: done)
            }
        }
    }
#endif

}

#if os(iOS)
extension ViewController: UIImagePickerControllerDelegate, UINavigationControllerDelegate {
    func imagePickerController(
        _ picker: UIImagePickerController,
        didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
    ) {
        picker.dismiss(animated: true)
        guard let image = info[.originalImage] as? UIImage,
              let data = widgetPhotoData(image) else {
            pushWidgetTheme(to: webView, status: "Не удалось обработать фото", isError: true)
            return
        }
        do {
            try VitaWidgetThemeStore.savePhotoData(data)
            WidgetCenter.shared.reloadAllTimelines()
            pushWidgetTheme(to: webView, status: "Фото установлено", theme: .photo)
        } catch {
            pushWidgetTheme(to: webView, status: "Не удалось сохранить фото", isError: true)
        }
    }

    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        picker.dismiss(animated: true)
    }

    private func widgetPhotoData(_ image: UIImage) -> Data? {
        let maxSide: CGFloat = 1600
        let sourceMax = max(image.size.width, image.size.height)
        let scale = sourceMax > maxSide ? maxSide / sourceMax : 1
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let rendered = UIGraphicsImageRenderer(size: size).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
        return rendered.jpegData(compressionQuality: 0.84)
    }
}
#endif
