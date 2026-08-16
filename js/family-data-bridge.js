/* FinNest family data bridge — keep the expense payer selector and cloud payer mapping in sync. */
(function () {
    const supabase = window.finnestSupabase;
    if (!supabase) return;

    let members = [];
    let lastEditingLocalId = null;

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

    function refreshPayerSelect() {
        const select = document.getElementById('expensePayer');
        if (!select) return;
        if (!members.length) {
            select.innerHTML = '<option value="">No family members found</option>';
            select.disabled = true;
            return;
        }
        const current = select.value;
        select.disabled = false;
        select.innerHTML = members.map(member => `<option value="${esc(member.display_name || '')}" data-member-id="${esc(member.id)}">${esc(member.display_name || 'Member')}</option>`).join('');
        if (current && [...select.options].some(o => o.value === current)) select.value = current;
        else select.selectedIndex = 0;
    }

    async function updateCloudPayer(localId, attempt = 0) {
        const select = document.getElementById('expensePayer');
        const type = document.querySelector('.type-option.selected')?.dataset.type;
        if (!select || type !== 'shared' || !members.length) return;
        const member = members.find(m => (m.display_name || '') === select.value);
        if (!member) return;

        const stored = JSON.parse(localStorage.getItem('finnest_supabase_id_map') || '{}');
        const localExpenses = JSON.parse(localStorage.getItem('finnest_expenses') || '[]');
        const targetId = localId || [...localExpenses.filter(e => e.type === 'shared')].sort((a, b) => Number(b.id) - Number(a.id))[0]?.id;
        const cloudId = targetId && stored.expenses ? stored.expenses[targetId] : null;
        if (!cloudId) {
            if (attempt < 5) setTimeout(() => updateCloudPayer(localId, attempt + 1), 500);
            return;
        }
        const { error } = await supabase.from('expenses').update({ paid_by_member_id: member.id }).eq('id', cloudId);
        if (error) console.warn('FinNest payer update failed', error);
    }

    function wireTypeButtons() {
        document.querySelectorAll('.type-option').forEach(button => {
            button.addEventListener('click', () => setTimeout(refreshPayerSelect, 0));
        });
    }

    function observeSheet() {
        const sheet = document.getElementById('expenseSheet');
        if (!sheet) return;
        new MutationObserver(() => {
            if (sheet.classList.contains('open')) refreshPayerSelect();
        }).observe(sheet, { attributes: true, attributeFilter: ['class'] });
        wireTypeButtons();
    }

    function wireSave() {
        document.getElementById('saveExpense')?.addEventListener('click', () => {
            const localId = lastEditingLocalId;
            setTimeout(() => updateCloudPayer(localId), 800);
            setTimeout(() => { lastEditingLocalId = null; }, 1200);
        });
    }

    // Capture edit-row clicks before app.js opens the sheet so we retain the exact local expense id.
    document.addEventListener('click', event => {
        const row = event.target.closest('[data-expense-id]');
        if (row) lastEditingLocalId = Number(row.dataset.expenseId);
    }, true);

    document.addEventListener('DOMContentLoaded', async () => {
        observeSheet();
        wireSave();
        try { await loadMembers(); } catch (error) { console.warn('FinNest family members could not be loaded', error); }
    });

    document.addEventListener('finnest:authenticated', () => {
        loadMembers().catch(error => console.warn('FinNest family members could not be loaded', error));
    });
    document.addEventListener('finnest:family-members-changed', () => {
        loadMembers().catch(error => console.warn('FinNest family members could not be refreshed', error));
    });

    window.FinNestFamilyData = { loadMembers, refreshPayerSelect, updateCloudPayer };
})();
