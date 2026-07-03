import 'dotenv/config';
import express from 'express';
import http from 'http';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';

import { logger } from './utils/logger';
import { getRedis } from './utils/redis';
import db from './db';
import { initWebSocket } from './websocket/ws.service';
import { startScheduler, stopScheduler } from './scheduler/scheduler.service';
import { detectAndRecoverDeadWorkers } from './workers/workers.controller';
import { swaggerSpec } from './swagger/swagger.config';

import { authRouter } from './auth/auth.routes';
import { projectsRouter } from './auth/projects.routes';
import { queuesRouter } from './queues/queues.routes';
import { jobsRouter } from './jobs/jobs.routes';
import { workersRouter } from './workers/workers.routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

const PORT = parseInt(process.env.PORT || '3000');

async function bootstrap(): Promise<void> {
  // ─── Verify DB Connection ─────────────────────────────────
  try {
    await db.raw('SELECT 1');
    logger.info('Database connected');
  } catch (err) {
    logger.error('Database connection failed', { error: (err as Error).message });
    process.exit(1);
  }

  // ─── Verify Redis Connection ──────────────────────────────
  try {
    const redis = getRedis();
    await redis.connect();
    await redis.ping();
    logger.info('Redis connected');
  } catch (err) {
    logger.warn('Redis connection failed, some features may be disabled', {
      error: (err as Error).message,
    });
  }

  // ─── Express App ──────────────────────────────────────────
  const app = express();
  const httpServer = http.createServer(app);

  // Security Headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        scriptSrc: ["'self'"],
      },
    },
  }));

  // CORS
  app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Api-Key', 'X-Idempotency-Key'],
  }));

  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // HTTP access logging
  app.use(morgan('combined', {
    stream: { write: (message) => logger.info(message.trim()) },
    skip: (req) => req.url === '/api/v1/health',
  }));

  // Global API rate limiting
  app.use('/api/', rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 1000,
    message: { success: false, error: 'Too many requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
  }));

  // Stricter rate limit on auth endpoints
  app.use('/api/v1/auth/', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { success: false, error: 'Too many auth attempts' },
  }));

  // ─── Health Check ─────────────────────────────────────────
  app.get('/api/v1/health', async (_req, res) => {
    let dbStatus = 'ok';
    let redisStatus = 'ok';

    try { await db.raw('SELECT 1'); } catch { dbStatus = 'error'; }
    try { await getRedis().ping(); } catch { redisStatus = 'degraded'; }

    const healthy = dbStatus === 'ok';
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: { database: dbStatus, redis: redisStatus },
      version: process.env.npm_package_version || '1.0.0',
    });
  });

  // ─── API Docs ─────────────────────────────────────────────
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCssUrl: 'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.0.0/swagger-ui.min.css',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
    },
    customSiteTitle: 'DJS API Documentation',
  }));

  app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));

  // ─── Routes ───────────────────────────────────────────────
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1', projectsRouter);
  app.use('/api/v1', queuesRouter);
  app.use('/api/v1', jobsRouter);
  app.use('/api/v1', workersRouter);

  // ─── Error Handlers ───────────────────────────────────────
  app.use(notFoundHandler);
  app.use(errorHandler);

  // ─── WebSocket ────────────────────────────────────────────
  initWebSocket(httpServer);

  // ─── Scheduler ────────────────────────────────────────────
  startScheduler();

  // ─── Dead Worker Detection (every 30s) ────────────────────
  const deadWorkerTimer = setInterval(async () => {
    await detectAndRecoverDeadWorkers();
  }, 30000);

  // ─── Start Server ─────────────────────────────────────────
  httpServer.listen(PORT, () => {
    logger.info(`🚀 DJS Backend started on port ${PORT}`);
    logger.info(`📚 API Docs: http://localhost:${PORT}/api/docs`);
    logger.info(`🔌 WebSocket: ws://localhost:${PORT}`);
  });

  // ─── Graceful Shutdown ────────────────────────────────────
  async function shutdown(signal: string): Promise<void> {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    httpServer.close(async () => {
      stopScheduler();
      clearInterval(deadWorkerTimer);
      await db.destroy();
      logger.info('Server shut down cleanly');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err.message, stack: err.stack });
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason });
  });
}

bootstrap().catch((err) => {
  logger.error('Bootstrap failed', { error: (err as Error).message });
  process.exit(1);
});
