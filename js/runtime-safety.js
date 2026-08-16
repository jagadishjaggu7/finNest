/* FinNest runtime safety: cloud is authoritative. Never let the legacy demo state reach app.js. */
(function () {
    const VERSION = 'cloud-authority-v5';
    const MARKER = 'finnest_runtime_safety';
    const RELOAD_MARKER = 'finnest_localhost_cleanup_reload_v5';
    const DATA_KEYS = [
        'finnest_expenses', 'finnest_incomes', 'finnest_budgets',
        'finnest_family_members', 'finnest_family_payers', 'finnest_supabase_id_map'
    ];

    let cloudReady = false;
    const nativeGetItem = Storage.prototype.getItem;

    // app.js still contains prototype/demo fallbacks. Keep those fallbacks
    // invisible until the Supabase data layer has explicitly loaded cloud data.
    Storage.prototype.getItem = function (key) {
        if (!cloudReady && this === localStorage && DATA_KEYS.includes(key)) {
            if (key === 'finnest_expenses' || key === 'finnest_incomes' || key === 'finnest_family_members') return '[]';
            if (key === 'finnest_budgets' || key === 'finnest_family_payers') return '{}';
            return null;
        }
        return nativeGetItem.call(this, key);
    };

    const releaseCloudGate = () => {
        if (cloudReady) return;
        cloudReady = true;
        // The native getter is restored only after Supabase has populated the
        // in-memory app state and persisted the authoritative cloud snapshot.
        Storage.prototype.getItem = nativeGetItem;
    };

    document.addEventListener('finnest:cloud-data-ready', releaseCloudGate, { once: true });

    try {
        DATA_KEYS.forEach(key => localStorage.removeItem(key));
        localStorage.setItem(MARKER, VERSION);
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
