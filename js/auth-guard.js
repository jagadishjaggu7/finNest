/* FinNest auth guard — prevent signed-out users from seeing local demo data. */
(function () {
  document.documentElement.classList.add('finnest-auth-pending');
  const keys = [
    'finnest_expenses',
    'finnest_incomes',
    'finnest_budgets',
    'finnest_family_members',
    'finnest_family_payers',
    'finnest_supabase_id_map'
  ];

  function finish() {
    document.documentElement.classList.remove('finnest-auth-pending');
    document.documentElement.classList.add('finnest-auth-ready');
  }

  async function boot() {
    try {
      const client = window.finnestSupabase;
      if (!client) return;
      const { data } = await client.auth.getSession();
      if (!data?.session) {
        keys.forEach(key => localStorage.removeItem(key));
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
  boot();
})();
