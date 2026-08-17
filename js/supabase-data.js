/* FinNest — Supabase data layer. Cloud is authoritative; no demo-data migration. */
(function () {
    const MAP_KEY = "finnest_supabase_id_map";
    let originalPersistState = null;
    let syncing = false;
    const client = () => window.finnestSupabase;
    const json = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch (_) { return fallback; } };
    const saveJson = (key, value) => localStorage.setItem(key, JSON.stringify(value));
    const idMap = () => json(MAP_KEY, { expenses: {}, incomes: {} });
    async function user() { const { data, error } = await client().auth.getUser(); if (error) throw error; return data.user; }
    async function accountsFor(userId) {
        const names = ["UPI", "Bank Account", "Cash", "Credit Card"];
        const { data, error } = await client().from("accounts").select("id,name,account_type").eq("user_id", userId);
        if (error) throw error;
        const byName = {}; (data || []).forEach(a => byName[a.name] = a.id);
        for (const name of names) { if (byName[name]) continue; const { data: created, error: createError } = await client().from("accounts").insert({ user_id: userId, name, account_type: name, active: true }).select("id").single(); if (createError) throw createError; byName[name] = created.id; }
        return byName;
    }
    async function householdContext(userId) {
        const { data, error } = await client().from("household_members")
            .select("id,household_id,user_id,role,created_at")
            .eq("user_id", userId).order("created_at", { ascending: true });
        if (error) throw error;
        const membership = (data || []).find(m => m.role === "owner") || data?.[0] || null;
        return { householdId: membership?.household_id || null, memberId: membership?.id || null };
    }
    async function loadCloud(userId) {
        const [expensesResult, incomesResult, budgetsResult, accountsResult, profileResult] = await Promise.all([
            client().from("expenses").select("id,amount,account_id,expense_type,note,expense_date,paid_by_member_id,household_id").eq("user_id", userId).order("expense_date", { ascending: false }),
            client().from("incomes").select("id,amount,source,income_date").eq("user_id", userId).order("income_date", { ascending: false }),
            client().from("budgets").select("id,category,month_start,amount").eq("user_id", userId),
            client().from("accounts").select("id,name").eq("user_id", userId).eq("active", true),
            client().from("profiles").select("display_name,currency").eq("id", userId).maybeSingle()
        ]);
        for (const result of [expensesResult, incomesResult, budgetsResult, accountsResult, profileResult]) if (result.error) throw result.error;
        const map = idMap();
        const accountNames = Object.fromEntries((accountsResult.data || []).map(a => [a.id, a.name]));
        const localId = (kind, uuid) => { const found = Object.entries(map[kind]).find(([, value]) => value === uuid); if (found) return Number(found[0]); let id = Date.now(); while (Object.prototype.hasOwnProperty.call(map[kind], id)) id++; map[kind][id] = uuid; return id; };
        expenses = (expensesResult.data || []).map(e => ({ id: localId("expenses", e.id), amount: Number(e.amount), category: e.category, account: accountNames[e.account_id] || "Other", type: e.expense_type, note: e.note || "", date: e.expense_date, paidByMemberId: e.paid_by_member_id || null, householdId: e.household_id || null }));
        incomes = (incomesResult.data || []).map(i => ({ id: localId("incomes", i.id), amount: Number(i.amount), source: i.source || "Other income", date: i.income_date }));
        budgets = {}; (budgetsResult.data || []).forEach(b => { if (String(b.month_start).slice(0, 7) === currentMonthKey()) budgets[b.category] = Number(b.amount); });
        if (profileResult.data) { const currentUser = (await client().auth.getUser()).data.user; localStorage.setItem("finnest_profile", JSON.stringify({ name: profileResult.data.display_name || "User", email: currentUser?.email || "", currency: "INR (₹)" })); }
        saveJson(MAP_KEY, map); persistLocalOnly(); window.dispatchEvent(new CustomEvent('finnest:cloud-data-ready'));
    }
    function persistLocalOnly() { localStorage.setItem(STORAGE_KEYS.expenses, JSON.stringify(expenses)); localStorage.setItem(STORAGE_KEYS.incomes, JSON.stringify(incomes)); localStorage.setItem(STORAGE_KEYS.budgets, JSON.stringify(budgets)); localStorage.setItem(STORAGE_KEYS.familyMembers, JSON.stringify(familyMembers)); localStorage.setItem(STORAGE_KEYS.familyPayers, JSON.stringify(familyPayers)); }
    async function syncAll() {
        if (syncing || !client()) return; syncing = true;
        try {
            const currentUser = await user(); if (!currentUser) return; const accounts = await accountsFor(currentUser.id); const household = await householdContext(currentUser.id); const map = idMap();
            const { data: cloudExpenses, error: cloudExpenseError } = await client().from("expenses").select("id").eq("user_id", currentUser.id); if (cloudExpenseError) throw cloudExpenseError;
            const wantedExpenseIds = new Set();
            for (const expense of expenses || []) {
                const shared = expense.type === "shared";
                const uuid = map.expenses[expense.id];
                const row = {
                    user_id: currentUser.id,
                    household_id: shared ? household.householdId : null,
                    paid_by_member_id: shared ? (expense.paidByMemberId || household.memberId || null) : null,
                    amount: Number(expense.amount),
                    category: expense.category || "Other",
                    account_id: accounts[expense.account] || null,
                    expense_type: shared ? "shared" : "personal",
                    note: expense.note || null,
                    expense_date: expense.date || todayString()
                };
                const result = uuid
                    ? await client().from("expenses").update(row).eq("id", uuid).eq("user_id", currentUser.id).select("id").maybeSingle()
                    : await client().from("expenses").insert(row).select("id").single();
                if (result.error) throw result.error;
                if (result.data?.id) { map.expenses[expense.id] = result.data.id; wantedExpenseIds.add(result.data.id); }
            }
            for (const row of cloudExpenses || []) if (!wantedExpenseIds.has(row.id) && !Object.values(map.expenses).includes(row.id)) await client().from("expenses").delete().eq("id", row.id).eq("user_id", currentUser.id);
            const { data: cloudIncomes, error: cloudIncomeError } = await client().from("incomes").select("id").eq("user_id", currentUser.id); if (cloudIncomeError) throw cloudIncomeError;
            const wantedIncomeIds = new Set();
            for (const income of incomes || []) { const uuid = map.incomes[income.id]; const row = { user_id: currentUser.id, amount: Number(income.amount), source: income.source || "Other income", income_date: income.date || todayString() }; const result = uuid ? await client().from("incomes").update(row).eq("id", uuid).eq("user_id", currentUser.id).select("id").maybeSingle() : await client().from("incomes").insert(row).select("id").single(); if (result.error) throw result.error; if (result.data?.id) { map.incomes[income.id] = result.data.id; wantedIncomeIds.add(result.data.id); } }
            for (const row of cloudIncomes || []) if (!wantedIncomeIds.has(row.id) && !Object.values(map.incomes).includes(row.id)) await client().from("incomes").delete().eq("id", row.id).eq("user_id", currentUser.id);
            const month = `${currentMonthKey()}-01`; for (const [category, amount] of Object.entries(budgets || {})) { const { error } = await client().from("budgets").upsert({ user_id: currentUser.id, category, month_start: month, amount: Number(amount || 0) }, { onConflict: "user_id,category,month_start" }); if (error) throw error; }
            saveJson(MAP_KEY, map);
        } catch (error) { console.warn("FinNest cloud sync failed", error); } finally { syncing = false; }
    }
    function wrapPersist() { if (originalPersistState || typeof persistState !== "function") return; originalPersistState = persistState; window.persistState = function () { originalPersistState(); syncAll(); }; }
    async function boot() {
        if (!client()) return; wrapPersist(); const currentUser = await user().catch(() => null);
        if (!currentUser) { window.dispatchEvent(new CustomEvent('finnest:cloud-data-ready')); renderDashboard(); return; }
        try { await accountsFor(currentUser.id); await loadCloud(currentUser.id); renderDashboard(); console.info("FinNest: cloud data loaded."); }
        catch (error) { console.error("FinNest cloud bootstrap failed", error); window.dispatchEvent(new CustomEvent('finnest:cloud-data-ready')); renderDashboard(); alert("FinNest could not load cloud data. Please check your connection and Supabase configuration."); }
    }
    window.FinNestCloud = { boot, loadCloud, syncAll }; document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 400));
})();