/* FinNest Family — household members + secure invite links */
(function () {
    const supabase = window.finnestSupabase;
    if (!supabase) return;

    let currentUser = null;
    let familyState = { household: null, members: [], invites: [] };

    function injectStyles() {
        if (document.getElementById('finnestFamilyStyles')) return;
        const style = document.createElement('style');
        style.id = 'finnestFamilyStyles';
        style.textContent = `
            .family-backdrop{position:fixed;inset:0;z-index:4500;background:rgba(15,23,42,.48);display:flex;align-items:center;justify-content:center;padding:16px}
            .family-modal{width:min(720px,100%);max-height:min(820px,92vh);overflow:auto;background:#fff;border:1px solid #E2E8F0;border-radius:24px;box-shadow:0 28px 80px rgba(15,23,42,.22);padding:24px}
            .family-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:20px}.family-head h2{margin:2px 0 4px;color:#0F172A;font-size:26px}.family-sub{margin:0;color:#64748B;font-size:13px}
            .family-close{border:0;background:#F1F5F9;color:#475569;width:38px;height:38px;border-radius:50%;font-size:22px;cursor:pointer}
            .family-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}.family-count{font-size:12px;color:#64748B}.family-primary{border:0;background:#10B981;color:#fff;border-radius:11px;padding:10px 14px;font-weight:700;cursor:pointer}.family-primary:disabled{opacity:.55;cursor:wait}
            .family-members{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.family-member{display:flex;align-items:center;gap:12px;border:1px solid #E2E8F0;border-radius:15px;padding:12px;background:#fff}.family-avatar{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:#ECFDF5;color:#047857;font-weight:800}.family-member-info{min-width:0;flex:1}.family-member-name{font-weight:700;color:#0F172A;font-size:14px}.family-member-role{font-size:11px;color:#64748B;margin-top:2px}.family-remove{border:0;background:transparent;color:#94A3B8;cursor:pointer;font-size:16px}.family-remove:hover{color:#DC2626}
            .family-section-title{font-size:13px;font-weight:800;color:#334155;margin:22px 0 10px}.family-invite{border:1px solid #D1FAE5;background:#F0FDF4;border-radius:16px;padding:14px}.family-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px}.family-field label{display:block;font-size:11px;color:#64748B;margin-bottom:5px}.family-field input{width:100%;box-sizing:border-box;padding:10px 11px;border:1px solid #CBD5E1;border-radius:10px;font:inherit;background:#fff}.family-invite-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.family-secondary{border:1px solid #CBD5E1;background:#fff;color:#334155;border-radius:10px;padding:9px 12px;font-weight:700;cursor:pointer}.family-message{margin-top:10px;font-size:12px;color:#047857;display:none}.family-message.error{color:#B91C1C;display:block}.family-message.success{display:block}.family-empty{border:1px dashed #CBD5E1;border-radius:15px;padding:24px;text-align:center;color:#64748B;font-size:13px}
            .family-invites{display:flex;flex-direction:column;gap:8px}.family-invite-row{display:flex;align-items:center;gap:10px;border:1px solid #E2E8F0;border-radius:12px;padding:10px}.family-invite-row>div:first-child{flex:1;min-width:0}.family-invite-name{font-weight:700;font-size:12px;color:#334155}.family-invite-meta{font-size:10px;color:#94A3B8;margin-top:2px}.family-revoke{border:0;background:#FEF2F2;color:#B91C1C;border-radius:8px;padding:7px 9px;font-size:11px;font-weight:700;cursor:pointer}
            .family-share{margin-top:12px;background:#fff;border:1px solid #A7F3D0;border-radius:12px;padding:12px}.family-share-url{font-size:11px;color:#475569;word-break:break-all;background:#F8FAFC;border-radius:8px;padding:9px}.family-share-actions{display:flex;gap:8px;margin-top:9px}
            @media(max-width:600px){.family-backdrop{align-items:flex-end}.family-modal{max-height:94vh;border-radius:24px 24px 14px 14px;padding:18px}.family-members{grid-template-columns:1fr}.family-fields{grid-template-columns:1fr}.family-head h2{font-size:23px}}
        `;
        document.head.appendChild(style);
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
    }

    function initials(name) {
        const parts = String(name || 'Member').trim().split(/\s+/).filter(Boolean);
        return (parts.slice(0, 2).map(x => x[0]).join('') || 'M').toUpperCase();
    }

    async function getHousehold() {
        const { data: memberships, error } = await supabase
            .from('household_members')
            .select('id, household_id, user_id, display_name, role, created_at, households(id,name,owner_id)')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: true });
        if (error) throw error;
        const owned = (memberships || []).find(m => m.households?.owner_id === currentUser.id);
        return owned?.households || memberships?.[0]?.households || null;
    }

    async function loadState() {
        familyState.household = await getHousehold();
        if (!familyState.household) throw new Error('No FinNest family was found for this account.');

        const [membersResult, invitesResult] = await Promise.all([
            supabase.from('household_members').select('id,user_id,display_name,role,created_at').eq('household_id', familyState.household.id).order('created_at', { ascending: true }),
            supabase.from('household_invites').select('id,invited_name,invited_contact,expires_at,accepted_at,created_at').eq('household_id', familyState.household.id).is('accepted_at', null).order('created_at', { ascending: false })
        ]);
        if (membersResult.error) throw membersResult.error;
        if (invitesResult.error) throw invitesResult.error;
        familyState.members = membersResult.data || [];
        familyState.invites = (invitesResult.data || []).filter(x => new Date(x.expires_at) > new Date());
    }

    function buildModal() {
        const existing = document.getElementById('finnestFamilyBackdrop');
        if (existing) existing.remove();
        const backdrop = document.createElement('div');
        backdrop.id = 'finnestFamilyBackdrop';
        backdrop.className = 'family-backdrop';
        backdrop.innerHTML = `
            <div class="family-modal" role="dialog" aria-modal="true" aria-labelledby="familyTitle">
                <div class="family-head"><div><p class="eyebrow">FinNest Family</p><h2 id="familyTitle">Your household</h2><p class="family-sub" id="familyName"></p></div><button class="family-close" id="familyClose" aria-label="Close">×</button></div>
                <div class="family-toolbar"><span class="family-count" id="familyCount"></span><button class="family-primary" id="familyInviteTop">+ Invite member</button></div>
                <div class="family-members" id="familyMembers"></div>
                <div class="family-section-title">Invite someone</div>
                <div class="family-invite">
                    <div class="family-fields">
                        <div class="family-field"><label>Name (optional)</label><input id="familyInviteName" placeholder="e.g. Mom"></div>
                        <div class="family-field"><label>Email or phone (optional)</label><input id="familyInviteContact" placeholder="For your reference"></div>
                    </div>
                    <div class="family-invite-actions"><button class="family-primary" id="familyCreateInvite">Generate invite link</button><button class="family-secondary" id="familyContacts">Select from contacts</button></div>
                    <div class="family-message" id="familyMessage"></div>
                    <div id="familyShareArea"></div>
                </div>
                <div class="family-section-title" id="pendingTitle">Pending invitations</div>
                <div class="family-invites" id="familyInvites"></div>
            </div>`;
        document.body.appendChild(backdrop);
        document.body.style.overflow = 'hidden';
        backdrop.querySelector('#familyClose').onclick = close;
        backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
        backdrop.querySelector('#familyInviteTop').onclick = () => backdrop.querySelector('#familyInviteName').focus();
        backdrop.querySelector('#familyCreateInvite').onclick = createInvite;
        backdrop.querySelector('#familyContacts').onclick = pickContact;
        return backdrop;
    }

    function close() { const el = document.getElementById('finnestFamilyBackdrop'); if (el) el.remove(); document.body.style.overflow = ''; }

    function render() {
        const modal = document.getElementById('finnestFamilyBackdrop');
        if (!modal) return;
        modal.querySelector('#familyName').textContent = familyState.household?.name || 'My Family';
        modal.querySelector('#familyCount').textContent = `${familyState.members.length} ${familyState.members.length === 1 ? 'member' : 'members'}`;
        modal.querySelector('#familyMembers').innerHTML = familyState.members.length ? familyState.members.map(m => `
            <div class="family-member"><div class="family-avatar">${escapeHtml(initials(m.display_name))}</div><div class="family-member-info"><div class="family-member-name">${escapeHtml(m.display_name)}</div><div class="family-member-role">${m.role === 'owner' ? 'Owner' : 'Member'}</div></div>${m.role !== 'owner' && familyState.household.owner_id === currentUser.id ? `<button class="family-remove" data-remove="${m.id}" title="Remove member">✕</button>` : ''}</div>`).join('') : '<div class="family-empty">No members yet.</div>';
        modal.querySelector('#familyMembers').querySelectorAll('[data-remove]').forEach(btn => btn.onclick = () => removeMember(btn.dataset.remove));

        const invites = familyState.invites;
        modal.querySelector('#familyInvites').innerHTML = invites.length ? invites.map(i => `
            <div class="family-invite-row"><div><div class="family-invite-name">${escapeHtml(i.invited_name || 'Family member')}</div><div class="family-invite-meta">Expires ${new Date(i.expires_at).toLocaleDateString()}</div></div><button class="family-revoke" data-revoke="${i.id}">Revoke</button></div>`).join('') : '<div class="family-empty">No pending invitations.</div>';
        modal.querySelectorAll('[data-revoke]').forEach(btn => btn.onclick = () => revokeInvite(btn.dataset.revoke));
    }

    async function createInvite() {
        const modal = document.getElementById('finnestFamilyBackdrop');
        const button = modal.querySelector('#familyCreateInvite');
        const message = modal.querySelector('#familyMessage');
        const name = modal.querySelector('#familyInviteName').value.trim();
        const contact = modal.querySelector('#familyInviteContact').value.trim();
        message.className = 'family-message';
        message.textContent = '';
        button.disabled = true;
        button.textContent = 'Generating…';
        try {
            const { data, error } = await supabase.rpc('create_household_invite', { p_household_id: familyState.household.id, p_invited_name: name || null, p_invited_contact: contact || null });
            if (error) throw error;
            const inviteUrl = `${location.origin}${location.pathname}?invite=${encodeURIComponent(data.token)}`;
            modal.querySelector('#familyShareArea').innerHTML = `<div class="family-share"><div class="family-share-url">${escapeHtml(inviteUrl)}</div><div class="family-share-actions"><button class="family-primary" id="familyShare">Share invite</button><button class="family-secondary" id="familyCopy">Copy link</button></div></div>`;
            modal.querySelector('#familyShare').onclick = () => shareInvite(inviteUrl);
            modal.querySelector('#familyCopy').onclick = () => copyInvite(inviteUrl);
            message.textContent = 'Invite created. It stays valid for 7 days and can be used once.';
            message.className = 'family-message success';
            modal.querySelector('#familyInviteName').value = '';
            modal.querySelector('#familyInviteContact').value = '';
            await loadState();
            render();
        } catch (error) {
            message.textContent = error?.message || 'Could not create the invitation.';
            message.className = 'family-message error';
        } finally { button.disabled = false; button.textContent = 'Generate invite link'; }
    }

    async function shareInvite(url) {
        if (navigator.share) {
            try { await navigator.share({ title: 'Join my FinNest family', text: 'Join our family expense tracker on FinNest.', url }); return; } catch (e) { if (e?.name === 'AbortError') return; }
        }
        await copyInvite(url);
    }

    async function copyInvite(url) {
        try { await navigator.clipboard.writeText(url); alert('Invite link copied.'); }
        catch (e) { prompt('Copy this invite link:', url); }
    }

    async function pickContact() {
        if (!('contacts' in navigator) || !navigator.contacts?.select) {
            const message = document.getElementById('familyMessage');
            message.textContent = 'Contact selection is not supported by this browser. You can enter a name/contact or use Share after generating the link.';
            message.className = 'family-message error';
            return;
        }
        try {
            const contacts = await navigator.contacts.select(['name', 'email', 'tel'], { multiple: false });
            const contact = contacts?.[0];
            if (!contact) return;
            document.getElementById('familyInviteName').value = contact.name?.[0] || '';
            document.getElementById('familyInviteContact').value = contact.email?.[0] || contact.tel?.[0] || '';
        } catch (error) { /* User cancelled contact picker. */ }
    }

    async function revokeInvite(id) {
        if (!confirm('Revoke this invitation?')) return;
        const { error } = await supabase.rpc('revoke_household_invite', { p_invite_id: id });
        if (error) return alert(error.message);
        await loadState(); render();
    }

    async function removeMember(id) {
        if (!confirm('Remove this member from the family? Their personal expenses remain theirs, but they will lose access to shared household expenses.')) return;
        const { error } = await supabase.rpc('remove_household_member', { p_member_id: id });
        if (error) return alert(error.message);
        await loadState(); render();
    }

    async function openFamily() {
        injectStyles();
        const { data } = await supabase.auth.getSession();
        if (!data.session) { window.FinNestAuth?.open('signin'); return; }
        currentUser = data.session.user;
        const modal = buildModal();
        modal.querySelector('#familyMembers').innerHTML = '<div class="family-empty">Loading family…</div>';
        try { await loadState(); render(); } catch (error) { modal.querySelector('#familyMembers').innerHTML = `<div class="family-empty">${escapeHtml(error?.message || 'Could not load family.')}</div>`; }
    }

    async function acceptPendingInvite() {
        const params = new URLSearchParams(location.search);
        const token = params.get('invite');
        if (!token) return;
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
            window.FinNestAuth?.open('signin');
            return;
        }
        try {
            const { data: result, error } = await supabase.rpc('accept_household_invite', { p_token: token });
            if (error) throw error;
            history.replaceState({}, document.title, location.pathname);
            alert(result?.status === 'already_member' ? 'You are already a member of this family.' : 'You joined the FinNest family!');
        } catch (error) {
            history.replaceState({}, document.title, location.pathname);
            alert(error?.message || 'This invitation could not be accepted.');
        }
    }

    function wireFamilyNavigation() {
        document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(button => {
            if ((button.textContent || '').includes('Family')) button.addEventListener('click', openFamily);
        });
    }

    document.addEventListener('DOMContentLoaded', async () => {
        injectStyles();
        wireFamilyNavigation();
        await acceptPendingInvite();
        document.addEventListener('finnest:authenticated', acceptPendingInvite);
    });

    window.FinNestFamily = { open: openFamily };
})();
