/* FinNest shared expenses — household member selector + payer.
   Deliberately event-driven: no MutationObserver loops and no full-body DOM observers. */
(function () {
    const supabase = window.finnestSupabase;
    if (!supabase) return;

    let members = [];
    let selected = new Set();
    let payerId = null;
    let lastExpenseType = 'personal';
    let editingLocalId = null;
    let syncing = false;
    let initialized = false;

    function styles() {
        if (document.getElementById('finnestSplitStyles')) return;
        const s = document.createElement('style');
        s.id = 'finnestSplitStyles';
        s.textContent = `
          .split-field{margin:14px 0;padding:12px;border:1px solid #D1FAE5;background:#F0FDF4;border-radius:14px}
          .split-field[hidden]{display:none}.split-field-label{display:block;font-size:12px;font-weight:700;color:#334155;margin-bottom:8px}
          .split-members{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.split-member{display:flex;align-items:center;gap:8px;padding:9px;border:1px solid #E2E8F0;background:#fff;border-radius:10px;cursor:pointer;font-size:12px;color:#334155}
          .split-member:hover{border-color:#10B981;background:#F8FFFC}.split-member input{accent-color:#10B981}.split-hint{font-size:10px;color:#64748B;margin-top:8px}
          .split-error{font-size:11px;color:#B91C1C;margin-top:7px;display:none}.split-error.show{display:block}
          .split-payer{width:100%;box-sizing:border-box;border:1px solid #CBD5E1;background:#fff;border-radius:10px;padding:9px 10px;font:inherit;margin-bottom:10px}
          .split-empty{font-size:12px;color:#64748B;padding:8px 0}
          @media(max-width:600px){.split-members{grid-template-columns:1fr}}
        `;
        document.head.appendChild(s);
    }

    async function getCurrentUser() { const { data, error } = await supabase.auth.getSession(); if (error) throw error; return data?.session?.user || null; }

    async function loadMembers() {
        const user = await getCurrentUser();
        if (!user) { members = []; payerId = null; selected = new Set(); return; }
        const { data: memberships, error } = await supabase.from('household_members').select('id, household_id, user_id, display_name, role, created_at').eq('user_id', user.id).order('created_at', { ascending: true });
        if (error) throw error;
        if (!memberships?.length) { members = []; payerId = null; selected = new Set(); return; }
        const membership = memberships.find(m => m.role === 'owner') || memberships[0];
        const { data: householdMembers, error: memberError } = await supabase.from('household_members').select('id, household_id, user_id, display_name, role, created_at').eq('household_id', membership.household_id).order('created_at', { ascending: true });
        if (memberError) throw memberError;
        members = householdMembers || [];
        const me = members.find(m => m.user_id === user.id);
        payerId = payerId && members.some(m => m.id === payerId) ? payerId : (me?.id || members.find(m => m.role === 'owner')?.id || members[0]?.id || null);
        selected = new Set(members.map(m => m.id));
    }

    function localCloudExpenseId() { if (!editingLocalId) return null; try { return JSON.parse(localStorage.getItem('finnest_supabase_id_map') || '{}')?.expenses?.[editingLocalId] || null; } catch (_) { return null; } }

    async function loadExistingSplit() {
        const cloudId = localCloudExpenseId(); if (!cloudId) return;
        const { data: expense, error: expenseError } = await supabase.from('expenses').select('paid_by_member_id').eq('id', cloudId).maybeSingle();
        if (expenseError) throw expenseError;
        const { data: splitRows, error: splitError } = await supabase.from('expense_splits').select('member_id').eq('expense_id', cloudId);
        if (splitError) throw splitError;
        if (splitRows?.length) selected = new Set(splitRows.map(r => r.member_id));
        if (expense?.paid_by_member_id && members.some(m => m.id === expense.paid_by_member_id)) payerId = expense.paid_by_member_id;
    }

    function ensureField() {
        const note = document.getElementById('expenseNote'); if (!note) return null;
        let field = document.getElementById('expensePayerField');
        if (!field) { field = document.createElement('div'); field.id = 'expensePayerField'; field.className = 'split-field'; note.closest('.expense-field')?.after(field); }
        return field;
    }

    function renderField() {
        const field = ensureField(); if (!field) return;
        const currentUserId = window.finnestAuthUser?.id || null;
        const memberHtml = members.length ? members.map(m => `<label class="split-member"><input type="checkbox" value="${escapeHtml(m.id)}" ${selected.has(m.id) ? 'checked' : ''}><span>${escapeHtml(m.display_name || 'Family member')}${m.user_id === currentUserId ? ' · Me' : ''}</span></label>`).join('') : '<span class="split-empty">No family members found. Add members from Family first.</span>';
        const payerHtml = members.length ? members.map(m => `<option value="${escapeHtml(m.display_name || '')}" data-member-id="${escapeHtml(m.id)}" ${payerId === m.id ? 'selected' : ''}>${escapeHtml(m.display_name || 'Family member')}${m.user_id === currentUserId ? ' · Me' : ''}</option>`).join('') : '<option value="">No family members available</option>';
        field.innerHTML = `<span class="split-field-label">👨‍👩‍👧 Who shares this expense?</span><div class="split-members">${memberHtml}</div><span class="split-field-label" style="margin-top:12px">💳 Paid by</span><select class="split-payer" id="expensePayer" aria-label="Paid by">${payerHtml}</select><div class="split-hint">All family members are selected by default for a new shared expense. You can change the selection.</div><div id="finnestSplitError" class="split-error">Select at least one family member for a shared expense.</div>`;
        field.querySelectorAll('input[type="checkbox"]').forEach(input => input.addEventListener('change', event => { if (event.target.checked) selected.add(event.target.value); else selected.delete(event.target.value); }));
        field.querySelector('#expensePayer')?.addEventListener('change', event => { payerId = event.target.selectedOptions[0]?.dataset.memberId || null; });
        updateVisibility();
    }

    function updateVisibility() { const field = document.getElementById('expensePayerField'); if (!field) return; const shared = lastExpenseType === 'shared'; field.hidden = !shared; const error = document.getElementById('finnestSplitError'); if (error && !shared) error.classList.remove('show'); }
    function uiExpenseType() { return document.querySelector('.type-option.selected')?.dataset.type || 'personal'; }
    function escapeHtml(value) { return String(value ?? '').replace(/[&<>\'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c])); }

    async function activateSharedMode() { lastExpenseType = 'shared'; const field = ensureField(); if (field) field.hidden = false; try { await loadMembers(); await loadExistingSplit(); } catch (error) { console.warn('FinNest could not load household members for shared expense', error); } renderField(); }
    async function handleTypeClick(event) { const button = event.target.closest('.type-option'); if (!button) return; if (button.dataset.type === 'shared') await activateSharedMode(); else { lastExpenseType = 'personal'; updateVisibility(); } }
    async function handlePotentialEdit(event) { const row = event.target.closest('[data-expense-id]'); if (row) { editingLocalId = Number(row.dataset.expenseId); setTimeout(async () => { if (uiExpenseType() === 'shared') await activateSharedMode(); }, 0); return; } if (event.target.closest('#desktopAddExpense,.add-expense-button,#viewAddExpense,#familyAddExpense')) { editingLocalId = null; selected = new Set(); payerId = null; lastExpenseType = 'personal'; } }

    function validateAndScheduleSync(event) {
        const shared = uiExpenseType() === 'shared'; lastExpenseType = shared ? 'shared' : 'personal'; if (!shared) return;
        if (!selected.size) { event.preventDefault(); event.stopImmediatePropagation(); document.getElementById('finnestSplitError')?.classList.add('show'); return; }
        window.setTimeout(() => syncLatestSplit(), 1200);
    }

    async function syncLatestSplit() {
        if (syncing || lastExpenseType !== 'shared' || !selected.size) return; syncing = true;
        try {
            const user = await getCurrentUser(); if (!user) return;
            const { data: rows, error: expenseError } = await supabase.from('expenses').select('id,household_id,amount,expense_type,updated_at').eq('user_id', user.id).eq('expense_type', 'shared').order('updated_at', { ascending: false }).limit(1);
            if (expenseError) throw expenseError; const expense = rows?.[0]; if (!expense?.household_id) throw new Error('Shared expense household was not found.');
            const ids = [...selected].filter(id => members.some(m => m.id === id)); if (!ids.length) throw new Error('Select at least one family member.');
            const amount = Number(expense.amount || 0), base = Math.floor((amount / ids.length) * 100) / 100;
            const rowsToInsert = ids.map((memberId, index) => ({ expense_id: expense.id, household_id: expense.household_id, member_id: memberId, share_amount: index === ids.length - 1 ? Number((amount - base * (ids.length - 1)).toFixed(2)) : Number(base.toFixed(2)) }));
            const { error: payerError } = await supabase.from('expenses').update({ paid_by_member_id: payerId }).eq('id', expense.id).eq('user_id', user.id); if (payerError) throw payerError;
            const { error: deleteError } = await supabase.from('expense_splits').delete().eq('expense_id', expense.id); if (deleteError) throw deleteError;
            const { error: insertError } = await supabase.from('expense_splits').insert(rowsToInsert); if (insertError) throw insertError;
        } catch (error) { console.warn('FinNest shared expense split sync failed', error); } finally { syncing = false; }
    }

    function resetOnClose() { document.addEventListener('click', event => { if (event.target.closest('#closeExpenseSheet,#cancelExpense')) { selected = new Set(); payerId = null; lastExpenseType = 'personal'; editingLocalId = null; } }); }
    async function init() {
        if (initialized) return; initialized = true; styles(); document.addEventListener('click', handlePotentialEdit, true); document.addEventListener('click', handleTypeClick, true); document.getElementById('saveExpense')?.addEventListener('click', validateAndScheduleSync, true); resetOnClose();
        try { await loadMembers(); renderField(); } catch (error) { console.warn('FinNest family member load failed', error); }
        document.addEventListener('finnest:authenticated', async () => { try { await loadMembers(); if (uiExpenseType() === 'shared') renderField(); } catch (error) { console.warn('FinNest family member refresh failed', error); } });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
