# ─────────────────────────────────────────────────────────────────────────────
#  Señalética — microservicio (Node.js 20 LTS)
#  build:   compila CSS (Tailwind 4 + DaisyUI 5) e íconos
#  runner:  solo dependencias de producción, usuario sin privilegios
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY frontend ./frontend
COPY public ./public
COPY scripts ./scripts
RUN npm run build

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS runner
RUN apk add --no-cache tzdata && cp /usr/share/zoneinfo/America/Lima /etc/localtime \
    && echo "America/Lima" > /etc/timezone && apk del tzdata
WORKDIR /app
RUN addgroup --system senales && adduser --system --ingroup senales senales
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY sql ./sql
COPY scripts ./scripts
COPY --from=build /app/public ./public
USER senales
ENV NODE_ENV=production PORT=9001 APP_TIMEZONE=America/Lima
EXPOSE 9001
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/api/salud || exit 1
CMD ["node", "src/server.js"]
