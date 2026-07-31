// Finance App - Main JavaScript with Fortnight Support + Supabase Only
class FinanceApp {
    constructor() {
        this.currentDate = new Date();
        this.currentMonth = this.currentDate.getMonth();
        this.currentYear = this.currentDate.getFullYear();
        this.currentFortnight = 1;
        this.currentCategoryId = null;
        this.editingExpenseId = null;
        this.historyFilter = 'months';
        this.comparisonType = 'monthly';
        this.supabase = null;
        this.data = { months: {}, totalSavings: 0 };
        this.loaded = false;
        
        this.initSupabase();
    }

    initSupabase() {
        const SUPABASE_URL = 'https://wtsyqitibsnmadqfgvws.supabase.co';
        const SUPABASE_KEY = 'sb_publishable_pHmKecskZROITf5B1aZopw_n8ErgLc1';
        
        try {
            this.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            this.loadData();
        } catch (e) {
            console.error('Supabase init error:', e);
            this.showError('Error al conectar con Supabase: ' + e.message);
        }
    }

    async loadData() {
        this.updateSyncUI('loading');
        
        try {
            const { data, error } = await this.supabase
                .from('finance_data')
                .select('data, updated_at')
                .eq('id', 'main')
                .single();
            
            if (error) {
                if (error.code === 'PGRST116' || error.message.includes('relation') || error.message.includes('does not exist')) {
                    this.showSetup();
                    return;
                }
                throw error;
            }
            
            if (data && data.data) {
                this.data = data.data;
                this.updateSyncUI('synced');
            } else {
                await this.saveData();
            }
            
            this.loaded = true;
            this.init();
        } catch (e) {
            console.error('Load error:', e);
            if (e.message && (e.message.includes('relation') || e.message.includes('does not exist'))) {
                this.showSetup();
            } else {
                this.showError('Error al cargar datos: ' + e.message);
            }
        }
    }

    async saveData() {
        if (!this.supabase) return;
        
        this.updateSyncUI('syncing');
        
        try {
            const { error } = await this.supabase
                .from('finance_data')
                .upsert({
                    id: 'main',
                    data: this.data,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'id' });
            
            if (error) throw error;
            this.updateSyncUI('synced');
        } catch (e) {
            console.error('Save error:', e);
            this.updateSyncUI('error');
        }
    }

    showError(msg) {
        const indicator = document.getElementById('sync-indicator');
        if (indicator) {
            indicator.classList.remove('hidden');
            indicator.className = 'sync-indicator error';
            indicator.querySelector('#sync-text').textContent = 'Error';
            indicator.querySelector('#sync-icon').textContent = '❌';
        }
        console.error(msg);
    }

    showSetup() {
        document.getElementById('app-container').innerHTML = `
            <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;">
                <div style="background:#1e293b;padding:40px;border-radius:16px;max-width:500px;text-align:center;">
                    <h1 style="color:#f8fafc;margin-bottom:20px;">💰 Mis Finanzas</h1>
                    <div style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#fca5a5;padding:15px;border-radius:8px;margin-bottom:20px;">
                        <strong>La tabla no existe en Supabase</strong>
                    </div>
                    <p style="color:#94a3b8;margin-bottom:20px;">Abre <code style="color:#a5b4fc;">setup.html</code> para crear la tabla, o ejecuta este SQL en tu dashboard de Supabase:</p>
                    <pre style="background:#0f172a;padding:15px;border-radius:8px;text-align:left;overflow-x:auto;border:1px solid #334155;"><code style="color:#a5b4fc;">CREATE TABLE IF NOT EXISTS finance_data (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE finance_data
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON finance_data
  FOR ALL USING (true)
  WITH CHECK (true);

INSERT INTO finance_data (id, data)
VALUES ('main', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;</code></pre>
                    <button onclick="location.reload()" style="background:#6366f1;color:white;border:none;padding:12px 24px;border-radius:8px;cursor:pointer;font-size:16px;margin-top:20px;">Recargar después de crear la tabla</button>
                </div>
            </div>
        `;
    }

    updateSyncUI(status) {
        const indicator = document.getElementById('sync-indicator');
        if (!indicator) return;
        
        indicator.classList.remove('hidden');
        
        switch (status) {
            case 'loading':
                indicator.className = 'sync-indicator syncing';
                indicator.querySelector('#sync-icon').textContent = '🔄';
                indicator.querySelector('#sync-text').textContent = 'Cargando...';
                break;
            case 'synced':
                indicator.className = 'sync-indicator synced';
                indicator.querySelector('#sync-icon').textContent = '✅';
                indicator.querySelector('#sync-text').textContent = 'Sincronizado';
                break;
            case 'syncing':
                indicator.className = 'sync-indicator syncing';
                indicator.querySelector('#sync-icon').textContent = '🔄';
                indicator.querySelector('#sync-text').textContent = 'Guardando...';
                break;
            case 'error':
                indicator.className = 'sync-indicator error';
                indicator.querySelector('#sync-icon').textContent = '⚠️';
                indicator.querySelector('#sync-text').textContent = 'Error';
                break;
        }
    }

    init() {
        this.setupEventListeners();
        this.updateMonthDisplay();
        this.updateDashboard();
        this.renderCategories();
        this.renderHistory();
        this.renderComparisons();
        this.initCharts();
    }

    getMonthKey() {
        return `${this.currentYear}-${String(this.currentMonth + 1).padStart(2, '0')}`;
    }

    getMonthData() {
        const key = this.getMonthKey();
        if (!this.data.months[key]) {
            this.data.months[key] = {
                fortnights: {
                    1: { income: 0, expenses: [], savings: 0, movements: [] },
                    2: { income: 0, expenses: [], savings: 0, movements: [] }
                },
                categories: []
            };
        }
        
        const monthData = this.data.months[key];
        
        if (!monthData.fortnights) {
            monthData.fortnights = {
                1: { income: 0, expenses: [], savings: 0, movements: [] },
                2: { income: 0, expenses: [], savings: 0, movements: [] }
            };
        }
        
        for (const fn of [1, 2]) {
            if (!monthData.fortnights[fn]) {
                monthData.fortnights[fn] = { income: 0, expenses: [], savings: 0, movements: [] };
            }
            if (!Array.isArray(monthData.fortnights[fn].expenses)) {
                monthData.fortnights[fn].expenses = [];
            }
            if (!Array.isArray(monthData.fortnights[fn].movements)) {
                monthData.fortnights[fn].movements = [];
            }
        }
        
        if (!Array.isArray(monthData.categories)) {
            monthData.categories = [];
        }
        
        monthData.categories.forEach(category => {
            if (!category.expenses) {
                category.expenses = { 1: [], 2: [] };
            } else if (Array.isArray(category.expenses)) {
                const oldExpenses = category.expenses;
                category.expenses = { 1: oldExpenses, 2: [] };
            }
            if (!Array.isArray(category.expenses[1])) {
                category.expenses[1] = [];
            }
            if (!Array.isArray(category.expenses[2])) {
                category.expenses[2] = [];
            }
        });
        
        return monthData;
    }

    getFortnightData() {
        const monthData = this.getMonthData();
        return monthData.fortnights[this.currentFortnight];
    }

    updateMonthDisplay() {
        const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                       'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        document.getElementById('current-month-display').textContent = 
            `${months[this.currentMonth]} ${this.currentYear}`;
        
        const fortnightInfo = document.getElementById('fortnight-info');
        if (this.currentFortnight === 1) {
            fortnightInfo.textContent = 'Estás en la 1ra quincena del mes (días 1-15)';
        } else {
            fortnightInfo.textContent = 'Estás en la 2da quincena del mes (días 16-31)';
        }
        
        this.updateMonthSummary();
        this.updateDashboard();
    }

    prevMonth() {
        this.currentMonth--;
        if (this.currentMonth < 0) {
            this.currentMonth = 11;
            this.currentYear--;
        }
        this.updateMonthDisplay();
        this.renderCategories();
        this.updateMonthSummary();
    }

    nextMonth() {
        this.currentMonth++;
        if (this.currentMonth > 11) {
            this.currentMonth = 0;
            this.currentYear++;
        }
        this.updateMonthDisplay();
        this.renderCategories();
        this.updateMonthSummary();
    }

    switchFortnight(fortnight) {
        this.currentFortnight = fortnight;
        
        document.querySelectorAll('.fortnight-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-fortnight="${fortnight}"]`).classList.add('active');
        
        this.updateMonthDisplay();
        this.renderCategories();
        this.updateMonthSummary();
    }

    setIncome() {
        const input = document.getElementById('income-input');
        const amount = parseFloat(input.value);
        if (!isNaN(amount) && amount >= 0) {
            const fortnightData = this.getFortnightData();
            fortnightData.income = amount;
            this.addMovement('income', `Ingreso ${this.currentFortnight === 1 ? '1ra' : '2da'} quincena`, amount);
            this.saveData();
            this.updateMonthSummary();
            this.updateDashboard();
            input.value = '';
        }
    }

    addCategory() {
        const modal = document.getElementById('category-modal');
        modal.classList.add('active');
    }

    saveCategory() {
        const input = document.getElementById('category-name');
        const name = input.value.trim();
        if (name) {
            const monthData = this.getMonthData();
            const category = {
                id: Date.now(),
                name: name,
                expenses: { 1: [], 2: [] }
            };
            monthData.categories.push(category);
            this.saveData();
            this.renderCategories();
            this.closeCategoryModal();
            input.value = '';
        }
    }

    deleteCategory(categoryId) {
        if (confirm('¿Estás seguro de eliminar esta categoría y todos sus gastos?')) {
            const monthData = this.getMonthData();
            monthData.categories = monthData.categories.filter(c => c.id !== categoryId);
            this.saveData();
            this.renderCategories();
            this.updateMonthSummary();
            this.updateDashboard();
        }
    }

    addExpense(categoryId) {
        this.currentCategoryId = categoryId;
        const monthData = this.getMonthData();
        const category = monthData.categories.find(c => c.id === categoryId);
        document.getElementById('expense-category-name').textContent = `Categoría: ${category.name}`;
        document.getElementById('expense-fortnight-info').textContent = 
            `Quincena: ${this.currentFortnight === 1 ? '1ra (1-15)' : '2da (16-31)'}`;
        const modal = document.getElementById('expense-modal');
        modal.classList.add('active');
    }

    saveExpense() {
        const desc = document.getElementById('expense-desc').value.trim();
        const amount = parseFloat(document.getElementById('expense-amount').value);
        
        if (desc && !isNaN(amount) && amount > 0) {
            const monthData = this.getMonthData();
            const category = monthData.categories.find(c => c.id === this.currentCategoryId);
            
            const expense = {
                id: Date.now(),
                description: desc,
                amount: amount,
                fortnight: this.currentFortnight
            };
            
            category.expenses[this.currentFortnight].push(expense);
            this.addMovement('expense', `${category.name}: ${desc}`, amount);
            this.saveData();
            this.renderCategories();
            this.closeExpenseModal();
            this.updateMonthSummary();
            this.updateDashboard();
            
            document.getElementById('expense-desc').value = '';
            document.getElementById('expense-amount').value = '';
        }
    }

    editExpense(expenseId) {
        this.editingExpenseId = expenseId;
        const monthData = this.getMonthData();
        
        let expense = null;
        
        for (const cat of monthData.categories) {
            for (const fn of [1, 2]) {
                const fnExpenses = cat.expenses?.[fn] || [];
                if (Array.isArray(fnExpenses)) {
                    const found = fnExpenses.find(e => e.id === expenseId);
                    if (found) {
                        expense = found;
                        break;
                    }
                }
            }
            if (expense) break;
        }
        
        if (expense) {
            document.getElementById('edit-expense-desc').value = expense.description;
            document.getElementById('edit-expense-amount').value = expense.amount;
            const modal = document.getElementById('edit-expense-modal');
            modal.classList.add('active');
        }
    }

    updateExpense() {
        const desc = document.getElementById('edit-expense-desc').value.trim();
        const amount = parseFloat(document.getElementById('edit-expense-amount').value);
        
        if (desc && !isNaN(amount) && amount > 0) {
            const monthData = this.getMonthData();
            
            for (const category of monthData.categories) {
                for (const fn of [1, 2]) {
                    const expense = category.expenses[fn].find(e => e.id === this.editingExpenseId);
                    if (expense) {
                        expense.description = desc;
                        expense.amount = amount;
                        break;
                    }
                }
            }
            
            this.saveData();
            this.renderCategories();
            this.closeEditExpenseModal();
            this.updateMonthSummary();
            this.updateDashboard();
        }
    }

    deleteExpense() {
        if (confirm('¿Estás seguro de eliminar este gasto?')) {
            const monthData = this.getMonthData();
            
            for (const category of monthData.categories) {
                for (const fn of [1, 2]) {
                    const expenseIndex = category.expenses[fn].findIndex(e => e.id === this.editingExpenseId);
                    if (expenseIndex !== -1) {
                        category.expenses[fn].splice(expenseIndex, 1);
                        break;
                    }
                }
            }
            
            this.saveData();
            this.renderCategories();
            this.closeEditExpenseModal();
            this.updateMonthSummary();
            this.updateDashboard();
        }
    }

    setSavings() {
        const input = document.getElementById('savings-input');
        const amount = parseFloat(input.value);
        if (!isNaN(amount) && amount >= 0) {
            const fortnightData = this.getFortnightData();
            fortnightData.savings = amount;
            this.addMovement('savings', `Ahorro ${this.currentFortnight === 1 ? '1ra' : '2da'} quincena`, amount);
            this.saveData();
            this.updateTotalSavings();
            this.updateMonthSummary();
            this.updateDashboard();
            input.value = '';
        }
    }

    updateTotalSavings() {
        let total = 0;
        Object.values(this.data.months).forEach(month => {
            if (month.fortnights) {
                total += (month.fortnights[1]?.savings || 0) + (month.fortnights[2]?.savings || 0);
            }
        });
        this.data.totalSavings = total;
        document.getElementById('total-savings').textContent = this.formatCurrency(total);
    }

    addMovement(type, description, amount) {
        const fortnightData = this.getFortnightData();
        fortnightData.movements.push({
            type,
            description,
            amount,
            timestamp: Date.now()
        });
    }

    updateMonthSummary() {
        const monthData = this.getMonthData();
        const fortnightData = this.getFortnightData();
        
        let fortnightExpenses = 0;
        monthData.categories.forEach(cat => {
            const fnExpenses = cat.expenses?.[this.currentFortnight] || [];
            if (Array.isArray(fnExpenses)) {
                fnExpenses.forEach(exp => {
                    fortnightExpenses += exp.amount;
                });
            }
        });
        
        const fortnightBalance = fortnightData.income - fortnightExpenses - fortnightData.savings;
        
        let totalMonthExpenses = 0;
        let totalMonthIncome = 0;
        let totalMonthSavings = 0;
        
        for (const fn of [1, 2]) {
            const fnData = monthData.fortnights[fn];
            totalMonthIncome += fnData.income;
            totalMonthSavings += fnData.savings;
            
            monthData.categories.forEach(cat => {
                const fnExpenses = cat.expenses?.[fn] || [];
                if (Array.isArray(fnExpenses)) {
                    fnExpenses.forEach(exp => {
                        totalMonthExpenses += exp.amount;
                    });
                }
            });
        }
        
        const totalMonthBalance = totalMonthIncome - totalMonthExpenses - totalMonthSavings;
        
        document.getElementById('current-income').textContent = this.formatCurrency(fortnightData.income);
        document.getElementById('income-input').value = fortnightData.income || '';
        
        document.getElementById('current-savings').textContent = this.formatCurrency(fortnightData.savings);
        document.getElementById('savings-input').value = fortnightData.savings || '';
        
        document.getElementById('summary-income').textContent = this.formatCurrency(fortnightData.income);
        document.getElementById('summary-expenses').textContent = this.formatCurrency(fortnightExpenses);
        document.getElementById('summary-savings').textContent = this.formatCurrency(fortnightData.savings);
        document.getElementById('summary-balance').textContent = this.formatCurrency(fortnightBalance);
        
        const balanceElement = document.getElementById('summary-balance');
        balanceElement.className = fortnightBalance >= 0 ? 'value positive' : 'value negative';
        
        document.getElementById('total-month-income').textContent = this.formatCurrency(totalMonthIncome);
        document.getElementById('total-month-savings').textContent = this.formatCurrency(totalMonthSavings);
        
        document.getElementById('summary-total-income').textContent = this.formatCurrency(totalMonthIncome);
        document.getElementById('summary-total-expenses').textContent = this.formatCurrency(totalMonthExpenses);
        document.getElementById('summary-total-savings').textContent = this.formatCurrency(totalMonthSavings);
        document.getElementById('summary-total-balance').textContent = this.formatCurrency(totalMonthBalance);
        
        const totalBalanceElement = document.getElementById('summary-total-balance');
        totalBalanceElement.className = totalMonthBalance >= 0 ? 'value positive' : 'value negative';
        
        this.updateTotalSavings();
    }

    updateDashboard() {
        const monthData = this.getMonthData();
        
        let totalExpenses = 0;
        let totalIncome = 0;
        let totalSavings = 0;
        
        for (const fn of [1, 2]) {
            const fnData = monthData.fortnights[fn];
            totalIncome += fnData.income;
            totalSavings += fnData.savings;
            
            monthData.categories.forEach(cat => {
                const fnExpenses = cat.expenses?.[fn] || [];
                if (Array.isArray(fnExpenses)) {
                    fnExpenses.forEach(exp => {
                        totalExpenses += exp.amount;
                    });
                }
            });
        }
        
        const balance = totalIncome - totalExpenses - totalSavings;
        
        document.getElementById('dash-ingreso').textContent = this.formatCurrency(totalIncome);
        document.getElementById('dash-gastos').textContent = this.formatCurrency(totalExpenses);
        document.getElementById('dash-ahorros').textContent = this.formatCurrency(totalSavings);
        document.getElementById('dash-balance').textContent = this.formatCurrency(balance);
        
        const balanceElement = document.getElementById('dash-balance');
        balanceElement.className = balance >= 0 ? 'value positive' : 'value negative';
        
        this.updateFortnightComparison();
        this.renderRecentMovements();
    }

    updateFortnightComparison() {
        const monthData = this.getMonthData();
        
        const fn1Data = monthData.fortnights[1];
        let fn1Expenses = 0;
        monthData.categories.forEach(cat => {
            const fn1CatExpenses = cat.expenses?.[1] || [];
            if (Array.isArray(fn1CatExpenses)) {
                fn1CatExpenses.forEach(exp => fn1Expenses += exp.amount);
            }
        });
        
        const fn2Data = monthData.fortnights[2];
        let fn2Expenses = 0;
        monthData.categories.forEach(cat => {
            const fn2CatExpenses = cat.expenses?.[2] || [];
            if (Array.isArray(fn2CatExpenses)) {
                fn2CatExpenses.forEach(exp => fn2Expenses += exp.amount);
            }
        });
        
        document.getElementById('dash-q1-income').textContent = this.formatCurrency(fn1Data.income);
        document.getElementById('dash-q1-expenses').textContent = this.formatCurrency(fn1Expenses);
        document.getElementById('dash-q1-savings').textContent = this.formatCurrency(fn1Data.savings);
        
        document.getElementById('dash-q2-income').textContent = this.formatCurrency(fn2Data.income);
        document.getElementById('dash-q2-expenses').textContent = this.formatCurrency(fn2Expenses);
        document.getElementById('dash-q2-savings').textContent = this.formatCurrency(fn2Data.savings);
    }

    renderRecentMovements() {
        const fortnightData = this.getFortnightData();
        const container = document.getElementById('recent-movements');
        
        if (!fortnightData.movements || fortnightData.movements.length === 0) {
            container.innerHTML = '<p class="empty-state">No hay movimientos esta quincena</p>';
            return;
        }
        
        const recent = fortnightData.movements.slice(-10).reverse();
        container.innerHTML = recent.map(m => `
            <div class="movement-item">
                <span class="movement-desc">${m.description}</span>
                <span class="movement-amount ${m.type}">${m.type === 'expense' ? '-' : '+'}${this.formatCurrency(m.amount)}</span>
            </div>
        `).join('');
    }

    renderCategories() {
        const monthData = this.getMonthData();
        const container = document.getElementById('categories-container');
        
        if (monthData.categories.length === 0) {
            container.innerHTML = '<p class="empty-state">Agrega categorías para empezar a registrar gastos</p>';
            return;
        }
        
        container.innerHTML = monthData.categories.map(category => {
            if (!category.expenses) {
                category.expenses = { 1: [], 2: [] };
            }
            if (!Array.isArray(category.expenses[1])) {
                category.expenses[1] = [];
            }
            if (!Array.isArray(category.expenses[2])) {
                category.expenses[2] = [];
            }
            
            const currentFnExpenses = category.expenses[this.currentFortnight] || [];
            const fn1Expenses = category.expenses[1] || [];
            const fn2Expenses = category.expenses[2] || [];
            
            const totalCurrentFn = currentFnExpenses.reduce((sum, exp) => sum + exp.amount, 0);
            const totalAllFn = fn1Expenses.reduce((sum, exp) => sum + exp.amount, 0) + 
                              fn2Expenses.reduce((sum, exp) => sum + exp.amount, 0);
            
            return `
                <div class="category-item">
                    <div class="category-header">
                        <span class="category-name">${category.name}</span>
                        <div>
                            <span class="category-total" title="Total quincena: ${this.formatCurrency(totalCurrentFn)}">
                                ${this.formatCurrency(totalAllFn)}
                            </span>
                            <button class="delete-category-btn" onclick="app.deleteCategory(${category.id})">×</button>
                        </div>
                    </div>
                    <button class="add-expense-btn" onclick="app.addExpense(${category.id})">+ Agregar Gasto</button>
                    <div class="expenses-list">
                        ${currentFnExpenses.map(exp => `
                            <div class="expense-item" onclick="app.editExpense(${exp.id})">
                                <span class="expense-desc">${exp.description}</span>
                                <span class="expense-amount">${this.formatCurrency(exp.amount)}</span>
                            </div>
                        `).join('')}
                        ${currentFnExpenses.length === 0 ? 
                            '<p class="empty-state" style="padding: 10px;">No hay gastos esta quincena</p>' : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    renderHistory() {
        const container = document.getElementById('history-container');
        const months = Object.entries(this.data.months).sort((a, b) => b[0].localeCompare(a[0]));
        
        if (months.length === 0) {
            container.innerHTML = '<p class="empty-state">No hay registros aún</p>';
            return;
        }
        
        const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
                           'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        
        if (this.historyFilter === 'months') {
            container.innerHTML = months.map(([key, data]) => {
                const [year, month] = key.split('-');
                
                let totalExpenses = 0;
                let totalIncome = 0;
                let totalSavings = 0;
                
                for (const fn of [1, 2]) {
                    const fnData = data.fortnights[fn];
                    totalIncome += fnData.income;
                    totalSavings += fnData.savings;
                    
                    data.categories.forEach(cat => {
                        const fnExpenses = cat.expenses?.[fn] || [];
                        if (Array.isArray(fnExpenses)) {
                            fnExpenses.forEach(exp => totalExpenses += exp.amount);
                        }
                    });
                }
                
                const balance = totalIncome - totalExpenses - totalSavings;
                
                return `
                    <div class="history-card" onclick="app.loadMonth('${key}')">
                        <div class="history-month">${monthNames[parseInt(month) - 1]} ${year}</div>
                        <div class="history-stats">
                            <div class="history-stat">
                                <span>Ingreso Total:</span>
                                <span>${this.formatCurrency(totalIncome)}</span>
                            </div>
                            <div class="history-stat">
                                <span>Gastos Totales:</span>
                                <span class="negative">${this.formatCurrency(totalExpenses)}</span>
                            </div>
                            <div class="history-stat">
                                <span>Ahorros Totales:</span>
                                <span class="positive">${this.formatCurrency(totalSavings)}</span>
                            </div>
                            <div class="history-stat">
                                <span>Balance:</span>
                                <span class="${balance >= 0 ? 'positive' : 'negative'}">${this.formatCurrency(balance)}</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            let fortnightCards = [];
            
            months.forEach(([key, data]) => {
                const [year, month] = key.split('-');
                
                for (const fn of [1, 2]) {
                    const fnData = data.fortnights[fn];
                    let fnExpenses = 0;
                    
                    data.categories.forEach(cat => {
                        const catFnExpenses = cat.expenses?.[fn] || [];
                        if (Array.isArray(catFnExpenses)) {
                            catFnExpenses.forEach(exp => fnExpenses += exp.amount);
                        }
                    });
                    
                    const fnBalance = fnData.income - fnExpenses - fnData.savings;
                    
                    fortnightCards.push(`
                        <div class="history-fortnight-card" onclick="app.loadFortnight('${key}', ${fn})">
                            <div class="fortnight-label">${fn === 1 ? '1ra Quincena' : '2da Quincena'}</div>
                            <div class="history-month">${monthNames[parseInt(month) - 1]} ${year}</div>
                            <div class="history-stats">
                                <div class="history-stat">
                                    <span>Ingreso:</span>
                                    <span>${this.formatCurrency(fnData.income)}</span>
                                </div>
                                <div class="history-stat">
                                    <span>Gastos:</span>
                                    <span class="negative">${this.formatCurrency(fnExpenses)}</span>
                                </div>
                                <div class="history-stat">
                                    <span>Ahorros:</span>
                                    <span class="positive">${this.formatCurrency(fnData.savings)}</span>
                                </div>
                                <div class="history-stat">
                                    <span>Balance:</span>
                                    <span class="${fnBalance >= 0 ? 'positive' : 'negative'}">${this.formatCurrency(fnBalance)}</span>
                                </div>
                            </div>
                        </div>
                    `);
                }
            });
            
            container.innerHTML = fortnightCards.join('');
        }
    }

    loadMonth(key) {
        const [year, month] = key.split('-');
        this.currentYear = parseInt(year);
        this.currentMonth = parseInt(month) - 1;
        this.updateMonthDisplay();
        this.renderCategories();
        this.switchTab('mes-actual');
    }

    loadFortnight(key, fortnight) {
        const [year, month] = key.split('-');
        this.currentYear = parseInt(year);
        this.currentMonth = parseInt(month) - 1;
        this.currentFortnight = fortnight;
        
        document.querySelectorAll('.fortnight-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-fortnight="${fortnight}"]`).classList.add('active');
        
        this.updateMonthDisplay();
        this.renderCategories();
        this.switchTab('mes-actual');
    }

    renderComparisons() {
        if (this.comparisonType === 'monthly') {
            this.renderMonthlyComparisons();
        } else {
            this.renderFortnightlyComparisons();
        }
    }

    renderMonthlyComparisons() {
        const months = Object.entries(this.data.months).sort((a, b) => a[0].localeCompare(b[0]));
        
        if (months.length === 0) return;
        
        let totalExpenses = 0;
        let totalSavings = 0;
        let maxExpenseMonth = { key: '', amount: 0 };
        let maxSavingsMonth = { key: '', amount: 0 };
        
        months.forEach(([key, data]) => {
            let monthExpenses = 0;
            let monthSavings = 0;
            
            for (const fn of [1, 2]) {
                monthSavings += data.fortnights[fn].savings;
                data.categories.forEach(cat => {
                    const fnExpenses = cat.expenses?.[fn] || [];
                    if (Array.isArray(fnExpenses)) {
                        fnExpenses.forEach(exp => monthExpenses += exp.amount);
                    }
                });
            }
            
            totalExpenses += monthExpenses;
            totalSavings += monthSavings;
            
            if (monthExpenses > maxExpenseMonth.amount) {
                maxExpenseMonth = { key, amount: monthExpenses };
            }
            if (monthSavings > maxSavingsMonth.amount) {
                maxSavingsMonth = { key, amount: monthSavings };
            }
        });
        
        const avgExpenses = totalExpenses / months.length;
        const avgSavings = totalSavings / months.length;
        
        document.getElementById('avg-expenses').textContent = this.formatCurrency(avgExpenses);
        document.getElementById('avg-savings').textContent = this.formatCurrency(avgSavings);
        document.getElementById('max-expense-month').textContent = 
            maxExpenseMonth.key ? this.formatMonthKey(maxExpenseMonth.key) : 'N/A';
        document.getElementById('max-savings-month').textContent = 
            maxSavingsMonth.key ? this.formatMonthKey(maxSavingsMonth.key) : 'N/A';
        
        document.getElementById('trend-title').textContent = 'Tendencia de Gastos Mensuales';
        document.getElementById('savings-title').textContent = 'Tendencia de Ahorros Mensuales';
        
        this.updateTrendChart(months, 'monthly');
        this.updateSavingsChart(months, 'monthly');
    }

    renderFortnightlyComparisons() {
        const months = Object.entries(this.data.months).sort((a, b) => a[0].localeCompare(b[0]));
        
        if (months.length === 0) return;
        
        let allFortnights = [];
        let totalExpenses = 0;
        let totalSavings = 0;
        let maxExpenseFortnight = { label: '', amount: 0 };
        let maxSavingsFortnight = { label: '', amount: 0 };
        
        months.forEach(([key, data]) => {
            const [year, month] = key.split('-');
            const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
                               'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
            
            for (const fn of [1, 2]) {
                const fnData = data.fortnights[fn];
                let fnExpenses = 0;
                
                data.categories.forEach(cat => {
                    const catFnExpenses = cat.expenses?.[fn] || [];
                    if (Array.isArray(catFnExpenses)) {
                        catFnExpenses.forEach(exp => fnExpenses += exp.amount);
                    }
                });
                
                const label = `${monthNames[parseInt(month) - 1]} ${fn === 1 ? 'Q1' : 'Q2'}`;
                allFortnights.push({ label, expenses: fnExpenses, savings: fnData.savings });
                
                totalExpenses += fnExpenses;
                totalSavings += fnData.savings;
                
                if (fnExpenses > maxExpenseFortnight.amount) {
                    maxExpenseFortnight = { label, amount: fnExpenses };
                }
                if (fnData.savings > maxSavingsFortnight.amount) {
                    maxSavingsFortnight = { label, amount: fnData.savings };
                }
            }
        });
        
        const avgExpenses = totalExpenses / allFortnights.length;
        const avgSavings = totalSavings / allFortnights.length;
        
        document.getElementById('avg-expenses').textContent = this.formatCurrency(avgExpenses);
        document.getElementById('avg-savings').textContent = this.formatCurrency(avgSavings);
        document.getElementById('max-expense-month').textContent = maxExpenseFortnight.label || 'N/A';
        document.getElementById('max-savings-month').textContent = maxSavingsFortnight.label || 'N/A';
        
        document.getElementById('trend-title').textContent = 'Tendencia de Gastos Quincenales';
        document.getElementById('savings-title').textContent = 'Tendencia de Ahorros Quincenales';
        
        this.updateTrendChart(allFortnights, 'fortnightly');
        this.updateSavingsChart(allFortnights, 'fortnightly');
    }

    formatMonthKey(key) {
        const [year, month] = key.split('-');
        const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
                           'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        return `${monthNames[parseInt(month) - 1]} ${year}`;
    }

    initCharts() {
        this.pieChart = null;
        this.trendChart = null;
        this.savingsTrendChart = null;
        this.updatePieChart();
    }

    updatePieChart() {
        const monthData = this.getMonthData();
        const categories = [];
        
        monthData.categories.forEach(cat => {
            const fn1Expenses = cat.expenses?.[1] || [];
            const fn2Expenses = cat.expenses?.[2] || [];
            const total = (Array.isArray(fn1Expenses) ? fn1Expenses.reduce((sum, exp) => sum + exp.amount, 0) : 0) +
                         (Array.isArray(fn2Expenses) ? fn2Expenses.reduce((sum, exp) => sum + exp.amount, 0) : 0);
            if (total > 0) {
                categories.push({ name: cat.name, total });
            }
        });
        
        const ctx = document.getElementById('pie-chart').getContext('2d');
        
        if (this.pieChart) {
            this.pieChart.destroy();
        }
        
        if (categories.length === 0) {
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            ctx.fillStyle = '#94a3b8';
            ctx.font = '16px Segoe UI';
            ctx.textAlign = 'center';
            ctx.fillText('Sin datos de gastos', ctx.canvas.width / 2, ctx.canvas.height / 2);
            return;
        }
        
        const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', 
                       '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#84cc16'];
        
        this.pieChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: categories.map(c => c.name),
                datasets: [{
                    data: categories.map(c => c.total),
                    backgroundColor: colors.slice(0, categories.length),
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#f8fafc',
                            padding: 15,
                            font: { size: 12 }
                        }
                    }
                }
            }
        });
    }

    updateTrendChart(data, type) {
        const ctx = document.getElementById('trend-chart').getContext('2d');
        
        if (this.trendChart) {
            this.trendChart.destroy();
        }
        
        if (data.length === 0) {
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            return;
        }
        
        const labels = type === 'monthly' ? 
            data.map(([key]) => this.formatMonthKey(key)) :
            data.map(d => d.label);
        
        const expenses = type === 'monthly' ?
            data.map(([, d]) => {
                let total = 0;
                for (const fn of [1, 2]) {
                    d.categories.forEach(cat => {
                        const fnExpenses = cat.expenses?.[fn] || [];
                        if (Array.isArray(fnExpenses)) {
                            fnExpenses.forEach(exp => total += exp.amount);
                        }
                    });
                }
                return total;
            }) :
            data.map(d => d.expenses);
        
        this.trendChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Gastos',
                    data: expenses,
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: '#f8fafc' }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#94a3b8' },
                        grid: { color: '#334155' }
                    },
                    y: {
                        ticks: { color: '#94a3b8' },
                        grid: { color: '#334155' }
                    }
                }
            }
        });
    }

    updateSavingsChart(data, type) {
        const ctx = document.getElementById('savings-chart').getContext('2d');
        
        if (this.savingsTrendChart) {
            this.savingsTrendChart.destroy();
        }
        
        if (data.length === 0) {
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            return;
        }
        
        const labels = type === 'monthly' ?
            data.map(([key]) => this.formatMonthKey(key)) :
            data.map(d => d.label);
        
        const savings = type === 'monthly' ?
            data.map(([, d]) => (d.fortnights[1].savings || 0) + (d.fortnights[2].savings || 0)) :
            data.map(d => d.savings);
        
        this.savingsTrendChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Ahorros',
                    data: savings,
                    backgroundColor: '#10b981',
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: '#f8fafc' }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#94a3b8' },
                        grid: { color: '#334155' }
                    },
                    y: {
                        ticks: { color: '#94a3b8' },
                        grid: { color: '#334155' }
                    }
                }
            }
        });
    }

    closeCategoryModal() {
        document.getElementById('category-modal').classList.remove('active');
    }

    closeExpenseModal() {
        document.getElementById('expense-modal').classList.remove('active');
    }

    closeEditExpenseModal() {
        document.getElementById('edit-expense-modal').classList.remove('active');
    }

    switchTab(tabId) {
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelectorAll('.nav-tab').forEach(btn => {
            btn.classList.remove('active');
        });
        
        document.getElementById(tabId).classList.add('active');
        document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
        
        if (tabId === 'historial') {
            this.renderHistory();
        } else if (tabId === 'comparativas') {
            this.renderComparisons();
        } else if (tabId === 'dashboard') {
            this.updateDashboard();
            this.updatePieChart();
        }
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('es-ES', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2
        }).format(amount);
    }

    setupEventListeners() {
        document.querySelectorAll('.nav-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                this.switchTab(btn.dataset.tab);
            });
        });

        document.getElementById('prev-month').addEventListener('click', () => this.prevMonth());
        document.getElementById('next-month').addEventListener('click', () => this.nextMonth());

        document.querySelectorAll('.fortnight-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.switchFortnight(parseInt(btn.dataset.fortnight));
            });
        });

        document.getElementById('save-income').addEventListener('click', () => this.setIncome());
        document.getElementById('income-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.setIncome();
        });

        document.getElementById('add-category').addEventListener('click', () => this.addCategory());
        document.getElementById('save-category').addEventListener('click', () => this.saveCategory());
        document.getElementById('cancel-category').addEventListener('click', () => this.closeCategoryModal());
        document.getElementById('category-name').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.saveCategory();
        });

        document.getElementById('save-expense').addEventListener('click', () => this.saveExpense());
        document.getElementById('cancel-expense').addEventListener('click', () => this.closeExpenseModal());
        document.getElementById('expense-amount').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.saveExpense();
        });

        document.getElementById('update-expense').addEventListener('click', () => this.updateExpense());
        document.getElementById('delete-expense').addEventListener('click', () => this.deleteExpense());
        document.getElementById('cancel-edit-expense').addEventListener('click', () => this.closeEditExpenseModal());

        document.getElementById('save-savings').addEventListener('click', () => this.setSavings());
        document.getElementById('savings-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.setSavings();
        });

        document.querySelector('.close-modal').addEventListener('click', () => this.closeCategoryModal());
        document.querySelector('.close-expense-modal').addEventListener('click', () => this.closeExpenseModal());
        document.querySelector('.close-edit-modal').addEventListener('click', () => this.closeEditExpenseModal());

        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                e.target.classList.remove('active');
            }
        });

        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.historyFilter = btn.dataset.filter;
                this.renderHistory();
            });
        });

        document.querySelectorAll('.comp-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.comp-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.comparisonType = btn.dataset.comparison;
                this.renderComparisons();
            });
        });
    }
}

const app = new FinanceApp();
