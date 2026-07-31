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

Los datos se guardan automáticamente en el navegador usando `localStorage`. Puedes cerrar y volver a abrir la app sin perder información.

## 📱 Compatible con

- Computadoras de escritorio
- Tablets
- Teléfonos móviles (diseño responsivo)

## 🛠️ Tecnologías

- HTML5
- CSS3 (con variables CSS)
- JavaScript vanilla
- Chart.js (para gráficos)

## 📝 Notas

- La app usa moneda USD por defecto
- Los datos se almacenan localmente en tu navegador
- No requiere instalación ni servidor
- Funciona sin conexión a internet
- Las categorías se comparten entre ambas quincenas del mes
- Cada quincena mantiene sus gastos e ingresos por separado
# gastos-app
