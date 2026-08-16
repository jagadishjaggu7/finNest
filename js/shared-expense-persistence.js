/* FinNest shared-expense persistence guard.
   app.js/supabase-data.js historically rewrote shared rows as personal rows on later saves.
   This small layer restores household + payer metadata after the normal sync finishes. */
(function () {
    const supabase = window.finnestSupabase;
    let installed = false;

    async function repairSharedExpenses() {
        if (!supabase || typeof familyPayers === 'undefined') return;
        const { data: sessionData } = await supabase.auth.getSession();
        const user = sessionData?.session?.user;
        if (!user) return;
        const { data: membership } = await supabase.from('household_members').select('household_id').eq('user_id', user.id).limit(1).maybeSingle();
        if (!membership?.household_id) return;
        const { data: members } = await supabase.from('household_members').select('id,display_name,user_id').eq('household_id', membership.household_id);
        const byName = Object.fromEntries((members || []).map(m => [m.display_name, m]));
        let map = {};
        try { map = JSON.parse(localStorage.getItem('finnest_supabase_id_map') || '{}'); } catch (_) {}
        const expenseMap = map.expenses || {};
        for (const [localId, payerName] of Object.entries(familyPayers)) {
            const cloudId = expenseMap[localId];
            const member = byName[payerName];
            if (!cloudId || !member) continue;
            await supabase.from('expenses').update({ household_id: membership.household_id, expense_type: 'shared', paid_by_member_id: member.id }).eq('id', cloudId).eq('user_id', user.id);
        }
    }

    function install() {
        if (installed || typeof window.persistState !== 'function') return;
        installed = true;
        const original = window.persistState;
        window.persistState = function () {
            const result = original.apply(this, arguments);
            setTimeout(() => repairSharedExpenses().catch(() => {}), 1200);
            return result;
        };
    }

    document.addEventListener('DOMContentLoaded', () => setTimeout(install, 1100), { once: true });
    document.addEventListener('finnest:cloud-data-ready', () => setTimeout(install, 100));
})();
