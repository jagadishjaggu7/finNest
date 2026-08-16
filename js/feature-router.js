/* FinNest feature router — route Settings/Budgets to their cloud-backed implementations. */
(function () {
    function labelForNav(item) {
        return item?.querySelector('small, span:last-child')?.textContent?.trim() || '';
    }

    function route(event) {
        const item = event.target.closest('.sidebar .nav-item, .mobile-nav .mobile-nav-item');
        if (!item) return;
        const label = labelForNav(item);
        const page = label === 'More' ? 'Settings' : (label === 'Home' ? 'Dashboard' : label);
        if (page === 'Settings' && typeof window.renderSettingsView === 'function') {
            event.preventDefault();
            event.stopImmediatePropagation();
            document.querySelectorAll('.page-header, .summary-grid, .dashboard-grid, .budget-section').forEach(el => el.style.display = 'none');
            const view = typeof getDynamicView === 'function' ? getDynamicView() : document.getElementById('finnestDynamicView');
            if (!view) return;
            view.style.display = 'block';
            if (typeof setActiveNavigation === 'function') setActiveNavigation('Settings');
            window.renderSettingsView();
            return;
        }

        if (page === 'Budgets' && typeof window.renderBudgetsView === 'function') {
            event.preventDefault();
            event.stopImmediatePropagation();
            document.querySelectorAll('.page-header, .summary-grid, .dashboard-grid, .budget-section').forEach(el => el.style.display = 'none');
            const view = typeof getDynamicView === 'function' ? getDynamicView() : document.getElementById('finnestDynamicView');
            if (!view) return;
            view.style.display = 'block';
            if (typeof setActiveNavigation === 'function') setActiveNavigation('Budgets');
            window.renderBudgetsView();
        }
    }

    // This file is loaded before view-mode.js so these capture handlers own the
    // Settings/Budgets routes before the older local renderers can take over.
    document.addEventListener('click', route, true);
})();
