/* =================================
   FINNEST — CLIENT-SIDE APP
   Zero-cost prototype layer
   Backend/Supabase can replace storage functions later.
================================= */

const STORAGE_KEYS = {
    expenses: "finnest_expenses",
    incomes: "finnest_incomes",
    budgets: "finnest_budgets"
};

const DEFAULT_EXPENSES = [
    { id: 1, amount: 1250, category: "Food & Dining", account: "UPI", type: "personal", note: "Grocery Store", date: "2026-08-16" },
    { id: 2, amount: 2460, category: "Bills & Utilities", account: "Bank Account", type: "shared", note: "Electricity Bill", date: "2026-08-15" },
    { id: 3, amount: 320, category: "Transport", account: "UPI", type: "personal", note: "Uber Ride", date: "2026-08-15" },
    { id: 4, amount: 499, category: "Entertainment", account: "Credit Card", type: "personal", note: "Netflix Subscription", date: "2026-08-14" }
];

const DEFAULT_INCOMES = [
    { id: 1, amount: 45000, source: "Salary", date: "2026-08-01" }
];

const DEFAULT_BUDGETS = {
    "Food & Dining": 8000,
    "Transport": 4000,
    "Shopping": 5000,
    "Bills & Utilities": 5000,
    "Entertainment": 3000,
    "Health": 3000,
    "Other": 3000
};

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
}

function formatCurrency(amount) {
    return "₹" + Number(amount || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function todayString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = String(value ?? "");
    return div.innerHTML;
}

function getCategoryIcon(category) {
    return CATEGORY_META[category]?.icon || "•••";
}

function getCategoryColor(category) {
    return CATEGORY_META[category]?.color || "#64748B";
}

function getTotals() {
    const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const totalIncome = incomes.reduce((sum, i) => sum + Number(i.amount || 0), 0);
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

function renderDashboard() {
    const { totalExpenses, totalIncome, available, savingsRate } = getTotals();

    const balance = document.getElementById("totalBalance");
    const income = document.getElementById("totalIncome");
    const expense = document.getElementById("totalExpenses");
    const savings = document.getElementById("savingsRate");

    if (balance) balance.textContent = formatCurrency(available);
    if (income) income.textContent = formatCurrency(totalIncome);
    if (expense) expense.textContent = formatCurrency(totalExpenses);
    if (savings) savings.textContent = `${savingsRate.toFixed(1)}%`;

    renderRecentTransactions();
    renderExpenseOverview();
    renderBudgetOverview();
    ensureDashboardActions();
}

function renderRecentTransactions() {
    const container = document.getElementById("recentTransactions");
    if (!container) return;

    const recent = [...expenses]
        .sort((a, b) => `${b.date}-${b.id}`.localeCompare(`${a.date}-${a.id}`))
        .slice(0, 6);

    if (!recent.length) {
        container.innerHTML = `<div class="empty-state">No expenses yet. Add your first expense.</div>`;
        return;
    }

    container.innerHTML = recent.map(expense => `
        <div class="transaction" data-expense-id="${expense.id}" role="button" tabindex="0">
            <div class="transaction-icon" style="background:${getCategoryColor(expense.category)}18;">
                ${getCategoryIcon(expense.category)}
            </div>
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

function renderExpenseOverview() {
    const totalExpenses = getTotals().totalExpenses;
    const donutTotal = document.getElementById("donutTotal");
    if (donutTotal) donutTotal.textContent = formatCurrency(totalExpenses);

    const totals = categoryTotals();
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
    } else if (donut) {
        donut.style.setProperty("--donut-gradient", "#CBD5E1");
    }

    const list = document.getElementById("expenseCategoryList");
    if (!list) return;

    list.innerHTML = categories.length
        ? categories.map(([category, amount]) => `
            <div class="category-row">
                <span><i class="category-dot" style="background:${getCategoryColor(category)}"></i>${escapeHtml(category)}</span>
                <strong>${formatCurrency(amount)}</strong>
            </div>
        `).join("")
        : `<p class="empty-state">No expenses yet</p>`;
}

function renderBudgetOverview() {
    const section = document.querySelector(".budget-section");
    const grid = document.querySelector(".budget-grid");
    if (!section || !grid) return;

    const totals = categoryTotals();
    const categories = Object.keys(budgets);

    grid.innerHTML = categories.map(category => {
        const spent = totals[category] || 0;
        const limit = Number(budgets[category] || 0);
        const pct = limit > 0 ? Math.min((spent / limit) * 100, 100) : 0;
        const over = spent > limit;
        return `
            <div class="budget-card">
                <div class="budget-title">${getCategoryIcon(category)} <span>${escapeHtml(category)}</span></div>
                <div class="budget-values">${formatCurrency(spent)} / ${formatCurrency(limit)}</div>
                <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
                <small class="${over ? "budget-over" : ""}">${over ? "Over budget" : `${pct.toFixed(0)}% used`}</small>
            </div>
        `;
    }).join("");
}

function ensureDashboardActions() {
    const header = document.querySelector(".page-header > div");
    if (!header || document.getElementById("quickIncomeButton")) return;

    const actions = document.createElement("div");
    actions.className = "finnest-header-actions";
    actions.innerHTML = `
        <button class="finnest-secondary-button" id="quickIncomeButton">+ Add Income</button>
    `;
    header.parentElement.appendChild(actions);
    document.getElementById("quickIncomeButton").addEventListener("click", openIncomeModal);
}

function openIncomeModal() {
    const modal = document.createElement("div");
    modal.className = "finnest-modal-backdrop";
    modal.id = "incomeModal";
    modal.innerHTML = `
        <div class="finnest-modal">
            <div class="sheet-handle"></div>
            <div class="sheet-header"><div><p class="eyebrow">FinNest</p><h2>Add Income</h2></div><button class="sheet-close" id="closeIncome">×</button></div>
            <div class="expense-field"><label>Amount</label><div class="amount-input-wrapper"><span>₹</span><input id="incomeAmount" type="number" min="0" step="0.01" placeholder="0" inputmode="decimal"></div></div>
            <div class="expense-field"><label>Source</label><input id="incomeSource" type="text" placeholder="Salary, freelance, bonus…"></div>
            <div class="expense-field"><label>Date</label><input id="incomeDate" type="date" value="${todayString()}"></div>
            <div class="expense-actions"><button class="cancel-expense" id="closeIncome2">Cancel</button><button class="save-expense" id="saveIncome">Add Income</button></div>
        </div>
    `;
    document.body.appendChild(modal);
    document.body.style.overflow = "hidden";
    const close = () => { modal.remove(); document.body.style.overflow = ""; };
    modal.querySelector("#closeIncome").onclick = close;
    modal.querySelector("#closeIncome2").onclick = close;
    modal.addEventListener("click", e => { if (e.target === modal) close(); });
    modal.querySelector("#saveIncome").onclick = () => {
        const amount = Number(modal.querySelector("#incomeAmount").value);
        const source = modal.querySelector("#incomeSource").value.trim() || "Other income";
        if (!amount || amount <= 0) return alert("Please enter a valid income amount.");
        incomes.unshift({ id: Date.now(), amount, source, date: modal.querySelector("#incomeDate").value || todayString() });
        persistState();
        close();
        renderDashboard();
    };
    setTimeout(() => modal.querySelector("#incomeAmount").focus(), 100);
}

function openExpenseSheet(mode = "add", expense = null) {
    const sheet = document.getElementById("expenseSheet");
    if (!sheet) return;

    editingExpenseId = mode === "edit" && expense ? expense.id : null;
    const title = sheet.querySelector("h2");
    const saveButton = document.getElementById("saveExpense");
    title.textContent = editingExpenseId ? "Edit Expense" : "Add Expense";
    saveButton.textContent = editingExpenseId ? "Save Changes" : "Add Expense";

    if (expense) {
        document.getElementById("expenseAmount").value = expense.amount;
        document.getElementById("expenseAccount").value = expense.account;
        document.getElementById("expenseNote").value = expense.note || "";
        document.getElementById("expenseDate").value = expense.date || todayString();
        selectChip(".category-chip", "data-category", expense.category);
        selectChip(".type-option", "data-type", expense.type);
    } else {
        resetExpenseForm();
        document.getElementById("expenseDate").value = todayString();
    }

    ensureDeleteButton();
    document.getElementById("deleteExpenseButton").style.display = editingExpenseId ? "block" : "none";
    sheet.classList.add("open");
    document.body.style.overflow = "hidden";
    setTimeout(() => document.getElementById("expenseAmount")?.focus(), 200);
}

function selectChip(selector, attribute, value) {
    document.querySelectorAll(selector).forEach(item => item.classList.toggle("selected", item.getAttribute(attribute) === value));
}

function ensureDeleteButton() {
    if (document.getElementById("deleteExpenseButton")) return;
    const actions = document.querySelector(".expense-actions");
    const button = document.createElement("button");
    button.id = "deleteExpenseButton";
    button.className = "delete-expense-button";
    button.textContent = "Delete Expense";
    button.style.display = "none";
    actions.parentElement.insertBefore(button, actions);
    button.addEventListener("click", deleteCurrentExpense);
}

function closeExpenseSheet() {
    const sheet = document.getElementById("expenseSheet");
    sheet?.classList.remove("open");
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

    if (editingExpenseId) {
        const target = expenses.find(e => e.id === editingExpenseId);
        if (target) Object.assign(target, { amount, category, type, account, note, date });
    } else {
        expenses.unshift({ id: Date.now(), amount, category, type, account, note, date });
    }

    persistState();
    closeExpenseSheet();
    renderDashboard();
    if (currentView !== "Dashboard") renderCurrentView();
}

function deleteCurrentExpense() {
    if (!editingExpenseId) return;
    const target = expenses.find(e => e.id === editingExpenseId);
    if (!target) return;
    const ok = confirm(`Delete ${target.note || target.category} — ${formatCurrency(target.amount)}?`);
    if (!ok) return;
    expenses = expenses.filter(e => e.id !== editingExpenseId);
    persistState();
    closeExpenseSheet();
    renderDashboard();
    if (currentView !== "Dashboard") renderCurrentView();
}

function openEditExpense(id) {
    const expense = expenses.find(e => e.id === id);
    if (expense) openExpenseSheet("edit", expense);
}

function renderExpensesView() {
    const categories = ["All", ...Object.keys(CATEGORY_META)];
    const accounts = ["All", "UPI", "Bank Account", "Cash", "Credit Card"];
    const container = getDynamicView();
    container.innerHTML = `
        <div class="view-heading"><div><p class="eyebrow">FinNest</p><h1>Expenses</h1></div><button class="finnest-primary-button" id="viewAddExpense">+ Add Expense</button></div>
        <div class="filter-bar">
            <input id="expenseSearch" placeholder="Search notes or categories…">
            <select id="expenseCategoryFilter">${categories.map(c => `<option>${escapeHtml(c)}</option>`).join("")}</select>
            <select id="expenseAccountFilter">${accounts.map(a => `<option>${escapeHtml(a)}</option>`).join("")}</select>
            <select id="expenseTypeFilter"><option>All</option><option value="personal">Personal</option><option value="shared">Shared</option></select>
        </div>
        <div id="expenseList" class="expense-list"></div>
    `;
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
    const filtered = [...expenses].filter(e =>
        (!q || `${e.note} ${e.category}`.toLowerCase().includes(q)) &&
        (category === "All" || e.category === category) &&
        (account === "All" || e.account === account) &&
        (type === "All" || e.type === type)
    ).sort((a, b) => `${b.date}-${b.id}`.localeCompare(`${a.date}-${a.id}`));

    list.innerHTML = filtered.length ? filtered.map(e => `
        <div class="expense-list-row" data-expense-id="${e.id}">
            <div class="transaction-icon" style="background:${getCategoryColor(e.category)}18">${getCategoryIcon(e.category)}</div>
            <div class="expense-list-info"><strong>${escapeHtml(e.note || e.category)}</strong><span>${escapeHtml(e.category)} · ${escapeHtml(e.account)} · ${e.type === "shared" ? "Shared" : "Personal"} · ${escapeHtml(e.date)}</span></div>
            <strong class="expense-amount">-${formatCurrency(e.amount)}</strong>
        </div>
    `).join("") : `<div class="empty-state">No matching expenses.</div>`;

    list.querySelectorAll("[data-expense-id]").forEach(row => row.onclick = () => openEditExpense(Number(row.dataset.expenseId)));
}

function renderFamilyView() {
    const shared = expenses.filter(e => e.type === "shared");
    const total = shared.reduce((sum, e) => sum + Number(e.amount), 0);
    const container = getDynamicView();
    container.innerHTML = `
        <div class="view-heading"><div><p class="eyebrow">Shared household spending</p><h1>Family</h1></div></div>
        <div class="family-summary"><div><span>Shared expenses</span><strong>${formatCurrency(total)}</strong></div><div><span>Transactions</span><strong>${shared.length}</strong></div></div>
        <div class="dashboard-card"><div class="card-header"><h2>Shared expenses</h2><span class="muted">You + family</span></div><div class="expense-list">
            ${shared.length ? shared.sort((a,b) => b.date.localeCompare(a.date)).map(e => `<div class="expense-list-row" data-expense-id="${e.id}"><div class="transaction-icon">${getCategoryIcon(e.category)}</div><div class="expense-list-info"><strong>${escapeHtml(e.note || e.category)}</strong><span>${escapeHtml(e.category)} · ${escapeHtml(e.date)}</span></div><strong class="expense-amount">-${formatCurrency(e.amount)}</strong></div>`).join("") : `<div class="empty-state">No shared expenses yet.</div>`}
        </div></div>
    `;
    container.querySelectorAll("[data-expense-id]").forEach(row => row.onclick = () => openEditExpense(Number(row.dataset.expenseId)));
}

function renderAccountsView() {
    const totals = {};
    expenses.forEach(e => totals[e.account] = (totals[e.account] || 0) + Number(e.amount));
    const container = getDynamicView();
    container.innerHTML = `
        <div class="view-heading"><div><p class="eyebrow">Payment sources</p><h1>Accounts</h1></div></div>
        <div class="account-grid">
            ${["Cash", "UPI", "Bank Account", "Credit Card"].map(account => `<div class="dashboard-card"><span class="muted">${account}</span><strong class="big-number">${formatCurrency(totals[account] || 0)}</strong><small>Spent from this account</small></div>`).join("")}
        </div>
    `;
}

function renderBudgetsView() {
    const totals = categoryTotals();
    const container = getDynamicView();
    container.innerHTML = `
        <div class="view-heading"><div><p class="eyebrow">Monthly spending limits</p><h1>Budgets</h1></div><button class="finnest-primary-button" id="saveBudgets">Save Budgets</button></div>
        <div class="budget-editor">
            ${Object.keys(DEFAULT_BUDGETS).map(category => `<div class="budget-editor-row"><span>${getCategoryIcon(category)} ${escapeHtml(category)}</span><input type="number" min="0" data-budget-category="${escapeHtml(category)}" value="${Number(budgets[category] || 0)}"><small>Spent: ${formatCurrency(totals[category] || 0)}</small></div>`).join("")}
        </div>
    `;
    document.getElementById("saveBudgets").onclick = () => {
        container.querySelectorAll("[data-budget-category]").forEach(input => budgets[input.dataset.budgetCategory] = Number(input.value || 0));
        persistState();
        renderBudgetOverview();
        alert("Budgets saved.");
    };
}

function renderReportsView() {
    const totals = categoryTotals();
    const top = Object.entries(totals).sort((a,b) => b[1] - a[1]);
    const { totalIncome, totalExpenses, available, savingsRate } = getTotals();
    const container = getDynamicView();
    container.innerHTML = `
        <div class="view-heading"><div><p class="eyebrow">Financial overview</p><h1>Reports</h1></div><button class="finnest-secondary-button" id="exportCsv">Export CSV</button></div>
        <div class="report-stat-grid"><div class="dashboard-card"><span>Income</span><strong>${formatCurrency(totalIncome)}</strong></div><div class="dashboard-card"><span>Expenses</span><strong>${formatCurrency(totalExpenses)}</strong></div><div class="dashboard-card"><span>Available</span><strong>${formatCurrency(available)}</strong></div><div class="dashboard-card"><span>Savings rate</span><strong>${savingsRate.toFixed(1)}%</strong></div></div>
        <div class="dashboard-card"><div class="card-header"><h2>Spending by category</h2></div><div class="report-bars">${top.map(([category, amount]) => { const pct = totalExpenses ? amount / totalExpenses * 100 : 0; return `<div class="report-bar"><div><span>${getCategoryIcon(category)} ${escapeHtml(category)}</span><strong>${formatCurrency(amount)}</strong></div><div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div></div>`; }).join("")}</div></div>
    `;
    document.getElementById("exportCsv").onclick = exportCsv;
}

function renderSettingsView() {
    const container = getDynamicView();
    container.innerHTML = `
        <div class="view-heading"><div><p class="eyebrow">Local prototype</p><h1>Settings</h1></div></div>
        <div class="settings-grid">
            <div class="dashboard-card"><h2>Backup</h2><p class="muted">Download your FinNest data as JSON and restore it later.</p><div class="settings-actions"><button class="finnest-secondary-button" id="exportJson">Export JSON</button><label class="finnest-secondary-button file-label">Import JSON<input id="importJson" type="file" accept="application/json" hidden></label></div></div>
            <div class="dashboard-card danger-card"><h2>Reset demo data</h2><p class="muted">Restore the sample FinNest data. This removes your current local prototype data.</p><button class="delete-expense-button" id="resetData">Reset Data</button></div>
        </div>
    `;
    document.getElementById("exportJson").onclick = exportJson;
    document.getElementById("importJson").onchange = importJson;
    document.getElementById("resetData").onclick = resetData;
}

function getDynamicView() {
    let view = document.getElementById("finnestDynamicView");
    if (!view) {
        view = document.createElement("div");
        view.id = "finnestDynamicView";
        view.className = "finnest-dynamic-view";
        document.querySelector(".main-content")?.appendChild(view);
    }
    return view;
}

function showDashboard() {
    document.querySelectorAll(".page-header, .summary-grid, .dashboard-grid, .budget-section").forEach(el => el.style.display = "");
    getDynamicView().style.display = "none";
    currentView = "Dashboard";
    renderDashboard();
}

function renderCurrentView() {
    if (currentView === "Dashboard") return showDashboard();
    document.querySelectorAll(".page-header, .summary-grid, .dashboard-grid, .budget-section").forEach(el => el.style.display = "none");
    const view = getDynamicView();
    view.style.display = "block";
    if (currentView === "Expenses") renderExpensesView();
    if (currentView === "Budgets") renderBudgetsView();
    if (currentView === "Reports") renderReportsView();
    if (currentView === "Family") renderFamilyView();
    if (currentView === "Accounts") renderAccountsView();
    if (currentView === "Settings") renderSettingsView();
}

function wireNavigation() {
    const desktopItems = document.querySelectorAll(".sidebar .nav-item");
    const mobileItems = document.querySelectorAll(".mobile-nav .mobile-nav-item");
    const names = ["Dashboard", "Expenses", "Budgets", "Reports", "Family", "Accounts", "Settings"];

    desktopItems.forEach((item, index) => item.addEventListener("click", () => {
        desktopItems.forEach(x => x.classList.remove("active"));
        item.classList.add("active");
        currentView = names[index];
        renderCurrentView();
    }));

    mobileItems.forEach(item => {
        item.addEventListener("click", () => {
            const label = item.querySelector("small")?.textContent;
            if (label === "Home") return showDashboard();
            if (label === "Expenses") currentView = "Expenses";
            if (label === "Reports") currentView = "Reports";
            if (label === "More") currentView = "Settings";
            renderCurrentView();
        });
    });
}

function exportCsv() {
    const rows = [["Date", "Category", "Amount", "Account", "Type", "Note"]];
    expenses.forEach(e => rows.push([e.date, e.category, e.amount, e.account, e.type, e.note || ""]));
    downloadFile("finnest-expenses.csv", rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n"), "text/csv");
}

function exportJson() {
    downloadFile("finnest-backup.json", JSON.stringify({ expenses, incomes, budgets }, null, 2), "application/json");
}

function importJson(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const data = JSON.parse(reader.result);
            if (!Array.isArray(data.expenses) || !Array.isArray(data.incomes) || typeof data.budgets !== "object") throw new Error("Invalid backup");
            expenses = data.expenses;
            incomes = data.incomes;
            budgets = data.budgets;
            persistState();
            renderDashboard();
            renderCurrentView();
            alert("Backup restored successfully.");
        } catch (error) {
            alert("That backup file is not a valid FinNest backup.");
        }
    };
    reader.readAsText(file);
}

function downloadFile(name, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
}

function resetData() {
    if (!confirm("Reset FinNest to the sample data?")) return;
    expenses = structuredClone(DEFAULT_EXPENSES);
    incomes = structuredClone(DEFAULT_INCOMES);
    budgets = structuredClone(DEFAULT_BUDGETS);
    persistState();
    showDashboard();
}

function injectPrototypeStyles() {
    if (document.getElementById("finnestPrototypeStyles")) return;
    const style = document.createElement("style");
    style.id = "finnestPrototypeStyles";
    style.textContent = `
        .donut-chart { background: var(--donut-gradient, #CBD5E1) !important; }
        .transaction, .expense-list-row { cursor:pointer; }
        .transaction:focus, .expense-list-row:focus { outline:2px solid var(--color-primary); outline-offset:2px; }
        .empty-state { padding:28px 12px; text-align:center; color:#94A3B8; }
        .finnest-dynamic-view { padding-bottom:48px; }
        .view-heading { display:flex; justify-content:space-between; align-items:center; gap:20px; margin-bottom:24px; }
        .view-heading h1 { margin:0; }
        .filter-bar { display:grid; grid-template-columns:2fr 1fr 1fr 1fr; gap:10px; margin-bottom:18px; }
        .filter-bar input, .filter-bar select, .budget-editor-row input { width:100%; padding:11px 12px; border:1px solid #E2E8F0; border-radius:10px; background:#fff; color:#334155; font:inherit; }
        .expense-list { display:flex; flex-direction:column; }
        .expense-list-row { display:flex; align-items:center; gap:14px; padding:14px 8px; border-bottom:1px solid #E2E8F0; }
        .expense-list-info { flex:1; min-width:0; display:flex; flex-direction:column; gap:4px; }
        .expense-list-info span { color:#94A3B8; font-size:12px; }
        .finnest-primary-button, .finnest-secondary-button { border:0; border-radius:10px; padding:11px 15px; font:600 13px Inter, sans-serif; cursor:pointer; }
        .finnest-primary-button { background:var(--color-primary); color:#fff; }
        .finnest-secondary-button { background:#fff; color:#047857; border:1px solid #D1FAE5; }
        .finnest-header-actions { margin-top:16px; display:flex; justify-content:flex-end; }
        .delete-expense-button { width:100%; margin:12px 0 0; padding:11px; border:1px solid #FCA5A5; border-radius:10px; background:#FFF5F5; color:#B91C1C; font:600 13px Inter,sans-serif; cursor:pointer; }
        .finnest-modal-backdrop { position:fixed; inset:0; background:rgba(15,23,42,.45); display:flex; align-items:flex-end; justify-content:center; z-index:2000; }
        .finnest-modal { width:100%; max-width:560px; background:#fff; border-radius:24px 24px 0 0; padding:12px 24px 28px; box-shadow:0 -10px 40px rgba(15,23,42,.12); }
        .family-summary, .account-grid, .report-stat-grid, .settings-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:16px; margin-bottom:20px; }
        .family-summary > div { background:#fff; border:1px solid #E2E8F0; border-radius:14px; padding:18px; display:flex; flex-direction:column; gap:6px; }
        .family-summary strong, .big-number, .report-stat-grid strong { font-size:24px; color:#0F172A; }
        .muted { color:#94A3B8; font-size:12px; }
        .budget-editor { background:#fff; border:1px solid #E2E8F0; border-radius:14px; padding:8px 18px; }
        .budget-editor-row { display:grid; grid-template-columns:2fr 160px 1fr; gap:16px; align-items:center; padding:14px 0; border-bottom:1px solid #E2E8F0; }
        .budget-editor-row:last-child { border-bottom:0; }
        .budget-editor-row small { color:#94A3B8; }
        .budget-over { color:#B91C1C !important; font-weight:600; }
        .report-bars { display:flex; flex-direction:column; gap:18px; }
        .report-bar > div:first-child { display:flex; justify-content:space-between; margin-bottom:7px; }
        .settings-actions { display:flex; gap:10px; margin-top:16px; }
        .file-label { display:inline-flex; align-items:center; }
        .danger-card { border-color:#FECACA; }
        @media(max-width:768px) {
            .filter-bar { grid-template-columns:1fr 1fr; }
            .view-heading { align-items:flex-start; flex-direction:column; }
            .finnest-primary-button { width:100%; }
            .family-summary, .account-grid, .report-stat-grid, .settings-grid { grid-template-columns:1fr; }
            .budget-editor-row { grid-template-columns:1fr 100px; }
            .budget-editor-row small { grid-column:1/-1; }
            .finnest-header-actions { justify-content:flex-start; }
        }
    `;
    document.head.appendChild(style);
}

function setupExpenseSheet() {
    const sheet = document.getElementById("expenseSheet");
    if (!sheet) return;
    document.getElementById("closeExpenseSheet")?.addEventListener("click", closeExpenseSheet);
    document.getElementById("cancelExpense")?.addEventListener("click", closeExpenseSheet);
    document.getElementById("saveExpense")?.addEventListener("click", saveExpenseFromForm);
    sheet.addEventListener("click", event => { if (event.target === sheet) closeExpenseSheet(); });

    document.querySelectorAll(".category-chip").forEach(chip => chip.addEventListener("click", () => selectChip(".category-chip", "data-category", chip.dataset.category)));
    document.querySelectorAll(".type-option").forEach(option => option.addEventListener("click", () => selectChip(".type-option", "data-type", option.dataset.type)));

    const add = () => openExpenseSheet();
    document.querySelector(".add-expense-button")?.addEventListener("click", add);
    document.getElementById("desktopAddExpense")?.addEventListener("click", add);
}

function registerPwa() {
    if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => navigator.serviceWorker.register("pwa/service-worker.js").catch(() => {}));
    }
}

document.addEventListener("DOMContentLoaded", () => {
    injectPrototypeStyles();
    persistState();
    setupExpenseSheet();
    wireNavigation();
    renderDashboard();
    ensureDeleteButton();
    registerPwa();
});
