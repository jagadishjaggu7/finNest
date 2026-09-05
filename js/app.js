/* =================================
   FINNEST — CLIENT-SIDE APP
   Zero-cost prototype layer
================================= */

const STORAGE_KEYS = {
    expenses: "finnest_expenses",
    incomes: "finnest_incomes",
    budgets: "finnest_budgets",
    familyMembers: "finnest_family_members",
    familyPayers: "finnest_family_payers"
};

const DEFAULT_EXPENSES = [
    { id: 1, amount: 1250, category: "Food & Dining", account: "UPI", type: "personal", note: "Grocery Store", date: "2026-08-16" },
    { id: 2, amount: 2460, category: "Bills & Utilities", account: "Bank Account", type: "shared", note: "Electricity Bill", date: "2026-08-15" },
    { id: 3, amount: 320, category: "Transport", account: "UPI", type: "personal", note: "Uber Ride", date: "2026-08-15" },
    { id: 4, amount: 499, category: "Entertainment", account: "Credit Card", type: "personal", note: "Netflix Subscription", date: "2026-08-14" }
];

const DEFAULT_INCOMES = [{ id: 1, amount: 45000, source: "Salary", date: "2026-08-01" }];

const DEFAULT_BUDGETS = {
    "Food & Dining": 8000,
    "Transport": 4000,
    "Shopping": 5000,
    "Bills & Utilities": 5000,
    "Entertainment": 3000,
    "Health": 3000,
    "Other": 3000
};

const DEFAULT_FAMILY_MEMBERS = ["Me", "Wife"];

const CATEGORY_META = {
    "Food & Dining": { icon: "🍴", color: "#10B981" },
    "Transport": { icon: "🚗", color: "#3B82F6" },
    "Shopping": { icon: "🛍️", color: "#8B5CF6" },
    "Bills & Utilities": { icon: "💡", color: "#F97316" },
    "Health": { icon: "❤️", color: "#EF4444" },
    "Entertainment": { icon: "🎬", color: "#F59E0B" },
    "Other": { icon: "•••", color: "#64748B" }
};

let expenses = loadState(STORAGE_KEYS.expenses, DEFAULT_EXPENSES);
let incomes = loadState(STORAGE_KEYS.incomes, DEFAULT_INCOMES);
let budgets = loadState(STORAGE_KEYS.budgets, DEFAULT_BUDGETS);
let familyMembers = loadState(STORAGE_KEYS.familyMembers, DEFAULT_FAMILY_MEMBERS);
let familyPayers = loadState(STORAGE_KEYS.familyPayers, {});
let editingExpenseId = null;
let currentView = "Dashboard";

function loadState(key, fallback) {
    try {
        const saved = localStorage.getItem(key);
        return saved ? JSON.parse(saved) : structuredClone(fallback);
    } catch (error) {
        console.warn("FinNest storage read failed", error);
        return structuredClone(fallback);
    }
}

function persistState() {
    localStorage.setItem(STORAGE_KEYS.expenses, JSON.stringify(expenses));
    localStorage.setItem(STORAGE_KEYS.incomes, JSON.stringify(incomes));
    localStorage.setItem(STORAGE_KEYS.budgets, JSON.stringify(budgets));
    localStorage.setItem(STORAGE_KEYS.familyMembers, JSON.stringify(familyMembers));
    localStorage.setItem(STORAGE_KEYS.familyPayers, JSON.stringify(familyPayers));
}

function formatCurrency(amount) {
    return "₹" + Number(amount || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function todayString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDate(value) {
    if (!value) return "";
    const d = new Date(`${value}T00:00:00`);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = String(value ?? "");
    return div.innerHTML;
}

function getCategoryIcon(category) { return CATEGORY_META[category]?.icon || "•••"; }
function getCategoryColor(category) { return CATEGORY_META[category]?.color || "#64748B"; }

function getTotals(sourceExpenses = expenses, sourceIncomes = incomes) {
    const totalExpenses = sourceExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const totalIncome = sourceIncomes.reduce((sum, i) => sum + Number(i.amount || 0), 0);
    const available = totalIncome - totalExpenses;
    const savingsRate = totalIncome > 0 ? (available / totalIncome) * 100 : 0;
    return { totalExpenses, totalIncome, available, savingsRate };
}

function categoryTotals(source = expenses) {
    return source.reduce((map, expense) => {
        const category = expense.category || "Other";
        map[category] = (map[category] || 0) + Number(expense.amount || 0);
        return map;
    }, {});
}

function monthKey(date) { return String(date || "").slice(0, 7); }
function currentMonthKey() { return todayString().slice(0, 7); }
function previousMonthKey() {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthExpenses(key) { return expenses.filter(e => monthKey(e.date) === key); }
function monthIncomes(key) { return incomes.filter(i => monthKey(i.date) === key); }

function renderDashboard() {
    const currentExpenses = monthExpenses(currentMonthKey());
    const currentIncomes = monthIncomes(currentMonthKey());
    const totals = getTotals(currentExpenses, currentIncomes);

    setText("totalBalance", formatCurrency(totals.available));
    setText("totalIncome", formatCurrency(totals.totalIncome));
    setText("totalExpenses", formatCurrency(totals.totalExpenses));
    setText("savingsRate", `${totals.savingsRate.toFixed(1)}%`);

    renderMonthComparison(currentExpenses, currentIncomes);
    renderRecentTransactions();
    renderExpenseOverview(currentExpenses);
    renderBudgetOverview(currentExpenses);
    updateDashboardDate();
    ensureDashboardActions();
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

function renderMonthComparison(currentExpenses, currentIncomes) {
    const previousExpenses = monthExpenses(previousMonthKey());
    const previousIncomes = monthIncomes(previousMonthKey());
    const current = getTotals(currentExpenses, currentIncomes);
    const previous = getTotals(previousExpenses, previousIncomes);
    const cards = document.querySelectorAll(".summary-card");
    const values = [current.available, current.totalIncome, current.totalExpenses, current.savingsRate];
    const previousValues = [previous.available, previous.totalIncome, previous.totalExpenses, previous.savingsRate];

    cards.forEach((card, index) => {
        const p = card.querySelector("p");
        if (!p) return;
        const oldValue = previousValues[index];
        const newValue = values[index];
        if (!previousExpenses.length && !previousIncomes.length) {
            p.textContent = "Current month";
            p.className = "positive";
            return;
        }
        if (oldValue === 0) {
            p.textContent = "New this month";
            p.className = "positive";
            return;
        }
        const change = ((newValue - oldValue) / Math.abs(oldValue)) * 100;
        p.textContent = `${change >= 0 ? "↑" : "↓"} ${Math.abs(change).toFixed(1)}% vs last month`;
        p.className = index === 2 ? (change > 0 ? "negative" : "positive") : (change >= 0 ? "positive" : "negative");
    });
}

function updateDashboardDate() {
    const eyebrow = document.querySelector(".page-header .eyebrow");
    if (eyebrow) eyebrow.textContent = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long" });
}

function renderRecentTransactions() {
    const container = document.getElementById("recentTransactions");
    if (!container) return;
    const recent = [...expenses].sort((a, b) => `${b.date}-${b.id}`.localeCompare(`${a.date}-${a.id}`)).slice(0, 6);

    if (!recent.length) {
        container.innerHTML = `<div class="empty-state">No expenses yet. Add your first expense.</div>`;
        return;
    }

    container.innerHTML = recent.map(expense => `
        <div class="transaction" data-expense-id="${expense.id}" role="button" tabindex="0">
            <div class="transaction-icon" style="background:${getCategoryColor(expense.category)}18">${getCategoryIcon(expense.category)}</div>
            <div class="transaction-info">
                <strong>${escapeHtml(expense.note || expense.category)}</strong>
                <span>${escapeHtml(expense.category)} · ${escapeHtml(expense.account)}${expense.type === "shared" ? " · Shared" : ""}</span>
            </div>
            <strong class="amount expense-amount">-${formatCurrency(expense.amount)}</strong>
        </div>
    `).join("");

    container.querySelectorAll("[data-expense-id]").forEach(row => {
        row.addEventListener("click", () => openEditExpense(Number(row.dataset.expenseId)));
        row.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") openEditExpense(Number(row.dataset.expenseId));
        });
    });
}

function renderExpenseOverview(source = monthExpenses(currentMonthKey())) {
    const totalExpenses = source.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    setText("donutTotal", formatCurrency(totalExpenses));
    const totals = categoryTotals(source);
    const categories = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    const donut = document.querySelector(".donut-chart");

    if (donut && totalExpenses > 0) {
        let cursor = 0;
        const parts = categories.map(([category, amount]) => {
            const pct = amount / totalExpenses * 100;
            const start = cursor;
            cursor += pct;
            return `${getCategoryColor(category)} ${start}% ${cursor}%`;
        });
        donut.style.setProperty("--donut-gradient", `conic-gradient(${parts.join(", ")})`);
    } else if (donut) donut.style.setProperty("--donut-gradient", "#CBD5E1");

    const list = document.getElementById("expenseCategoryList");
    if (!list) return;
    list.innerHTML = categories.length ? categories.map(([category, amount]) => `
        <div class="category-row"><span><i class="category-dot" style="background:${getCategoryColor(category)}"></i>${escapeHtml(category)}</span><strong>${formatCurrency(amount)}</strong></div>
    `).join("") : `<p class="empty-state">No expenses this month</p>`;
}

function renderBudgetOverview(source = monthExpenses(currentMonthKey())) {
    const grid = document.querySelector(".budget-grid");
    if (!grid) return;
    const totals = categoryTotals(source);
    grid.innerHTML = Object.keys(budgets).map(category => {
        const spent = totals[category] || 0;
        const limit = Number(budgets[category] || 0);
        const pct = limit > 0 ? Math.min((spent / limit) * 100, 100) : 0;
        const over = spent > limit;
        return `<div class="budget-card"><div class="budget-title">${getCategoryIcon(category)} <span>${escapeHtml(category)}</span></div><div class="budget-values">${formatCurrency(spent)} / ${formatCurrency(limit)}</div><div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div><small class="${over ? "budget-over" : ""}">${over ? "Over budget" : `${pct.toFixed(0)}% used`}</small></div>`;
    }).join("");
}

function ensureDashboardActions() {
    const pageHeader = document.querySelector(".page-header");
    if (!pageHeader) return;

    let actions = pageHeader.querySelector(".page-actions");
    if (!actions) {
        actions = document.createElement("div");
        actions.className = "page-actions";
        pageHeader.appendChild(actions);
    }

    let button = actions.querySelector("#dashboardIncomeBtn");
    if (!button) {
        actions.innerHTML = `
            <button id="dashboardIncomeBtn" class="primary-btn" type="button">
                <span aria-hidden="true">+</span>
                <span>Add Income</span>
            </button>
        `;
        button = actions.querySelector("#dashboardIncomeBtn");
    }

    if (button && button.dataset.bound !== "true") {
        button.dataset.bound = "true";
        button.addEventListener("click", openIncomeModal);
    }
}

function openIncomeModal() {
    const modal = document.createElement("div");
    modal.className = "finnest-modal-backdrop";
    modal.innerHTML = `<div class="finnest-modal" role="dialog" aria-modal="true" aria-labelledby="incomeModalTitle"><div class="sheet-handle"></div><div class="sheet-header"><div><p class="eyebrow">FinNest</p><h2 id="incomeModalTitle">Add Income</h2></div><button class="sheet-close" id="closeIncome" type="button" aria-label="Close">×</button></div><div class="expense-field"><label for="incomeAmount">Amount</label><div class="amount-input-wrapper"><span>₹</span><input id="incomeAmount" type="number" min="0" step="0.01" placeholder="0" inputmode="decimal"></div></div><div class="expense-field"><label for="incomeSource">Source</label><input id="incomeSource" type="text" placeholder="Salary, freelance, bonus…"></div><div class="expense-field"><label for="incomeDate">Date</label><input id="incomeDate" type="date" value="${todayString()}"></div><div class="expense-actions"><button class="cancel-expense" id="closeIncome2" type="button">Cancel</button><button class="save-expense" id="saveIncome" type="button">Add Income</button></div></div>`;
    document.body.appendChild(modal);
    document.body.style.overflow = "hidden";
    const close = () => { modal.remove(); document.body.style.overflow = ""; };
    modal.querySelector("#closeIncome").onclick = close;
    modal.querySelector("#closeIncome2").onclick = close;
    modal.onclick = event => { if (event.target === modal) close(); };
    modal.querySelector("#saveIncome").onclick = async () => {
        const amount = Number(modal.querySelector("#incomeAmount").value);
        if (!amount || amount <= 0) return alert("Please enter a valid income amount.");
        const source = modal.querySelector("#incomeSource").value.trim() || "Other income";
        const date = modal.querySelector("#incomeDate").value || todayString();
        const id = Date.now();
        const localIncome = { id, amount, source, date };
        try {
            const saved = await window.FinNestIncomeService?.save({ amount, source, date, id });
            if (!saved) throw new Error("Income service is unavailable. Please refresh and try again.");
            incomes.unshift(saved);
            persistState();
            close();
            renderDashboard();
        } catch (error) {
            console.error("FinNest income save failed", error);
            alert(error?.message || "Income could not be saved. Please try again.");
        }
    };
    setTimeout(() => modal.querySelector("#incomeAmount").focus(), 100);
}

function ensurePayerField() {
    if (document.getElementById("expensePayerField")) return;
    const typeField = document.querySelector(".expense-type-toggle")?.closest(".expense-field");
    if (!typeField) return;
    const field = document.createElement("div");
    field.className = "expense-field";
    field.id = "expensePayerField";
    field.innerHTML = `<label for="expensePayer">Paid by</label><select id="expensePayer">${familyMembers.map(member => `<option value="${escapeHtml(member)}">${escapeHtml(member)}</option>`).join("")}</select>`;
    typeField.insertAdjacentElement("afterend", field);
}

function openExpenseSheet(mode = "add", expense = null) {
    const sheet = document.getElementById("expenseSheet");
    if (!sheet) return;
    ensurePayerField();
    editingExpenseId = mode === "edit" && expense ? expense.id : null;
    sheet.querySelector("h2").textContent = editingExpenseId ? "Edit Expense" : "Add Expense";
    document.getElementById("saveExpense").textContent = editingExpenseId ? "Save Changes" : "Add Expense";

    if (expense) {
        document.getElementById("expenseAmount").value = expense.amount;
        document.getElementById("expenseAccount").value = expense.account;
        document.getElementById("expenseNote").value = expense.note || "";
        document.getElementById("expenseDate").value = expense.date || todayString();
        selectChip(".category-chip", "data-category", expense.category);
        selectChip(".type-option", "data-type", expense.type);
        document.getElementById("expensePayer").value = familyPayers[expense.id] || familyMembers[0];
    } else {
        resetExpenseForm();
        document.getElementById("expenseDate").value = todayString();
        document.getElementById("expensePayer").value = familyMembers[0];
    }

    ensureDeleteButton();
    document.getElementById("deleteExpenseButton").style.display = editingExpenseId ? "block" : "none";
    sheet.classList.add("open");
    document.body.style.overflow = "hidden";
    setTimeout(() => document.getElementById("expenseAmount")?.focus(), 150);
}

function selectChip(selector, attribute, value) {
    document.querySelectorAll(selector).forEach(item => item.classList.toggle("selected", item.getAttribute(attribute) === value));
}

function ensureDeleteButton() {
    if (document.getElementById("deleteExpenseButton")) return;
    const actions = document.querySelector(".expense-actions");
    if (!actions) return;
    const button = document.createElement("button");
    button.id = "deleteExpenseButton";
    button.className = "delete-expense-button";
    button.textContent = "Delete Expense";
    button.style.display = "none";
    actions.parentElement.insertBefore(button, actions);
    button.onclick = deleteCurrentExpense;
}

function closeExpenseSheet() {
    document.getElementById("expenseSheet")?.classList.remove("open");
    document.body.style.overflow = "";
    editingExpenseId = null;
}

function resetExpenseForm() {
    document.getElementById("expenseAmount").value = "";
    document.getElementById("expenseNote").value = "";
    document.getElementById("expenseDate").value = todayString();
    document.querySelectorAll(".category-chip").forEach((chip, i) => chip.classList.toggle("selected", i === 0));
    document.querySelectorAll(".type-option").forEach((option, i) => option.classList.toggle("selected", i === 0));
    document.getElementById("expenseAccount").selectedIndex = 0;
}

function saveExpenseFromForm() {
    const amount = Number(document.getElementById("expenseAmount").value);
    if (!amount || amount <= 0) return alert("Please enter a valid amount.");
    const category = document.querySelector(".category-chip.selected")?.dataset.category || "Other";
    const type = document.querySelector(".type-option.selected")?.dataset.type || "personal";
    const account = document.getElementById("expenseAccount").value;
    const note = document.getElementById("expenseNote").value.trim();
    const date = document.getElementById("expenseDate").value || todayString();
    const payer = document.getElementById("expensePayer")?.value || familyMembers[0];

    if (editingExpenseId) {
        const target = expenses.find(e => e.id === editingExpenseId);
        if (target) Object.assign(target, { amount, category, type, account, note, date });
        familyPayers[editingExpenseId] = payer;
    } else {
        const id = Date.now();
        expenses.unshift({ id, amount, category, type, account, note, date });
        familyPayers[id] = payer;
    }

    persistState();
    closeExpenseSheet();
    renderDashboard();
    renderCurrentView();
}

function deleteCurrentExpense() {
    if (!editingExpenseId) return;
    const target = expenses.find(e => e.id === editingExpenseId);
    if (!target) return;
    if (!confirm(`Delete ${target.note || target.category} — ${formatCurrency(target.amount)}?`)) return;
    expenses = expenses.filter(e => e.id !== editingExpenseId);
    delete familyPayers[editingExpenseId];
    persistState();
    closeExpenseSheet();
    renderDashboard();
    renderCurrentView();
}

function openEditExpense(id) {
    const expense = expenses.find(e => e.id === id);
    if (expense) openExpenseSheet("edit", expense);
}

function renderExpensesView() {
    const categories = ["All", ...Object.keys(CATEGORY_META)];
    const accounts = ["All", "UPI", "Bank Account", "Cash", "Credit Card"];
    const container = getDynamicView();
    container.innerHTML = `<div class="view-heading"><div><p class="eyebrow">Every transaction in one place</p><h1>Expenses</h1></div><button class="finnest-primary-button" id="viewAddExpense" type="button">+ Add Expense</button></div><div class="filter-bar"><input id="expenseSearch" placeholder="Search notes, categories or accounts…"><select id="expenseCategoryFilter"><option>All</option>${categories.slice(1).map(c => `<option>${escapeHtml(c)}</option>`).join("")}</select><select id="expenseAccountFilter">${accounts.map(a => `<option>${escapeHtml(a)}</option>`).join("")}</select><select id="expenseTypeFilter"><option value="All">All types</option><option value="personal">Personal</option><option value="shared">Shared</option></select></div><div id="expenseList" class="expense-list"></div>`;
    document.getElementById("viewAddExpense").onclick = () => openExpenseSheet();
    ["expenseSearch", "expenseCategoryFilter", "expenseAccountFilter", "expenseTypeFilter"].forEach(id => document.getElementById(id).addEventListener("input", renderExpenseList));
    renderExpenseList();
}

function renderExpenseList() {
    const list = document.getElementById("expenseList");
    if (!list) return;
    const q = document.getElementById("expenseSearch")?.value.toLowerCase() || "";
    const category = document.getElementById("expenseCategoryFilter")?.value || "All";
    const account = document.getElementById("expenseAccountFilter")?.value || "All";
    const type = document.getElementById("expenseTypeFilter")?.value || "All";
    const filtered = expenses.filter(expense => {
        const matchesQuery = [expense.note, expense.category, expense.account].some(value => String(value || "").toLowerCase().includes(q));
        const matchesCategory = category === "All" || expense.category === category;
        const matchesAccount = account === "All" || expense.account === account;
        const matchesType = type === "All" || expense.type === type;
        return matchesQuery && matchesCategory && matchesAccount && matchesType;
    });
    if (!filtered.length) {
        list.innerHTML = `<div class="empty-state">No expenses match your filters.</div>`;
        return;
    }
    list.innerHTML = filtered.map(expense => `<button class="expense-row" data-expense-id="${expense.id}" type="button"><span class="expense-row-icon">${getCategoryIcon(expense.category)}</span><span class="expense-row-main"><strong>${escapeHtml(expense.note || expense.category)}</strong><small>${escapeHtml(expense.category)} · ${escapeHtml(expense.account)} · ${formatDate(expense.date)}${expense.type === "shared" ? " · Shared" : ""}</small></span><strong class="expense-row-amount">-${formatCurrency(expense.amount)}</strong></button>`).join("");
    list.querySelectorAll("[data-expense-id]").forEach(row => row.onclick = () => openEditExpense(Number(row.dataset.expenseId)));
}

function renderCurrentView() {
    if (currentView === "Expenses") renderExpensesView();
    if (currentView === "Dashboard") renderDashboard();
}

function getDynamicView() {
    let container = document.getElementById("dynamicView");
    if (!container) {
        container = document.createElement("div");
        container.id = "dynamicView";
        container.className = "main-dynamic-view";
        document.querySelector(".main-content")?.appendChild(container);
    }
    return container;
}

function bootApp() {
    renderDashboard();
}

document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".category-chip").forEach(chip => chip.addEventListener("click", () => {
        document.querySelectorAll(".category-chip").forEach(item => item.classList.remove("selected"));
        chip.classList.add("selected");
    }));

    document.querySelectorAll(".type-option").forEach(option => option.addEventListener("click", () => {
        document.querySelectorAll(".type-option").forEach(item => item.classList.remove("selected"));
        option.classList.add("selected");
        const payer = document.getElementById("expensePayerField");
        if (payer) payer.style.display = option.dataset.type === "shared" ? "block" : "none";
    }));

    document.getElementById("closeExpenseSheet")?.addEventListener("click", closeExpenseSheet);
    document.getElementById("cancelExpense")?.addEventListener("click", closeExpenseSheet);
    document.getElementById("saveExpense")?.addEventListener("click", saveExpenseFromForm);
    document.getElementById("desktopAddExpense")?.addEventListener("click", () => openExpenseSheet());

    bootApp();
});