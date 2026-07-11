#!/usr/bin/env python3
"""Add Vita Focus Widget extension target to Xcode project (idempotent)."""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PBX = ROOT / "safari/Vita Focus/Vita Focus.xcodeproj/project.pbxproj"

MARKER = "Vita Focus Widget (iOS)"

def main() -> int:
    text = PBX.read_text()
    if MARKER in text:
        print("widget target already present")
        return 0

    # IDs — unique within project
    ids = {
        "widget_target": "4F807AD1000D9E30043AC81",
        "widget_product": "4F807AD2000D9E30043AC81",
        "widget_embed": "4F807AD3000D9E30043AC81",
        "widget_proxy": "4F807AD4000D9E30043AC81",
        "widget_dep": "4F807AD5000D9E30043AC81",
        "embed_widgets_phase": "4F807AD6000D9E30043AC81",
        "widget_sources": "4F807AD7000D9E30043AC81",
        "widget_frameworks": "4F807AD8000D9E30043AC81",
        "widget_resources": "4F807AD9000D9E30043AC81",
        "widget_config_list": "4F807ADA000D9E30043AC81",
        "widget_debug": "4F807ADB000D9E30043AC81",
        "widget_release": "4F807ADC000D9E30043AC81",
        "focus_shared_ref": "4F807ADD000D9E30043AC81",
        "widgets_swift_ref": "4F807ADE000D9E30043AC81",
        "widget_info_ref": "4F807ADF000D9E30043AC81",
        "widget_ent_ref": "4F807AE0000D9E30043AC81",
        "app_ent_ref": "4F807AE1000D9E30043AC81",
        "ext_ent_ref": "4F807AE2000D9E30043AC81",
        "shared_group": "4F807AE3000D9E30043AC81",
        "widget_group": "4F807AE4000D9E30043AC81",
        "focus_shared_app_src": "4F807AE5000D9E30043AC81",
        "focus_shared_ext_src": "4F807AE6000D9E30043AC81",
        "focus_shared_wgt_src": "4F807AE7000D9E30043AC81",
        "widgets_wgt_src": "4F807AE8000D9E30043AC81",
    }

    # PBXBuildFile
    build_files = f"""
\t\t{ids['widget_embed']} /* Vita Focus Widget.appex in Embed App Extensions */ = {{isa = PBXBuildFile; fileRef = {ids['widget_product']} /* Vita Focus Widget.appex */; settings = {{ATTRIBUTES = (RemoveHeadersOnCopy, ); }}; }};
\t\t{ids['focus_shared_app_src']} /* FocusShared.swift in Sources */ = {{isa = PBXBuildFile; fileRef = {ids['focus_shared_ref']} /* FocusShared.swift */; }};
\t\t{ids['focus_shared_ext_src']} /* FocusShared.swift in Sources */ = {{isa = PBXBuildFile; fileRef = {ids['focus_shared_ref']} /* FocusShared.swift */; }};
\t\t{ids['focus_shared_wgt_src']} /* FocusShared.swift in Sources */ = {{isa = PBXBuildFile; fileRef = {ids['focus_shared_ref']} /* FocusShared.swift */; }};
\t\t{ids['widgets_wgt_src']} /* VitaFocusWidgets.swift in Sources */ = {{isa = PBXBuildFile; fileRef = {ids['widgets_swift_ref']} /* VitaFocusWidgets.swift */; }};
"""
    text = text.replace("/* End PBXBuildFile section */", build_files + "\t/* End PBXBuildFile section */")

    # PBXContainerItemProxy
    proxy = f"""
\t\t{ids['widget_proxy']} /* PBXContainerItemProxy */ = {{
\t\t\tisa = PBXContainerItemProxy;
\t\t\tcontainerPortal = 4F807A593000D9E10043AC81 /* Project object */;
\t\t\tproxyType = 1;
\t\t\tremoteGlobalIDString = {ids['widget_target']};
\t\t\tremoteInfo = "{MARKER}";
\t\t}};
"""
    text = text.replace("/* End PBXContainerItemProxy section */", proxy + "\t/* End PBXContainerItemProxy section */")

    # Embed App Extensions phase
    embed = f"""
\t\t{ids['embed_widgets_phase']} /* Embed App Extensions */ = {{
\t\t\tisa = PBXCopyFilesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tdstPath = "";
\t\t\tdstSubfolderSpec = 13;
\t\t\tfiles = (
\t\t\t\t{ids['widget_embed']} /* Vita Focus Widget.appex in Embed App Extensions */,
\t\t\t);
\t\t\tname = "Embed App Extensions";
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};
"""
    text = text.replace("/* End PBXCopyFilesBuildPhase section */", embed + "\t/* End PBXCopyFilesBuildPhase section */")

    # PBXFileReference
    refs = f"""
\t\t{ids['focus_shared_ref']} /* FocusShared.swift */ = {{isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = FocusShared.swift; sourceTree = "<group>"; }};
\t\t{ids['widgets_swift_ref']} /* VitaFocusWidgets.swift */ = {{isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = VitaFocusWidgets.swift; sourceTree = "<group>"; }};
\t\t{ids['widget_info_ref']} /* Info.plist */ = {{isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = Info.plist; sourceTree = "<group>"; }};
\t\t{ids['widget_ent_ref']} /* VitaFocusWidget.entitlements */ = {{isa = PBXFileReference; lastKnownFileType = text.plist.entitlements; path = VitaFocusWidget.entitlements; sourceTree = "<group>"; }};
\t\t{ids['app_ent_ref']} /* VitaFocus.entitlements */ = {{isa = PBXFileReference; lastKnownFileType = text.plist.entitlements; path = VitaFocus.entitlements; sourceTree = "<group>"; }};
\t\t{ids['ext_ent_ref']} /* VitaFocusExtension.entitlements */ = {{isa = PBXFileReference; lastKnownFileType = text.plist.entitlements; path = VitaFocusExtension.entitlements; sourceTree = "<group>"; }};
\t\t{ids['widget_product']} /* Vita Focus Widget.appex */ = {{isa = PBXFileReference; explicitFileType = "wrapper.app-extension"; includeInIndex = 0; path = "Vita Focus Widget.appex"; sourceTree = BUILT_PRODUCTS_DIR; }};
"""
    text = text.replace("/* End PBXFileReference section */", refs + "\t/* End PBXFileReference section */")

    # Frameworks for widget
    fw = f"""
\t\t{ids['widget_frameworks']} /* Frameworks */ = {{
\t\t\tisa = PBXFrameworksBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};
"""
    text = text.replace("/* End PBXFrameworksBuildPhase section */", fw + "\t/* End PBXFrameworksBuildPhase section */")

    # Groups
    text = text.replace(
        "4F807A583000D9E10043AC81 = {\n\t\t\tisa = PBXGroup;\n\t\t\tchildren = (\n\t\t\t\t4F807A5D3000D9E20043AC81 /* Shared (App) */,",
        f"4F807A583000D9E10043AC81 = {{\n\t\t\tisa = PBXGroup;\n\t\t\tchildren = (\n\t\t\t\t{ids['shared_group']} /* Shared */,\n\t\t\t\t4F807A5D3000D9E20043AC81 /* Shared (App) */,",
    )
    text = text.replace(
        "4F807A6E3000D9E30043AC81 /* iOS (App) */ = {\n\t\t\tisa = PBXGroup;\n\t\t\tchildren = (\n",
        f"4F807A6E3000D9E30043AC81 /* iOS (App) */ = {{\n\t\t\tisa = PBXGroup;\n\t\t\tchildren = (\n\t\t\t\t{ids['app_ent_ref']} /* VitaFocus.entitlements */,\n",
    )
    text = text.replace(
        "4F807A8E3000D9E30043AC81 /* iOS (Extension) */ = {\n\t\t\tisa = PBXGroup;\n\t\t\tchildren = (\n",
        f"4F807A8E3000D9E30043AC81 /* iOS (Extension) */ = {{\n\t\t\tisa = PBXGroup;\n\t\t\tchildren = (\n\t\t\t\t{ids['ext_ent_ref']} /* VitaFocusExtension.entitlements */,\n",
    )
    text = text.replace(
        "4F807A943000D9E30043AC81 /* Vita Focus Extension.appex */,\n\t\t\t);",
        f"4F807A943000D9E30043AC81 /* Vita Focus Extension.appex */,\n\t\t\t\t{ids['widget_product']} /* Vita Focus Widget.appex */,\n\t\t\t);",
    )

    groups = f"""
\t\t{ids['shared_group']} /* Shared */ = {{
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
\t\t\t\t{ids['focus_shared_ref']} /* FocusShared.swift */,
\t\t\t);
\t\t\tpath = Shared;
\t\t\tsourceTree = "<group>";
\t\t}};
\t\t{ids['widget_group']} /* iOS (Widget) */ = {{
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
\t\t\t\t{ids['widgets_swift_ref']} /* VitaFocusWidgets.swift */,
\t\t\t\t{ids['widget_info_ref']} /* Info.plist */,
\t\t\t\t{ids['widget_ent_ref']} /* VitaFocusWidget.entitlements */,
\t\t\t);
\t\t\tpath = "iOS (Widget)";
\t\t\tsourceTree = "<group>";
\t\t}};
"""
    text = text.replace("/* End PBXGroup section */", groups + "\t/* End PBXGroup section */")

    # Add widget group to root
    text = text.replace(
        "4F807A983000D9E30043AC81 /* macOS (Extension) */,\n\t\t\t\t4F807A6D3000D9E30043AC81 /* Products */,",
        f"4F807A983000D9E30043AC81 /* macOS (Extension) */,\n\t\t\t\t{ids['widget_group']} /* iOS (Widget) */,\n\t\t\t\t4F807A6D3000D9E30043AC81 /* Products */,",
    )

    # iOS app target — embed widgets + dependency
    text = text.replace(
        "4F807AAD3000D9E30043AC81 /* Embed Foundation Extensions */,\n\t\t\t);",
        f"4F807AAD3000D9E30043AC81 /* Embed Foundation Extensions */,\n\t\t\t\t{ids['embed_widgets_phase']} /* Embed App Extensions */,\n\t\t\t);",
    )
    text = text.replace(
        "4F807A8D3000D9E30043AC81 /* PBXTargetDependency */,\n\t\t\t);\n\t\t\tname = \"Vita Focus (iOS)\";",
        f"4F807A8D3000D9E30043AC81 /* PBXTargetDependency */,\n\t\t\t\t{ids['widget_dep']} /* PBXTargetDependency */,\n\t\t\t);\n\t\t\tname = \"Vita Focus (iOS)\";",
    )

    # Native target widget
    target = f"""
\t\t{ids['widget_target']} /* {MARKER} */ = {{
\t\t\tisa = PBXNativeTarget;
\t\t\tbuildConfigurationList = {ids['widget_config_list']} /* Build configuration list for PBXNativeTarget "{MARKER}" */;
\t\t\tbuildPhases = (
\t\t\t\t{ids['widget_sources']} /* Sources */,
\t\t\t\t{ids['widget_frameworks']} /* Frameworks */,
\t\t\t\t{ids['widget_resources']} /* Resources */,
\t\t\t);
\t\t\tbuildRules = (
\t\t\t);
\t\t\tdependencies = (
\t\t\t);
\t\t\tname = "{MARKER}";
\t\t\tproductName = "Vita Focus Widget";
\t\t\tproductReference = {ids['widget_product']} /* Vita Focus Widget.appex */;
\t\t\tproductType = "com.apple.product-type.app-extension";
\t\t}};
"""
    text = text.replace("/* End PBXNativeTarget section */", target + "\t/* End PBXNativeTarget section */")

    text = text.replace(
        "4F807A933000D9E30043AC81 /* Vita Focus Extension (macOS) */,\n\t\t\t);",
        f"4F807A933000D9E30043AC81 /* Vita Focus Extension (macOS) */,\n\t\t\t\t{ids['widget_target']} /* {MARKER} */,\n\t\t\t);",
    )

    # Target attributes
    text = text.replace(
        "4F807A933000D9E30043AC81 = {\n\t\t\t\t\t\tCreatedOnToolsVersion = 26.6;\n\t\t\t\t\t};",
        f"4F807A933000D9E30043AC81 = {{\n\t\t\t\t\t\tCreatedOnToolsVersion = 26.6;\n\t\t\t\t\t}};\n\t\t\t\t\t{ids['widget_target']} = {{\n\t\t\t\t\t\tCreatedOnToolsVersion = 26.6;\n\t\t\t\t\t}};",
    )

    # Resources phases
    res = f"""
\t\t{ids['widget_resources']} /* Resources */ = {{
\t\t\tisa = PBXResourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};
"""
    text = text.replace("/* End PBXResourcesBuildPhase section */", res + "\t/* End PBXResourcesBuildPhase section */")

    # Sources — app, extension, widget
    text = text.replace(
        "4F807A723000D9E30043AC81 /* SceneDelegate.swift in Sources */,\n\t\t\t);",
        f"4F807A723000D9E30043AC81 /* SceneDelegate.swift in Sources */,\n\t\t\t\t{ids['focus_shared_app_src']} /* FocusShared.swift in Sources */,\n\t\t\t);",
    )
    text = text.replace(
        "4F807AA63000D9E30043AC81 /* SafariWebExtensionHandler.swift in Sources */,\n\t\t\t);\n\t\t\trunOnlyForDeploymentPostprocessing = 0;\n\t\t};\n\t\t4F807A903000D9E30043AC81 /* Sources */ = {",
        f"4F807AA63000D9E30043AC81 /* SafariWebExtensionHandler.swift in Sources */,\n\t\t\t\t{ids['focus_shared_ext_src']} /* FocusShared.swift in Sources */,\n\t\t\t);\n\t\t\trunOnlyForDeploymentPostprocessing = 0;\n\t\t}};\n\t\t{ids['widget_sources']} /* Sources */ = {{\n\t\t\tisa = PBXSourcesBuildPhase;\n\t\t\tbuildActionMask = 2147483647;\n\t\t\tfiles = (\n\t\t\t\t{ids['widgets_wgt_src']} /* VitaFocusWidgets.swift in Sources */,\n\t\t\t\t{ids['focus_shared_wgt_src']} /* FocusShared.swift in Sources */,\n\t\t\t);\n\t\t\trunOnlyForDeploymentPostprocessing = 0;\n\t\t}};\n\t\t4F807A903000D9E30043AC81 /* Sources */ = {{",
    )

    # PBXTargetDependency
    dep = f"""
\t\t{ids['widget_dep']} /* PBXTargetDependency */ = {{
\t\t\tisa = PBXTargetDependency;
\t\t\ttarget = {ids['widget_target']} /* {MARKER} */;
\t\t\ttargetProxy = {ids['widget_proxy']} /* PBXContainerItemProxy */;
\t\t}};
"""
    text = text.replace("/* End PBXTargetDependency section */", dep + "\t/* End PBXTargetDependency section */")

    # Build configs widget
    cfg = f"""
\t\t{ids['widget_debug']} /* Debug */ = {{
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {{
\t\t\t\tCODE_SIGN_ENTITLEMENTS = "iOS (Widget)/VitaFocusWidget.entitlements";
\t\t\t\tCODE_SIGN_STYLE = Automatic;
\t\t\t\tCURRENT_PROJECT_VERSION = 1;
\t\t\t\tDEVELOPMENT_TEAM = 655542C66J;
\t\t\t\tGENERATE_INFOPLIST_FILE = YES;
\t\t\t\tINFOPLIST_FILE = "iOS (Widget)/Info.plist";
\t\t\t\tINFOPLIST_KEY_CFBundleDisplayName = "Vita Focus Widget";
\t\t\t\tINFOPLIST_KEY_NSHumanReadableCopyright = "";
\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = 17.0;
\t\t\t\tLD_RUNPATH_SEARCH_PATHS = (
\t\t\t\t\t"$(inherited)",
\t\t\t\t\t"@executable_path/Frameworks",
\t\t\t\t\t"@executable_path/../../Frameworks",
\t\t\t\t);
\t\t\t\tMARKETING_VERSION = 1.0;
\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = ru.vitadots.focus.widget;
\t\t\t\tPRODUCT_NAME = "Vita Focus Widget";
\t\t\t\tSDKROOT = iphoneos;
\t\t\t\tSKIP_INSTALL = YES;
\t\t\t\tSWIFT_EMIT_LOC_STRINGS = YES;
\t\t\t\tSWIFT_VERSION = 5.0;
\t\t\t\tTARGETED_DEVICE_FAMILY = "1,2";
\t\t\t}};
\t\t\tname = Debug;
\t\t}};
\t\t{ids['widget_release']} /* Release */ = {{
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {{
\t\t\t\tCODE_SIGN_ENTITLEMENTS = "iOS (Widget)/VitaFocusWidget.entitlements";
\t\t\t\tCODE_SIGN_STYLE = Automatic;
\t\t\t\tCURRENT_PROJECT_VERSION = 1;
\t\t\t\tDEVELOPMENT_TEAM = 655542C66J;
\t\t\t\tGENERATE_INFOPLIST_FILE = YES;
\t\t\t\tINFOPLIST_FILE = "iOS (Widget)/Info.plist";
\t\t\t\tINFOPLIST_KEY_CFBundleDisplayName = "Vita Focus Widget";
\t\t\t\tINFOPLIST_KEY_NSHumanReadableCopyright = "";
\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = 17.0;
\t\t\t\tLD_RUNPATH_SEARCH_PATHS = (
\t\t\t\t\t"$(inherited)",
\t\t\t\t\t"@executable_path/Frameworks",
\t\t\t\t\t"@executable_path/../../Frameworks",
\t\t\t\t);
\t\t\t\tMARKETING_VERSION = 1.0;
\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = ru.vitadots.focus.widget;
\t\t\t\tPRODUCT_NAME = "Vita Focus Widget";
\t\t\t\tSDKROOT = iphoneos;
\t\t\t\tSKIP_INSTALL = YES;
\t\t\t\tSWIFT_EMIT_LOC_STRINGS = YES;
\t\t\t\tSWIFT_VERSION = 5.0;
\t\t\t\tTARGETED_DEVICE_FAMILY = "1,2";
\t\t\t\tVALIDATE_PRODUCT = YES;
\t\t\t}};
\t\t\tname = Release;
\t\t}};
"""
    text = text.replace("/* End XCBuildConfiguration section */", cfg + "\t/* End XCBuildConfiguration section */")

    cfg_list = f"""
\t\t{ids['widget_config_list']} /* Build configuration list for PBXNativeTarget "{MARKER}" */ = {{
\t\t\tisa = XCConfigurationList;
\t\t\tbuildConfigurations = (
\t\t\t\t{ids['widget_debug']} /* Debug */,
\t\t\t\t{ids['widget_release']} /* Release */,
\t\t\t);
\t\t\tdefaultConfigurationIsVisible = 0;
\t\t\tdefaultConfigurationName = Release;
\t\t}};
"""
    text = text.replace("/* End XCConfigurationList section */", cfg_list + "\t/* End XCConfigurationList section */")

    # Entitlements on iOS app + extension
    for old in (
        'INFOPLIST_FILE = "iOS (App)/Info.plist";\n\t\t\t\tINFOPLIST_KEY_CFBundleDisplayName = "Vita Focus";',
    ):
        text = text.replace(
            old,
            'CODE_SIGN_ENTITLEMENTS = "iOS (App)/VitaFocus.entitlements";\n\t\t\t\tINFOPLIST_FILE = "iOS (App)/Info.plist";\n\t\t\t\tINFOPLIST_KEY_CFBundleDisplayName = "Vita Focus";',
            2,
        )

    for old in (
        'INFOPLIST_FILE = "iOS (Extension)/Info.plist";\n\t\t\t\tINFOPLIST_KEY_CFBundleDisplayName = "Vita Focus Extension";',
    ):
        text = text.replace(
            old,
            'CODE_SIGN_ENTITLEMENTS = "iOS (Extension)/VitaFocusExtension.entitlements";\n\t\t\t\tINFOPLIST_FILE = "iOS (Extension)/Info.plist";\n\t\t\t\tINFOPLIST_KEY_CFBundleDisplayName = "Vita Focus Extension";',
            2,
        )

    PBX.write_text(text)
    print("widget target patched into project.pbxproj")
    return 0


if __name__ == "__main__":
    sys.exit(main())
