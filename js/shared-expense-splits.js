/* FinNest shared expenses: default all household members, preserve edits, and persist payer/splits. */
(function () {
    const supabase = window.finnestSupabase;
    if (!supabase) return;

    let members = [];
    let selected = new Set();
    let payerId = null;
    let lastExpenseType = 'personal';
    let editingLocalId = null;
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
          .split-payer{width:100%;box-sizing:border-box;border:1px solid #CBD5E1;background:#fff;border-radius:10px;padding:9px 10px;font:inherit;margin-bottom:10px}
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
            .eq('user_id', user.id).order('created_at', { ascending: true });
        if (error || !data?.length) { members = []; return; }
        const householdId = data[0].household_id;
        const result = await supabase.from('household_members')
            .select('id, household_id, user_id, display_name, role, created_at')
            .eq('household_id', householdId).order('created_at', { ascending: true });
        members = result.data || data;
        payerId = members.find(m => m.user_id === user.id)?.id || members.find(m => m.role === 'owner')?.id || members[0]?.id || null;
        selected = new Set(members.map(m => m.id));
    }

    function localCloudExpenseId() {
        if (!editingLocalId) return null;
        try { return JSON.parse(localStorage.getItem('finnest_supabase_id_map') || '{}')?.expenses?.[editingLocalId] || null; }
        catch (_) { return null; }
    }

    async function loadExistingSplit() {
        const cloudId = localCloudExpenseId();
        if (!cloudId) return;
        const { data: expense, error: expenseError } = await supabase.from('expenses').select('paid_by_member_id').eq('id', cloudId).maybeSingle();
        if (expenseError) throw expenseError;
        const { data: splitRows, error: splitError } = await supabase.from('expense_splits').select('member_id').eq('expense_id', cloudId);
        if (splitError) throw splitError;
        if (splitRows?.length) selected = new Set(splitRows.map(r => r.member_id));
        if (expense?.paid_by_member_id && members.some(m => m.id === expense.paid_by_member_id)) payerId = expense.paid_by_member_id;
    }

    function renderField() {
        const note = document.getElementById('expenseNote');
        if (!note) return;
        let field = document.getElementById('finnestSplitField');
        if (!field) {
            field = document.createElement('div'); field.id = 'finnestSplitField'; field.className = 'split-field';
            note.closest('.expense-field')?.after(field);
        }
        field.innerHTML = `
          <span class="split-field-label">👨‍👩‍👧 Who shares this expense?</span>
          <div class="split-members">${members.map(m => `<label class="split-member"><input type="checkbox" value="${m.id}" ${selected.has(m.id) ? 'checked' : ''}> <span>${escapeHtml(m.display_name)}${m.role === 'owner' ? ' · Owner' : ''}</span></label>`).join('') || '<span class="split-hint">No family members found yet. Invite people from Family first.</span>'}</div>
          <span class="split-field-label" style="margin-top:12px">💳 Paid by</span>
          <select class="split-payer" id="finnestSplitPayer">${members.map(m => `<option value="${m.id}" ${payerId === m.id ? 'selected' : ''}>${escapeHtml(m.display_name)}${m.user_id === currentUserId() ? ' · Me' : ''}</option>`).join('')}</select>
          <div class="split-hint">All family members are selected by default for a new shared expense. Edit mode keeps the saved split.</div>
          <div id="finnestSplitError" class="split-error">Select at least one family member for a shared expense.</div>`;
        field.querySelectorAll('input[type=checkbox]').forEach(input => input.addEventListener('change', e => { if(e.target.checked) selected.add(e.target.value); else selected.delete(e.target.value); }));
        field.querySelector('#finnestSplitPayer')?.addEventListener('change', e => payerId=e.target.value);
        updateVisibility();
    }

    function currentUserId() { return window.finnestAuthUser?.id || null; }
    function uiExpenseType() { return document.querySelector('.type-option.selected')?.dataset.type || 'personal'; }
    function updateVisibility(){const field=document.getElementById('finnestSplitField');if(!field)return;const shared=lastExpenseType==='shared';field.hidden=!shared;const error=document.getElementById('finnestSplitError');if(error&&!shared)error.classList.remove('show');}
    function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

    async function syncLatestSplit(){
        if(syncing||lastExpenseType!=='shared'||!selected.size)return;
        syncing=true;
        try{
            const {data:sessionData}=await supabase.auth.getSession();
            const user=sessionData?.session?.user;
            if(!user)return;
            const {data:expenses,error:expenseError}=await supabase.from('expenses').select('id,household_id,amount,expense_type,updated_at').eq('user_id',user.id).eq('expense_type','shared').order('updated_at',{ascending:false}).limit(1);
            if(expenseError)throw expenseError;
            const expense=expenses?.[0];
            if(!expense?.household_id)throw new Error('Shared expense household was not found.');
            const ids=[...selected].filter(id=>members.some(m=>m.id===id));
            if(!ids.length)throw new Error('Select at least one family member.');
            const amount=Number(expense.amount||0),base=Math.floor((amount/ids.length)*100)/100;
            const rows=ids.map((memberId,index)=>({expense_id:expense.id,household_id:expense.household_id,member_id:memberId,share_amount:index===ids.length-1?Number((amount-base*(ids.length-1)).toFixed(2)):Number(base.toFixed(2))}));
            const {error:payerError}=await supabase.from('expenses').update({paid_by_member_id:payerId}).eq('id',expense.id);
            if(payerError)throw payerError;
            const {error:deleteError}=await supabase.from('expense_splits').delete().eq('expense_id',expense.id);
            if(deleteError)throw deleteError;
            const {error:insertError}=await supabase.from('expense_splits').insert(rows);
            if(insertError)throw insertError;
        }catch(error){console.warn('FinNest shared expense split sync failed',error);}
        finally{syncing=false;}
    }

    async function activateSharedMode(){
        lastExpenseType = 'shared';
        await loadMembers();
        try { await loadExistingSplit(); } catch(error) { console.warn('FinNest existing split could not be loaded',error); }
        renderField();
    }

    function hookTypeButtons(){document.querySelectorAll('.type-option').forEach(btn=>{if(btn.dataset.splitHooked)return;btn.dataset.splitHooked='1';btn.addEventListener('click',async()=>{if(btn.dataset.type==='shared')await activateSharedMode();else{lastExpenseType='personal';updateVisibility();}});});}
    function hookSave(){const save=document.getElementById('saveExpense');if(!save||save.dataset.splitHooked)return;save.dataset.splitHooked='1';save.addEventListener('click',e=>{const shared=uiExpenseType()==='shared';lastExpenseType=shared?'shared':'personal';if(!shared)return;if(!selected.size){e.preventDefault();e.stopImmediatePropagation();document.getElementById('finnestSplitError')?.classList.add('show');return;}setTimeout(syncLatestSplit,900);},true);}
    function resetOnSheetClose(){document.addEventListener('click',e=>{if(e.target.closest('#closeExpenseSheet,#cancelExpense')){selected=new Set();payerId=null;lastExpenseType='personal';editingLocalId=null;}});}
    function captureExpenseContext(){document.addEventListener('click',e=>{const row=e.target.closest('[data-expense-id]');if(row){editingLocalId=Number(row.dataset.expenseId);return;}if(e.target.closest('#desktopAddExpense,.add-expense-button,#viewAddExpense,#familyAddExpense'))editingLocalId=null;},true);}
    function observeTypeChanges(){const sheet=document.getElementById('expenseSheet');if(!sheet)return;new MutationObserver(async()=>{if(!sheet.classList.contains('open'))return;const type=uiExpenseType();if(type==='shared'&&lastExpenseType!=='shared')await activateSharedMode();else if(type==='personal'){lastExpenseType='personal';updateVisibility();}}).observe(sheet,{attributes:true,subtree:true,attributeFilter:['class']});}

    async function init(){styles();await loadMembers();const observer=new MutationObserver(()=>{hookTypeButtons();hookSave();if(document.querySelector('.expense-sheet')&&!document.getElementById('finnestSplitField'))renderField();});observer.observe(document.body,{childList:true,subtree:true});hookTypeButtons();hookSave();renderField();resetOnSheetClose();captureExpenseContext();observeTypeChanges();document.addEventListener('finnest:authenticated',async()=>{await loadMembers();renderField();});}
    document.addEventListener('DOMContentLoaded',init);
})();
