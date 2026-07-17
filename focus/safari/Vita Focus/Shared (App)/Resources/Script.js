function show(platform, enabled, useSettingsInsteadOfPreferences) {
    document.body.classList.add(`platform-${platform}`);

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

document.querySelectorAll(".open-preferences").forEach((button) => button.addEventListener("click", () => post("open-preferences")));
document.querySelectorAll(".open-youtube").forEach((button) => button.addEventListener("click", () => post("open-youtube")));
document.querySelectorAll(".open-settings").forEach((button) => button.addEventListener("click", () => post("open-settings")));

function showDiagnostics(lines) {
    const box = document.getElementById("diagBody");
    if (!box || !Array.isArray(lines)) return;
    box.textContent = lines.join("\n");
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
