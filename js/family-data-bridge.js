/* FinNest family data bridge — keep the expense payer selector and cloud payer mapping in sync. */
(function () {
    const supabase = window.finnestSupabase;
    if (!supabase) return;

    let members = [];

    const esc = value => String(value ?? '').replace(/[&<>\"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[c]));

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
        members = data || [];
        localStorage.setItem('finnest_family_members', JSON.stringify(members.map(m => m.display_name || 'Member')));
        refreshPayerSelect();
        return members;
    }

    function refreshPayerSelect(selectedId = null) {
        const field = document.getElementById('expensePayerField');
        const select = document.getElementById('expensePayer');
        if (!field || !select) return;
        if (!members.length) {
            select.innerHTML = '<option value="">No family members found</option>';
            select.disabled = true;
            return;
        }
        select.disabled = false;
        const current = selectedId || select.value;
        select.innerHTML = members.map(member => `<option value="${esc(member.display_name || '')}" data-member-id="${esc(member.id)}">${esc(member.display_name || 'Member')}</option>`).join('');
        if (current && [...select.options].some(o => o.value === current)) select.value = current;
        else select.selectedIndex = 0;
    }

    async function updateCloudPayerForCurrentExpense() {
        const select = document.getElementById('expensePayer');
        if (!select || !members.length) return;
        const payerName = select.value;
        const member = members.find(m => (m.display_name || '') === payerName);
        if (!member) return;

        // The app keeps a local numeric id for the expense and syncs its row separately.
        // Find the matching local expense by the most recently changed shared expense.
        const stored = JSON.parse(localStorage.getItem('finnest_supabase_id_map') || '{}');
        const localExpenses = JSON.parse(localStorage.getItem('finnest_expenses') || '[]');
        const candidates = localExpenses.filter(e => e.type === 'shared').sort((a, b) => Number(b.id) - Number(a.id));
        const target = candidates[0];
        const cloudId = target && stored.expenses ? stored.expenses[target.id] : null;
        if (!cloudId) return;
        await supabase.from('expenses').update({ paid_by_member_id: member.id }).eq('id', cloudId);
    }

    function wireTypeButtons() {
        document.querySelectorAll('.type-option').forEach(button => {
            button.addEventListener('click', () => {
                setTimeout(() => {
                    const shared = document.querySelector('.type-option.selected')?.dataset.type === 'shared';
                    const field = document.getElementById('expensePayerField');
                    if (field) field.style.display = shared ? '' : '';
                    refreshPayerSelect();
                }, 0);
            });
        });
    }

    function observeSheet() {
        const sheet = document.getElementById('expenseSheet');
        if (!sheet) return;
        new MutationObserver(() => {
            if (sheet.classList.contains('open')) {
                refreshPayerSelect();
            }
        }).observe(sheet, { attributes: true, attributeFilter: ['class'] });
        wireTypeButtons();
    }

    document.addEventListener('DOMContentLoaded', async () => {
        observeSheet();
        try { await loadMembers(); } catch (error) { console.warn('FinNest family members could not be loaded', error); }
    });

    document.addEventListener('finnest:authenticated', () => {
        loadMembers().catch(error => console.warn('FinNest family members could not be loaded', error));
    });
    document.addEventListener('finnest:family-members-changed', () => {
        loadMembers().catch(error => console.warn('FinNest family members could not be refreshed', error));
    });

    window.FinNestFamilyData = { loadMembers, refreshPayerSelect, updateCloudPayerForCurrentExpense };
})();
