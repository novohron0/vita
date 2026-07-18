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
    private enum PhotoPickerPurpose {
        case widgetPhoto
        case profileAvatar
    }

    private var habitObserver: NSObjectProtocol?
    private var appActiveObserver: NSObjectProtocol?
    private var impulseObserver: NSObjectProtocol?
    private var webContentReady = false
    private var appInterfaceStyle: UIUserInterfaceStyle = .unspecified
    private var photoPickerPurpose = PhotoPickerPurpose.widgetPhoto
    private var profileBundle: VitaProfileBundle?
    private var profileRequestInFlight = false
    private var allowsProfileBootstrap = true

    override var preferredStatusBarStyle: UIStatusBarStyle {
        switch appInterfaceStyle {
        case .dark: return .lightContent
        case .light: return .darkContent
        default: return .default
        }
    }
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
            guard let self, self.webContentReady else { return }
            self.refreshActiveHabit(in: self.webView, successStatus: "Цель подключена")
            _ = FocusDeepLinks.consumeGoalHighlight()
            self.highlightGoals(in: self.webView)
        }
        impulseObserver = NotificationCenter.default.addObserver(
            forName: .vitaImpulseActionRequested,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            guard let self, self.webContentReady else { return }
            self.pushImpulseState(to: self.webView)
        }
        appActiveObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            self.refreshExtensionState(in: self.webView)
            self.refreshActiveHabit(in: self.webView)
            self.pushImpulseState(to: self.webView)
            self.pushProfileState(to: self.webView)
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
        if let appActiveObserver {
            NotificationCenter.default.removeObserver(appActiveObserver)
        }
        if let impulseObserver {
            NotificationCenter.default.removeObserver(impulseObserver)
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
        pushAppVersion(to: webView)
#if os(iOS)
        webContentReady = true
        refreshExtensionState(in: webView)
        pushHabitState(to: webView, isRefreshing: VitaHabitStore.activeCode != nil)
        pushGoalDotsState(to: webView)
        pushWidgetTheme(to: webView)
        pushImpulseState(to: webView)
        pushProfileState(
            to: webView,
            status: VitaProfileStore.code == nil ? "Создаём твой аккаунт…" : "Обновляем профиль…"
        )
        bootstrapProfile(in: webView)
        refreshActiveHabit(in: webView)
        if FocusDeepLinks.consumeGoalHighlight() {
            highlightGoals(in: webView)
        }
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

    private func pushAppVersion(to webView: WKWebView) {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "—"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "—"
        let label = "Версия \(version) (\(build))"
        guard let data = try? JSONSerialization.data(withJSONObject: label, options: [.fragmentsAllowed]),
              let json = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("showAppVersion(\(json))", completionHandler: nil)
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
                pushHabitState(to: webView, status: "Цель отключена")
                return
            }
        }
        if let payload = message.body as? [String: Any],
           let action = payload["action"] as? String {
            if action == "set-app-appearance" {
                setAppAppearance(payload["mode"] as? String ?? "system")
                return
            }
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
            if action == "set-dot-color" {
                saveDotColor(
                    payload["color"] as? String ?? "",
                    rememberCustom: payload["custom"] as? Bool ?? false,
                    in: webView
                )
                return
            }
            if action == "pick-widget-photo" {
                pickWidgetPhoto()
                return
            }
            if action == "pick-profile-avatar" {
                pickProfileAvatar()
                return
            }
            if action == "save-impulse" {
                saveImpulse(
                    id: payload["id"] as? String,
                    title: payload["title"] as? String ?? "",
                    notes: payload["notes"] as? String ?? "",
                    reason: payload["reason"] as? String ?? "",
                    firstStep: payload["firstStep"] as? String ?? "",
                    fireDateRaw: payload["fireDate"] as? String ?? "",
                    deadlineRaw: payload["deadline"] as? String ?? "",
                    deadlineAlertRaw: payload["deadlineAlertDate"] as? String ?? "",
                    folderID: payload["folderID"] as? String,
                    usesAlarm: payload["usesAlarm"] as? Bool ?? false,
                    priorityRaw: payload["priority"] as? String ?? "none",
                    repeatRaw: payload["repeatRule"] as? String ?? "none",
                    in: webView
                )
                return
            }
            if action == "create-impulse-folder" {
                createImpulseFolder(payload["name"] as? String ?? "", in: webView)
                return
            }
            if action == "rename-impulse-folder" {
                renameImpulseFolder(
                    payload["folderID"] as? String ?? "",
                    name: payload["name"] as? String ?? "",
                    in: webView
                )
                return
            }
            if action == "delete-impulse-folder" {
                deleteImpulseFolder(payload["folderID"] as? String ?? "", in: webView)
                return
            }
            if action == "accept-impulse" {
                acceptImpulse(payload["id"] as? String ?? "", in: webView)
                return
            }
            if action == "snooze-impulse" {
                snoozeImpulse(
                    payload["id"] as? String ?? "",
                    untilRaw: payload["until"] as? String ?? "",
                    in: webView
                )
                return
            }
            if action == "complete-impulse" {
                completeImpulse(payload["id"] as? String ?? "", in: webView)
                return
            }
            if action == "delete-impulse" {
                deleteImpulse(payload["id"] as? String ?? "", in: webView)
                return
            }
            if action == "connect-profile" {
                connectProfile(payload["code"] as? String ?? "", in: webView)
                return
            }
            if action == "save-profile" {
                saveProfile(
                    handle: payload["handle"] as? String ?? "",
                    name: payload["name"] as? String ?? "",
                    bio: payload["bio"] as? String ?? "",
                    in: webView
                )
                return
            }
            if action == "disconnect-profile" {
                profileBundle = nil
                allowsProfileBootstrap = false
                VitaProfileStore.disconnect()
                pushProfileState(to: webView, status: "Аккаунт отключён на этом устройстве")
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
    private func setAppAppearance(_ mode: String) {
        switch mode {
        case "light": appInterfaceStyle = .light
        case "dark": appInterfaceStyle = .dark
        default: appInterfaceStyle = .unspecified
        }
        view.overrideUserInterfaceStyle = appInterfaceStyle
        view.window?.overrideUserInterfaceStyle = appInterfaceStyle
        setNeedsStatusBarAppearanceUpdate()
    }

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
        guard let code = VitaHabitStore.code(from: raw) else {
            pushHabitState(
                to: webView,
                status: VitaHabitError.invalidCode.localizedDescription,
                isError: true
            )
            return
        }
        pushHabitState(to: webView, status: "Подключаем…", isRefreshing: true)
        Task { [weak self, weak webView] in
            do {
                let snapshot = try await VitaHabitClient.fetch(code: code)
                await MainActor.run {
                    guard let self, let webView else { return }
                    do {
                        _ = try VitaHabitStore.activate(code)
                        VitaHabitStore.save(snapshot)
                        WidgetCenter.shared.reloadTimelines(ofKind: "VitaHabitWidget")
                        self.pushHabitState(to: webView, status: "Цель подключена")
                    } catch {
                        self.pushHabitState(to: webView, status: error.localizedDescription, isError: true)
                    }
                }
            } catch {
                await MainActor.run {
                    guard let self, let webView else { return }
                    self.pushHabitState(to: webView, status: error.localizedDescription, isError: true)
                }
            }
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
                        status: cached ? "Нет сети — показываем сохранённые данные" : error.localizedDescription,
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
            pushGoalDotsState(to: webView, status: "Сохранено")
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
        Task { await VitaProfileClient.saveCurrentSettings() }
        pushWidgetTheme(to: webView, status: "Готово", theme: theme)
    }

    private func saveDotStyle(_ raw: String, in webView: WKWebView) {
        guard VitaDotStyleStore.save(rawValue: raw) != nil else {
            pushWidgetTheme(to: webView, status: "Неизвестная форма точек", isError: true)
            return
        }
        WidgetCenter.shared.reloadAllTimelines()
        Task { await VitaProfileClient.saveCurrentSettings() }
        pushWidgetTheme(to: webView, status: "Готово")
    }

    private func saveDotColor(_ raw: String, rememberCustom: Bool, in webView: WKWebView) {
        guard VitaDotColorStore.save(rawValue: raw, rememberCustom: rememberCustom) != nil else {
            pushWidgetTheme(to: webView, status: "Неизвестный цвет точек", isError: true)
            return
        }
        WidgetCenter.shared.reloadAllTimelines()
        Task { await VitaProfileClient.saveCurrentSettings() }
        pushWidgetTheme(to: webView, status: "Готово")
    }

    private func pickWidgetPhoto() {
        guard UIImagePickerController.isSourceTypeAvailable(.photoLibrary) else {
            pushWidgetTheme(to: webView, status: "Фото недоступны", isError: true)
            return
        }
        photoPickerPurpose = .widgetPhoto
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
            "dotColor": VitaDotColorStore.load(),
            "customDotColor": VitaDotColorStore.customHex,
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

    private func connectProfile(_ raw: String, in webView: WKWebView) {
        guard let code = VitaProfileStore.normalized(raw) else {
            pushProfileState(to: webView, status: VitaProfileError.invalidCode.localizedDescription, isError: true)
            return
        }
        guard !profileRequestInFlight else { return }
        let ownerToken = VitaProfileStore.makeOwnerToken()
        profileRequestInFlight = true
        pushProfileState(to: webView, status: "Подключаем аккаунт…")
        Task { [weak self, weak webView] in
            do {
                let bundle = try await VitaProfileClient.connect(code: code, ownerToken: ownerToken)
                var snapshot: VitaHabitSnapshot?
                if let goal = bundle.goals.first {
                    _ = try VitaHabitStore.activate(goal.code)
                    snapshot = try? await VitaHabitClient.fetch(code: goal.code)
                }
                await MainActor.run {
                    guard let self, let webView else { return }
                    self.profileRequestInFlight = false
                    self.allowsProfileBootstrap = true
                    self.acceptProfileBundle(
                        bundle,
                        ownerToken: ownerToken,
                        snapshot: snapshot,
                        status: "Аккаунт подключён",
                        in: webView
                    )
                }
            } catch {
                await MainActor.run {
                    guard let self, let webView else { return }
                    self.profileRequestInFlight = false
                    self.pushProfileState(to: webView, status: error.localizedDescription, isError: true)
                }
            }
        }
    }

    private func bootstrapProfile(in webView: WKWebView) {
        guard allowsProfileBootstrap, !profileRequestInFlight else { return }
        let storedOwnerToken = VitaProfileStore.ownerToken
        let ownerToken = storedOwnerToken ?? VitaProfileStore.makeOwnerToken()
        _ = VitaProfileStore.save(ownerToken: ownerToken)
        let code = VitaProfileStore.code
        profileRequestInFlight = true
        Task { [weak self, weak webView] in
            do {
                let bundle: VitaProfileBundle
                if storedOwnerToken != nil, let code {
                    do {
                        bundle = try await VitaProfileClient.fetchCurrent(ownerToken: ownerToken)
                    } catch VitaProfileError.unauthorized {
                        // A previous first-run request may have failed after the
                        // token was stored locally but before the server paired it.
                        bundle = try await VitaProfileClient.connect(code: code, ownerToken: ownerToken)
                    }
                } else if let code {
                    bundle = try await VitaProfileClient.connect(code: code, ownerToken: ownerToken)
                } else {
                    bundle = try await VitaProfileClient.register(ownerToken: ownerToken)
                }
                var snapshot: VitaHabitSnapshot?
                if VitaHabitStore.activeCode == nil, let goal = bundle.goals.first {
                    _ = try? VitaHabitStore.activate(goal.code)
                    snapshot = try? await VitaHabitClient.fetch(code: goal.code)
                }
                await MainActor.run {
                    guard let self, let webView else { return }
                    self.profileRequestInFlight = false
                    self.acceptProfileBundle(
                        bundle,
                        ownerToken: ownerToken,
                        snapshot: snapshot,
                        status: code == nil ? "Аккаунт создан" : nil,
                        in: webView
                    )
                }
            } catch {
                await MainActor.run {
                    guard let self, let webView else { return }
                    self.profileRequestInFlight = false
                    self.pushProfileState(to: webView, status: error.localizedDescription, isError: true)
                }
            }
        }
    }

    private func saveProfile(handle: String, name: String, bio: String, in webView: WKWebView) {
        guard let ownerToken = VitaProfileStore.ownerToken else {
            bootstrapProfile(in: webView)
            return
        }
        guard !profileRequestInFlight else { return }
        profileRequestInFlight = true
        pushProfileState(to: webView, status: "Сохраняем профиль…")
        Task { [weak self, weak webView] in
            do {
                let bundle = try await VitaProfileClient.update(
                    ownerToken: ownerToken,
                    handle: handle,
                    name: name,
                    bio: bio
                )
                await MainActor.run {
                    guard let self, let webView else { return }
                    self.profileRequestInFlight = false
                    self.profileBundle = bundle
                    self.pushProfileState(to: webView, status: "Профиль сохранён")
                }
            } catch {
                await MainActor.run {
                    guard let self, let webView else { return }
                    self.profileRequestInFlight = false
                    self.pushProfileState(to: webView, status: error.localizedDescription, isError: true)
                }
            }
        }
    }

    private func pickProfileAvatar() {
        guard VitaProfileStore.ownerToken != nil else {
            pushProfileState(to: webView, status: "Сначала дождись создания аккаунта", isError: true)
            return
        }
        guard UIImagePickerController.isSourceTypeAvailable(.photoLibrary) else {
            pushProfileState(to: webView, status: "Фото недоступны", isError: true)
            return
        }
        photoPickerPurpose = .profileAvatar
        let picker = UIImagePickerController()
        picker.sourceType = .photoLibrary
        picker.delegate = self
        present(picker, animated: true)
    }

    private func acceptProfileBundle(
        _ bundle: VitaProfileBundle,
        ownerToken: String,
        snapshot: VitaHabitSnapshot?,
        status: String?,
        in webView: WKWebView
    ) {
        guard VitaProfileStore.saveSession(code: bundle.code, ownerToken: ownerToken) else {
            pushProfileState(to: webView, status: VitaProfileError.invalidResponse.localizedDescription, isError: true)
            return
        }
        profileBundle = bundle
        VitaProfileStore.apply(bundle.settings)
        if let snapshot { VitaHabitStore.save(snapshot) }
        WidgetCenter.shared.reloadAllTimelines()
        pushProfileState(to: webView, status: status, goalCount: bundle.goals.count)
        pushHabitState(to: webView)
        pushWidgetTheme(to: webView)
    }

    private func pushProfileState(
        to webView: WKWebView,
        status: String? = nil,
        isError: Bool = false,
        goalCount: Int? = nil
    ) {
        let code = VitaProfileStore.code
        let bundle = profileBundle
        var payload: [String: Any] = [
            "connected": code != nil,
            "code": code ?? "",
            "goals": goalCount ?? bundle?.goals.count ?? (VitaHabitStore.activeCode == nil ? 0 : 1),
            "loading": profileRequestInFlight,
            "handle": bundle?.handle ?? "",
            "name": bundle?.name ?? "",
            "bio": bundle?.bio ?? "",
            "avatar": bundle?.avatar ?? "",
            "tags": (bundle?.tags ?? []).map { tag in
                [
                    "id": tag.id,
                    "name": tag.name,
                    "description": tag.description,
                    "icon": tag.icon,
                    "rarity": tag.rarity,
                    "earnedAt": tag.earnedAt ?? "",
                ]
            },
        ]
        if let status { payload["status"] = status; payload["isError"] = isError }
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("showVitaProfileState(\(json))", completionHandler: nil)
    }

    private func saveImpulse(
        id: String?,
        title: String,
        notes: String,
        reason: String,
        firstStep: String,
        fireDateRaw: String,
        deadlineRaw: String,
        deadlineAlertRaw: String,
        folderID: String?,
        usesAlarm: Bool,
        priorityRaw: String,
        repeatRaw: String,
        in webView: WKWebView
    ) {
        guard let fireDate = impulseDate(from: fireDateRaw) else {
            pushImpulseState(to: webView, status: VitaImpulseError.invalidDate.localizedDescription, isError: true, saveResult: true)
            return
        }
        let deadline = deadlineRaw.isEmpty ? nil : impulseDate(from: deadlineRaw)
        if !deadlineRaw.isEmpty, deadline == nil {
            pushImpulseState(to: webView, status: "Проверь дату дедлайна", isError: true, saveResult: true)
            return
        }
        let deadlineAlert = deadlineAlertRaw.isEmpty ? nil : impulseDate(from: deadlineAlertRaw)
        if !deadlineAlertRaw.isEmpty, deadlineAlert == nil {
            pushImpulseState(to: webView, status: "Проверь время предупреждения", isError: true, saveResult: true)
            return
        }
        let normalizedFolderID = folderID?.isEmpty == false ? folderID : nil
        if let normalizedFolderID,
           !VitaImpulseFolderStore.list().contains(where: { $0.id == normalizedFolderID }) {
            pushImpulseState(to: webView, status: "Папка не найдена", isError: true, saveResult: true)
            return
        }
        do {
            let impulse = try VitaImpulseStore.save(
                id: id?.isEmpty == true ? nil : id,
                title: title,
                reason: reason,
                firstStep: firstStep,
                notes: notes,
                fireDate: fireDate,
                deadline: deadline,
                folderID: normalizedFolderID,
                deadlineAlertDate: deadlineAlert,
                usesAlarm: usesAlarm && VitaImpulseAlarms.isSupported,
                durationMinutes: 15,
                priority: VitaImpulsePriority(rawValue: priorityRaw) ?? .none,
                repeatRule: VitaImpulseRepeat(rawValue: repeatRaw) ?? .none,
                focusMode: .none
            )
            VitaImpulseNotifications.requestAccess { [weak self, weak webView] granted in
                guard let self, let webView else { return }
                guard granted || impulse.usesAlarm else {
                    _ = try? VitaImpulseStore.disable(id: impulse.id)
                    VitaImpulseDelivery.cancelAll(for: impulse.id)
                    DispatchQueue.main.async {
                        self.pushImpulseState(
                            to: webView,
                            status: "Разреши уведомления Vita Focus в настройках",
                            isError: true,
                            saveResult: true,
                            savedImpulseID: impulse.id
                        )
                    }
                    return
                }
                self.deliverSavedImpulse(
                    impulse,
                    notificationsGranted: granted,
                    in: webView
                )
            }
        } catch {
            pushImpulseState(to: webView, status: error.localizedDescription, isError: true, saveResult: true)
        }
    }

    private func createImpulseFolder(_ name: String, in webView: WKWebView) {
        do {
            let folder = try VitaImpulseFolderStore.create(name: name)
            pushImpulseState(
                to: webView,
                folderStatus: "Папка создана",
                selectedFolderID: folder.id
            )
        } catch {
            pushImpulseState(
                to: webView,
                folderStatus: error.localizedDescription,
                folderIsError: true
            )
        }
    }

    private func renameImpulseFolder(_ id: String, name: String, in webView: WKWebView) {
        do {
            _ = try VitaImpulseFolderStore.rename(id: id, name: name)
            pushImpulseState(to: webView, folderStatus: "Папка переименована")
        } catch {
            pushImpulseState(
                to: webView,
                folderStatus: error.localizedDescription,
                folderIsError: true
            )
        }
    }

    private func deleteImpulseFolder(_ id: String, in webView: WKWebView) {
        guard VitaImpulseFolderStore.delete(id: id) else {
            pushImpulseState(to: webView, folderStatus: "Папка не найдена", folderIsError: true)
            return
        }
        pushImpulseState(
            to: webView,
            folderStatus: "Папка удалена · напоминания сохранены"
        )
    }

    private func deliverSavedImpulse(
        _ impulse: VitaImpulse,
        notificationsGranted: Bool,
        in webView: WKWebView
    ) {
        VitaImpulseDelivery.schedule(
            impulse,
            includeLocalNotifications: notificationsGranted
        ) { [weak self, weak webView] error in
            DispatchQueue.main.async {
                guard let self, let webView else { return }
                if error is VitaImpulseDeliveryError {
                    guard notificationsGranted else {
                        _ = try? VitaImpulseStore.disable(id: impulse.id)
                        VitaImpulseDelivery.cancelAll(for: impulse.id)
                        self.pushImpulseState(
                            to: webView,
                            status: "Будильник не разрешён, а обычные уведомления выключены",
                            isError: true,
                            saveResult: true,
                            savedImpulseID: impulse.id
                        )
                        return
                    }
                    if var fallback = VitaImpulseStore.load(id: impulse.id) {
                        fallback.usesAlarm = false
                        _ = try? VitaImpulseStore.upsert(fallback)
                    }
                    self.pushImpulseState(
                        to: webView,
                        status: "Будильник недоступен — сохранили обычное уведомление",
                        saveResult: true,
                        savedImpulseID: impulse.id
                    )
                    return
                }
                if let error {
                    if impulse.usesAlarm && !notificationsGranted {
                        _ = try? VitaImpulseStore.disable(id: impulse.id)
                        VitaImpulseDelivery.cancelAll(for: impulse.id)
                    }
                    self.pushImpulseState(
                        to: webView,
                        status: error.localizedDescription,
                        isError: true,
                        saveResult: true,
                        savedImpulseID: impulse.id
                    )
                    return
                }
                let status: String
                let alarmScheduled = impulse.usesAlarm
                    && (impulse.status == .scheduled || impulse.status == .snoozed)
                    && impulse.fireDate.timeIntervalSinceNow >= 1
                if alarmScheduled {
                    status = !notificationsGranted && impulse.deadlineAlertDate != nil
                        ? "Будильник сохранён · предупреждение дедлайна требует уведомлений"
                        : "Будильник сохранён"
                } else {
                    status = "Импульс сохранён"
                }
                self.pushImpulseState(
                    to: webView,
                    status: status,
                    saveResult: true,
                    savedImpulseID: impulse.id
                )
            }
        }
    }

    private func acceptImpulse(_ id: String, in webView: WKWebView) {
        do {
            _ = try VitaImpulseStore.accept(id: id)
            VitaImpulseDelivery.cancelReminder(for: id)
            VitaImpulsePendingActionStore.set(type: .accept, impulseID: id)
            pushImpulseState(to: webView)
        } catch {
            pushImpulseState(to: webView, status: error.localizedDescription, isError: true)
        }
    }

    private func snoozeImpulse(_ id: String, untilRaw: String, in webView: WKWebView) {
        guard let until = impulseDate(from: untilRaw) else {
            pushImpulseState(to: webView, status: "Выбери, когда напомнить снова", isError: true)
            return
        }
        do {
            let impulse = try VitaImpulseStore.snooze(id: id, until: until)
            VitaImpulsePendingActionStore.clear()
            VitaImpulseDelivery.schedule(impulse) { [weak self, weak webView] error in
                DispatchQueue.main.async {
                    guard let self, let webView else { return }
                    if error is VitaImpulseDeliveryError,
                       var fallback = VitaImpulseStore.load(id: impulse.id) {
                        fallback.usesAlarm = false
                        _ = try? VitaImpulseStore.upsert(fallback)
                    }
                    self.pushImpulseState(
                        to: webView,
                        status: error is VitaImpulseDeliveryError
                            ? "Будильник недоступен — вернём обычным уведомлением"
                            : (error == nil ? "Вернёмся к этому в выбранное время" : error?.localizedDescription),
                        isError: error != nil && !(error is VitaImpulseDeliveryError)
                    )
                }
            }
        } catch {
            pushImpulseState(to: webView, status: error.localizedDescription, isError: true)
        }
    }

    private func completeImpulse(_ id: String, in webView: WKWebView) {
        do {
            let impulse = try VitaImpulseStore.complete(id: id)
            VitaImpulsePendingActionStore.clear()
            VitaImpulseDelivery.cancelAll(for: id)
            if impulse.isEnabled && impulse.status != .completed {
                VitaImpulseDelivery.schedule(impulse) { [weak self, weak webView] error in
                    DispatchQueue.main.async {
                        guard let self, let webView else { return }
                        if error is VitaImpulseDeliveryError,
                           var fallback = VitaImpulseStore.load(id: impulse.id) {
                            fallback.usesAlarm = false
                            _ = try? VitaImpulseStore.upsert(fallback)
                        }
                        self.pushImpulseState(
                            to: webView,
                            status: error is VitaImpulseDeliveryError
                                ? "Готово · следующий повтор будет обычным уведомлением"
                                : (error == nil ? "Готово · следующий повтор запланирован" : error?.localizedDescription),
                            isError: error != nil && !(error is VitaImpulseDeliveryError)
                        )
                    }
                }
            } else {
                pushImpulseState(to: webView, status: "Готово ✦")
            }
        } catch {
            pushImpulseState(to: webView, status: error.localizedDescription, isError: true)
        }
    }

    private func deleteImpulse(_ id: String, in webView: WKWebView) {
        VitaImpulseDelivery.cancelAll(for: id)
        VitaImpulseStore.delete(id: id)
        if VitaImpulsePendingActionStore.load()?.impulseID == id {
            VitaImpulsePendingActionStore.clear()
        }
        pushImpulseState(to: webView, status: "Напоминание удалено")
    }

    private func pushImpulseState(
        to webView: WKWebView,
        status: String? = nil,
        isError: Bool = false,
        saveResult: Bool = false,
        savedImpulseID: String? = nil,
        folderStatus: String? = nil,
        folderIsError: Bool = false,
        selectedFolderID: String? = nil
    ) {
        let impulses = VitaImpulseStore.all()
        var payload: [String: Any] = [
            "configured": !impulses.isEmpty,
            "enabled": impulses.contains { $0.isEnabled && $0.status != .completed },
            "items": impulses.map(impulsePayload),
            "folders": VitaImpulseFolderStore.list().map { [
                "id": $0.id,
                "name": $0.name,
            ] },
            "supportsAlarm": VitaImpulseAlarms.isSupported,
        ]
        let pending = VitaImpulsePendingActionStore.load()
        if let pending, impulses.contains(where: { $0.id == pending.impulseID }) {
            var action: [String: Any] = [
                "type": pending.type.rawValue,
                "id": pending.impulseID,
            ]
            if let snoozeUntil = pending.snoozeUntil {
                action["snoozeUntil"] = impulseDateString(snoozeUntil)
            }
            payload["pendingAction"] = action
        }
        if let status {
            payload["status"] = status
            payload["isError"] = isError
        }
        if saveResult {
            payload["saveResult"] = true
        }
        if let savedImpulseID {
            payload["savedImpulseID"] = savedImpulseID
        }
        if let folderStatus {
            payload["folderStatus"] = folderStatus
            payload["folderIsError"] = folderIsError
        }
        if let selectedFolderID {
            payload["selectedFolderID"] = selectedFolderID
        }
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("showImpulseState(\(json))") { _, error in
            if error == nil, pending != nil {
                _ = VitaImpulsePendingActionStore.consume()
            }
        }
    }

    private func impulsePayload(_ impulse: VitaImpulse) -> [String: Any] {
        var payload: [String: Any] = [
            "id": impulse.id,
            "title": impulse.title,
            "notes": impulse.notes,
            "reason": impulse.reason,
            "firstStep": impulse.firstStep,
            "folderID": impulse.folderID ?? "",
            "fireDate": impulseDateString(impulse.fireDate),
            "priority": impulse.priority.rawValue,
            "repeatRule": impulse.repeatRule.rawValue,
            "status": impulse.status.rawValue,
            "snoozeCount": impulse.snoozeCount,
            "enabled": impulse.isEnabled,
            "completed": impulse.status == .completed,
            "usesAlarm": impulse.usesAlarm,
        ]
        if let deadline = impulse.deadline { payload["deadline"] = impulseDateString(deadline) }
        if let deadlineAlert = impulse.deadlineAlertDate {
            payload["deadlineAlertDate"] = impulseDateString(deadlineAlert)
        }
        return payload
    }

    private func impulseDate(from raw: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: raw) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: raw)
    }

    private func impulseDateString(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }

    private func highlightGoals(in webView: WKWebView) {
        webView.evaluateJavaScript("showGoalsSection()", completionHandler: nil)
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
        let purpose = photoPickerPurpose
        photoPickerPurpose = .widgetPhoto
        picker.dismiss(animated: true)
        guard let image = info[.originalImage] as? UIImage,
              let data = widgetPhotoData(image) else {
            if purpose == .profileAvatar {
                pushProfileState(to: webView, status: "Не удалось обработать фото", isError: true)
            } else {
                pushWidgetTheme(to: webView, status: "Не удалось обработать фото", isError: true)
            }
            return
        }

        switch purpose {
        case .widgetPhoto:
            do {
                try VitaWidgetThemeStore.savePhotoData(data)
                WidgetCenter.shared.reloadAllTimelines()
                Task { await VitaProfileClient.saveCurrentSettings() }
                pushWidgetTheme(to: webView, status: "Фото установлено", theme: .photo)
            } catch {
                pushWidgetTheme(to: webView, status: "Не удалось сохранить фото", isError: true)
            }
        case .profileAvatar:
            guard let ownerToken = VitaProfileStore.ownerToken,
                  !profileRequestInFlight else { return }
            profileRequestInFlight = true
            pushProfileState(to: webView, status: "Загружаем аватар…")
            Task { [weak self, weak webView] in
                do {
                    let bundle = try await VitaProfileClient.uploadAvatar(
                        ownerToken: ownerToken,
                        jpegData: data
                    )
                    await MainActor.run {
                        guard let self, let webView else { return }
                        self.profileRequestInFlight = false
                        self.profileBundle = bundle
                        self.pushProfileState(to: webView, status: "Аватар обновлён")
                    }
                } catch {
                    await MainActor.run {
                        guard let self, let webView else { return }
                        self.profileRequestInFlight = false
                        self.pushProfileState(
                            to: webView,
                            status: error.localizedDescription,
                            isError: true
                        )
                    }
                }
            }
        }
    }

    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        photoPickerPurpose = .widgetPhoto
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
