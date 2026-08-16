/* FinNest UI polish: keep labels, money values and metadata visually separated. */
(function () {
    function inject() {
        if (document.getElementById('finnestUiPolish')) return;
        const style = document.createElement('style');
        style.id = 'finnestUiPolish';
        style.textContent = `
            .account-grid .dashboard-card,
            .report-stat-grid .dashboard-card {
                display: flex;
                flex-direction: column;
                align-items: flex-start;
                justify-content: center;
                gap: 0;
                min-height: 76px;
            }
            .account-grid .dashboard-card > .muted,
            .report-stat-grid .dashboard-card > span {
                display: block;
                margin: 0 0 7px;
                line-height: 1.25;
                color: #64748B;
            }
            .account-grid .dashboard-card .big-number,
            .report-stat-grid .dashboard-card > strong {
                display: block;
                margin: 0;
                font-size: 28px;
                line-height: 1.1;
                letter-spacing: -0.02em;
                color: #0F172A;
            }
            .account-grid .dashboard-card > small {
                display: block;
                margin-top: 7px;
                color: #94A3B8;
                line-height: 1.2;
            }
            .report-stat-grid .dashboard-card > strong { margin-top: 1px; }
            .report-bar > div:first-child {
                display: flex;
                align-items: baseline;
                justify-content: space-between;
                gap: 18px;
            }
            .report-bar > div:first-child strong { white-space: nowrap; }
            @media (max-width: 600px) {
                .account-grid .dashboard-card .big-number,
                .report-stat-grid .dashboard-card > strong { font-size: 24px; }
            }
        `;
        document.head.appendChild(style);
    }
    document.addEventListener('DOMContentLoaded', inject);
    inject();
})();
