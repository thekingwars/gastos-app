(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        root.FinanceDomain = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const FORTNIGHTS = [1, 2];

    function toNumber(value) {
        const number = typeof value === 'number' ? value : Number.parseFloat(value);
        return Number.isFinite(number) ? number : 0;
    }

    function parseAmount(value) {
        if (value === '' || value === null || value === undefined) return null;
        const number = typeof value === 'number' ? value : Number.parseFloat(value);
        return Number.isFinite(number) ? number : null;
    }

    function toCents(value) {
        return Math.round(toNumber(value) * 100);
    }

    function fromCents(value) {
        return Math.round(value) / 100;
    }

    function sumAmounts(items) {
        return fromCents((items || []).reduce((total, item) => total + toCents(item.amount), 0));
    }

    function normalizeExpense(expense) {
        return {
            ...expense,
            amount: fromCents(toCents(expense.amount)),
            description: String(expense.description || '').trim()
        };
    }

    function normalizeFortnight(fortnight) {
        return {
            ...fortnight,
            income: fromCents(toCents(fortnight.income)),
            savings: fromCents(toCents(fortnight.savings)),
            expenses: (fortnight.expenses || []).map(normalizeExpense)
        };
    }

    function normalizeMonthData(data) {
        const fortnights = {};
        FORTNIGHTS.forEach(number => {
            fortnights[number] = normalizeFortnight(data.fortnights?.[number] || {
                fortnight_number: number,
                income: 0,
                savings: 0,
                expenses: []
            });
        });

        const categories = (data.categories || []).map(category => ({
            ...category,
            name: String(category.name || '').trim(),
            expenses: {
                1: (category.expenses?.[1] || []).map(normalizeExpense),
                2: (category.expenses?.[2] || []).map(normalizeExpense)
            }
        }));

        return { ...data, fortnights, categories };
    }

    function computeMonthSummary(data) {
        const month = normalizeMonthData(data);
        const byFortnight = {};
        let totalIncomeCents = 0;
        let totalExpensesCents = 0;
        let totalSavingsCents = 0;

        FORTNIGHTS.forEach(number => {
            const fortnight = month.fortnights[number];
            const expensesCents = month.categories.reduce((total, category) => {
                return total + (category.expenses[number] || [])
                    .reduce((sum, expense) => sum + toCents(expense.amount), 0);
            }, 0);
            const incomeCents = toCents(fortnight.income);
            const savingsCents = toCents(fortnight.savings);
            byFortnight[number] = {
                income: fromCents(incomeCents),
                expenses: fromCents(expensesCents),
                savings: fromCents(savingsCents),
                balance: fromCents(incomeCents - expensesCents - savingsCents)
            };
            totalIncomeCents += incomeCents;
            totalExpensesCents += expensesCents;
            totalSavingsCents += savingsCents;
        });

        return {
            month,
            byFortnight,
            totalIncome: fromCents(totalIncomeCents),
            totalExpenses: fromCents(totalExpensesCents),
            totalSavings: fromCents(totalSavingsCents),
            totalBalance: fromCents(totalIncomeCents - totalExpensesCents - totalSavingsCents)
        };
    }

    function buildHistory(months) {
        return (months || []).map(month => {
            const fortnights = {};
            let totalIncomeCents = 0;
            let totalSavingsCents = 0;
            let totalExpensesCents = 0;

            (month.fortnights || []).forEach(rawFortnight => {
                const expensesCents = (rawFortnight.expenses || [])
                    .reduce((sum, expense) => sum + toCents(expense.amount), 0);
                const incomeCents = toCents(rawFortnight.income);
                const savingsCents = toCents(rawFortnight.savings);
                fortnights[rawFortnight.fortnight_number] = {
                    id: rawFortnight.id,
                    income: fromCents(incomeCents),
                    savings: fromCents(savingsCents),
                    expenses: fromCents(expensesCents)
                };
                totalIncomeCents += incomeCents;
                totalSavingsCents += savingsCents;
                totalExpensesCents += expensesCents;
            });

            return {
                id: month.id,
                key: `${month.year}-${String(month.month).padStart(2, '0')}`,
                year: month.year,
                month: month.month,
                fortnights,
                totalIncome: fromCents(totalIncomeCents),
                totalSavings: fromCents(totalSavingsCents),
                totalExpenses: fromCents(totalExpensesCents),
                balance: fromCents(totalIncomeCents - totalExpensesCents - totalSavingsCents)
            };
        });
    }

    function deriveMovements(data, fortnightNumber) {
        const month = normalizeMonthData(data);
        const fortnight = month.fortnights[fortnightNumber];
        if (!fortnight) return [];

        const movements = [];
        if (fortnight.income > 0) {
            movements.push({
                type: 'income',
                description: `Ingreso ${fortnightNumber === 1 ? '1ra' : '2da'} quincena`,
                amount: fortnight.income,
                timestamp: fortnight.updated_at || ''
            });
        }
        if (fortnight.savings > 0) {
            movements.push({
                type: 'savings',
                description: `Ahorro ${fortnightNumber === 1 ? '1ra' : '2da'} quincena`,
                amount: fortnight.savings,
                timestamp: fortnight.updated_at || ''
            });
        }

        month.categories.forEach(category => {
            (category.expenses[fortnightNumber] || []).forEach(expense => {
                movements.push({
                    type: 'expense',
                    description: `${category.name}: ${expense.description}`,
                    amount: expense.amount,
                    timestamp: expense.created_at || expense.expense_date || expense.updated_at || ''
                });
            });
        });

        return movements
            .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
            .slice(0, 10);
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    return {
        FORTNIGHTS,
        toNumber,
        parseAmount,
        toCents,
        fromCents,
        sumAmounts,
        normalizeMonthData,
        computeMonthSummary,
        buildHistory,
        deriveMovements,
        escapeHtml
    };
});
