/* FinNest budget controls — shared styling for native form controls. */
(function () {
    function inject() {
        if (document.getElementById('finnestBudgetControlStyles')) return;
        const style = document.createElement('style');
        style.id = 'finnestBudgetControlStyles';
        style.textContent = `
            .budget-editor-row select,
            .budget-editor-row input,
            .budget-scope-row input,
            #scopeCategory,
            #scopeAmount {
                box-sizing:border-box;width:100%;min-height:42px;padding:10px 12px;
                border:1px solid #CBD5E1;border-radius:10px;background:#fff;color:#334155;
                font:500 13px Inter,system-ui,sans-serif;outline:none;
            }
            .budget-editor-row select:focus,
            .budget-editor-row input:focus,
            .budget-scope-row input:focus,
            #scopeCategory:focus,
            #scopeAmount:focus { border-color:#10B981;box-shadow:0 0 0 3px rgba(16,185,129,.10); }
            #scopeAdd { min-height:42px;white-space:nowrap; }
            .budget-editor-row select { appearance:auto; }
            @media(max-width:700px){
                .budget-editor-row select,.budget-editor-row input,#scopeCategory,#scopeAmount{min-height:40px;}
            }
        `;
        document.head.appendChild(style);
    }
    document.addEventListener('DOMContentLoaded', inject);
    inject();
})();
