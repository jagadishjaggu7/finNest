/* FinNest mobile navigation enhancement
   Keeps all seven app sections reachable on small screens. */
(function () {
    function initMobileMoreMenu() {
        const mobileNav = document.querySelector(".mobile-nav");
        if (!mobileNav) return;

        const moreButton = Array.from(mobileNav.querySelectorAll(".mobile-nav-item"))
            .find(button => button.querySelector("small")?.textContent === "More");
        if (!moreButton) return;

        // Clone the button so the original app.js click handler is removed.
        const replacement = moreButton.cloneNode(true);
        moreButton.replaceWith(replacement);

        replacement.addEventListener("click", () => openMoreMenu());
    }

    function openMoreMenu() {
        const existing = document.getElementById("mobileMoreMenu");
        if (existing) {
            existing.remove();
            document.body.style.overflow = "";
            return;
        }

        const menu = document.createElement("div");
        menu.id = "mobileMoreMenu";
        menu.className = "mobile-more-backdrop";
        menu.innerHTML = `
            <div class="mobile-more-sheet" role="dialog" aria-modal="true" aria-labelledby="mobileMoreTitle">
                <div class="mobile-more-handle"></div>
                <div class="mobile-more-header">
                    <div>
                        <p class="eyebrow">FinNest</p>
                        <h2 id="mobileMoreTitle">More</h2>
                    </div>
                    <button class="mobile-more-close" aria-label="Close">×</button>
                </div>
                <div class="mobile-more-grid">
                    <button data-mobile-view="Budgets"><span>💰</span><strong>Budgets</strong><small>Spending limits</small></button>
                    <button data-mobile-view="Family"><span>👨‍👩‍👧</span><strong>Family</strong><small>Shared expenses</small></button>
                    <button data-mobile-view="Accounts"><span>🏦</span><strong>Accounts</strong><small>Payment sources</small></button>
                    <button data-mobile-view="Settings"><span>⚙️</span><strong>Settings</strong><small>Preferences & backup</small></button>
                </div>
            </div>
        `;

        document.body.appendChild(menu);
        document.body.style.overflow = "hidden";

        const close = () => {
            menu.remove();
            document.body.style.overflow = "";
        };

        menu.querySelector(".mobile-more-close").onclick = close;
        menu.addEventListener("click", event => {
            if (event.target === menu) close();
        });

        menu.querySelectorAll("[data-mobile-view]").forEach(button => {
            button.addEventListener("click", () => {
                window.currentView = button.dataset.mobileView;
                if (typeof window.renderCurrentView === "function") {
                    window.renderCurrentView();
                }
                close();
            });
        });

        menu.querySelector("[data-mobile-view='Family']")?.focus();
    }

    function injectStyles() {
        if (document.getElementById("mobileMoreStyles")) return;
        const style = document.createElement("style");
        style.id = "mobileMoreStyles";
        style.textContent = `
            .mobile-more-backdrop {
                position: fixed;
                inset: 0;
                z-index: 3000;
                display: flex;
                align-items: flex-end;
                background: rgba(15, 23, 42, .42);
                padding: 12px;
            }
            .mobile-more-sheet {
                width: 100%;
                max-width: 520px;
                margin: 0 auto;
                background: #fff;
                border-radius: 24px 24px 16px 16px;
                padding: 10px 18px 24px;
                box-shadow: 0 -12px 40px rgba(15, 23, 42, .18);
            }
            .mobile-more-handle {
                width: 42px;
                height: 4px;
                border-radius: 99px;
                background: #CBD5E1;
                margin: 2px auto 14px;
            }
            .mobile-more-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 16px;
                margin-bottom: 16px;
            }
            .mobile-more-header h2 {
                margin: 0;
                color: #0F172A;
            }
            .mobile-more-close {
                width: 38px;
                height: 38px;
                border: 0;
                border-radius: 50%;
                background: #F1F5F9;
                color: #475569;
                font-size: 24px;
                cursor: pointer;
            }
            .mobile-more-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 12px;
            }
            .mobile-more-grid button {
                display: grid;
                grid-template-columns: 42px 1fr;
                grid-template-rows: auto auto;
                column-gap: 10px;
                align-items: center;
                text-align: left;
                padding: 14px;
                border: 1px solid #E2E8F0;
                border-radius: 16px;
                background: #fff;
                color: #0F172A;
                cursor: pointer;
            }
            .mobile-more-grid button:hover,
            .mobile-more-grid button:focus-visible {
                border-color: #10B981;
                outline: none;
                box-shadow: 0 0 0 3px rgba(16, 185, 129, .12);
            }
            .mobile-more-grid button > span {
                grid-row: 1 / 3;
                display: grid;
                place-items: center;
                width: 42px;
                height: 42px;
                border-radius: 12px;
                background: #ECFDF5;
                font-size: 20px;
            }
            .mobile-more-grid button strong { font-size: 14px; }
            .mobile-more-grid button small { color: #94A3B8; font-size: 11px; margin-top: 2px; }
            @media (min-width: 769px) {
                .mobile-more-backdrop { display: none !important; }
            }
        `;
        document.head.appendChild(style);
    }

    document.addEventListener("DOMContentLoaded", () => {
        injectStyles();
        initMobileMoreMenu();
    });
})();
