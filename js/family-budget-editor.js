/* FinNest family budget editor — adds budget creation to Family > Budgets. */
(function () {
    const supabase = window.finnestSupabase;
    if (!supabase) return;

    let observer = null;
    let busy = false;

    const money = n => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
    const esc = v => String(v ?? '').replace(/[&<>\"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[c]));
    const categories = ['Food & Dining','Transport','Shopping','Bills & Utilities','Health','Entertainment','Other'];

    function periodInfo(period) {
        const now = new Date();
        if (period === 'weekly') {
            const start = new Date(now); const day = start.getDay();
            start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day)); start.setHours(0,0,0,0);
            return { startKey: start.toISOString().slice(0,10), periodType: 'weekly' };
        }
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        return { startKey: start.toISOString().slice(0,10), periodType: 'monthly' };
    }

    async function household() {
        const { data: sessionData } = await supabase.auth.getSession();
        const user = sessionData?.session?.user;
        if (!user) throw new Error('Please sign in first.');
        const { data, error } = await supabase.from('household_members').select('household_id').eq('user_id', user.id).limit(1).maybeSingle();
        if (error) throw error;
        if (!data?.household_id) throw new Error('Create or join a family first.');
        return { user, householdId: data.household_id };
    }

    async function saveBudget(category, amount, period) {
        const { user, householdId } = await household();
        const info = periodInfo(period);
        const { data: existing, error: lookupError } = await supabase.from('budgets')
            .select('id')
            .eq('household_id', householdId)
            .eq('budget_scope', 'family')
            .eq('period_type', info.periodType)
            .eq('period_start', info.startKey)
            .eq('category', category)
            .limit(1).maybeSingle();
        if (lookupError) throw lookupError;

        const row = {
            user_id: user.id,
            category,
            amount: Number(amount),
            month_start: info.startKey,
            period_type: info.periodType,
            period_start: info.startKey,
            budget_scope: 'family',
            household_id: householdId
        };

        if (existing?.id) {
            const { error } = await supabase.from('budgets').update({ amount: Number(amount) }).eq('id', existing.id);
            if (error) throw error;
        } else {
            const { error } = await supabase.from('budgets').insert(row);
            if (error) throw error;
        }
    }

    function addEditor() {
        if (busy || localStorage.getItem('finnest_view_mode') !== 'family') return;
        const main = document.querySelector('.main-content');
        if (!main || !/Family Budgets/.test(main.textContent || '')) return;
        const card = main.querySelector('.family-card.wide');
        if (!card || card.querySelector('#familyBudgetEditor')) return;

        const toolbar = card.querySelector('.family-budget-toolbar');
        const period = toolbar?.querySelector('.active')?.dataset.familyPeriod || 'monthly';
        const editor = document.createElement('div');
        editor.id = 'familyBudgetEditor';
        editor.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) 150px auto;gap:10px;margin:0 0 16px;padding:12px;border:1px solid #D1FAE5;background:#F0FDF4;border-radius:12px';
        editor.innerHTML = `<select id="familyBudgetCategory">${categories.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select><input id="familyBudgetAmount" type="number" min="0" step="100" placeholder="₹ limit"><button id="familyBudgetSave" class="finnest-primary-button">+ Set Budget</button>`;
        toolbar?.insertAdjacentElement('afterend', editor) || card.prepend(editor);

        editor.querySelector('#familyBudgetSave').onclick = async () => {
            const category = editor.querySelector('#familyBudgetCategory').value;
            const amount = Number(editor.querySelector('#familyBudgetAmount').value);
            if (!amount || amount <= 0) return alert('Enter a valid family budget amount.');
            busy = true;
            const button = editor.querySelector('#familyBudgetSave'); button.disabled = true; button.textContent = 'Saving…';
            try {
                await saveBudget(category, amount, period);
                await window.FinNestViewMode?.refresh();
            } catch (error) {
                alert(error?.message || 'Unable to save family budget.');
            } finally {
                busy = false;
            }
        };
    }

    function syncNav() {
        const main = document.querySelector('.main-content');
        if (!main || localStorage.getItem('finnest_view_mode') !== 'family') return;
        let page = 'Dashboard';
        const heading = main.querySelector('h1')?.textContent || '';
        if (/Family Expenses/.test(heading)) page = 'Expenses';
        else if (/Family Budgets/.test(heading)) page = 'Budgets';
        else if (/Family Reports/.test(heading)) page = 'Reports';
        document.querySelectorAll('.nav-item').forEach(item => {
            const label = item.querySelector('span:last-child')?.textContent?.trim();
            item.classList.toggle('active', label === page);
        });
    }

    function observe() {
        if (observer) return;
        observer = new MutationObserver(() => {
            addEditor();
            syncNav();
        });
        const main = document.querySelector('.main-content');
        if (main) observer.observe(main, { childList: true, subtree: true });
        setTimeout(() => { addEditor(); syncNav(); }, 50);
    }

    document.addEventListener('DOMContentLoaded', observe);
    document.addEventListener('finnest:authenticated', () => setTimeout(observe, 100));
})();
