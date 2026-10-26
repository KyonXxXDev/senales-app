# Señalética · Pedidos de señales

Microservicio para el flujo **Operaciones → Marketing → Producción** de pedidos de señales, integrable al ERP de **RRHH + Inventario**.
Node.js 20 (Express 5 + PostgreSQL) que sirve también su frontend estático (Tailwind CSS 4 + DaisyUI 5, el mismo stack visual del ERP).

## Qué hace

| Pantalla | Quién | Qué hace |
|---|---|---|
| Operaciones | Área Operaciones | Arma pedidos (señales del catálogo o nuevas con imagen en SharePoint), los sigue, **edita cantidades** y marca entregas |
| Marketing / Producción | Cada área | Bandeja por pedido con cronómetro por etapa, unidades terminadas y edición de sesiones |
| Señales y stock | Todos (mover stock: Operaciones/Producción) | Catálogo, entradas y ajustes, kardex |
| Insumos | Todos (registrar: Logística) | Sustratos y viniles **enlazados al inventario del ERP**: stock por almacén y consumo pendiente de descargar |
| Dashboard | Todos | KPIs de avance, cobertura con stock, minutos por unidad, ciclo por prioridad, productividad |
| Catálogos | Administradores | Colaboradores (sincronizados con RRHH), clientes, sustratos, viniles, estado de la integración |

### Cantidades editadas
Cambiar la cantidad de una línea pasa por la función de BD `fn_editar_cantidad_linea()`:
- subir: toma primero lo que haya en stock y el resto pasa a "a producir";
- bajar: reduce primero lo pendiente y, si no alcanza, devuelve stock; nunca por debajo de lo ya terminado;
- recalcula estados, deja el movimiento en el kardex y una fila en `detalle_pedido_edicion` (quién, cuándo, antes/después, motivo);
- la línea queda con `cantidad_editada = true` y `cantidad_original`; el pedido muestra "Editado" y cuántas líneas cambiaron;
- se notifica a Marketing y Producción.

## Instalación local

```bash
npm install
cp .env.example .env         # datos de PostgreSQL
npm run db:demo              # BD con datos de ejemplo (borra lo que haya)  · o: npm run db:init
npm run build                # solo si cambias estilos/íconos (public/css ya viene compilado)
npm start                    # http://localhost:9001
```

`AUTH_MODE=local` muestra un selector de colaborador (para desarrollo o uso aislado). Para la sesión única con el ERP usa `AUTH_MODE=erp`.

### Base de datos
- `sql/01_esquema.sql` esquema base · `sql/migraciones/NN_*.sql` cambios versionados (tabla `schema_migracion`).
- BD existente / producción: **`npm run db:migrate`** aplica solo lo pendiente (las migraciones son idempotentes).
  - `04` stock automático + notificaciones · `05` edición de cantidades con historial y reglas al día · `06` integración ERP (colaboradores, insumos, consumo).

## Integración con el ERP (microservicio)

Todo lo necesario está en **`integracion-erp/`** (ver su README). En resumen:

1. **Mismo dominio**: el nginx del ERP publica este servicio en `/senales/`; así comparte la cookie `access_token` y no hay otro login.
2. **SSO**: los tokens del ERP se validan con `ERP_JWT_SECRET` (= `SECRET_KEY` del ERP). El usuario se crea/actualiza solo como colaborador; su área sale de su área en RRHH (`ERP_MAPEO_AREAS`) y los roles `ADMIN/GERENTE/TI` administran.
3. **Inventario**: una cuenta de servicio del ERP (rol `LOGISTICA`) lee productos, almacenes y stock. Cada sesión cerrada en la etapa final genera consumo en m² (Marketing → vinil, Producción → sustrato) convertido a la unidad del producto del ERP.
4. **Menú del ERP**: página `Señalética` que muestra este servicio en un iframe y le pasa el tema.

## Permisos

| Acción | Quién |
|---|---|
| Pedidos (crear, editar, entregar, borrar) | Operaciones |
| Tiempos de Marketing / Producción | El área correspondiente |
| Catálogo de señales | Operaciones, Marketing, Producción |
| Entradas y ajustes de stock | Operaciones, Producción |
| Catálogos, colaboradores, enlace con el ERP | Administradores (rol ADMIN/GERENTE/TI del ERP o marcados aquí) |
| Marcar consumo como descargado en el ERP | Rol LOGISTICA del ERP o administradores |
| Consultar | Cualquier usuario con sesión |

Las reglas se aplican en el backend (`src/utils/permisos.js`); el frontend solo oculta lo que no corresponde.

## API (resumen)

| Método | Ruta | |
|---|---|---|
| GET | `/api/salud` | Estado de la BD y del ERP (público) |
| GET | `/api/auth/config` · `/api/auth/me` | Modo de sesión · usuario con permisos |
| GET/POST/PATCH/DELETE | `/api/pedidos[/:id]`, `/api/pedidos/:id/lineas`, `/api/pedidos/:id/entregar` | Pedidos |
| PATCH | `/api/detalles/:id` `{cantidad?, motivo?, observacion?}` | Editar línea (con historial) |
| GET | `/api/detalles/:id/ediciones` · `/api/detalles/:id/tiempos` | Historial de cambios · tiempos |
| GET | `/api/bandeja/{marketing\|produccion}` | Bandeja del área |
| POST/PATCH/PUT/DELETE | `/api/tiempos`, `/api/tiempos/:id/finalizar`, `/api/tiempos/:id` | Sesiones de trabajo |
| GET/POST/PUT | `/api/senales`, `/api/senales/:id/kardex`, `/api/stock/movimientos` | Señales y stock |
| GET | `/api/insumos` · `/api/insumos/consumos?estado=` | Insumos con stock del ERP · consumo |
| PUT/DELETE | `/api/insumos/{MATERIAL\|VINIL}/:id/enlace` | Enlazar a producto del ERP |
| POST | `/api/insumos/consumos/registrar` · `/anular` | Logística |
| GET/POST | `/api/erp/estado` · `/api/erp/productos?q=` · `/api/erp/sincronizar-colaboradores` | Administración de la integración |
| GET/PATCH | `/api/notificaciones` | Del usuario con sesión |
