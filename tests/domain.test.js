const test = require('node:test');
const assert = require('node:assert/strict');
const Domain = require('../src/domain');

test('calcula balances con precisión de céntimos', () => {
    const summary = Domain.computeMonthSummary({
        fortnights: {
            1: { income: '100.10', savings: '10.05' },
            2: { income: 200, savings: 20 }
        },
        categories: [{
            name: 'Comida',
            expenses: {
                1: [{ amount: '30.10' }, { amount: 0.2 }],
                2: [{ amount: 50 }]
            }
        }]
    });

    assert.equal(summary.byFortnight[1].expenses, 30.3);
    assert.equal(summary.byFortnight[1].balance, 59.75);
    assert.equal(summary.totalIncome, 300.1);
    assert.equal(summary.totalExpenses, 80.3);
    assert.equal(summary.totalSavings, 30.05);
    assert.equal(summary.totalBalance, 189.75);
});

test('rechaza montos vacíos o no numéricos sin convertirlos en cero válido', () => {
    assert.equal(Domain.parseAmount(''), null);
    assert.equal(Domain.parseAmount('abc'), null);
    assert.equal(Domain.parseAmount('12.50'), 12.5);
});

test('deriva movimientos sin duplicar escrituras auxiliares', () => {
    const movements = Domain.deriveMovements({
        fortnights: { 1: { income: 500, savings: 50, updated_at: '2026-08-01' } },
        categories: [{ name: 'Casa', expenses: { 1: [{ description: 'Alquiler', amount: 100, created_at: '2026-08-02' }] } }]
    }, 1);

    assert.deepEqual(movements.map(item => item.type), ['expense', 'income', 'savings']);
    assert.equal(movements.length, 3);
});

test('escapa contenido controlado por el usuario', () => {
    assert.equal(
        Domain.escapeHtml('<script>alert("x")</script>'),
        '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'
    );
});

test('construye historial mensual con montos enteros internamente', () => {
    const [month] = Domain.buildHistory([{
        id: 'month-1',
        year: 2026,
        month: 8,
        fortnights: [{
            id: 'fn-1',
            fortnight_number: 1,
            income: 100,
            savings: 10,
            expenses: [{ amount: '20.11' }]
        }]
    }]);

    assert.equal(month.totalIncome, 100);
    assert.equal(month.totalSavings, 10);
    assert.equal(month.totalExpenses, 20.11);
    assert.equal(month.balance, 69.89);
});
