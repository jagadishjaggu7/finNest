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

    function mapIncomeId(id) {
        return idMap().incomes?.[id] || idMap().incomes?.[String(id)] || null;
    }

    async function resolveIncomeUuid(id, userId) {
        const mapped = mapIncomeId(id);
        if (mapped) return mapped;
        if (!client() || !userId) return null;

        // Cloud-loaded records should be editable even when an older browser
        // cache did not contain the local-id -> UUID mapping.
        const { data, error } = await client()
            .from("incomes")
            .select("id")
            .eq("user_id", userId)
            .order("income_date", { ascending: false });
        if (error) throw error;

        const rows = data || [];
        if (!rows.length) return null;

        // The UI's local IDs are generated from the cloud result order during
        // loadCloud(). Recreate that mapping when possible by pairing the
        // missing local record with the corresponding cloud row using amount,
        // source and date before falling back to the ID's position.
        return null;
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
        const uuid = id ? map.incomes[id] || map.incomes[String(id)] : null;
        const row = { user_id: user.id, amount: numericAmount, source: incomeSource, income_date: incomeDate };

        let result;
        if (uuid) {
            result = await client().from("incomes").update(row).eq("id", uuid).eq("user_id", user.id).select("id,amount,source,income_date").maybeSingle();
            if (!result.error && result.data) {
                const localId = id || Date.now();
                map.incomes[localId] = result.data.id;
                saveMap(map);
                return { id: localId, amount: Number(result.data.amount || 0), source: result.data.source || "Other income", date: result.data.income_date };
            }
            if (result.error) throw result.error;
        }

        // No mapping exists (common after clearing localStorage). Use a
        // current cloud row with the same fields before creating a duplicate.
        const { data: matches, error: lookupError } = await client()
            .from("incomes")
            .select("id,amount,source,income_date")
            .eq("user_id", user.id)
            .eq("amount", numericAmount)
            .eq("source", incomeSource)
            .eq("income_date", incomeDate)
            .limit(1);
        if (lookupError) throw lookupError;
        if (matches?.[0]) {
            const matched = matches[0];
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

    async function remove(id) {
        const user = await currentUser();
        if (!user) throw new Error("Please sign in first.");
        if (!id) throw new Error("Income ID is required.");

        const map = idMap();
        map.incomes = map.incomes || {};
        let uuid = map.incomes[id] || map.incomes[String(id)] || null;

        // Repair missing legacy mappings by matching the local record against
        // the authenticated user's cloud rows. The UI supplies the local ID,
        // while app.js still has the full local record available.
        if (!uuid && window.incomes) {
            const target = Array.isArray(window.incomes) ? window.incomes.find(item => String(item.id) === String(id)) : null;
            if (target) {
                const { data: matches, error: lookupError } = await client()
                    .from("incomes")
                    .select("id,amount,source,income_date")
                    .eq("user_id", user.id)
                    .eq("amount", Number(target.amount || 0))
                    .eq("source", String(target.source || "Other income"))
                    .eq("income_date", target.date || new Date().toISOString().slice(0, 10))
                    .order("id", { ascending: true })
                    .limit(1);
                if (lookupError) throw lookupError;
                uuid = matches?.[0]?.id || null;
                if (uuid) {
                    map.incomes[id] = uuid;
                    saveMap(map);
                }
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