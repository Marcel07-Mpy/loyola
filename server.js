/**
 * Entrée Express/Socket.IO compatible local + Vercel.
 * La PWA compilée est servie depuis /public et l'API depuis /api.
 */
import express from 'express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import multer from 'multer';
import http from 'http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';

import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import promotionRoutes from './routes/promotionRoutes.js';
import etudiantRoutes from './routes/etudiantRoutes.js';
import paiementRoutes from './routes/paiementRoutes.js';
import revueRoutes from './routes/revueRoutes.js';
import excedentRoutes from './routes/excedentRoutes.js';
import auditRoutes from './routes/auditRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import paymentAdministrationRoutes from './routes/paymentAdministrationRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import chatbotRoutes from './routes/chatbotRoutes.js';

import pool from './config/db.js';
import { ensureDatabaseReady, inspectDatabaseFeatures } from './config/databaseSetup.js';
import { authenticateSocket } from './utils/socketAuth.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const isVercel = Boolean(process.env.VERCEL);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');

const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOrigin = (origin, callback) => {
  if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
  return callback(new Error('Origine non autorisée'));
};

app.disable('x-powered-by');
if (!isVercel) {
  app.use(cors({
    origin: corsOrigin,
    credentials: true,
    exposedHeaders: ['Content-Disposition']
  }));
}
app.use(helmet());

morgan.token('safe-path', (req) => (req.originalUrl || req.url || '').split('?')[0]);
app.use(morgan(':method :safe-path :status :response-time ms'));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/health', async (_req, res) => {
  const databaseConfigured = Boolean(
    process.env.DATABASE_URL ||
    (process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER)
  );

  if (!databaseConfigured) {
    return res.status(503).json({
      status: 'ERROR',
      message: 'Base de données non configurée',
      code: 'DATABASE_CONFIG_MISSING',
      databaseConfigured: false
    });
  }

  try {
    const capabilities = await ensureDatabaseReady();
    return res.status(200).json({
      status: 'OK',
      message: 'Backend et base de données opérationnels',
      databaseConfigured: true,
      pgTrgm: Boolean(capabilities?.pgTrgm)
    });
  } catch (error) {
    console.error('❌ Healthcheck PostgreSQL :', error);
    return res.status(503).json({
      status: 'ERROR',
      message: 'Base de données temporairement indisponible',
      code: error?.code || 'DATABASE_INITIALIZATION_FAILED',
      databaseConfigured: true
    });
  }
});

app.use('/api', async (_req, res, next) => {
  try {
    await ensureDatabaseReady();
    return next();
  } catch (error) {
    console.error('❌ Initialisation PostgreSQL impossible :', error);
    return res.status(503).json({
      message: 'Base de données temporairement indisponible',
      code: error?.code || 'DATABASE_INITIALIZATION_FAILED'
    });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/promotions', promotionRoutes);
app.use('/api/etudiants', etudiantRoutes);
app.use('/api/paiements', paiementRoutes);
app.use('/api/revue', revueRoutes);
app.use('/api/excedents', excedentRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/admin-paiements', paymentAdministrationRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/chatbot', chatbotRoutes);

app.use('/api', (_req, res) => {
  res.status(404).json({ message: 'Route non trouvée' });
});

app.use(express.static(publicDir, { index: false }));
app.get(/.*/, (req, res, next) => {
  if (req.path.startsWith('/socket.io')) return next();
  return res.sendFile(path.join(publicDir, 'index.html'));
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'Le fichier dépasse la taille maximale autorisée de 5 Mo.'
      : 'Le fichier envoyé ne respecte pas les limites autorisées.';
    return res.status(400).json({ message });
  }

  if (err?.code === 'INVALID_EXCEL_FILE') {
    return res.status(400).json({ message: err.message });
  }

  console.error('Erreur serveur:', err?.message || 'Erreur inconnue');
  return res.status(500).json({ message: 'Erreur interne du serveur' });
});

const server = http.createServer(app);
const io = new Server(server, {
  ...(isVercel ? {} : { cors: { origin: corsOrigin, credentials: true } }),
  maxHttpBufferSize: 100_000,
  transports: ['websocket']
});

io.use(authenticateSocket);
io.on('connection', (socket) => {
  socket.join(`user:${socket.user.id}`);
});
app.set('io', io);

const startLocalServer = async () => {
  try {
    const capabilities = await inspectDatabaseFeatures();
    server.listen(PORT, () => {
      console.log(`✅ Serveur démarré sur http://localhost:${PORT}`);
      console.log(`📡 Environnement : ${process.env.NODE_ENV || 'development'}`);
      if (capabilities.pgTrgm) console.log('🧩 pg_trgm disponible');
    });
  } catch (error) {
    console.error('❌ Vérification PostgreSQL impossible :', error.message);
    await pool.end();
    process.exit(1);
  }
};

if (!isVercel) startLocalServer();

export default server;
