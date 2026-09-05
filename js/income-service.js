/* FinNest Income Service — cloud-authoritative income CRUD. */
(function () {
    const client = () => window.finnestSupabase;
    const mapKey = "finnest_supabase_id_map";

    async function currentUser() {
        if (!client()) return null;
        const { data, error } = await client().auth.getUser();
        if (error) throw error;
        return data?.user || null;
    }

    function idMap() {
        try {
            return JSON.parse(localStorage.getItem(mapKey) || '{"expenses":{},"incomes":{}}');
        } catch (_) {
            return { expenses: {}, incomes: {} };
        }
    }

    function saveMap(map) {
        localStorage.setItem(mapKey, JSON.stringify(map));
    }

    async function save({ amount, source, date, id = null }) {
        const user = await currentUser();
        if (!user) throw new Error("Please sign in first.");

        const numericAmount = Number(amount);
        if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
            throw new Error("Enter a valid income amount.");
        }

        const incomeDate = date || new Date().toISOString().slice(0, 10);
        const incomeSource = String(source || "Other income").trim() || "Other income";
        const map = idMap();
        map.incomes = map.incomes || {};
        const uuid = id ? map.incomes[id] : null;
        const row = {
            user_id: user.id,
            amount: numericAmount,
            source: incomeSource,
            income_date: incomeDate
        };

        const result = uuid
            ? await client().from("incomes")
                .update(row)
                .eq("id", uuid)
                .eq("user_id", user.id)
                .select("id,amount,source,income_date")
                .maybeSingle()
            : await client().from("incomes")
                .insert(row)
                .select("id,amount,source,income_date")
                .single();

        if (result.error) throw result.error;
        if (!result.data) throw new Error("Income could not be saved.");

        const localId = id || Date.now();
        map.incomes[localId] = result.data.id;
        saveMap(map);
        return {
            id: localId,
            amount: Number(result.data.amount || 0),
            source: result.data.source || "Other income",
            date: result.data.income_date
        };
    }

    async function remove(id) {
        const user = await currentUser();
        if (!user) throw new Error("Please sign in first.");
        if (!id) throw new Error("Income ID is required.");

        const map = idMap();
        const uuid = map.incomes?.[id];
        if (!uuid) throw new Error("Income not found or not editable.");

        const { data, error } = await client().from("incomes")
            .delete()
            .eq("id", uuid)
            .eq("user_id", user.id)
            .select("id")
            .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error("Income not found or not editable.");

        delete map.incomes[id];
        saveMap(map);
        return data;
    }

    window.FinNestIncomeService = { save, remove };
})();
