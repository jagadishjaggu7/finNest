/* FinNest authenticated UI: greeting + clean signed-out state. */
(function () {
    const supabase = window.finnestSupabase;
    if (!supabase) return;

    function setGreeting(name) {
        const heading = document.querySelector('.page-header h1');
        if (!heading) return;
        heading.textContent = name ? `Good evening, ${name} 👋` : 'Welcome to FinNest 👋';
    }

    async function applySession(session) {
        if (!session) {
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
