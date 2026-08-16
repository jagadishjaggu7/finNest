/* FinNest family data bridge — remove the legacy payer control and keep household names available to shared-expense-splits.js. */
(function () {
    const supabase = window.finnestSupabase;
    if (!supabase) return;

    async function loadMembers() {
        const { data: sessionData } = await supabase.auth.getSession();
        const user = sessionData?.session?.user;
        if (!user) return [];
        const { data: membership } = await supabase
            .from('household_members')
            .select('household_id')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle();
        if (!membership?.household_id) return [];
        const { data, error } = await supabase
            .from('household_members')
            .select('id,user_id,display_name,role,created_at')
            .eq('household_id', membership.household_id)
            .order('created_at', { ascending: true });
        if (error) throw error;
        const names = (data || []).map(m => m.display_name || 'Member');
        localStorage.setItem('finnest_family_members', JSON.stringify(names));
        hideLegacyPayerField();
        return data || [];
    }

    function hideLegacyPayerField() {
        const field = document.getElementById('expensePayerField');
        if (field) field.hidden = true;
    }

    function observe() {
        hideLegacyPayerField();
        const sheet = document.getElementById('expenseSheet');
        if (sheet) new MutationObserver(hideLegacyPayerField).observe(sheet, { childList: true, subtree: true });
    }

    document.addEventListener('DOMContentLoaded', async () => {
        observe();
        try { await loadMembers(); } catch (error) { console.warn('FinNest family members could not be loaded', error); }
    });

    document.addEventListener('finnest:authenticated', () => {
        loadMembers().catch(error => console.warn('FinNest family members could not be loaded', error));
    });
    document.addEventListener('finnest:family-members-changed', () => {
        loadMembers().catch(error => console.warn('FinNest family members could not be refreshed', error));
    });

    window.FinNestFamilyData = { loadMembers };
})();
