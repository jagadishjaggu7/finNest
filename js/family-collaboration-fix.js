/* FinNest family collaboration fix.
   Keeps shared transactions household-wide while personal data remains private.
   Also normalizes payer IDs to member names and enforces creator-only edit/delete. */
(function () {
    const supabase = window.finnestSupabase;
    if (!supabase) return;

    let context = { user: null, householdId: null, members: [] };
    let initialized = false;
    let originalOpenExpenseSheet = null;
    let originalSaveExpenseFromForm = null;
    let originalOpenEditExpense = null;
    let originalRenderFamilyView = null;

    function localSnapshot() {
        try {
            localStorage.setItem(STORAGE_KEYS.expenses, JSON.stringify(expenses));
            localStorage.setItem(STORAGE_KEYS.familyPayers, JSON.stringify(familyPayers));
        } catch (error) {
            console.warn('FinNest family local snapshot failed', error);
        }
    }

    function loadIdMap() {
        try { return JSON.parse(localStorage.getItem('finnest_supabase_id_map') || '{}'); }
        catch (_) { return { expenses: {}, incomes: {} }; }
    }

    function saveIdMap(map) {
        localStorage.setItem('finnest_supabase_id_map', JSON.stringify(map));
    }

    function nextLocalId(map) {
        let id = Date.now();
        const used = new Set(Object.keys(map.expenses || {}).map(Number));
        while (used.has(id)) id += 1;
        return id;
    }

    async function loadContext() {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        const user = sessionData?.session?.user;
        if (!user) return null;

        const { data: membership, error: membershipError } = await supabase
            .from('household_members')
            .select('household_id')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle();
        if (membershipError) throw membershipError;
        if (!membership?.household_id) return { user, householdId: null, members: [] };

        const { data: members, error: membersError } = await supabase
            .from('household_members')
            .select('id,user_id,display_name,role,created_at')
            .eq('household_id', membership.household_id)
            .order('created_at', { ascending: true });
        if (membersError) throw membersError;

        context = { user, householdId: membership.household_id, members: members || [] };
        window.FinNestFamilyContext = context;
        return context;
    }

    function memberName(memberId) {
        return context.members.find(m => m.id === memberId)?.display_name || '';
    }

    function memberByName(name) {
        return context.members.find(m => m.display_name === name) || null;
    }

    async function hydrateSharedTransactions() {
        const ctx = await loadContext();
        if (!ctx?.householdId) return;

        const { data: rows, error } = await supabase
            .from('expenses')
            .select('id,user_id,household_id,paid_by_member_id,amount,category,account_id,expense_type,note,expense_date')
            .eq('household_id', ctx.householdId)
            .eq('expense_type', 'shared')
            .order('expense_date', { ascending: false });
        if (error) throw error;

        const map = loadIdMap();
        map.expenses = map.expenses || {};
        const byCloudId = new Map(Object.entries(map.expenses).map(([localId, cloudId]) => [cloudId, Number(localId)]));
        const cloudIds = new Set();

        for (const row of rows || []) {
            cloudIds.add(row.id);
            let localId = byCloudId.get(row.id);
            if (!localId) {
                localId = nextLocalId(map);
                map.expenses[localId] = row.id;
                byCloudId.set(row.id, localId);
            }

            let local = expenses.find(e => e.id === localId);
            if (!local) {
                local = { id: localId, amount: 0, category: 'Other', account: 'Other', type: 'shared', note: '', date: todayString() };
                expenses.push(local);
            }

            Object.assign(local, {
                amount: Number(row.amount || 0),
                category: row.category || 'Other',
                type: 'shared',
                note: row.note || '',
                date: row.expense_date || todayString(),
                paidByMemberId: row.paid_by_member_id || null,
                householdId: row.household_id || null,
                ownerUserId: row.user_id || null,
                cloudId: row.id
            });

            const payer = memberName(row.paid_by_member_id);
            if (payer) familyPayers[localId] = payer;
            else if (familyPayers[localId] && !memberByName(familyPayers[localId])) delete familyPayers[localId];
        }

        // Remove stale household-shared rows that were deleted in Supabase.
        // Keep locally created rows that have not received a cloud id yet.
        expenses = expenses.filter(e => {
            if (e.type !== 'shared' || e.householdId !== ctx.householdId) return true;
            return !e.cloudId || cloudIds.has(e.cloudId);
        });

        saveIdMap(map);
        localSnapshot();
        window.dispatchEvent(new CustomEvent('finnest:family-data-ready'));

        if (typeof renderDashboard === 'function') renderDashboard();
        if (typeof currentView !== 'undefined' && currentView === 'Family' && typeof renderFamilyView === 'function') renderFamilyView();
        if (typeof currentView !== 'undefined' && currentView === 'Expenses' && typeof renderExpensesView === 'function') renderExpensesView();
    }

    function selectedPayerId() {
        return window.FinNestSharedExpense?.getPayerId?.()
            || document.getElementById('expensePayer')?.value
            || null;
    }

    function selectedPayerName(payerId) {
        return memberName(payerId) || context.user?.id === payerId ? 'Me' : '';
    }

    function enforcePayerDisplay(expense) {
        const select = document.getElementById('expensePayer');
        if (!select || !expense?.paidByMemberId) return;
        select.value = expense.paidByMemberId;
        if (window.FinNestSharedExpense?.showForType && expense.type === 'shared') {
            window.FinNestSharedExpense.showForType('shared');
            setTimeout(() => {
                const refreshed = document.getElementById('expensePayer');
                if (refreshed) refreshed.value = expense.paidByMemberId;
            }, 0);
        }
    }

    function installExpenseWrappers() {
        if (initialized) return;
        initialized = true;

        originalOpenExpenseSheet = openExpenseSheet;
        openExpenseSheet = function (mode = 'add', expense = null) {
            originalOpenExpenseSheet(mode, expense);
            const type = expense?.type || document.querySelector('.type-option.selected')?.dataset.type || 'personal';
            if (type === 'shared') {
                window.FinNestSharedExpense?.showForType?.('shared');
                if (expense?.paidByMemberId) enforcePayerDisplay(expense);
            } else {
                window.FinNestSharedExpense?.showForType?.('personal');
            }
        };

        originalSaveExpenseFromForm = saveExpenseFromForm;
        saveExpenseFromForm = function () {
            const type = document.querySelector('.type-option.selected')?.dataset.type || 'personal';
            const payerId = type === 'shared' ? selectedPayerId() : null;
            const beforeIds = new Set(expenses.map(e => e.id));
            const editingId = editingExpenseId;

            originalSaveExpenseFromForm();

            if (type !== 'shared') return;

            const target = editingId
                ? expenses.find(e => e.id === editingId)
                : expenses.find(e => !beforeIds.has(e.id));
            if (!target) return;

            target.type = 'shared';
            target.paidByMemberId = payerId || context.members.find(m => m.user_id === context.user?.id)?.id || null;
            target.householdId = context.householdId || null;
            target.ownerUserId = context.user?.id || null;
            const payerName = memberName(target.paidByMemberId);
            if (payerName) familyPayers[target.id] = payerName;
            else delete familyPayers[target.id];

            localSnapshot();
            setTimeout(() => {
                window.FinNestCloud?.syncAll?.();
                hydrateSharedTransactions().catch(error => console.warn('FinNest shared transaction refresh failed', error));
            }, 800);
        };

        originalOpenEditExpense = openEditExpense;
        openEditExpense = function (id) {
            const expense = expenses.find(e => e.id === id);
            if (expense?.type === 'shared' && expense.ownerUserId && expense.ownerUserId !== context.user?.id) {
                alert('Only the member who created this shared expense can edit or delete it.');
                return;
            }
            originalOpenEditExpense(id);
        };

        originalRenderFamilyView = renderFamilyView;
        renderFamilyView = function () {
            originalRenderFamilyView();
            setTimeout(() => hydrateSharedTransactions().catch(() => {}), 0);
        };
    }

    async function initialize() {
        installExpenseWrappers();
        try {
            await hydrateSharedTransactions();
        } catch (error) {
            console.warn('FinNest household shared transactions could not be loaded', error);
        }
    }

    document.addEventListener('DOMContentLoaded', () => setTimeout(initialize, 50), { once: true });
    document.addEventListener('finnest:authenticated', () => setTimeout(initialize, 100));
    document.addEventListener('finnest:cloud-data-ready', () => setTimeout(() => hydrateSharedTransactions().catch(() => {}), 50));

    window.FinNestFamilyCollaboration = {
        refresh: hydrateSharedTransactions,
        getContext: () => context
    };
})();
