/* FinNest settlements: calculate who owes whom from shared expense splits. */
(function () {
    const supabase = window.finnestSupabase;
    if (!supabase) return;
    let loadedForHousehold = null;

    function styles() {
        if (document.getElementById('finnestSettlementStyles')) return;
        const s = document.createElement('style');
        s.id = 'finnestSettlementStyles';
        s.textContent = `
          .settlement-section{margin-top:22px;border:1px solid #E2E8F0;border-radius:16px;padding:14px;background:#F8FAFC}
          .settlement-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px}.settlement-title{font-size:13px;font-weight:800;color:#334155}.settlement-refresh{border:1px solid #CBD5E1;background:#fff;border-radius:9px;padding:7px 9px;font-size:11px;font-weight:700;color:#475569;cursor:pointer}
          .settlement-note{font-size:10px;color:#64748B;margin-bottom:10px}.settlement-balances{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.settlement-balance{padding:10px;border-radius:12px;background:#fff;border:1px solid #E2E8F0}.settlement-balance-name{font-size:12px;font-weight:700;color:#334155}.settlement-balance-amount{font-size:15px;font-weight:800;margin-top:3px}.settlement-balance-amount.receive{color:#047857}.settlement-balance-amount.owe{color:#B91C1C}.settlement-list{display:flex;flex-direction:column;gap:7px;margin-top:10px}.settlement-row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px;background:#fff;border:1px solid #E2E8F0;border-radius:11px}.settlement-row-text{font-size:12px;color:#334155}.settlement-row-amount{font-size:13px;font-weight:800;color:#B91C1C;white-space:nowrap}.settlement-empty{padding:12px;border-radius:11px;background:#ECFDF5;color:#047857;font-size:12px}.settlement-error{padding:10px;border-radius:11px;background:#FEF2F2;color:#B91C1C;font-size:11px}
          @media(max-width:600px){.settlement-balances{grid-template-columns:1fr}}
        `;
        document.head.appendChild(s);
    }

    function money(value) {
        return new Intl.NumberFormat('en-IN', { style:'currency', currency:'INR', maximumFractionDigits:2 }).format(Math.abs(Number(value || 0)));
    }

    async function loadHouseholdId() {
        const { data } = await supabase.auth.getSession();
        const user = data?.session?.user;
        if (!user) return null;
        const { data: membership } = await supabase.from('household_members').select('household_id').eq('user_id', user.id).limit(1).maybeSingle();
        return membership?.household_id || null;
    }

    async function calculate() {
        const householdId = await loadHouseholdId();
        if (!householdId) return { error:'No household found.' };

        const [membersResult, expensesResult, splitsResult] = await Promise.all([
            supabase.from('household_members').select('id,user_id,display_name').eq('household_id', householdId),
            supabase.from('expenses').select('id,amount,paid_by_member_id,expense_type').eq('household_id', householdId).eq('expense_type','shared'),
            supabase.from('expense_splits').select('expense_id,member_id,share_amount').eq('household_id', householdId)
        ]);
        if (membersResult.error) return { error:membersResult.error.message };
        if (expensesResult.error) return { error:expensesResult.error.message };
        if (splitsResult.error) return { error:splitsResult.error.message };

        const members = membersResult.data || [];
        const balances = new Map(members.map(m => [m.id, 0]));
        const names = new Map(members.map(m => [m.id, m.display_name || 'Member']));
        const expenses = expensesResult.data || [];
        const splits = splitsResult.data || [];
        const expenseIds = new Set(expenses.map(e => e.id));

        // Net = amount paid - personal share. Positive means the member should receive money.
        for (const split of splits) {
            if (!expenseIds.has(split.expense_id) || !balances.has(split.member_id)) continue;
            balances.set(split.member_id, balances.get(split.member_id) - Number(split.share_amount || 0));
        }
        for (const expense of expenses) {
            if (expense.paid_by_member_id && balances.has(expense.paid_by_member_id)) {
                balances.set(expense.paid_by_member_id, balances.get(expense.paid_by_member_id) + Number(expense.amount || 0));
            }
        }

        const creditors = [...balances.entries()].filter(([,v]) => v > 0.005).map(([id,v]) => ({id, amount:v}));
        const debtors = [...balances.entries()].filter(([,v]) => v < -0.005).map(([id,v]) => ({id, amount:-v}));
        const transfers = [];
        let ci=0, di=0;
        while (ci < creditors.length && di < debtors.length) {
            const amount = Math.min(creditors[ci].amount, debtors[di].amount);
            if (amount > 0.005) transfers.push({ from:debtors[di].id, to:creditors[ci].id, amount });
            creditors[ci].amount -= amount; debtors[di].amount -= amount;
            if (creditors[ci].amount <= 0.005) ci++;
            if (debtors[di].amount <= 0.005) di++;
        }
        return { balances:[...balances.entries()].map(([id,amount]) => ({id, amount, name:names.get(id)})), transfers };
    }

    async function render() {
        const modal = document.getElementById('finnestFamilyBackdrop');
        if (!modal) return;
        let section = modal.querySelector('#finnestSettlementSection');
        if (!section) {
            section = document.createElement('div');
            section.id = 'finnestSettlementSection';
            section.className = 'settlement-section';
            modal.querySelector('#familyInvites')?.after(section);
        }
        section.innerHTML = '<div class="settlement-head"><span class="settlement-title">💸 Who owes whom?</span><button class="settlement-refresh" id="settlementRefresh">Refresh</button></div><div class="settlement-note">Calculated from shared expenses and equal member shares. Settlements are not marked as paid yet.</div><div class="settlement-balances" id="settlementBalances">Loading…</div><div class="settlement-list" id="settlementList"></div>';
        section.querySelector('#settlementRefresh').onclick = render;
        const result = await calculate();
        if (result.error) { section.querySelector('#settlementBalances').innerHTML = `<div class="settlement-error">${escapeHtml(result.error)}</div>`; return; }
        const balances = result.balances;
        section.querySelector('#settlementBalances').innerHTML = balances.map(b => `<div class="settlement-balance"><div class="settlement-balance-name">${escapeHtml(b.name)}</div><div class="settlement-balance-amount ${b.amount >= 0 ? 'receive':'owe'}">${b.amount >= 0 ? 'Receives ':'Owes '}${money(b.amount)}</div></div>`).join('');
        section.querySelector('#settlementList').innerHTML = result.transfers.length
            ? result.transfers.map(t => `<div class="settlement-row"><span class="settlement-row-text"><strong>${escapeHtml(balances.find(b=>b.id===t.from)?.name || 'Member')}</strong> owes <strong>${escapeHtml(balances.find(b=>b.id===t.to)?.name || 'Member')}</strong></span><span class="settlement-row-amount">${money(t.amount)}</span></div>`).join('')
            : '<div class="settlement-empty">Everyone is settled up 🎉</div>';
    }

    function escapeHtml(v){return String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));}

    function watch() {
        styles();
        const observer = new MutationObserver(() => {
            const modal = document.getElementById('finnestFamilyBackdrop');
            if (modal && loadedForHousehold !== modal) {
                loadedForHousehold = modal;
                setTimeout(render, 50);
            }
        });
        observer.observe(document.body, { childList:true, subtree:true });
    }

    document.addEventListener('DOMContentLoaded', watch);
})();
