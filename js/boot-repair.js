/* FinNest boot repair: make navigation resilient if the main DOM boot was interrupted. */
(function () {
    function run() {
        try {
            if (typeof wireNavigation === 'function' && !document.documentElement.dataset.finnestNavigationRepaired) {
                document.documentElement.dataset.finnestNavigationRepaired = '1';
                wireNavigation();
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
