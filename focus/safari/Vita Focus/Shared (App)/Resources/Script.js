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

document.querySelector(".open-preferences")?.addEventListener("click", () => post("open-preferences"));
document.querySelector(".open-youtube")?.addEventListener("click", () => post("open-youtube"));
document.querySelector(".open-settings")?.addEventListener("click", () => post("open-settings"));

function showDiagnostics(lines) {
    const box = document.getElementById("diagBody");
    if (!box || !Array.isArray(lines)) return;
    box.textContent = lines.join("\n");
    document.getElementById("diag")?.removeAttribute("hidden");
}

function showHabitState(state) {
    if (!state || typeof state !== "object") return;
    const empty = document.getElementById("habitEmpty");
    const connected = document.getElementById("habitConnected");
    if (empty) empty.hidden = Boolean(state.connected);
    if (connected) connected.hidden = !state.connected;

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
        status.textContent = state.status || (state.refreshing ? "Синхронизируем с vitadots.ru…" : "");
        status.classList.toggle("is-error", Boolean(state.isError));
        status.classList.toggle("is-success", Boolean(state.status) && !state.isError);
    }
    document.querySelectorAll(".refresh-habit").forEach((button) => { button.disabled = Boolean(state.refreshing); });
    const connect = document.getElementById("connectHabit");
    if (connect) connect.disabled = false;
}

function connectHabit() {
    const button = document.getElementById("connectHabit");
    const value = document.getElementById("habitCode")?.value.trim() || "";
    const status = document.getElementById("habitStatus");
    if (!value) {
        if (status) status.textContent = "Вставь ссылку или код цели";
        status?.classList.add("is-error");
        return;
    }
    if (button) button.disabled = true;
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
document.querySelectorAll(".open-goals").forEach((button) => button.addEventListener("click", () => post("open-goals")));
document.querySelectorAll(".open-active-habit").forEach((button) => button.addEventListener("click", () => post("open-active-habit")));
document.querySelectorAll(".refresh-habit").forEach((button) => button.addEventListener("click", () => post("refresh-habit")));
document.querySelectorAll(".disconnect-habit").forEach((button) => button.addEventListener("click", () => post("disconnect-habit")));
