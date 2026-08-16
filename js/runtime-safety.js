/* FinNest runtime safety: cloud is authoritative. Never let the legacy demo state reach app.js. */
(function () {
    const VERSION = 'cloud-authority-v6';
    const MARKER = 'finnest_runtime_safety';
    const RELOAD_MARKER = 'finnest_localhost_cleanup_reload_v6';
    const DATA_KEYS = [
        'finnest_expenses', 'finnest_incomes', 'finnest_budgets',
        'finnest_family_members', 'finnest_family_payers', 'finnest_supabase_id_map'
    ];

    let cloudReady = false;
    const nativeGetItem = Storage.prototype.getItem;

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
        Storage.prototype.getItem = nativeGetItem;
    };
    document.addEventListener('finnest:cloud-data-ready', releaseCloudGate, { once: true });

    try {
        DATA_KEYS.forEach(key => localStorage.removeItem(key));
        localStorage.setItem(MARKER, VERSION);
    } catch (_) {}

    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
        try {
            // FinNest PWA caching is deliberately disabled during localhost
            // development. The old service worker was able to resurrect stale
            // HTML/JS and made debugging the real application impossible.
            if (navigator.serviceWorker) {
                navigator.serviceWorker.getRegistrations()
                    .then(regs => Promise.all(regs.map(r => r.unregister())))
                    .catch(() => {});
            }
            if (window.caches) caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key)))).catch(() => {});

            // Prevent app.js from registering the worker again on localhost.
            if (navigator.serviceWorker && typeof navigator.serviceWorker.register === 'function') {
                try { navigator.serviceWorker.register = () => Promise.reject(new Error('PWA disabled on localhost')); } catch (_) {}
            }

            if (!sessionStorage.getItem(RELOAD_MARKER)) {
                sessionStorage.setItem(RELOAD_MARKER, '1');
                location.reload();
            }
        } catch (_) {}
    }
})();
