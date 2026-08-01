// Finance App - Supabase Relational Schema
class FinanceApp {
    constructor() {
        this.currentDate = new Date();
        this.currentMonth = this.currentDate.getMonth();
        this.currentYear = this.currentDate.getFullYear();
        this.currentFortnight = 1;
        this.currentCategoryId = null;
        this.editingExpenseId = null;
        this.editingSavingsId = null;
        this.historyFilter = 'months';
        this.comparisonType = 'monthly';
        this.supabase = null;
        this.monthId = null;
        this.fortnightIds = {};
        this.monthDataCache = null;
        this.allMonthsCache = [];
        this.personalSavingsCache = [];
        
        this.initSupabase();
    }

    initSupabase() {
        try {
            this.supabase = supabase.createClient(
                'https://wtsyqitibsnmadqfgvws.supabase.co',
                'sb_publishable_pHmKecskZROITf5B1aZopw_n8ErgLc1'
            );
            this.loadAll();
        } catch (e) {
            console.error('Supabase init error:', e);
            this.showSetup();
        }
    }

    async loadAll() {
        this.updateSyncUI('loading');
        try {
            await this.ensureMonthExists();
            await this.loadFortnights();
            this.monthDataCache = null;
            await Promise.all([
                this.getMonthData(),
                this.loadPersonalSavings()
            ]);
            
            this.updateSyncUI('synced');
            this.setupEventListeners();
            this.updateMonthDisplay();
            this.updateDashboard();
            this.renderCategories();
            this.initCharts();
        } catch (e) {
            console.error(e);
            if (e.message?.includes('relation') || e.message?.includes('does not exist')) {
                this.showSetup();
            } else {
                this.updateSyncUI('error');
            }
        }
    }

    // ========== DB OPERATIONS ==========

    async ensureMonthExists() {
        const { data, error } = await this.supabase
            .from('months').select('id')
            .eq('year', this.currentYear)
            .eq('month', this.currentMonth + 1)
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        if (data) {
            this.monthId = data.id;
        } else {
            const { data: m, error: e } = await this.supabase
                .from('months').insert({ year: this.currentYear, month: this.currentMonth + 1 })
                .select('id').single();
            if (e) throw e;
            this.monthId = m.id;
        }
    }

    async loadFortnights() {
        const { data, error } = await this.supabase
            .from('fortnights').select('id, fortnight_number')
            .eq('month_id', this.monthId);
        if (error) throw error;
        this.fortnightIds = {};
        for (const f of data) this.fortnightIds[f.fortnight_number] = f.id;
        for (const n of [1, 2]) {
            if (!this.fortnightIds[n]) {
                const { data: f } = await this.supabase
                    .from('fortnights').insert({ month_id: this.monthId, fortnight_number: n })
                    .select('id').single();
                this.fortnightIds[n] = f.id;
            }
        }
    }

    async getMonthData() {
        if (this.monthDataCache) return this.monthDataCache;
        const fn1 = await this.getFortnightFull(1);
        const fn2 = await this.getFortnightFull(2);
        const cats = await this.getCategoriesWithExpenses();
        this.monthDataCache = { fortnights: { 1: fn1, 2: fn2 }, categories: cats };
        return this.monthDataCache;
    }

    async getFortnightFull(fnNum) {
        const fnId = this.fortnightIds[fnNum];
        if (!fnId) return { income: 0, savings: 0, movements: [] };
        const [{ data: fn }, { data: mv }] = await Promise.all([
            this.supabase.from('fortnights').select('income, savings').eq('id', fnId).single(),
            this.supabase.from('movements').select('*').eq('fortnight_id', fnId).order('timestamp')
        ]);
        return {
            income: parseFloat(fn?.income || 0),
            savings: parseFloat(fn?.savings || 0),
            movements: mv || []
        };
    }

    async getCategoriesWithExpenses() {
        const [catRes, expRes] = await Promise.all([
            this.supabase.from('categories').select('id, name').eq('month_id', this.monthId),
            this.supabase.from('expenses').select('*, category_id, fortnight_id').in('fortnight_id', Object.values(this.fortnightIds))
        ]);
        const cats = catRes.data || [];
        const allExps = expRes.data || [];
        for (const cat of cats) {
            const catExps = allExps.filter(e => e.category_id === cat.id);
            cat.expenses = {
                1: catExps.filter(e => e.fortnight_id === this.fortnightIds[1]),
                2: catExps.filter(e => e.fortnight_id === this.fortnightIds[2])
            };
        }
        return cats;
    }

    async loadPersonalSavings() {
        const { data } = await this.supabase
            .from('personal_savings').select('*').order('entry_date', { ascending: false });
        this.personalSavingsCache = data || [];
    }

    async loadAllMonthsForHistory() {
        if (this.allMonthsCache.length) return this.allMonthsCache;
        const { data: months } = await this.supabase.from('months').select(`
            id, year, month,
            fortnights (id, fortnight_number, income, savings,
                expenses (amount)
            )
        `).order('year', { ascending: false }).order('month', { ascending: false });
        if (!months) return [];
        const result = months.map(m => {
            const fortnights = {};
            let totalIncome = 0, totalSavings = 0, totalExpenses = 0;
            for (const fn of (m.fortnights || [])) {
                const exps = (fn.expenses || []).reduce((s, e) => s + parseFloat(e.amount || 0), 0);
                fortnights[fn.fortnight_number] = { id: fn.id, income: parseFloat(fn.income || 0), savings: parseFloat(fn.savings || 0), expenses: exps };
                totalIncome += fortnights[fn.fortnight_number].income;
                totalSavings += fortnights[fn.fortnight_number].savings;
                totalExpenses += exps;
            }
            return {
                id: m.id, key: `${m.year}-${String(m.month).padStart(2, '0')}`,
                year: m.year, month: m.month,
                fortnights, totalIncome, totalSavings, totalExpenses,
                balance: totalIncome - totalExpenses - totalSavings
            };
        });
        this.allMonthsCache = result;
        return result;
    }

    // ========== ACTIONS ==========

    async setIncome() {
        const input = document.getElementById('income-input');
        const amount = parseFloat(input.value);
        if (isNaN(amount) || amount < 0) return;
        const fnId = this.fortnightIds[this.currentFortnight];
        await this.supabase.from('fortnights').update({ income: amount, updated_at: new Date().toISOString() }).eq('id', fnId);
        await this.supabase.from('movements').insert({ fortnight_id: fnId, type: 'income', description: `Ingreso ${this.currentFortnight === 1 ? '1ra' : '2da'} quincena`, amount, timestamp: new Date().toISOString() });
        this.monthDataCache = null;
        this.updateSyncUI('synced');
        this.updateMonthSummary();
        this.updateDashboard();
        input.value = '';
    }

    async setSavings() {
        const input = document.getElementById('savings-input');
        const amount = parseFloat(input.value);
        if (isNaN(amount) || amount < 0) return;
        const fnId = this.fortnightIds[this.currentFortnight];

        // 1. Actualizar savings en fortnights
        await this.supabase.from('fortnights').update({ savings: amount, updated_at: new Date().toISOString() }).eq('id', fnId);

        // 2. Movements (registro interno)
        const descMov = `Ahorro ${this.currentFortnight === 1 ? '1ra' : '2da'} quincena`;
        const { data: existingMov } = await this.supabase.from('movements').select('id').eq('fortnight_id', fnId).eq('type', 'savings').like('description', '%quincena').maybeSingle();
        if (existingMov) {
            if (amount === 0) await this.supabase.from('movements').delete().eq('id', existingMov.id);
            else await this.supabase.from('movements').update({ amount, description: descMov, timestamp: new Date().toISOString() }).eq('id', existingMov.id);
        } else if (amount > 0) {
            await this.supabase.from('movements').insert({ fortnight_id: fnId, type: 'savings', description: descMov, amount, timestamp: new Date().toISOString() });
        }

        // 3. Personal savings (ahorros personales) - crear/borrar entrada automática
        try {
            const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
            const labelFn = this.currentFortnight === 1 ? '1ra' : '2da';
            const descSavings = `Ahorro ${labelFn} Quincena ${meses[this.currentMonth]} ${this.currentYear}`;
            const { data: existingRows, error: selErr } = await this.supabase.from('personal_savings').select('id').eq('reason', descSavings).limit(1);
            if (selErr) { console.error('Error selecting personal_savings:', selErr); }
            const existingSav = existingRows && existingRows.length > 0 ? existingRows[0] : null;
            if (existingSav) {
                if (amount === 0) {
                    const { error: delErr } = await this.supabase.from('personal_savings').delete().eq('id', existingSav.id);
                    if (delErr) console.error('Error deleting personal_savings:', delErr);
                } else {
                    const { error: updErr } = await this.supabase.from('personal_savings').update({ amount, updated_at: new Date().toISOString() }).eq('id', existingSav.id);
                    if (updErr) console.error('Error updating personal_savings:', updErr);
                }
            } else if (amount > 0) {
                const { error: insErr } = await this.supabase.from('personal_savings').insert({ type: 'income', amount, reason: descSavings, entry_date: new Date().toISOString() });
                if (insErr) console.error('Error inserting personal_savings:', insErr);
            }
        } catch (e) {
            console.error('Error en personal_savings sync:', e);
        }

        this.monthDataCache = null;
        this.updateSyncUI('synced');
        this.updateMonthSummary();
        this.updateDashboard();
    }

    async addCategory() {
        document.getElementById('category-modal').classList.add('active');
    }

    async saveCategory() {
        const input = document.getElementById('category-name');
        const name = input.value.trim();
        if (!name) return;
        await this.supabase.from('categories').insert({ month_id: this.monthId, name });
        this.monthDataCache = null;
        this.updateSyncUI('synced');
        this.renderCategories();
        this.closeCategoryModal();
        input.value = '';
    }

    async deleteCategory(id) {
        if (!confirm('¿Eliminar esta categoría y sus gastos?')) return;
        await this.supabase.from('categories').delete().eq('id', id);
        this.monthDataCache = null;
        this.updateSyncUI('synced');
        this.renderCategories();
        this.updateDashboard();
    }

    async addExpense(categoryId) {
        this.currentCategoryId = categoryId;
        const md = await this.getMonthData();
        const cat = md.categories.find(c => c.id === categoryId);
        document.getElementById('expense-category-name').textContent = `Categoría: ${cat.name}`;
        document.getElementById('expense-fortnight-info').textContent = `Quincena: ${this.currentFortnight === 1 ? '1ra' : '2da'}`;
        document.getElementById('expense-modal').classList.add('active');
    }

    async saveExpense() {
        const desc = document.getElementById('expense-desc').value.trim();
        const amount = parseFloat(document.getElementById('expense-amount').value);
        if (!desc || isNaN(amount) || amount <= 0) return;
        const fnId = this.fortnightIds[this.currentFortnight];
        const cat = (await this.getMonthData()).categories.find(c => c.id === this.currentCategoryId);
        await this.supabase.from('expenses').insert({ category_id: this.currentCategoryId, fortnight_id: fnId, description: desc, amount });
        await this.supabase.from('movements').insert({ fortnight_id: fnId, type: 'expense', description: `${cat.name}: ${desc}`, amount, timestamp: new Date().toISOString() });
        this.monthDataCache = null;
        this.updateSyncUI('synced');
        this.renderCategories();
        this.closeExpenseModal();
        this.updateMonthSummary();
        this.updateDashboard();
        document.getElementById('expense-desc').value = '';
        document.getElementById('expense-amount').value = '';
    }

    editExpense(id) { this.editingExpenseId = id; document.getElementById('edit-expense-modal').classList.add('active'); }

    async updateExpense() {
        const desc = document.getElementById('edit-expense-desc').value.trim();
        const amount = parseFloat(document.getElementById('edit-expense-amount').value);
        if (!desc || isNaN(amount) || amount <= 0) return;
        await this.supabase.from('expenses').update({ description: desc, amount }).eq('id', this.editingExpenseId);
        this.monthDataCache = null;
        this.updateSyncUI('synced');
        this.renderCategories();
        this.closeEditExpenseModal();
        this.updateMonthSummary();
        this.updateDashboard();
    }

    async deleteExpense() {
        if (!confirm('¿Eliminar este gasto?')) return;
        await this.supabase.from('expenses').delete().eq('id', this.editingExpenseId);
        this.monthDataCache = null;
        this.updateSyncUI('synced');
        this.renderCategories();
        this.closeEditExpenseModal();
        this.updateMonthSummary();
        this.updateDashboard();
    }

    // ========== AHORROS PERSONALES ==========

    async addSavingsIn() {
        const amt = document.getElementById('savings-in-amount');
        const rsn = document.getElementById('savings-in-reason');
        const amount = parseFloat(amt.value);
        if (isNaN(amount) || amount <= 0) return alert('Monto inválido');
        await this.supabase.from('personal_savings').insert({ type: 'income', amount, reason: rsn.value.trim() || 'Ahorro', entry_date: new Date().toISOString() });
        this.updateSyncUI('synced');
        await this.loadPersonalSavings();
        this.renderSavings();
        amt.value = ''; rsn.value = '';
    }

    async addSavingsOut() {
        const amt = document.getElementById('savings-out-amount');
        const rsn = document.getElementById('savings-out-reason');
        const amount = parseFloat(amt.value);
        if (isNaN(amount) || amount <= 0) return alert('Monto inválido');
        const balance = this.calcSavingsBalance();
        if (amount > balance) return alert(`Saldo insuficiente. Disponible: ${this.formatCurrency(balance)}`);
        await this.supabase.from('personal_savings').insert({ type: 'expense', amount, reason: rsn.value.trim() || 'Gasto', entry_date: new Date().toISOString() });
        this.updateSyncUI('synced');
        await this.loadPersonalSavings();
        this.renderSavings();
        amt.value = ''; rsn.value = '';
    }

    calcSavingsBalance() {
        return this.personalSavingsCache.reduce((s, e) => s + (e.type === 'income' ? parseFloat(e.amount) : -parseFloat(e.amount)), 0);
    }

    renderSavings() {
        const container = document.getElementById('savings-history');
        const entries = this.personalSavingsCache;
        if (!entries.length) { container.innerHTML = '<p class="empty-state">No hay transacciones</p>'; this.updateSavingsStats(); return; }
        container.innerHTML = entries.map(e => {
            const d = new Date(e.entry_date);
            return `<div class="savings-entry ${e.type}" onclick="app.editSavingsEntry('${e.id}')">
                <div class="savings-entry-info"><span class="savings-entry-reason">${e.reason}</span>
                <span class="savings-entry-date">${d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })} ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span></div>
                <span class="savings-entry-amount ${e.type}">${e.type === 'income' ? '+' : '-'}${this.formatCurrency(e.amount)}</span>
                <button class="savings-entry-delete" onclick="event.stopPropagation(); app.deleteSavingsEntry('${e.id}')" title="Eliminar">×</button>
            </div>`;
        }).join('');
        this.updateSavingsStats();
    }

    updateSavingsStats() {
        const totalIn = this.personalSavingsCache.filter(e => e.type === 'income').reduce((s, e) => s + parseFloat(e.amount), 0);
        const totalOut = this.personalSavingsCache.filter(e => e.type === 'expense').reduce((s, e) => s + parseFloat(e.amount), 0);
        const balance = totalIn - totalOut;
        document.getElementById('savings-balance').textContent = this.formatCurrency(balance);
        document.getElementById('savings-balance').style.color = balance >= 0 ? '#10b981' : '#ef4444';
        document.getElementById('savings-total-in').textContent = this.formatCurrency(totalIn);
        document.getElementById('savings-total-out').textContent = this.formatCurrency(totalOut);
        document.getElementById('savings-count').textContent = this.personalSavingsCache.length;
    }

    editSavingsEntry(id) {
        const e = this.personalSavingsCache.find(x => x.id === id);
        if (!e) return;
        document.getElementById('edit-savings-id').value = id;
        document.getElementById('edit-savings-reason').value = e.reason;
        document.getElementById('edit-savings-amount').value = e.amount;
        document.getElementById('edit-savings-modal').classList.add('active');
    }

    async updateSavingsEntry() {
        const id = document.getElementById('edit-savings-id').value;
        const reason = document.getElementById('edit-savings-reason').value.trim();
        const amount = parseFloat(document.getElementById('edit-savings-amount').value);
        if (isNaN(amount) || amount <= 0) return alert('Monto inválido');
        await this.supabase.from('personal_savings').update({ reason, amount, updated_at: new Date().toISOString() }).eq('id', id);
        this.updateSyncUI('synced');
        await this.loadPersonalSavings();
        this.renderSavings();
        document.getElementById('edit-savings-modal').classList.remove('active');
    }

    async deleteSavingsEntry(id) {
        if (!confirm('¿Eliminar?')) return;
        await this.supabase.from('personal_savings').delete().eq('id', id);
        this.updateSyncUI('synced');
        await this.loadPersonalSavings();
        this.renderSavings();
    }

    // ========== UI UPDATES ==========

    updateMonthDisplay() {
        const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        document.getElementById('current-month-display').textContent = `${months[this.currentMonth]} ${this.currentYear}`;
        document.getElementById('fortnight-info').textContent = this.currentFortnight === 1 ? 'Estás en la 1ra quincena del mes (días 1-15)' : 'Estás en la 2da quincena del mes (días 16-31)';
        this.updateMonthSummary();
    }

    async updateMonthSummary() {
        const md = await this.getMonthData();
        const fn = md.fortnights[this.currentFortnight];
        const cats = md.categories;
        let fnExpenses = 0;
        cats.forEach(c => (c.expenses[this.currentFortnight] || []).forEach(e => fnExpenses += parseFloat(e.amount)));
        const fnBalance = fn.income - fnExpenses - fn.savings;
        let totalInc = 0, totalExp = 0, totalSav = 0;
        for (const n of [1, 2]) {
            totalInc += md.fortnights[n].income;
            totalSav += md.fortnights[n].savings;
            cats.forEach(c => (c.expenses[n] || []).forEach(e => totalExp += parseFloat(e.amount)));
        }
        const totalBal = totalInc - totalExp - totalSav;
        document.getElementById('current-income').textContent = this.formatCurrency(fn.income);
        document.getElementById('income-input').value = fn.income || '';
        document.getElementById('current-savings').textContent = this.formatCurrency(fn.savings);
        document.getElementById('savings-input').value = fn.savings || '';
        document.getElementById('summary-income').textContent = this.formatCurrency(fn.income);
        document.getElementById('summary-expenses').textContent = this.formatCurrency(fnExpenses);
        document.getElementById('summary-savings').textContent = this.formatCurrency(fn.savings);
        document.getElementById('summary-balance').textContent = this.formatCurrency(fnBalance);
        document.getElementById('summary-balance').className = fnBalance >= 0 ? 'value positive' : 'value negative';
        document.getElementById('total-month-income').textContent = this.formatCurrency(totalInc);
        document.getElementById('total-month-savings').textContent = this.formatCurrency(totalSav);
        document.getElementById('summary-total-income').textContent = this.formatCurrency(totalInc);
        document.getElementById('summary-total-expenses').textContent = this.formatCurrency(totalExp);
        document.getElementById('summary-total-savings').textContent = this.formatCurrency(totalSav);
        document.getElementById('summary-total-balance').textContent = this.formatCurrency(totalBal);
        document.getElementById('summary-total-balance').className = totalBal >= 0 ? 'value positive' : 'value negative';
        const hist = await this.loadAllMonthsForHistory();
        const grandTotal = hist.reduce((s, m) => s + m.totalSavings, 0);
        document.getElementById('total-savings').textContent = this.formatCurrency(grandTotal);
    }

    async updateDashboard() {
        const md = await this.getMonthData();
        let tInc = 0, tExp = 0, tSav = 0;
        for (const n of [1, 2]) {
            tInc += md.fortnights[n].income;
            tSav += md.fortnights[n].savings;
            md.categories.forEach(c => (c.expenses[n] || []).forEach(e => tExp += parseFloat(e.amount)));
        }
        const bal = tInc - tExp - tSav;
        document.getElementById('dash-ingreso').textContent = this.formatCurrency(tInc);
        document.getElementById('dash-gastos').textContent = this.formatCurrency(tExp);
        document.getElementById('dash-ahorros').textContent = this.formatCurrency(tSav);
        document.getElementById('dash-balance').textContent = this.formatCurrency(bal);
        document.getElementById('dash-balance').className = bal >= 0 ? 'value positive' : 'value negative';
        const fn1 = md.fortnights[1], fn2 = md.fortnights[2];
        let e1 = 0, e2 = 0;
        md.categories.forEach(c => { (c.expenses[1] || []).forEach(e => e1 += parseFloat(e.amount)); (c.expenses[2] || []).forEach(e => e2 += parseFloat(e.amount)); });
        document.getElementById('dash-q1-income').textContent = this.formatCurrency(fn1.income);
        document.getElementById('dash-q1-expenses').textContent = this.formatCurrency(e1);
        document.getElementById('dash-q1-savings').textContent = this.formatCurrency(fn1.savings);
        document.getElementById('dash-q2-income').textContent = this.formatCurrency(fn2.income);
        document.getElementById('dash-q2-expenses').textContent = this.formatCurrency(e2);
        document.getElementById('dash-q2-savings').textContent = this.formatCurrency(fn2.savings);
        this.renderRecentMovements(md.fortnights[this.currentFortnight].movements);
        this.updatePieChart(md);
    }

    renderRecentMovements(movements) {
        const c = document.getElementById('recent-movements');
        if (!movements?.length) { c.innerHTML = '<p class="empty-state">No hay movimientos esta quincena</p>'; return; }
        c.innerHTML = movements.slice(-10).reverse().map(m => `<div class="movement-item"><span class="movement-desc">${m.description}</span><span class="movement-amount ${m.type}">${m.type === 'expense' ? '-' : '+'}${this.formatCurrency(m.amount)}</span></div>`).join('');
    }

    async renderCategories() {
        const md = await this.getMonthData();
        const c = document.getElementById('categories-container');
        if (!md.categories.length) { c.innerHTML = '<p class="empty-state">Agrega categorías para empezar</p>'; return; }
        c.innerHTML = md.categories.map(cat => {
            const cfn = cat.expenses[this.currentFortnight] || [];
            const f1 = cat.expenses[1] || [], f2 = cat.expenses[2] || [];
            const t1 = f1.reduce((s, e) => s + parseFloat(e.amount), 0);
            const t2 = f2.reduce((s, e) => s + parseFloat(e.amount), 0);
            return `<div class="category-item">
                <div class="category-header"><span class="category-name">${cat.name}</span><div>
                <span class="category-total" title="Quincena: ${this.formatCurrency(cfn.reduce((s,e)=>s+parseFloat(e.amount),0))}">${this.formatCurrency(t1 + t2)}</span>
                <button class="delete-category-btn" onclick="app.deleteCategory('${cat.id}')">×</button></div></div>
                <button class="add-expense-btn" onclick="app.addExpense('${cat.id}')">+ Agregar Gasto</button>
                <div class="expenses-list">${cfn.map(e => `<div class="expense-item" onclick="app.editExpense('${e.id}')"><span class="expense-desc">${e.description}</span><span class="expense-amount">${this.formatCurrency(e.amount)}</span></div>`).join('')}
                ${!cfn.length ? '<p class="empty-state" style="padding:10px;">No hay gastos esta quincena</p>' : ''}</div></div>`;
        }).join('');
    }

    async renderHistory() {
        const c = document.getElementById('history-container');
        const months = await this.loadAllMonthsForHistory();
        if (!months.length) { c.innerHTML = '<p class="empty-state">No hay registros</p>'; return; }
        const mn = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        if (this.historyFilter === 'months') {
            c.innerHTML = months.map(m => `<div class="history-card" onclick="app.loadMonth('${m.key}')">
                <div class="history-month">${mn[m.month - 1]} ${m.year}</div>
                <div class="history-stats">
                    <div class="history-stat"><span>Ingreso:</span><span>${this.formatCurrency(m.totalIncome)}</span></div>
                    <div class="history-stat"><span>Gastos:</span><span class="negative">${this.formatCurrency(m.totalExpenses)}</span></div>
                    <div class="history-stat"><span>Ahorros:</span><span class="positive">${this.formatCurrency(m.totalSavings)}</span></div>
                    <div class="history-stat"><span>Balance:</span><span class="${m.balance >= 0 ? 'positive' : 'negative'}">${this.formatCurrency(m.balance)}</span></div>
                </div></div>`).join('');
        } else {
            let cards = [];
            months.forEach(m => {
                for (const n of [1, 2]) {
                    const fn = m.fortnights[n];
                    if (!fn) return;
                    cards.push(`<div class="history-fortnight-card" onclick="app.loadMonth('${m.key}')">
                        <div class="fortnight-label">${n === 1 ? '1ra Quincena' : '2da Quincena'}</div>
                        <div class="history-month">${mn[m.month - 1]} ${m.year}</div>
                        <div class="history-stats">
                            <div class="history-stat"><span>Ingreso:</span><span>${this.formatCurrency(fn.income)}</span></div>
                            <div class="history-stat"><span>Gastos:</span><span class="negative">${this.formatCurrency(fn.expenses || 0)}</span></div>
                            <div class="history-stat"><span>Ahorros:</span><span class="positive">${this.formatCurrency(fn.savings)}</span></div>
                            <div class="history-stat"><span>Balance:</span><span class="${(fn.income - (fn.expenses||0) - fn.savings) >= 0 ? 'positive' : 'negative'}">${this.formatCurrency(fn.income - (fn.expenses||0) - fn.savings)}</span></div>
                        </div></div>`);
                }
            });
            c.innerHTML = cards.join('');
        }
    }

    async renderComparisons() {
        if (this.comparisonType === 'monthly') await this.renderMonthlyComparisons();
        else await this.renderFortnightlyComparisons();
    }

    async renderMonthlyComparisons() {
        const months = await this.loadAllMonthsForHistory();
        if (!months.length) return;
        let totE = 0, totS = 0, maxE = { key: '', amt: 0 }, maxS = { key: '', amt: 0 };
        months.forEach(m => {
            totE += m.totalExpenses; totS += m.totalSavings;
            if (m.totalExpenses > maxE.amt) maxE = { key: m.key, amt: m.totalExpenses };
            if (m.totalSavings > maxS.amt) maxS = { key: m.key, amt: m.totalSavings };
        });
        document.getElementById('avg-expenses').textContent = this.formatCurrency(totE / months.length);
        document.getElementById('avg-savings').textContent = this.formatCurrency(totS / months.length);
        document.getElementById('max-expense-month').textContent = maxE.key ? this.formatMonthKey(maxE.key) : 'N/A';
        document.getElementById('max-savings-month').textContent = maxS.key ? this.formatMonthKey(maxS.key) : 'N/A';
        document.getElementById('trend-title').textContent = 'Tendencia de Gastos Mensuales';
        document.getElementById('savings-title').textContent = 'Tendencia de Ahorros Mensuales';
        const labels = months.map(m => this.formatMonthKey(m.key));
        const expData = months.map(m => m.totalExpenses);
        const savData = months.map(m => m.totalSavings);
        this.updateTrendChart(labels, expData);
        this.updateSavingsChart(labels, savData);
    }

    async renderFortnightlyComparisons() {
        const months = await this.loadAllMonthsForHistory();
        if (!months.length) return;
        const mn = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        let allFn = [], totE = 0, totS = 0, maxE = { l: '', a: 0 }, maxS = { l: '', a: 0 };
        months.forEach(m => {
            for (const n of [1, 2]) {
                const fn = m.fortnights[n];
                if (!fn) return;
                const l = `${mn[m.month - 1]} ${n === 1 ? 'Q1' : 'Q2'}`;
                allFn.push({ label: l, expenses: fn.expenses || 0, savings: fn.savings });
                totE += fn.expenses || 0; totS += fn.savings;
                if ((fn.expenses||0) > maxE.a) maxE = { l, a: fn.expenses||0 };
                if (fn.savings > maxS.a) maxS = { l, a: fn.savings };
            }
        });
        document.getElementById('avg-expenses').textContent = this.formatCurrency(totE / allFn.length);
        document.getElementById('avg-savings').textContent = this.formatCurrency(totS / allFn.length);
        document.getElementById('max-expense-month').textContent = maxE.l || 'N/A';
        document.getElementById('max-savings-month').textContent = maxS.l || 'N/A';
        document.getElementById('trend-title').textContent = 'Tendencia de Gastos Quincenales';
        document.getElementById('savings-title').textContent = 'Tendencia de Ahorros Quincenales';
        this.updateTrendChart(allFn.map(f => f.label), allFn.map(f => f.expenses));
        this.updateSavingsChart(allFn.map(f => f.label), allFn.map(f => f.savings));
    }

    loadMonth(key) {
        const [y, m] = key.split('-').map(Number);
        this.currentYear = y; this.currentMonth = m - 1;
        this.monthDataCache = null;
        this.allMonthsCache = [];
        this.loadAll();
        this.switchTab('mes-actual');
    }

    // ========== CHARTS ==========

    initCharts() { this.pieChart = null; this.trendChart = null; this.savingsTrendChart = null; }

    updatePieChart(md) {
        const cats = [];
        (md?.categories || []).forEach(c => {
            const t = [1, 2].reduce((s, n) => s + (c.expenses[n] || []).reduce((a, e) => a + parseFloat(e.amount), 0), 0);
            if (t > 0) cats.push({ name: c.name, total: t });
        });
        const ctx = document.getElementById('pie-chart').getContext('2d');
        if (this.pieChart) this.pieChart.destroy();
        if (!cats.length) { ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.fillStyle = '#94a3b8'; ctx.font = '16px Segoe UI'; ctx.textAlign = 'center'; ctx.fillText('Sin datos', ctx.canvas.width / 2, ctx.canvas.height / 2); return; }
        const colors = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#14b8a6','#f97316','#84cc16'];
        this.pieChart = new Chart(ctx, { type: 'doughnut', data: { labels: cats.map(c => c.name), datasets: [{ data: cats.map(c => c.total), backgroundColor: colors.slice(0, cats.length), borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#f8fafc', padding: 15, font: { size: 12 } } } } } });
    }

    updateTrendChart(labels, data) {
        const ctx = document.getElementById('trend-chart').getContext('2d');
        if (this.trendChart) this.trendChart.destroy();
        if (!labels.length) { ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); return; }
        this.trendChart = new Chart(ctx, { type: 'line', data: { labels, datasets: [{ label: 'Gastos', data, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', fill: true, tension: 0.4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#f8fafc' } } }, scales: { x: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } }, y: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } } } } });
    }

    updateSavingsChart(labels, data) {
        const ctx = document.getElementById('savings-chart').getContext('2d');
        if (this.savingsTrendChart) this.savingsTrendChart.destroy();
        if (!labels.length) { ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); return; }
        this.savingsTrendChart = new Chart(ctx, { type: 'bar', data: { labels, datasets: [{ label: 'Ahorros', data, backgroundColor: '#10b981', borderRadius: 8 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#f8fafc' } } }, scales: { x: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } }, y: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } } } } });
    }

    formatMonthKey(key) { const [y, m] = key.split('-'); const mn = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']; return `${mn[parseInt(m) - 1]} ${y}`; }

    // ========== SYNC / SETUP ==========

    updateSyncUI(status) {
        const i = document.getElementById('sync-indicator');
        if (!i) return;
        i.classList.remove('hidden');
        const map = { loading: ['🔄', 'Cargando...', 'syncing'], synced: ['✅', 'Sincronizado', 'synced'], syncing: ['🔄', 'Guardando...', 'syncing'], error: ['❌', 'Error', 'error'] };
        const [icon, text, cls] = map[status] || map.error;
        i.className = `sync-indicator ${cls}`;
        i.querySelector('#sync-icon').textContent = icon;
        i.querySelector('#sync-text').textContent = text;
        if (status === 'synced') setTimeout(() => { if (i.classList.contains('synced')) i.classList.add('hidden'); }, 2000);
    }

    showSetup() {
        document.getElementById('app-container').innerHTML = `<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;">
            <div style="background:#1e293b;padding:40px;border-radius:16px;max-width:600px;text-align:center;">
            <h1 style="color:#f8fafc;margin-bottom:20px;">💰 Mis Finanzas</h1>
            <div style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#fca5a5;padding:15px;border-radius:8px;margin-bottom:20px;"><strong>Tablas no existen</strong></div>
            <p style="color:#94a3b8;margin-bottom:20px;">Abre <code style="color:#a5b4fc;">setup.html</code> y ejecuta el schema SQL (Paso 1).</p>
            <button onclick="location.reload()" style="background:#6366f1;color:white;border:none;padding:12px 24px;border-radius:8px;cursor:pointer;font-size:16px;">Recargar</button>
            </div></div>`;
    }

    // ========== NAVIGATION ==========

    async prevMonth() { this.currentMonth--; if (this.currentMonth < 0) { this.currentMonth = 11; this.currentYear--; } this.monthDataCache = null; this.allMonthsCache = []; await this.loadAll(); }
    async nextMonth() { this.currentMonth++; if (this.currentMonth > 11) { this.currentMonth = 0; this.currentYear++; } this.monthDataCache = null; this.allMonthsCache = []; await this.loadAll(); }
    async switchFortnight(n) { this.currentFortnight = n; document.querySelectorAll('.fortnight-btn').forEach(b => b.classList.remove('active')); document.querySelector(`[data-fortnight="${n}"]`).classList.add('active'); this.monthDataCache = null; this.updateMonthDisplay(); await this.renderCategories(); }

    switchTab(tabId) {
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
        document.getElementById(tabId).classList.add('active');
        document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
        if (tabId === 'historial') this.renderHistory();
        else if (tabId === 'comparativas') this.renderComparisons();
        else if (tabId === 'dashboard') this.updateDashboard();
        else if (tabId === 'ahorros') this.renderSavings();
    }

    formatCurrency(amount) { return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amount || 0); }

    closeCategoryModal() { document.getElementById('category-modal').classList.remove('active'); }
    closeExpenseModal() { document.getElementById('expense-modal').classList.remove('active'); }
    closeEditExpenseModal() { document.getElementById('edit-expense-modal').classList.remove('active'); }
    closeEditSavingsModal() { document.getElementById('edit-savings-modal').classList.remove('active'); }

    setupEventListeners() {
        document.querySelectorAll('.nav-tab').forEach(b => b.addEventListener('click', () => this.switchTab(b.dataset.tab)));
        document.getElementById('prev-month').addEventListener('click', () => this.prevMonth());
        document.getElementById('next-month').addEventListener('click', () => this.nextMonth());
        document.querySelectorAll('.fortnight-btn').forEach(b => b.addEventListener('click', () => this.switchFortnight(parseInt(b.dataset.fortnight))));
        document.getElementById('save-income').addEventListener('click', () => this.setIncome());
        document.getElementById('income-input').addEventListener('keypress', e => { if (e.key === 'Enter') this.setIncome(); });
        document.getElementById('add-category').addEventListener('click', () => this.addCategory());
        document.getElementById('save-category').addEventListener('click', () => this.saveCategory());
        document.getElementById('cancel-category').addEventListener('click', () => this.closeCategoryModal());
        document.getElementById('category-name').addEventListener('keypress', e => { if (e.key === 'Enter') this.saveCategory(); });
        document.getElementById('save-expense').addEventListener('click', () => this.saveExpense());
        document.getElementById('cancel-expense').addEventListener('click', () => this.closeExpenseModal());
        document.getElementById('expense-amount').addEventListener('keypress', e => { if (e.key === 'Enter') this.saveExpense(); });
        document.getElementById('update-expense').addEventListener('click', () => this.updateExpense());
        document.getElementById('delete-expense').addEventListener('click', () => this.deleteExpense());
        document.getElementById('cancel-edit-expense').addEventListener('click', () => this.closeEditExpenseModal());
        document.getElementById('save-savings').addEventListener('click', () => this.setSavings());
        document.getElementById('savings-input').addEventListener('keypress', e => { if (e.key === 'Enter') this.setSavings(); });
        document.querySelector('.close-modal').addEventListener('click', () => this.closeCategoryModal());
        document.querySelector('.close-expense-modal').addEventListener('click', () => this.closeExpenseModal());
        document.querySelector('.close-edit-modal').addEventListener('click', () => this.closeEditExpenseModal());
        window.addEventListener('click', e => { if (e.target.classList.contains('modal')) e.target.classList.remove('active'); });
        document.querySelectorAll('.filter-btn').forEach(b => b.addEventListener('click', () => { document.querySelectorAll('.filter-btn').forEach(x => x.classList.remove('active')); b.classList.add('active'); this.historyFilter = b.dataset.filter; this.renderHistory(); }));
        document.querySelectorAll('.comp-tab').forEach(b => b.addEventListener('click', () => { document.querySelectorAll('.comp-tab').forEach(x => x.classList.remove('active')); b.classList.add('active'); this.comparisonType = b.dataset.comparison; this.renderComparisons(); }));
        document.getElementById('add-savings-in').addEventListener('click', () => this.addSavingsIn());
        document.getElementById('savings-in-amount').addEventListener('keypress', e => { if (e.key === 'Enter') this.addSavingsIn(); });
        document.getElementById('savings-in-reason').addEventListener('keypress', e => { if (e.key === 'Enter') this.addSavingsIn(); });
        document.getElementById('add-savings-out').addEventListener('click', () => this.addSavingsOut());
        document.getElementById('savings-out-amount').addEventListener('keypress', e => { if (e.key === 'Enter') this.addSavingsOut(); });
        document.getElementById('savings-out-reason').addEventListener('keypress', e => { if (e.key === 'Enter') this.addSavingsOut(); });
        document.getElementById('update-savings').addEventListener('click', () => this.updateSavingsEntry());
        document.getElementById('delete-savings').addEventListener('click', async () => { await this.deleteSavingsEntry(document.getElementById('edit-savings-id').value); document.getElementById('edit-savings-modal').classList.remove('active'); });
        document.getElementById('cancel-edit-savings').addEventListener('click', () => this.closeEditSavingsModal());
        document.querySelector('.close-edit-savings-modal').addEventListener('click', () => this.closeEditSavingsModal());
    }
}

const app = new FinanceApp();
