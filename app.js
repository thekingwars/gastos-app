// Mis Finanzas - cliente principal
(function (root) {
    'use strict';

    const Domain = root.FinanceDomain;
    const FinanceRepository = root.FinanceRepository;

    class FinanceApp {
        constructor() {
            const now = new Date();
            this.currentMonth = now.getMonth();
            this.currentYear = now.getFullYear();
            this.currentFortnight = 1;
            this.currentCategoryId = null;
            this.editingExpenseId = null;
            this.editingSavingsId = null;
            this.historyFilter = 'months';
            this.comparisonType = 'monthly';
            this.monthId = null;
            this.fortnightIds = {};
            this.monthDataCache = null;
            this.historyCache = null;
            this.personalSavingsCache = [];
            this.charts = { pie: null, trend: null, savings: null };
            this.listenersBound = false;
            this.actionInProgress = false;
            this.loadVersion = 0;
            this.currencyFormatter = new Intl.NumberFormat('es-ES', {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 2
            });

            this.initSupabase();
        }

        initSupabase() {
            try {
                if (!root.supabase?.createClient) throw new Error('No se pudo cargar Supabase.');
                this.supabase = root.supabase.createClient(
                    'https://wtsyqitibsnmadqfgvws.supabase.co',
                    'sb_publishable_pHmKecskZROITf5B1aZopw_n8ErgLc1'
                );
                this.repository = new FinanceRepository(this.supabase);
                void this.loadAll({ reloadHistory: true });
            } catch (error) {
                this.handleLoadError(error);
            }
        }

        async loadAll({ reloadHistory = false } = {}) {
            const version = ++this.loadVersion;
            this.updateSyncUI('loading');
            try {
                const monthId = await this.repository.ensureMonth(this.currentYear, this.currentMonth + 1);
                const fortnightIds = await this.repository.ensureFortnights(monthId);
                const historyPromise = reloadHistory || !this.historyCache
                    ? this.repository.listHistory()
                    : Promise.resolve(this.historyCache);

                const [monthData, personalSavings, history] = await Promise.all([
                    this.repository.getMonthData(monthId, fortnightIds),
                    this.repository.listPersonalSavings(),
                    historyPromise
                ]);
                if (version !== this.loadVersion) return;

                this.monthId = monthId;
                this.fortnightIds = fortnightIds;
                this.monthDataCache = monthData;
                this.personalSavingsCache = personalSavings;
                this.historyCache = history;
                this.bindEventsOnce();
                this.updateSyncUI('synced');
                this.renderCurrentMonth();
                this.renderSavings();
                if (this.activeTab() === 'historial') this.renderHistory();
                if (this.activeTab() === 'comparativas') this.renderComparisons();
            } catch (error) {
                if (version !== this.loadVersion) return;
                this.handleLoadError(error);
                if (this.actionInProgress) throw error;
            }
        }

        handleLoadError(error) {
            console.error(error);
            if (this.isSchemaError(error)) this.showSetup();
            else {
                this.updateSyncUI('error');
                this.showError(error);
            }
        }

        isSchemaError(error) {
            const message = String(error?.message || '').toLowerCase();
            return message.includes('relation') || message.includes('does not exist') ||
                message.includes('schema cache') || message.includes('tabla');
        }

        async runAction(action, onSuccess) {
            if (this.actionInProgress) return;
            this.actionInProgress = true;
            this.updateSyncUI('syncing');
            try {
                await action();
                this.historyCache = null;
                await this.loadAll({ reloadHistory: true });
                if (onSuccess) onSuccess();
                this.updateSyncUI('synced');
            } catch (error) {
                console.error(error);
                this.updateSyncUI('error');
                this.showError(error);
            } finally {
                this.actionInProgress = false;
            }
        }

        async saveIncome() {
            const input = document.getElementById('income-input');
            const amount = Domain.parseAmount(input.value);
            if (amount === null || amount < 0) return this.showValidation('Ingresa un ingreso válido.');
            const fortnightId = this.fortnightIds[this.currentFortnight];
            await this.runAction(
                () => this.repository.setIncome(fortnightId, amount),
                () => { input.value = ''; }
            );
        }

        async saveSavings() {
            const input = document.getElementById('savings-input');
            const amount = Domain.parseAmount(input.value);
            if (amount === null || amount < 0) return this.showValidation('Ingresa un ahorro válido.');
            const fortnightId = this.fortnightIds[this.currentFortnight];
            const automaticEntry = {
                reason: this.automaticSavingsReason(this.currentFortnight)
            };
            await this.runAction(
                () => this.repository.setSavings(fortnightId, amount, automaticEntry),
                () => { input.value = ''; }
            );
        }

        async saveCategory() {
            const input = document.getElementById('category-name');
            const name = input.value.trim();
            if (!name) return this.showValidation('Escribe un nombre de categoría.');
            await this.runAction(
                () => this.repository.createCategory(this.monthId, name),
                () => {
                    input.value = '';
                    this.closeModal('category-modal');
                }
            );
        }

        async deleteCategory(id) {
            if (!window.confirm('¿Eliminar esta categoría y sus gastos?')) return;
            await this.runAction(() => this.repository.deleteCategory(id));
        }

        openExpenseModal(categoryId) {
            const category = this.monthDataCache?.categories.find(item => item.id === categoryId);
            if (!category) return;
            this.currentCategoryId = categoryId;
            document.getElementById('expense-category-name').textContent = `Categoría: ${category.name}`;
            document.getElementById('expense-fortnight-info').textContent = `Quincena: ${this.currentFortnight === 1 ? '1ra' : '2da'}`;
            this.openModal('expense-modal');
        }

        async saveExpense() {
            const descriptionInput = document.getElementById('expense-desc');
            const amountInput = document.getElementById('expense-amount');
            const description = descriptionInput.value.trim();
            const amount = Domain.parseAmount(amountInput.value);
            if (!description || amount === null || amount <= 0) {
                return this.showValidation('Completa la descripción y usa un monto válido.');
            }
            await this.runAction(
                () => this.repository.createExpense({
                    category_id: this.currentCategoryId,
                    fortnight_id: this.fortnightIds[this.currentFortnight],
                    description,
                    amount
                }),
                () => {
                    descriptionInput.value = '';
                    amountInput.value = '';
                    this.closeModal('expense-modal');
                }
            );
        }

        openExpenseEditor(id) {
            const expense = this.findExpense(id);
            if (!expense) return;
            this.editingExpenseId = id;
            document.getElementById('edit-expense-desc').value = expense.description;
            document.getElementById('edit-expense-amount').value = expense.amount;
            this.openModal('edit-expense-modal');
        }

        async updateExpense() {
            const descriptionInput = document.getElementById('edit-expense-desc');
            const amountInput = document.getElementById('edit-expense-amount');
            const description = descriptionInput.value.trim();
            const amount = Domain.parseAmount(amountInput.value);
            if (!description || amount === null || amount <= 0) {
                return this.showValidation('Completa la descripción y usa un monto válido.');
            }
            await this.runAction(
                () => this.repository.updateExpense(this.editingExpenseId, { description, amount }),
                () => this.closeModal('edit-expense-modal')
            );
        }

        async deleteExpense() {
            if (!window.confirm('¿Eliminar este gasto?')) return;
            await this.runAction(
                () => this.repository.deleteExpense(this.editingExpenseId),
                () => this.closeModal('edit-expense-modal')
            );
        }

        async addSavingsIn() {
            const amountInput = document.getElementById('savings-in-amount');
            const reasonInput = document.getElementById('savings-in-reason');
            const amount = Domain.parseAmount(amountInput.value);
            if (amount === null || amount <= 0) return this.showValidation('Monto inválido.');
            await this.runAction(
                () => this.repository.createPersonalSavings({
                    type: 'income',
                    amount,
                    reason: reasonInput.value.trim() || 'Ahorro',
                    entry_date: new Date().toISOString()
                }),
                () => {
                    amountInput.value = '';
                    reasonInput.value = '';
                }
            );
        }

        async addSavingsOut() {
            const amountInput = document.getElementById('savings-out-amount');
            const reasonInput = document.getElementById('savings-out-reason');
            const amount = Domain.parseAmount(amountInput.value);
            const balance = this.calcSavingsBalance();
            if (amount === null || amount <= 0) return this.showValidation('Monto inválido.');
            if (amount > balance) return this.showValidation(`Saldo insuficiente. Disponible: ${this.formatCurrency(balance)}`);
            await this.runAction(
                () => this.repository.createPersonalSavings({
                    type: 'expense',
                    amount,
                    reason: reasonInput.value.trim() || 'Gasto',
                    entry_date: new Date().toISOString()
                }),
                () => {
                    amountInput.value = '';
                    reasonInput.value = '';
                }
            );
        }

        calcSavingsBalance() {
            return this.personalSavingsCache.reduce((total, entry) => {
                const amount = Domain.toCents(entry.amount);
                return total + (entry.type === 'income' ? amount : -amount);
            }, 0) / 100;
        }

        openSavingsEditor(id) {
            const entry = this.personalSavingsCache.find(item => item.id === id);
            if (!entry) return;
            this.editingSavingsId = id;
            document.getElementById('edit-savings-reason').value = entry.reason;
            document.getElementById('edit-savings-amount').value = entry.amount;
            this.openModal('edit-savings-modal');
        }

        async updateSavingsEntry() {
            const reasonInput = document.getElementById('edit-savings-reason');
            const amountInput = document.getElementById('edit-savings-amount');
            const amount = Domain.parseAmount(amountInput.value);
            if (amount === null || amount <= 0) return this.showValidation('Monto inválido.');
            await this.runAction(
                () => this.repository.updatePersonalSavings(this.editingSavingsId, {
                    reason: reasonInput.value.trim() || 'Ahorro',
                    amount
                }),
                () => this.closeModal('edit-savings-modal')
            );
        }

        async deleteSavingsEntry() {
            if (!window.confirm('¿Eliminar esta transacción?')) return;
            await this.runAction(
                () => this.repository.deletePersonalSavings(this.editingSavingsId),
                () => this.closeModal('edit-savings-modal')
            );
        }

        renderCurrentMonth() {
            this.updateMonthDisplay();
            this.updateMonthSummary();
            this.updateDashboard();
            this.renderCategories();
        }

        updateMonthDisplay() {
            const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
            document.getElementById('current-month-display').textContent = `${months[this.currentMonth]} ${this.currentYear}`;
            document.getElementById('fortnight-info').textContent = this.currentFortnight === 1
                ? 'Estás en la 1ra quincena del mes (días 1-15)'
                : 'Estás en la 2da quincena del mes (días 16-31)';
        }

        updateMonthSummary() {
            const summary = Domain.computeMonthSummary(this.monthDataCache || {});
            const current = summary.byFortnight[this.currentFortnight];
            const totalSavings = (this.historyCache || []).reduce((total, month) => total + Domain.toCents(month.totalSavings), 0) / 100;
            document.getElementById('current-income').textContent = this.formatCurrency(current.income);
            document.getElementById('income-input').value = current.income || '';
            document.getElementById('current-savings').textContent = this.formatCurrency(current.savings);
            document.getElementById('savings-input').value = current.savings || '';
            document.getElementById('summary-income').textContent = this.formatCurrency(current.income);
            document.getElementById('summary-expenses').textContent = this.formatCurrency(current.expenses);
            document.getElementById('summary-savings').textContent = this.formatCurrency(current.savings);
            this.setBalance('summary-balance', current.balance);
            document.getElementById('total-month-income').textContent = this.formatCurrency(summary.totalIncome);
            document.getElementById('total-month-savings').textContent = this.formatCurrency(summary.totalSavings);
            document.getElementById('summary-total-income').textContent = this.formatCurrency(summary.totalIncome);
            document.getElementById('summary-total-expenses').textContent = this.formatCurrency(summary.totalExpenses);
            document.getElementById('summary-total-savings').textContent = this.formatCurrency(summary.totalSavings);
            this.setBalance('summary-total-balance', summary.totalBalance);
            document.getElementById('total-savings').textContent = this.formatCurrency(totalSavings);
        }

        updateDashboard() {
            const summary = Domain.computeMonthSummary(this.monthDataCache || {});
            document.getElementById('dash-ingreso').textContent = this.formatCurrency(summary.totalIncome);
            document.getElementById('dash-gastos').textContent = this.formatCurrency(summary.totalExpenses);
            document.getElementById('dash-ahorros').textContent = this.formatCurrency(summary.totalSavings);
            this.setBalance('dash-balance', summary.totalBalance);
            document.getElementById('dash-q1-income').textContent = this.formatCurrency(summary.byFortnight[1].income);
            document.getElementById('dash-q1-expenses').textContent = this.formatCurrency(summary.byFortnight[1].expenses);
            document.getElementById('dash-q1-savings').textContent = this.formatCurrency(summary.byFortnight[1].savings);
            document.getElementById('dash-q2-income').textContent = this.formatCurrency(summary.byFortnight[2].income);
            document.getElementById('dash-q2-expenses').textContent = this.formatCurrency(summary.byFortnight[2].expenses);
            document.getElementById('dash-q2-savings').textContent = this.formatCurrency(summary.byFortnight[2].savings);
            this.renderRecentMovements(Domain.deriveMovements(this.monthDataCache || {}, this.currentFortnight));
            this.updatePieChart(summary);
        }

        renderRecentMovements(movements) {
            const container = document.getElementById('recent-movements');
            if (!movements.length) {
                container.innerHTML = '<p class="empty-state">No hay movimientos esta quincena</p>';
                return;
            }
            container.innerHTML = movements.map(movement => {
                const type = ['income', 'expense', 'savings'].includes(movement.type) ? movement.type : 'expense';
                const sign = type === 'expense' ? '-' : '+';
                return `<div class="movement-item"><span class="movement-desc">${Domain.escapeHtml(movement.description)}</span><span class="movement-amount ${type}">${sign}${this.formatCurrency(movement.amount)}</span></div>`;
            }).join('');
        }

        renderCategories() {
            const container = document.getElementById('categories-container');
            const categories = this.monthDataCache?.categories || [];
            if (!categories.length) {
                container.innerHTML = '<p class="empty-state">Agrega categorías para empezar</p>';
                return;
            }
            container.innerHTML = categories.map(category => {
                const currentExpenses = category.expenses[this.currentFortnight] || [];
                const total = [1, 2].reduce((sum, number) => sum + Domain.sumAmounts(category.expenses[number]), 0);
                const currentTotal = Domain.sumAmounts(currentExpenses);
                return `<div class="category-item">
                    <div class="category-header"><span class="category-name">${Domain.escapeHtml(category.name)}</span><div>
                    <span class="category-total" title="Quincena: ${this.formatCurrency(currentTotal)}">${this.formatCurrency(total)}</span>
                    <button class="delete-category-btn" data-action="delete-category" data-id="${Domain.escapeHtml(category.id)}" type="button">×</button></div></div>
                    <button class="add-expense-btn" data-action="add-expense" data-id="${Domain.escapeHtml(category.id)}" type="button">+ Agregar Gasto</button>
                    <div class="expenses-list">${currentExpenses.map(expense => `<div class="expense-item" data-action="edit-expense" data-id="${Domain.escapeHtml(expense.id)}" tabindex="0" role="button"><span class="expense-desc">${Domain.escapeHtml(expense.description)}</span><span class="expense-amount">${this.formatCurrency(expense.amount)}</span></div>`).join('')}
                    ${!currentExpenses.length ? '<p class="empty-state" style="padding:10px;">No hay gastos esta quincena</p>' : ''}</div></div>`;
            }).join('');
        }

        renderSavings() {
            const container = document.getElementById('savings-history');
            const entries = this.personalSavingsCache || [];
            if (!entries.length) {
                container.innerHTML = '<p class="empty-state">No hay transacciones</p>';
                this.updateSavingsStats();
                return;
            }
            container.innerHTML = entries.map(entry => {
                const type = entry.type === 'income' ? 'income' : 'expense';
                const date = new Date(entry.entry_date);
                const dateText = Number.isNaN(date.getTime()) ? 'Fecha no disponible' : `${date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })} ${date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
                return `<div class="savings-entry ${type}" data-action="edit-savings" data-id="${Domain.escapeHtml(entry.id)}" tabindex="0" role="button">
                    <div class="savings-entry-info"><span class="savings-entry-reason">${Domain.escapeHtml(entry.reason)}</span>
                    <span class="savings-entry-date">${Domain.escapeHtml(dateText)}</span></div>
                    <span class="savings-entry-amount ${type}">${type === 'income' ? '+' : '-'}${this.formatCurrency(entry.amount)}</span>
                    <button class="savings-entry-delete" data-action="delete-savings" data-id="${Domain.escapeHtml(entry.id)}" type="button" title="Eliminar">×</button>
                </div>`;
            }).join('');
            this.updateSavingsStats();
        }

        updateSavingsStats() {
            const totalIn = this.personalSavingsCache.reduce((total, entry) => total + (entry.type === 'income' ? Domain.toCents(entry.amount) : 0), 0) / 100;
            const totalOut = this.personalSavingsCache.reduce((total, entry) => total + (entry.type === 'expense' ? Domain.toCents(entry.amount) : 0), 0) / 100;
            const balance = totalIn - totalOut;
            document.getElementById('savings-balance').textContent = this.formatCurrency(balance);
            document.getElementById('savings-balance').style.color = balance >= 0 ? '#10b981' : '#ef4444';
            document.getElementById('savings-total-in').textContent = this.formatCurrency(totalIn);
            document.getElementById('savings-total-out').textContent = this.formatCurrency(totalOut);
            document.getElementById('savings-count').textContent = this.personalSavingsCache.length;
        }

        async renderHistory() {
            const container = document.getElementById('history-container');
            const months = this.historyCache || [];
            if (!months.length) {
                container.innerHTML = '<p class="empty-state">No hay registros</p>';
                return;
            }
            const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
            if (this.historyFilter === 'months') {
                container.innerHTML = months.map(month => `<div class="history-card" data-action="load-month" data-id="${Domain.escapeHtml(month.key)}" tabindex="0" role="button">
                    <div class="history-month">${monthNames[month.month - 1]} ${month.year}</div>
                    <div class="history-stats">
                        <div class="history-stat"><span>Ingreso:</span><span>${this.formatCurrency(month.totalIncome)}</span></div>
                        <div class="history-stat"><span>Gastos:</span><span class="negative">${this.formatCurrency(month.totalExpenses)}</span></div>
                        <div class="history-stat"><span>Ahorros:</span><span class="positive">${this.formatCurrency(month.totalSavings)}</span></div>
                        <div class="history-stat"><span>Balance:</span><span class="${month.balance >= 0 ? 'positive' : 'negative'}">${this.formatCurrency(month.balance)}</span></div>
                    </div></div>`).join('');
                return;
            }

            const cards = [];
            months.forEach(month => Domain.FORTNIGHTS.forEach(number => {
                const fortnight = month.fortnights[number];
                if (!fortnight) return;
                const balance = fortnight.income - fortnight.expenses - fortnight.savings;
                cards.push(`<div class="history-fortnight-card" data-action="load-month" data-id="${Domain.escapeHtml(month.key)}" tabindex="0" role="button">
                    <div class="fortnight-label">${number === 1 ? '1ra Quincena' : '2da Quincena'}</div>
                    <div class="history-month">${monthNames[month.month - 1]} ${month.year}</div>
                    <div class="history-stats">
                        <div class="history-stat"><span>Ingreso:</span><span>${this.formatCurrency(fortnight.income)}</span></div>
                        <div class="history-stat"><span>Gastos:</span><span class="negative">${this.formatCurrency(fortnight.expenses)}</span></div>
                        <div class="history-stat"><span>Ahorros:</span><span class="positive">${this.formatCurrency(fortnight.savings)}</span></div>
                        <div class="history-stat"><span>Balance:</span><span class="${balance >= 0 ? 'positive' : 'negative'}">${this.formatCurrency(balance)}</span></div>
                    </div></div>`);
            }));
            container.innerHTML = cards.join('');
        }

        renderComparisons() {
            const months = this.historyCache || [];
            if (!months.length) return;
            if (this.comparisonType === 'monthly') {
                const totalExpenses = months.reduce((sum, month) => sum + Domain.toCents(month.totalExpenses), 0);
                const totalSavings = months.reduce((sum, month) => sum + Domain.toCents(month.totalSavings), 0);
                const maxExpense = months.reduce((max, month) => month.totalExpenses > max.totalExpenses ? month : max, { totalExpenses: -1 });
                const maxSavings = months.reduce((max, month) => month.totalSavings > max.totalSavings ? month : max, { totalSavings: -1 });
                document.getElementById('avg-expenses').textContent = this.formatCurrency(totalExpenses / 100 / months.length);
                document.getElementById('avg-savings').textContent = this.formatCurrency(totalSavings / 100 / months.length);
                document.getElementById('max-expense-month').textContent = maxExpense.key ? this.formatMonthKey(maxExpense.key) : 'N/A';
                document.getElementById('max-savings-month').textContent = maxSavings.key ? this.formatMonthKey(maxSavings.key) : 'N/A';
                document.getElementById('trend-title').textContent = 'Tendencia de Gastos Mensuales';
                document.getElementById('savings-title').textContent = 'Tendencia de Ahorros Mensuales';
                this.updateTrendChart(months.map(month => this.formatMonthKey(month.key)), months.map(month => month.totalExpenses));
                this.updateSavingsChart(months.map(month => this.formatMonthKey(month.key)), months.map(month => month.totalSavings));
                return;
            }

            const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
            const fortnights = [];
            months.forEach(month => Domain.FORTNIGHTS.forEach(number => {
                const fortnight = month.fortnights[number];
                if (fortnight) fortnights.push({
                    label: `${monthNames[month.month - 1]} ${number === 1 ? 'Q1' : 'Q2'}`,
                    expenses: fortnight.expenses,
                    savings: fortnight.savings
                });
            }));
            const totalExpenses = fortnights.reduce((sum, item) => sum + Domain.toCents(item.expenses), 0);
            const totalSavings = fortnights.reduce((sum, item) => sum + Domain.toCents(item.savings), 0);
            const maxExpense = fortnights.reduce((max, item) => item.expenses > max.expenses ? item : max, { expenses: -1 });
            const maxSavings = fortnights.reduce((max, item) => item.savings > max.savings ? item : max, { savings: -1 });
            document.getElementById('avg-expenses').textContent = this.formatCurrency(totalExpenses / 100 / Math.max(fortnights.length, 1));
            document.getElementById('avg-savings').textContent = this.formatCurrency(totalSavings / 100 / Math.max(fortnights.length, 1));
            document.getElementById('max-expense-month').textContent = maxExpense.label || 'N/A';
            document.getElementById('max-savings-month').textContent = maxSavings.label || 'N/A';
            document.getElementById('trend-title').textContent = 'Tendencia de Gastos Quincenales';
            document.getElementById('savings-title').textContent = 'Tendencia de Ahorros Quincenales';
            this.updateTrendChart(fortnights.map(item => item.label), fortnights.map(item => item.expenses));
            this.updateSavingsChart(fortnights.map(item => item.label), fortnights.map(item => item.savings));
        }

        updatePieChart(summary) {
            if (!root.Chart) return;
            const canvas = document.getElementById('pie-chart');
            const categories = summary.month.categories.map(category => ({
                name: category.name,
                total: [1, 2].reduce((sum, number) => sum + Domain.sumAmounts(category.expenses[number]), 0)
            })).filter(category => category.total > 0);
            if (!categories.length) {
                if (this.charts.pie) this.charts.pie.destroy();
                this.charts.pie = null;
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#94a3b8';
                ctx.font = '16px Segoe UI';
                ctx.textAlign = 'center';
                ctx.fillText('Sin datos', canvas.width / 2, canvas.height / 2);
                return;
            }
            const data = {
                labels: categories.map(category => category.name),
                datasets: [{ data: categories.map(category => category.total), backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#84cc16'], borderWidth: 0 }]
            };
            if (this.charts.pie) {
                this.charts.pie.data = data;
                this.charts.pie.update('none');
            } else {
                this.charts.pie = new root.Chart(canvas.getContext('2d'), {
                    type: 'doughnut',
                    data,
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#f8fafc', padding: 15, font: { size: 12 } } } } }
                });
            }
        }

        updateTrendChart(labels, data) {
            if (!root.Chart || this.activeTab() !== 'comparativas') return;
            const config = { labels, datasets: [{ label: 'Gastos', data, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', fill: true, tension: 0.4 }] };
            if (this.charts.trend) {
                this.charts.trend.data = config;
                this.charts.trend.update('none');
                return;
            }
            this.charts.trend = new root.Chart(document.getElementById('trend-chart').getContext('2d'), {
                type: 'line',
                data: config,
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#f8fafc' } } }, scales: { x: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } }, y: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } } } }
            });
        }

        updateSavingsChart(labels, data) {
            if (!root.Chart || this.activeTab() !== 'comparativas') return;
            const config = { labels, datasets: [{ label: 'Ahorros', data, backgroundColor: '#10b981', borderRadius: 8 }] };
            if (this.charts.savings) {
                this.charts.savings.data = config;
                this.charts.savings.update('none');
                return;
            }
            this.charts.savings = new root.Chart(document.getElementById('savings-chart').getContext('2d'), {
                type: 'bar',
                data: config,
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#f8fafc' } } }, scales: { x: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } }, y: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } } } }
            });
        }

        async previousMonth() {
            if (this.currentMonth === 0) { this.currentMonth = 11; this.currentYear--; }
            else this.currentMonth--;
            this.historyCache = null;
            await this.loadAll({ reloadHistory: true });
        }

        async nextMonth() {
            if (this.currentMonth === 11) { this.currentMonth = 0; this.currentYear++; }
            else this.currentMonth++;
            this.historyCache = null;
            await this.loadAll({ reloadHistory: true });
        }

        async loadMonth(key) {
            const [year, month] = String(key).split('-').map(Number);
            if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return;
            this.currentYear = year;
            this.currentMonth = month - 1;
            this.historyCache = null;
            await this.loadAll({ reloadHistory: true });
            this.switchTab('mes-actual');
        }

        switchFortnight(number) {
            if (!Domain.FORTNIGHTS.includes(number)) return;
            this.currentFortnight = number;
            document.querySelectorAll('.fortnight-btn').forEach(button => button.classList.toggle('active', Number(button.dataset.fortnight) === number));
            this.updateMonthDisplay();
            this.updateMonthSummary();
            this.updateDashboard();
            this.renderCategories();
        }

        switchTab(tabId) {
            const section = document.getElementById(tabId);
            const button = [...document.querySelectorAll('.nav-tab')].find(item => item.dataset.tab === tabId);
            if (!section || !button) return;
            document.querySelectorAll('.tab-content').forEach(item => item.classList.toggle('active', item.id === tabId));
            document.querySelectorAll('.nav-tab').forEach(item => item.classList.toggle('active', item === button));
            if (tabId === 'historial') void this.renderHistory();
            if (tabId === 'comparativas') this.renderComparisons();
            if (tabId === 'dashboard') this.updateDashboard();
            if (tabId === 'ahorros') this.renderSavings();
        }

        bindEventsOnce() {
            if (this.listenersBound) return;
            this.listenersBound = true;
            document.querySelectorAll('.nav-tab').forEach(button => button.addEventListener('click', () => this.switchTab(button.dataset.tab)));
            document.getElementById('prev-month').addEventListener('click', () => void this.previousMonth());
            document.getElementById('next-month').addEventListener('click', () => void this.nextMonth());
            document.querySelectorAll('.fortnight-btn').forEach(button => button.addEventListener('click', () => this.switchFortnight(Number(button.dataset.fortnight))));
            document.getElementById('save-income').addEventListener('click', () => void this.saveIncome());
            document.getElementById('save-savings').addEventListener('click', () => void this.saveSavings());
            document.getElementById('add-category').addEventListener('click', () => this.openModal('category-modal'));
            document.getElementById('save-category').addEventListener('click', () => void this.saveCategory());
            document.getElementById('cancel-category').addEventListener('click', () => this.closeModal('category-modal'));
            document.getElementById('save-expense').addEventListener('click', () => void this.saveExpense());
            document.getElementById('cancel-expense').addEventListener('click', () => this.closeModal('expense-modal'));
            document.getElementById('update-expense').addEventListener('click', () => void this.updateExpense());
            document.getElementById('delete-expense').addEventListener('click', () => void this.deleteExpense());
            document.getElementById('cancel-edit-expense').addEventListener('click', () => this.closeModal('edit-expense-modal'));
            document.getElementById('add-savings-in').addEventListener('click', () => void this.addSavingsIn());
            document.getElementById('add-savings-out').addEventListener('click', () => void this.addSavingsOut());
            document.getElementById('update-savings').addEventListener('click', () => void this.updateSavingsEntry());
            document.getElementById('delete-savings').addEventListener('click', () => void this.deleteSavingsEntry());
            document.getElementById('cancel-edit-savings').addEventListener('click', () => this.closeModal('edit-savings-modal'));
            document.querySelectorAll('.modal .close-modal, .modal .close-expense-modal, .modal .close-edit-modal, .modal .close-edit-savings-modal').forEach(button => button.addEventListener('click', () => this.closeModal(button.closest('.modal').id)));
            document.querySelectorAll('.filter-btn').forEach(button => button.addEventListener('click', () => {
                document.querySelectorAll('.filter-btn').forEach(item => item.classList.toggle('active', item === button));
                this.historyFilter = button.dataset.filter;
                void this.renderHistory();
            }));
            document.querySelectorAll('.comp-tab').forEach(button => button.addEventListener('click', () => {
                document.querySelectorAll('.comp-tab').forEach(item => item.classList.toggle('active', item === button));
                this.comparisonType = button.dataset.comparison;
                this.renderComparisons();
            }));
            document.querySelectorAll('input').forEach(input => input.addEventListener('keydown', event => {
                if (event.key !== 'Enter') return;
                const action = {
                    'income-input': () => this.saveIncome(),
                    'savings-input': () => this.saveSavings(),
                    'category-name': () => this.saveCategory(),
                    'expense-amount': () => this.saveExpense(),
                    'savings-in-amount': () => this.addSavingsIn(),
                    'savings-in-reason': () => this.addSavingsIn(),
                    'savings-out-amount': () => this.addSavingsOut(),
                    'savings-out-reason': () => this.addSavingsOut()
                }[input.id];
                if (action) { event.preventDefault(); void action(); }
            }));
            document.getElementById('categories-container').addEventListener('click', event => {
                const target = event.target.closest('[data-action]');
                if (!target) return;
                const action = target.dataset.action;
                if (action === 'delete-category') void this.deleteCategory(target.dataset.id);
                if (action === 'add-expense') this.openExpenseModal(target.dataset.id);
                if (action === 'edit-expense') this.openExpenseEditor(target.dataset.id);
            });
            document.getElementById('savings-history').addEventListener('click', event => {
                const target = event.target.closest('[data-action]');
                if (!target) return;
                if (target.dataset.action === 'delete-savings') {
                    event.stopPropagation();
                    this.editingSavingsId = target.dataset.id;
                    void this.deleteSavingsEntry();
                } else if (target.dataset.action === 'edit-savings') {
                    this.openSavingsEditor(target.dataset.id);
                }
            });
            document.getElementById('history-container').addEventListener('click', event => {
                const target = event.target.closest('[data-action="load-month"]');
                if (target) void this.loadMonth(target.dataset.id);
            });
            window.addEventListener('click', event => {
                if (event.target.classList.contains('modal')) event.target.classList.remove('active');
            });
        }

        findExpense(id) {
            for (const category of this.monthDataCache?.categories || []) {
                for (const number of Domain.FORTNIGHTS) {
                    const expense = (category.expenses[number] || []).find(item => item.id === id);
                    if (expense) return expense;
                }
            }
            return null;
        }

        automaticSavingsReason(number) {
            const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
            return `Ahorro ${number === 1 ? '1ra' : '2da'} Quincena ${months[this.currentMonth]} ${this.currentYear}`;
        }

        setBalance(id, value) {
            const element = document.getElementById(id);
            element.textContent = this.formatCurrency(value);
            element.className = value >= 0 ? 'value positive' : 'value negative';
        }

        formatCurrency(amount) {
            return this.currencyFormatter.format(Domain.toNumber(amount));
        }

        formatMonthKey(key) {
            const [year, month] = String(key).split('-');
            const names = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
            return `${names[Number(month) - 1]} ${year}`;
        }

        activeTab() {
            return document.querySelector('.tab-content.active')?.id || 'dashboard';
        }

        openModal(id) { document.getElementById(id)?.classList.add('active'); }
        closeModal(id) { document.getElementById(id)?.classList.remove('active'); }

        showValidation(message) {
            window.alert(message);
        }

        showError(error) {
            const message = error?.message || 'No se pudo completar la operación.';
            const indicator = document.getElementById('sync-indicator');
            if (indicator) indicator.title = message;
            window.alert(message);
        }

        updateSyncUI(status) {
            const indicator = document.getElementById('sync-indicator');
            if (!indicator) return;
            const states = {
                loading: ['🔄', 'Cargando...', 'syncing'],
                syncing: ['🔄', 'Guardando...', 'syncing'],
                synced: ['✅', 'Sincronizado', 'synced'],
                error: ['❌', 'Error', 'error']
            };
            const [icon, text, className] = states[status] || states.error;
            indicator.className = `sync-indicator ${className}`;
            indicator.querySelector('#sync-icon').textContent = icon;
            indicator.querySelector('#sync-text').textContent = text;
            if (status === 'synced') setTimeout(() => indicator.classList.add('hidden'), 2000);
        }

        showSetup() {
            const container = document.getElementById('app-container');
            container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;"><div style="background:#1e293b;padding:40px;border-radius:16px;max-width:600px;text-align:center;"><h1 style="color:#f8fafc;margin-bottom:20px;">💰 Mis Finanzas</h1><div style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#fca5a5;padding:15px;border-radius:8px;margin-bottom:20px;"><strong>La base de datos necesita configuración</strong></div><p style="color:#94a3b8;margin-bottom:20px;">Abre <code style="color:#a5b4fc;">setup.html</code> y ejecuta el esquema SQL actualizado.</p><button id="reload-app" style="background:#6366f1;color:white;border:none;padding:12px 24px;border-radius:8px;cursor:pointer;font-size:16px;">Recargar</button></div></div>`;
            document.getElementById('reload-app').addEventListener('click', () => window.location.reload());
        }
    }

    root.app = new FinanceApp();
})(typeof globalThis !== 'undefined' ? globalThis : window);
