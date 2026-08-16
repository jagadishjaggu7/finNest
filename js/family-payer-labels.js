/* FinNest family transactions — show who paid each shared expense. */
(function () {
    const supabase = window.finnestSupabase;
    if (!supabase) return;

    let lastSignature = '';
    let observer = null;

    const esc = v => String(v ?? '').replace(/[&<>\"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[c]));

    async function loadContext() {
        const { data: sessionData } = await supabase.auth.getSession();
        const user = sessionData?.session?.user;
        if (!user) return null;
        const { data: membership } = await supabase.from('household_members').select('household_id').eq('user_id', user.id).limit(1).maybeSingle();
        if (!membership?.household_id) return null;
        const [membersResult, expensesResult] = await Promise.all([
            supabase.from('household_members').select('id,user_id,display_name').eq('household_id', membership.household_id).order('created_at'),
            supabase.from('expenses').select('id,amount,category,note,expense_date,user_id,paid_by_member_id').eq('household_id', membership.household_id).eq('expense_type','shared').order('expense_date', { ascending: false })
        ]);
        if (membersResult.error || expensesResult.error) return null;
        return { user, members: membersResult.data || [], expenses: expensesResult.data || [] };
    }

    async function label() {
        if (localStorage.getItem('finnest_view_mode') !== 'family') return;
        const rows = [...document.querySelectorAll('.family-expense')];
        if (!rows.length) return;

        const context = await loadContext();
        if (!context) return;
        const signature = rows.length + ':' + context.expenses.map(e => `${e.id}:${e.paid_by_member_id || e.user_id}`).join('|');
        if (signature === lastSignature && rows.every(r => r.querySelector('.family-payer-label'))) return;
        lastSignature = signature;

        const memberById = Object.fromEntries(context.members.map(m => [m.id, m]));
        const memberByUser = Object.fromEntries(context.members.map(m => [m.user_id, m]));

        rows.forEach((row, index) => {
            if (row.querySelector('.family-payer-label')) return;
            const expense = context.expenses[index];
            if (!expense) return;
            const member = memberById[expense.paid_by_member_id] || memberByUser[expense.user_id];
            if (!member) return;
            const label = member.user_id === context.user.id ? 'By Me' : `By ${member.display_name}`;
            const info = row.children[1];
            if (!info) return;
            const small = document.createElement('small');
            small.className = 'family-payer-label';
            small.textContent = label;
            small.style.cssText = 'display:inline-block;margin-top:4px;padding:3px 7px;border-radius:999px;background:#ECFDF5;color:#047857;font-size:10px;font-weight:800';
            info.appendChild(small);
        });
    }

    function observe() {
        const main = document.querySelector('.main-content');
        if (!main || observer) return;
        observer = new MutationObserver(() => setTimeout(label, 30));
        observer.observe(main, { childList: true, subtree: true });
        setTimeout(label, 150);
    }

    document.addEventListener('DOMContentLoaded', observe);
    document.addEventListener('finnest:authenticated', () => { lastSignature = ''; setTimeout(label, 200); });
})();
