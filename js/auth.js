/* FinNest Supabase Auth — Phase 4.2
   Email/password authentication. Data sync is intentionally separate.
*/
(function () {
    const supabase = window.finnestSupabase;
    if (!supabase) return;

    function injectStyles() {
        if (document.getElementById("finnestAuthStyles")) return;
        const style = document.createElement("style");
        style.id = "finnestAuthStyles";
        style.textContent = `
            .finnest-auth-button{border:1px solid #A7F3D0;background:#ECFDF5;color:#047857;border-radius:10px;padding:8px 12px;font:600 12px inherit;cursor:pointer}
            .finnest-auth-status{font-size:11px;color:#64748B;margin-right:4px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
            .finnest-auth-backdrop{position:fixed;inset:0;z-index:5000;background:rgba(15,23,42,.48);display:flex;align-items:center;justify-content:center;padding:16px}
            .finnest-auth-modal{width:min(430px,100%);background:#fff;border:1px solid #E2E8F0;border-radius:22px;box-shadow:0 24px 70px rgba(15,23,42,.22);padding:24px}
            .finnest-auth-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:18px}
            .finnest-auth-head h2{margin:0;color:#0F172A;font-size:24px}
            .finnest-auth-close{border:0;background:#F1F5F9;color:#475569;width:36px;height:36px;border-radius:50%;font-size:22px;cursor:pointer}
            .finnest-auth-field{margin:14px 0}.finnest-auth-field label{display:block;font-size:12px;color:#64748B;margin-bottom:6px}.finnest-auth-field input{width:100%;box-sizing:border-box;padding:12px;border:1px solid #CBD5E1;border-radius:10px;font:inherit}
            .finnest-auth-primary{width:100%;border:0;background:#10B981;color:#fff;border-radius:10px;padding:12px;font-weight:700;cursor:pointer;margin-top:8px}
            .finnest-auth-secondary{width:100%;border:1px solid #CBD5E1;background:#fff;color:#334155;border-radius:10px;padding:11px;font-weight:600;cursor:pointer;margin-top:10px}
            .finnest-auth-message{margin:12px 0;padding:10px 12px;border-radius:10px;font-size:12px;display:none}.finnest-auth-message.error{display:block;background:#FEF2F2;color:#B91C1C}.finnest-auth-message.success{display:block;background:#ECFDF5;color:#047857}
            .finnest-auth-note{font-size:11px;color:#64748B;line-height:1.5;margin-top:14px}
            @media(max-width:600px){.finnest-auth-backdrop{align-items:flex-end}.finnest-auth-modal{border-radius:22px 22px 14px 14px}}
        `;
        document.head.appendChild(style);
    }

    function openAuthModal(mode = "signin") {
        const existing = document.getElementById("finnestAuthBackdrop");
        if (existing) existing.remove();

        const backdrop = document.createElement("div");
        backdrop.id = "finnestAuthBackdrop";
        backdrop.className = "finnest-auth-backdrop";
        backdrop.innerHTML = `
            <div class="finnest-auth-modal" role="dialog" aria-modal="true">
                <div class="finnest-auth-head">
                    <div><p class="eyebrow">FinNest Cloud</p><h2>${mode === "signin" ? "Welcome back" : "Create your account"}</h2></div>
                    <button class="finnest-auth-close" aria-label="Close">×</button>
                </div>
                <div class="finnest-auth-message" id="finnestAuthMessage"></div>
                <div class="finnest-auth-field"><label>Email</label><input id="finnestAuthEmail" type="email" autocomplete="email" placeholder="you@example.com"></div>
                <div class="finnest-auth-field"><label>Password</label><input id="finnestAuthPassword" type="password" autocomplete="current-password" placeholder="At least 6 characters"></div>
                <button class="finnest-auth-primary" id="finnestAuthSubmit">${mode === "signin" ? "Sign in" : "Create account"}</button>
                <button class="finnest-auth-secondary" id="finnestAuthSwitch">${mode === "signin" ? "New to FinNest? Create account" : "Already have an account? Sign in"}</button>
                <p class="finnest-auth-note">Your FinNest database is protected by Supabase Row Level Security. We will connect your local data to the database in the next step.</p>
            </div>`;
        document.body.appendChild(backdrop);
        document.body.style.overflow = "hidden";

        const close = () => { backdrop.remove(); document.body.style.overflow = ""; };
        backdrop.querySelector(".finnest-auth-close").onclick = close;
        backdrop.addEventListener("click", e => { if (e.target === backdrop) close(); });
        backdrop.querySelector("#finnestAuthSwitch").onclick = () => { close(); openAuthModal(mode === "signin" ? "signup" : "signin"); };

        const message = backdrop.querySelector("#finnestAuthMessage");
        const showMessage = (text, type) => { message.textContent = text; message.className = `finnest-auth-message ${type}`; };

        backdrop.querySelector("#finnestAuthSubmit").onclick = async () => {
            const email = backdrop.querySelector("#finnestAuthEmail").value.trim();
            const password = backdrop.querySelector("#finnestAuthPassword").value;
            if (!email || !password) return showMessage("Please enter your email and password.", "error");
            if (password.length < 6) return showMessage("Password must be at least 6 characters.", "error");

            const button = backdrop.querySelector("#finnestAuthSubmit");
            button.disabled = true;
            button.textContent = mode === "signin" ? "Signing in…" : "Creating account…";

            try {
                if (mode === "signin") {
                    const { error } = await supabase.auth.signInWithPassword({ email, password });
                    if (error) throw error;
                    close();
                } else {
                    const { data, error } = await supabase.auth.signUp({
                        email,
                        password,
                        options: { data: { display_name: email.split("@")[0] } }
                    });
                    if (error) throw error;
                    if (data.session) {
                        showMessage("Account created and signed in.", "success");
                        setTimeout(close, 500);
                    } else {
                        showMessage("Account created. Check your email to confirm the account, then sign in.", "success");
                        button.disabled = false;
                        button.textContent = "Create account";
                    }
                }
            } catch (error) {
                showMessage(error?.message || "Authentication failed. Please try again.", "error");
                button.disabled = false;
                button.textContent = mode === "signin" ? "Sign in" : "Create account";
            }
        };

        setTimeout(() => backdrop.querySelector("#finnestAuthEmail").focus(), 100);
    }

    function addAuthButton() {
        const actions = document.querySelector(".header-actions");
        if (!actions || document.getElementById("finnestAuthButton")) return;
        const button = document.createElement("button");
        button.id = "finnestAuthButton";
        button.className = "finnest-auth-button";
        button.type = "button";
        button.onclick = async () => {
            const { data } = await supabase.auth.getSession();
            if (data.session) {
                const ok = confirm(`Signed in as ${data.session.user.email}. Sign out?`);
                if (ok) await supabase.auth.signOut();
            } else {
                openAuthModal("signin");
            }
        };
        actions.insertBefore(button, actions.firstChild);
        updateAuthButton(null);
    }

    function updateAuthButton(session) {
        const button = document.getElementById("finnestAuthButton");
        if (!button) return;
        button.textContent = session ? "☁ Signed in" : "☁ Sign in";
        button.title = session ? `Signed in as ${session.user.email}` : "Sign in to FinNest Cloud";
    }

    async function init() {
        injectStyles();
        addAuthButton();
        const { data } = await supabase.auth.getSession();
        updateAuthButton(data.session);
        supabase.auth.onAuthStateChange((event, session) => {
            updateAuthButton(session);
            if (event === "SIGNED_IN" && session) {
                document.dispatchEvent(new CustomEvent("finnest:authenticated", { detail: { session } }));
            }
            if (event === "SIGNED_OUT") {
                document.dispatchEvent(new CustomEvent("finnest:signedout"));
            }
        });
    }

    window.FinNestAuth = { open: openAuthModal };
    document.addEventListener("DOMContentLoaded", init);
})();
