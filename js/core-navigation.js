/* FinNest core navigation — one deterministic navigation layer while the app is stabilized. */
(function () {
    const routes = {
        Dashboard: 'showDashboard', Home: 'showDashboard', Expenses: 'renderExpensesView',
        Budgets: 'renderBudgetsView', Reports: 'renderReportsView', Family: 'renderFamilyView',
        Accounts: 'renderAccountsView', Settings: 'renderSettingsView', More: 'renderSettingsView'
    };

    function labelFrom(item) { return item.querySelector('small, span:last-child')?.textContent?.trim() || ''; }

    function navigate(label) {
        const fnName = routes[label];
        const fn = fnName && window[fnName];
        if (typeof fn !== 'function') return false;
        const dashboard = label === 'Dashboard' || label === 'Home';
        document.querySelectorAll('.page-header, .summary-grid, .dashboard-grid, .budget-section').forEach(el => { el.style.display = dashboard ? '' : 'none'; });
        if (typeof window.getDynamicView === 'function') window.getDynamicView().style.display = dashboard ? 'none' : 'block';
        if (typeof window.setActiveNavigation === 'function') window.setActiveNavigation(label === 'Home' ? 'Dashboard' : label === 'More' ? 'Settings' : label);
        fn();
        return true;
    }

    function install() {
        if (document.documentElement.dataset.finnestCoreNav === '1') return;
        document.documentElement.dataset.finnestCoreNav = '1';
        document.addEventListener('click', event => {
            const item = event.target.closest('.sidebar .nav-item, .mobile-nav .mobile-nav-item');
            if (!item) return;
            if (navigate(labelFrom(item))) { event.preventDefault(); event.stopImmediatePropagation(); }
        }, true);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
    else install();
})();
