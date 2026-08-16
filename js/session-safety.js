/* FinNest session safety — keep signed-out UI/data empty and stop demo fallbacks. */
(function () {
    const FINANCIAL_KEYS = new Set([
        'finnest_expenses', 'finnest_incomes', 'finnest_budgets',
        'finnest_family_members', 'finnest_family_payers', 'finnest_profile',
        'finnest_supabase_id_map', 'finnest_view_mode'
    ]);
    const originalGetItem = Storage.prototype.getItem;
    let sessionResolved = false;
    let signedIn = false;

    // app.js is loaded immediately after this file. Until Supabase resolves the
    // session, prevent app.js from reading old/demo financial localStorage.
    Storage.prototype.getItem = function (key) {
        if (!sessionResolved && FINANCIAL_KEYS.has(key)) return null;
        if (sessionResolved && !signedIn && FINANCIAL_KEYS.has(key)) return null;
        return originalGetItem.call(this, key);
    };

    function clearSignedOutState() {
        if (typeof expenses !== 'undefined') expenses = [];
        if (typeof incomes !== 'undefined') incomes = [];
        if (typeof budgets !== 'undefined') budgets = {};
        if (typeof familyMembers !== 'undefined') familyMembers = [];
        if (typeof familyPayers !== 'undefined') familyPayers = {};

        originalGetItem.call(localStorage, 'finnest_expenses');
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

    async function resolveSession() {
        const supabase = window.finnestSupabase;
        if (!supabase) return;
        try {
            const { data } = await supabase.auth.getSession();
            signedIn = !!data?.session;
            sessionResolved = true;
            if (!signedIn) clearSignedOutState();
        } catch (error) {
            sessionResolved = true;
            signedIn = false;
            clearSignedOutState();
            console.warn('FinNest session safety check failed', error);
        }
    }

    resolveSession();
    window.addEventListener('pageshow', () => setTimeout(resolveSession, 0));
})();
