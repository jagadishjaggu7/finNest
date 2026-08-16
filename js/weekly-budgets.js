/* FinNest weekly budgets — category tracking with Monday-Sunday periods. */
(function () {
    const supabase = window.finnestSupabase;
    if (!supabase) return;
    const CATEGORIES = ['Food & Dining','Transport','Shopping','Bills & Utilities','Health','Entertainment','Other'];

    function money(n){return new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(Number(n||0));}
    function dateKey(d){return d.toISOString().slice(0,10);}
    function monday(d=new Date()){const x=new Date(d); const day=x.getDay(); const diff=day===0?-6:1-day; x.setDate(x.getDate()+diff); x.setHours(0,0,0,0); return x;}
    function sunday(start){const x=new Date(start);x.setDate(x.getDate()+6);return x;}
    function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

    function injectStyles(){
      if(document.getElementById('finnestWeeklyStyles'))return;
      const s=document.createElement('style');s.id='finnestWeeklyStyles';s.textContent=`
        .weekly-budget-panel{margin-top:18px;border:1px solid #E2E8F0;border-radius:18px;padding:16px;background:#fff}.weekly-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.weekly-head h3{margin:0;color:#0F172A;font-size:17px}.weekly-head p{margin:4px 0 0;color:#64748B;font-size:11px}.weekly-form{display:grid;grid-template-columns:1fr 140px auto;gap:8px;margin:14px 0}.weekly-form select,.weekly-form input{border:1px solid #CBD5E1;border-radius:10px;padding:9px 10px;font:inherit}.weekly-form button{border:0;background:#10B981;color:#fff;border-radius:10px;padding:9px 13px;font-weight:700;cursor:pointer}.weekly-list{display:grid;gap:9px}.weekly-row{border:1px solid #E2E8F0;border-radius:13px;padding:11px}.weekly-row-top{display:flex;justify-content:space-between;gap:10px}.weekly-row-name{font-weight:700;font-size:12px;color:#334155}.weekly-row-meta{font-size:11px;color:#64748B}.weekly-track{height:7px;background:#E2E8F0;border-radius:99px;overflow:hidden;margin:8px 0 4px}.weekly-fill{height:100%;background:#10B981;border-radius:99px}.weekly-fill.over{background:#EF4444}.weekly-actions{display:flex;justify-content:flex-end;gap:6px}.weekly-actions button{border:0;background:#F1F5F9;color:#475569;border-radius:8px;padding:5px 8px;font-size:10px;cursor:pointer}.weekly-empty{padding:18px;text-align:center;color:#64748B;font-size:12px;border:1px dashed #CBD5E1;border-radius:12px}
        @media(max-width:600px){.weekly-form{grid-template-columns:1fr 1fr}.weekly-form button{grid-column:1/-1}.weekly-budget-panel{padding:14px}}
      `;document.head.appendChild(s);
    }

    async function user(){const {data}=await supabase.auth.getSession();return data?.session?.user||null;}

    async function readWeek(){
      const u=await user(); if(!u)return null;
      const start=monday(); const end=sunday(start); const startKey=dateKey(start), endKey=dateKey(end);
      const [b,e]=await Promise.all([
        supabase.from('budgets').select('id,category,amount,period_start,period_type').eq('user_id',u.id).eq('period_type','weekly').eq('period_start',startKey).order('category'),
        supabase.from('expenses').select('id,category,amount,expense_date').eq('user_id',u.id).gte('expense_date',startKey).lte('expense_date',endKey)
      ]);
      const spent={};(e.data||[]).forEach(x=>{spent[x.category]=(spent[x.category]||0)+Number(x.amount||0);});
      return {start,end,budgets:b.data||[],spent};
    }

    async function saveBudget(category, amount){
      const u=await user(); if(!u)return;
      const startKey=dateKey(monday());
      const {data,error}=await supabase.from('budgets').upsert({user_id:u.id,category,amount:Number(amount),month_start:startKey,period_type:'weekly',period_start:startKey},{onConflict:'user_id,category,period_type,period_start'}).select().single();
      if(error) alert(error.message); return data;
    }

    async function deleteBudget(id){if(!confirm('Delete this weekly budget?'))return;const {error}=await supabase.from('budgets').delete().eq('id',id);if(error)alert(error.message);}

    async function render(){
      injectStyles();
      const host=document.querySelector('.budget-section')||document.querySelector('.main-content'); if(!host)return;
      let panel=document.getElementById('finnestWeeklyPanel');
      if(!panel){panel=document.createElement('section');panel.id='finnestWeeklyPanel';panel.className='weekly-budget-panel';host.appendChild(panel);}
      const data=await readWeek();
      if(!data){panel.innerHTML='<div class="weekly-empty">Sign in to use cloud weekly budgets.</div>';return;}
      const range=`${data.start.toLocaleDateString('en-IN',{day:'numeric',month:'short'})} – ${data.end.toLocaleDateString('en-IN',{day:'numeric',month:'short'})}`;
      const totalBudget=data.budgets.reduce((s,b)=>s+Number(b.amount||0),0); const totalSpent=Object.values(data.spent).reduce((s,v)=>s+v,0);
      panel.innerHTML=`<div class="weekly-head"><div><h3>📅 Weekly Budget</h3><p>${range} · ${money(totalSpent)} spent of ${money(totalBudget)}</p></div><span class="eyebrow">MON–SUN</span></div>
        <div class="weekly-form"><select id="weeklyCategory">${CATEGORIES.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}</select><input id="weeklyAmount" type="number" min="0" step="100" placeholder="₹ limit"><button id="weeklySave">Set Budget</button></div>
        <div class="weekly-list">${data.budgets.length?data.budgets.map(b=>{const spent=Number(data.spent[b.category]||0),limit=Number(b.amount||0),pct=limit?Math.min(100,(spent/limit)*100):0;return `<div class="weekly-row"><div class="weekly-row-top"><div><div class="weekly-row-name">${escapeHtml(b.category)}</div><div class="weekly-row-meta">${money(spent)} spent · ${money(Math.max(0,limit-spent))} left</div></div><strong>${money(limit)}</strong></div><div class="weekly-track"><div class="weekly-fill ${spent>limit?'over':''}" style="width:${pct}%"></div></div><div class="weekly-actions"><button data-edit-weekly="${b.id}" data-category="${escapeHtml(b.category)}" data-amount="${limit}">Edit</button><button data-delete-weekly="${b.id}">Delete</button></div></div>`}).join(''):'<div class="weekly-empty">No weekly budgets yet. Add your first category limit above.</div>'}</div>`;
      panel.querySelector('#weeklySave').onclick=async()=>{const c=panel.querySelector('#weeklyCategory').value,a=panel.querySelector('#weeklyAmount').value;if(!a||Number(a)<=0){alert('Enter a weekly budget amount.');return;}await saveBudget(c,a);await render();};
      panel.querySelectorAll('[data-edit-weekly]').forEach(btn=>btn.onclick=async()=>{const amount=prompt(`Weekly budget for ${btn.dataset.category}`,btn.dataset.amount);if(amount===null)return;if(!amount||Number(amount)<=0)return;await saveBudget(btn.dataset.category,amount);await render();});
      panel.querySelectorAll('[data-delete-weekly]').forEach(btn=>btn.onclick=async()=>{await deleteBudget(btn.dataset.deleteWeekly);await render();});
    }

    function init(){injectStyles();const observer=new MutationObserver(()=>{if(document.querySelector('.budget-section'))render();});observer.observe(document.body,{childList:true,subtree:true});document.addEventListener('finnest:authenticated',render);setTimeout(render,700);}
    document.addEventListener('DOMContentLoaded',init);
})();
