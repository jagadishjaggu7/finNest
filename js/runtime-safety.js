/* FinNest runtime safety: cloud is authoritative; clear legacy demo cache once and disable stale localhost PWA. */
(function () {
    const VERSION = 'cloud-authority-v3';
    const MARKER = 'finnest_runtime_safety';
    const DATA_KEYS = [
        'finnest_expenses', 'finnest_incomes', 'finnest_budgets',
        'finnest_family_members', 'finnest_family_payers', 'finnest_supabase_id_map'
    ];

    try {
        if (localStorage.getItem(MARKER) !== VERSION) {
            DATA_KEYS.forEach(key => localStorage.removeItem(key));
            localStorage.setItem(MARKER, VERSION);
        }
    } catch (_) {}

    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
        try {
            if (navigator.serviceWorker) {
                navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister())).catch(() => {});
            }
            if (window.caches) {
                caches.keys().then(keys => keys.forEach(key => caches.delete(key))).catch(() => {});
            }
        } catch (_) {}
    }
})();
