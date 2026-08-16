/* FinNest budget scopes: Personal + Family, Monthly + Weekly. */
(function () {
    const CATEGORIES = ['Food & Dining','Transport','Shopping','Bills & Utilities','Health','Entertainment','Other'];
    const supabase = window.finnestSupabase;

    const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));
    const dateKey = d => d.toISOString().slice(0, 10);
    const monthStart = d => { const x = new Date(d); x.setDate(1); x.setHours(0,0,0,0); return x; };
    const monday = (d = new Date()) => { const x = new Date(d); const day = x.getDay(); x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day)); x.setHours(0,0,0,0); return x; };
    const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
    const escapeHtml = value => String(value ?? '').replace(/[&<>\"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[c]));

    async function getUser() {
        if (!supabase) return null;
        const { data } = await supabase.auth.getSession();
        return data?.session?.user || null;
    }

    async function getHouseholdId(userId) {
        const { data } = await supabase.from('household_members').select('household_id').eq('user_id', userId).limit(1).maybeSingle();
        return data?.household_id || null;
    }

    function periodInfo(period) {
        if (period === 'weekly') {
            const start = monday();
            return { start, end: addDays(start, 6), label: `${start.toLocaleDateString('en-IN',{day:'numeric',month:'short'})} – ${addDays(start,6).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}` };
        }
        const start = monthStart(new Date());
        const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
        return { start, end, label: start.toLocaleDateString('en-IN',{month:'long',year:'numeric'}) };
    }

    async function load(scope, period) {
        const user = await getUser();
        if (!user) return { user: null, householdId: null, budgets: [], expenses: [] };
        const householdId = scope === 'family' ? await getHouseholdId(user.id) : null;
        const info = periodInfo(period);
        const startKey = dateKey(info.start);
        const endKey = dateKey(info.end);

        let budgetQuery = supabase.from('budgets')
            .select('id,category,amount,period_type,period_start,budget_scope,household_id,user_id')
            .eq('budget_scope', scope)
            .eq('period_type', period)
            .eq('period_start', startKey)
            .order('category');
        if (scope === 'family') budgetQuery = budgetQuery.eq('household_id', householdId || '00000000-0000-0000-0000-000000000000');
        else budgetQuery = budgetQuery.eq('user_id', user.id);

        let expenseQuery = supabase.from('expenses').select('id,amount,category,expense_date,expense_type,user_id,household_id');
        expenseQuery = expenseQuery.gte('expense_date', startKey).lte('expense_date', endKey);
        if (scope === 'family') expenseQuery = expenseQuery.eq('household_id', householdId || '00000000-0000-0000-0000-000000000000').eq('expense_type','shared');
        else expenseQuery = expenseQuery.eq('user_id', user.id).eq('expense_type','personal');

        const [{ data: budgets, error: budgetError }, { data: expenses, error: expenseError }] = await Promise.all([budgetQuery, expenseQuery]);
        if (budgetError) throw budgetError;
        if (expenseError) throw expenseError;
        return { user, householdId, budgets: budgets || [], expenses: expenses || [], info };
    }

    function notifyBudgetChanged(scope, period) {
        window.dispatchEvent(new CustomEvent('finnest:budget-changed', { detail: { scope, period } }));
        // The global Family View owns the summary card/cache. Re-run its Family mode
        // handler so the summary immediately reflects a newly saved budget.
        if (scope === 'family') {
            const familyButton = document.querySelector('#finnestViewSwitch [data-mode="family"]');
            if (familyButton) setTimeout(() => familyButton.click(), 50);
        }
    }

    async function saveBudget(scope, period, category, amount, existingId = null) {
        const user = await getUser();
        if (!user) throw new Error('Please sign in first.');
        const householdId = scope === 'family' ? await getHouseholdId(user.id) : null;
        if (scope === 'family' && !householdId) throw new Error('You need a family household before creating a family budget.');
        const startKey = dateKey(periodInfo(period).start);
        const row = {
            user_id: user.id,
            category,
            amount: Number(amount),
            month_start: startKey,
            period_type: period,
            period_start: startKey,
            budget_scope: scope,
            household_id: householdId
        };
        if (existingId) {
            const { error } = await supabase.from('budgets').update({ amount: Number(amount) }).eq('id', existingId);
            if (error) throw error;
            notifyBudgetChanged(scope, period);
            return;
        }
        let query = supabase.from('budgets').select('id').eq('category', category).eq('period_type', period).eq('period_start', startKey).eq('budget_scope', scope).limit(1);
        query = scope === 'family' ? query.eq('household_id', householdId) : query.eq('user_id', user.id);
        const { data: existing, error: lookupError } = await query.maybeSingle();
        if (lookupError) throw lookupError;
        if (existing?.id) {
            const { error } = await supabase.from('budgets').update({ amount: Number(amount) }).eq('id', existing.id);
            if (error) throw error;
        } else {
            const { error } = await supabase.from('budgets').insert(row);
            if (error) throw error;
        }
        notifyBudgetChanged(scope, period);
    }

    async function removeBudget(id) {
        const { error } = await supabase.from('budgets').delete().eq('id', id);
        if (error) throw error;
    }

    function injectStyles() {
        if (document.getElementById('finnestBudgetScopeStyles')) return;
        const s = document.createElement('style'); s.id = 'finnestBudgetScopeStyles';
        s.textContent = `
            .budget-scope-toolbar{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:18px;padding:5px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;width:max-content;max-width:100%}
            .budget-scope-toolbar button{border:0;background:transparent;color:#64748B;padding:9px 14px;border-radius:9px;font-weight:700;cursor:pointer}.budget-scope-toolbar button.active{background:#fff;color:#047857;box-shadow:0 1px 4px #CBD5E1}
            .budget-period{display:flex;gap:8px;margin-bottom:18px}.budget-period button{border:1px solid #D1FAE5;background:#fff;color:#047857;border-radius:9px;padding:8px 12px;font-weight:700;cursor:pointer}.budget-period button.active{background:#10B981;color:#fff}
            .budget-context{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 16px;padding:12px 14px;border-radius:12px;background:#ECFDF5;color:#065F46;font-size:12px}.budget-context strong{font-size:13px}.budget-scope-grid{display:grid;gap:10px}.budget-scope-row{display:grid;grid-template-columns:minmax(0,1fr) 150px 110px;align-items:center;gap:12px;padding:13px;border:1px solid #E2E8F0;border-radius:12px;background:#fff}.budget-scope-row input{width:100%;padding:9px 10px;border:1px solid #CBD5E1;border-radius:9px;font:inherit}.budget-scope-name{font-weight:700;color:#334155}.budget-scope-meta{font-size:11px;color:#64748B;margin-top:3px}.budget-scope-actions{display:flex;gap:6px;justify-content:flex-end}.budget-scope-actions button{border:0;background:#F1F5F9;color:#475569;border-radius:8px;padding:7px 9px;font-size:11px;cursor:pointer}.budget-scope-actions .danger{color:#B91C1C}.budget-scope-empty{padding:24px;text-align:center;color:#64748B;border:1px dashed #CBD5E1;border-radius:12px}
            @media(max-width:700px){.budget-scope-toolbar{width:100%}.budget-scope-toolbar button{flex:1}.budget-scope-row{grid-template-columns:1fr 120px}.budget-scope-actions{grid-column:1/-1;justify-content:flex-start}.budget-period{width:100%}.budget-period button{flex:1}}
        `; document.head.appendChild(s);
    }

    async function render() {
        injectStyles();
        const container = document.getElementById('finnestDynamicView');
        if (!container) return;
        let scope = 'personal';
        let period = 'monthly';
        const paint = async () => {
            container.innerHTML = `<div class="view-heading"><div><p class="eyebrow">Spending limits for you or your household</p><h1>Budgets</h1></div></div>
                <div class="budget-scope-toolbar"><button data-scope="personal" class="${scope==='personal'?'active':''}">👤 Personal</button><button data-scope="family" class="${scope==='family'?'active':''}">👨‍👩‍👧 Family</button></div>
                <div class="budget-period"><button data-period="monthly" class="${period==='monthly'?'active':''}">Monthly</button><button data-period="weekly" class="${period==='weekly'?'active':''}">Weekly</button></div>
                <div id="budgetScopeContent"><div class="budget-scope-empty">Loading budgets…</div></div>`;
            container.querySelectorAll('[data-scope]').forEach(b => b.onclick = () => { scope = b.dataset.scope; paint(); });
            container.querySelectorAll('[data-period]').forEach(b => b.onclick = () => { period = b.dataset.period; paint(); });
            await renderContent();
        };
        const renderContent = async () => {
            const host = container.querySelector('#budgetScopeContent');
            try {
                const data = await load(scope, period);
                const spent = {}; data.expenses.forEach(e => spent[e.category] = (spent[e.category] || 0) + Number(e.amount || 0));
                const totalBudget = data.budgets.reduce((s,b) => s + Number(b.amount || 0), 0);
                const totalSpent = Object.values(spent).reduce((s,v) => s + v, 0);
                const info = periodInfo(period);
                host.innerHTML = `<div class="budget-context"><span>${scope==='family'?'👨‍👩‍👧 Shared household budget':'👤 Your personal budget'}</span><strong>${info.label} · ${money(totalSpent)} spent / ${money(totalBudget)} budgeted</strong></div>
                    <div class="budget-editor-row" style="display:grid;grid-template-columns:minmax(0,1fr) 150px auto;gap:10px;margin-bottom:16px"><select id="scopeCategory">${CATEGORIES.map(c=>`<option>${escapeHtml(c)}</option>`).join('')}</select><input id="scopeAmount" type="number" min="0" step="100" placeholder="₹ limit"><button class="finnest-primary-button" id="scopeAdd">Set Budget</button></div>
                    <div class="budget-scope-grid">${data.budgets.length ? data.budgets.map(b => { const used = Number(spent[b.category] || 0); const limit = Number(b.amount || 0); const pct = limit ? Math.min(100, used / limit * 100) : 0; const over = used > limit; return `<div class="budget-scope-row"><div><div class="budget-scope-name">${escapeHtml(b.category)}</div><div class="budget-scope-meta">${money(used)} spent · ${over ? 'Over budget' : money(Math.max(0, limit-used)) + ' remaining'}</div></div><input type="number" min="0" step="100" value="${limit}" data-budget-id="${b.id}" data-budget-category="${escapeHtml(b.category)}"><div class="budget-scope-actions"><button data-save-id="${b.id}">Save</button><button class="danger" data-delete-id="${b.id}">Delete</button></div><div style="grid-column:1/-1;height:7px;background:#E2E8F0;border-radius:99px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${over?'#EF4444':'#10B981'};border-radius:99px"></div></div></div>`; }).join('') : '<div class="budget-scope-empty">No budgets yet for this scope and period.</div>'}</div>`;
                host.querySelector('#scopeAdd').onclick = async () => { const amount = Number(host.querySelector('#scopeAmount').value); const category = host.querySelector('#scopeCategory').value; if (!amount || amount <= 0) return alert('Enter a valid budget amount.'); try { await saveBudget(scope, period, category, amount); await paint(); } catch (e) { alert(e.message || 'Unable to save budget.'); } };
                host.querySelectorAll('[data-save-id]').forEach(btn => btn.onclick = async () => { const input = host.querySelector(`[data-budget-id="${btn.dataset.saveId}"]`); try { await saveBudget(scope, period, input.dataset.budgetCategory, Number(input.value), btn.dataset.saveId); await paint(); } catch (e) { alert(e.message || 'Unable to save budget.'); } });
                host.querySelectorAll('[data-delete-id]').forEach(btn => btn.onclick = async () => { if (!confirm('Delete this budget?')) return; try { await removeBudget(btn.dataset.deleteId); notifyBudgetChanged(scope, period); await paint(); } catch (e) { alert(e.message || 'Unable to delete budget.'); } });
            } catch (e) { host.innerHTML = `<div class="budget-scope-empty">Unable to load budgets: ${escapeHtml(e.message || 'Unknown error')}</div>`; }
        };
        await paint();
    }

    window.renderBudgetsView = render;
})();
