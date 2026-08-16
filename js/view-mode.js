/* FinNest — global Personal / Family view context */
(function () {
    const supabase = window.finnestSupabase;
    const KEY = 'finnest_view_mode';
    const state = { mode: localStorage.getItem(KEY) === 'family' ? 'family' : 'personal', page: 'Dashboard' };
    let familyCache = { household: null, members: [], expenses: [], budgets: [], accounts: {} };
    let originalMainHTML = null;
    let familyRendering = false;

    const money = value => '₹' + Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
    const esc = value => String(value ?? '').replace(/[&<>\"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[c]));
    const dateText = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '';
    const monthKey = d => String(d || '').slice(0, 7);
    const today = () => new Date().toISOString().slice(0,10);
    const currentMonth = () => today().slice(0,7);
    const monday = d => { const x = new Date(d); const day = x.getDay(); x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day)); x.setHours(0,0,0,0); return x; };
    const addDays = (d,n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
    const period = kind => { const start = kind === 'weekly' ? monday(new Date()) : new Date(new Date().getFullYear(), new Date().getMonth(), 1); const end = kind === 'weekly' ? addDays(start,6) : new Date(start.getFullYear(),start.getMonth()+1,0); return { start, end, startKey:start.toISOString().slice(0,10), endKey:end.toISOString().slice(0,10), label:kind === 'weekly' ? `${start.toLocaleDateString('en-IN',{day:'numeric',month:'short'})} – ${end.toLocaleDateString('en-IN',{day:'numeric',month:'short'})}` : start.toLocaleDateString('en-IN',{month:'long',year:'numeric'}) }; };

    function injectStyles() {
        if (document.getElementById('finnestViewModeStyles')) return;
        const s = document.createElement('style'); s.id = 'finnestViewModeStyles';
        s.textContent = `
            .view-switch{display:inline-flex;align-items:center;gap:3px;padding:3px;background:#F1F5F9;border:1px solid #E2E8F0;border-radius:12px;box-shadow:0 1px 2px rgba(15,23,42,.04)}
            .view-switch button{border:0;background:transparent;color:#64748B;padding:8px 12px;border-radius:9px;font:700 12px/1 inherit;cursor:pointer;white-space:nowrap;transition:.18s ease}
            .view-switch button.active{background:#fff;color:#047857;box-shadow:0 2px 7px rgba(15,23,42,.10)}
            .view-switch button:focus-visible{outline:2px solid #10B981;outline-offset:1px}
            .family-context-badge{display:inline-flex;align-items:center;gap:6px;margin-left:10px;padding:6px 9px;border-radius:999px;background:#ECFDF5;color:#047857;font-size:11px;font-weight:800}
            .family-view .page-header h1{color:#065F46}.family-view .summary-card{border-color:#D1FAE5}
            .family-view-shell{padding-bottom:70px}.family-context-strip{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:-8px 0 20px;padding:12px 14px;border:1px solid #D1FAE5;border-radius:14px;background:#F0FDF4;color:#065F46}
            .family-context-strip strong{font-size:13px}.family-context-strip span{font-size:12px;color:#047857}
            .family-view-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.family-card{background:#fff;border:1px solid #E2E8F0;border-radius:18px;padding:18px;box-shadow:0 4px 14px rgba(15,23,42,.04)}.family-card h2{margin:0 0 14px;font-size:16px;color:#0F172A}.family-card.wide{grid-column:1/-1}
            .family-stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.family-stat{background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:16px}.family-stat span{font-size:12px;color:#64748B}.family-stat strong{display:block;font-size:24px;margin-top:8px;color:#0F172A}
            .family-category-row{display:grid;grid-template-columns:160px 1fr 100px;align-items:center;gap:12px;margin:12px 0}.family-category-row .name{font-size:12px;color:#475569}.family-category-row .track{height:8px;background:#E2E8F0;border-radius:99px;overflow:hidden}.family-category-row .fill{height:100%;background:#10B981;border-radius:99px}.family-category-row .value{text-align:right;font-weight:800;font-size:12px;color:#334155}
            .family-expense-list{display:flex;flex-direction:column}.family-expense{display:grid;grid-template-columns:42px minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px 0;border-bottom:1px solid #F1F5F9}.family-expense:last-child{border-bottom:0}.family-expense-icon{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:#ECFDF5}.family-expense strong{display:block;font-size:13px;color:#0F172A}.family-expense small{display:block;color:#94A3B8;font-size:10px;margin-top:3px}.family-expense .amt{font-weight:800;color:#DC2626}.family-member-pills{display:flex;flex-wrap:wrap;gap:8px}.family-member-pill{padding:8px 10px;border:1px solid #D1FAE5;border-radius:999px;background:#F0FDF4;color:#065F46;font-size:11px;font-weight:700}
            .family-budget-toolbar{display:flex;gap:8px;margin-bottom:16px}.family-budget-toolbar button{border:1px solid #D1FAE5;background:#fff;color:#047857;border-radius:9px;padding:8px 12px;font-weight:700;cursor:pointer}.family-budget-toolbar button.active{background:#10B981;color:#fff}.family-budget-row{display:grid;grid-template-columns:minmax(0,1fr) 120px 160px;gap:12px;align-items:center;padding:13px 0;border-bottom:1px solid #F1F5F9}.family-budget-row:last-child{border-bottom:0}.family-budget-name{font-weight:700;font-size:13px}.family-budget-meta{font-size:10px;color:#94A3B8;margin-top:3px}.family-budget-bar{height:7px;background:#E2E8F0;border-radius:99px;overflow:hidden}.family-budget-fill{height:100%;background:#10B981;border-radius:99px}.family-budget-fill.over{background:#EF4444}.family-budget-amount{text-align:right;font-size:12px;font-weight:800}.family-empty-box{padding:28px;text-align:center;border:1px dashed #CBD5E1;border-radius:14px;color:#64748B;font-size:12px}
            @media(max-width:900px){.family-stat-grid{grid-template-columns:repeat(2,1fr)}.family-view-grid{grid-template-columns:1fr}.family-card.wide{grid-column:auto}}
            @media(max-width:650px){.app-header .header-actions{gap:7px}.view-switch button{padding:7px 8px;font-size:10px}.family-context-badge{display:none}.family-stat strong{font-size:20px}.family-category-row{grid-template-columns:110px 1fr 80px}.family-budget-row{grid-template-columns:1fr 90px}.family-budget-row .family-budget-bar{grid-column:1/-1}.family-budget-amount{text-align:right}}
        `;
        document.head.appendChild(s);
    }

    function mountSwitch() {
        const header = document.querySelector('.header-actions');
        if (!header || document.getElementById('finnestViewSwitch')) return;
        const wrap = document.createElement('div'); wrap.className = 'view-switch'; wrap.id = 'finnestViewSwitch'; wrap.setAttribute('role','group'); wrap.setAttribute('aria-label','Financial view');
        wrap.innerHTML = `<button data-mode="personal">👤 Personal</button><button data-mode="family">👨‍👩‍👧 Family</button>`;
        header.insertBefore(wrap, header.firstChild);
        wrap.querySelectorAll('button').forEach(btn => btn.onclick = () => setMode(btn.dataset.mode));
        updateSwitch();
    }

    function updateSwitch() {
        const wrap = document.getElementById('finnestViewSwitch'); if (!wrap) return;
        wrap.querySelectorAll('button').forEach(btn => { const active = btn.dataset.mode === state.mode; btn.classList.toggle('active',active); btn.setAttribute('aria-pressed',String(active)); });
        document.body.classList.toggle('family-view', state.mode === 'family');
    }

    async function loadFamily() {
        if (!supabase) throw new Error('Cloud connection is not available.');
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession(); if (sessionError) throw sessionError;
        const user = sessionData?.session?.user; if (!user) throw new Error('Please sign in to use Family View.');
        const { data: membership, error: memberError } = await supabase.from('household_members').select('id,household_id,display_name,role,households(id,name,owner_id)').eq('user_id',user.id).limit(1).maybeSingle();
        if (memberError) throw memberError; if (!membership?.household_id) throw new Error('Create or join a FinNest family first.');
        const household = membership.households;
        const [membersResult, expensesResult, budgetsResult] = await Promise.all([
            supabase.from('household_members').select('id,user_id,display_name,role').eq('household_id',household.id).order('created_at'),
            supabase.from('expenses').select('id,amount,category,account_id,expense_type,note,expense_date,user_id,paid_by_member_id').eq('household_id',household.id).eq('expense_type','shared').order('expense_date',{ascending:false}),
            supabase.from('budgets').select('id,category,amount,period_type,period_start,budget_scope,household_id').eq('household_id',household.id).eq('budget_scope','family').order('category')
        ]);
        for (const r of [membersResult,expensesResult,budgetsResult]) if (r.error) throw r.error;
        familyCache = { household, members:membersResult.data||[], expenses:expensesResult.data||[], budgets:budgetsResult.data||[] };
        return familyCache;
    }

    function categoryMeta(category) { const map = {'Food & Dining':'🍴','Transport':'🚗','Shopping':'🛍️','Bills & Utilities':'💡','Health':'❤️','Entertainment':'🎬','Other':'•••'}; return map[category]||'•••'; }
    function familyTotals() { const month = currentMonth(); const ex = familyCache.expenses.filter(e=>monthKey(e.expense_date)===month); const spent = ex.reduce((s,e)=>s+Number(e.amount||0),0); const budget = familyCache.budgets.filter(b=>b.period_type==='monthly' && String(b.period_start).slice(0,7)===month).reduce((s,b)=>s+Number(b.amount||0),0); return { ex, spent, budget, remaining:Math.max(0,budget-spent), pct:budget ? spent/budget*100 : 0 }; }

    function shell(title, subtitle, content) { return `<div class="family-view-shell"><section class="page-header"><div><p class="eyebrow">${esc(subtitle)}</p><h1>${esc(title)} <span class="family-context-badge">👨‍👩‍👧 ${familyCache.members.length} members</span></h1></div></section>${content}</div>`; }

    function renderFamilyDashboard() {
        const t=familyTotals(); const cats={}; t.ex.forEach(e=>cats[e.category]=(cats[e.category]||0)+Number(e.amount||0)); const max=Math.max(...Object.values(cats),1); const recent=familyCache.expenses.slice(0,6);
        const members=familyCache.members.map(m=>`<span class="family-member-pill">${esc(m.display_name)}</span>`).join('');
        const catRows=Object.entries(cats).sort((a,b)=>b[1]-a[1]).map(([c,v])=>`<div class="family-category-row"><div class="name">${esc(c)}</div><div class="track"><div class="fill" style="width:${Math.max(4,v/max*100)}%"></div></div><div class="value">${money(v)}</div></div>`).join('') || '<div class="family-empty-box">No shared expenses this month.</div>';
        const recentRows=recent.map(e=>`<div class="family-expense"><div class="family-expense-icon">${categoryMeta(e.category)}</div><div><strong>${esc(e.note||e.category)}</strong><small>${esc(e.category)} · ${dateText(e.expense_date)}</small></div><div class="amt">-${money(e.amount)}</div></div>`).join('') || '<div class="family-empty-box">No shared expenses yet.</div>';
        return shell('Family Dashboard',familyCache.household?.name||'Shared household financial picture',`<div class="family-context-strip"><div><strong>Family View is on</strong><br><span>Dashboard, expenses, reports and budgets below use shared household data.</span></div><span>${familyCache.members.length} members</span></div><section class="family-stat-grid"><div class="family-stat"><span>Shared spending</span><strong>${money(t.spent)}</strong></div><div class="family-stat"><span>Monthly family budget</span><strong>${money(t.budget)}</strong></div><div class="family-stat"><span>Budget remaining</span><strong>${money(t.remaining)}</strong></div><div class="family-stat"><span>Budget used</span><strong>${t.pct.toFixed(0)}%</strong></div></section><section class="family-view-grid" style="margin-top:16px"><article class="family-card"><h2>Shared spending by category</h2>${catRows}</article><article class="family-card"><h2>Family members</h2><div class="family-member-pills">${members||'<div class="family-empty-box">No members yet.</div>'}</div><button class="text-link" id="familyManageButton" style="margin-top:16px">Manage family →</button></article><article class="family-card wide"><h2>Recent shared transactions</h2><div class="family-expense-list">${recentRows}</div></article></section>`);
    }

    function renderFamilyExpenses() {
        const rows=familyCache.expenses.map(e=>`<div class="family-expense"><div class="family-expense-icon">${categoryMeta(e.category)}</div><div><strong>${esc(e.note||e.category)}</strong><small>${esc(e.category)} · ${dateText(e.expense_date)} · ${e.expense_type==='shared'?'Shared':''}</small></div><div class="amt">-${money(e.amount)}</div></div>`).join('')||'<div class="family-empty-box">No shared expenses yet.</div>';
        return shell('Family Expenses','All shared household expenses',`<div class="family-context-strip"><div><strong>Shared expenses only</strong><br><span>Personal expenses stay private to each member.</span></div><span>${familyCache.expenses.length} transactions</span></div><article class="family-card wide"><h2>Shared transactions</h2><div class="family-expense-list">${rows}</div></article>`);
    }

    function renderFamilyReports() {
        const t=familyTotals(); const cats={}; t.ex.forEach(e=>cats[e.category]=(cats[e.category]||0)+Number(e.amount||0)); const total=t.spent; const rows=Object.entries(cats).sort((a,b)=>b[1]-a[1]).map(([c,v])=>`<div class="family-category-row"><div class="name">${esc(c)}</div><div class="track"><div class="fill" style="width:${total?Math.max(3,v/total*100):0}%"></div></div><div class="value">${money(v)}</div></div>`).join('')||'<div class="family-empty-box">No shared spending this month.</div>';
        return shell('Family Reports','This month’s shared household picture',`<section class="family-stat-grid"><div class="family-stat"><span>Shared expenses</span><strong>${money(t.spent)}</strong></div><div class="family-stat"><span>Transactions</span><strong>${t.ex.length}</strong></div><div class="family-stat"><span>Family budget</span><strong>${money(t.budget)}</strong></div><div class="family-stat"><span>Budget used</span><strong>${t.pct.toFixed(0)}%</strong></div></section><article class="family-card wide" style="margin-top:16px"><h2>Spending by category</h2>${rows}</article>`);
    }

    function renderFamilyBudgets(periodType='monthly') {
        const p=period(periodType); const budgets=familyCache.budgets.filter(b=>b.period_type===periodType && String(b.period_start)===p.startKey); const spent={}; familyCache.expenses.filter(e=>e.expense_date>=p.startKey&&e.expense_date<=p.endKey).forEach(e=>spent[e.category]=(spent[e.category]||0)+Number(e.amount||0));
        const rows=budgets.map(b=>{const limit=Number(b.amount||0), used=Number(spent[b.category]||0), pct=limit?Math.min(100,used/limit*100):0, over=used>limit; return `<div class="family-budget-row"><div><div class="family-budget-name">${esc(b.category)}</div><div class="family-budget-meta">${money(used)} spent · ${over?'Over budget':money(Math.max(0,limit-used))+' remaining'}</div></div><div class="family-budget-amount">${money(used)} / ${money(limit)}</div><div class="family-budget-bar"><div class="family-budget-fill ${over?'over':''}" style="width:${pct}%"></div></div></div>`}).join('')||'<div class="family-empty-box">No family budgets for this period. Add one from Budgets while Family View is active.</div>';
        return shell('Family Budgets','Shared household budgets',`<article class="family-card wide"><div class="family-budget-toolbar"><button class="${periodType==='monthly'?'active':''}" data-family-period="monthly">Monthly</button><button class="${periodType==='weekly'?'active':''}" data-family-period="weekly">Weekly</button></div><div class="family-context-strip"><span>Family budget</span><strong>${p.label}</strong></div>${rows}</article>`);
    }

    function renderPage() {
        if (state.mode !== 'family') return;
        const main=document.querySelector('.main-content'); if(!main) return;
        familyRendering=true;
        const content=state.page==='Expenses'?renderFamilyExpenses():state.page==='Reports'?renderFamilyReports():state.page==='Budgets'?renderFamilyBudgets(window._finnestFamilyBudgetPeriod||'monthly'):renderFamilyDashboard();
        main.innerHTML=content;
        familyRendering=false;
        main.querySelector('#familyManageButton')?.addEventListener('click',()=>window.FinNestFamily?.open());
        main.querySelectorAll('[data-family-period]').forEach(b=>b.onclick=()=>{window._finnestFamilyBudgetPeriod=b.dataset.familyPeriod;renderPage();});
    }

    async function setMode(mode) {
        if (mode === state.mode) return;
        if (mode === 'family') {
            try { await loadFamily(); } catch(e) { alert(e.message||'Family View is unavailable.'); state.mode='personal'; updateSwitch(); return; }
            state.mode='family'; localStorage.setItem(KEY,'family'); updateSwitch(); renderPage();
        } else {
            state.mode='personal'; localStorage.setItem(KEY,'personal'); location.reload();
        }
    }

    function interceptNavigation() {
        document.addEventListener('click', async event => {
            if (state.mode !== 'family' || familyRendering) return;
            const nav=event.target.closest('.nav-item,.mobile-nav-item'); if(!nav) return;
            const label=nav.querySelector('small,span:last-child')?.textContent?.trim();
            if (!label || ['Home','Dashboard','Expenses','Budgets','Reports'].indexOf(label)<0) return;
            event.preventDefault(); event.stopImmediatePropagation();
            state.page=label==='Home'?'Dashboard':label;
            if (state.page==='Budgets') window._finnestFamilyBudgetPeriod=window._finnestFamilyBudgetPeriod||'monthly';
            try { await loadFamily(); renderPage(); } catch(e) { alert(e.message||'Could not load Family View.'); }
        }, true);
    }

    async function boot() {
        injectStyles(); mountSwitch(); interceptNavigation();
        if (state.mode !== 'family') return;
        try { await loadFamily(); renderPage(); } catch(e) { localStorage.setItem(KEY,'personal'); state.mode='personal'; updateSwitch(); }
    }

    window.FinNestViewMode = { get:()=>state.mode, set:setMode, refresh:async()=>{if(state.mode==='family'){await loadFamily();renderPage();}} };
    document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,700));
})();
