/* FinNest boot repair: make navigation resilient if an earlier optional module fails. */
(function () {
    function run() {
        try {
            if (typeof wireNavigation === 'function' && !document.documentElement.dataset.finnestNavigationRepaired) {
                document.documentElement.dataset.finnestNavigationRepaired = '1';
                wireNavigation();
            }
            if (typeof setupExpenseSheet === 'function' && !document.documentElement.dataset.finnestExpenseRepaired) {
                document.documentElement.dataset.finnestExpenseRepaired = '1';
                setupExpenseSheet();
            }
        } catch (error) {
            console.error('FinNest boot repair failed', error);
        }
    }

    window.addEventListener('load', run, { once: true });
    setTimeout(run, 1200);

    window.addEventListener('error', event => {
        console.error('FinNest runtime error:', event.error || event.message);
    });
    window.addEventListener('unhandledrejection', event => {
        console.error('FinNest unhandled promise rejection:', event.reason);
    });
})();
