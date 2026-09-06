/* FinNest shared-expense persistence helper.
   Uses the shared runtime context for household/member resolution.
   This remains a compatibility layer for now; the later expense-service phase
   will replace the repair-based persistence path entirely.
*/
(function () {
    const supabase = window.finnestSupabase;
    let installed = false;

    async function getContext() {
        if (window.FinNestContext) return window.FinNestContext.load();
        return null;
    }

    async function repairSharedExpenses() {
        if (!supabase || typeof familyPayers === 'undefined') return;
        const ctx = await getContext();
        const user = ctx?.user;
        const householdId = ctx?.householdId;
        if (!user || !householdId) return;

        const byName = Object.fromEntries((ctx.members || []).map(member => [member.display_name, member]));
        let map = {};
        try { map = JSON.parse(localStorage.getItem('finnest_supabase_id_map') || '{}'); } catch (_) {}
        const expenseMap = map.expenses || {};

        for (const [localId, payerName] of Object.entries(familyPayers)) {
            const cloudId = expenseMap[localId];
            const member = byName[payerName];
            if (!cloudId || !member) continue;
            const { error } = await supabase
                .from('expenses')
                .update({ household_id: householdId, expense_type: 'shared', paid_by_member_id: member.id })
                .eq('id', cloudId)
                .eq('user_id', user.id);
            if (error) throw error;
        }
    }

    function install() {
        if (installed || typeof window.persistState !== 'function') return;
        installed = true;
        const original = window.persistState;
        window.persistState = function () {
            const result = original.apply(this, arguments);
            setTimeout(() => repairSharedExpenses().catch(error => console.warn('FinNest shared expense repair failed', error)), 1200);
            return result;
        };
    }

    document.addEventListener('DOMContentLoaded', () => setTimeout(install, 1100), { once: true });
    document.addEventListener('finnest:cloud-data-ready', () => setTimeout(install, 100));
    document.addEventListener('finnest:context-ready', () => setTimeout(install, 50));
})();