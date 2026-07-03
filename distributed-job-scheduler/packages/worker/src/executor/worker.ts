import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { JobContext, LogLevel, WorkerStatus } from '@djs/shared';
import { logger } from '../logger';
import * as api from '../api.client';
import { getHandler } from '../handlers';

interface WorkerConfig {
  queueIds: string[];
  concurrency: number;
  pollIntervalMs: number;
  heartbeatIntervalMs: number;
}

interface InFlightJob {
  jobId: string;
  executionId: string;
  type: string;
  startedAt: Date;
}

export class WorkerProcess {
  private workerId: string | null = null;
  private config: WorkerConfig;
  private inFlight = new Map<string, InFlightJob>();
  private isShuttingDown = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<WorkerConfig> = {}) {
    this.config = {
      queueIds: (process.env.QUEUE_IDS || '').split(',').filter(Boolean),
      concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5'),
      pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '500'),
      heartbeatIntervalMs: parseInt(process.env.HEARTBEAT_INTERVAL_MS || '5000'),
      ...config,
    };
  }

  async start(): Promise<void> {
    logger.info('Starting worker process', {
      concurrency: this.config.concurrency,
      queues: this.config.queueIds,
    });

    // Register with backend
    const workerInfo = await api.registerWorker({
      hostname: os.hostname(),
      pid: process.pid,
      queueIds: this.config.queueIds,
      concurrency: this.config.concurrency,
      version: process.env.npm_package_version || '1.0.0',
    });
    this.workerId = workerInfo.id;
    logger.info('Worker registered', { workerId: this.workerId });

    // Start heartbeat
    this.startHeartbeat();

    // Start polling
    this.startPolling();

    // Graceful shutdown handlers
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('SIGINT', () => this.shutdown('SIGINT'));

    logger.info('Worker ready and listening for jobs');
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(async () => {
      if (!this.workerId) return;
      try {
        const status = this.inFlight.size > 0 ? WorkerStatus.ACTIVE : WorkerStatus.IDLE;
        await api.sendHeartbeat(this.workerId, status, this.inFlight.size);
      } catch (err) {
        logger.warn('Heartbeat failed', { error: (err as Error).message });
      }
    }, this.config.heartbeatIntervalMs);
  }

  private startPolling(): void {
    const poll = async (): Promise<void> => {
      if (this.isShuttingDown) return;

      // Don't claim if at concurrency limit
      const available = this.config.concurrency - this.inFlight.size;
      if (available > 0 && this.config.queueIds.length > 0) {
        // Try to claim up to `available` jobs in parallel
        const claims = Array.from({ length: available }, () => this.tryClaim());
        const results = await Promise.allSettled(claims);
        const claimedCount = results.filter(r => r.status === 'fulfilled' && (r as PromiseFulfilledResult<boolean>).value).length;
        
        if (claimedCount === 0) {
          // Back off if no jobs available
          await sleep(this.config.pollIntervalMs);
        }
      } else {
        await sleep(this.config.pollIntervalMs);
      }

      if (!this.isShuttingDown) {
        setImmediate(poll);
      }
    };

    setImmediate(poll);
  }

  private async tryClaim(): Promise<boolean> {
    if (!this.workerId || this.isShuttingDown) return false;

    try {
      const job = await api.claimJob(this.workerId, this.config.queueIds);
      if (!job) return false;

      logger.info('Job claimed', { jobId: job.id, type: job.type, attempt: job.attemptCount });

      // Execute job asynchronously (don't await)
      this.executeJob(job).catch((err) => {
        logger.error('Unhandled job execution error', { jobId: job.id, error: err.message });
      });

      return true;
    } catch (err) {
      logger.warn('Failed to claim job', { error: (err as Error).message });
      return false;
    }
  }

  private async executeJob(job: api.ClaimedJob): Promise<void> {
    const inFlightEntry: InFlightJob = {
      jobId: job.id,
      executionId: job.executionId,
      type: job.type,
      startedAt: new Date(),
    };
    this.inFlight.set(job.id, inFlightEntry);

    // Collect logs during execution
    const logs: Array<{ level: string; message: string; metadata?: unknown; loggedAt: Date }> = [];

    const ctx: JobContext = {
      jobId: job.id,
      executionId: job.executionId,
      type: job.type,
      payload: job.payload,
      attemptNumber: job.attemptCount,
      log: async (level: LogLevel, message: string, metadata?: Record<string, unknown>) => {
        logs.push({ level, message, metadata, loggedAt: new Date() });
        logger.debug(`[Job ${job.id}] ${message}`, { level, ...metadata });
      },
    };

    try {
      const handler = getHandler(job.type);
      const result = await handler(ctx);

      await api.completeJob(this.workerId!, job.id, job.executionId, result, logs);
      const duration = Date.now() - inFlightEntry.startedAt.getTime();
      logger.info('Job completed', { jobId: job.id, type: job.type, durationMs: duration });
    } catch (err) {
      const error = err as Error;
      logs.push({
        level: 'error',
        message: error.message,
        metadata: { stack: error.stack },
        loggedAt: new Date(),
      });

      await api.failJob(
        this.workerId!,
        job.id,
        job.executionId,
        error.message,
        error.stack || '',
        logs
      );

      const duration = Date.now() - inFlightEntry.startedAt.getTime();
      logger.error('Job failed', { jobId: job.id, type: job.type, error: error.message, durationMs: duration });
    } finally {
      this.inFlight.delete(job.id);
    }
  }

  async shutdown(signal: string): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    logger.info(`Received ${signal}, draining worker...`, {
      inFlightJobs: this.inFlight.size,
    });

    // Stop timers
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

    // Wait for in-flight jobs to complete (max 30s)
    if (this.inFlight.size > 0) {
      logger.info(`Waiting for ${this.inFlight.size} in-flight jobs to complete...`);
      const timeout = 30000;
      const start = Date.now();

      while (this.inFlight.size > 0 && Date.now() - start < timeout) {
        await sleep(200);
      }

      if (this.inFlight.size > 0) {
        logger.warn(`Timeout: ${this.inFlight.size} jobs still in flight, forcing shutdown`);
      }
    }

    // Deregister
    if (this.workerId) {
      try {
        await api.deregisterWorker(this.workerId);
        logger.info('Worker deregistered');
      } catch (err) {
        logger.warn('Failed to deregister worker', { error: (err as Error).message });
      }
    }

    logger.info('Worker shut down cleanly');
    process.exit(0);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
