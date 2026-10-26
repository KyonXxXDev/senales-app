# Conectar Señalética al ERP (RRHH + Inventario)

Señalética corre como un servicio más junto a `erp-backend` y `erp-frontend`. El navegador la abre en el **mismo dominio** del ERP (`https://tu-erp/senales/`), así usa la misma sesión.

```
Navegador ──► nginx (erp-frontend)
                ├── /            → SPA del ERP (React + DaisyUI)
                ├── /api/v1/     → erp-backend:9000
                └── /senales/    → senales:9001   (este proyecto)
senales ──► erp-backend:9000/api/v1   (empleados, productos, stock; red interna)
senales ──► PostgreSQL (BD propia "senales" en el mismo servidor)
```

## Pasos

### 1. Base de datos
En el servidor PostgreSQL del ERP crea una BD y un usuario solo para este servicio:
```sql
CREATE USER senales_app WITH PASSWORD '...';
CREATE DATABASE senales OWNER senales_app;
```
Luego, una vez levantado el contenedor (paso 3): `docker compose run --rm senales npm run db:init`
(si ya usabas Señalética con otra BD: `npm run db:migrate` sobre esa BD).

### 2. Cuenta de servicio en el ERP
Crea en el ERP un usuario con rol **LOGISTICA** (p. ej. `svc.senales`). Se usa para leer productos, almacenes y stock aunque la persona que mira Señalética no tenga ese rol. Solo lee.

### 3. Variables y contenedor
- Copia `docker/senales.env.example` a `../core-database/envs/senales.env` y complétalo.
  **`ERP_JWT_SECRET` debe ser exactamente el `SECRET_KEY` de `erp-backend.env`.**
- Agrega el servicio de `docker/docker-compose.senales.yml` al `docker-compose.yml` del ERP (redes `core-internal` y `public-network`).

### 4. nginx del ERP
Aplica `erp-frontend/patches/nginx.diff` (o reemplaza con `erp-frontend/nginx.conf`). Agrega:
```nginx
location = /senales { return 301 /senales/; }
location /senales/ { proxy_pass http://senales:9001/; ... }
```

### 5. Menú del ERP
- Copia `erp-frontend/src/features/senaletica/` a `frontend/src/features/senaletica/`.
- Aplica `erp-frontend/patches/AppRouter.diff` y `erp-frontend/patches/Sidebar.diff`
  (`git apply integracion-erp/erp-frontend/patches/*.diff` desde la raíz del monorepo del ERP).
  Agrega la ruta `/senaletica` y la sección "Producción → Señalética" visible para todos los roles.

### 6. Levantar
```bash
docker compose up -d --build senales erp-frontend
```
Verifica `https://tu-erp/senales/api/salud` → `"bd":"conectada"` y `"erp":{"ok":true}`.
En Señalética → Catálogos → **Integración ERP** se ve el estado de cada pieza.

## Cómo se comporta

| Tema | Detalle |
|---|---|
| Inicio de sesión | Solo en el ERP. Señalética lee la cookie `access_token` (o `hrms_token`) y, si vence, la renueva con `/api/v1/auth/refresh`. Sin sesión muestra un botón al login del ERP. |
| Colaboradores | Se crean solos en su primer ingreso. Nombre, código y cargo vienen de RRHH. "Sincronizar con RRHH" trae de una vez a todo el personal de las áreas mapeadas. |
| Áreas | Se deducen del área en RRHH con `ERP_MAPEO_AREAS` (o `ERP_MAPEO_AREA_IDS`). Si no hay equivalente, la persona entra en modo consulta; un administrador puede asignarle área en Catálogos (queda "fija"). |
| Administradores | Roles `ADMIN`, `GERENTE`, `TI` del ERP (configurable) o quien se marque aquí. |
| Inventario | Cada sustrato/vinil se enlaza a un producto del ERP con su rendimiento en m² por unidad (plancha 1.22×2.44 = 2.9768 m²). La pantalla Insumos muestra el stock real por almacén y el consumo pendiente. |
| Consumo | Al cerrar una sesión de la etapa final se genera el consumo (m² de la señal × unidades). Logística lo registra en el ERP (los movimientos del ERP exigen firma) y lo marca como descargado aquí con la referencia. |
| Tema | Usa el mismo tema DaisyUI del ERP (`localStorage.theme`) y cambia en vivo. |

## Si el ERP está en otro dominio
No recomendado (la cookie no se comparte). Si no queda otra: configura `ACCEPTED_ORIGINS` y `FRAME_ANCESTORS` con el origen del ERP y pasa el token en `Authorization: Bearer`.
