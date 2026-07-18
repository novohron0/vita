function show(platform, enabled, useSettingsInsteadOfPreferences) {
    document.body.classList.add(`platform-${platform}`);

    if (platform === "ios") syncNativeAppearance();

    if (useSettingsInsteadOfPreferences) {
        document.querySelector('.platform-mac.state-on').innerText =
            "Расширение включено. Можно открывать сайты в Safari.";
        document.querySelector('.platform-mac.state-off').innerText =
            "Расширение выключено. Включи его в настройках Safari.";
        document.querySelector('.platform-mac.state-unknown').innerText =
            "Включи расширение в Safari — и ленты перестанут отвлекать.";
        document.querySelector('.platform-mac.open-preferences').innerText =
            "Открыть настройки Safari…";
    }

    if (typeof enabled === "boolean") {
        document.body.classList.toggle(`state-on`, enabled);
        document.body.classList.toggle(`state-off`, !enabled);
    } else {
        document.body.classList.remove(`state-on`);
        document.body.classList.remove(`state-off`);
    }
}

function post(action) {
    webkit.messageHandlers.controller.postMessage(action);
}

const appTabNames = ["impulse", "focus", "target", "me"];
const appTabStorageKey = "vitaFocus.activeTab";
const appAppearanceStorageKey = "vitaFocus.appAppearance";
const appColorScheme = window.matchMedia("(prefers-color-scheme: dark)");
const appReduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function storedAppPreference(key, allowed, fallback) {
    try {
        const value = localStorage.getItem(key);
        return allowed.includes(value) ? value : fallback;
    } catch (_) {
        return fallback;
    }
}

function storeAppPreference(key, value) {
    try { localStorage.setItem(key, value); } catch (_) { /* WebView storage can be unavailable. */ }
}

let activeAppTab = storedAppPreference(appTabStorageKey, appTabNames, "impulse");
let appTabAnimationTimer = null;
let appAppearanceMode = storedAppPreference(
    appAppearanceStorageKey,
    ["system", "light", "dark"],
    "system"
);

function setAppTab(name, options = {}) {
    const next = appTabNames.includes(name) ? name : "impulse";
    const changed = activeAppTab !== next;
    activeAppTab = next;
    document.body.dataset.appTab = next;
    const nextContent = [];
    document.querySelectorAll("[data-app-tab-content]").forEach((element) => {
        const active = element.dataset.appTabContent === next;
        element.hidden = !active;
        element.classList.remove("app-tab-entering");
        if (active) nextContent.push(element);
    });
    if (changed && !appReduceMotion.matches) {
        if (appTabAnimationTimer) clearTimeout(appTabAnimationTimer);
        nextContent.forEach((element) => {
            void element.offsetWidth;
            element.classList.add("app-tab-entering");
        });
        appTabAnimationTimer = setTimeout(() => {
            nextContent.forEach((element) => element.classList.remove("app-tab-entering"));
            appTabAnimationTimer = null;
        }, 260);
    }
    document.querySelectorAll("[data-app-tab]").forEach((button) => {
        const active = button.dataset.appTab === next;
        button.classList.toggle("is-active", active);
        if (active) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
    });
    if (options.persist !== false) storeAppPreference(appTabStorageKey, next);
    if (options.scroll !== false && (changed || options.scrollCurrent === true)) {
        window.scrollTo({ top: 0, behavior: "auto" });
    }
}

function resolvedAppAppearance(mode = appAppearanceMode) {
    if (mode === "light" || mode === "dark") return mode;
    return appColorScheme.matches ? "dark" : "light";
}

function syncNativeAppearance() {
    if (!document.body.classList.contains("platform-ios")) return;
    post({ action: "set-app-appearance", mode: appAppearanceMode });
}

function applyAppAppearance(mode, persist = true) {
    appAppearanceMode = ["system", "light", "dark"].includes(mode) ? mode : "system";
    const resolved = resolvedAppAppearance();
    document.documentElement.dataset.appAppearance = resolved;
    document.documentElement.dataset.appAppearanceMode = appAppearanceMode;
    document.querySelectorAll("[data-app-theme]").forEach((button) => {
        const active = button.dataset.appTheme === appAppearanceMode;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
    });
    const summary = document.getElementById("appThemeSummary");
    if (summary) {
        const current = resolved === "dark" ? "тёмная" : "светлая";
        summary.textContent = appAppearanceMode === "system"
            ? `Как на устройстве · сейчас ${current}`
            : (resolved === "dark" ? "Всегда тёмная" : "Всегда светлая");
    }
    if (persist) storeAppPreference(appAppearanceStorageKey, appAppearanceMode);
    syncNativeAppearance();
}

document.querySelectorAll("[data-app-tab]").forEach((button) => {
    button.addEventListener("click", () => {
        const current = button.dataset.appTab === activeAppTab;
        setAppTab(button.dataset.appTab, { scrollCurrent: current });
    });
});

document.querySelector(".app-tab-bar")?.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const current = Math.max(0, appTabNames.indexOf(activeAppTab));
    let index = current;
    if (event.key === "ArrowLeft") index = (current - 1 + appTabNames.length) % appTabNames.length;
    if (event.key === "ArrowRight") index = (current + 1) % appTabNames.length;
    if (event.key === "Home") index = 0;
    if (event.key === "End") index = appTabNames.length - 1;
    event.preventDefault();
    const button = document.querySelector(`[data-app-tab="${appTabNames[index]}"]`);
    setAppTab(appTabNames[index]);
    button?.focus();
});

document.querySelectorAll("[data-app-theme]").forEach((button) => {
    button.addEventListener("click", () => applyAppAppearance(button.dataset.appTheme));
});

const handleAppColorSchemeChange = () => {
    if (appAppearanceMode === "system") applyAppAppearance("system", false);
};
if (typeof appColorScheme.addEventListener === "function") {
    appColorScheme.addEventListener("change", handleAppColorSchemeChange);
} else if (typeof appColorScheme.addListener === "function") {
    appColorScheme.addListener(handleAppColorSchemeChange);
}

applyAppAppearance(appAppearanceMode, false);
setAppTab(activeAppTab, { persist: false, scroll: false });

function showAppVersion(value) {
    if (typeof value !== "string") return;
    document.querySelectorAll(".app-version").forEach((label) => { label.textContent = value; });
}

document.querySelectorAll(".open-preferences").forEach((button) => button.addEventListener("click", () => post("open-preferences")));
document.querySelectorAll(".open-youtube").forEach((button) => button.addEventListener("click", () => post("open-youtube")));
document.querySelectorAll(".open-settings").forEach((button) => button.addEventListener("click", () => post("open-settings")));

function showDiagnostics(lines) {
    const box = document.getElementById("diagBody");
    if (!box || !Array.isArray(lines)) return;
    box.textContent = lines.join("\n");
}

function showGoalsSection() {
    const section = document.getElementById("goalsSection");
    if (!section) return;
    setAppTab("target", { scroll: false });
    requestAnimationFrame(() => {
        section.scrollIntoView({ behavior: appReduceMotion.matches ? "auto" : "smooth", block: "center" });
        section.classList.remove("is-deep-link-target");
        requestAnimationFrame(() => section.classList.add("is-deep-link-target"));
    });
    setTimeout(() => section.classList.remove("is-deep-link-target"), 2200);
}

let goalDotsState = { mode: "month", start: "", end: "" };
let goalDotsSavedState = { mode: "month", start: "", end: "" };

function shortDate(value) {
    if (!value) return "";
    const date = new Date(value + "T00:00:00");
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" })
        .format(date)
        .replace(".", "");
}

function updateGoalDotsSummary() {
    const summary = document.getElementById("goalDotsSummary");
    if (!summary) return;
    if (goalDotsSavedState.mode !== "goal") {
        summary.textContent = "Месяц";
        return;
    }
    const start = shortDate(goalDotsSavedState.start);
    const end = shortDate(goalDotsSavedState.end);
    summary.textContent = start && end ? `${start} — ${end}` : "Цель до 42 дней";
}

function maxGoalEnd(start) {
    if (!start) return "";
    const date = new Date(start + "T00:00:00Z");
    if (Number.isNaN(date.getTime())) return "";
    date.setUTCDate(date.getUTCDate() + 41);
    return date.toISOString().slice(0, 10);
}

function renderGoalDotsControls() {
    const isGoal = goalDotsState.mode === "goal";
    document.querySelectorAll(".goal-mode").forEach((button) => {
        const active = button.dataset.mode === goalDotsState.mode;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
    });
    const fields = document.getElementById("goalDateFields");
    if (fields) fields.hidden = !isGoal;
}

function showGoalDotsState(state) {
    if (!state || typeof state !== "object") return;
    if (state.mode === "month" || state.mode === "goal") goalDotsState.mode = state.mode;
    if (typeof state.start === "string") goalDotsState.start = state.start;
    if (typeof state.end === "string") goalDotsState.end = state.end;
    if (!state.isError) goalDotsSavedState = { ...goalDotsState };

    const start = document.getElementById("goalStart");
    const end = document.getElementById("goalEnd");
    if (start && document.activeElement !== start) start.value = goalDotsState.start;
    if (end && document.activeElement !== end) end.value = goalDotsState.end;
    if (end) {
        end.min = start?.value || goalDotsState.start;
        end.max = maxGoalEnd(start?.value || goalDotsState.start);
    }
    renderGoalDotsControls();
    updateGoalDotsSummary();

    const status = document.getElementById("goalDotsStatus");
    if (status) {
        status.textContent = state.status || "";
        status.classList.toggle("is-error", Boolean(state.isError));
        status.classList.toggle("is-success", Boolean(state.status) && !state.isError);
    }
    if (state.isError) document.getElementById("goalDotsDetails")?.setAttribute("open", "");
    const apply = document.getElementById("applyGoalDots");
    if (apply) apply.disabled = false;
}

document.querySelectorAll(".goal-mode").forEach((button) => {
    button.addEventListener("click", () => {
        goalDotsState.mode = button.dataset.mode === "goal" ? "goal" : "month";
        renderGoalDotsControls();
        const status = document.getElementById("goalDotsStatus");
        if (status) {
            status.textContent = "";
            status.classList.remove("is-error", "is-success");
        }
    });
});

document.getElementById("goalStart")?.addEventListener("change", (event) => {
    goalDotsState.start = event.target.value;
    const end = document.getElementById("goalEnd");
    if (end) {
        end.min = goalDotsState.start;
        end.max = maxGoalEnd(goalDotsState.start);
    }
});

document.getElementById("goalEnd")?.addEventListener("change", (event) => {
    goalDotsState.end = event.target.value;
});

document.getElementById("applyGoalDots")?.addEventListener("click", () => {
    const start = document.getElementById("goalStart")?.value || "";
    const end = document.getElementById("goalEnd")?.value || "";
    const status = document.getElementById("goalDotsStatus");
    const rangeDays = start && end
        ? Math.floor((Date.parse(end + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) / 86400000) + 1
        : 0;
    if (goalDotsState.mode === "goal" && (!start || !end || end < start || rangeDays > 42)) {
        if (status) {
            status.textContent = !start || !end
                ? "Выбери обе даты"
                : end < start
                    ? "Конец должен быть не раньше начала"
                    : "Максимальная цель — 42 дня";
            status.classList.add("is-error");
            status.classList.remove("is-success");
        }
        document.getElementById("goalDotsDetails")?.setAttribute("open", "");
        return;
    }
    const apply = document.getElementById("applyGoalDots");
    if (apply) apply.disabled = true;
    if (status) {
        status.textContent = "Сохраняем…";
        status.classList.remove("is-error", "is-success");
    }
    post({ action: "configure-goal-dots", mode: goalDotsState.mode, goalStart: start, goalEnd: end });
});

let habitConnectionState = { connected: false };
let habitEditing = false;
let habitConnectPending = false;

function renderHabitPanels() {
    const connected = Boolean(habitConnectionState.connected);
    const empty = document.getElementById("habitEmpty");
    const active = document.getElementById("habitConnected");
    const form = document.getElementById("habitConnectForm");
    if (empty) empty.hidden = connected || habitEditing;
    if (active) active.hidden = !connected || habitEditing;
    if (form) form.hidden = !habitEditing;
    document.querySelectorAll(".cancel-habit-edit").forEach((button) => {
        button.disabled = habitConnectPending;
    });
}

function editHabit() {
    habitEditing = true;
    const input = document.getElementById("habitCode");
    if (habitConnectionState.connected && input) input.value = "";
    const status = document.getElementById("habitStatus");
    if (status) {
        status.textContent = "";
        status.classList.remove("is-error", "is-success");
    }
    renderHabitPanels();
    input?.focus();
}

function showHabitState(state) {
    if (!state || typeof state !== "object") return;
    habitConnectionState = { ...habitConnectionState, ...state };
    if (state.status && !state.refreshing) habitConnectPending = false;
    if (state.connected && state.status && !state.isError && !state.refreshing) habitEditing = false;
    renderHabitPanels();

    const input = document.getElementById("habitCode");
    if (input && document.activeElement !== input && state.code) input.value = state.code;
    const title = document.getElementById("habitTitle");
    if (title) title.textContent = state.title || (state.refreshing ? "Загружаем цель…" : "Цель подключена");
    const done = Number(state.done) || 0;
    const days = Math.max(1, Number(state.days) || 1);
    const doneEl = document.getElementById("habitDone");
    if (doneEl) doneEl.textContent = state.hasData ? `${done}/${days}` : "—";
    const streak = document.getElementById("habitStreak");
    if (streak) streak.textContent = state.hasData ? `${Number(state.streak) || 0}🔥` : "—";
    const best = document.getElementById("habitBest");
    if (best) best.textContent = state.hasData ? String(Number(state.best) || 0) : "—";
    const dot = document.getElementById("habitDot");
    if (dot) dot.style.background = state.color || "#a855f7";
    const progress = document.getElementById("habitProgress");
    if (progress) {
        progress.style.width = state.hasData ? `${Math.min(100, done / days * 100)}%` : "0%";
        progress.style.background = state.color || "#a855f7";
    }

    const status = document.getElementById("habitStatus");
    if (status) {
        status.textContent = state.status || (state.refreshing ? "Обновляем…" : "");
        status.classList.toggle("is-error", Boolean(state.isError));
        status.classList.toggle("is-success", Boolean(state.status) && !state.isError);
    }
    const connect = document.getElementById("connectHabit");
    if (connect) connect.disabled = habitConnectPending || Boolean(state.refreshing);
}

function connectHabit() {
    const button = document.getElementById("connectHabit");
    const value = document.getElementById("habitCode")?.value.trim() || "";
    const status = document.getElementById("habitStatus");
    if (!value) {
        if (status) status.textContent = "Вставь ссылку на цель";
        status?.classList.add("is-error");
        return;
    }
    habitConnectPending = true;
    if (button) button.disabled = true;
    document.querySelectorAll(".cancel-habit-edit").forEach((cancel) => { cancel.disabled = true; });
    if (status) {
        status.textContent = "Подключаем…";
        status.classList.remove("is-error", "is-success");
    }
    post({ action: "connect-habit", value });
}

document.getElementById("connectHabit")?.addEventListener("click", connectHabit);
document.getElementById("habitCode")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") connectHabit();
});
document.querySelectorAll(".edit-habit").forEach((button) => button.addEventListener("click", editHabit));
document.querySelectorAll(".cancel-habit-edit").forEach((button) => {
    button.addEventListener("click", () => {
        habitEditing = false;
        const status = document.getElementById("habitStatus");
        if (status) {
            status.textContent = "";
            status.classList.remove("is-error", "is-success");
        }
        renderHabitPanels();
    });
});
document.querySelectorAll(".open-goals").forEach((button) => button.addEventListener("click", () => post("open-goals")));
document.querySelectorAll(".open-active-habit").forEach((button) => button.addEventListener("click", () => post("open-active-habit")));

function profileAvatarURL(value) {
    const raw = String(value || "").trim();
    const pathPattern = /^\/media\/avatar\/[a-z0-9]{10}\.jpg$/;
    if (pathPattern.test(raw)) return `https://vitadots.ru${raw}`;
    if (/^https:\/\/vitadots\.ru\/media\/avatar\/[a-z0-9]{10}\.jpg$/.test(raw)) return raw;
    return "";
}

function renderProfileTags(tags) {
    const root = document.getElementById("profileTags");
    if (!root) return;
    root.replaceChildren();
    const allowedRarities = new Set(["common", "rare", "epic", "legendary"]);
    (Array.isArray(tags) ? tags : []).forEach((tag) => {
        if (!tag || typeof tag !== "object") return;
        const item = document.createElement("span");
        item.className = "profile-tag";
        const rarity = allowedRarities.has(tag.rarity) ? tag.rarity : "common";
        item.dataset.rarity = rarity;
        item.title = String(tag.description || "");
        const icon = document.createElement("span");
        icon.className = "profile-tag-icon";
        icon.textContent = String(tag.icon || "◆");
        const name = document.createElement("span");
        name.textContent = String(tag.name || "Тег Vita");
        item.append(icon, name);
        root.append(item);
    });
}

let vitaProfileFieldsDirty = false;

function showVitaProfileState(state) {
    if (!state || typeof state !== "object") return;
    if (!state.connected || ["Профиль сохранён", "Аккаунт подключён", "Аккаунт создан"].includes(state.status)) {
        vitaProfileFieldsDirty = false;
    }
    const code = document.getElementById("vitaIDCode");
    if (code && state.code && document.activeElement !== code) code.value = state.code;
    const summary = document.getElementById("vitaIDSummary");
    if (summary) summary.textContent = state.connected
        ? `Код восстановления · ${Number(state.goals) || 0} целей`
        : "Код восстановления аккаунта";
    const disconnect = document.getElementById("disconnectVitaID");
    if (disconnect) disconnect.hidden = !state.connected;
    const connect = document.getElementById("connectVitaID");
    if (connect) {
        connect.disabled = Boolean(state.loading);
        connect.textContent = state.connected ? "Восстановить другой аккаунт" : "Восстановить по коду";
    }
    const name = document.getElementById("profileName");
    const handle = document.getElementById("profileHandle");
    const bio = document.getElementById("profileBio");
    if (!vitaProfileFieldsDirty) {
        if (name && document.activeElement !== name) name.value = String(state.name || "");
        if (handle && document.activeElement !== handle) handle.value = String(state.handle || "");
        if (bio && document.activeElement !== bio) bio.value = String(state.bio || "");
    }
    const displayName = document.getElementById("profileDisplayName");
    if (displayName) displayName.textContent = state.name || state.handle || (state.loading ? "Создаём профиль…" : "Твой профиль");
    const publicHandle = document.getElementById("profilePublicHandle");
    if (publicHandle) publicHandle.textContent = state.handle ? `@${state.handle}` : "Выбери публичный ник";
    const avatar = document.getElementById("profileAvatar");
    const avatarFallback = document.getElementById("profileAvatarFallback");
    const avatarURL = profileAvatarURL(state.avatar);
    if (avatar) {
        avatar.hidden = !avatarURL;
        if (avatarURL && avatar.src !== avatarURL) avatar.src = avatarURL;
    }
    if (avatarFallback) {
        avatarFallback.hidden = Boolean(avatarURL);
        avatarFallback.textContent = String(state.name || state.handle || "V").trim().charAt(0).toUpperCase() || "V";
    }
    renderProfileTags(state.tags);
    const save = document.getElementById("saveProfile");
    const pickAvatar = document.getElementById("pickProfileAvatar");
    if (save) save.disabled = Boolean(state.loading) || !state.connected;
    if (pickAvatar) pickAvatar.disabled = Boolean(state.loading) || !state.connected;
    const status = document.getElementById("vitaIDStatus");
    if (status) {
        status.textContent = state.status || "";
        status.classList.toggle("is-error", Boolean(state.isError));
        status.classList.toggle("is-success", Boolean(state.status) && !state.isError);
    }
    const profileStatus = document.getElementById("profileStatus");
    if (profileStatus) {
        profileStatus.textContent = state.status || "";
        profileStatus.classList.toggle("is-error", Boolean(state.isError));
        profileStatus.classList.toggle("is-success", Boolean(state.status) && !state.isError);
    }
    if (state.isError && !state.connected) document.getElementById("vitaIDDetails")?.setAttribute("open", "");
}

document.getElementById("connectVitaID")?.addEventListener("click", () => {
    const code = document.getElementById("vitaIDCode")?.value.trim() || "";
    const button = document.getElementById("connectVitaID");
    const status = document.getElementById("vitaIDStatus");
    if (code.length !== 10) {
        if (status) { status.textContent = "Вставь 10-значный Vita ID"; status.classList.add("is-error"); }
        return;
    }
    if (button) button.disabled = true;
    if (status) { status.textContent = "Подключаем…"; status.classList.remove("is-error", "is-success"); }
    post({ action: "connect-profile", code });
});

document.getElementById("disconnectVitaID")?.addEventListener("click", () => post({ action: "disconnect-profile" }));
document.getElementById("pickProfileAvatar")?.addEventListener("click", () => post({ action: "pick-profile-avatar" }));
["profileName", "profileHandle", "profileBio"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", () => { vitaProfileFieldsDirty = true; });
});
document.getElementById("saveProfile")?.addEventListener("click", () => {
    const handle = (document.getElementById("profileHandle")?.value || "").trim().replace(/^@/, "").toLowerCase();
    const name = (document.getElementById("profileName")?.value || "").trim();
    const bio = (document.getElementById("profileBio")?.value || "").trim();
    const status = document.getElementById("profileStatus");
    if (!/^[a-z0-9_]{3,24}$/.test(handle)) {
        if (status) {
            status.textContent = "Ник: 3–24 символа, только латиница, цифры и _";
            status.classList.add("is-error");
        }
        return;
    }
    if (name.length < 2) {
        if (status) {
            status.textContent = "Имя должно быть от 2 до 40 символов";
            status.classList.add("is-error");
        }
        return;
    }
    if (status) {
        status.textContent = "Сохраняем…";
        status.classList.remove("is-error", "is-success");
    }
    post({ action: "save-profile", handle, name, bio });
});

function impulseLocalDate(iso) {
    const date = iso ? new Date(iso) : new Date(Date.now() + 60 * 60 * 1000);
    if (Number.isNaN(date.getTime())) return "";
    const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return shifted.toISOString().slice(0, 16);
}

const impulseRepeatLabels = {
    none: "Один раз", daily: "Каждый день", weekdays: "По будням",
    weekly: "Каждую неделю", monthly: "Каждый месяц"
};
const impulseCompactRepeatLabels = {
    daily: "Ежедневно", weekdays: "По будням",
    weekly: "Еженедельно", monthly: "Ежемесячно"
};
const impulsePriorityLabels = { low: "Сила 1", medium: "Сила 2", high: "Сила 3" };
const impulseStatusLabels = {
    scheduled: "Запланировано", accepted: "Принято", snoozed: "Отложено",
    running: "В работе", completed: "Готово"
};
let impulseState = { items: [], folders: [] };
const impulseOtherFolderID = "__vita_other__";
let activeImpulseFolderID = null;
const expandedImpulseIDs = new Set();
let activeSheetImpulseID = "";
let impulseSheetReturnFocus = null;
let pendingImpulseFocusRestore = null;
let impulseFocusRestoreTimer = null;
let pendingImpulseDeleteID = "";
let impulseDeleteTimer = null;
let impulseSavePending = false;
let impulseEditorStep = 1;
let impulseCountdownTimer = null;
const refreshedExpiredImpulseTimers = new Set();
let impulseSheetCloseTimer = null;
let handledPendingImpulseAction = "";

function impulseDateLabel(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Время не задано";
    return new Intl.DateTimeFormat("ru-RU", {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
    }).format(date).replace(".", "");
}

function impulseCompactDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return { date: "Без даты", time: "—" };
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    let dateLabel;
    if (date.toDateString() === today.toDateString()) dateLabel = "Сегодня";
    else if (date.toDateString() === tomorrow.toDateString()) dateLabel = "Завтра";
    else {
        dateLabel = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" })
            .format(date)
            .replace(".", "");
    }
    const timeLabel = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(date);
    return { date: dateLabel, time: timeLabel };
}

function impulseFolderCountLabel(count) {
    const mod100 = count % 100;
    const mod10 = count % 10;
    const noun = mod100 >= 11 && mod100 <= 14
        ? "папок"
        : (mod10 === 1 ? "папка" : (mod10 >= 2 && mod10 <= 4 ? "папки" : "папок"));
    return `${count} ${noun}`;
}

function impulseType(item) {
    const value = item?.type || item?.kind;
    return value === "task" ? "task" : "reminder";
}

function selectedImpulseType() {
    return document.querySelector('input[name="impulseType"]:checked')?.value === "task" ? "task" : "reminder";
}

function impulseFolderKey(item) {
    return impulseFolder(item?.folderID) ? String(item.folderID) : impulseOtherFolderID;
}

function impulseFolderName(id) {
    if (id === impulseOtherFolderID) return "Другое";
    return impulseFolder(id)?.name || "Папка";
}

function animateImpulsePane(element, direction) {
    if (!element || appReduceMotion.matches) return;
    const className = direction === "back" ? "is-entering-back" : "is-entering-forward";
    element.classList.remove("is-entering-back", "is-entering-forward");
    void element.offsetWidth;
    element.classList.add(className);
    element.addEventListener("animationend", () => element.classList.remove(className), { once: true });
}

function impulseItem(id) {
    return impulseState.items.find((item) => String(item.id) === String(id));
}

function editedImpulse() {
    const id = document.getElementById("impulseID")?.value || "";
    return id ? impulseItem(id) : null;
}

function impulseEditorDateUnchanged(value, key) {
    const existing = editedImpulse();
    return Boolean(existing?.[key] && impulseLocalDate(existing[key]) === value);
}

function setImpulseStatus(message, isError = false, isSuccess = false) {
    const status = document.getElementById("impulseStatus");
    if (!status) return;
    status.textContent = message || "";
    status.classList.toggle("is-error", isError);
    status.classList.toggle("is-success", isSuccess && !isError);
}

function setImpulseEditorStatus(message, isError = false) {
    const status = document.getElementById("impulseEditorStatus");
    if (!status) return;
    status.textContent = message || "";
    status.classList.toggle("is-error", isError);
    status.classList.toggle("is-success", false);
}

function impulseFolder(id) {
    if (id == null || id === "") return null;
    return impulseState.folders.find((folder) => String(folder.id) === String(id)) || null;
}

function renderImpulseFolderOptions() {
    const select = document.getElementById("impulseFolder");
    if (!select) return;
    const selected = select.value;
    select.replaceChildren(new Option("Другое", ""));
    impulseState.folders.forEach((folder) => {
        select.append(new Option(folder.name || "Без названия", String(folder.id)));
    });
    select.value = impulseFolder(selected) ? selected : "";
}

function renderImpulseFolders() {
    renderImpulseFolderOptions();
    const list = document.getElementById("impulseFolderList");
    if (!list) return;
    list.replaceChildren();
    impulseState.folders.forEach((folder) => {
        const row = document.createElement("div");
        row.className = "impulse-folder-row";
        row.dataset.folderId = String(folder.id);
        const input = document.createElement("input");
        input.type = "text";
        input.maxLength = 40;
        input.value = folder.name || "";
        input.setAttribute("aria-label", `Название папки ${folder.name || "без названия"}`);
        const save = document.createElement("button");
        save.type = "button";
        save.className = "secondary compact";
        save.dataset.folderAction = "rename";
        save.textContent = "Сохранить";
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "text-action danger compact";
        remove.dataset.folderAction = "delete";
        remove.textContent = "Удалить";
        remove.setAttribute("aria-label", `Удалить папку ${folder.name || "без названия"}`);
        row.append(input, save, remove);
        list.append(row);
    });
    if (!impulseState.folders.length) {
        const empty = document.createElement("p");
        empty.className = "impulse-folder-empty";
        empty.textContent = "Пока нет папок";
        list.append(empty);
    }
    renderImpulseFolderOverview();
}

function activeImpulseItems() {
    return impulseState.items.filter((item) => (
        item
        && item.id != null
        && item.enabled !== false
        && !item.completed
        && item.status !== "completed"
    ));
}

function makeImpulseFolderTile(id, name, count, index, isOther = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `impulse-folder-tile${isOther ? " is-other" : ""}`;
    button.dataset.impulseFolderOpen = id;
    button.dataset.folderIndex = String(index % 6);
    button.setAttribute("aria-label", `${name}, ${count}`);

    const icon = document.createElement("span");
    icon.className = "impulse-folder-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = isOther ? "•••" : "▰";
    const amount = document.createElement("span");
    amount.className = "impulse-folder-count";
    amount.textContent = String(count);
    const title = document.createElement("span");
    title.className = "impulse-folder-name";
    title.textContent = name;
    button.append(icon, amount, title);
    return button;
}

function renderImpulseFolderOverview() {
    const grid = document.getElementById("impulseFolderGrid");
    if (!grid) return;
    const active = activeImpulseItems();
    const tiles = impulseState.folders.map((folder, index) => {
        const count = active.filter((item) => impulseFolderKey(item) === String(folder.id)).length;
        return makeImpulseFolderTile(String(folder.id), folder.name || "Без названия", count, index);
    });
    const otherCount = active.filter((item) => impulseFolderKey(item) === impulseOtherFolderID).length;
    tiles.push(makeImpulseFolderTile(impulseOtherFolderID, "Другое", otherCount, tiles.length, true));
    grid.replaceChildren(...tiles);
}

function openImpulseFolder(id, options = {}) {
    const normalized = id === impulseOtherFolderID || impulseFolder(id) ? String(id) : impulseOtherFolderID;
    activeImpulseFolderID = normalized;
    const overview = document.getElementById("impulseFolderOverview");
    const view = document.getElementById("impulseFolderView");
    if (overview) overview.hidden = true;
    if (view) {
        view.hidden = false;
        animateImpulsePane(view, options.direction || "forward");
    }
    renderImpulseList();
    if (options.focus !== false) setTimeout(() => document.getElementById("backImpulseFolders")?.focus(), 0);
}

function closeImpulseFolder(options = {}) {
    activeImpulseFolderID = null;
    const overview = document.getElementById("impulseFolderOverview");
    const view = document.getElementById("impulseFolderView");
    if (view) view.hidden = true;
    if (overview) {
        overview.hidden = false;
        animateImpulsePane(overview, "back");
    }
    renderImpulseFolderOverview();
    if (options.focus !== false) setTimeout(() => document.querySelector("[data-impulse-folder-open]")?.focus(), 0);
}

function revealImpulse(item, options = {}) {
    if (!item) return;
    if (options.expand !== false) expandedImpulseIDs.add(String(item.id));
    openImpulseFolder(impulseFolderKey(item), { focus: false });
    if (options.focus !== false) {
        setTimeout(() => impulseCard(item.id)?.querySelector(".impulse-item-summary")?.focus(), 0);
    }
}

function setImpulseFoldersOpen(open) {
    const manager = document.getElementById("impulseFolderManager");
    const toggle = document.getElementById("manageImpulseFolders");
    if (manager) manager.hidden = !open;
    if (toggle) toggle.setAttribute("aria-expanded", String(open));
    if (open) setTimeout(() => document.getElementById("impulseFolderName")?.focus(), 0);
}

function makeImpulseButton(label, action, className = "secondary") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.dataset.impulseAction = action;
    button.textContent = label;
    return button;
}

function impulseCard(id) {
    return Array.from(document.querySelectorAll("[data-impulse-id]"))
        .find((card) => String(card.dataset.impulseId) === String(id));
}

function focusImpulseReturnTarget(returnFocus) {
    if (!returnFocus) return;
    const card = impulseCard(returnFocus.impulseID);
    const cardTarget = card?.querySelector(".impulse-item-summary") || card?.querySelector("[data-impulse-action]");
    const fallback = document.getElementById("newImpulse");
    const target = cardTarget || (returnFocus.element?.isConnected ? returnFocus.element : null) || fallback;
    if (target instanceof HTMLElement && !target.hidden) target.focus();
}

function restoreImpulseFocusAfterRender() {
    if (!pendingImpulseFocusRestore || !document.getElementById("impulseSheet")?.hidden) return;
    focusImpulseReturnTarget(pendingImpulseFocusRestore);
    pendingImpulseFocusRestore = null;
    if (impulseFocusRestoreTimer) clearTimeout(impulseFocusRestoreTimer);
    impulseFocusRestoreTimer = null;
}

function resetImpulseDeleteButton(id) {
    const button = impulseCard(id)?.querySelector('[data-impulse-action="delete"]');
    const item = impulseItem(id);
    if (!button) return;
    button.textContent = "Удалить";
    button.classList.remove("is-confirming");
    button.setAttribute("aria-label", `Удалить: ${item?.title || "импульс"}`);
}

function armImpulseDelete(item, button) {
    if (impulseDeleteTimer) clearTimeout(impulseDeleteTimer);
    if (pendingImpulseDeleteID && pendingImpulseDeleteID !== String(item.id)) {
        resetImpulseDeleteButton(pendingImpulseDeleteID);
    }
    pendingImpulseDeleteID = String(item.id);
    button.textContent = "Точно удалить?";
    button.classList.add("is-confirming");
    button.setAttribute("aria-label", `Точно удалить: ${item.title || "импульс"}`);
    setImpulseStatus("Нажми ещё раз в течение 4 секунд");
    impulseDeleteTimer = setTimeout(() => {
        if (pendingImpulseDeleteID !== String(item.id)) return;
        pendingImpulseDeleteID = "";
        impulseDeleteTimer = null;
        resetImpulseDeleteButton(item.id);
        if (document.getElementById("impulseStatus")?.textContent === "Нажми ещё раз в течение 4 секунд") {
            setImpulseStatus("");
        }
    }, 4000);
}

function appendImpulseDetail(container, label, value, className = "") {
    if (!value) return;
    const row = document.createElement("div");
    row.className = `impulse-item-detail${className ? ` ${className}` : ""}`;
    const name = document.createElement("span");
    name.textContent = label;
    const content = document.createElement("strong");
    content.textContent = value;
    row.append(name, content);
    container.append(row);
}

function impulseCountdownLabel(endDate, now = Date.now()) {
    const end = new Date(endDate).getTime();
    if (Number.isNaN(end)) return "";
    const total = Math.max(0, Math.ceil((end - now) / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return hours > 0
        ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
        : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function syncImpulseCountdowns() {
    let hasRunning = false;
    const now = Date.now();
    document.querySelectorAll("[data-timer-end]").forEach((button) => {
        const end = new Date(button.dataset.timerEnd || "").getTime();
        if (Number.isNaN(end)) return;
        if (end <= now) {
            button.textContent = "Время вышло";
            button.setAttribute("aria-label", "Время задачи вышло");
            button.classList.add("is-running");
            const refreshKey = `${button.dataset.timerImpulseId || ""}:${button.dataset.timerEnd || ""}`;
            if (!refreshedExpiredImpulseTimers.has(refreshKey)) {
                refreshedExpiredImpulseTimers.add(refreshKey);
                post({ action: "refresh-impulses" });
            }
            return;
        }
        hasRunning = true;
        const left = impulseCountdownLabel(end, now);
        button.textContent = `Идёт · ${left}`;
        button.setAttribute("aria-label", `Задача идёт, осталось ${left}`);
    });
    if (!hasRunning && impulseCountdownTimer) {
        clearInterval(impulseCountdownTimer);
        impulseCountdownTimer = null;
    }
}

function refreshImpulseCountdownTimer() {
    syncImpulseCountdowns();
    const hasRunning = Array.from(document.querySelectorAll("[data-timer-end]"))
        .some((button) => new Date(button.dataset.timerEnd || "").getTime() > Date.now());
    if (hasRunning && !impulseCountdownTimer) {
        impulseCountdownTimer = setInterval(syncImpulseCountdowns, 1000);
    } else if (!hasRunning && impulseCountdownTimer) {
        clearInterval(impulseCountdownTimer);
        impulseCountdownTimer = null;
    }
}

function renderImpulseList() {
    const list = document.getElementById("impulseList");
    if (!list) return;
    list.replaceChildren();
    const items = impulseState.items.filter((item) => item && item.id != null);
    const folderItems = activeImpulseFolderID == null
        ? []
        : items.filter((item) => impulseFolderKey(item) === activeImpulseFolderID);

    folderItems.forEach((item) => {
        const id = String(item.id);
        const expanded = expandedImpulseIDs.has(id);
        const completed = item.completed || item.status === "completed";
        const type = impulseType(item);
        const card = document.createElement("article");
        card.className = "impulse-item";
        if (completed) card.classList.add("is-completed");
        if (item.enabled === false) card.classList.add("is-disabled");
        if (expanded) card.classList.add("is-expanded");
        card.dataset.impulseId = id;

        const summaryButton = document.createElement("button");
        summaryButton.type = "button";
        summaryButton.className = "impulse-item-summary";
        summaryButton.dataset.impulseAction = "toggle";
        summaryButton.setAttribute("aria-expanded", String(expanded));
        summaryButton.setAttribute("aria-label", `${item.title || "Без названия"}, показать детали`);
        const copy = document.createElement("span");
        const title = document.createElement("strong");
        title.className = "impulse-item-title";
        title.textContent = item.title || "Без названия";
        const compactMeta = document.createElement("span");
        compactMeta.className = "impulse-item-compact-meta";
        const compactDate = impulseCompactDate(item.fireDate);
        const date = document.createElement("span");
        date.textContent = compactDate.date;
        const time = document.createElement("time");
        time.dateTime = item.fireDate || "";
        time.textContent = compactDate.time;
        compactMeta.append(date, time);
        const repeatLabel = impulseCompactRepeatLabels[item.repeatRule];
        if (repeatLabel) {
            const repeat = document.createElement("span");
            repeat.className = "impulse-item-repeat";
            repeat.textContent = repeatLabel;
            compactMeta.append(repeat);
        }
        copy.append(title, compactMeta);
        const chevron = document.createElement("span");
        chevron.className = "impulse-item-chevron";
        chevron.setAttribute("aria-hidden", "true");
        chevron.textContent = "›";
        summaryButton.append(copy, chevron);
        card.append(summaryButton);

        const detailsShell = document.createElement("div");
        detailsShell.className = "impulse-item-details-shell";
        detailsShell.setAttribute("aria-hidden", String(!expanded));
        detailsShell.inert = !expanded;
        const detailsInner = document.createElement("div");
        detailsInner.className = "impulse-item-details-inner";
        const details = document.createElement("div");
        details.className = "impulse-item-details";
        appendImpulseDetail(
            details,
            "Тип",
            type === "task" ? `Задача · ${Number(item.durationMinutes) || 25} мин` : "Напоминание"
        );
        appendImpulseDetail(details, "Заметка", item.notes);
        appendImpulseDetail(details, "Первый шаг", item.firstStep);
        appendImpulseDetail(details, "Зачем", item.reason);
        appendImpulseDetail(details, "Дедлайн", item.deadline ? impulseDateLabel(item.deadline) : "", "is-deadline");
        appendImpulseDetail(details, "Предупреждение", item.deadlineAlertDate ? impulseDateLabel(item.deadlineAlertDate) : "");

        const badges = document.createElement("div");
        badges.className = "impulse-item-badges";
        if (impulsePriorityLabels[item.priority]) {
            const priority = document.createElement("span");
            priority.className = `impulse-priority priority-${item.priority}`;
            priority.textContent = impulsePriorityLabels[item.priority];
            badges.append(priority);
        }
        if (item.usesAlarm) {
            const alarm = document.createElement("span");
            alarm.className = "impulse-folder-badge";
            alarm.textContent = "Будильник";
            badges.append(alarm);
        }
        const statusLabel = impulseStatusLabels[item.status];
        if (statusLabel && item.status !== "scheduled") {
            const status = document.createElement("span");
            status.className = "impulse-folder-badge";
            status.textContent = statusLabel;
            badges.append(status);
        }
        if (badges.childElementCount) details.append(badges);

        const actions = document.createElement("div");
        actions.className = "impulse-item-actions";
        let actionButtons;
        if (completed) {
            actionButtons = [makeImpulseButton("Удалить", "delete", "text-action danger")];
            actions.classList.add("completed-actions");
        } else if (type === "task") {
            const start = makeImpulseButton("Начать", "start", "primary");
            const timerEnd = new Date(item.timerEndDate || "");
            if (!Number.isNaN(timerEnd.getTime()) && timerEnd.getTime() > Date.now()) {
                start.disabled = true;
                start.classList.add("is-running");
                start.dataset.timerEnd = timerEnd.toISOString();
                start.dataset.timerImpulseId = id;
            }
            actionButtons = [
                start,
                makeImpulseButton("Отложить", "snooze"),
                makeImpulseButton("Удалить", "delete", "text-action danger")
            ];
        } else {
            actionButtons = [
                makeImpulseButton("Готово", "complete", "primary"),
                makeImpulseButton("Изменить", "edit"),
                makeImpulseButton("Удалить", "delete", "text-action danger")
            ];
        }
        const deleteButton = actionButtons.find((button) => button.dataset.impulseAction === "delete");
        if (deleteButton && pendingImpulseDeleteID === id) {
            deleteButton.textContent = "Точно?";
            deleteButton.classList.add("is-confirming");
        }
        actionButtons.forEach((button) => {
            if (!button.hasAttribute("aria-label")) {
                button.setAttribute("aria-label", `${button.textContent}: ${item.title || "импульс"}`);
            }
        });
        actions.append(...actionButtons);
        details.append(actions);
        detailsInner.append(details);
        detailsShell.append(detailsInner);
        card.append(detailsShell);
        list.append(card);
    });

    const activeItems = activeImpulseItems();
    const activeInFolder = folderItems.filter((item) => item.enabled !== false && !item.completed && item.status !== "completed");
    const empty = document.getElementById("impulseEmpty");
    if (empty) empty.hidden = folderItems.length > 0;
    const title = document.getElementById("activeImpulseFolderTitle");
    if (title && activeImpulseFolderID != null) title.textContent = impulseFolderName(activeImpulseFolderID);
    const count = document.getElementById("activeImpulseFolderCount");
    if (count) count.textContent = String(activeInFolder.length);
    const pill = document.getElementById("impulsePill");
    if (pill) {
        pill.classList.toggle("is-active", activeItems.length > 0);
        const label = pill.querySelector("span");
        if (label) label.textContent = String(activeItems.length);
    }
    const next = activeInFolder
        .filter((item) => !Number.isNaN(new Date(item.fireDate).getTime()))
        .sort((a, b) => new Date(a.fireDate) - new Date(b.fireDate))[0];
    const summary = document.getElementById("impulseSummary");
    if (summary) {
        summary.textContent = activeImpulseFolderID == null
            ? impulseFolderCountLabel(impulseState.folders.length + 1)
            : (next ? `Следующий · ${impulseDateLabel(next.fireDate)}` : "В этой папке всё спокойно");
    }
    refreshImpulseCountdownTimer();
    restoreImpulseFocusAfterRender();
}

function fillImpulseEditor(item) {
    const values = {
        impulseID: item?.id == null ? "" : String(item.id),
        impulseTitle: item?.title || "",
        impulseNotes: item?.notes || "",
        impulseReason: item?.reason || "",
        impulseStep: item?.firstStep || "",
        impulseDate: impulseLocalDate(item?.fireDate),
        impulseDeadline: item?.deadline ? impulseLocalDate(item.deadline) : "",
        impulseRepeat: item?.repeatRule || "none",
        impulseFolder: item?.folderID == null ? "" : String(item.folderID)
    };
    Object.entries(values).forEach(([id, value]) => {
        const field = document.getElementById(id);
        if (field) field.value = value;
    });
    const priority = ["low", "medium", "high"].includes(item?.priority) ? item.priority : "medium";
    document.querySelectorAll('input[name="impulsePriority"]').forEach((input) => {
        input.checked = input.value === priority;
    });
    const type = impulseType(item);
    document.querySelectorAll('input[name="impulseType"]').forEach((input) => {
        input.checked = input.value === type;
    });
    const duration = document.getElementById("impulseDuration");
    if (duration) duration.value = String(Math.min(240, Math.max(1, Number(item?.durationMinutes) || 25)));
    const alarm = document.getElementById("impulseUsesAlarm");
    if (alarm) alarm.checked = item?.usesAlarm === true;
    const hasDeadline = document.getElementById("impulseHasDeadline");
    if (hasDeadline) hasDeadline.checked = Boolean(item?.deadline);
    const deadline = item?.deadline ? new Date(item.deadline) : null;
    const alert = item?.deadlineAlertDate ? new Date(item.deadlineAlertDate) : null;
    let alertRule = item?.deadline && !item?.deadlineAlertDate ? "none" : "atDeadline";
    if (deadline && alert && !Number.isNaN(deadline.getTime()) && !Number.isNaN(alert.getTime())) {
        const difference = Math.round((deadline.getTime() - alert.getTime()) / 60000);
        if (Math.abs(difference - 60) <= 1) alertRule = "hour1";
        else if (Math.abs(difference - 120) <= 1) alertRule = "hour2";
        else if (Math.abs(difference - 1440) <= 1) alertRule = "day1";
        else if (Math.abs(difference) > 1) alertRule = "custom";
    }
    const alertSelect = document.getElementById("impulseDeadlineAlert");
    if (alertSelect) alertSelect.value = alertRule;
    const custom = document.getElementById("impulseDeadlineCustom");
    if (custom) custom.value = alertRule === "custom" && item?.deadlineAlertDate ? impulseLocalDate(item.deadlineAlertDate) : "";
    updateImpulseTypeControls();
    updateImpulseDeadlineControls();
    const heading = document.getElementById("impulseEditorTitle");
    if (heading) heading.textContent = item ? "Изменить импульс" : "Новый импульс";
}

function updateImpulseTypeControls() {
    const task = selectedImpulseType() === "task";
    const duration = document.getElementById("impulseDurationWrap");
    if (duration) duration.hidden = !task;
    const heading = document.getElementById("impulseStepOneTitle");
    if (heading) heading.textContent = task ? "Задача" : "Напоминание";
    const progress = document.querySelector('[data-wizard-progress="1"] span');
    if (progress) progress.textContent = task ? "Задача" : "Напоминание";
}

function updateImpulseDeadlineControls() {
    const enabled = document.getElementById("impulseHasDeadline")?.checked === true;
    const fields = document.getElementById("impulseDeadlineFields");
    if (fields) fields.hidden = !enabled;
    const custom = document.getElementById("impulseDeadlineCustomWrap");
    if (custom) custom.hidden = !enabled || document.getElementById("impulseDeadlineAlert")?.value !== "custom";
}

function impulseDeadlineAlertDate(deadline) {
    if (!(deadline instanceof Date) || Number.isNaN(deadline.getTime())) return null;
    const rule = document.getElementById("impulseDeadlineAlert")?.value || "atDeadline";
    if (rule === "none") return null;
    if (rule === "custom") {
        const custom = new Date(document.getElementById("impulseDeadlineCustom")?.value || "");
        return Number.isNaN(custom.getTime()) ? null : custom;
    }
    const offsets = { atDeadline: 0, hour1: 60, hour2: 120, day1: 1440 };
    return new Date(deadline.getTime() - (offsets[rule] ?? 0) * 60000);
}

function renderImpulseEditorStep() {
    document.querySelectorAll("[data-impulse-step]").forEach((panel) => {
        const active = Number(panel.dataset.impulseStep) === impulseEditorStep;
        panel.hidden = !active;
        panel.classList.remove("is-entering");
        if (active && !appReduceMotion.matches) {
            void panel.offsetWidth;
            panel.classList.add("is-entering");
            panel.addEventListener("animationend", () => panel.classList.remove("is-entering"), { once: true });
        }
    });
    document.querySelectorAll("[data-wizard-progress]").forEach((item) => {
        const step = Number(item.dataset.wizardProgress);
        item.classList.toggle("is-active", step === impulseEditorStep);
        item.classList.toggle("is-complete", step < impulseEditorStep);
        if (step === impulseEditorStep) item.setAttribute("aria-current", "step");
        else item.removeAttribute("aria-current");
    });
    const label = document.getElementById("impulseEditorStepLabel");
    if (label) label.textContent = `Шаг ${impulseEditorStep} из 4`;
    const back = document.getElementById("impulseEditorBack");
    const next = document.getElementById("impulseEditorNext");
    const save = document.getElementById("saveImpulse");
    if (back) back.hidden = impulseEditorStep === 1;
    if (next) next.hidden = impulseEditorStep === 4;
    if (save) save.hidden = impulseEditorStep !== 4;
    setImpulseEditorStatus("");
}

function validateImpulseEditorStep(step) {
    if (step === 1) {
        const title = document.getElementById("impulseTitle")?.value.trim() || "";
        if (!title) {
            setImpulseEditorStatus("Напиши название напоминания", true);
            document.getElementById("impulseTitle")?.focus();
            return false;
        }
    }
    if (step === 2) {
        const value = document.getElementById("impulseDate")?.value || "";
        const date = new Date(value);
        const unchanged = impulseEditorDateUnchanged(value, "fireDate");
        if (!value || Number.isNaN(date.getTime()) || (!unchanged && date.getTime() < Date.now() + 5000)) {
            setImpulseEditorStatus("Выбери дату и время в будущем", true);
            document.getElementById("impulseDate")?.focus();
            return false;
        }
        if (selectedImpulseType() === "task") {
            const duration = Number(document.getElementById("impulseDuration")?.value || 0);
            if (!Number.isInteger(duration) || duration < 1 || duration > 240) {
                setImpulseEditorStatus("Время задачи — от 1 до 240 минут", true);
                document.getElementById("impulseDuration")?.focus();
                return false;
            }
        }
    }
    if (step === 3 && document.getElementById("impulseHasDeadline")?.checked) {
        const fireDate = new Date(document.getElementById("impulseDate")?.value || "");
        const value = document.getElementById("impulseDeadline")?.value || "";
        const deadline = new Date(value);
        if (!value || Number.isNaN(deadline.getTime()) || deadline <= fireDate) {
            setImpulseEditorStatus("Дедлайн должен быть позже напоминания", true);
            document.getElementById("impulseDeadline")?.focus();
            return false;
        }
        if (document.getElementById("impulseDeadlineAlert")?.value === "custom") {
            const customValue = document.getElementById("impulseDeadlineCustom")?.value || "";
            const custom = new Date(customValue);
            if (!customValue || Number.isNaN(custom.getTime()) || custom > deadline) {
                setImpulseEditorStatus("Своё предупреждение должно быть не позже дедлайна", true);
                document.getElementById("impulseDeadlineCustom")?.focus();
                return false;
            }
        }
        const alertDate = impulseDeadlineAlertDate(deadline);
        if (document.getElementById("impulseDeadlineAlert")?.value !== "none") {
            const alertUnchanged = Boolean(
                editedImpulse()?.deadlineAlertDate
                && impulseLocalDate(editedImpulse().deadlineAlertDate) === impulseLocalDate(alertDate)
            );
            if (!alertDate || (!alertUnchanged && alertDate.getTime() < Date.now() + 5000)) {
                setImpulseEditorStatus("Выбери предупреждение, которое ещё не прошло", true);
                document.getElementById("impulseDeadlineAlert")?.focus();
                return false;
            }
            if (alertDate <= fireDate) {
                setImpulseEditorStatus("Предупреждение о дедлайне должно быть позже первого напоминания", true);
                document.getElementById("impulseDeadlineAlert")?.focus();
                return false;
            }
        }
    }
    if (step === 4) {
        const firstStep = document.getElementById("impulseStep")?.value.trim() || "";
        if (!firstStep) {
            setImpulseEditorStatus("Добавь самый маленький шаг", true);
            document.getElementById("impulseStep")?.focus();
            return false;
        }
    }
    setImpulseEditorStatus("");
    return true;
}

function openImpulseEditor(item = null, presetFolderID = null) {
    renderImpulseFolderOptions();
    fillImpulseEditor(item);
    if (!item) {
        const folder = document.getElementById("impulseFolder");
        const selected = presetFolderID || activeImpulseFolderID;
        if (folder) folder.value = selected && selected !== impulseOtherFolderID && impulseFolder(selected) ? String(selected) : "";
    }
    impulseEditorStep = 1;
    renderImpulseEditorStep();
    const editor = document.getElementById("impulseEditor");
    const create = document.getElementById("newImpulse");
    if (editor) editor.hidden = false;
    if (create) create.hidden = true;
    setImpulseStatus("");
    document.getElementById("impulseTitle")?.focus();
}

function closeImpulseEditor(force = false) {
    if (impulseSavePending && force !== true) return;
    const editor = document.getElementById("impulseEditor");
    const create = document.getElementById("newImpulse");
    if (editor) editor.hidden = true;
    if (create) create.hidden = false;
    setImpulseEditorStatus("");
}

function impulseDeadlineText(value) {
    const deadline = new Date(value);
    if (Number.isNaN(deadline.getTime())) return "";
    const distance = deadline.getTime() - Date.now();
    if (distance <= 0) return `Дедлайн прошёл · ${impulseDateLabel(value)}`;
    const totalMinutes = Math.ceil(distance / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    const left = days > 0 ? `${days} д ${hours} ч` : hours > 0 ? `${hours} ч ${minutes} мин` : `${minutes} мин`;
    return `${left} · до ${impulseDateLabel(value)}`;
}

function showImpulseSheetView(view) {
    const accept = document.getElementById("impulseAcceptView");
    const snooze = document.getElementById("impulseSnoozeView");
    const isTask = impulseType(impulseItem(activeSheetImpulseID)) === "task";
    if (accept) accept.hidden = view !== "accept";
    if (snooze) snooze.hidden = view !== "snooze";
    const back = document.getElementById("backToImpulseAccept");
    if (back) back.hidden = view === "snooze" && isTask;
    const eyebrow = document.getElementById("impulseSheetEyebrow");
    if (eyebrow) eyebrow.textContent = view === "snooze" ? "Перед тем как отложить" : "Vita Импульс";
    if (view === "snooze") {
        const exact = document.getElementById("snoozeImpulseDate");
        if (exact) exact.value = impulseLocalDate(new Date(Date.now() + 30 * 60000).toISOString());
    }
}

function revealImpulseSheetLayer(sheet) {
    if (!sheet) return;
    if (impulseSheetCloseTimer) {
        clearTimeout(impulseSheetCloseTimer);
        impulseSheetCloseTimer = null;
    }
    sheet.hidden = false;
    sheet.classList.remove("is-open");
    if (appReduceMotion.matches) sheet.classList.add("is-open");
    else requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add("is-open")));
}

function openImpulseSheet(item, view = "accept") {
    if (!item) return;
    if (document.getElementById("impulseSheet")?.hidden) {
        impulseSheetReturnFocus = { element: document.activeElement, impulseID: String(item.id) };
    }
    activeSheetImpulseID = String(item.id);
    const sheet = document.getElementById("impulseSheet");
    const title = document.getElementById("impulseSheetTitle");
    const reason = document.getElementById("sheetImpulseReason");
    const step = document.getElementById("sheetImpulseStep");
    if (title) title.textContent = item.title || "Вернись к важному";
    if (reason) reason.textContent = item.reason || "Ты выбрал это не случайно";
    if (step) step.textContent = item.firstStep || "Сделай один маленький шаг";
    const deadlineWrap = document.getElementById("sheetImpulseDeadlineWrap");
    const deadline = document.getElementById("sheetImpulseDeadline");
    if (deadlineWrap) deadlineWrap.hidden = !item.deadline;
    if (deadline && item.deadline) deadline.textContent = impulseDeadlineText(item.deadline);
    const sheetStatus = document.getElementById("impulseSheetStatus");
    if (sheetStatus) {
        sheetStatus.textContent = "";
        sheetStatus.classList.remove("is-error", "is-success");
    }
    showImpulseSheetView(view);
    revealImpulseSheetLayer(sheet);
    const shell = document.querySelector(".shell");
    if (shell) {
        shell.setAttribute("aria-hidden", "true");
        shell.inert = true;
    }
    document.body.classList.add("has-impulse-sheet");
    setTimeout(() => document.querySelector("#impulseSheet .icon-button")?.focus(), 0);
}

function closeImpulseSheet() {
    const sheet = document.getElementById("impulseSheet");
    if (!sheet || sheet.hidden || impulseSheetCloseTimer) return;
    sheet.classList.remove("is-open");
    const finish = () => {
        sheet.hidden = true;
        const shell = document.querySelector(".shell");
        if (shell) {
            shell.removeAttribute("aria-hidden");
            shell.inert = false;
        }
        document.body.classList.remove("has-impulse-sheet");
        activeSheetImpulseID = "";
        pendingImpulseFocusRestore = impulseSheetReturnFocus;
        focusImpulseReturnTarget(pendingImpulseFocusRestore);
        if (impulseFocusRestoreTimer) clearTimeout(impulseFocusRestoreTimer);
        impulseFocusRestoreTimer = setTimeout(() => {
            pendingImpulseFocusRestore = null;
            impulseFocusRestoreTimer = null;
        }, 1200);
        impulseSheetReturnFocus = null;
        impulseSheetCloseTimer = null;
    };
    if (appReduceMotion.matches) finish();
    else impulseSheetCloseTimer = setTimeout(finish, 330);
}

function pendingImpulseAction(pending) {
    if (!pending) return null;
    const rawType = typeof pending === "string" ? pending : pending.type || pending.kind || pending.action;
    if (typeof rawType !== "string") return null;
    let type = rawType.replace("-impulse", "");
    if (type === "view") type = "open";
    const id = typeof pending === "object" ? pending.id || pending.impulseId : impulseState.pendingImpulseId;
    return { type, id };
}

function showImpulseState(state) {
    if (!state || typeof state !== "object") return;
    impulseState = {
        ...impulseState,
        ...state,
        items: Array.isArray(state.items) ? state.items : impulseState.items,
        folders: Array.isArray(state.folders) ? state.folders.filter((folder) => folder && folder.id != null) : impulseState.folders
    };
    if (activeImpulseFolderID && activeImpulseFolderID !== impulseOtherFolderID && !impulseFolder(activeImpulseFolderID)) {
        activeImpulseFolderID = impulseOtherFolderID;
    }
    renderImpulseFolders();
    if (state.selectedFolderID != null) {
        const folder = document.getElementById("impulseFolder");
        if (folder) folder.value = String(state.selectedFolderID);
    }
    renderImpulseList();
    const supportsAlarm = state.supportsAlarm === true;
    const alarmControl = document.getElementById("impulseAlarmControl");
    const alarm = document.getElementById("impulseUsesAlarm");
    if (alarmControl) alarmControl.hidden = !supportsAlarm;
    if (alarm) {
        alarm.disabled = !supportsAlarm;
        if (!supportsAlarm) alarm.checked = false;
    }
    const folderStatus = document.getElementById("impulseFolderStatus");
    if (folderStatus && typeof state.folderStatus === "string") {
        folderStatus.textContent = state.folderStatus;
        folderStatus.classList.toggle("is-error", Boolean(state.folderIsError));
        folderStatus.classList.toggle("is-success", !state.folderIsError);
    }

    const save = document.getElementById("saveImpulse");
    if (save && (!impulseSavePending || state.saveResult === true)) save.disabled = false;
    if (impulseSavePending && state.saveResult === true) {
        const savedID = document.getElementById("impulseID");
        if (savedID && state.savedImpulseID != null) savedID.value = String(state.savedImpulseID);
        impulseSavePending = false;
        if (!state.isError) closeImpulseEditor(true);
        else setImpulseEditorStatus(state.status || "Не удалось сохранить", true);
    }
    setImpulseStatus(state.status || "", Boolean(state.isError), Boolean(state.status));

    const pending = pendingImpulseAction(state.pendingAction);
    if (!pending) handledPendingImpulseAction = "";
    if (pending) {
        const snoozeUntil = typeof state.pendingAction === "object" ? state.pendingAction.snoozeUntil : null;
        const pendingKey = `${pending.type}:${pending.id || ""}:${snoozeUntil || ""}`;
        if (pendingKey !== handledPendingImpulseAction) {
            handledPendingImpulseAction = pendingKey;
            setAppTab("impulse", { scroll: false });
            const item = impulseItem(pending.id) || (typeof state.pendingAction === "object" ? state.pendingAction.item : null);
            if (pending.type === "open") revealImpulse(item);
            if (pending.type === "edit") {
                revealImpulse(item, { focus: false });
                openImpulseEditor(item);
            }
            if (pending.type === "start") {
                revealImpulse(item);
                const timerEnd = new Date(item?.timerEndDate || "").getTime();
                if (item && impulseType(item) === "task" && !(timerEnd > Date.now())) {
                    post({ action: "start-impulse", id: item.id, durationMinutes: Number(item.durationMinutes) || 25 });
                }
            }
            if (pending.type === "accept" || pending.type === "snooze") {
                openImpulseSheet(item, pending.type);
                const exact = document.getElementById("snoozeImpulseDate");
                if (pending.type === "snooze" && exact && snoozeUntil) exact.value = impulseLocalDate(snoozeUntil);
            }
        }
    }
}

document.getElementById("manageImpulseFolders")?.addEventListener("click", () => {
    const manager = document.getElementById("impulseFolderManager");
    setImpulseFoldersOpen(Boolean(manager?.hidden));
});
document.getElementById("closeImpulseFolders")?.addEventListener("click", () => setImpulseFoldersOpen(false));
document.getElementById("newImpulseFolderFromEditor")?.addEventListener("click", () => setImpulseFoldersOpen(true));
document.getElementById("impulseFolderGrid")?.addEventListener("click", (event) => {
    const folder = event.target.closest("[data-impulse-folder-open]");
    if (folder) openImpulseFolder(folder.dataset.impulseFolderOpen);
});
document.getElementById("backImpulseFolders")?.addEventListener("click", () => closeImpulseFolder());
document.getElementById("createImpulseFolder")?.addEventListener("click", () => {
    const input = document.getElementById("impulseFolderName");
    const name = input?.value.trim() || "";
    const status = document.getElementById("impulseFolderStatus");
    if (!name) {
        if (status) { status.textContent = "Напиши название папки"; status.classList.add("is-error"); }
        input?.focus();
        return;
    }
    post({ action: "create-impulse-folder", name });
    if (input) input.value = "";
    if (status) { status.textContent = "Создаём…"; status.classList.remove("is-error", "is-success"); }
});
document.getElementById("impulseFolderName")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        event.preventDefault();
        document.getElementById("createImpulseFolder")?.click();
    }
});
document.getElementById("impulseFolderList")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-folder-action]");
    const row = button?.closest("[data-folder-id]");
    if (!button || !row) return;
    const id = row.dataset.folderId || "";
    if (button.dataset.folderAction === "rename") {
        const name = row.querySelector("input")?.value.trim() || "";
        if (!name) {
            const status = document.getElementById("impulseFolderStatus");
            if (status) { status.textContent = "Название папки не может быть пустым"; status.classList.add("is-error"); }
            row.querySelector("input")?.focus();
            return;
        }
        post({ action: "rename-impulse-folder", folderID: id, name });
    }
    if (button.dataset.folderAction === "delete") {
        post({ action: "delete-impulse-folder", folderID: id });
    }
});

document.getElementById("newImpulse")?.addEventListener("click", () => openImpulseEditor(null, activeImpulseFolderID));
document.getElementById("cancelImpulseEdit")?.addEventListener("click", closeImpulseEditor);
document.querySelectorAll('input[name="impulseType"]').forEach((input) => {
    input.addEventListener("change", updateImpulseTypeControls);
});
document.getElementById("impulseEditorBack")?.addEventListener("click", () => {
    if (impulseEditorStep <= 1) return;
    impulseEditorStep -= 1;
    renderImpulseEditorStep();
    document.querySelector(`[data-impulse-step="${impulseEditorStep}"] input, [data-impulse-step="${impulseEditorStep}"] textarea, [data-impulse-step="${impulseEditorStep}"] select`)?.focus();
});
document.getElementById("impulseEditorNext")?.addEventListener("click", () => {
    if (!validateImpulseEditorStep(impulseEditorStep) || impulseEditorStep >= 4) return;
    impulseEditorStep += 1;
    renderImpulseEditorStep();
    document.querySelector(`[data-impulse-step="${impulseEditorStep}"] input, [data-impulse-step="${impulseEditorStep}"] textarea, [data-impulse-step="${impulseEditorStep}"] select`)?.focus();
});
document.getElementById("impulseHasDeadline")?.addEventListener("change", updateImpulseDeadlineControls);
document.getElementById("impulseDeadlineAlert")?.addEventListener("change", updateImpulseDeadlineControls);

document.getElementById("impulseList")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-impulse-action]");
    const card = button?.closest("[data-impulse-id]");
    if (!button || !card) return;
    const item = impulseItem(card.dataset.impulseId);
    if (!item) return;
    switch (button.dataset.impulseAction) {
    case "toggle": {
        const id = String(item.id);
        const expanded = !expandedImpulseIDs.has(id);
        if (expanded) expandedImpulseIDs.add(id);
        else expandedImpulseIDs.delete(id);
        card.classList.toggle("is-expanded", expanded);
        button.setAttribute("aria-expanded", String(expanded));
        button.setAttribute("aria-label", `${item.title || "Без названия"}, ${expanded ? "скрыть" : "показать"} детали`);
        const details = card.querySelector(".impulse-item-details-shell");
        if (details) {
            details.setAttribute("aria-hidden", String(!expanded));
            details.inert = !expanded;
        }
        break;
    }
    case "edit": openImpulseEditor(item); break;
    case "accept":
        post({ action: "accept-impulse", id: item.id });
        openImpulseSheet(item, "accept");
        break;
    case "start":
        button.disabled = true;
        button.textContent = "Запускаем…";
        post({ action: "start-impulse", id: item.id, durationMinutes: Number(item.durationMinutes) || 25 });
        break;
    case "snooze": openImpulseSheet(item, "snooze"); break;
    case "complete": post({ action: "complete-impulse", id: item.id }); break;
    case "delete":
        if (pendingImpulseDeleteID === String(item.id)) {
            if (impulseDeleteTimer) clearTimeout(impulseDeleteTimer);
            pendingImpulseDeleteID = "";
            impulseDeleteTimer = null;
            button.disabled = true;
            button.textContent = "Удаляем…";
            post({ action: "delete-impulse", id: item.id });
        } else {
            armImpulseDelete(item, button);
        }
        break;
    default: break;
    }
});

document.getElementById("impulseEditor")?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (impulseEditorStep < 4) {
        if (validateImpulseEditorStep(impulseEditorStep)) {
            impulseEditorStep += 1;
            renderImpulseEditorStep();
        }
        return;
    }
    if (!validateImpulseEditorStep(4)) return;
    const id = document.getElementById("impulseID")?.value || "";
    const title = document.getElementById("impulseTitle")?.value.trim() || "";
    const notes = document.getElementById("impulseNotes")?.value.trim() || "";
    const reason = document.getElementById("impulseReason")?.value.trim() || "";
    const firstStep = document.getElementById("impulseStep")?.value.trim() || "";
    const type = selectedImpulseType();
    const durationMinutes = type === "task" ? Number(document.getElementById("impulseDuration")?.value || 0) : null;
    const fireValue = document.getElementById("impulseDate")?.value || "";
    const existing = id ? impulseItem(id) : null;
    const fireDate = existing?.fireDate && impulseLocalDate(existing.fireDate) === fireValue
        ? new Date(existing.fireDate)
        : new Date(fireValue);
    const hasDeadline = document.getElementById("impulseHasDeadline")?.checked === true;
    const deadlineValue = document.getElementById("impulseDeadline")?.value || "";
    const deadlineDate = hasDeadline
        ? (existing?.deadline && impulseLocalDate(existing.deadline) === deadlineValue
            ? new Date(existing.deadline)
            : new Date(deadlineValue))
        : null;
    const calculatedDeadlineAlert = hasDeadline ? impulseDeadlineAlertDate(deadlineDate) : null;
    const deadlineAlertDate = existing?.deadlineAlertDate
        && calculatedDeadlineAlert
        && impulseLocalDate(existing.deadlineAlertDate) === impulseLocalDate(calculatedDeadlineAlert)
        ? new Date(existing.deadlineAlertDate)
        : calculatedDeadlineAlert;
    const save = document.getElementById("saveImpulse");
    if (save) save.disabled = true;
    impulseSavePending = true;
    setImpulseEditorStatus("Сохраняем…");
    post({
        action: "save-impulse",
        id: id || null,
        title,
        notes,
        reason,
        firstStep,
        type,
        durationMinutes,
        fireDate: fireDate.toISOString(),
        deadline: deadlineDate ? deadlineDate.toISOString() : null,
        deadlineAlertDate: deadlineAlertDate ? deadlineAlertDate.toISOString() : null,
        usesAlarm: impulseState.supportsAlarm === true && document.getElementById("impulseUsesAlarm")?.checked === true,
        folderID: document.getElementById("impulseFolder")?.value || null,
        priority: document.querySelector('input[name="impulsePriority"]:checked')?.value || "medium",
        repeatRule: document.getElementById("impulseRepeat")?.value || "none",
    });
});

document.querySelectorAll("[data-sheet-close]").forEach((button) => button.addEventListener("click", closeImpulseSheet));
document.getElementById("openImpulseSnooze")?.addEventListener("click", () => showImpulseSheetView("snooze"));
document.getElementById("backToImpulseAccept")?.addEventListener("click", () => showImpulseSheetView("accept"));

function snoozeImpulse(until) {
    const date = new Date(until);
    const item = impulseItem(activeSheetImpulseID);
    const deadline = item?.deadline ? new Date(item.deadline) : null;
    const sheetStatus = document.getElementById("impulseSheetStatus");
    if (!activeSheetImpulseID || Number.isNaN(date.getTime()) || date.getTime() < Date.now() + 5000) {
        if (sheetStatus) {
            sheetStatus.textContent = "Выбери время в будущем";
            sheetStatus.classList.add("is-error");
        }
        return;
    }
    if (deadline && !Number.isNaN(deadline.getTime()) && date >= deadline) {
        if (sheetStatus) {
            sheetStatus.textContent = `Нужно успеть до ${impulseDateLabel(item.deadline)}`;
            sheetStatus.classList.add("is-error");
        }
        return;
    }
    post({ action: "snooze-impulse", id: activeSheetImpulseID, until: date.toISOString() });
    closeImpulseSheet();
}

document.querySelectorAll("[data-snooze-minutes]").forEach((button) => {
    button.addEventListener("click", () => snoozeImpulse(Date.now() + Number(button.dataset.snoozeMinutes) * 60000));
});
document.querySelector("[data-snooze-tomorrow]")?.addEventListener("click", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    snoozeImpulse(tomorrow);
});
document.getElementById("confirmImpulseSnooze")?.addEventListener("click", () => {
    snoozeImpulse(document.getElementById("snoozeImpulseDate")?.value || "");
});

document.getElementById("completeImpulseFromSheet")?.addEventListener("click", () => {
    if (!activeSheetImpulseID) return;
    post({ action: "complete-impulse", id: activeSheetImpulseID });
    closeImpulseSheet();
});

document.addEventListener("keydown", (event) => {
    const sheet = document.getElementById("impulseSheet");
    if (sheet?.hidden) return;
    if (event.key === "Escape") {
        closeImpulseSheet();
        return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(sheet.querySelectorAll("button:not([disabled]), input:not([disabled]), select:not([disabled])"))
        .filter((element) => element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
});

let widgetHasPhoto = false;
let widgetThemeState = {
    theme: "graphite",
    dotStyle: "goal",
    dotColor: "auto",
    customDotColor: "#A855F7"
};

const themeLabels = { graphite: "Графит", violet: "Vita", ocean: "Океан", ember: "Закат", photo: "Фото" };
const dotStyleLabels = { goal: "Авто", circle: "Круг", soft: "Скруглённые", square: "Квадрат", diamond: "Ромб", heart: "Сердце", star: "Звезда", hex: "Соты" };
const dotColorLabels = {
    auto: "Авто",
    "#A855F7": "Vita",
    "#38BDF8": "Небо",
    "#34D399": "Мята",
    "#FACC15": "Солнце",
    "#FB923C": "Огонь",
    "#F472B6": "Розовый",
    "#F8FAFC": "Белый"
};

function updateAppearanceSummary() {
    const summary = document.getElementById("appearanceSummary");
    if (!summary) return;
    const theme = themeLabels[widgetThemeState.theme] || "Тема";
    const style = dotStyleLabels[widgetThemeState.dotStyle] || "Форма";
    const color = dotColorLabels[widgetThemeState.dotColor] || "Свой цвет";
    summary.textContent = `${theme} · ${style} · ${color}`;
}

function normalizedDotColor(value) {
    if (typeof value !== "string") return null;
    if (value.toLowerCase() === "auto") return "auto";
    const normalized = value.toUpperCase();
    return /^#[0-9A-F]{6}$/.test(normalized) ? normalized : null;
}

function showWidgetTheme(state) {
    if (!state || typeof state !== "object") return;
    if (typeof state.theme === "string") widgetThemeState.theme = state.theme;
    if (typeof state.dotStyle === "string") widgetThemeState.dotStyle = state.dotStyle;
    const nextDotColor = normalizedDotColor(state.dotColor);
    const nextCustomColor = normalizedDotColor(state.customDotColor);
    if (nextDotColor) widgetThemeState.dotColor = nextDotColor;
    if (nextCustomColor && nextCustomColor !== "auto") widgetThemeState.customDotColor = nextCustomColor;
    if (typeof state.hasPhoto === "boolean") widgetHasPhoto = state.hasPhoto;
    document.querySelectorAll(".widget-theme").forEach((button) => {
        const active = button.dataset.theme === widgetThemeState.theme;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
    });
    document.querySelectorAll(".dot-style").forEach((button) => {
        const active = button.dataset.style === widgetThemeState.dotStyle;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
    });
    const presetColors = Array.from(document.querySelectorAll(".dot-color"), (button) =>
        normalizedDotColor(button.dataset.color)
    ).filter(Boolean);
    document.querySelectorAll(".dot-color").forEach((button) => {
        const active = normalizedDotColor(button.dataset.color) === widgetThemeState.dotColor;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
    });
    const customIsActive = widgetThemeState.dotColor !== "auto" && !presetColors.includes(widgetThemeState.dotColor);
    const customControl = document.getElementById("customDotColorControl");
    customControl?.classList.toggle("is-active", customIsActive);
    const customPicker = document.getElementById("customDotColor");
    if (customPicker && document.activeElement !== customPicker) customPicker.value = widgetThemeState.customDotColor;
    const photoLabel = document.querySelector('.widget-theme[data-theme="photo"] span');
    if (photoLabel) photoLabel.textContent = widgetHasPhoto ? "Сменить фото" : "Своё фото";
    updateAppearanceSummary();
    const status = document.getElementById("widgetThemeStatus");
    if (status) {
        status.textContent = state.status || "";
        status.classList.toggle("is-error", Boolean(state.isError));
        status.classList.toggle("is-success", Boolean(state.status) && !state.isError);
    }
    if (state.isError) document.getElementById("appearanceDetails")?.setAttribute("open", "");
}

document.querySelectorAll(".widget-theme").forEach((button) => {
    button.addEventListener("click", () => {
        if (button.dataset.theme === "photo") {
            post({ action: "pick-widget-photo" });
            return;
        }
        showWidgetTheme({ theme: button.dataset.theme, status: "Сохраняем…" });
        post({ action: "set-widget-theme", theme: button.dataset.theme });
    });
});

document.querySelectorAll(".dot-style").forEach((button) => {
    button.addEventListener("click", () => {
        showWidgetTheme({ dotStyle: button.dataset.style, status: "Сохраняем…" });
        post({ action: "set-dot-style", style: button.dataset.style });
    });
});

document.querySelectorAll(".dot-color").forEach((button) => {
    button.addEventListener("click", () => {
        const color = normalizedDotColor(button.dataset.color);
        if (!color) return;
        showWidgetTheme({ dotColor: color, status: "Сохраняем…" });
        post({ action: "set-dot-color", color, custom: false });
    });
});

const customDotColor = document.getElementById("customDotColor");
function applyCustomDotColor() {
    const color = normalizedDotColor(customDotColor.value);
    if (!color || color === "auto") return;
    showWidgetTheme({ dotColor: color, customDotColor: color, status: "Сохраняем…" });
    post({ action: "set-dot-color", color, custom: true });
}

customDotColor?.addEventListener("change", applyCustomDotColor);
