/* Reload FinNest cloud state after sign-in/sign-out without changing auth.js. */
(function () {
    document.addEventListener("DOMContentLoaded", () => {
        if (!window.finnestSupabase) return;
        window.finnestSupabase.auth.onAuthStateChange((event, session) => {
            if (event === "SIGNED_IN" && session?.user) {
                setTimeout(() => window.FinNestCloud?.boot(), 150);
            }
            if (event === "SIGNED_OUT") {
                window.location.reload();
            }
        });
    });
})();
