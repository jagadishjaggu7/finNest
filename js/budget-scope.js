/* FinNest budget scopes: Personal + Family, Monthly + Weekly. */
(function () {
    const supabase = window.finnestSupabase;
    const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));
    const escapeHtml = value => String(value ?? '').replace(/[&<>\"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[c]));

    async function render() {
        const container = document.getElementById('dynamicView');
        if (!container) return;
        if (!supabase || !window.FinNestBudgetService) {
            container.innerHTML = '<div class="budget-scope-empty">Budget service is unavailable. Please refresh FinNest.</div>';
            return;
        }

        let scope = 'personal';
        let period = 'monthly';

        function injectStyles() {
            if (document.getElementById('finnestBudgetScopeStyles')) return;
            const s = document.createElement('style');
            s.id = 'finnestBudgetScopeStyles';
            s.textContent = `
                .budget-scope-toolbar{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:18px;padding:5px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;width:max-content;max-width:100%}
                .budget-scope-toolbar button{border:0;background:transparent;color:#64748B;padding:9px 14px;border-radius:9px;font-weight:700;cursor:pointer}.budget-scope-toolbar button.active{background:#fff;color:#047857;box-shadow:0 1px 4px #CBD5E1}
                .budget-period{display:flex;gap:8px;margin-bottom:18px}.budget-period button{border:1px solid #D1FAE5;background:#fff;color:#047857;border-radius:9px;padding:8px 12px;font-weight:700;cursor:pointer}.budget-period button.active{background:#10B981;color:#fff}
                .budget-context{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 16px;padding:12px 14px;border-radius:12px;background:#ECFDF5;color:#065F46;font-size:12px}.budget-context strong{font-size:13px}.budget-scope-grid{display:grid;gap:10px}.budget-scope-row{display:grid;grid-template-columns:minmax(0,1fr) 150px 110px;align-items:center;gap:12px;padding:13px;border:1px solid #E2E8F0;border-radius:12px;background:#fff}.budget-scope-row input{width:100%;padding:9px 10px;border:1px solid #CBD5E1;border-radius:9px;font:inherit;box-sizing:border-box}.budget-scope-name{font-weight:700;color:#334155}.budget-scope-meta{font-size:11px;color:#64748B;margin-top:3px}.budget-scope-actions{display:flex;gap:6px;justify-content:flex-end}.budget-scope-actions button{border:0;background:#F1F5F9;color:#475569;border-radius:8px;padding:7px 9px;font-size:11px;cursor:pointer}.budget-scope-actions .danger{color:#B91C1C}.budget-scope-empty{padding:24px;text-align:center;color:#64748B;border:1px dashed #CBD5E1;border-radius:12px}
                .budget-editor-row{display:grid;grid-template-columns:minmax(0,1fr) 150px auto;gap:10px;margin-bottom:16px}.budget-editor-row select,.budget-editor-row input{min-height:40px;padding:9px 10px;border:1px solid #CBD5E1;border-radius:9px;background:#fff;color:#334155;font:inherit;box-sizing:border-box}.budget-editor-row select:focus,.budget-editor-row input:focus{outline:none;border-color:#10B981;box-shadow:0 0 0 3px rgba(16,185,129,.10)}
                .budget-page-card{background:#fff;border:1px solid #E2E8F0;border-radius:18px;padding:22px;box-shadow:0 4px 12px rgba(15,23,42,.03)}
                .budget-section-title{margin:0 0 4px;color:#0F172A;font-size:28px;letter-spacing:-.03em}.budget-section-sub{margin:0 0 18px;color:#94A3B8;font-size:13px}
                @media(max-width:700px){.budget-scope-toolbar{width:100%}.budget-scope-toolbar button{flex:1}.budget-scope-row{grid-template-columns:1fr 120px}.budget-scope-actions{grid-column:1/-1;justify-content:flex-start}.budget-period{width:100%}.budget-period button{flex:1}.budget-editor-row{grid-template-columns:1fr}.budget-editor-row button{width:100%}.budget-context{align-items:flex-start;flex-direction:column}.budget-section-title{font-size:25px}}
            `;
            document.head.appendChild(s);
        }

        async function paint() {
            injectStyles();
            container.innerHTML = `<div class="budget-page-card"><div class="view-heading"><div><p class="eyebrow">Spending limits for you or your household</p><h1 class="budget-section-title">Budgets</h1><p class="budget-section-sub">Control personal and family spending with monthly or weekly limits.</p></div></div>
                <div class="budget-scope-toolbar"><button data-scope="personal" class="${scope === 'personal' ? 'active' : ''}">👤 Personal</button><button data-scope="family" class="${scope === 'family' ? 'active' : ''}">👨‍👩‍👧 Family</button></div>
                <div class="budget-period"><button data-period="monthly" class="${period === 'monthly' ? 'active' : ''}">Monthly</button><button data-period="weekly" class="${period === 'weekly' ? 'active' : ''}">Weekly</button></div>
                <div id="budgetScopeContent"><div class="budget-scope-empty">Loading budgets…</div></div></div>`;
            container.querySelectorAll('[data-scope]').forEach(button => button.onclick = async () => { scope = button.dataset.scope; await paint(); });
            container.querySelectorAll('[data-period]').forEach(button => button.onclick = async () => { period = button.dataset.period; await paint(); });

            const host = container.querySelector('#budgetScopeContent');
            try {
                const data = await window.FinNestBudgetService.list(scope, period);
                const spent = {};
                data.expenses.forEach(expense => { spent[expense.category] = (spent[expense.category] || 0) + Number(expense.amount || 0); });
                const totalBudget = data.budgets.reduce((sum, budget) => sum + Number(budget.amount || 0), 0);
                const totalSpent = Object.values(spent).reduce((sum, value) => sum + value, 0);
                const info = data.period;
                const dateLabel = period === 'monthly'
                    ? info.start.toLocaleDateString('en-IN',{month:'long',year:'numeric'})
                    : `${info.start.toLocaleDateString('en-IN',{day:'numeric',month:'short'})} – ${info.end.toLocaleDateString('en-IN',{day:'numeric',month:'short'})}`;

                host.innerHTML = `<div class="budget-context"><span>${scope === 'family' ? '👨‍👩‍👧 Shared household budget' : '👤 Your personal budget'}</span><strong>${dateLabel} · ${money(totalSpent)} spent / ${money(totalBudget)} budgeted</strong></div>
                    <div class="budget-editor-row"><select id="scopeCategory">${window.FinNestBudgetService.CATEGORIES.map(category => `<option>${escapeHtml(category)}</option>`).join('')}</select><input id="scopeAmount" type="number" min="0" step="100" placeholder="₹ limit"><button class="finnest-primary-button" id="scopeAdd" type="button">Set Budget</button></div>
                    <div class="budget-scope-grid">${data.budgets.length ? data.budgets.map(budget => { const used = Number(spent[budget.category] || 0); const limit = Number(budget.amount || 0); const pct = limit ? Math.min(100, used / limit * 100) : 0; const over = used > limit; return `<div class="budget-scope-row"><div><div class="budget-scope-name">${escapeHtml(budget.category)}</div><div class="budget-scope-meta">${money(used)} spent · ${over ? 'Over budget' : money(Math.max(0, limit-used)) + ' remaining'}</div></div><input type="number" min="0" step="100" value="${limit}" data-budget-id="${budget.id}"><div class="budget-scope-actions"><button type="button" data-save-id="${budget.id}">Save</button><button type="button" class="danger" data-delete-id="${budget.id}">Delete</button></div><div style="grid-column:1/-1;height:7px;background:#E2E8F0;border-radius:99px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${over?'#EF4444':'#10B981'};border-radius:99px"></div></div></div>`; }).join('') : '<div class="budget-scope-empty">No budgets yet for this scope and period. Use the controls above to create one.</div>'}</div>`;

                host.querySelector('#scopeAdd').onclick = async () => {
                    const amount = Number(host.querySelector('#scopeAmount').value);
                    const category = host.querySelector('#scopeCategory').value;
                    try {
                        await window.FinNestBudgetService.save({ scope, period, category, amount });
                        window.dispatchEvent(new CustomEvent('finnest:budget-changed', { detail: { scope, period } }));
                        await paint();
                    } catch (error) { alert(error?.message || 'Unable to save budget.'); }
                };

                host.querySelectorAll('[data-save-id]').forEach(button => button.onclick = async () => {
                    const input = host.querySelector(`[data-budget-id="${button.dataset.saveId}"]`);
                    const category = data.budgets.find(b => String(b.id) === String(button.dataset.saveId))?.category;
                    try {
                        await window.FinNestBudgetService.save({ scope, period, category, amount: Number(input.value), id: button.dataset.saveId });
                        window.dispatchEvent(new CustomEvent('finnest:budget-changed', { detail: { scope, period } }));
                        await paint();
                    } catch (error) { alert(error?.message || 'Unable to update budget.'); }
                });

                host.querySelectorAll('[data-delete-id]').forEach(button => button.onclick = async () => {
                    if (!confirm('Delete this budget?')) return;
                    try {
                        await window.FinNestBudgetService.remove(button.dataset.deleteId);
                        window.dispatchEvent(new CustomEvent('finnest:budget-changed', { detail: { scope, period } }));
                        await paint();
                    } catch (error) { alert(error?.message || 'Unable to delete budget.'); }
                });
            } catch (error) {
                host.innerHTML = `<div class="budget-scope-empty">Unable to load budgets: ${escapeHtml(error?.message || 'Unknown error')}</div>`;
            }
        }

        await paint();
    }

    window.renderBudgetsView = render;
})();
