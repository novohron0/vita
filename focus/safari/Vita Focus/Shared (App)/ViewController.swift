//
//  ViewController.swift
//  Shared (App)
//
//  Created by Камиль Имангулов on 10.07.2026.
//

import WebKit

#if os(iOS)
import UIKit
typealias PlatformViewController = UIViewController
#elseif os(macOS)
import Cocoa
import SafariServices
typealias PlatformViewController = NSViewController
#endif

let extensionBundleIdentifier = "ru.vitadots.focus.Extension"

class ViewController: PlatformViewController, WKNavigationDelegate, WKScriptMessageHandler {

    @IBOutlet var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()

        self.webView.navigationDelegate = self

#if os(iOS)
        self.webView.scrollView.isScrollEnabled = true
        self.webView.scrollView.alwaysBounceVertical = true
#endif

        self.webView.configuration.userContentController.add(self, name: "controller")

        self.webView.loadFileURL(Bundle.main.url(forResource: "Main", withExtension: "html")!, allowingReadAccessTo: Bundle.main.resourceURL!)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
#if os(iOS)
        webView.evaluateJavaScript("show('ios')")
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
        guard let body = message.body as? String else { return }
        if body == "open-youtube" {
            FocusDeepLinks.openURL(FocusDeepLinks.youtubeSubs)
            return
        }
        if body == "open-settings" {
            openSafariExtensionSettings()
            return
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
