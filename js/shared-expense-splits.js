/* FinNest shared-expense UI.
   Directly binds the static expense-sheet controls. No MutationObserver/polling. */
(function () {
    const supabase = window.finnestSupabase;
    if (!supabase) return;

    let members = [];
    let selectedMemberIds = new Set();
    let payerId = null;
    let initialized = false;

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>\'\"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
    }

    function addStyles() {
        if (document.getElementById('finnestSharedStyles')) return;
        const style = document.createElement('style');
        style.id = 'finnestSharedStyles';
        style.textContent = `
            #expensePayerField{display:none!important;margin:12px 0;padding:12px;border:1px solid #D1FAE5;background:#F0FDF4;border-radius:14px}
            #expensePayerField.shared-visible{display:block!important}
            #expensePayerField label{display:block;margin:0 0 7px;font-size:12px;font-weight:700;color:#334155}
            #expensePayer{display:block!important;width:100%;min-height:44px;padding:10px 12px;border:1px solid #CBD5E1;border-radius:10px;background:#fff;color:#334155;font:inherit;cursor:pointer;box-sizing:border-box}
            .shared-members{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:12px}
            .shared-member{display:flex!important;align-items:center;gap:7px;padding:9px;border:1px solid #E2E8F0;border-radius:10px;background:#fff;font-size:12px;cursor:pointer}
            .shared-member input{accent-color:#10B981}.shared-member:hover{border-color:#10B981}
            .shared-help{margin-top:7px;font-size:10px;color:#64748B}
            @media(max-width:600px){.shared-members{grid-template-columns:1fr}}
        `;
        document.head.appendChild(style);
    }

    async function getUser() {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        return data?.user || null;
    }

    async function loadMembers() {
        const user = await getUser();
        if (!user) { members = []; selectedMemberIds = new Set(); payerId = null; return; }

        const { data: mine, error: mineError } = await supabase
            .from('household_members')
            .select('id,household_id,user_id,display_name,role,created_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: true });
        if (mineError) throw mineError;

        const membership = (mine || []).find(m => m.role === 'owner') || (mine || [])[0];
        if (!membership) { members = []; selectedMemberIds = new Set(); payerId = null; return; }

        const { data, error } = await supabase
            .from('household_members')
            .select('id,household_id,user_id,display_name,role,created_at')
            .eq('household_id', membership.household_id)
            .order('created_at', { ascending: true });
        if (error) throw error;

        members = data || [];
        const me = members.find(m => m.user_id === user.id) || members[0];
        payerId = me?.id || null;
        selectedMemberIds = new Set(members.map(m => m.id));
        window.finnestAuthUser = user;
    }

    function setTypeSelection(type) {
        document.querySelectorAll('.type-option').forEach(option => {
            option.classList.toggle('selected', option.dataset.type === type);
            option.setAttribute('aria-pressed', option.dataset.type === type ? 'true' : 'false');
        });
    }

    function ensureField() {
        const existing = document.getElementById('expensePayerField');
        if (existing) return existing;

        // The type container has changed across prototype versions. Prefer the
        // dedicated wrapper, but fall back to the actual Personal/Shared button.
        const typeField = document.querySelector('.expense-type-toggle')?.closest('.expense-field')
            || document.querySelector('.type-option')?.closest('.expense-field')
            || document.querySelector('.type-option')?.parentElement?.closest('.expense-field')
            || document.querySelector('.type-option')?.parentElement;

        if (!typeField) return null;

        const field = document.createElement('div');
        field.className = 'expense-field';
        field.id = 'expensePayerField';
        typeField.insertAdjacentElement('afterend', field);
        return field;
    }

    function renderField() {
        const field = ensureField();
        if (!field) return;

        const userId = window.finnestAuthUser?.id;
        const membersHtml = members.length
            ? `<label>Who shares this expense?</label><div class="shared-members">${members.map(m => `<label class="shared-member"><input type="checkbox" value="${escapeHtml(m.id)}" ${selectedMemberIds.has(m.id) ? 'checked' : ''}> <span>${escapeHtml(m.display_name || 'Family member')}${m.user_id === userId ? ' · Me' : ''}</span></label>`).join('')}</div>`
            : `<div class="shared-help">No family members are available yet. Add members from Family.</div>`;

        const payerHtml = members.length
            ? `<label for="expensePayer">Paid by</label><select id="expensePayer" aria-label="Paid by">${members.map(m => `<option value="${escapeHtml(m.id)}" ${payerId === m.id ? 'selected' : ''}>${escapeHtml(m.display_name || 'Family member')}${m.user_id === userId ? ' · Me' : ''}</option>`).join('')}</select>`
            : `<label for="expensePayer">Paid by</label><select id="expensePayer"><option value="">No family members available</option></select>`;

        field.innerHTML = `${membersHtml}${payerHtml}<div class="shared-help">All members are selected by default. Change the payer if someone else paid.</div>`;

        field.querySelectorAll('.shared-member input').forEach(input => input.addEventListener('change', e => {
            if (e.target.checked) selectedMemberIds.add(e.target.value);
            else selectedMemberIds.delete(e.target.value);
        }));

        field.querySelector('#expensePayer')?.addEventListener('change', e => {
            payerId = e.target.value || null;
        });
    }

    function showForType(type) {
        const field = ensureField();
        if (!field) return;

        if (type === 'shared') {
            setTypeSelection('shared');
            renderField();
            field.classList.add('shared-visible');
        } else {
            setTypeSelection('personal');
            field.classList.remove('shared-visible');
        }
    }

    function currentType() {
        return document.querySelector('.type-option.selected')?.dataset.type || 'personal';
    }

    async function onTypeClick(event) {
        const type = event.currentTarget.dataset.type || 'personal';
        setTypeSelection(type);

        if (type !== 'shared') {
            showForType('personal');
            return;
        }

        // Render immediately with the current household state. Then refresh the
        // members from Supabase and render again when they are available.
        showForType('shared');
        try {
            await loadMembers();
            showForType('shared');
        } catch (error) {
            console.warn('FinNest could not load family members', error);
            renderField();
            const field = document.getElementById('expensePayerField');
            field?.classList.add('shared-visible');
        }
    }

    function resetForNewExpense() {
        selectedMemberIds = new Set(members.map(m => m.id));
        const me = members.find(m => m.user_id === window.finnestAuthUser?.id) || members[0];
        payerId = me?.id || null;
        const field = document.getElementById('expensePayerField');
        if (field) field.classList.remove('shared-visible');
        setTypeSelection('personal');
    }

    function bindSave() {
        const button = document.getElementById('saveExpense');
        if (!button || button.dataset.sharedBound === '1') return;
        button.dataset.sharedBound = '1';
        button.addEventListener('click', () => {
            if (currentType() !== 'shared') return;
            setTimeout(() => syncNewestSharedExpense(), 900);
        });
    }

    async function syncNewestSharedExpense() {
        try {
            const user = await getUser();
            if (!user || currentType() !== 'shared' || !selectedMemberIds.size) return;
            const { data: rows, error } = await supabase.from('expenses')
                .select('id,household_id,amount,expense_type,expense_date,updated_at')
                .eq('user_id', user.id).eq('expense_type', 'shared')
                .order('updated_at', { ascending: false }).limit(1);
            if (error) throw error;
            const expense = rows?.[0];
            if (!expense?.id || !expense.household_id) return;
            if (payerId) {
                const { error: payerError } = await supabase.from('expenses').update({ paid_by_member_id: payerId }).eq('id', expense.id).eq('user_id', user.id);
                if (payerError) throw payerError;
            }
            const memberIds = [...selectedMemberIds].filter(id => members.some(m => m.id === id));
            if (!memberIds.length) return;
            const { error: deleteError } = await supabase.from('expense_splits').delete().eq('expense_id', expense.id);
            if (deleteError) throw deleteError;
            const amount = Number(expense.amount || 0);
            const base = Math.floor((amount / memberIds.length) * 100) / 100;
            const splitRows = memberIds.map((memberId, index) => ({
                expense_id: expense.id,
                household_id: expense.household_id,
                member_id: memberId,
                share_amount: index === memberIds.length - 1 ? Number((amount - base * (memberIds.length - 1)).toFixed(2)) : Number(base.toFixed(2))
            }));
            const { error: splitError } = await supabase.from('expense_splits').insert(splitRows);
            if (splitError) throw splitError;
        } catch (error) {
            console.warn('FinNest shared payer sync failed', error);
        }
    }

    async function init() {
        if (initialized) return;
        initialized = true;
        addStyles();
        ensureField();
        bindSave();

        document.querySelectorAll('.type-option').forEach(option => option.addEventListener('click', onTypeClick));
        document.getElementById('desktopAddExpense')?.addEventListener('click', resetForNewExpense);
        document.querySelector('.add-expense-button')?.addEventListener('click', resetForNewExpense);
        document.getElementById('familyAddExpense')?.addEventListener('click', resetForNewExpense);

        try {
            await loadMembers();
            renderField();
        } catch (error) {
            console.warn('FinNest family members unavailable', error);
            renderField();
        }

        document.addEventListener('finnest:authenticated', async () => {
            try {
                await loadMembers();
                renderField();
                if (currentType() === 'shared') showForType('shared');
            } catch (error) {
                console.warn('FinNest family refresh failed', error);
            }
        });
    }

    window.FinNestSharedExpense = {
        reload: async () => { await loadMembers(); renderField(); },
        showForType,
        getPayerId: () => payerId
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
