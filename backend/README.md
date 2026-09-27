# Pedidos de Señales

Sistema web para el flujo **Operaciones → Marketing → Producción** de pedidos de señales.
Backend en Node.js (Express + PostgreSQL) que además sirve el frontend estático.

## Requisitos
- Node.js 18 o superior
- PostgreSQL 14 o superior

## Instalación

```bash
npm install
cp .env.example .env        # edita DATABASE_URL con tu usuario/clave
npm run db:init             # crea la BD, tablas, reglas, vistas y catálogos base
# o, para probar con datos de ejemplo (BORRA lo que haya):
npm run db:demo
npm start                   # http://localhost:3000
```

`npm run dev` reinicia el servidor al guardar cambios.

## Estructura

```
sql/
  00_catalogos_base.sql     materiales, viniles y etapas iniciales
  01_esquema.sql            tablas, triggers (stock, estados, entregas) y vistas KPI
  02_datos_ejemplo.sql      datos de prueba
  03_consultas_uso_y_kpi.sql consultas útiles (no las usa la app)
scripts/init-db.js          crea la BD y carga los SQL
src/
  server.js                 Express: /api + archivos estáticos de /public
  db.js                     pool de PostgreSQL y transacciones
  http.js                   validación y traducción de errores de BD a HTTP
  routes/                   catalogos, senales (stock), pedidos, trabajo (bandejas y tiempos), kpis
public/                     frontend (HTML + CSS + JS sin compilación)
```

## Pantallas
| Pantalla | Para quién | Qué hace |
|---|---|---|
| Operaciones | Operaciones | Arma el pedido (señales del catálogo o nuevas), ve el estado de cada pedido, lo marca como entregado |
| Marketing | Marketing | Bandeja de líneas por imprimir; inicia/finaliza Diseño, Encuadre e Impresión con cronómetro |
| Producción | Producción | Igual, para Corte, Armado y Control y embalaje; muestra si el vinil ya está impreso |
| Señales y stock | Todos | Catálogo de señales, entradas/ajustes de stock y kardex |
| Dashboard | Jefaturas | KPIs de avance, cobertura con stock, minutos por unidad, ciclo por prioridad, productividad |
| Catálogos | Admin | Materiales, viniles, clientes y colaboradores |

"Trabajando como" (arriba a la derecha) define quién queda registrado en tiempos, movimientos y entregas.

## Reglas que aplica la base de datos
- Al registrar una línea se toma el stock disponible; si cubre todo, Marketing y Producción quedan en *No requiere*.
- Registrar tiempos avanza los estados: primer registro → *En proceso*; unidades de la etapa final ≥ lo que falta → *Terminado*.
- El estado global se calcula (no se edita a mano). Solo se entrega un pedido con todas sus líneas finalizadas.
- Todo movimiento de stock queda en el kardex; no se edita ni borra (se corrige con un ajuste). Si se elimina una línea o un pedido, su stock vuelve.

## API (resumen)
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/salud` | Estado del servidor y la BD |
| GET | `/api/catalogos` | Materiales, viniles, clientes, colaboradores, etapas |
| GET/POST/PUT/DELETE | `/api/{materiales\|viniles\|clientes\|colaboradores}[/:id]` | CRUD de catálogos |
| GET/POST/PUT | `/api/senales[/:id]` | Señales (POST acepta `stock_inicial`) |
| GET | `/api/senales/:id/kardex` | Movimientos de stock con saldo |
| POST | `/api/stock/movimientos` | `{id_senal, tipo: ENTRADA\|AJUSTE, cantidad, observacion}` |
| GET | `/api/pedidos?estado=&prioridad=` | Resumen de pedidos |
| GET | `/api/pedidos/:id` | Pedido con sus líneas |
| POST | `/api/pedidos` | `{id_cliente, prioridad, fecha_requerida, lineas:[{id_senal, cantidad} \| {nueva_senal:{…}, cantidad}]}` |
| PATCH | `/api/pedidos/:id` | Cambiar prioridad, fecha requerida u observación |
| POST | `/api/pedidos/:id/lineas` | Agregar línea |
| POST | `/api/pedidos/:id/entregar` | `{id_colaborador}` |
| DELETE | `/api/pedidos/:id`, `/api/detalles/:id` | Eliminar pedido / línea (devuelve stock) |
| GET | `/api/bandeja/{marketing\|produccion}?prioridad=&terminados=1` | Bandeja de trabajo con sesiones |
| POST | `/api/tiempos` | Iniciar etapa `{id_detalle_pedido, id_etapa, id_colaborador}` |
| PATCH | `/api/tiempos/:id/finalizar` | `{cantidad_procesada}` |
| GET | `/api/detalles/:id/tiempos` | Historial de tiempos de una línea |
| GET | `/api/kpis` | Todos los indicadores del dashboard |

## Antes de ponerlo en red
- No tiene inicio de sesión: úsalo en la red interna o detrás de un proxy con autenticación.
- Cambia la clave de PostgreSQL y no subas `.env` al repositorio.
