/* FinNest Supabase data layer.
   Supabase is authoritative for authenticated users.
   Local storage is a UI cache only; it must never delete or overwrite cloud
   records simply because the browser cache is incomplete or stale.
*/
(function () {
    const MAP_KEY = "finnest_supabase_id_map";
    const client = () => window.finnestSupabase;
    const json = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch (_) { return fallback; } };
    const saveJson = (key, value) => localStorage.setItem(key, JSON.stringify(value));
    const idMap = () => json(MAP_KEY, { expenses: {}, incomes: {} });

    async function currentUser() {
        if (!client()) return null;
        const { data, error } = await client().auth.getUser();
        if (error) throw error;
        return data?.user || null;
    }

    async function accountsFor(userId) {
        const names = ["UPI", "Bank Account", "Cash", "Credit Card"];
        const { data, error } = await client().from("accounts").select("id,name,account_type").eq("user_id", userId);
        if (error) throw error;
        const byName = {};
        (data || []).forEach(a => { byName[a.name] = a.id; });
        for (const name of names) {
            if (byName[name]) continue;
            const { data: created, error: createError } = await client()
                .from("accounts")
                .insert({ user_id: userId, name, account_type: name, active: true })
                .select("id")
                .single();
            if (createError) throw createError;
            byName[name] = created.id;
        }
        return byName;
    }

    function persistLocalCache() {
        try {
            localStorage.setItem(STORAGE_KEYS.expenses, JSON.stringify(expenses || []));
            localStorage.setItem(STORAGE_KEYS.incomes, JSON.stringify(incomes || []));
            localStorage.setItem(STORAGE_KEYS.budgets, JSON.stringify(budgets || {}));
            localStorage.setItem(STORAGE_KEYS.familyMembers, JSON.stringify(familyMembers || []));
            localStorage.setItem(STORAGE_KEYS.familyPayers, JSON.stringify(familyPayers || {}));
        } catch (error) {
            console.warn("FinNest local cache write failed", error);
        }
    }

    async function loadCloud(userId) {
        const [expensesResult, incomesResult, budgetsResult, accountsResult, profileResult] = await Promise.all([
            client().from("expenses").select("id,amount,category,account_id,expense_type,note,expense_date,paid_by_member_id,household_id").eq("user_id", userId).order("expense_date", { ascending: false }),
            client().from("incomes").select("id,amount,source,income_date").eq("user_id", userId).order("income_date", { ascending: false }),
            client().from("budgets").select("id,category,amount,month_start,period_type,period_start,budget_scope,household_id").eq("user_id", userId),
            client().from("accounts").select("id,name").eq("user_id", userId).eq("active", true),
            client().from("profiles").select("id,display_name,currency").eq("id", userId).maybeSingle()
        ]);

        for (const result of [expensesResult, incomesResult, budgetsResult, accountsResult, profileResult]) {
            if (result.error) throw result.error;
        }

        const map = idMap();
        map.expenses = map.expenses || {};
        map.incomes = map.incomes || {};
        const accountNames = Object.fromEntries((accountsResult.data || []).map(a => [a.id, a.name]));

        const localId = (kind, uuid) => {
            const found = Object.entries(map[kind]).find(([, value]) => value === uuid);
            if (found) return Number(found[0]);
            let id = Date.now();
            while (Object.prototype.hasOwnProperty.call(map[kind], id)) id += 1;
            map[kind][id] = uuid;
            return id;
        };

        expenses = (expensesResult.data || []).map(e => ({
            id: localId("expenses", e.id),
            cloudId: e.id,
            amount: Number(e.amount || 0),
            category: e.category || "Other",
            account: accountNames[e.account_id] || "Other",
            type: e.expense_type || "personal",
            note: e.note || "",
            date: e.expense_date,
            paidByMemberId: e.paid_by_member_id || null,
            householdId: e.household_id || null
        }));

        incomes = (incomesResult.data || []).map(i => ({
            id: localId("incomes", i.id),
            cloudId: i.id,
            amount: Number(i.amount || 0),
            source: i.source || "Other income",
            date: i.income_date
        }));

        // Keep the legacy dashboard cache in sync for the current month without
        // attempting to flatten weekly/family budgets into the old shape.
        budgets = {};
        (budgetsResult.data || []).forEach(b => {
            if (b.budget_scope === 'personal' && b.period_type === 'monthly' && String(b.month_start).slice(0, 7) === currentMonthKey() && b.household_id == null) {
                budgets[b.category] = Number(b.amount || 0);
            }
        });

        if (profileResult.data) {
            localStorage.setItem("finnest_profile", JSON.stringify({
                name: profileResult.data.display_name || "User",
                email: (await client().auth.getUser()).data.user?.email || "",
                currency: profileResult.data.currency || "INR (₹)"
            }));
        }

        saveJson(MAP_KEY, map);
        persistLocalCache();
        window.dispatchEvent(new CustomEvent('finnest:cloud-data-ready'));
    }

    async function syncExpense(expense) {
        const user = await currentUser();
        if (!user || !expense) return null;
        const accounts = await accountsFor(user.id);
        const map = idMap();
        map.expenses = map.expenses || {};
        const uuid = expense.cloudId || map.expenses[expense.id];
        const row = {
            user_id: user.id,
            household_id: expense.type === "shared" ? (expense.householdId || window.FinNestContext?.getHouseholdId?.() || null) : null,
            paid_by_member_id: expense.type === "shared" ? (expense.paidByMemberId || window.FinNestContext?.getMemberId?.() || null) : null,
            amount: Number(expense.amount || 0),
            category: expense.category || "Other",
            account_id: accounts[expense.account] || null,
            expense_type: expense.type === "shared" ? "shared" : "personal",
            note: expense.note || null,
            expense_date: expense.date || todayString()
        };

        const result = uuid
            ? await client().from("expenses").update(row).eq("id", uuid).eq("user_id", user.id).select("id").maybeSingle()
            : await client().from("expenses").insert(row).select("id").single();
        if (result.error) throw result.error;
        if (result.data?.id) {
            map.expenses[expense.id] = result.data.id;
            expense.cloudId = result.data.id;
        }
        saveJson(MAP_KEY, map);
        return result.data?.id || uuid || null;
    }

    async function syncIncome(income) {
        const user = await currentUser();
        if (!user || !income) return null;
        const map = idMap();
        map.incomes = map.incomes || {};
        const uuid = income.cloudId || map.incomes[income.id];
        const row = {
            user_id: user.id,
            amount: Number(income.amount || 0),
            source: income.source || "Other income",
            income_date: income.date || todayString()
        };
        const result = uuid
            ? await client().from("incomes").update(row).eq("id", uuid).eq("user_id", user.id).select("id").maybeSingle()
            : await client().from("incomes").insert(row).select("id").single();
        if (result.error) throw result.error;
        if (result.data?.id) {
            map.incomes[income.id] = result.data.id;
            income.cloudId = result.data.id;
        }
        saveJson(MAP_KEY, map);
        return result.data?.id || uuid || null;
    }

    async function boot() {
        if (!client()) return;
        const user = await currentUser().catch(() => null);
        if (!user) {
            window.dispatchEvent(new CustomEvent('finnest:cloud-data-ready'));
            if (typeof renderDashboard === 'function') renderDashboard();
            return;
        }
        try {
            await accountsFor(user.id);
            await loadCloud(user.id);
            if (typeof renderDashboard === 'function') renderDashboard();
            console.info("FinNest: cloud data loaded.");
        } catch (error) {
            console.error("FinNest cloud bootstrap failed", error);
            window.dispatchEvent(new CustomEvent('finnest:cloud-data-ready'));
            if (typeof renderDashboard === 'function') renderDashboard();
            console.warn("FinNest cloud bootstrap could not complete", error);
        }
    }

    window.FinNestCloud = {
        boot,
        loadCloud,
        syncExpense,
        syncIncome
    };

    document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 400));
})();