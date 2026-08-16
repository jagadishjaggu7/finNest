/* =================================
   FINNEST APP
================================= */
/* =================================
   FINNEST APPLICATION STATE
================================= */

let expenses = [
    {
        id: 1,
        amount: 1250,
        category: "Food & Dining",
        account: "UPI",
        type: "personal",
        note: "Grocery Store",
        date: "2026-08-16"
    },
    {
        id: 2,
        amount: 2460,
        category: "Bills & Utilities",
        account: "Bank Account",
        type: "shared",
        note: "Electricity Bill",
        date: "2026-08-15"
    },
    {
        id: 3,
        amount: 320,
        category: "Transport",
        account: "UPI",
        type: "personal",
        note: "Uber Ride",
        date: "2026-08-15"
    },
    {
        id: 4,
        amount: 499,
        category: "Entertainment",
        account: "Credit Card",
        type: "personal",
        note: "Netflix Subscription",
        date: "2026-08-14"
    }
];
let incomes = [
    {
        id: 1,
        amount: 45000,
        source: "Salary",
        date: "2026-08-01"
    }
];

document.addEventListener("DOMContentLoaded", () => {

    renderDashboard();
    const expenseSheet =
        document.getElementById("expenseSheet");

    const closeExpenseSheet =
        document.getElementById("closeExpenseSheet");

    const cancelExpense =
        document.getElementById("cancelExpense");

    const saveExpense =
        document.getElementById("saveExpense");

    const addExpenseButton =
        document.querySelector(".add-expense-button");

    const desktopAddExpense =
        document.getElementById("desktopAddExpense");

    /* ================================
       OPEN SHEET
    ================================= */

    /* =================================
   DASHBOARD RENDERING
================================= */

function renderDashboard() {

    const totalExpenses =
        expenses.reduce(
            (total, expense) =>
                total + Number(expense.amount),
            0
        );

    const totalIncome =
        incomes.reduce(
            (total, income) =>
                total + Number(income.amount),
            0
        );

    const availableAfterExpenses =
        totalIncome - totalExpenses;
    /* Update total */

    const totalExpensesElement =
        document.getElementById(
            "totalExpenses"
        );

    if (totalExpensesElement) {

        totalExpensesElement.textContent =
            formatCurrency(totalExpenses);

    }


    /* Update recent transactions */

    const transactionContainer =
        document.getElementById(
            "recentTransactions"
        );

    if (!transactionContainer) {
        return;
    }

    const savingsRate =
        totalIncome > 0
            ? (
                (availableAfterExpenses /
                    totalIncome) * 100
            )
            : 0;

    const savingsRateElement =
        document.getElementById(
            "savingsRate"
        );

    if (savingsRateElement) {

        savingsRateElement.textContent =
            savingsRate.toFixed(1) + "%";

    }
    const recentExpenses =
        [...expenses]
            .sort(
                (a, b) =>
                    new Date(b.date) -
                    new Date(a.date)
            )
            .slice(0, 5);


    transactionContainer.innerHTML =
        recentExpenses
            .map(expense => {

                return `
                    <div class="transaction" data=expense-id =  "${expense.id}">

                        <div class="transaction-icon">
                            ${getCategoryIcon(
                                expense.category
                            )}
                        </div>

                        <div class="transaction-info">

                            <strong>
                                ${escapeHtml(
                                    expense.note ||
                                    expense.category
                                )}
                            </strong>

                            <span>
                                ${escapeHtml(
                                    expense.category
                                )}
                                ·
                                ${escapeHtml(
                                    expense.account
                                )}
                            </span>

                        </div>

                        <strong
                            class="amount expense-amount"
                        >
                            -${formatCurrency(
                                expense.amount
                            )}
                        </strong>

                    </div>
                `;

            })
            .join("");
const balanceElement =
    document.getElementById("totalBalance");

const incomeElement =
    document.getElementById("totalIncome");

const expensesElement =
    document.getElementById("totalExpenses");

const availableElement =
    document.getElementById(
        "availableAfterExpenses"
    );


if (balanceElement) {

    balanceElement.textContent =
        formatCurrency(
            availableAfterExpenses
        );

}


if (incomeElement) {

    incomeElement.textContent =
        formatCurrency(
            totalIncome
        );

}


if (expensesElement) {

    expensesElement.textContent =
        formatCurrency(
            totalExpenses
        );

}


if (availableElement) {

    availableElement.textContent =
        formatCurrency(
            availableAfterExpenses
        );

}

}
    function formatCurrency(amount) {

    return "₹" +
        Number(amount).toLocaleString(
            "en-IN",
            {
                maximumFractionDigits: 0
            }
        );

}


function getCategoryIcon(category) {

    const icons = {

        "Food & Dining": "🍴",

        "Transport": "🚗",

        "Shopping": "🛍️",

        "Bills & Utilities": "💡",

        "Health": "❤️",

        "Entertainment": "🎬",

        "Other": "•••"

    };


    return icons[category] || "•••";

}


function escapeHtml(value) {

    const div =
        document.createElement("div");

    div.textContent =
        String(value);

    return div.innerHTML;

}
document
    .querySelectorAll(".transaction[data-expense-id]")
    .forEach(transaction => {

        transaction.addEventListener(
            "click",
            () => {

                const expenseId =
                    Number(
                        transaction.dataset.expenseId
                    );

                openEditExpense(expenseId);

            }
        );

    });
    function openExpenseSheet() {

        expenseSheet.classList.add("open");

        document.body.style.overflow = "hidden";

        setTimeout(() => {

            document
                .getElementById("expenseAmount")
                .focus();

        }, 250);
    }


    /* ================================
       CLOSE SHEET
    ================================= */

    function closeExpenseSheetModal() {

        expenseSheet.classList.remove("open");

        document.body.style.overflow = "";

    }


    /* ================================
       ADD BUTTON
    ================================= */

    if (addExpenseButton) {

        addExpenseButton.addEventListener(
            "click",
            openExpenseSheet
        );

    }

    if (desktopAddExpense) {

    desktopAddExpense.addEventListener(
        "click",
        openExpenseSheet
    );

}

    /* ================================
       CLOSE BUTTONS
    ================================= */

    closeExpenseSheet.addEventListener(
        "click",
        closeExpenseSheetModal
    );


    cancelExpense.addEventListener(
        "click",
        closeExpenseSheetModal
    );

renderExpenseOverview();
    /* ================================
       CLICK BACKDROP TO CLOSE
    ================================= */

    expenseSheet.addEventListener(
        "click",
        (event) => {

            if (
                event.target === expenseSheet
            ) {

                closeExpenseSheetModal();

            }

        }
    );

function renderExpenseOverview() {

    const totalExpenses = expenses.reduce(
        (total, expense) =>
            total + Number(expense.amount),
        0
    );

    const donutTotal =
        document.getElementById("donutTotal");

    if (donutTotal) {
        donutTotal.textContent =
            formatCurrency(totalExpenses);
    }

    const categoryTotals = {};

    expenses.forEach(expense => {
        const category = expense.category || "Other";
        categoryTotals[category] =
            (categoryTotals[category] || 0) +
            Number(expense.amount);
    });

    const categories =
        Object.entries(categoryTotals)
            .sort((a, b) => b[1] - a[1]);

    const colors = [
        "#10B981",
        "#3B82F6",
        "#8B5CF6",
        "#F97316",
        "#F59E0B",
        "#EF4444",
        "#64748B"
    ];

    const donut =
        document.querySelector(".donut-chart");

    if (donut && totalExpenses > 0) {
        let currentPercentage = 0;

        const gradientParts =
            categories.map(([category, amount], index) => {
                const percentage =
                    (amount / totalExpenses) * 100;
                const start = currentPercentage;
                currentPercentage += percentage;
                const color = colors[index % colors.length];
                return `${color} ${start}% ${currentPercentage}%`;
            });

        donut.style.setProperty(
            "--donut-gradient",
            `conic-gradient(${gradientParts.join(", ")})`
        );
    } else if (donut) {
        donut.style.setProperty(
            "--donut-gradient",
            "#CBD5E1"
        );
    }

    const categoryList =
        document.getElementById("expenseCategoryList");

    if (!categoryList) {
        return;
    }

    if (categories.length === 0) {
        categoryList.innerHTML = `
            <p style="color:#94A3B8;font-size:12px;">
                No expenses yet
            </p>
        `;
        return;
    }

    categoryList.innerHTML =
        categories.map(([category, amount], index) => {
            return `
                <div class="category-row">
                    <span>
                        <i
                            class="category-dot"
                            style="background:${colors[index % colors.length]};"
                        ></i>
                        ${escapeHtml(category)}
                    </span>
                    <strong>
                        ${formatCurrency(amount)}
                    </strong>
                </div>
            `;
        }).join("");
}

function getCategoryClass(category) {

    const classes = {

        "Food & Dining": "food",

        "Transport": "transport",

        "Shopping": "shopping",

        "Bills & Utilities": "bills",

        "Entertainment": "entertainment",

        "Health": "health",

        "Other": "other"

    };

    return classes[category] || "other";
}
    /* ================================
       CATEGORY SELECTION
    ================================= */

    const categoryChips =
        document.querySelectorAll(
            ".category-chip"
        );


    categoryChips.forEach((chip) => {

        chip.addEventListener(
            "click",
            () => {

                categoryChips.forEach(
                    (item) => {

                        item.classList.remove(
                            "selected"
                        );

                    }
                );


                chip.classList.add(
                    "selected"
                );

            }
        );

    });


    /* ================================
       EXPENSE TYPE
    ================================= */

    const typeOptions =
        document.querySelectorAll(
            ".type-option"
        );


    typeOptions.forEach((option) => {

        option.addEventListener(
            "click",
            () => {

                typeOptions.forEach(
                    (item) => {

                        item.classList.remove(
                            "selected"
                        );

                    }
                );


                option.classList.add(
                    "selected"
                );

            }
        );

    });


    /* ================================
       SAVE EXPENSE
    ================================= */

    saveExpense.addEventListener(
        "click",
        () => {

            const amount =
                document
                    .getElementById(
                        "expenseAmount"
                    )
                    .value;


            if (!amount || Number(amount) <= 0) {

                alert(
                    "Please enter a valid amount."
                );

                return;

            }


            const selectedCategory =
                document.querySelector(
                    ".category-chip.selected"
                );


            const selectedType =
                document.querySelector(
                    ".type-option.selected"
                );


            const expense = {

                amount: Number(amount),

                category:
                    selectedCategory
                        ?.dataset.category ||
                    "Other",

                account:
                    document.getElementById(
                        "expenseAccount"
                    ).value,

                type:
                    selectedType
                        ?.dataset.type ||
                    "personal",

                note:
                    document.getElementById(
                        "expenseNote"
                    ).value,

                date:
                    document.getElementById(
                        "expenseDate"
                    ).value

            };
            expense.id =
                Date.now();

            expenses.unshift(expense);

            renderDashboard();


            console.log(
                "New expense:",
                expense
            );


            alert(
                "Expense added successfully!"
            );


            closeExpenseSheetModal();


            resetExpenseForm();

        }
    );


    /* ================================
       RESET FORM
    ================================= */

    function resetExpenseForm() {

        document.getElementById(
            "expenseAmount"
        ).value = "";


        document.getElementById(
            "expenseNote"
        ).value = "";


        document.getElementById(
            "expenseDate"
        ).value = "";


        document
            .querySelectorAll(
                ".category-chip"
            )
            .forEach((chip, index) => {

                chip.classList.toggle(
                    "selected",
                    index === 0
                );

            });


        document
            .querySelectorAll(
                ".type-option"
            )
            .forEach((option, index) => {

                option.classList.toggle(
                    "selected",
                    index === 0
                );

            });

    }

});