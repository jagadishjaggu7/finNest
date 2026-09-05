/* FinNest Budget Service — single cloud-authoritative budget CRUD path. */
(function () {
    const supabase = window.finnestSupabase;
    const CATEGORIES = ['Food & Dining','Transport','Shopping','Bills & Utilities','Health','Entertainment','Other'];

    async function getContext() {
        if (!window.FinNestContext) throw new Error('FinNest context is unavailable.');
        const ctx = await window.FinNestContext.load();
        if (!ctx?.user) throw new Error('Please sign in first.');
        return ctx;
    }

    function dateKey(date) {
        const d = new Date(date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function monday(date = new Date()) {
        const d = new Date(date);
        const day = d.getDay();
        d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
        d.setHours(0, 0, 0, 0);
        return d;
    }

    function periodInfo(period) {
        if (!['monthly', 'weekly'].includes(period)) throw new Error('Invalid budget period.');
        const now = new Date();
        const start = period === 'weekly' ? monday(now) : new Date(now.getFullYear(), now.getMonth(), 1);
        const end = period === 'weekly'
            ? new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)
            : new Date(start.getFullYear(), start.getMonth() + 1, 0);
        return { start, end, startKey: dateKey(start), endKey: dateKey(end) };
    }

    async function list(scope, period) {
        const ctx = await getContext();
        if (!['personal', 'family'].includes(scope)) throw new Error('Invalid budget scope.');
        const info = periodInfo(period);

        let budgetQuery = supabase.from('budgets')
            .select('id,user_id,category,amount,month_start,period_type,period_start,budget_scope,household_id,created_at,updated_at')
            .eq('budget_scope', scope)
            .eq('period_type', period)
            .eq('period_start', info.startKey)
            .order('category');

        if (scope === 'personal') budgetQuery = budgetQuery.eq('user_id', ctx.user.id).is('household_id', null);
        else if (!ctx.householdId) return { budgets: [], expenses: [], context: ctx, period: info };
        else budgetQuery = budgetQuery.eq('household_id', ctx.householdId);

        let expenseQuery = supabase.from('expenses')
            .select('id,amount,category,expense_date,expense_type,user_id,household_id')
            .gte('expense_date', info.startKey)
            .lte('expense_date', info.endKey);
        expenseQuery = scope === 'family'
            ? expenseQuery.eq('household_id', ctx.householdId).eq('expense_type', 'shared')
            : expenseQuery.eq('user_id', ctx.user.id).is('household_id', null).eq('expense_type', 'personal');

        const [budgetResult, expenseResult] = await Promise.all([budgetQuery, expenseQuery]);
        if (budgetResult.error) throw budgetResult.error;
        if (expenseResult.error) throw expenseResult.error;
        return { budgets: budgetResult.data || [], expenses: expenseResult.data || [], context: ctx, period: info };
    }

    async function save({ scope, period, category, amount, id = null }) {
        const ctx = await getContext();
        if (!['personal', 'family'].includes(scope)) throw new Error('Invalid budget scope.');
        if (!CATEGORIES.includes(category)) throw new Error('Invalid budget category.');
        const numericAmount = Number(amount);
        if (!Number.isFinite(numericAmount) || numericAmount <= 0) throw new Error('Enter a valid budget amount.');
        const info = periodInfo(period);
        const householdId = scope === 'family' ? ctx.householdId : null;
        if (scope === 'family' && !householdId) throw new Error('You need a family household before creating a family budget.');

        if (id) {
            const { data, error } = await supabase.from('budgets')
                .update({ amount: numericAmount, updated_at: new Date().toISOString() })
                .eq('id', id)
                .select('id,user_id,category,amount,month_start,period_type,period_start,budget_scope,household_id,created_at,updated_at')
                .maybeSingle();
            if (error) throw error;
            if (!data) throw new Error('Budget not found or not editable.');
            return data;
        }

        let existingQuery = supabase.from('budgets').select('id')
            .eq('category', category)
            .eq('period_type', period)
            .eq('period_start', info.startKey)
            .eq('budget_scope', scope)
            .limit(1);
        existingQuery = scope === 'family'
            ? existingQuery.eq('household_id', householdId)
            : existingQuery.eq('user_id', ctx.user.id).is('household_id', null);

        const { data: existing, error: lookupError } = await existingQuery.maybeSingle();
        if (lookupError) throw lookupError;
        if (existing?.id) {
            const { data, error } = await supabase.from('budgets')
                .update({ amount: numericAmount, updated_at: new Date().toISOString() })
                .eq('id', existing.id)
                .select('id,user_id,category,amount,month_start,period_type,period_start,budget_scope,household_id,created_at,updated_at')
                .single();
            if (error) throw error;
            return data;
        }

        const { data, error } = await supabase.from('budgets').insert({
            user_id: ctx.user.id,
            category,
            amount: numericAmount,
            month_start: info.startKey,
            period_type: period,
            period_start: info.startKey,
            budget_scope: scope,
            household_id: householdId
        }).select('id,user_id,category,amount,month_start,period_type,period_start,budget_scope,household_id,created_at,updated_at').single();
        if (error) throw error;
        return data;
    }

    async function remove(id) {
        await getContext();
        if (!id) throw new Error('Budget ID is required.');
        const { data, error } = await supabase.from('budgets').delete().eq('id', id).select('id').maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Budget not found or not editable.');
        return data;
    }

    window.FinNestBudgetService = { CATEGORIES, periodInfo, list, save, remove };
})();
