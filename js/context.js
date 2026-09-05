/* FinNest shared runtime context.
   Single source for authenticated user, active household, members and profile.
   UI modules should read this context instead of resolving household membership
   independently. Context is cached for the current browser session and can be
   refreshed explicitly after auth/family changes.
*/
(function () {
    const supabase = window.finnestSupabase;
    if (!supabase) return;

    let state = {
        user: null,
        householdId: null,
        memberId: null,
        household: null,
        members: [],
        profile: null,
        loaded: false,
        loading: null
    };

    async function resolveHousehold(userId) {
        const { data: memberships, error } = await supabase
            .from('household_members')
            .select('id,household_id,user_id,display_name,role,is_owner,created_at,households(id,name,owner_id)')
            .eq('user_id', userId)
            .order('created_at', { ascending: true });
        if (error) throw error;

        const rows = memberships || [];
        const selected =
            rows.find(m => m.is_owner === true) ||
            rows.find(m => m.role === 'owner') ||
            rows.find(m => m.households?.owner_id === userId) ||
            rows[0] ||
            null;

        if (!selected?.household_id) {
            return { householdId: null, memberId: null, household: null, members: [] };
        }

        const { data: members, error: membersError } = await supabase
            .from('household_members')
            .select('id,household_id,user_id,display_name,role,is_owner,created_at')
            .eq('household_id', selected.household_id)
            .order('created_at', { ascending: true });
        if (membersError) throw membersError;

        return {
            householdId: selected.household_id,
            memberId: selected.id,
            household: selected.households || null,
            members: members || []
        };
    }

    async function loadProfile(userId) {
        const { data, error } = await supabase
            .from('profiles')
            .select('id,display_name,currency')
            .eq('id', userId)
            .maybeSingle();
        if (error) throw error;
        return data || null;
    }

    async function load(force = false) {
        if (state.loading) return state.loading;
        if (state.loaded && !force) return state;

        state.loading = (async () => {
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
            if (sessionError) throw sessionError;
            const user = sessionData?.session?.user || null;

            if (!user) {
                state = {
                    user: null,
                    householdId: null,
                    memberId: null,
                    household: null,
                    members: [],
                    profile: null,
                    loaded: true,
                    loading: null
                };
                expose();
                return state;
            }

            const [household, profile] = await Promise.all([
                resolveHousehold(user.id),
                loadProfile(user.id)
            ]);

            state = {
                user,
                householdId: household.householdId,
                memberId: household.memberId,
                household: household.household,
                members: household.members,
                profile,
                loaded: true,
                loading: null
            };
            expose();
            window.dispatchEvent(new CustomEvent('finnest:context-ready', { detail: snapshot() }));
            return state;
        })().catch(error => {
            state.loading = null;
            throw error;
        });

        return state.loading;
    }

    function snapshot() {
        return {
            user: state.user,
            householdId: state.householdId,
            memberId: state.memberId,
            household: state.household,
            members: [...state.members],
            profile: state.profile,
            loaded: state.loaded
        };
    }

    function expose() {
        window.FinNestContext = {
            get: () => snapshot(),
            load,
            refresh: () => load(true),
            getUser: () => state.user,
            getHouseholdId: () => state.householdId,
            getMemberId: () => state.memberId,
            getMembers: () => [...state.members],
            getProfile: () => state.profile
        };
    }

    expose();

    document.addEventListener('finnest:authenticated', () => {
        load(true).catch(error => console.warn('FinNest context refresh after sign-in failed', error));
    });

    document.addEventListener('finnest:signedout', () => {
        load(true).catch(error => console.warn('FinNest context reset failed', error));
    });

    window.addEventListener('finnest:family-members-changed', () => {
        load(true).catch(error => console.warn('FinNest context refresh after family change failed', error));
    });
})();
