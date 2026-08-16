/* FinNest stabilization fixes — deliberately isolated from the core app.
   This layer fixes persistence/UI issues without rewriting app.js. */
(function () {
    const supabase = window.finnestSupabase;
    const esc = value => String(value ?? '').replace(/[&<>\"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[c]));
    const money = value => '₹' + Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

    function currentUser() {
        return supabase?.auth.getSession().then(({ data }) => data?.session?.user || null);
    }

    async function loadFamilyPayers() {
        if (!supabase) return;
        const user = await currentUser();
        if (!user) {
            if (typeof familyMembers !== 'undefined') familyMembers = [];
            return;
        }
        const { data: members } = await supabase.from('household_members')
            .select('id,user_id,display_name,role,household_id,created_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: true })
            .limit(1);
        const householdId = members?.[0]?.household_id;
        if (!householdId) {
            if (typeof familyMembers !== 'undefined') familyMembers = [user.user_metadata?.display_name || user.email?.split('@')[0] || 'Me'];
            refreshPayerField();
            return;
        }
        const { data: householdMembers } = await supabase.from('household_members')
            .select('id,user_id,display_name,role,created_at')
            .eq('household_id', householdId)
            .order('created_at', { ascending: true });
        const names = (householdMembers || []).map(m => m.display_name).filter(Boolean);
        if (typeof familyMembers !== 'undefined') familyMembers = names.length ? names : [user.user_metadata?.display_name || 'Me'];
        try { localStorage.setItem('finnest_family_members', JSON.stringify(familyMembers)); } catch (_) {}
        refreshPayerField();
    }

    function refreshPayerField() {
        const select = document.getElementById('expensePayer');
        if (!select) return;
        const previous = select.value;
        const names = (typeof familyMembers !== 'undefined' && Array.isArray(familyMembers) ? familyMembers : []).filter(Boolean);
        const finalNames = names.length ? names : ['Me'];
        select.innerHTML = finalNames.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('');
        if (finalNames.includes(previous)) select.value = previous;
    }

    async function patchPaidByCloud() {
        if (!supabase) return;
        const localMapRaw = localStorage.getItem('finnest_supabase_id_map');
        if (!localMapRaw) return;
        let map;
        try { map = JSON.parse(localMapRaw); } catch (_) { return; }
        const user = await currentUser();
        if (!user || typeof familyPayers === 'undefined') return;
        const payerByName = {};
        const { data: membership } = await supabase.from('household_members').select('household_id').eq('user_id', user.id).limit(1).maybeSingle();
        if (!membership?.household_id) return;
        const { data: members } = await supabase.from('household_members').select('id,display_name,user_id').eq('household_id', membership.household_id);
        (members || []).forEach(m => { payerByName[m.display_name] = m.id; });
        for (const [localId, payerName] of Object.entries(familyPayers)) {
            const expenseId = map?.expenses?.[localId];
            const memberId = payerByName[payerName];
            if (!expenseId || !memberId) continue;
            await supabase.from('expenses').update({ paid_by_member_id: memberId, household_id: membership.household_id, expense_type: 'shared' }).eq('id', expenseId).eq('user_id', user.id);
        }
    }

    function installPayerFix() {
        refreshPayerField();
        loadFamilyPayers().catch(() => refreshPayerField());
        const save = document.getElementById('saveExpense');
        if (save && !save.dataset.payerCloudFix) {
            save.dataset.payerCloudFix = '1';
            save.addEventListener('click', () => setTimeout(patchPaidByCloud, 900));
        }
    }

    function injectAccountStyles() {
        if (document.getElementById('finnestAccountFixStyles')) return;
        const style = document.createElement('style');
        style.id = 'finnestAccountFixStyles';
        style.textContent = `
            .finnest-account-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
            .finnest-account-card{position:relative;background:#fff;border:1px solid #E2E8F0;border-radius:18px;padding:20px;min-height:112px;box-shadow:0 4px 14px rgba(15,23,42,.04);overflow:hidden}
            .finnest-account-card .account-icon{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:#ECFDF5;color:#047857;font-size:18px;margin-bottom:14px}
            .finnest-account-card .account-name{display:block;color:#64748B;font-size:12px;margin-bottom:5px}
            .finnest-account-card .account-value{display:block;color:#0F172A;font-size:24px;font-weight:800;line-height:1.15}
            .finnest-account-card .account-count{display:block;color:#94A3B8;font-size:11px;margin-top:6px}
            .finnest-account-card .account-accent{position:absolute;right:-25px;top:-25px;width:90px;height:90px;border-radius:50%;background:#F0FDF4}
            @media(max-width:700px){.finnest-account-grid{grid-template-columns:1fr}}
            .finnest-income-history{margin-top:20px}.finnest-income-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:14px;padding:13px 0;border-bottom:1px solid #F1F5F9}.finnest-income-row:last-child{border-bottom:0}.finnest-income-source{font-weight:700;color:#0F172A;font-size:13px}.finnest-income-date{display:block;color:#94A3B8;font-size:11px;margin-top:3px}.finnest-income-amount{font-weight:800;color:#047857;font-size:13px}.finnest-income-edit{border:1px solid #D1FAE5;background:#fff;color:#047857;border-radius:9px;padding:7px 10px;font-weight:700;cursor:pointer;font-size:11px}
        `;
        document.head.appendChild(style);
    }

    function renderAccountsFixed() {
        const container = typeof getDynamicView === 'function' ? getDynamicView() : document.getElementById('finnestDynamicView');
        if (!container) return;
        const names = ['Cash', 'UPI', 'Bank Account', 'Credit Card'];
        const icons = { Cash:'💵', UPI:'📱', 'Bank Account':'🏦', 'Credit Card':'💳' };
        const totals = Object.fromEntries(names.map(n => [n, 0]));
        const counts = Object.fromEntries(names.map(n => [n, 0]));
        (typeof expenses !== 'undefined' ? expenses : []).forEach(e => { const n = e.account || 'Other'; if (!(n in totals)) { totals[n] = 0; counts[n] = 0; } totals[n] += Number(e.amount || 0); counts[n] += 1; });
        container.innerHTML = `<div class="view-heading"><div><p class="eyebrow">Payment sources</p><h1>Accounts</h1><p class="muted" style="margin-top:6px">See how much spending is coming from each payment source.</p></div><button class="finnest-secondary-button" id="accountExport">Export CSV</button></div><div class="finnest-account-grid">${Object.keys(totals).map(name => `<article class="finnest-account-card"><div class="account-accent"></div><div class="account-icon">${icons[name] || '💳'}</div><span class="account-name">${esc(name)}</span><strong class="account-value">${money(totals[name])}</strong><span class="account-count">${counts[name]} transaction${counts[name] === 1 ? '' : 's'}</span></article>`).join('')}</div>`;
        container.querySelector('#accountExport')?.addEventListener('click', () => window.exportCsv?.());
    }

    function incomeModal(income) {
        const existing = document.getElementById('finnestIncomeEditModal');
        existing?.remove();
        const backdrop = document.createElement('div');
        backdrop.id = 'finnestIncomeEditModal';
        backdrop.className = 'finnest-modal-backdrop';
        backdrop.innerHTML = `<div class="finnest-modal"><div class="sheet-header"><div><p class="eyebrow">FinNest</p><h2>Edit Income</h2></div><button class="sheet-close" id="closeIncomeEdit">×</button></div><div class="expense-field"><label>Amount</label><div class="amount-input-wrapper"><span>₹</span><input id="editIncomeAmount" type="number" min="0" step="0.01" value="${Number(income.amount || 0)}"></div></div><div class="expense-field"><label>Source</label><input id="editIncomeSource" value="${esc(income.source || '')}"></div><div class="expense-field"><label>Date</label><input id="editIncomeDate" type="date" value="${esc(income.date || '')}"></div><div class="expense-actions"><button class="cancel-expense" id="cancelIncomeEdit">Cancel</button><button class="save-expense" id="saveIncomeEdit">Save Changes</button></div></div>`;
        document.body.appendChild(backdrop); document.body.style.overflow = 'hidden';
        const close = () => { backdrop.remove(); document.body.style.overflow = ''; };
        backdrop.querySelector('#closeIncomeEdit').onclick = close; backdrop.querySelector('#cancelIncomeEdit').onclick = close;
        backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
        backdrop.querySelector('#saveIncomeEdit').onclick = () => {
            const amount = Number(backdrop.querySelector('#editIncomeAmount').value);
            if (!amount || amount <= 0) return alert('Enter a valid income amount.');
            const target = incomes.find(i => String(i.id) === String(income.id));
            if (!target) return alert('Income record is no longer available.');
            target.amount = amount; target.source = backdrop.querySelector('#editIncomeSource').value.trim() || 'Other income'; target.date = backdrop.querySelector('#editIncomeDate').value || target.date;
            persistState(); close(); renderDashboard(); ensureIncomeHistory();
        };
    }

    function ensureIncomeHistory() {
        injectAccountStyles();
        const main = document.querySelector('.main-content');
        const budgetSection = document.querySelector('.budget-section');
        if (!main || !budgetSection) return;
        let section = document.getElementById('finnestIncomeHistory');
        if (!section) { section = document.createElement('section'); section.id = 'finnestIncomeHistory'; section.className = 'dashboard-card finnest-income-history'; budgetSection.insertAdjacentElement('afterend', section); }
        const list = (typeof incomes !== 'undefined' ? [...incomes] : []).sort((a,b) => String(b.date).localeCompare(String(a.date))).slice(0, 10);
        section.innerHTML = `<div class="card-header"><h2>Income History</h2><span class="muted">Edit any income entry</span></div>${list.length ? list.map(i => `<div class="finnest-income-row"><div><span class="finnest-income-source">${esc(i.source || 'Other income')}</span><span class="finnest-income-date">${esc(typeof formatDate === 'function' ? formatDate(i.date) : i.date)}</span></div><strong class="finnest-income-amount">+${money(i.amount)}</strong><button class="finnest-income-edit" data-edit-income="${esc(i.id)}">Edit</button></div>`).join('') : '<div class="empty-state">No income records yet.</div>`;
        section.querySelectorAll('[data-edit-income]').forEach(btn => btn.onclick = () => { const item = incomes.find(i => String(i.id) === String(btn.dataset.editIncome)); if (item) incomeModal(item); });
    }

    function installIncomeFix() {
        ensureIncomeHistory();
        // IMPORTANT: do not observe the entire subtree here. ensureIncomeHistory()
        // rewrites section.innerHTML, which itself creates mutations. Observing
        // that subtree caused an infinite MutationObserver/render loop and froze
        // the browser UI (including right-click/DevTools responsiveness).
        const main = document.querySelector('.main-content');
        if (!main) return;
        const observer = new MutationObserver(() => {
            if (document.querySelector('.budget-section') && !document.getElementById('finnestIncomeHistory')) {
                ensureIncomeHistory();
            }
        });
        observer.observe(main, { childList: true });
    }

    function installProfileFix() {
        const button = document.querySelector('.profile-button');
        if (!button || button.dataset.profileFixInstalled) return;
        button.dataset.profileFixInstalled = '1';
        document.addEventListener('click', async event => {
            if (!event.target.closest('.profile-button')) return;
            event.preventDefault(); event.stopImmediatePropagation();
            const user = await currentUser();
            if (!user) { window.FinNestAuth?.open('signin'); return; }
            let name = user.user_metadata?.display_name || '';
            let email = user.email || '';
            if (supabase) {
                const { data } = await supabase.from('profiles').select('display_name,currency').eq('id', user.id).maybeSingle();
                name = data?.display_name || name || email.split('@')[0] || 'User';
            }
            const backdrop = document.createElement('div'); backdrop.className='finnest-header-backdrop'; backdrop.id='finnestStableProfile';
            backdrop.innerHTML=`<div class="finnest-header-popover"><div class="finnest-popover-head"><div><p class="eyebrow">FinNest</p><h2>Profile</h2></div><button class="finnest-popover-close">×</button></div><div class="finnest-profile-field"><label>Name</label><input id="stableProfileName" value="${esc(name)}" maxlength="60"></div><div class="finnest-profile-field"><label>Email</label><input value="${esc(email)}" disabled></div><div class="finnest-popover-actions"><button class="finnest-cancel">Cancel</button><button class="finnest-save">Save Profile</button></div></div>`;
            document.body.appendChild(backdrop); document.body.style.overflow='hidden';
            const close=()=>{backdrop.remove();document.body.style.overflow='';};
            backdrop.querySelector('.finnest-popover-close').onclick=close; backdrop.querySelector('.finnest-cancel').onclick=close;
            backdrop.addEventListener('click',e=>{if(e.target===backdrop)close();});
            backdrop.querySelector('.finnest-save').onclick=async()=>{
                const newName=backdrop.querySelector('#stableProfileName').value.trim(); if(!newName)return alert('Please enter your name.');
                const saveBtn=backdrop.querySelector('.finnest-save'); saveBtn.disabled=true; saveBtn.textContent='Saving…';
                try {
                    const { error } = await supabase.from('profiles').upsert({ id:user.id, display_name:newName, currency:'INR (₹)' }, { onConflict:'id' }); if(error) throw error;
                    await supabase.auth.updateUser({ data:{ display_name:newName } }).catch(()=>{});
                    localStorage.setItem('finnest_profile',JSON.stringify({name:newName,email,currency:'INR (₹)'}));
                    const heading=document.querySelector('.page-header h1'); if(heading && !document.body.classList.contains('family-view')) heading.textContent=`Good evening, ${newName} 👋`;
                    button.textContent=newName.charAt(0).toUpperCase(); close();
                } catch(error) { alert(error?.message || 'Unable to save profile.'); }
                finally { saveBtn.disabled=false; saveBtn.textContent='Save Profile'; }
            };
        }, true);
    }

    function preventSignedOutIdentity() {
        currentUser().then(user => {
            if (user) return;
            const button=document.querySelector('.profile-button'); if(button) button.textContent='G';
            const heading=document.querySelector('.page-header h1'); if(heading) heading.textContent='Welcome to FinNest 👋';
        }).catch(()=>{});
    }

    function installFamilyViewButton() {
        if (typeof window.FinNestFamily === 'undefined') return;
        const original = window.renderFamilyView;
        if (!original || original.__stabilized) return;
        const fixed = function () {
            original();
            const container=getDynamicView?.();
            if(!container) return;
            const heading=container.querySelector('.view-heading');
            if(heading && !container.querySelector('#manageFamilyMembers')) {
                const btn=document.createElement('button'); btn.id='manageFamilyMembers'; btn.className='finnest-primary-button'; btn.textContent='Manage Family'; btn.onclick=()=>window.FinNestFamily.open(); heading.appendChild(btn);
            }
        };
        fixed.__stabilized=true; window.renderFamilyView=fixed;
    }

    function boot() {
        installPayerFix(); installProfileFix(); preventSignedOutIdentity(); installIncomeFix(); installFamilyViewButton();
        injectAccountStyles();
        window.renderAccountsView = renderAccountsFixed;
        document.addEventListener('finnest:cloud-data-ready', () => { loadFamilyPayers().catch(()=>{}); ensureIncomeHistory(); });
        document.addEventListener('finnest:family-members-changed', () => loadFamilyPayers().catch(()=>{}));
        document.addEventListener('finnest:authenticated', () => { loadFamilyPayers().catch(()=>{}); preventSignedOutIdentity(); });
        setTimeout(() => { installPayerFix(); installProfileFix(); preventSignedOutIdentity(); ensureIncomeHistory(); installFamilyViewButton(); }, 900);
    }

    document.addEventListener('DOMContentLoaded', boot, { once:true });
})();
