/* FinNest — Supabase data layer */
(function () {
    const MAP_KEY = "finnest_supabase_id_map";
    let originalPersistState = null;
    let syncing = false;

    const client = () => window.finnestSupabase;
    const json = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch (_) { return fallback; } };
    const saveJson = (key, value) => localStorage.setItem(key, JSON.stringify(value));
    const idMap = () => json(MAP_KEY, { expenses: {}, incomes: {} });

    async function user() {
        const { data, error } = await client().auth.getUser();
        if (error) throw error;
        return data.user;
    }

    async function accountsFor(userId) {
        const names = ["UPI", "Bank Account", "Cash", "Credit Card"];
        const { data, error } = await client().from("accounts").select("id,name,account_type").eq("user_id", userId);
        if (error) throw error;
        const byName = {};
        (data || []).forEach(a => byName[a.name] = a.id);
        for (const name of names) {
            if (byName[name]) continue;
            const { data: created, error: createError } = await client().from("accounts").insert({ user_id: userId, name, account_type: name, active: true }).select("id").single();
            if (createError) throw createError;
            byName[name] = created.id;
        }
        return byName;
    }

    async function householdFor(userId) {
        const { data, error } = await client().from("households").select("id").eq("owner_id", userId).limit(1).maybeSingle();
        if (error) throw error;
        return data;
    }

    async function migrateIfCloudEmpty(userId) {
        const [er, ir, br] = await Promise.all([
            client().from("expenses").select("id", { count: "exact", head: true }).eq("user_id", userId),
            client().from("incomes").select("id", { count: "exact", head: true }).eq("user_id", userId),
            client().from("budgets").select("id", { count: "exact", head: true }).eq("user_id", userId)
        ]);
        if (er.error) throw er.error;
        if (ir.error) throw ir.error;
        if (br.error) throw br.error;
        if ((er.count || 0) + (ir.count || 0) + (br.count || 0) > 0) return false;

        const accounts = await accountsFor(userId);
        const household = await householdFor(userId);
        const map = idMap();

        for (const income of incomes || []) {
            const { data, error } = await client().from("incomes").insert({ user_id: userId, amount: Number(income.amount), source: income.source || "Other income", income_date: income.date || todayString() }).select("id").single();
            if (error) throw error;
            map.incomes[income.id] = data.id;
        }

        for (const expense of expenses || []) {
            const shared = expense.type === "shared" && household;
            const { data, error } = await client().from("expenses").insert({
                user_id: userId,
                household_id: shared ? household.id : null,
                paid_by_member_id: null,
                amount: Number(expense.amount),
                category: expense.category || "Other",
                account_id: accounts[expense.account] || null,
                expense_type: shared ? "shared" : "personal",
                note: expense.note || null,
                expense_date: expense.date || todayString()
            }).select("id").single();
            if (error) throw error;
            map.expenses[expense.id] = data.id;
        }

        for (const [category, amount] of Object.entries(budgets || {})) {
            const { error } = await client().from("budgets").upsert({ user_id: userId, category, month_start: `${currentMonthKey()}-01`, amount: Number(amount || 0) }, { onConflict: "user_id,category,month_start" });
            if (error) throw error;
        }
        saveJson(MAP_KEY, map);
        return true;
    }

    async function loadCloud(userId) {
        const [expensesResult, incomesResult, budgetsResult, accountsResult, profileResult] = await Promise.all([
            client().from("expenses").select("id,amount,category,account_id,expense_type,note,expense_date").eq("user_id", userId).order("expense_date", { ascending: false }),
            client().from("incomes").select("id,amount,source,income_date").eq("user_id", userId).order("income_date", { ascending: false }),
            client().from("budgets").select("id,category,month_start,amount").eq("user_id", userId),
            client().from("accounts").select("id,name").eq("user_id", userId).eq("active", true),
            client().from("profiles").select("display_name,currency").eq("id", userId).maybeSingle()
        ]);
        for (const result of [expensesResult, incomesResult, budgetsResult, accountsResult, profileResult]) if (result.error) throw result.error;

        const map = idMap();
        const accountNames = Object.fromEntries((accountsResult.data || []).map(a => [a.id, a.name]));
        const localId = (kind, uuid) => {
            const found = Object.entries(map[kind]).find(([, value]) => value === uuid);
            if (found) return Number(found[0]);
            let id = Date.now();
            while (Object.prototype.hasOwnProperty.call(map[kind], id)) id++;
            map[kind][id] = uuid;
            return id;
        };

        expenses = (expensesResult.data || []).map(e => ({ id: localId("expenses", e.id), amount: Number(e.amount), category: e.category, account: accountNames[e.account_id] || "Other", type: e.expense_type, note: e.note || "", date: e.expense_date }));
        incomes = (incomesResult.data || []).map(i => ({ id: localId("incomes", i.id), amount: Number(i.amount), source: i.source || "Other income", date: i.income_date }));

        budgets = {};
        (budgetsResult.data || []).forEach(b => { if (String(b.month_start).slice(0, 7) === currentMonthKey()) budgets[b.category] = Number(b.amount); });
        if (!Object.keys(budgets).length) budgets = structuredClone(DEFAULT_BUDGETS);

        if (profileResult.data) {
            const current = json("finnest_profile", {});
            localStorage.setItem("finnest_profile", JSON.stringify({ name: profileResult.data.display_name || current.name || "Jaggu", email: current.email || "", currency: "INR (₹)" }));
        }
        saveJson(MAP_KEY, map);
        persistLocalOnly();
    }

    function persistLocalOnly() {
        localStorage.setItem(STORAGE_KEYS.expenses, JSON.stringify(expenses));
        localStorage.setItem(STORAGE_KEYS.incomes, JSON.stringify(incomes));
        localStorage.setItem(STORAGE_KEYS.budgets, JSON.stringify(budgets));
        localStorage.setItem(STORAGE_KEYS.familyMembers, JSON.stringify(familyMembers));
        localStorage.setItem(STORAGE_KEYS.familyPayers, JSON.stringify(familyPayers));
    }

    async function syncAll() {
        if (syncing || !client()) return;
        syncing = true;
        try {
            const currentUser = await user();
            if (!currentUser) return;
            const accounts = await accountsFor(currentUser.id);
            const household = await householdFor(currentUser.id);
            const map = idMap();

            const { data: cloudExpenses, error: cloudExpenseError } = await client().from("expenses").select("id").eq("user_id", currentUser.id);
            if (cloudExpenseError) throw cloudExpenseError;
            const wantedExpenseIds = new Set();
            for (const expense of expenses || []) {
                const uuid = map.expenses[expense.id];
                const shared = expense.type === "shared" && household;
                const row = { user_id: currentUser.id, household_id: shared ? household.id : null, paid_by_member_id: null, amount: Number(expense.amount), category: expense.category || "Other", account_id: accounts[expense.account] || null, expense_type: shared ? "shared" : "personal", note: expense.note || null, expense_date: expense.date || todayString() };
                let result;
                if (uuid) result = await client().from("expenses").update(row).eq("id", uuid).eq("user_id", currentUser.id).select("id").maybeSingle();
                else result = await client().from("expenses").insert(row).select("id").single();
                if (result.error) throw result.error;
                if (result.data?.id) { map.expenses[expense.id] = result.data.id; wantedExpenseIds.add(result.data.id); }
            }
            for (const row of cloudExpenses || []) if (!wantedExpenseIds.has(row.id) && !Object.values(map.expenses).includes(row.id)) await client().from("expenses").delete().eq("id", row.id).eq("user_id", currentUser.id);

            const { data: cloudIncomes, error: cloudIncomeError } = await client().from("incomes").select("id").eq("user_id", currentUser.id);
            if (cloudIncomeError) throw cloudIncomeError;
            const wantedIncomeIds = new Set();
            for (const income of incomes || []) {
                const uuid = map.incomes[income.id];
                const row = { user_id: currentUser.id, amount: Number(income.amount), source: income.source || "Other income", income_date: income.date || todayString() };
                const result = uuid ? await client().from("incomes").update(row).eq("id", uuid).eq("user_id", currentUser.id).select("id").maybeSingle() : await client().from("incomes").insert(row).select("id").single();
                if (result.error) throw result.error;
                if (result.data?.id) { map.incomes[income.id] = result.data.id; wantedIncomeIds.add(result.data.id); }
            }
            for (const row of cloudIncomes || []) if (!wantedIncomeIds.has(row.id) && !Object.values(map.incomes).includes(row.id)) await client().from("incomes").delete().eq("id", row.id).eq("user_id", currentUser.id);

            const month = `${currentMonthKey()}-01`;
            for (const [category, amount] of Object.entries(budgets || {})) {
                const { error } = await client().from("budgets").upsert({ user_id: currentUser.id, category, month_start: month, amount: Number(amount || 0) }, { onConflict: "user_id,category,month_start" });
                if (error) throw error;
            }
            saveJson(MAP_KEY, map);
        } catch (error) {
            console.warn("FinNest cloud sync failed", error);
        } finally { syncing = false; }
    }

    function wrapPersist() {
        if (originalPersistState || typeof persistState !== "function") return;
        originalPersistState = persistState;
        window.persistState = function () { originalPersistState(); syncAll(); };
    }

    async function boot() {
        if (!client()) return;
        wrapPersist();
        const currentUser = await user().catch(() => null);
        if (!currentUser) return;
        try {
            const profile = json("finnest_profile", { name: currentUser.email?.split("@")[0] || "Jaggu", email: currentUser.email || "", currency: "INR (₹)" });
            const { error: profileError } = await client().from("profiles").upsert({ id: currentUser.id, display_name: profile.name, currency: "INR" }, { onConflict: "id" });
            if (profileError) throw profileError;
            await accountsFor(currentUser.id);
            const migrated = await migrateIfCloudEmpty(currentUser.id);
            await loadCloud(currentUser.id);
            renderDashboard();
            console.info(migrated ? "FinNest: local data migrated to Supabase." : "FinNest: cloud data loaded.");
        } catch (error) {
            console.error("FinNest cloud bootstrap failed", error);
            alert("FinNest could not load cloud data. Your local data is still available.");
        }
    }

    window.FinNestCloud = { boot, loadCloud, syncAll };
    document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 400));
})();
