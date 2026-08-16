/* FinNest auth data gate — prevent app.js from reading local financial state before Supabase auth resolves. */
(function () {
    const KEYS = new Set([
        'finnest_expenses',
        'finnest_incomes',
        'finnest_budgets',
        'finnest_family_members',
        'finnest_family_payers',
        'finnest_profile',
        'finnest_supabase_id_map'
    ]);

    const originalGetItem = Storage.prototype.getItem;
    let gated = true;

    function emptyValue(key) {
        if (key === 'finnest_expenses' || key === 'finnest_incomes' || key === 'finnest_family_members') return '[]';
        if (key === 'finnest_budgets' || key === 'finnest_family_payers') return '{}';
        return null;
    }

    Storage.prototype.getItem = function (key) {
        if (gated && this === localStorage && KEYS.has(key)) return emptyValue(key);
        return originalGetItem.call(this, key);
    };

    function release() {
        if (!gated) return;
        gated = false;
        Storage.prototype.getItem = originalGetItem;
    }

    const observer = new MutationObserver(() => {
        if (document.documentElement.classList.contains('finnest-auth-ready')) {
            release();
            observer.disconnect();
        }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    if (document.documentElement.classList.contains('finnest-auth-ready')) release();
})();
