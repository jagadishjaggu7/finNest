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

    function findMappedUuid(map, id) {
        return map.incomes?.[id] || map.incomes?.[String(id)] || null;
    }

    async function findCloudMatch(userId, target) {
        if (!target) return null;
        const amount = Number(target.amount || 0);
        const source = String(target.source || "Other income").trim() || "Other income";
        const date = target.date || new Date().toISOString().slice(0, 10);

        const { data, error } = await client()
            .from("incomes")
            .select("id,amount,source,income_date")
            .eq("user_id", userId)
            .eq("amount", amount)
            .eq("source", source)
            .eq("income_date", date)
            .order("id", { ascending: true });
        if (error) throw error;
        return (data || [])[0] || null;
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
        const uuid = id ? findMappedUuid(map, id) : null;
        const row = { user_id: user.id, amount: numericAmount, source: incomeSource, income_date: incomeDate };

        let result;
        if (uuid) {
            result = await client().from("incomes").update(row).eq("id", uuid).eq("user_id", user.id).select("id,amount,source,income_date").maybeSingle();
            if (result.error) throw result.error;
            if (result.data) {
                const localId = id || Date.now();
                map.incomes[localId] = result.data.id;
                saveMap(map);
                return { id: localId, amount: Number(result.data.amount || 0), source: result.data.source || "Other income", date: result.data.income_date };
            }
        }

        const matched = await findCloudMatch(user.id, { amount: numericAmount, source: incomeSource, date: incomeDate });
        if (matched) {
            const localId = id || Date.now();
            map.incomes[localId] = matched.id;
            saveMap(map);
            return { id: localId, amount: Number(matched.amount || 0), source: matched.source || "Other income", date: matched.income_date };
        }

        result = await client().from("incomes").insert(row).select("id,amount,source,income_date").single();
        if (result.error) throw result.error;
        if (!result.data) throw new Error("Income could not be saved.");

        const localId = id || Date.now();
        map.incomes[localId] = result.data.id;
        saveMap(map);
        return { id: localId, amount: Number(result.data.amount || 0), source: result.data.source || "Other income", date: result.data.income_date };
    }

    async function remove(id, target = null) {
        const user = await currentUser();
        if (!user) throw new Error("Please sign in first.");
        if (!id) throw new Error("Income ID is required.");

        const map = idMap();
        map.incomes = map.incomes || {};
        let uuid = findMappedUuid(map, id);

        if (!uuid && target) {
            const matched = await findCloudMatch(user.id, target);
            if (matched) {
                uuid = matched.id;
                map.incomes[id] = uuid;
                saveMap(map);
            }
        }

        if (!uuid) throw new Error("Income could not be matched to its cloud record.");

        const { error } = await client()
            .from("incomes")
            .delete()
            .eq("id", uuid)
            .eq("user_id", user.id);
        if (error) throw error;

        delete map.incomes[id];
        delete map.incomes[String(id)];
        saveMap(map);
        return { id };
    }

    window.FinNestIncomeService = { save, remove };
})();