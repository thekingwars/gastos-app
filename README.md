# 💰 Mis Finanzas - App de Control de Gastos Mensuales con Quincenas

Una aplicación web completa para llevar el control de tus finanzas personales con soporte para cobro quincenal.

## ✨ Características Principales

### 📊 Dashboard
- Resumen rápido del mes completo
- **Comparativa visual entre quincenas** (1ra vs 2da)
- Distribución de gastos por categoría
- Últimos movimientos registrados

### 💵 Control de Ingresos por Quincena
- Registra tu ingreso por cada quincena por separado
- Visualiza el ingreso total del mes (suma de ambas quincenas)
- Navega fácilmente entre quincenas

### 📂 Categorías Personalizadas
- Crea tus propias categorías (Mascotas, Alquiler, Comida, etc.)
- Los gastos se registran por quincena
- Edita o elimina gastos existentes
- Visualiza totales por categoría y por quincena

### 🐷 Sistema de Ahorros por Quincena
- Registra cuánto ahorras en cada quincena
- Los ahorros se restan del ingreso quincenal
- Acumulación total de ahorros (quincena a quincena y mes a mes)

### ✈️ Viajes (sección autónoma)
- Registra gastos de viaje sin mezclarlos con el mes, ahorros, historial o comparativas
- Indica el monto, el tipo de gasto y cuántas personas participan
- El reparto se calcula automáticamente; por defecto son **2 personas**
- Agrupa gastos por nombre de viaje y edita o elimina cada registro

### 📅 Historial Flexible
- **Vista por Meses**: Resumen mensual completo
- **Vista por Quincenas**: Detalle de cada quincena individual
- Carga rápida de meses o quincenas anteriores

### 📈 Comparativas
- **Mensuales**: Tendencia mes a mes
- **Quincenales**: Tendencia quincena a quincena
- Estadísticas generales:
  - Promedio de gastos
  - Promedio de ahorros
  - Período con mayor gasto
  - Período con mayor ahorro

## 🚀 Cómo Usar

### Abrir la app
```bash
cd /Users/carlos/Documents/gastos-app
./abrir-app.sh
```
O simplemente haz doble clic en `index.html` desde el Finder.

### Registrar tu ingreso quincenal
1. Ve a la pestaña "Mes Actual"
2. Selecciona la quincena (1ra o 2da)
3. Ingresa el monto de esa quincena
4. Haz clic en "Guardar Ingreso"

### Crear categorías
1. Haz clic en "+ Nueva Categoría"
2. Escribe el nombre (ej: "Mascotas", "Alquiler", "Comida")
3. Las categorías se comparten entre ambas quincenas

### Agregar gastos
1. En la categoría creada, haz clic en "+ Agregar Gasto"
2. El sistema registra automáticamente a qué quincena pertenece
3. Describe el gasto y su monto
4. Haz clic en "Agregar Gasto"

### Registrar ahorros
1. Selecciona la quincena
2. En la sección de Ahorros, ingresa la cantidad
3. Haz clic en "Agregar Ahorro"
4. Este monto se restará de tu ingreso quincenal

### Registrar gastos de viaje
1. Ve a la pestaña "Viajes"
2. Escribe el nombre del viaje, el tipo de gasto y el monto
3. Indica cuántas personas participan (por defecto 2)
4. El total se reparte automáticamente entre cada quien

### Ver historial
- Ve a la pestaña "Historial"
- Cambia entre "Ver por Meses" o "Ver por Quincenas"
- Haz clic en cualquier registro para ver los detalles

### Comparar períodos
- Ve a la pestaña "Comparativas"
- Selecciona "Mensuales" o "Quincenales"
- Visualiza gráficos de tendencias y estadísticas

## 💡 Ejemplo de Uso

**Mes: Julio 2026**

| Concepto | 1ra Quincena | 2da Quincena | Total Mes |
|----------|--------------|--------------|-----------|
| Ingreso | $500 | $500 | $1,000 |
| Gastos | $300 | $350 | $650 |
| Ahorros | $100 | $100 | $200 |
| Balance | $100 | $50 | $150 |

## 💾 Almacenamiento

Los datos se guardan automáticamente en Supabase. La aplicación es personal y usa el proyecto configurado en `app.js`; no depende de `localStorage` ni funciona offline.

Si la base de datos todavía usa la tabla antigua `finance_data`, abre `setup.html`, ejecuta el esquema relacional en el SQL Editor y usa la migración idempotente. La app no elimina datos legacy automáticamente.

## 📱 Compatible con

- Computadoras de escritorio
- Tablets
- Teléfonos móviles (diseño responsivo)

## 🛠️ Tecnologías

- HTML5
- CSS3 (con variables CSS)
- JavaScript vanilla
- Chart.js 4 (para gráficos)
- Supabase (persistencia)
- Node.js test runner (pruebas de lógica)

## 📝 Notas

- La app usa moneda USD por defecto
- Los datos se almacenan en Supabase
- No requiere servidor local; puede abrirse desde `index.html`
- Requiere conexión a internet para Supabase y Chart.js
- Las categorías se comparten entre ambas quincenas del mes
- Cada quincena mantiene sus gastos e ingresos por separado

## 🧪 Comprobaciones

```bash
npm test
npm run check
```

Las pruebas cubren cálculos monetarios, balances, historial, movimientos derivados, escape de texto introducido por el usuario y el reparto autónomo de gastos de viaje.
