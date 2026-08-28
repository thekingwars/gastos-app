(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory(require('./domain'));
    } else {
        root.FinanceRepository = factory(root.FinanceDomain);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Domain) {
    'use strict';

    class RepositoryError extends Error {
        constructor(operation, originalError) {
            super(`${operation}: ${originalError?.message || 'Error desconocido'}`);
            this.name = 'RepositoryError';
            this.operation = operation;
            this.originalError = originalError;
            this.code = originalError?.code;
        }
    }

    class FinanceRepository {
        constructor(client) {
            this.client = client;
            this.sourceLinkAvailable = null;
            this.travelAvailable = null;
        }

        async run(request, operation) {
            try {
                const result = await request;
                if (result?.error) throw result.error;
                return result?.data;
            } catch (error) {
                throw new RepositoryError(operation, error);
            }
        }

        isMissingColumn(error, column) {
            const message = String(error?.message || '').toLowerCase();
            return message.includes(column.toLowerCase()) &&
                (message.includes('column') || message.includes('schema cache') || message.includes('does not exist'));
        }

        isMissingFunction(error) {
            const message = String(error?.message || '').toLowerCase();
            return error?.code === '42883' || (message.includes('function') && (
                message.includes('does not exist') || message.includes('could not find') || message.includes('schema cache')
            ));
        }

        isMissingTable(error, table) {
            const original = error?.originalError || error;
            const message = String(original?.message || error?.message || '').toLowerCase();
            const code = original?.code || error?.code;
            return code === 'PGRST205' || (
                message.includes(String(table).toLowerCase()) && (
                    message.includes('does not exist') ||
                    message.includes('schema cache') ||
                    message.includes('could not find the table')
                )
            );
        }

        async ensureMonth(year, month) {
            const existing = await this.run(
                this.client.from('months').select('id').eq('year', year).eq('month', month).limit(1),
                'buscar mes'
            );
            if (existing?.[0]) return existing[0].id;

            const inserted = await this.run(
                this.client.from('months')
                    .upsert({ year, month }, { onConflict: 'year,month' })
                    .select('id')
                    .single(),
                'crear mes'
            );
            return inserted.id;
        }

        async ensureFortnights(monthId) {
            const existing = await this.run(
                this.client.from('fortnights')
                    .select('id, fortnight_number')
                    .eq('month_id', monthId),
                'buscar quincenas'
            ) || [];
            const existingNumbers = new Set(existing.map(item => item.fortnight_number));
            const missing = Domain.FORTNIGHTS
                .filter(number => !existingNumbers.has(number))
                .map(fortnight_number => ({ month_id: monthId, fortnight_number }));

            if (missing.length) {
                await this.run(
                    this.client.from('fortnights')
                        .upsert(missing, { onConflict: 'month_id,fortnight_number' }),
                    'crear quincenas'
                );
            }

            const rows = await this.run(
                this.client.from('fortnights')
                    .select('id, fortnight_number')
                    .eq('month_id', monthId),
                'recargar quincenas'
            ) || [];
            return rows.reduce((result, row) => {
                result[row.fortnight_number] = row.id;
                return result;
            }, {});
        }

        async getMonthData(monthId, fortnightIds) {
            const ids = Object.values(fortnightIds);
            const [fortnightRows, categoryRows, expenseRows] = await Promise.all([
                this.run(
                    this.client.from('fortnights')
                        .select('id, fortnight_number, income, savings, updated_at')
                        .eq('month_id', monthId),
                    'cargar quincenas'
                ),
                this.run(
                    this.client.from('categories')
                        .select('id, name, created_at, updated_at')
                        .eq('month_id', monthId)
                        .order('created_at'),
                    'cargar categorías'
                ),
                this.run(
                    this.client.from('expenses')
                        .select('id, category_id, fortnight_id, description, amount, expense_date, created_at, updated_at')
                        .in('fortnight_id', ids)
                        .order('created_at'),
                    'cargar gastos'
                )
            ]);

            const fortnights = {};
            (fortnightRows || []).forEach(row => {
                fortnights[row.fortnight_number] = { ...row, expenses: [] };
            });
            Domain.FORTNIGHTS.forEach(number => {
                if (!fortnights[number]) {
                    fortnights[number] = { fortnight_number: number, income: 0, savings: 0, expenses: [] };
                }
            });

            const categories = (categoryRows || []).map(category => ({
                ...category,
                expenses: { 1: [], 2: [] }
            }));
            const categoriesById = new Map(categories.map(category => [category.id, category]));
            const fortnightNumberById = new Map(Object.entries(fortnightIds).map(([number, id]) => [id, Number(number)]));
            (expenseRows || []).forEach(expense => {
                const category = categoriesById.get(expense.category_id);
                const number = fortnightNumberById.get(expense.fortnight_id);
                if (category && category.expenses[1] && category.expenses[2]) {
                    if (number) category.expenses[number].push(expense);
                }
                if (number && fortnights[number]) fortnights[number].expenses.push(expense);
            });

            return { fortnights, categories };
        }

        async listHistory() {
            const months = await this.run(
                this.client.from('months').select(`
                    id, year, month,
                    fortnights (
                        id, fortnight_number, income, savings,
                        expenses (amount)
                    )
                `).order('year', { ascending: false }).order('month', { ascending: false }).limit(120),
                'cargar historial'
            );
            return Domain.buildHistory(months || []);
        }

        async listPersonalSavings() {
            try {
                const rows = await this.run(
                    this.client.from('personal_savings')
                        .select('id, type, amount, reason, entry_date, created_at, updated_at, source_fortnight_id')
                        .order('entry_date', { ascending: false }),
                    'cargar ahorros personales'
                );
                this.sourceLinkAvailable = true;
                return rows || [];
            } catch (error) {
                if (!this.isMissingColumn(error, 'source_fortnight_id')) throw error;
                this.sourceLinkAvailable = false;
                const rows = await this.run(
                    this.client.from('personal_savings')
                        .select('id, type, amount, reason, entry_date, created_at, updated_at')
                        .order('entry_date', { ascending: false }),
                    'cargar ahorros personales compatibles'
                );
                return rows || [];
            }
        }

        async setIncome(fortnightId, amount) {
            await this.run(
                this.client.from('fortnights')
                    .update({ income: amount, updated_at: new Date().toISOString() })
                    .eq('id', fortnightId),
                'guardar ingreso'
            );
        }

        async setSavings(fortnightId, amount, automaticEntry) {
            try {
                const result = await this.client.rpc('set_savings_and_sync', {
                    p_fortnight_id: fortnightId,
                    p_amount: amount,
                    p_reason: automaticEntry.reason
                });
                if (!result.error) return;
                if (!this.isMissingFunction(result.error)) {
                    throw new RepositoryError('guardar ahorro atómico', result.error);
                }
            } catch (error) {
                if (error instanceof RepositoryError && !this.isMissingFunction(error.originalError)) throw error;
                if (!this.isMissingFunction(error)) throw new RepositoryError('guardar ahorro atómico', error);
            }

            await this.run(
                this.client.from('fortnights')
                    .update({ savings: amount, updated_at: new Date().toISOString() })
                    .eq('id', fortnightId),
                'guardar ahorro quincenal'
            );
            await this.syncAutomaticSavings(fortnightId, amount, automaticEntry);
        }

        async syncAutomaticSavings(fortnightId, amount, automaticEntry) {
            let sourceLinkAvailable = this.sourceLinkAvailable;
            if (sourceLinkAvailable === null) {
                try {
                    await this.run(
                        this.client.from('personal_savings').select('id, source_fortnight_id').limit(1),
                        'comprobar vínculo de ahorros'
                    );
                    sourceLinkAvailable = true;
                } catch (error) {
                    if (!this.isMissingColumn(error, 'source_fortnight_id')) throw error;
                    sourceLinkAvailable = false;
                }
                this.sourceLinkAvailable = sourceLinkAvailable;
            }

            let existing;
            if (sourceLinkAvailable) {
                existing = await this.run(
                    this.client.from('personal_savings')
                        .select('id')
                        .eq('source_fortnight_id', fortnightId)
                        .maybeSingle(),
                    'buscar ahorro automático'
                );
            } else {
                existing = await this.run(
                    this.client.from('personal_savings')
                        .select('id')
                        .eq('type', 'income')
                        .eq('reason', automaticEntry.reason)
                        .maybeSingle(),
                    'buscar ahorro automático compatible'
                );
            }

            if (existing && amount === 0) {
                await this.run(
                    this.client.from('personal_savings').delete().eq('id', existing.id),
                    'eliminar ahorro automático'
                );
                return;
            }

            if (existing) {
                await this.run(
                    this.client.from('personal_savings').update({
                        amount,
                        updated_at: new Date().toISOString()
                    }).eq('id', existing.id),
                    'actualizar ahorro automático'
                );
                return;
            }

            if (amount <= 0) return;
            const payload = {
                type: 'income',
                amount,
                reason: automaticEntry.reason,
                entry_date: new Date().toISOString()
            };
            if (sourceLinkAvailable) payload.source_fortnight_id = fortnightId;
            await this.run(
                this.client.from('personal_savings').insert(payload),
                'crear ahorro automático'
            );
        }

        async createCategory(monthId, name) {
            const existing = await this.run(
                this.client.from('categories')
                    .select('id')
                    .eq('month_id', monthId)
                    .ilike('name', name)
                    .limit(1),
                'comprobar categoría'
            );
            if (existing?.length) throw new Error('Ya existe una categoría con ese nombre.');
            await this.run(
                this.client.from('categories').insert({ month_id: monthId, name }),
                'crear categoría'
            );
        }

        async deleteCategory(categoryId) {
            await this.run(
                this.client.from('categories').delete().eq('id', categoryId),
                'eliminar categoría'
            );
        }

        async createExpense(payload) {
            await this.run(
                this.client.from('expenses').insert(payload),
                'crear gasto'
            );
        }

        async updateExpense(expenseId, payload) {
            await this.run(
                this.client.from('expenses')
                    .update({ ...payload, updated_at: new Date().toISOString() })
                    .eq('id', expenseId),
                'actualizar gasto'
            );
        }

        async deleteExpense(expenseId) {
            await this.run(
                this.client.from('expenses').delete().eq('id', expenseId),
                'eliminar gasto'
            );
        }

        async createPersonalSavings(payload) {
            await this.run(
                this.client.from('personal_savings').insert(payload),
                'crear movimiento de ahorros'
            );
        }

        async updatePersonalSavings(id, payload) {
            await this.run(
                this.client.from('personal_savings')
                    .update({ ...payload, updated_at: new Date().toISOString() })
                    .eq('id', id),
                'actualizar movimiento de ahorros'
            );
        }

        async deletePersonalSavings(id) {
            await this.run(
                this.client.from('personal_savings').delete().eq('id', id),
                'eliminar movimiento de ahorros'
            );
        }

        async listTravelExpenses() {
            try {
                const rows = await this.run(
                    this.client.from('travel_expenses')
                        .select('id, trip_name, expense_type, amount, people_count, notes, expense_date, created_at, updated_at')
                        .order('expense_date', { ascending: false }),
                    'cargar gastos de viaje'
                );
                this.travelAvailable = true;
                return rows || [];
            } catch (error) {
                if (this.isMissingTable(error, 'travel_expenses')) {
                    this.travelAvailable = false;
                    return [];
                }
                throw error;
            }
        }

        async createTravelExpense(payload) {
            await this.run(
                this.client.from('travel_expenses').insert(payload),
                'crear gasto de viaje'
            );
        }

        async updateTravelExpense(id, payload) {
            await this.run(
                this.client.from('travel_expenses')
                    .update({ ...payload, updated_at: new Date().toISOString() })
                    .eq('id', id),
                'actualizar gasto de viaje'
            );
        }

        async deleteTravelExpense(id) {
            await this.run(
                this.client.from('travel_expenses').delete().eq('id', id),
                'eliminar gasto de viaje'
            );
        }
    }

    return FinanceRepository;
});
