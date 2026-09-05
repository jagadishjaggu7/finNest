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
let editingIncomeId = null;
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
    renderExpenseOverview(currentExpenses);
    renderRecentTransactions();
    renderRecentIncomes();
    renderBudgetOverview(currentExpenses);
    updateDashboardDate();
    ensureDashboardActions();
    bindDashboardLinks();
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

function renderExpenseOverview(sourceExpenses) {
    const container = document.getElementById("expenseCategoryList");
    const donutTotal = document.getElementById("donutTotal");
    const chart = document.querySelector(".donut-chart");
    const data = categoryTotals(sourceExpenses || []);
    const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((sum, [, value]) => sum + Number(value || 0), 0);

    if (donutTotal) donutTotal.textContent = formatCurrency(total);
    if (container) {
        if (!entries.length) {
            container.innerHTML = `<div class="empty-state">No expenses for this month.</div>`;
        } else {
            container.innerHTML = entries.map(([category, amount]) => `
                <div class="category-row">
                    <span><i class="category-dot" style="background:${getCategoryColor(category)}"></i>${escapeHtml(category)}</span>
                    <strong>${formatCurrency(amount)}</strong>
                </div>
            `).join("");
        }
    }

    if (chart) {
        if (!entries.length || total <= 0) {
            chart.style.setProperty("--donut-gradient", "conic-gradient(#E2E8F0 0deg 360deg)");
        } else {
            let start = 0;
            const segments = entries.map(([category, amount]) => {
                const degrees = Number(amount) / total * 360;
                const end = start + degrees;
                const segment = `${getCategoryColor(category)} ${start}deg ${end}deg`;
                start = end;
                return segment;
            });
            chart.style.setProperty("--donut-gradient", `conic-gradient(${segments.join(", ")})`);
        }
    }
}

function renderBudgetOverview(currentExpenses) {
    const container = document.querySelector(".budget-grid");
    if (!container) return;
    const data = budgets && typeof budgets === "object" && !Array.isArray(budgets) ? budgets : {};
    const spent = categoryTotals(currentExpenses || []);
    const entries = Object.entries(data);
    if (!entries.length) {
        container.innerHTML = `<div class="empty-state">No personal monthly budgets set yet.</div>`;
        return;
    }
    container.innerHTML = entries.map(([category, limit]) => {
        const used = Number(spent[category] || 0);
        const budget = Number(limit || 0);
        const pct = budget > 0 ? Math.min(100, used / budget * 100) : 0;
        return `<div class="budget-card"><div class="budget-title"><span>${getCategoryIcon(category)}</span>${escapeHtml(category)}</div><div class="budget-values">${formatCurrency(used)} spent · ${formatCurrency(budget)} budget</div><div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div><small>${pct.toFixed(0)}% used</small></div>`;
    }).join("");
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
            <div class="transaction-info"><strong>${escapeHtml(expense.note || expense.category)}</strong><span>${escapeHtml(expense.category)} · ${escapeHtml(expense.account)}${expense.type === "shared" ? " · Shared" : ""}</span></div>
            <strong class="amount expense-amount">-${formatCurrency(expense.amount)}</strong>
        </div>`).join("");
    container.querySelectorAll("[data-expense-id]").forEach(row => {
        row.addEventListener("click", () => openEditExpense(Number(row.dataset.expenseId)));
        row.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") openEditExpense(Number(row.dataset.expenseId)); });
    });
}

function renderRecentIncomes() {
    const container = document.getElementById("recentIncomeList");
    if (!container) return;
    const recent = [...incomes].sort((a, b) => `${b.date}-${b.id}`.localeCompare(`${a.date}-${a.id}`)).slice(0, 6);
    if (!recent.length) {
        container.innerHTML = `<div class="empty-state">No income yet. Click + Add Income to create one.</div>`;
        return;
    }
    container.innerHTML = recent.map(income => `
        <button class="income-row" type="button" data-income-id="${income.id}" aria-label="Edit ${escapeHtml(income.source || "income")}">
            <span class="income-row-main"><strong>${escapeHtml(income.source || "Other income")}</strong><small>${formatDate(income.date)}</small></span>
            <span class="income-row-amount">+${formatCurrency(income.amount)}</span>
        </button>`).join("");
    container.querySelectorAll("[data-income-id]").forEach(row => {
        row.addEventListener("click", () => openEditIncomeModal(Number(row.dataset.incomeId)));
    });
}

function ensureDashboardActions() {
    const button = document.getElementById("dashboardIncomeBtn");
    if (!button) return;
    button.onclick = event => { event.preventDefault(); event.stopPropagation(); openIncomeModal(); };
}

function bindDashboardLinks() {
    const incomeLink = document.getElementById("viewAllIncome");
    if (incomeLink && incomeLink.dataset.bound !== "true") {
        incomeLink.dataset.bound = "true";
        incomeLink.addEventListener("click", () => {
            const first = incomes[0];
            if (first) openEditIncomeModal(first.id);
        });
    }
    const transactionLink = document.getElementById("viewAllTransactions");
    if (transactionLink && transactionLink.dataset.bound !== "true") {
        transactionLink.dataset.bound = "true";
        transactionLink.addEventListener("click", () => { currentView = "Expenses"; renderCurrentView(); });
    }
    const budgetLink = document.getElementById("viewAllBudgets");
    if (budgetLink && budgetLink.dataset.bound !== "true") {
        budgetLink.dataset.bound = "true";
        budgetLink.addEventListener("click", () => { if (typeof window.renderBudgetsView === "function") window.renderBudgetsView(); });
    }
    const reportLink = document.getElementById("viewExpenseReport");
    if (reportLink && reportLink.dataset.bound !== "true") {
        reportLink.dataset.bound = "true";
        reportLink.addEventListener("click", () => { currentView = "Reports"; renderCurrentView(); });
    }
}

function openIncomeModal(mode = "add", income = null) {
    const isEdit = mode === "edit" && income;
    editingIncomeId = isEdit ? income.id : null;
    document.querySelectorAll(".finnest-modal-backdrop").forEach(existing => existing.remove());
    const modal = document.createElement("div");
    modal.className = "finnest-modal-backdrop";
    modal.innerHTML = `<div class="finnest-modal" role="dialog" aria-modal="true" aria-labelledby="incomeModalTitle">
        <div class="sheet-handle"></div>
        <div class="sheet-header"><div><p class="eyebrow">FinNest</p><h2 id="incomeModalTitle">${isEdit ? "Edit Income" : "Add Income"}</h2></div><button class="sheet-close" id="closeIncome" type="button" aria-label="Close">×</button></div>
        <div class="expense-field"><label for="incomeAmount">Amount</label><div class="amount-input-wrapper"><span>₹</span><input id="incomeAmount" type="number" min="0" step="0.01" value="${isEdit ? escapeHtml(income.amount) : ""}" placeholder="0" inputmode="decimal"></div></div>
        <div class="expense-field"><label for="incomeSource">Source</label><input id="incomeSource" type="text" value="${isEdit ? escapeHtml(income.source || "") : ""}" placeholder="Salary, freelance, bonus…"></div>
        <div class="expense-field"><label for="incomeDate">Date</label><input id="incomeDate" type="date" value="${isEdit ? escapeHtml(income.date || todayString()) : todayString()}"></div>
        ${isEdit ? `<button class="delete-income-button" id="deleteIncome" type="button">Delete Income</button>` : ""}
        <div class="expense-actions"><button class="cancel-expense" id="closeIncome2" type="button">Cancel</button><button class="save-expense" id="saveIncome" type="button">${isEdit ? "Save Changes" : "Add Income"}</button></div>
    </div>`;
    document.body.appendChild(modal);
    document.body.style.overflow = "hidden";

    const close = () => { modal.remove(); document.body.style.overflow = ""; editingIncomeId = null; };
    modal.querySelector("#closeIncome").onclick = close;
    modal.querySelector("#closeIncome2").onclick = close;
    modal.onclick = event => { if (event.target === modal) close(); };

    modal.querySelector("#saveIncome").onclick = async () => {
        const amount = Number(modal.querySelector("#incomeAmount").value);
        if (!amount || amount <= 0) return alert("Please enter a valid income amount.");
        const source = modal.querySelector("#incomeSource").value.trim() || "Other income";
        const date = modal.querySelector("#incomeDate").value || todayString();
        const localId = editingIncomeId || Date.now();
        const shouldUpdate = Boolean(editingIncomeId);
        try {
            const saved = await window.FinNestIncomeService?.save({ amount, source, date, id: shouldUpdate ? localId : null });
            if (!saved) throw new Error("Income service is unavailable. Please refresh and try again.");
            if (shouldUpdate) {
                const index = incomes.findIndex(item => item.id === localId);
                if (index >= 0) incomes[index] = saved; else incomes.unshift(saved);
            } else {
                incomes.unshift(saved);
            }
            persistState();
            close();
            renderDashboard();
        } catch (error) {
            console.error("FinNest income save failed", error);
            alert(error?.message || "Income could not be saved. Please try again.");
        }
    };

    modal.querySelector("#deleteIncome")?.addEventListener("click", async () => {
        if (!editingIncomeId) return;
        const target = incomes.find(item => String(item.id) === String(editingIncomeId));
        if (!target) return;
        if (!confirm(`Delete ${target.source || "this income"} — ${formatCurrency(target.amount)}?`)) return;
        try {
            await window.FinNestIncomeService?.remove(editingIncomeId, target);
            incomes = incomes.filter(item => String(item.id) !== String(editingIncomeId));
            persistState();
            close();
            renderDashboard();
        } catch (error) {
            console.error("FinNest income delete failed", error);
            alert(error?.message || "Income could not be deleted. Please try again.");
        }
    });

    setTimeout(() => modal.querySelector("#incomeAmount")?.focus(), 100);
}

function openEditIncomeModal(id) {
    const income = incomes.find(item => String(item.id) === String(id));
    if (income) openIncomeModal("edit", income);
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
        const payerField = document.getElementById("expensePayerField");
        if (payerField) payerField.style.display = expense.type === "shared" ? "block" : "none";
    } else {
        resetExpenseForm();
        document.getElementById("expenseDate").value = todayString();
        document.getElementById("expensePayer").value = familyMembers[0];
        const payerField = document.getElementById("expensePayerField");
        if (payerField) payerField.style.display = "none";
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
    document.querySelector(".add-expense-button")?.addEventListener("click", () => openExpenseSheet());
    bootApp();
});

document.addEventListener("finnest:cloud-data-ready", () => {
    try { renderDashboard(); } catch (error) { console.error("FinNest dashboard refresh failed", error); }
});