import path, { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { json, static as serveStatic } from 'express';

import { PORT } from './config/env.config.js';
import { pool } from './config/database.js';
import { securityHeaders } from './middleware/security.middleware.js';
import { corsMiddleware } from './middleware/cors.middleware.js';
import { errorHandler } from './middleware/error.middleware.js';
import apiRouter from './routes/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.disable('x-powered-by');

// Cabeceras básicas de seguridad y CORS
app.use(securityHeaders);
app.use(corsMiddleware);

// Parseo de cuerpo JSON (hasta 2MB)
app.use(json({ limit: '2mb' }));

// ---------- API REST ----------
app.use('/api', apiRouter, errorHandler);

// ---------- Frontend estático ----------
app.use('/vendor/chart.js', serveStatic(join(__dirname, '..', 'node_modules', 'chart.js', 'dist')));
app.use(serveStatic(join(__dirname, '..', 'public'), { extensions: ['html'] }));
app.use((req, res) => res.status(404).sendFile(join(__dirname, '..', 'public', 'index.html')));

const server = app.listen(PORT, () => {
  console.log(`🚀 Servidor Señalética listo en http://localhost:${PORT}`);
});

function apagar() {
  server.close(() => {
    pool.end().then(() => {
      console.log('🛑 Servidor y pool de base de datos cerrados.');
      process.exit(0);
    });
  });
}

process.on('SIGINT', apagar);
process.on('SIGTERM', apagar);

export default app;
