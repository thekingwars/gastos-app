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

test('reparte un gasto de viaje entre 2 personas por defecto', () => {
    assert.equal(Domain.DEFAULT_TRAVEL_PEOPLE, 2);
    assert.equal(Domain.parsePeopleCount(''), 2);
    assert.equal(Domain.parsePeopleCount(null), 2);
    assert.equal(Domain.parsePeopleCount(undefined), 2);
    assert.equal(Domain.parsePeopleCount('3'), 3);
    assert.equal(Domain.parsePeopleCount(1), 1);
    assert.equal(Domain.parsePeopleCount(0), null);
    assert.equal(Domain.parsePeopleCount(-2), null);
    assert.equal(Domain.parsePeopleCount('abc'), null);
    assert.equal(Domain.splitAmount(100, 2), 50);
    assert.equal(Domain.splitAmount('80.50', ''), 40.25);
    assert.equal(Domain.splitAmount(10.01, 2), 5.01);
    assert.equal(Domain.splitAmount(100, 1), 100);
    assert.equal(Domain.splitAmount(0, 2), null);
});

test('resume viajes de forma autónoma y no altera el resumen mensual', () => {
    const travel = Domain.computeTravelSummary([
        { trip_name: 'Cancún', expense_type: 'Comida', amount: '80.50', people_count: 2 },
        { trip_name: 'Cancún', expense_type: 'Transporte', amount: 40, people_count: '' },
        { trip_name: 'Oaxaca', expense_type: 'Alojamiento', amount: 300, people_count: 3 }
    ]);

    assert.equal(travel.count, 3);
    assert.equal(travel.total, 420.5);
    assert.equal(travel.trips.length, 2);
    const cancun = travel.trips.find(trip => trip.name === 'Cancún');
    assert.equal(cancun.total, 120.5);
    assert.equal(cancun.peopleCount, 2);
    assert.equal(cancun.share, 60.25);
    const oaxaca = travel.trips.find(trip => trip.name === 'Oaxaca');
    assert.equal(oaxaca.peopleCount, 3);
    assert.equal(oaxaca.share, 100);

    const mixed = Domain.computeTravelSummary([
        { trip_name: 'Mixto', expense_type: 'Comida', amount: 100, people_count: 2 },
        { trip_name: 'Mixto', expense_type: 'Transporte', amount: 90, people_count: 3 }
    ]);
    assert.equal(mixed.trips[0].peopleCount, null);
    assert.equal(mixed.trips[0].share, null);
    assert.equal(mixed.trips[0].expenses[0].share, 50);
    assert.equal(mixed.trips[0].expenses[1].share, 30);

    const month = Domain.computeMonthSummary({
        fortnights: { 1: { income: 500, savings: 50 }, 2: { income: 0, savings: 0 } },
        categories: [{ name: 'Casa', expenses: { 1: [{ amount: 100 }], 2: [] } }],
        travelExpenses: travel.expenses
    });
    assert.equal(month.totalExpenses, 100);
    assert.equal(month.totalBalance, 350);
});
