import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import { getRedis } from '../utils/redis';
import { logger } from '../utils/logger';
import { WsEvent, WsMessage } from '@djs/shared';
import { verifyAccessToken } from '../auth/auth.controller';

let io: SocketIOServer | null = null;

export function initWebSocket(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // JWT auth middleware for socket connections
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const payload = verifyAccessToken(token);
      (socket as any).user = payload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const user = (socket as any).user;
    logger.info('WebSocket client connected', { socketId: socket.id, userId: user?.sub });

    // Allow client to subscribe to specific rooms (project, queue, job)
    socket.on('subscribe:project', (projectId: string) => {
      socket.join(`project:${projectId}`);
    });
    socket.on('subscribe:queue', (queueId: string) => {
      socket.join(`queue:${queueId}`);
    });
    socket.on('subscribe:job', (jobId: string) => {
      socket.join(`job:${jobId}`);
    });
    socket.on('unsubscribe:queue', (queueId: string) => {
      socket.leave(`queue:${queueId}`);
    });

    socket.on('disconnect', () => {
      logger.debug('WebSocket client disconnected', { socketId: socket.id });
    });
  });

  // Subscribe to Redis pub-sub for cross-process event broadcasting
  const subscriber = getRedis().duplicate();
  subscriber.subscribe('djs:events').catch((err) => {
    logger.error('Redis subscribe error', { error: err.message });
  });

  subscriber.on('message', (_channel, message) => {
    try {
      const wsMsg: WsMessage = JSON.parse(message);
      broadcastToClients(wsMsg);
    } catch (err) {
      logger.error('Failed to parse Redis event', { error: (err as Error).message });
    }
  });

  logger.info('WebSocket server initialized');
  return io;
}

function broadcastToClients(msg: WsMessage): void {
  if (!io) return;

  const { event, data } = msg;

  // Route events to appropriate rooms  
  switch (event) {
    case WsEvent.JOB_CREATED:
    case WsEvent.JOB_STATUS_CHANGED:
    case WsEvent.JOB_LOG: {
      const jobId = (data as any).jobId || (data as any).job?.id;
      const queueId = (data as any).queueId || (data as any).job?.queueId;
      if (jobId) io.to(`job:${jobId}`).emit(event, data);
      if (queueId) io.to(`queue:${queueId}`).emit(event, data);
      io.emit(event, data); // Also broadcast globally
      break;
    }
    case WsEvent.WORKER_HEARTBEAT:
    case WsEvent.WORKER_REGISTERED:
    case WsEvent.WORKER_OFFLINE:
      io.emit(event, data);
      break;

    case WsEvent.QUEUE_STATS_UPDATED:
    case WsEvent.QUEUE_PAUSED:
    case WsEvent.QUEUE_RESUMED: {
      const queueId = (data as any).queueId;
      if (queueId) io.to(`queue:${queueId}`).emit(event, data);
      io.emit(event, data);
      break;
    }

    case WsEvent.DLQ_ENTRY_CREATED: {
      const queueId = (data as any).queueId;
      if (queueId) io.to(`queue:${queueId}`).emit(event, data);
      io.emit(event, data);
      break;
    }

    default:
      io.emit(event, data);
  }
}

// Publish event to Redis (works across multiple backend instances)
export function emitEvent(event: WsEvent, data: unknown): void {
  const msg: WsMessage = { event, data, timestamp: new Date().toISOString() };
  
  // Publish to Redis for cross-process delivery
  getRedis()
    .publish('djs:events', JSON.stringify(msg))
    .catch((err) => logger.error('Redis publish error', { error: err.message }));
}

export function getIO(): SocketIOServer | null {
  return io;
}
