/* FinNest Settings — cloud-backed family names using shared runtime context. */
(function () {
    const supabase = window.finnestSupabase;
    if (!supabase) return;

    const esc = value => String(value ?? '').replace(/[&<>\"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[c]));

    async function getContext() {
        if (window.FinNestContext) return window.FinNestContext.load();
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        const user = sessionData?.session?.user;
        return { user: user || null, members: [], household: null, householdId: null };
    }

    function styles() {
        if (document.getElementById('finnestSettingsCloudStyles')) return;
        const style = document.createElement('style');
        style.id = 'finnestSettingsCloudStyles';
        style.textContent = `
            .settings-page{display:grid;gap:18px}
            .settings-page-title{margin:0;color:#0F172A;font-size:30px;line-height:1.2;letter-spacing:-.03em}
            .settings-page-sub{margin:6px 0 0;color:#94A3B8;font-size:13px}
            .settings-card{background:#fff;border:1px solid #E2E8F0;border-radius:18px;padding:22px;box-shadow:0 4px 12px rgba(15,23,42,.03)}
            .settings-card h2{margin:0 0 6px;color:#0F172A;font-size:18px}.settings-card p{margin:0;color:#64748B;font-size:13px;line-height:1.5}
            .cloud-family-list{display:flex;flex-direction:column;gap:10px;margin-top:16px}
            .cloud-family-row{display:grid;grid-template-columns:38px minmax(0,1fr) auto;gap:10px;align-items:center;padding:12px;border:1px solid #E2E8F0;border-radius:14px;background:#fff}
            .cloud-family-avatar{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:#ECFDF5;color:#047857;font-size:11px;font-weight:800}
            .cloud-family-main{min-width:0}.cloud-family-role{display:block;margin-top:4px;color:#94A3B8;font-size:10px}
            .cloud-family-row input{width:100%;box-sizing:border-box;padding:10px 11px;border:1px solid #CBD5E1;border-radius:10px;background:#fff;font:500 13px Inter,system-ui,sans-serif;color:#334155}
            .cloud-family-row input:focus{outline:none;border-color:#10B981;box-shadow:0 0 0 3px rgba(16,185,129,.10)}
            .cloud-family-save{border:0;background:#10B981;color:#fff;border-radius:10px;padding:10px 14px;font:700 12px Inter,system-ui,sans-serif;cursor:pointer;box-shadow:0 1px 2px rgba(15,23,42,.08)}
            .cloud-family-save:hover{background:#059669}.cloud-family-save:disabled{opacity:.55;cursor:wait}
            .cloud-family-empty{padding:16px;border:1px dashed #CBD5E1;border-radius:12px;color:#64748B;font-size:12px;background:#F8FAFC}
            .settings-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}
            .finnest-secondary-button{display:inline-flex;align-items:center;justify-content:center;padding:10px 14px;border:1px solid #CBD5E1;border-radius:10px;background:#fff;color:#334155;font:600 12px Inter,system-ui,sans-serif;cursor:pointer;text-decoration:none}
            .finnest-secondary-button:hover{border-color:#94A3B8;background:#F8FAFC}.file-label{position:relative;overflow:hidden}.file-label input{position:absolute;inset:0;opacity:0;cursor:pointer}
            .settings-danger{border-color:#FECACA}.settings-danger h2{color:#991B1B}.settings-danger .delete-expense-button{margin-top:14px}
            @media(max-width:600px){.cloud-family-row{grid-template-columns:34px minmax(0,1fr)}.cloud-family-save{grid-column:2;justify-self:start}.settings-card{padding:18px}.settings-page-title{font-size:27px}}
        `;
        document.head.appendChild(style);
    }

    function initials(name) {
        const parts = String(name || 'Member').trim().split(/\s+/).filter(Boolean);
        return (parts.slice(0, 2).map(x => x[0]).join('') || 'M').toUpperCase();
    }

    async function saveMember(member, value, button, user, context) {
        button.disabled = true;
        button.textContent = 'Saving…';
        try {
            if (!context.householdId) throw new Error('No active family household is available.');
            const { error: memberError } = await supabase
                .from('household_members')
                .update({ display_name: value })
                .eq('id', member.id)
                .eq('household_id', context.householdId);
            if (memberError) throw memberError;

            if (member.user_id === user.id) {
                const { error: profileError } = await supabase
                    .from('profiles')
                    .upsert({ id: user.id, display_name: value, currency: context.profile?.currency || 'INR (₹)' }, { onConflict: 'id' });
                if (profileError) throw profileError;
                const { error: authError } = await supabase.auth.updateUser({ data: { display_name: value } });
                if (authError) throw authError;
                localStorage.setItem('finnest_profile', JSON.stringify({ name: value, email: user.email || '', currency: context.profile?.currency || 'INR (₹)' }));
            }

            const names = context.members.map(m => m.id === member.id ? value : (m.display_name || 'Member'));
            localStorage.setItem('finnest_family_members', JSON.stringify(names));
            await window.FinNestContext?.refresh?.();
            window.dispatchEvent(new CustomEvent('finnest:family-members-changed'));
            window.dispatchEvent(new CustomEvent('finnest:profile-changed', { detail: { name: value } }));
            alert('Family member updated.');
        } catch (error) {
            alert(error?.message || 'Unable to update family member.');
        } finally {
            button.disabled = false;
            button.textContent = 'Save';
        }
    }

    async function renderSettingsViewCloud() {
        styles();
        const container = typeof getDynamicView === 'function' ? getDynamicView() : document.getElementById('dynamicView');
        if (!container) return;
        container.innerHTML = `<div class="settings-page"><div><p class="eyebrow">Account & family settings</p><h1 class="settings-page-title">Settings</h1><p class="settings-page-sub">Manage household names, backups and local browser data.</p></div><div class="settings-card"><h2>Family members</h2><p>Names are stored in your FinNest household and are used across shared expenses, budgets and reports.</p><div id="cloudFamilyMembers" class="cloud-family-list"><div class="cloud-family-empty">Loading family members…</div></div></div><div class="settings-card"><h2>Backup</h2><p>Download your local FinNest data as JSON and restore it later.</p><div class="settings-actions"><button class="finnest-secondary-button" id="exportJson" type="button">Export JSON</button><label class="finnest-secondary-button file-label">Import JSON<input id="importJson" type="file" accept="application/json" hidden></label></div></div><div class="settings-card settings-danger"><h2>Local cache</h2><p>Reset only the browser prototype cache. This does not delete your Supabase account or household.</p><button class="delete-expense-button" id="resetData" type="button">Reset Local Cache</button></div></div>`;

        const host = container.querySelector('#cloudFamilyMembers');
        try {
            const context = await getContext();
            if (!context.user) {
                host.innerHTML = '<div class="cloud-family-empty">Sign in to manage your family members.</div>';
                return;
            }
            localStorage.setItem('finnest_family_members', JSON.stringify(context.members.map(m => m.display_name || 'Member')));
            if (!context.members.length || !context.householdId) {
                host.innerHTML = '<div class="cloud-family-empty">No family household is linked to this account yet. Open Family to create or join one.</div>';
            } else {
                host.innerHTML = context.members.map(member => `<div class="cloud-family-row"><div class="cloud-family-avatar">${esc(initials(member.display_name))}</div><div class="cloud-family-main"><input value="${esc(member.display_name || '')}" data-member-id="${esc(member.id)}"><span class="cloud-family-role">${member.user_id === context.user.id ? 'You' : (member.role === 'owner' ? 'Owner' : 'Family member')}</span></div><button class="cloud-family-save" data-save-member="${esc(member.id)}" type="button">Save</button></div>`).join('');
                host.querySelectorAll('[data-save-member]').forEach(button => button.onclick = async () => {
                    const member = context.members.find(m => m.id === button.dataset.saveMember);
                    const input = host.querySelector(`[data-member-id="${button.dataset.saveMember}"]`);
                    const value = input?.value.trim();
                    if (!member || !value) return alert('Member name cannot be empty.');
                    await saveMember(member, value, button, context.user, context);
                    input.value = value;
                    const avatar = button.parentElement.querySelector('.cloud-family-avatar');
                    if (avatar) avatar.textContent = initials(value);
                });
            }
        } catch (error) {
            host.innerHTML = `<div class="cloud-family-empty">Unable to load family members: ${esc(error?.message || 'Unknown error')}</div>`;
        }

        container.querySelector('#exportJson').onclick = typeof exportJson === 'function' ? exportJson : null;
        container.querySelector('#importJson').onchange = typeof importJson === 'function' ? importJson : null;
        container.querySelector('#resetData').onclick = typeof resetData === 'function' ? resetData : null;
    }

    window.renderSettingsView = renderSettingsViewCloud;
    document.addEventListener('finnest:family-members-changed', () => {
        if (typeof currentView !== 'undefined' && currentView === 'Settings') renderSettingsViewCloud();
    });
})();
