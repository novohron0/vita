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

function showAppVersion(value) {
    const label = document.getElementById("appVersion");
    if (label && typeof value === "string") label.textContent = value;
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
    section.scrollIntoView({ behavior: "smooth", block: "center" });
    section.classList.remove("is-deep-link-target");
    requestAnimationFrame(() => section.classList.add("is-deep-link-target"));
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

function showVitaProfileState(state) {
    if (!state || typeof state !== "object") return;
    const code = document.getElementById("vitaIDCode");
    if (code && state.code && document.activeElement !== code) code.value = state.code;
    const summary = document.getElementById("vitaIDSummary");
    if (summary) summary.textContent = state.connected
        ? `${state.code} · ${Number(state.goals) || 0} целей`
        : "Подключи личный кабинет";
    const disconnect = document.getElementById("disconnectVitaID");
    if (disconnect) disconnect.hidden = !state.connected;
    const connect = document.getElementById("connectVitaID");
    if (connect) { connect.disabled = false; connect.textContent = state.connected ? "Обновить данные" : "Подключить всё"; }
    const status = document.getElementById("vitaIDStatus");
    if (status) {
        status.textContent = state.status || "";
        status.classList.toggle("is-error", Boolean(state.isError));
        status.classList.toggle("is-success", Boolean(state.status) && !state.isError);
    }
    if (state.isError) document.getElementById("vitaIDDetails")?.setAttribute("open", "");
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
const impulsePriorityLabels = { low: "Низкий", medium: "Средний", high: "Высокий" };
const impulseFocusLabels = { deepWork: "Глубокая работа", reading: "Чтение", study: "Учёба", workout: "Тренировка" };
const impulseStatusLabels = {
    scheduled: "Запланировано", accepted: "Принято", snoozed: "Отложено",
    running: "Фокус", completed: "Готово"
};
let impulseState = { items: [] };
let activeSheetImpulseID = "";
let impulseSheetReturnFocus = null;
let pendingImpulseFocusRestore = null;
let impulseFocusRestoreTimer = null;
let pendingImpulseDeleteID = "";
let impulseDeleteTimer = null;
let impulseSavePending = false;
let optimisticImpulseTimer = null;
let impulseTimerInterval = null;

function impulseDateLabel(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Время не задано";
    return new Intl.DateTimeFormat("ru-RU", {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
    }).format(date).replace(".", "");
}

function impulseItem(id) {
    return impulseState.items.find((item) => String(item.id) === String(id));
}

function setImpulseStatus(message, isError = false, isSuccess = false) {
    const status = document.getElementById("impulseStatus");
    if (!status) return;
    status.textContent = message || "";
    status.classList.toggle("is-error", isError);
    status.classList.toggle("is-success", isSuccess && !isError);
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
    const cardTarget = card?.querySelector("[data-impulse-action]");
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

function renderImpulseList() {
    const list = document.getElementById("impulseList");
    if (!list) return;
    list.replaceChildren();
    const items = impulseState.items.filter((item) => item && item.id != null);
    items.forEach((item) => {
        const card = document.createElement("article");
        card.className = "impulse-item";
        if (item.completed || item.status === "completed") card.classList.add("is-completed");
        if (item.enabled === false) card.classList.add("is-disabled");
        card.dataset.impulseId = String(item.id);

        const top = document.createElement("div");
        top.className = "impulse-item-top";
        const copy = document.createElement("div");
        const title = document.createElement("strong");
        title.className = "impulse-item-title";
        title.textContent = item.title || "Без названия";
        const meta = document.createElement("p");
        meta.className = "impulse-item-meta";
        const repeat = impulseRepeatLabels[item.repeatRule] || impulseRepeatLabels.none;
        const itemStatus = impulseStatusLabels[item.status];
        meta.textContent = [itemStatus, impulseDateLabel(item.fireDate), repeat].filter(Boolean).join(" · ");
        copy.append(title, meta);
        top.append(copy);
        if (impulsePriorityLabels[item.priority]) {
            const priority = document.createElement("span");
            priority.className = `impulse-priority priority-${item.priority}`;
            priority.textContent = impulsePriorityLabels[item.priority];
            top.append(priority);
        }
        card.append(top);

        if (item.firstStep) {
            const step = document.createElement("p");
            step.className = "impulse-item-step";
            step.textContent = `Первый шаг: ${item.firstStep}`;
            card.append(step);
        }
        if (item.deadline) {
            const deadline = document.createElement("p");
            deadline.className = "impulse-item-deadline";
            deadline.textContent = `Дедлайн · ${impulseDateLabel(item.deadline)}`;
            card.append(deadline);
        }

        const actions = document.createElement("div");
        actions.className = "impulse-item-actions";
        const actionButtons = item.completed || item.status === "completed"
            ? [makeImpulseButton("Удалить", "delete", "text-action danger")]
            : [
                makeImpulseButton("Принять", "accept", "primary"),
                makeImpulseButton("Изменить", "edit"),
                makeImpulseButton("Готово", "complete"),
                makeImpulseButton("Удалить", "delete", "text-action danger")
            ];
        const deleteButton = actionButtons.find((button) => button.dataset.impulseAction === "delete");
        if (deleteButton && pendingImpulseDeleteID === String(item.id)) {
            deleteButton.textContent = "Точно удалить?";
            deleteButton.classList.add("is-confirming");
        }
        if (actionButtons.length === 1) actions.classList.add("completed-actions");
        actionButtons.forEach((button) => {
            button.setAttribute("aria-label", `${button.textContent}: ${item.title || "импульс"}`);
        });
        actions.append(...actionButtons);
        card.append(actions);
        list.append(card);
    });

    const activeItems = items.filter((item) => item.enabled !== false && !item.completed && item.status !== "completed");
    const empty = document.getElementById("impulseEmpty");
    if (empty) empty.hidden = items.length > 0;
    const pill = document.getElementById("impulsePill");
    if (pill) {
        pill.classList.toggle("is-active", activeItems.length > 0);
        const label = pill.querySelector("span");
        if (label) label.textContent = String(activeItems.length);
    }
    const next = activeItems
        .filter((item) => !Number.isNaN(new Date(item.fireDate).getTime()))
        .sort((a, b) => new Date(a.fireDate) - new Date(b.fireDate))[0];
    const summary = document.getElementById("impulseSummary");
    if (summary) summary.textContent = next ? `Следующий · ${impulseDateLabel(next.fireDate)}` : "Мягко возвращает к важному";
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
        impulsePriority: item?.priority || "none",
        impulseDuration: String(Number(item?.durationMinutes) || 25),
        impulseFocus: item?.focusMode || "none"
    };
    Object.entries(values).forEach(([id, value]) => {
        const field = document.getElementById(id);
        if (field) field.value = value;
    });
    const heading = document.getElementById("impulseEditorTitle");
    if (heading) heading.textContent = item ? "Изменить импульс" : "Новый импульс";
}

function openImpulseEditor(item = null) {
    fillImpulseEditor(item);
    const editor = document.getElementById("impulseEditor");
    const create = document.getElementById("newImpulse");
    if (editor) editor.hidden = false;
    if (create) create.hidden = true;
    setImpulseStatus("");
    document.getElementById("impulseTitle")?.focus();
}

function closeImpulseEditor() {
    const editor = document.getElementById("impulseEditor");
    const create = document.getElementById("newImpulse");
    if (editor) editor.hidden = true;
    if (create) create.hidden = false;
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
    if (accept) accept.hidden = view !== "accept";
    if (snooze) snooze.hidden = view !== "snooze";
    const eyebrow = document.getElementById("impulseSheetEyebrow");
    if (eyebrow) eyebrow.textContent = view === "snooze" ? "Перед тем как отложить" : "Vita Импульс";
    if (view === "snooze") {
        const exact = document.getElementById("snoozeImpulseDate");
        if (exact) exact.value = impulseLocalDate(new Date(Date.now() + 30 * 60000).toISOString());
    }
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
    const duration = document.getElementById("acceptImpulseDuration");
    const focus = document.getElementById("acceptImpulseFocus");
    if (duration) duration.value = String(Number(item.durationMinutes) || 25);
    if (focus) focus.value = item.focusMode || "none";
    const sheetStatus = document.getElementById("impulseSheetStatus");
    if (sheetStatus) {
        sheetStatus.textContent = "";
        sheetStatus.classList.remove("is-error", "is-success");
    }
    showImpulseSheetView(view);
    if (sheet) sheet.hidden = false;
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
    if (sheet) sheet.hidden = true;
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
}

function pendingImpulseAction(pending) {
    if (!pending) return null;
    const rawType = typeof pending === "string" ? pending : pending.type || pending.kind || pending.action;
    if (typeof rawType !== "string") return null;
    const type = rawType.replace("-impulse", "");
    const id = typeof pending === "object" ? pending.id || pending.impulseId : impulseState.pendingImpulseId;
    return { type, id };
}

function resolvedImpulseTimer() {
    const fromState = impulseState.runningTimer || impulseState.timer;
    if (fromState?.endsAt || fromState?.endDate) {
        return { id: fromState.id || fromState.impulseId, endsAt: fromState.endsAt || fromState.endDate };
    }
    const item = impulseState.items.find((value) => value.timerEndsAt || value.timerEndDate);
    if (item) return { id: item.id, endsAt: item.timerEndsAt || item.timerEndDate };
    return optimisticImpulseTimer;
}

function updateImpulseCountdown() {
    const timer = resolvedImpulseTimer();
    const bar = document.getElementById("impulseTimerBar");
    if (!bar) return;
    const endsAt = timer ? new Date(timer.endsAt) : null;
    const valid = endsAt && !Number.isNaN(endsAt.getTime()) && endsAt.getTime() > Date.now();
    bar.hidden = !valid;
    if (valid) {
        const remaining = Math.max(0, Math.ceil((endsAt.getTime() - Date.now()) / 1000));
        const minutes = Math.floor(remaining / 60);
        const seconds = remaining % 60;
        const countdown = document.getElementById("impulseTimerCountdown");
        if (countdown) countdown.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
        const item = impulseItem(timer.id);
        const title = document.getElementById("impulseTimerTitle");
        if (title) {
            const focus = impulseFocusLabels[item?.focusMode];
            title.textContent = [focus, item?.title || "Импульс"].filter(Boolean).join(" · ");
        }
        bar.dataset.impulseId = String(timer.id || "");
    } else if (timer && optimisticImpulseTimer) {
        optimisticImpulseTimer = null;
    }
    const sheetItem = impulseItem(activeSheetImpulseID);
    if (sheetItem?.deadline) {
        const label = document.getElementById("sheetImpulseDeadline");
        if (label) label.textContent = impulseDeadlineText(sheetItem.deadline);
    }
}

function showImpulseState(state) {
    if (!state || typeof state !== "object") return;
    impulseState = {
        ...impulseState,
        ...state,
        items: Array.isArray(state.items) ? state.items : impulseState.items,
        runningTimer: Object.prototype.hasOwnProperty.call(state, "runningTimer") ? state.runningTimer : null
    };
    if (state.isError) optimisticImpulseTimer = null;
    renderImpulseList();
    updateImpulseCountdown();
    const shortcut = document.getElementById("openFocusShortcuts");
    if (shortcut) shortcut.hidden = state.supportsImpulseShortcut !== true;

    const save = document.getElementById("saveImpulse");
    if (save) save.disabled = false;
    if (impulseSavePending) {
        impulseSavePending = false;
        if (!state.isError) closeImpulseEditor();
    }
    setImpulseStatus(state.status || "", Boolean(state.isError), Boolean(state.status));

    const pending = pendingImpulseAction(state.pendingAction);
    if (pending && (pending.type === "accept" || pending.type === "snooze")) {
        const item = impulseItem(pending.id) || (typeof state.pendingAction === "object" ? state.pendingAction.item : null);
        openImpulseSheet(item, pending.type);
        const snoozeUntil = typeof state.pendingAction === "object" ? state.pendingAction.snoozeUntil : null;
        const exact = document.getElementById("snoozeImpulseDate");
        if (pending.type === "snooze" && exact && snoozeUntil) exact.value = impulseLocalDate(snoozeUntil);
    }
}

document.getElementById("newImpulse")?.addEventListener("click", () => openImpulseEditor());
document.getElementById("cancelImpulseEdit")?.addEventListener("click", closeImpulseEditor);

document.getElementById("impulseList")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-impulse-action]");
    const card = button?.closest("[data-impulse-id]");
    if (!button || !card) return;
    const item = impulseItem(card.dataset.impulseId);
    if (!item) return;
    switch (button.dataset.impulseAction) {
    case "edit": openImpulseEditor(item); break;
    case "accept":
        post({ action: "accept-impulse", id: item.id });
        openImpulseSheet(item, "accept");
        break;
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
    const id = document.getElementById("impulseID")?.value || "";
    const title = document.getElementById("impulseTitle")?.value.trim() || "";
    const notes = document.getElementById("impulseNotes")?.value.trim() || "";
    const reason = document.getElementById("impulseReason")?.value.trim() || "";
    const firstStep = document.getElementById("impulseStep")?.value.trim() || "";
    const fireValue = document.getElementById("impulseDate")?.value || "";
    const deadlineValue = document.getElementById("impulseDeadline")?.value || "";
    const fireDate = new Date(fireValue);
    const deadlineDate = deadlineValue ? new Date(deadlineValue) : null;
    if (!title || !reason || !firstStep || !fireValue || Number.isNaN(fireDate.getTime()) || fireDate.getTime() < Date.now() + 5000) {
        setImpulseStatus(!title ? "Напиши, что хочешь сделать" : !reason ? "Добавь, зачем это важно" : !firstStep ? "Добавь самый маленький шаг" : "Выбери время в будущем", true);
        return;
    }
    if (deadlineDate && (Number.isNaN(deadlineDate.getTime()) || deadlineDate <= fireDate)) {
        setImpulseStatus("Дедлайн должен быть позже напоминания", true);
        return;
    }
    const save = document.getElementById("saveImpulse");
    if (save) save.disabled = true;
    impulseSavePending = true;
    setImpulseStatus("Сохраняем…");
    post({
        action: "save-impulse",
        id: id || null,
        title,
        notes,
        reason,
        firstStep,
        fireDate: fireDate.toISOString(),
        deadline: deadlineDate ? deadlineDate.toISOString() : null,
        durationMinutes: Number(document.getElementById("impulseDuration")?.value) || 25,
        priority: document.getElementById("impulsePriority")?.value || "none",
        repeatRule: document.getElementById("impulseRepeat")?.value || "none",
        focusMode: document.getElementById("impulseFocus")?.value || "none"
    });
});

document.querySelectorAll("[data-sheet-close]").forEach((button) => button.addEventListener("click", closeImpulseSheet));
document.getElementById("openImpulseSnooze")?.addEventListener("click", () => showImpulseSheetView("snooze"));
document.getElementById("backToImpulseAccept")?.addEventListener("click", () => showImpulseSheetView("accept"));
document.getElementById("openFocusShortcuts")?.addEventListener("click", () => post({ action: "open-focus-shortcuts" }));

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
    if (deadline && !Number.isNaN(deadline.getTime()) && date > deadline) {
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

document.getElementById("startImpulseTimer")?.addEventListener("click", () => {
    const id = activeSheetImpulseID;
    const durationMinutes = Number(document.getElementById("acceptImpulseDuration")?.value) || 25;
    const focusMode = document.getElementById("acceptImpulseFocus")?.value || "none";
    if (!id) return;
    optimisticImpulseTimer = { id, endsAt: new Date(Date.now() + durationMinutes * 60000).toISOString() };
    post({ action: "start-impulse-timer", id, durationMinutes, focusMode });
    closeImpulseSheet();
    updateImpulseCountdown();
});

document.getElementById("completeImpulseFromSheet")?.addEventListener("click", () => {
    if (!activeSheetImpulseID) return;
    post({ action: "complete-impulse", id: activeSheetImpulseID });
    closeImpulseSheet();
});

document.getElementById("cancelImpulseTimer")?.addEventListener("click", () => {
    const id = document.getElementById("impulseTimerBar")?.dataset.impulseId || "";
    optimisticImpulseTimer = null;
    post({ action: "cancel-impulse-timer", id });
    updateImpulseCountdown();
});

document.getElementById("completeImpulseTimer")?.addEventListener("click", () => {
    const id = document.getElementById("impulseTimerBar")?.dataset.impulseId || "";
    optimisticImpulseTimer = null;
    post({ action: "complete-impulse", id });
    updateImpulseCountdown();
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

impulseTimerInterval = setInterval(updateImpulseCountdown, 1000);

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
