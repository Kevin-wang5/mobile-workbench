"use strict";

/* ==========================================================
   不二的工作台手机版，业务数据保存在 IndexedDB
   ========================================================== */

const TYPE_META = {
    ddl: { label: "DDL", dot: "dot-ddl" },
    homework: { label: "作业", dot: "dot-homework" },
    exam: { label: "考试", dot: "dot-exam" },
    activity: { label: "活动", dot: "dot-activity" }
};

const PRIORITY_LABEL = { high: "高", normal: "中", low: "低" };
const WEEKDAY_CN = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

const EXTRA_EXPENSES = [
    { id: "shopping", name: "购物", kind: "expense", color: "#9471BD" },
    { id: "romance", name: "恋爱", kind: "expense", color: "#CB6683" }
];

const DEFAULT_CATEGORIES = [
    ...EXTRA_EXPENSES,
    { id: "food", name: "餐饮", kind: "expense", color: "#E86A5E" },
    { id: "transport", name: "交通", kind: "expense", color: "#4A90D9" },
    { id: "study", name: "学习用品", kind: "expense", color: "#7A6FD0" },
    { id: "daily", name: "日用品", kind: "expense", color: "#45A29E" },
    { id: "fun", name: "娱乐", kind: "expense", color: "#E8A33D" },
    { id: "phone", name: "通讯", kind: "expense", color: "#5C8D89" },
    { id: "medical", name: "医疗", kind: "expense", color: "#D96B8A" },
    { id: "social", name: "人情", kind: "expense", color: "#C4634F" },
    { id: "rent", name: "房租水电", kind: "expense", color: "#8A7C6B" },
    { id: "other_e", name: "其他", kind: "expense", color: "#9AA0A6" },
    { id: "allowance", name: "生活费", kind: "income", color: "#4CAF50" },
    { id: "scholarship", name: "奖学金", kind: "income", color: "#2E9E5B" },
    { id: "parttime", name: "兼职", kind: "income", color: "#7CB342" },
    { id: "other_i", name: "其他", kind: "income", color: "#81C784" }
];

const DB_NAME = "buer-mobile-workbench";
const DB_VERSION = 1;



const state = {
    categories: [],
    records: [],
    tasks: [],
    view: "calendar",
    year: 0,
    month: 0,
    selectedDate: "",
    editingTaskId: null
};

/* ---------- IndexedDB ---------- */

let dbPromise = null;

function openDB() {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains("categories")) {
                    db.createObjectStore("categories", { keyPath: "id" });
                }
                if (!db.objectStoreNames.contains("records")) {
                    db.createObjectStore("records", { keyPath: "id" });
                }
                if (!db.objectStoreNames.contains("tasks")) {
                    db.createObjectStore("tasks", { keyPath: "id" });
                }

                if (!db.objectStoreNames.contains("meta")) {
                    db.createObjectStore("meta", { keyPath: "key" });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    return dbPromise;
}

function txDone(tx) {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}

async function idbGetAll(store) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const request = db.transaction(store, "readonly").objectStore(store).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function idbGet(store, key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const request = db.transaction(store, "readonly").objectStore(store).get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

async function idbPut(store, value) {
    const db = await openDB();
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value);
    return txDone(tx);
}

async function idbPutMany(store, values) {
    if (!values || values.length === 0) return;
    const db = await openDB();
    const tx = db.transaction(store, "readwrite");
    const target = tx.objectStore(store);
    values.forEach((value) => target.put(value));
    return txDone(tx);
}

async function idbCount(store) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const request = db.transaction(store, "readonly").objectStore(store).count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function metaGet(key, fallback) {
    const row = await idbGet("meta", key);
    return row ? row.value : fallback;
}

async function metaSet(key, value) {
    await idbPut("meta", { key, value });
}

/* ---------- 小工具 ---------- */

function $(id) {
    return document.getElementById(id);
}

function pad2(n) {
    return String(n).padStart(2, "0");
}

function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function toDate(str) {
    const [y, m, d] = str.split("-").map(Number);
    return new Date(y, m - 1, d);
}

function dateToStr(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDays(str, n) {
    const d = toDate(str);
    d.setDate(d.getDate() + n);
    return dateToStr(d);
}

function diffDays(a, b) {
    return Math.round((toDate(a) - toDate(b)) / 86400000);
}

function monthPrefix(year, month) {
    return `${year}-${pad2(month)}`;
}

function makeId(prefix) {
    const rand = Math.random().toString(36).slice(2, 6);
    return `${prefix}_${Date.now()}_${rand}`;
}

function formatCents(cents) {
    const sign = cents < 0 ? "-" : "";
    const abs = Math.abs(cents);
    const yuan = Math.floor(abs / 100);
    const fen = abs % 100;
    return `${sign}¥${yuan.toLocaleString("zh-CN")}.${pad2(fen)}`;
}

function parseAmountToCents(text) {
    const raw = String(text == null ? "" : text).trim();
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
    const [yuan, fraction = ""] = raw.split(".");
    const cents = Number(yuan) * 100 + Number(fraction.padEnd(2, "0"));
    return Number.isInteger(cents) && cents > 0 ? cents : null;
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function showToast(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.remove("is-hidden");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.add("is-hidden"), 2200);
}

function showFormError(node, message) {
    node.textContent = message;
    node.classList.remove("is-hidden");
}

function hideFormError(node) {
    node.textContent = "";
    node.classList.add("is-hidden");
}

function getCategory(categoryId) {
    return state.categories.find((c) => c.id === categoryId) || {
        id: categoryId,
        name: "未知分类",
        kind: "expense",
        color: "#9AA0A6"
    };
}

function activeRecords() {
    return state.records.filter((r) => !r.deletedAt);
}

function activeTasks() {
    return state.tasks.filter((t) => !t.deletedAt);
}

function monthRecords() {
    const prefix = monthPrefix(state.year, state.month);
    return activeRecords()
        .filter((r) => r.date.startsWith(prefix))
        .sort((a, b) => (b.date.localeCompare(a.date)) || (b.createdAt - a.createdAt));
}

function tasksOn(date) {
    return activeTasks().filter((t) => t.date === date);
}

function recordsOn(date) {
    return activeRecords().filter((r) => r.date === date);
}

/* ---------- 本地数据读写 ---------- */

async function refreshFromLocal() {
    const [categories, records, tasks, balanceBase] = await Promise.all([
        idbGetAll("categories"), idbGetAll("records"), idbGetAll("tasks"), metaGet("balanceBase", { cents: 0, at: 0 })
    ]);
    state.balanceBase = balanceBase;
    state.categories = categories;
    state.records = records;
    state.tasks = tasks;
}

async function persistEntity(store, entity) {
    await idbPut(store, entity);
    await refreshFromLocal();
    renderAll();
}

function renderSyncBar() {
    const bar = $("syncBar");
    bar.textContent = navigator.onLine ? "数据保存在此设备" : "离线使用中 · 数据保存在此设备";
    bar.className = "sync-bar is-synced";
}

async function refreshStorageStatus() {
    const last = await metaGet("lastExportAt", 0);
    const hasData = activeRecords().length + activeTasks().length > 0;
    $("backupHint").textContent = last
        ? `最近发起导出 ${new Date(last).toLocaleDateString("zh-CN")}，请确认文件已保存`
        : "建议定期导出到文件";
    $("backupReminder").classList.toggle("is-hidden", !hasData || (last && Date.now() - last < 7 * 86400000));
    if (navigator.storage?.persisted) {
        const persistent = await navigator.storage.persisted();
        $("storageStatus").textContent = persistent ? "持久存储已启用" : "使用浏览器本地存储";
    } else {
        $("storageStatus").textContent = "浏览器未提供持久存储状态";
    }
}

async function requestStorage() {
    const button = $("persistBtn");
    button.disabled = true;
    $("storageStatus").textContent = "正在申请…";
    let timer;
    try {
        if (!navigator.storage?.persist) throw new Error("此浏览器不支持申请，可继续本地保存");
        const granted = await Promise.race([
            navigator.storage.persist(),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("浏览器暂未返回结果，可稍后重试")), 8000); })
        ]);
        $("storageStatus").textContent = granted ? "持久存储已启用" : "浏览器未批准持久存储，可继续本地保存";
    } catch (error) {
        $("storageStatus").textContent = error.message;
    } finally {
        clearTimeout(timer);
        button.disabled = false;
    }
}

let waitingWorker;
async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    try {
        const registration = await navigator.serviceWorker.register("./sw.js");
        function announceUpdate() {
            if (registration.waiting && navigator.serviceWorker.controller) {
                waitingWorker = registration.waiting;
                $("updateBar").classList.remove("is-hidden");
            }
        }
        announceUpdate();
        registration.addEventListener("updatefound", () => {
            registration.installing?.addEventListener("statechange", announceUpdate);
        });
        const ready = await navigator.serviceWorker.ready;
        $("offlineHint").textContent = "离线资源已就绪";
        document.addEventListener("visibilitychange", () => {
            if (!document.hidden) registration.update().catch(() => {});
        });
    } catch {
        $("offlineHint").textContent = "离线缓存失败，请联网刷新重试";
    }
}

/* ---------- 渲染：头部与汇总 ---------- */

function renderHeader() {
    const today = todayStr();
    const d = toDate(today);
    $("todayLabel").textContent =
        `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAY_CN[d.getDay()]}`;
    $("monthLabel").textContent = `${state.year}年${state.month}月`;

    const tasks = activeTasks();
    const pending = tasks.filter((t) => !t.done).length;
    const badge = $("taskBadge");
    badge.textContent = String(pending);
    badge.classList.toggle("is-hidden", pending === 0);
    $("pendingCount").textContent = String(pending);

    const overdue = tasks.filter((t) => !t.done && t.date < today).length;
    $("overdueCount").textContent = String(overdue);

    const records = monthRecords();
    const expense = records.filter((r) => r.kind === "expense")
        .reduce((sum, r) => sum + r.amountCents, 0);
    const income = records.filter((r) => r.kind === "income")
        .reduce((sum, r) => sum + r.amountCents, 0);
    $("totalExpense").textContent = formatCents(expense);
    $("totalIncome").textContent = formatCents(income);
}

/* ---------- 渲染：记账 ---------- */

function populateCategories() {
    const select = $("category");
    if (!select || state.categories.length === 0) return;
    const current = select.value;
    select.textContent = "";

    const groups = [
        { label: "支出", kind: "expense" },
        { label: "收入", kind: "income" }
    ];
    groups.forEach((group) => {
        const items = state.categories.filter((c) => c.kind === group.kind);
        if (items.length === 0) return;
        const optgroup = document.createElement("optgroup");
        optgroup.label = group.label;
        items.forEach((c) => {
            const option = document.createElement("option");
            option.value = c.id;
            option.textContent = c.name;
            optgroup.appendChild(option);
        });
        select.appendChild(optgroup);
    });

    if (current && state.categories.some((c) => c.id === current)) {
        select.value = current;
    }
}

function renderStats() {
    const container = $("stats");
    container.textContent = "";
    $("statsMonthHint").textContent = `${state.month}月`;

    const expenseRecords = monthRecords().filter((r) => r.kind === "expense");
    if (expenseRecords.length === 0) {
        container.appendChild(el("p", "empty", "本月还没有支出"));
        return;
    }

    const totals = new Map();
    expenseRecords.forEach((r) => {
        const entry = totals.get(r.categoryId) || { categoryId: r.categoryId, cents: 0 };
        entry.cents += r.amountCents;
        totals.set(r.categoryId, entry);
    });

    const rows = [...totals.values()].sort((a, b) => b.cents - a.cents);
    const sum = rows.reduce((acc, row) => acc + row.cents, 0);

    rows.forEach((row) => {
        const category = getCategory(row.categoryId);
        const percent = sum > 0 ? Math.round((row.cents / sum) * 100) : 0;

        const item = el("div", "stat-item");
        const top = el("div", "stat-top");
        const dot = el("span", "stat-dot");
        dot.style.background = category.color;
        const name = el("span", "stat-name", category.name);
        const amount = el("span", "stat-amount", formatCents(row.cents));
        const percentNode = el("span", "stat-percent", `${percent}%`);
        top.append(dot, name, amount, percentNode);

        const bar = el("div", "stat-bar");
        const fill = el("div", "stat-bar-fill");
        fill.style.width = `${Math.max(percent, 2)}%`;
        fill.style.background = category.color;
        bar.appendChild(fill);

        item.append(top, bar);
        container.appendChild(item);
    });
}

function renderRecordList() {
    const list = $("recordList");
    list.textContent = "";
    const records = monthRecords();

    if (records.length === 0) {
        list.appendChild(el("li", "empty", "本月还没有记录"));
        return;
    }

    records.forEach((record) => {
        const category = getCategory(record.categoryId);
        const item = el("li", "record");
        item.dataset.id = record.id;
        item.title = "点击删除";

        const dot = el("span", "record-dot");
        dot.style.background = category.color;

        const info = el("div", "record-info");
        const meta = el("p", "record-meta", `${category.name} · ${record.date.slice(5)}`);
        const note = el("p", "record-note", record.note || "无");
        info.append(meta, note);

        const sign = record.kind === "income" ? "+" : "-";
        const amount = el(
            "span",
            `record-amount${record.kind === "income" ? " is-income" : ""}`,
            `${sign}${formatCents(record.amountCents)}`
        );

        item.append(dot, info, amount);
        item.addEventListener("click", () => deleteRecord(record));
        list.appendChild(item);
    });
}

function currentBalance() {
    const base = state.balanceBase;
    return activeRecords().reduce((total, record) => {
        if (record.createdAt <= base.at) return total;
        return total + (record.kind === "income" ? record.amountCents : -record.amountCents);
    }, base.cents);
}

async function editBalance() {
    const input = window.prompt("设置当前余额（元）。此后新记的收支将从这个金额开始计算。", (currentBalance() / 100).toFixed(2));
    if (input === null) return;
    const value = input.trim();
    const cents = Number(value.replace(".", "").replace(/^-/, "")) * (value.startsWith("-") ? -1 : 1)
        * 10 ** (2 - (value.split(".")[1] || "").length);
    if (!/^-?\d+(?:\.\d{1,2})?$/.test(value) || !Number.isSafeInteger(cents)) {
        showToast("请输入有效金额，最多两位小数");
        return;
    }
    await metaSet("balanceBase", { cents, at: Date.now() });
    await refreshFromLocal();
    renderLedger();
}

function showBalanceChange(record) {
    const income = record.kind === "income";
    const change = el("span", income ? "balance-income" : "balance-expense",
        (income ? "↑ " : "− ") + formatCents(record.amountCents));
    $("balanceChanges").appendChild(change);
    setTimeout(() => change.remove(), 5000);
}

function renderLedger() {
    $("balanceAmount").textContent = formatCents(currentBalance());
    renderStats();
    renderRecordList();
}

/* ---------- 渲染：日历 ---------- */

function renderCalendar() {
    const grid = $("calendarGrid");
    grid.textContent = "";

    const firstDay = new Date(state.year, state.month - 1, 1);
    const offset = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(state.year, state.month, 0).getDate();
    const today = todayStr();

    for (let i = 0; i < offset; i += 1) {
        grid.appendChild(el("div", "day is-empty"));
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
        const date = `${state.year}-${pad2(state.month)}-${pad2(day)}`;
        const button = el("button", "day");
        button.type = "button";
        button.dataset.date = date;
        if (date === today) button.classList.add("is-today");
        if (date === state.selectedDate) button.classList.add("is-selected");

        button.appendChild(el("span", "day-num", String(day)));

        const dots = el("div", "day-dots");
        const types = new Set(tasksOn(date).map((t) => t.type));
        [...types].slice(0, 4).forEach((type) => {
            dots.appendChild(el("i", `dot ${TYPE_META[type] ? TYPE_META[type].dot : "dot-other"}`));
        });
        if (recordsOn(date).length > 0) {
            dots.appendChild(el("i", "dot dot-money"));
        }
        button.appendChild(dots);

        button.addEventListener("click", () => {
            state.selectedDate = date;
            renderCalendar();
        });
        grid.appendChild(button);
    }

    renderDayPanel();
}

function renderDayPanel() {
    const date = state.selectedDate;
    const d = toDate(date);
    const isToday = date === todayStr();
    $("selectedDateLabel").textContent =
        `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAY_CN[d.getDay()]}${isToday ? "（今天）" : ""}`;

    const taskList = $("dayTaskList");
    taskList.textContent = "";
    const tasks = tasksOn(date).sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        return (a.time || "99:99").localeCompare(b.time || "99:99");
    });
    if (tasks.length === 0) {
        taskList.appendChild(el("li", "empty", "这天没有事项"));
    } else {
        tasks.forEach((task) => taskList.appendChild(createTaskItem(task)));
    }

    const recordBox = $("dayRecords");
    recordBox.textContent = "";
    const records = recordsOn(date);
    if (records.length === 0) {
        recordBox.appendChild(el("p", "empty", "这天没有记账"));
        return;
    }
    records.forEach((record) => {
        const category = getCategory(record.categoryId);
        const line = el("div", "day-record-line");
        line.append(
            el("span", "", `${category.name}${record.note ? ` · ${record.note}` : ""}`),
            el("span", "", `${record.kind === "income" ? "+" : "-"}${formatCents(record.amountCents)}`)
        );
        recordBox.appendChild(line);
    });
}

/* ---------- 渲染：事项 ---------- */

function createTaskItem(task) {
    const item = el("li", "task-item");
    if (task.done) item.classList.add("is-done");
    if (!task.done && task.date < todayStr()) item.classList.add("is-overdue");

    const checkLabel = el("label", "task-check");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(task.done);
    checkbox.setAttribute("aria-label", task.done ? "标记为未完成" : "标记为完成");
    checkbox.addEventListener("change", () => toggleTask(task));
    checkLabel.appendChild(checkbox);

    const body = el("div", "task-body");
    body.title = "点击修改";

    const title = el("p", "task-title", task.title);
    const meta = el("p", "task-meta");
    meta.appendChild(el("span", "", `${task.date.slice(5)}${task.time ? ` ${task.time}` : ""}`));
    meta.appendChild(el("span", "", TYPE_META[task.type] ? TYPE_META[task.type].label : "其他"));
    meta.appendChild(el("span", `priority-${task.priority}`, `${PRIORITY_LABEL[task.priority] || "中"}优先级`));

    if (!task.done) {
        const left = diffDays(task.date, todayStr());
        if (left < 0) {
            meta.appendChild(el("span", "days-left", `逾期 ${-left} 天`));
        } else if (left === 0) {
            meta.appendChild(el("span", "days-left", "今天"));
        } else if (left <= 7) {
            meta.appendChild(el("span", "", `还有 ${left} 天`));
        }
    }

    body.append(title, meta);
    if (task.note) body.appendChild(el("p", "task-note", task.note));
    body.addEventListener("click", () => startEditTask(task));

    const del = el("button", "task-delete", "×");
    del.type = "button";
    del.setAttribute("aria-label", "删除事项");
    del.addEventListener("click", (event) => {
        event.stopPropagation();
        deleteTask(task);
    });

    item.append(checkLabel, body, del);
    return item;
}

function renderTaskGroup(listId, tasks, emptyText) {
    const list = $(listId);
    list.textContent = "";
    if (tasks.length === 0) {
        list.appendChild(el("li", "empty", emptyText));
        return;
    }
    tasks.forEach((task) => list.appendChild(createTaskItem(task)));
}

function renderTasks() {
    const today = todayStr();
    const weekEnd = addDays(today, 7);
    const tasks = activeTasks();
    const pending = tasks.filter((t) => !t.done);

    renderTaskGroup("overdueList", pending.filter((t) => t.date < today), "没有逾期事项");
    renderTaskGroup("todayList", pending.filter((t) => t.date === today), "今天没有事项");
    renderTaskGroup(
        "upcomingList",
        pending.filter((t) => t.date > today && t.date <= weekEnd),
        "未来 7 天没有事项"
    );
    renderTaskGroup("laterList", pending.filter((t) => t.date > weekEnd), "没有更晚的事项");
    renderTaskGroup("doneList", tasks.filter((t) => t.done), "还没有完成的事项");
}

/* ---------- 总渲染 ---------- */

function renderAll() {
    renderHeader();
    renderLedger();
    renderCalendar();
    renderTasks();
    renderTabs();
    renderSyncBar();
    refreshStorageStatus().catch(() => {});
}

function renderTabs() {
    document.querySelectorAll(".tab").forEach((tab) => {
        tab.classList.toggle("is-active", tab.dataset.view === state.view);
    });
    document.querySelectorAll(".view").forEach((view) => {
        view.classList.toggle("is-active", view.id === `view-${state.view}`);
    });
}

/* ---------- 操作：记账 ---------- */

async function addRecord(event) {
    event.preventDefault();
    const amountInput = $("amount");
    const errorNode = $("formError");
    hideFormError(errorNode);

    const amountCents = parseAmountToCents(amountInput.value);
    if (amountCents === null) {
        showFormError(errorNode, "金额要大于 0，最多两位小数");
        amountInput.focus();
        return;
    }
    if (!$("date").value) {
        showFormError(errorNode, "请选择日期");
        return;
    }

    const now = Date.now();
    const category = getCategory($("category").value);
    const record = {
        id: makeId("r"),
        amountCents,
        kind: category.kind,
        categoryId: category.id,
        date: $("date").value,
        note: $("note").value.trim(),
        createdAt: now,
        updatedAt: now,
        deletedAt: null
    };

    await persistEntity("records", record);
    showBalanceChange(record);
    amountInput.value = "";
    $("note").value = "";
    showToast("已添加");
}

async function deleteRecord(record) {
    const category = getCategory(record.categoryId);
    const label = `${category.name} ${formatCents(record.amountCents)}`;
    if (!window.confirm(`删除这笔记录？\n\n${label}`)) return;

    const now = Date.now();
    await persistEntity("records", {
        ...record,
        deletedAt: now,
        updatedAt: now
    });
    showToast("已删除");
}

/* ---------- 操作：事项 ---------- */

async function addOrUpdateTask(event) {
    event.preventDefault();
    const errorNode = $("taskError");
    hideFormError(errorNode);

    const title = $("taskTitle").value.trim();
    const date = $("taskDate").value;
    if (!title) {
        showFormError(errorNode, "标题不能为空");
        return;
    }
    if (!date) {
        showFormError(errorNode, "请选择日期");
        return;
    }

    const now = Date.now();
    const fields = {
        title,
        type: $("taskType").value,
        date,
        time: $("taskTime").value,
        priority: $("taskPriority").value,
        note: $("taskNote").value.trim(),
        updatedAt: now
    };

    if (state.editingTaskId) {
        const existing = state.tasks.find((t) => t.id === state.editingTaskId);
        if (existing) {
            await persistEntity("tasks", { ...existing, ...fields });
        }
        showToast("已保存修改");
    } else {
        await persistEntity("tasks", {
            id: makeId("t"),
            ...fields,
            done: false,
            createdAt: now,
            deletedAt: null
        });
        showToast("已添加事项");
    }

    resetTaskForm();
}

async function toggleTask(task) {
    const now = Date.now();
    await persistEntity("tasks", {
        ...task,
        done: !task.done,
        updatedAt: now
    });
}

async function deleteTask(task) {
    if (!window.confirm(`删除「${task.title}」？`)) return;
    const now = Date.now();
    await persistEntity("tasks", {
        ...task,
        deletedAt: now,
        updatedAt: now
    });
    if (state.editingTaskId === task.id) resetTaskForm();
    showToast("已删除");
}

function startEditTask(task) {
    state.editingTaskId = task.id;
    $("taskTitle").value = task.title;
    $("taskType").value = task.type;
    $("taskDate").value = task.date;
    $("taskTime").value = task.time || "";
    $("taskPriority").value = task.priority;
    $("taskNote").value = task.note || "";
    $("taskFormTitle").textContent = "修改事项";
    $("taskSubmitBtn").textContent = "保存修改";
    $("cancelEditBtn").classList.remove("is-hidden");
    hideFormError($("taskError"));
    switchView("tasks");
    renderTabs();
    $("taskForm").scrollIntoView({ behavior: "smooth", block: "start" });
    $("taskTitle").focus();
}

function resetTaskForm() {
    state.editingTaskId = null;
    $("taskForm").reset();
    $("taskType").value = "ddl";
    $("taskPriority").value = "normal";
    $("taskDate").value = state.selectedDate || todayStr();
    $("taskTime").value = "";
    $("taskFormTitle").textContent = "新事项";
    $("taskSubmitBtn").textContent = "添加事项";
    $("cancelEditBtn").classList.add("is-hidden");
    hideFormError($("taskError"));
}

/* ---------- 视图切换 ---------- */

function switchView(view) {
    state.view = view;
    if (location.hash !== `#${view}`) {
        history.replaceState(null, "", `#${view}`);
    }
    renderTabs();
}

function setMonth(year, month) {
    state.year = year;
    state.month = month;
    const today = todayStr();
    const todayMonth = Number(today.slice(0, 7).replace("-", ""));
    if (state.year * 100 + state.month === todayMonth) {
        state.selectedDate = today;
    } else {
        state.selectedDate = `${state.year}-${pad2(state.month)}-01`;
    }
    renderAll();
}

function shiftMonth(delta) {
    let year = state.year;
    let month = state.month + delta;
    if (month < 1) {
        month = 12;
        year -= 1;
    } else if (month > 12) {
        month = 1;
        year += 1;
    }
    setMonth(year, month);
}

/* ---------- 导出 / 导入 ---------- */

async function exportJson() {
    await refreshFromLocal();
    const data = { version: 4, balanceBase: state.balanceBase, exportedAt: new Date().toISOString(), categories: state.categories,
        records: activeRecords(), tasks: activeTasks() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `buer-mobile-${todayStr()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    await metaSet("lastExportAt", Date.now());
    await refreshStorageStatus();
    showToast("已发起导出，请确认文件已保存");
}

function validateBackup(data) {
    if (!data || !Array.isArray(data.records) || !Array.isArray(data.tasks)) {
        throw new Error("备份必须包含 records 和 tasks");
    }
    const categories = data.categories ?? DEFAULT_CATEGORIES;
    if (!Array.isArray(categories) || !categories.length) throw new Error("分类不能为空");
    const idValid = value => typeof value === "string" && value.length > 0 && value.length <= 100;
    function unique(items) {
        const ids = new Set();
        for (const item of items) {
            if (!item || !idValid(item.id) || ids.has(item.id)) throw new Error("备份中存在无效或重复的编号");
            ids.add(item.id);
        }
    }
    [categories, data.records, data.tasks].forEach(unique);
    const categoryMap = new Map();
    for (const category of categories) {
        if (typeof category.name !== "string" || !["income", "expense"].includes(category.kind)
            || typeof category.color !== "string" || !/^#[0-9a-f]{6}$/i.test(category.color)) throw new Error("分类数据无效");
        categoryMap.set(category.id, category);
    }
    function validDate(value) {
        return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
            && !Number.isNaN(toDate(value).getTime()) && dateToStr(toDate(value)) === value;
    }
    function common(item) {
        if (!validDate(item.date) || !Number.isSafeInteger(item.createdAt) || !Number.isSafeInteger(item.updatedAt)
            || (item.note != null && typeof item.note !== "string")) throw new Error("日期或记录格式无效");
        return { ...item, note: item.note || "", deletedAt: item.deletedAt || null };
    }
    const records = data.records.map(item => {
        const category = categoryMap.get(item.categoryId);
        if (!Number.isSafeInteger(item.amountCents) || item.amountCents <= 0 || !category) throw new Error("金额或账目分类无效");
        return { ...common(item), kind: category.kind };
    });
    const tasks = data.tasks.map(item => {
        if (typeof item.title !== "string" || !item.title.trim() || !Object.hasOwn(TYPE_META, item.type)
            || !["high", "normal", "low"].includes(item.priority)
            || (item.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.time))) throw new Error("事项数据无效");
        return { ...common(item), time: item.time || "", done: Boolean(item.done) };
    });
    const balanceBase = data.balanceBase ?? { cents: 0, at: 0 };
    if (!Number.isSafeInteger(balanceBase.cents) || !Number.isSafeInteger(balanceBase.at) || balanceBase.at < 0) {
        throw new Error("余额基准无效");
    }
    return { categories: categories.concat(EXTRA_EXPENSES.filter(item => !categoryMap.has(item.id))), records, tasks, balanceBase };
}

async function importJson(file) {
    if (!file) return;
    try {
        if (file.size > 20 * 1024 * 1024) throw new Error("备份文件超过 20 MB");
        const incoming = validateBackup(JSON.parse(await file.text()));
        if (!confirm(`将替换此设备的全部数据，导入 ${incoming.records.length} 笔账目和 ${incoming.tasks.length} 个事项。请先导出当前数据。继续？`)) return;
        const db = await openDB();
        const tx = db.transaction(["categories", "records", "tasks", "meta"], "readwrite");
        const completed = txDone(tx);
        for (const store of ["categories", "records", "tasks"]) {
            const target = tx.objectStore(store);
            target.clear();
            incoming[store].forEach(item => target.put(item));
        }
        tx.objectStore("meta").put({ key: "balanceBase", value: incoming.balanceBase });
        tx.objectStore("meta").delete("lastExportAt");
        await completed;
        resetTaskForm();
        await refreshFromLocal();
        populateCategories();
        renderAll();
        showToast("导入完成");
    } catch (error) {
        showToast(`导入失败：${error.message}`);
    } finally {
        $("importFile").value = "";
    }
}

/* ---------- 绑定 ---------- */

function bindEvents() {
    $("balanceBtn").addEventListener("click", editBalance);
    document.querySelectorAll(".tab").forEach((tab) => {
        tab.addEventListener("click", () => {
            switchView(tab.dataset.view);
            renderAll();
        });
    });

    $("prevMonth").addEventListener("click", () => shiftMonth(-1));
    $("nextMonth").addEventListener("click", () => shiftMonth(1));
    $("monthLabel").addEventListener("click", () => {
        const d = new Date();
        setMonth(d.getFullYear(), d.getMonth() + 1);
    });

    $("recordForm").addEventListener("submit", addRecord);
    $("taskForm").addEventListener("submit", addOrUpdateTask);
    $("cancelEditBtn").addEventListener("click", resetTaskForm);

    $("addTaskForDayBtn").addEventListener("click", () => {
        resetTaskForm();
        $("taskDate").value = state.selectedDate;
        switchView("tasks");
        renderAll();
        $("taskForm").scrollIntoView({ behavior: "smooth", block: "start" });
        $("taskTitle").focus();
    });

    $("exportBtn").addEventListener("click", exportJson);
    $("importBtn").addEventListener("click", () => $("importFile").click());
    $("importFile").addEventListener("change", (event) => importJson(event.target.files[0]));

    $("persistBtn").addEventListener("click", requestStorage);
    $("updateBar").addEventListener("click", () => {
        if (waitingWorker) {
            navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), { once: true });
            waitingWorker.postMessage({ type: "ACTIVATE_UPDATE" });
        }
    });

    window.addEventListener("hashchange", () => {
        const view = location.hash.replace("#", "");
        if (["ledger", "calendar", "tasks"].includes(view)) {
            switchView(view);
            renderAll();
        }
    });

    window.addEventListener("online", renderSyncBar);
    window.addEventListener("offline", renderSyncBar);
    document.addEventListener("visibilitychange", async () => {
        if (!document.hidden) {
            await refreshFromLocal();
            populateCategories();
            renderAll();
        }
    });
}

/* ---------- 启动 ---------- */

async function bootstrap() {
    const now = new Date();
    state.year = now.getFullYear();
    state.month = now.getMonth() + 1;
    state.selectedDate = todayStr();

    const hash = location.hash.replace("#", "");
    state.view = ["ledger", "calendar", "tasks"].includes(hash) ? hash : "calendar";

    $("date").value = todayStr();
    $("taskDate").value = todayStr();



    await openDB();
    const existing = await idbGetAll("categories");
    const needed = existing.length ? EXTRA_EXPENSES : DEFAULT_CATEGORIES;
    await idbPutMany("categories", needed.filter(item => !existing.some(category => category.id === item.id)));
    await refreshFromLocal();
    populateCategories();
    renderAll();


    bindEvents();
    registerServiceWorker();
}

window.addEventListener("unhandledrejection", event => {
    showToast(`操作失败：${event.reason?.message || "请重试"}`);
});
document.addEventListener("DOMContentLoaded", () => bootstrap().catch(error => {
    $("syncBar").textContent = `本地数据库不可用，请使用正常浏览模式重试。${error.message}`;
}));
