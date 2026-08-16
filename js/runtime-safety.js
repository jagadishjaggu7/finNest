/* FinNest runtime safety: cloud is authoritative; clear legacy demo cache once and disable stale localhost PWA. */
(function () {
    const VERSION = 'cloud-authority-v4';
    const MARKER = 'finnest_runtime_safety';
    const RELOAD_MARKER = 'finnest_localhost_cleanup_reload';
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
            const cleanup = async () => {
                const registrations = navigator.serviceWorker ? await navigator.serviceWorker.getRegistrations() : [];
                await Promise.all(registrations.map(registration => registration.unregister()));
                if (window.caches) {
                    const keys = await caches.keys();
                    await Promise.all(keys.map(key => caches.delete(key)));
                }
                if (!sessionStorage.getItem(RELOAD_MARKER)) {
                    sessionStorage.setItem(RELOAD_MARKER, '1');
                    location.reload();
                }
            };
            cleanup().catch(() => {});
        } catch (_) {}
    }
})();
