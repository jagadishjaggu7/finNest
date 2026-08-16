/* FinNest shared expenses: choose household members and persist equal shares. */
(function () {
    const supabase = window.finnestSupabase;
    if (!supabase) return;

    let members = [];
    let selected = new Set();
    let lastExpenseType = 'personal';
    let syncing = false;

    function styles() {
        if (document.getElementById('finnestSplitStyles')) return;
        const s = document.createElement('style');
        s.id = 'finnestSplitStyles';
        s.textContent = `
          .split-field{margin:14px 0;padding:12px;border:1px solid #D1FAE5;background:#F0FDF4;border-radius:14px}
          .split-field[hidden]{display:none}.split-field-label{display:block;font-size:12px;font-weight:700;color:#334155;margin-bottom:8px}
          .split-members{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.split-member{display:flex;align-items:center;gap:8px;padding:9px;border:1px solid #E2E8F0;background:#fff;border-radius:10px;cursor:pointer;font-size:12px;color:#334155}
          .split-member input{accent-color:#10B981}.split-hint{font-size:10px;color:#64748B;margin-top:8px}.split-error{font-size:11px;color:#B91C1C;margin-top:7px;display:none}.split-error.show{display:block}
          @media(max-width:600px){.split-members{grid-template-columns:1fr}}
        `;
        document.head.appendChild(s);
    }

    async function loadMembers() {
        const { data: sessionData } = await supabase.auth.getSession();
        const user = sessionData?.session?.user;
        if (!user) { members = []; return; }
        const { data, error } = await supabase.from('household_members')
            .select('id, household_id, user_id, display_name, role, created_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: true });
        if (error || !data?.length) { members = []; return; }
        const householdId = data[0].household_id;
        const result = await supabase.from('household_members')
            .select('id, household_id, user_id, display_name, role, created_at')
            .eq('household_id', householdId)
            .order('created_at', { ascending: true });
        members = result.data || data;
    }

    function renderField() {
        const sheet = document.querySelector('.expense-sheet');
        const note = document.getElementById('expenseNote');
        if (!sheet || !note) return;
        let field = document.getElementById('finnestSplitField');
        if (!field) {
            field = document.createElement('div');
            field.id = 'finnestSplitField';
            field.className = 'split-field';
            note.closest('.expense-field')?.after(field);
        }
        field.innerHTML = `
          <span class="split-field-label">👨‍👩‍👧 Who shares this expense?</span>
          <div class="split-members">
            ${members.map(m => `<label class="split-member"><input type="checkbox" value="${m.id}" ${selected.has(m.id) ? 'checked' : ''}> <span>${escapeHtml(m.display_name)}${m.role === 'owner' ? ' · Owner' : ''}</span></label>`).join('') || '<span class="split-hint">No family members found yet. Invite people from Family first.</span>'}
          </div>
          <div class="split-hint">For now FinNest splits shared expenses equally. Custom percentages/amounts can be added later.</div>
          <div id="finnestSplitError" class="split-error">Select at least one family member for a shared expense.</div>`;
        field.querySelectorAll('input').forEach(input => input.addEventListener('change', e => {
            if (e.target.checked) selected.add(e.target.value); else selected.delete(e.target.value);
        }));
        updateVisibility();
    }

    function updateVisibility() {
        const field = document.getElementById('finnestSplitField');
        if (!field) return;
        const shared = lastExpenseType === 'shared';
        field.hidden = !shared;
        const error = document.getElementById('finnestSplitError');
        if (error && !shared) error.classList.remove('show');
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
    }

    async function syncLatestSplit() {
        if (syncing || lastExpenseType !== 'shared' || !selected.size) return;
        syncing = true;
        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const user = sessionData?.session?.user;
            if (!user) return;
            const { data: expenses } = await supabase.from('expenses').select('id, household_id, amount, expense_type, updated_at')
                .eq('user_id', user.id).eq('expense_type', 'shared').order('updated_at', { ascending: false }).limit(1);
            const expense = expenses?.[0];
            if (!expense?.household_id) return;
            const ids = [...selected].filter(id => members.some(m => m.id === id));
            if (!ids.length) return;
            const amount = Number(expense.amount || 0);
            const base = Math.floor((amount / ids.length) * 100) / 100;
            const rows = ids.map((memberId, index) => ({
                expense_id: expense.id,
                household_id: expense.household_id,
                member_id: memberId,
                share_amount: index === ids.length - 1 ? Number((amount - base * (ids.length - 1)).toFixed(2)) : Number(base.toFixed(2))
            }));
            await supabase.from('expense_splits').delete().eq('expense_id', expense.id);
            await supabase.from('expense_splits').insert(rows);
        } finally { syncing = false; }
    }

    function hookTypeButtons() {
        document.querySelectorAll('.type-option').forEach(btn => {
            if (btn.dataset.splitHooked) return;
            btn.dataset.splitHooked = '1';
            btn.addEventListener('click', () => {
                lastExpenseType = btn.dataset.type || 'personal';
                updateVisibility();
                if (lastExpenseType === 'shared') loadMembers().then(renderField);
            });
        });
    }

    function hookSave() {
        const save = document.getElementById('saveExpense');
        if (!save || save.dataset.splitHooked) return;
        save.dataset.splitHooked = '1';
        save.addEventListener('click', e => {
            const shared = document.querySelector('.type-option.selected')?.dataset.type === 'shared';
            lastExpenseType = shared ? 'shared' : 'personal';
            if (!shared) return;
            if (!selected.size) {
                e.preventDefault();
                e.stopImmediatePropagation();
                document.getElementById('finnestSplitError')?.classList.add('show');
                return;
            }
            setTimeout(syncLatestSplit, 900);
        }, true);
    }

    function resetOnSheetClose() {
        document.addEventListener('click', e => {
            if (e.target.closest('#closeExpenseSheet, #cancelExpense')) {
                selected = new Set();
                lastExpenseType = 'personal';
            }
        });
    }

    async function init() {
        styles();
        await loadMembers();
        const observer = new MutationObserver(() => { hookTypeButtons(); hookSave(); if (document.querySelector('.expense-sheet') && !document.getElementById('finnestSplitField')) renderField(); });
        observer.observe(document.body, { childList: true, subtree: true });
        hookTypeButtons(); hookSave(); renderField(); resetOnSheetClose();
        document.addEventListener('finnest:authenticated', async () => { await loadMembers(); renderField(); });
    }

    document.addEventListener('DOMContentLoaded', init);
})();
