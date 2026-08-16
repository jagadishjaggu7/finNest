/* FinNest core navigation — single, deterministic navigation layer.
   This intentionally owns navigation while the app is being stabilized. Feature
   modules should not intercept sidebar clicks here; they can be reintroduced later. */
(function () {
    function labelFrom(item) {
        return item.querySelector('small, span:last-child')?.textContent?.trim() || '';
    }

    function navigate(label) {
        const names = {
            Dashboard: 'Dashboard',
            Home: 'Dashboard',
            Expenses: 'Expenses',
            Budgets: 'Budgets',
            Reports: 'Reports',
            Family: 'Family',
            Accounts: 'Accounts',
            Settings: 'Settings',
            More: 'Settings'
        };
        const page = names[label];
        if (!page) return false;
        if (typeof window.currentView !== 'undefined') window.currentView = page;
        if (typeof window.renderCurrentView === 'function') {
            window.renderCurrentView();
            return true;
        }
        return false;
    }

    function install() {
        if (document.documentElement.dataset.finnestCoreNav === '1') return;
        document.documentElement.dataset.finnestCoreNav = '1';

        document.addEventListener('click', event => {
            const item = event.target.closest('.sidebar .nav-item, .mobile-nav .mobile-nav-item');
            if (!item) return;
            const label = labelFrom(item);
            if (!label) return;
            if (navigate(label)) event.preventDefault();
        }, true);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
    else install();
})();
