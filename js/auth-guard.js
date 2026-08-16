/* FinNest auth guard — signed-out users must never see personal/demo financial data. */
(function () {
  document.documentElement.classList.add('finnest-auth-pending');

  function finish() {
    document.documentElement.classList.remove('finnest-auth-pending');
    document.documentElement.classList.add('finnest-auth-ready');
  }

  async function boot() {
    try {
      const client = window.finnestSupabase;
      if (!client) {
        // Never leave the entire page hidden forever if Supabase/CDN fails to load.
        // The application can still render an empty, responsive signed-out shell.
        console.warn('FinNest: Supabase client unavailable; releasing auth gate.');
        return;
      }
      const { data } = await client.auth.getSession();

      if (!data?.session) {
        // Keep explicit empty values so app.js cannot fall back to demo data.
        localStorage.setItem('finnest_expenses', '[]');
        localStorage.setItem('finnest_incomes', '[]');
        localStorage.setItem('finnest_budgets', '{}');
        localStorage.setItem('finnest_family_members', '[]');
        localStorage.setItem('finnest_family_payers', '{}');
        localStorage.removeItem('finnest_supabase_id_map');
        localStorage.removeItem('finnest_profile');
        localStorage.removeItem('finnest_view_mode');
      }
    } catch (error) {
      console.warn('FinNest auth guard could not resolve session', error);
    } finally {
      finish();
    }
  }

  const style = document.createElement('style');
  style.textContent = '.finnest-auth-pending body{visibility:hidden}.finnest-auth-pending body::before{content:"Loading FinNest…";visibility:visible;position:fixed;inset:0;display:grid;place-items:center;background:#F8FAFC;color:#0F172A;font:600 14px system-ui;z-index:99999}.finnest-auth-ready body{visibility:visible}';
  document.head.appendChild(style);
  boot().finally(finish);
})();
