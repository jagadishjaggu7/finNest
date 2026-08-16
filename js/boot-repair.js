/* FinNest boot repair: recover UI interactions even if an optional module fails. */
(function () {
    function directRoute(item) {
        const label = item?.querySelector('small, span:last-child')?.textContent?.trim() || '';
        const page = label === 'Home' ? 'Dashboard' : label;
        if (!['Dashboard','Expenses','Budgets','Reports','Family','Accounts','Settings'].includes(page)) return false;
        try {
            if (typeof currentView !== 'undefined') currentView = page;
            if (page === 'Dashboard' && typeof showDashboard === 'function') showDashboard();
            else if (page === 'Expenses' && typeof renderExpensesView === 'function') renderExpensesView();
            else if (page === 'Budgets' && typeof renderBudgetsView === 'function') renderBudgetsView();
            else if (page === 'Reports' && typeof renderReportsView === 'function') renderReportsView();
            else if (page === 'Family' && typeof renderFamilyView === 'function') renderFamilyView();
            else if (page === 'Accounts' && typeof renderAccountsView === 'function') renderAccountsView();
            else if (page === 'Settings' && typeof renderSettingsView === 'function') renderSettingsView();
            else if (typeof renderCurrentView === 'function') renderCurrentView();
            return true;
        } catch (error) {
            console.error('FinNest direct navigation failed:', error);
            return false;
        }
    }

    function installInteractionRecovery() {
        if (document.documentElement.dataset.finnestInteractionRecovery) return;
        document.documentElement.dataset.finnestInteractionRecovery = '1';

        document.addEventListener('click', event => {
            const nav = event.target.closest('.sidebar .nav-item, .mobile-nav .mobile-nav-item');
            if (nav && !nav.classList.contains('add-expense-button')) {
                const label = nav.querySelector('small, span:last-child')?.textContent?.trim() || '';
                if (label !== 'Family' || document.body.classList.contains('family-view') === false) {
                    if (directRoute(nav)) {
                        event.preventDefault();
                        event.stopImmediatePropagation();
                    }
                }
                return;
            }

            const addExpense = event.target.closest('#desktopAddExpense, .add-expense-button, #viewAddExpense');
            if (addExpense && typeof openExpenseSheet === 'function') {
                event.preventDefault();
                event.stopImmediatePropagation();
                openExpenseSheet();
                return;
            }

            const addIncome = event.target.closest('#quickIncomeButton');
            if (addIncome && typeof openIncomeModal === 'function') {
                event.preventDefault();
                event.stopImmediatePropagation();
                openIncomeModal();
            }
        }, true);
    }

    function repair() {
        try {
            if (typeof wireNavigation === 'function' && !document.documentElement.dataset.finnestNavigationRepaired) {
                document.documentElement.dataset.finnestNavigationRepaired = '1';
                wireNavigation();
            }
            installInteractionRecovery();
        } catch (error) {
            console.error('FinNest boot repair failed:', error);
        }
    }

    // The prototype PWA can otherwise reintroduce stale JS on localhost.
    async function cleanLocalhostPwa() {
        if (!['localhost','127.0.0.1'].includes(location.hostname)) return;
        try {
            const registrations = navigator.serviceWorker ? await navigator.serviceWorker.getRegistrations() : [];
            await Promise.all(registrations.map(r => r.unregister()));
            if (window.caches) {
                const keys = await caches.keys();
                await Promise.all(keys.map(k => caches.delete(k)));
            }
        } catch (error) {
            console.warn('FinNest localhost cache cleanup failed:', error);
        }
    }

    window.addEventListener('load', () => { repair(); cleanLocalhostPwa(); }, { once: true });
    setTimeout(repair, 1200);
    setTimeout(cleanLocalhostPwa, 1500);

    window.addEventListener('error', event => console.error('FinNest runtime error:', event.error || event.message));
    window.addEventListener('unhandledrejection', event => console.error('FinNest unhandled promise rejection:', event.reason));
})();
