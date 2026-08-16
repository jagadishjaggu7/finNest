/* FinNest Settings — render household member names from Supabase instead of demo defaults. */
(function () {
    const supabase = window.finnestSupabase;
    if (!supabase) return;

    const esc = value => String(value ?? '').replace(/[&<>\"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[c]));

    async function getContext() {
        const { data: sessionData } = await supabase.auth.getSession();
        const user = sessionData?.session?.user;
        if (!user) return { user: null, members: [], household: null };

        const { data: membership, error: membershipError } = await supabase
            .from('household_members')
            .select('id,household_id,user_id,display_name,role,created_at,households(id,name,owner_id)')
            .eq('user_id', user.id)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();
        if (membershipError) throw membershipError;
        if (!membership?.household_id) return { user, members: [], household: null };

        const { data: members, error: membersError } = await supabase
            .from('household_members')
            .select('id,user_id,display_name,role,created_at')
            .eq('household_id', membership.household_id)
            .order('created_at', { ascending: true });
        if (membersError) throw membersError;

        return { user, members: members || [], household: membership.households || null };
    }

    function styles() {
        if (document.getElementById('finnestSettingsCloudStyles')) return;
        const style = document.createElement('style');
        style.id = 'finnestSettingsCloudStyles';
        style.textContent = `
            .cloud-family-list{display:flex;flex-direction:column;gap:10px;margin-top:14px}
            .cloud-family-row{display:grid;grid-template-columns:38px minmax(0,1fr) auto;gap:10px;align-items:center;padding:12px;border:1px solid #E2E8F0;border-radius:14px;background:#fff}
            .cloud-family-avatar{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:#ECFDF5;color:#047857;font-size:11px;font-weight:800}
            .cloud-family-main{min-width:0}.cloud-family-role{display:block;margin-top:4px;color:#94A3B8;font-size:10px}
            .cloud-family-row input{width:100%;box-sizing:border-box;padding:10px 11px;border:1px solid #CBD5E1;border-radius:10px;background:#fff;font:500 13px Inter,system-ui,sans-serif;color:#334155}
            .cloud-family-row input:focus{outline:none;border-color:#10B981;box-shadow:0 0 0 3px rgba(16,185,129,.10)}
            .cloud-family-save{border:0;background:#10B981;color:#fff;border-radius:10px;padding:10px 14px;font:700 12px Inter,system-ui,sans-serif;cursor:pointer;box-shadow:0 1px 2px rgba(15,23,42,.08)}
            .cloud-family-save:hover{background:#059669}.cloud-family-save:disabled{opacity:.55;cursor:wait}
            .cloud-family-empty{padding:16px;border:1px dashed #CBD5E1;border-radius:12px;color:#64748B;font-size:12px;background:#F8FAFC}
            @media(max-width:600px){.cloud-family-row{grid-template-columns:34px minmax(0,1fr)}.cloud-family-save{grid-column:2;justify-self:start}}
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
            const { error } = await supabase.from('household_members').update({ display_name: value }).eq('id', member.id);
            if (error) throw error;

            if (member.user_id === user.id) {
                const { error: profileError } = await supabase.from('profiles').update({ display_name: value }).eq('id', user.id);
                if (profileError) throw profileError;
                localStorage.setItem('finnest_profile', JSON.stringify({ name: value, email: user.email || '', currency: 'INR (₹)' }));
            }

            const names = context.members.map(m => m.id === member.id ? value : (m.display_name || 'Member'));
            localStorage.setItem('finnest_family_members', JSON.stringify(names));
            window.dispatchEvent(new CustomEvent('finnest:family-members-changed'));
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
        const container = typeof getDynamicView === 'function' ? getDynamicView() : document.getElementById('finnestDynamicView');
        if (!container) return;
        container.innerHTML = `<div class="view-heading"><div><p class="eyebrow">Account & family settings</p><h1>Settings</h1></div></div><div class="settings-grid"><div class="dashboard-card"><h2>Family members</h2><p class="muted">Names are stored in your FinNest household and are used across shared expenses, budgets and reports.</p><div id="cloudFamilyMembers" class="cloud-family-list"><div class="cloud-family-empty">Loading family members…</div></div></div><div class="dashboard-card"><h2>Backup</h2><p class="muted">Download your local FinNest data as JSON and restore it later.</p><div class="settings-actions"><button class="finnest-secondary-button" id="exportJson">Export JSON</button><label class="finnest-secondary-button file-label">Import JSON<input id="importJson" type="file" accept="application/json" hidden></label></div></div><div class="dashboard-card danger-card"><h2>Local cache</h2><p class="muted">Reset only the browser prototype cache. This does not delete your Supabase account or household.</p><button class="delete-expense-button" id="resetData">Reset Local Cache</button></div></div>`;

        const host = container.querySelector('#cloudFamilyMembers');
        try {
            const context = await getContext();
            if (!context.user) {
                host.innerHTML = '<div class="cloud-family-empty">Sign in to manage your family members.</div>';
                return;
            }
            localStorage.setItem('finnest_family_members', JSON.stringify(context.members.map(m => m.display_name || 'Member')));
            if (!context.members.length) {
                host.innerHTML = '<div class="cloud-family-empty">No family household is linked to this account yet. Open Family to create or join one.</div>';
            } else {
                host.innerHTML = context.members.map(member => `<div class="cloud-family-row"><div class="cloud-family-avatar">${esc(initials(member.display_name))}</div><div class="cloud-family-main"><input value="${esc(member.display_name || '')}" data-member-id="${esc(member.id)}"><span class="cloud-family-role">${member.user_id === context.user.id ? 'You' : (member.role === 'owner' ? 'Owner' : 'Family member')}</span></div><button class="cloud-family-save" data-save-member="${esc(member.id)}">Save</button></div>`).join('');
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
