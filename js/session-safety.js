/* FinNest session safety — keep signed-out UI/data empty and stop demo fallbacks. */
(function () {
    const client = () => window.finnestSupabase;

    function clearSignedOutState() {
        if (typeof expenses !== 'undefined') expenses = [];
        if (typeof incomes !== 'undefined') incomes = [];
        if (typeof budgets !== 'undefined') budgets = {};
        if (typeof familyMembers !== 'undefined') familyMembers = [];
        if (typeof familyPayers !== 'undefined') familyPayers = {};

        localStorage.setItem('finnest_expenses', '[]');
        localStorage.setItem('finnest_incomes', '[]');
        localStorage.setItem('finnest_budgets', '{}');
        localStorage.setItem('finnest_family_members', '[]');
        localStorage.setItem('finnest_family_payers', '{}');
        localStorage.removeItem('finnest_profile');
        localStorage.removeItem('finnest_supabase_id_map');
        localStorage.removeItem('finnest_view_mode');

        if (typeof renderDashboard === 'function') renderDashboard();
    }

    async function enforce() {
        const supabase = client();
        if (!supabase) return;
        try {
            const { data } = await supabase.auth.getSession();
            if (!data?.session) clearSignedOutState();
        } catch (error) {
            console.warn('FinNest session safety check failed', error);
        }
    }

    document.addEventListener('DOMContentLoaded', () => setTimeout(enforce, 0));
    window.addEventListener('pageshow', () => setTimeout(enforce, 0));
})();
