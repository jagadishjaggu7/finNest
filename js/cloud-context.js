/* FinNest cloud context: keep profile and household names tied to the signed-in Supabase account. */
(function () {
    const supabase = window.finnestSupabase;
    if (!supabase) return;

    const PROFILE_KEY = 'finnest_profile';
    const MEMBERS_KEY = 'finnest_family_members';

    const writeContext = async () => {
        const { data: sessionData } = await supabase.auth.getSession();
        const user = sessionData?.session?.user;
        if (!user) return;

        const [{ data: profile }, { data: membership }] = await Promise.all([
            supabase.from('profiles').select('display_name,currency').eq('id', user.id).maybeSingle(),
            supabase.from('household_members').select('household_id').eq('user_id', user.id).limit(1).maybeSingle()
        ]);

        if (profile) {
            localStorage.setItem(PROFILE_KEY, JSON.stringify({
                name: profile.display_name || user.email?.split('@')[0] || 'User',
                email: user.email || '',
                currency: 'INR (₹)'
            }));
        }

        if (membership?.household_id) {
            const { data: members } = await supabase
                .from('household_members')
                .select('id,user_id,display_name,role,created_at')
                .eq('household_id', membership.household_id)
                .order('created_at', { ascending: true });
            localStorage.setItem(MEMBERS_KEY, JSON.stringify((members || []).map(m => m.display_name || 'Member')));
            window.dispatchEvent(new CustomEvent('finnest:cloud-context-ready', { detail: { members: members || [] } }));
        } else {
            localStorage.setItem(MEMBERS_KEY, '[]');
            window.dispatchEvent(new CustomEvent('finnest:cloud-context-ready', { detail: { members: [] } }));
        }

        const profileButton = document.querySelector('.profile-button');
        const profileName = profile?.display_name || user.email?.split('@')[0] || 'User';
        if (profileButton) profileButton.textContent = profileName.trim().charAt(0).toUpperCase();
        const heading = document.querySelector('.page-header h1');
        if (heading && /Welcome to FinNest|Good (morning|afternoon|evening),/.test(heading.textContent)) {
            const hour = new Date().getHours();
            const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
            heading.textContent = `${greeting}, ${profileName} 👋`;
        }
    };

    function wrapCloudBoot() {
        if (!window.FinNestCloud?.boot || window.FinNestCloud.boot.__cloudContextWrapped) return;
        const originalBoot = window.FinNestCloud.boot;
        const wrapped = async function () {
            try { await writeContext(); } catch (error) { console.warn('FinNest cloud context could not load', error); }
            return originalBoot();
        };
        wrapped.__cloudContextWrapped = true;
        window.FinNestCloud.boot = wrapped;
    }

    wrapCloudBoot();
    document.addEventListener('DOMContentLoaded', () => {
        wrapCloudBoot();
        setTimeout(() => writeContext().catch(() => {}), 700);
    });
    document.addEventListener('finnest:authenticated', () => writeContext().catch(() => {}));
})();
