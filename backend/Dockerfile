# ─────────────────────────────────────────────────────────────────────────────
#  Dockerfile — Backend NexusSign (Node.js 20 LTS)
#  Multi-stage: build (deps) → runtime (imagen mínima)
# ─────────────────────────────────────────────────────────────────────────────

# ── STAGE 1: instalar dependencias de producción ─────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Copiar manifiestos de paquetes primero (cache layer)
COPY package.json package-lock.json* pnpm-lock.yaml* ./

# Instalar solo dependencias de producción
RUN \
  if [ -f pnpm-lock.yaml ]; then \
    npm install -g pnpm && pnpm install --frozen-lockfile --prod; \
  elif [ -f package-lock.json ]; then \
    npm ci --omit=dev; \
  else \
    npm install --omit=dev; \
  fi

# ── STAGE 2: imagen de producción ────────────────────────────────────────────
FROM node:20-alpine AS runner

# Zona horaria de Lima (misma que la app)
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/America/Lima /etc/localtime && \
    echo "America/Lima" > /etc/timezone && \
    apk del tzdata

WORKDIR /app

# Usuario sin privilegios para seguridad
RUN addgroup --system senales && adduser --system --ingroup senales senales

# Copiar node_modules del stage anterior y código fuente
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=senales:senales . .

# Carpeta de archivos estáticos con permisos
RUN mkdir -p public && chown senales:senales public

USER senales

# Puerto expuesto (se puede sobreescribir con PORT env)
EXPOSE 9001

# Variables de entorno mínimas con defaults seguros
ENV NODE_ENV=production \
    PORT=9001 \
    APP_TIMEZONE=America/Lima

# Health-check para Azure Container Apps / ACI
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/api/salud || exit 1

CMD ["node", "src/server.js"]
