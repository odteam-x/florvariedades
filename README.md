# Flor Variedades — Sistema de Gestión

Sistema completo de gestión de negocio (POS, facturas, inventario, clientes, gastos, reportes) construido como SPA conectada a Google Sheets vía Google Apps Script.

## Stack

- **Frontend:** HTML + CSS + JavaScript vanilla (SPA)
- **Backend:** Google Apps Script (`code.gs`) usando Google Sheets como base de datos
- **Gráficos:** Chart.js
- **Iconos:** Lucide
- **Tipografía:** Inter (Google Fonts)

## Archivos

| Archivo | Descripción |
|---|---|
| `index.html` | Estructura principal de la SPA |
| `styles.css` | Estilos con paleta rosa/verde/marrón, responsive móvil completo |
| `app.js` | Lógica de la aplicación, API_URL y código de Apps Script embebido |
| `code.gs` | Backend para pegar en Google Apps Script |

## Despliegue

### 1. Backend (Google Apps Script)

1. Abre tu Google Sheet
2. Menú **Extensiones → Apps Script**
3. Pega el contenido de `code.gs`
4. Guarda y ejecuta `initDB()` una vez para crear las hojas
5. **Implementar → Nueva implementación → Aplicación web**
   - Ejecutar como: *Yo mismo*
   - Acceso: *Cualquier usuario*
6. Copia la URL del webapp

### 2. Frontend

1. Abre `app.js` y reemplaza la constante `API_URL` al inicio con la URL del webapp
2. Sube los archivos a cualquier hosting estático (GitHub Pages, Netlify, Vercel, etc.)

## Funcionalidades

- **Dashboard** — métricas, gráficos, alertas de stock bajo
- **POS** — punto de venta con carrito, ITBIS automático, envío por WhatsApp
- **Facturas** — creación, previsualización profesional, estados
- **Inventario** — CRUD de productos con imágenes guardadas en Google Drive
- **Clientes** — historial completo, deudas, contacto por WhatsApp
- **Gastos** — registro, categorización, gráficos
- **Reportes** — filtrables por periodo, exportables
- **Configuración** — datos del negocio, moneda, ITBIS, facturación

## Móvil

100% responsive con bottom navigation, touch targets ≥44px, soporte de safe-area para iPhone con notch, sin zoom forzado en inputs iOS.
