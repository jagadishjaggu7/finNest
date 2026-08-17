/* FinNest header actions — cloud-backed profile + notifications. */
(function () {
    const PROFILE_KEY = "finnest_profile";
    const READ_KEY = "finnest_read_notifications";
    const supabase = window.finnestSupabase;

    function loadJson(key, fallback) {
        try {
            const value = localStorage.getItem(key);
            return value ? JSON.parse(value) : fallback;
        } catch (_) {
            return fallback;
        }
    }

    function getProfile() {
        return loadJson(PROFILE_KEY, { name: "", email: "", currency: "INR (₹)" });
    }

    function saveLocalProfile(profile) {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    }

    async function getAuthenticatedUser() {
        if (!supabase) return null;
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        return data?.session?.user || null;
    }

    async function loadCloudProfile(user) {
        if (!supabase || !user) return null;
        const { data, error } = await supabase
            .from("profiles")
            .select("display_name,currency")
            .eq("id", user.id)
            .maybeSingle();
        if (error) throw error;
        if (!data?.display_name) return null;
        return {
            name: data.display_name,
            email: user.email || "",
            currency: data.currency || "INR (₹)"
        };
    }

    async function saveCloudProfile(profile) {
        if (!supabase) return;
        const user = await getAuthenticatedUser();
        if (!user) throw new Error("Please sign in before saving your profile.");

        const { error: profileError } = await supabase
            .from("profiles")
            .upsert({
                id: user.id,
                display_name: profile.name,
                currency: profile.currency || "INR (₹)"
            }, { onConflict: "id" });
        if (profileError) throw profileError;

        const { error: authError } = await supabase.auth.updateUser({
            data: { display_name: profile.name }
        });
        if (authError) throw authError;
    }

    function getExpenses() {
        return loadJson("finnest_expenses", []);
    }

    function getBudgets() {
        return loadJson("finnest_budgets", {});
    }

    function currentMonth() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }

    function escapeHtml(value) {
        const div = document.createElement("div");
        div.textContent = String(value ?? "");
        return div.innerHTML;
    }

    function getNotifications() {
        const expenses = getExpenses().filter(e => String(e.date || "").slice(0, 7) === currentMonth());
        const budgets = getBudgets();
        const totals = {};
        expenses.forEach(e => {
            const category = e.category || "Other";
            totals[category] = (totals[category] || 0) + Number(e.amount || 0);
        });
        const notifications = [];
        Object.entries(budgets).forEach(([category, limit]) => {
            const spent = totals[category] || 0;
            const amount = Number(limit || 0);
            if (!amount) return;
            const ratio = spent / amount;
            if (ratio >= 1) {
                notifications.push({ id: `over-${category}`, icon: "🚨", title: `${category} budget exceeded`, text: `You've spent ₹${spent.toLocaleString("en-IN")} of ₹${amount.toLocaleString("en-IN")}.`, level: "danger" });
            } else if (ratio >= 0.8) {
                notifications.push({ id: `near-${category}`, icon: "⚠️", title: `${category} is near its budget`, text: `${Math.round(ratio * 100)}% of the monthly limit used.`, level: "warning" });
            }
        });
        if (!notifications.length) notifications.push({ id: "all-good", icon: "✅", title: "You're all caught up", text: "No budget alerts for this month.", level: "success" });
        return notifications;
    }

    function injectStyles() {
        if (document.getElementById("headerActionsStyles")) return;
        const style = document.createElement("style");
        style.id = "headerActionsStyles";
        style.textContent = `
            .finnest-header-backdrop { position:fixed; inset:0; z-index:4000; background:rgba(15,23,42,.42); display:flex; align-items:flex-start; justify-content:flex-end; padding:78px 20px 20px; }
            .finnest-header-popover { width:min(390px, calc(100vw - 32px)); max-height:calc(100vh - 100px); overflow:auto; background:#fff; border:1px solid #E2E8F0; border-radius:18px; box-shadow:0 18px 50px rgba(15,23,42,.18); padding:18px; }
            .finnest-header-popover h2 { margin:0; color:#0F172A; }
            .finnest-popover-head { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:16px; }
            .finnest-popover-close { border:0; width:34px; height:34px; border-radius:50%; background:#F1F5F9; color:#475569; font-size:22px; cursor:pointer; }
            .finnest-profile-avatar { width:64px; height:64px; border-radius:50%; background:#D1FAE5; color:#047857; display:grid; place-items:center; font-size:24px; font-weight:700; margin-bottom:14px; }
            .finnest-profile-field { margin:12px 0; }
            .finnest-profile-field label { display:block; font-size:11px; color:#64748B; margin-bottom:5px; text-transform:uppercase; letter-spacing:.06em; }
            .finnest-profile-field input, .finnest-profile-field select { width:100%; padding:11px 12px; border:1px solid #E2E8F0; border-radius:10px; font:inherit; }
            .finnest-popover-actions { display:flex; gap:10px; margin-top:16px; }
            .finnest-popover-actions button { flex:1; padding:11px 14px; border-radius:10px; font-weight:600; cursor:pointer; }
            .finnest-save { border:0; background:#10B981; color:#fff; }
            .finnest-cancel { border:1px solid #E2E8F0; background:#fff; color:#475569; }
            .finnest-notification { display:flex; gap:12px; padding:13px 0; border-bottom:1px solid #E2E8F0; }
            .finnest-notification:last-child { border-bottom:0; }
            .finnest-notification-icon { width:38px; height:38px; border-radius:12px; background:#F1F5F9; display:grid; place-items:center; flex-shrink:0; }
            .finnest-notification strong { display:block; font-size:13px; color:#0F172A; }
            .finnest-notification span { display:block; margin-top:3px; color:#64748B; font-size:12px; line-height:1.4; }
            .finnest-notification.warning .finnest-notification-icon { background:#FEF3C7; }
            .finnest-notification.danger .finnest-notification-icon { background:#FEE2E2; }
            .finnest-notification.success .finnest-notification-icon { background:#D1FAE5; }
            .finnest-unread-dot { position:absolute; top:7px; right:7px; width:7px; height:7px; border-radius:50%; background:#EF4444; }
            @media(max-width:768px) { .finnest-header-backdrop { align-items:flex-end; justify-content:center; padding:12px; } .finnest-header-popover { width:100%; border-radius:22px 22px 14px 14px; } }
        `;
        document.head.appendChild(style);
    }

    function openPopover(content) {
        const existing = document.getElementById("finnestHeaderPopover");
        if (existing) existing.remove();
        const backdrop = document.createElement("div");
        backdrop.id = "finnestHeaderPopover";
        backdrop.className = "finnest-header-backdrop";
        backdrop.innerHTML = `<div class="finnest-header-popover">${content}</div>`;
        document.body.appendChild(backdrop);
        document.body.style.overflow = "hidden";
        const close = () => { backdrop.remove(); document.body.style.overflow = ""; };
        backdrop.addEventListener("click", e => { if (e.target === backdrop) close(); });
        backdrop.querySelector(".finnest-popover-close")?.addEventListener("click", close);
        return { backdrop, close };
    }

    async function openProfile() {
        let profile = getProfile();
        try {
            const user = await getAuthenticatedUser();
            const cloudProfile = await loadCloudProfile(user);
            if (cloudProfile) {
                profile = cloudProfile;
                saveLocalProfile(profile);
            } else if (user?.user_metadata?.display_name) {
                profile = { name: user.user_metadata.display_name, email: user.email || "", currency: "INR (₹)" };
            }
        } catch (error) {
            console.warn("FinNest profile load failed", error);
        }

        const initials = (profile.name || "J").trim().charAt(0).toUpperCase();
        const { backdrop, close } = openPopover(`
            <div class="finnest-popover-head"><div><p class="eyebrow">FinNest</p><h2>Profile</h2></div><button class="finnest-popover-close" aria-label="Close">×</button></div>
            <div class="finnest-profile-avatar">${escapeHtml(initials)}</div>
            <div class="finnest-profile-field"><label>Name</label><input id="profileName" value="${escapeHtml(profile.name)}" maxlength="60"></div>
            <div class="finnest-profile-field"><label>Email (optional)</label><input id="profileEmail" type="email" value="${escapeHtml(profile.email)}" placeholder="you@example.com"></div>
            <div class="finnest-profile-field"><label>Currency</label><select id="profileCurrency"><option value="INR (₹)">INR (₹)</option></select></div>
            <div class="finnest-popover-actions"><button class="finnest-cancel">Cancel</button><button class="finnest-save">Save Profile</button></div>
        `);
        backdrop.querySelector(".finnest-cancel").onclick = close;
        backdrop.querySelector(".finnest-save").onclick = async () => {
            const button = backdrop.querySelector(".finnest-save");
            const name = backdrop.querySelector("#profileName").value.trim();
            if (!name) return alert("Please enter your name.");
            const updated = { name, email: backdrop.querySelector("#profileEmail").value.trim(), currency: backdrop.querySelector("#profileCurrency").value };
            button.disabled = true;
            button.textContent = "Saving…";
            try {
                await saveCloudProfile(updated);
                saveLocalProfile(updated);
                document.querySelector(".profile-button")?.replaceChildren(document.createTextNode(name.charAt(0).toUpperCase()));
                const heading = document.querySelector(".page-header h1");
                if (heading) heading.textContent = `${getGreeting()}, ${name} 👋`;
                window.dispatchEvent(new CustomEvent("finnest:profile-changed", { detail: updated }));
                close();
            } catch (error) {
                alert(error?.message || "Unable to save your profile. Please try again.");
            } finally {
                button.disabled = false;
                button.textContent = "Save Profile";
            }
        };
    }

    function getGreeting() {
        const hour = new Date().getHours();
        return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    }

    function openNotifications() {
        const notifications = getNotifications();
        const { backdrop } = openPopover(`
            <div class="finnest-popover-head"><div><p class="eyebrow">FinNest</p><h2>Notifications</h2></div><button class="finnest-popover-close" aria-label="Close">×</button></div>
            <div>${notifications.map(n => `<div class="finnest-notification ${n.level}"><div class="finnest-notification-icon">${n.icon}</div><div><strong>${escapeHtml(n.title)}</strong><span>${escapeHtml(n.text)}</span></div></div>`).join("")}</div>
        `);
        const read = notifications.map(n => n.id);
        localStorage.setItem(READ_KEY, JSON.stringify(read));
        document.querySelector(".icon-button")?.querySelector(".finnest-unread-dot")?.remove();
        backdrop.querySelector(".finnest-popover-close")?.focus();
    }

    function updateHeaderFromProfile() {
        const profile = getProfile();
        const button = document.querySelector(".profile-button");
        if (button) button.textContent = (profile.name || "J").trim().charAt(0).toUpperCase();
        const heading = document.querySelector(".page-header h1");
        if (heading && /Good (morning|afternoon|evening),/.test(heading.textContent)) heading.textContent = `${getGreeting()}, ${profile.name || ""} 👋`;
    }

    function updateNotificationDot() {
        const button = document.querySelector(".icon-button");
        if (!button) return;
        const notifications = getNotifications();
        const read = loadJson(READ_KEY, []);
        if (notifications.some(n => !read.includes(n.id)) && !button.querySelector(".finnest-unread-dot")) {
            const dot = document.createElement("span");
            dot.className = "finnest-unread-dot";
            button.style.position = "relative";
            button.appendChild(dot);
        }
    }

    async function init() {
        injectStyles();
        const profileButton = document.querySelector(".profile-button");
        const notificationButton = document.querySelector(".icon-button");
        profileButton?.addEventListener("click", openProfile);
        notificationButton?.addEventListener("click", openNotifications);
        updateHeaderFromProfile();
        updateNotificationDot();
        try {
            const user = await getAuthenticatedUser();
            const cloudProfile = await loadCloudProfile(user);
            if (cloudProfile) {
                saveLocalProfile(cloudProfile);
                updateHeaderFromProfile();
            } else if (user?.user_metadata?.display_name) {
                saveLocalProfile({ name: user.user_metadata.display_name, email: user.email || "", currency: "INR (₹)" });
                updateHeaderFromProfile();
            }
        } catch (error) {
            console.warn("FinNest cloud profile bootstrap failed", error);
        }
    }

    document.addEventListener("DOMContentLoaded", init);
})();