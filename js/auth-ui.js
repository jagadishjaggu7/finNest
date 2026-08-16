/* FinNest authenticated UI: greeting + clean signed-out state. */
(function () {
    const supabase = window.finnestSupabase;
    if (!supabase) return;

    function setGreeting(name) {
        const heading = document.querySelector('.page-header h1');
        if (!heading) return;
        heading.textContent = name ? `Good evening, ${name} 👋` : 'Welcome to FinNest 👋';
    }

    function clearSignedOutData() {
        localStorage.setItem('finnest_expenses', '[]');
        localStorage.setItem('finnest_incomes', '[]');
        localStorage.setItem('finnest_budgets', '{}');
        localStorage.setItem('finnest_family_members', '[]');
        localStorage.setItem('finnest_family_payers', '{}');
        localStorage.removeItem('finnest_supabase_id_map');
        localStorage.removeItem('finnest_profile');
        localStorage.removeItem('finnest_view_mode');
        try { window.expenses = []; window.incomes = []; window.budgets = {}; } catch (_) { /* module globals are not window properties */ }
        if (typeof window.renderDashboard === 'function') window.renderDashboard();
    }

    async function applySession(session) {
        if (!session) {
            clearSignedOutData();
            setGreeting('');
            return;
        }

        let name = session.user?.user_metadata?.display_name || '';
        try {
            const { data } = await supabase.from('profiles').select('display_name').eq('id', session.user.id).maybeSingle();
            name = data?.display_name || name || session.user.email?.split('@')[0] || 'there';
        } catch (_) {
            name = name || session.user.email?.split('@')[0] || 'there';
        }
        setGreeting(name);
    }

    async function init() {
        const { data } = await supabase.auth.getSession();
        await applySession(data.session);
        supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
                setTimeout(() => applySession(session), 0);
            }
        });
    }

    document.addEventListener('DOMContentLoaded', init);
})();
