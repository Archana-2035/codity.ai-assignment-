import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../auth/auth.controller';
import { WorkerStatus, ApiResponse } from '@djs/shared';
import { emitEvent } from '../websocket/ws.service';
import { WsEvent } from '@djs/shared';

const HEARTBEAT_TIMEOUT_MS = 30000; // 30 seconds

// ─── Worker Registration ──────────────────────────────────────

export async function registerWorker(req: Request, res: Response): Promise<void> {
  const { hostname, pid, queueIds, concurrency, version, metadata } = req.body;

  try {
    const workerId = uuidv4();
    const [worker] = await db('workers')
      .insert({
        id: workerId,
        hostname,
        pid,
        queue_ids: queueIds,
        status: WorkerStatus.IDLE,
        concurrency: concurrency || 5,
        current_job_count: 0,
        last_heartbeat_at: new Date(),
        version: version || '1.0.0',
        metadata: JSON.stringify(metadata || {}),
      })
      .returning('*');

    logger.info('Worker registered', { workerId, hostname, pid });
    emitEvent(WsEvent.WORKER_REGISTERED, { worker });

    res.status(201).json({ success: true, data: worker } as ApiResponse);
  } catch (err: any) {
    logger.error('Worker registration error', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to register worker' } as ApiResponse);
  }
}

// ─── Worker Heartbeat ─────────────────────────────────────────

export async function workerHeartbeat(req: Request, res: Response): Promise<void> {
  const { workerId } = req.params;
  const { status, currentJobCount, metadata } = req.body;

  const worker = await db('workers').where({ id: workerId }).first();
  if (!worker) {
    res.status(404).json({ success: false, error: 'Worker not found' } as ApiResponse);
    return;
  }

  const now = new Date();
  await Promise.all([
    db('workers').where({ id: workerId }).update({
      status: status || worker.status,
      current_job_count: currentJobCount ?? worker.current_job_count,
      last_heartbeat_at: now,
      updated_at: now,
    }),
    db('worker_heartbeats').insert({
      id: uuidv4(),
      worker_id: workerId,
      status: status || worker.status,
      current_job_count: currentJobCount ?? worker.current_job_count,
      metadata: JSON.stringify(metadata || {}),
    }),
  ]);

  emitEvent(WsEvent.WORKER_HEARTBEAT, { workerId, status, currentJobCount });
  res.json({ success: true, data: { timestamp: now } } as ApiResponse);
}

// ─── List Workers ─────────────────────────────────────────────

export async function listWorkers(req: Request, res: Response): Promise<void> {
  const { status, page = 1, limit = 50 } = req.query as any;
  const offset = (Number(page) - 1) * Number(limit);

  const baseQuery = db('workers');
  if (status) baseQuery.where({ status });

  const [workers, [{ count }]] = await Promise.all([
    baseQuery.clone()
      .orderBy('registered_at', 'desc')
      .limit(Number(limit))
      .offset(offset),
    baseQuery.clone().count('id as count'),
  ]);

  // Mark stale workers
  const threshold = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS);
  const enriched = workers.map((w: any) => ({
    ...w,
    isStale: w.last_heartbeat_at ? new Date(w.last_heartbeat_at) < threshold : true,
  }));

  res.json({
    success: true,
    data: enriched,
    meta: { total: Number(count), page: Number(page), limit: Number(limit) },
  } as ApiResponse);
}

export async function getWorker(req: Request, res: Response): Promise<void> {
  const { workerId } = req.params;
  const worker = await db('workers').where({ id: workerId }).first();
  if (!worker) {
    res.status(404).json({ success: false, error: 'Worker not found' } as ApiResponse);
    return;
  }

  const recentHeartbeats = await db('worker_heartbeats')
    .where({ worker_id: workerId })
    .orderBy('created_at', 'desc')
    .limit(20);

  const threshold = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS);
  res.json({
    success: true,
    data: {
      ...worker,
      isStale: worker.last_heartbeat_at ? new Date(worker.last_heartbeat_at) < threshold : true,
      recentHeartbeats,
    },
  } as ApiResponse);
}

export async function deregisterWorker(req: Request, res: Response): Promise<void> {
  const { workerId } = req.params;
  await db('workers').where({ id: workerId }).update({
    status: WorkerStatus.OFFLINE,
    updated_at: new Date(),
  });
  emitEvent(WsEvent.WORKER_OFFLINE, { workerId });
  logger.info('Worker deregistered', { workerId });
  res.json({ success: true, message: 'Worker deregistered' } as ApiResponse);
}

// ─── Dead Worker Cleanup (internal / scheduled task) ─────────

export async function detectAndRecoverDeadWorkers(): Promise<void> {
  const threshold = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS);

  const deadWorkers = await db('workers')
    .where('last_heartbeat_at', '<', threshold)
    .whereIn('status', [WorkerStatus.ACTIVE, WorkerStatus.IDLE, WorkerStatus.DRAINING])
    .returning('id');

  if (!deadWorkers.length) return;

  const deadWorkerIds = deadWorkers.map((w: any) => w.id);
  logger.warn('Dead workers detected', { workerIds: deadWorkerIds });

  // Mark them offline
  await db('workers')
    .whereIn('id', deadWorkerIds)
    .update({ status: WorkerStatus.OFFLINE, updated_at: new Date() });

  // Requeue their claimed/running jobs back to pending
  const requeuedJobs = await db('jobs')
    .whereIn('worker_id', deadWorkerIds)
    .whereIn('status', ['claimed', 'running'])
    .update({
      status: 'pending',
      worker_id: null,
      claimed_at: null,
      started_at: null,
      updated_at: new Date(),
    })
    .returning('id');

  if (requeuedJobs.length) {
    logger.warn('Requeued orphaned jobs from dead workers', {
      workerIds: deadWorkerIds,
      jobCount: requeuedJobs.length,
    });
  }

  deadWorkerIds.forEach((id: string) => emitEvent(WsEvent.WORKER_OFFLINE, { workerId: id }));
}

// ─── Atomic Job Claim ─────────────────────────────────────────

/**
 * Atomically claim the highest-priority available job from assigned queues.
 * Uses SELECT ... FOR UPDATE SKIP LOCKED to prevent duplicate execution.
 * This is the most critical part of the system - must be correct under concurrency.
 */
export async function claimJob(req: Request, res: Response): Promise<void> {
  const { workerId } = req.params;
  const { queueIds } = req.body;

  if (!queueIds?.length) {
    res.status(400).json({ success: false, error: 'queueIds required' } as ApiResponse);
    return;
  }

  try {
    const claimed = await db.transaction(async (trx) => {
      // Find and lock the best available job atomically
      const result = await trx.raw(`
        SELECT j.id, j.queue_id, j.type, j.payload, j.priority, j.attempt_count,
               j.max_attempts, j.idempotency_key, j.batch_id, j.workflow_id, j.parent_job_id,
               j.project_id
        FROM jobs j
        JOIN queues q ON q.id = j.queue_id
        WHERE j.queue_id = ANY(?)
          AND j.status = 'pending'
          AND j.run_at <= NOW()
          AND q.is_paused = false
        ORDER BY j.priority ASC, j.run_at ASC
        LIMIT 1
        FOR UPDATE OF j SKIP LOCKED
      `, [queueIds]);

      const job = result.rows[0];
      if (!job) return null;

      // Update job to claimed state
      await trx('jobs').where({ id: job.id }).update({
        status: 'claimed',
        worker_id: workerId,
        claimed_at: new Date(),
        attempt_count: trx.raw('attempt_count + 1'),
        updated_at: new Date(),
      });

      // Create execution record
      const executionId = uuidv4();
      await trx('job_executions').insert({
        id: executionId,
        job_id: job.id,
        worker_id: workerId,
        attempt_number: job.attempt_count + 1,
        status: 'running',
        started_at: new Date(),
      });

      // Update worker job count
      await trx('workers').where({ id: workerId }).update({
        status: WorkerStatus.ACTIVE,
        current_job_count: trx.raw('current_job_count + 1'),
        last_heartbeat_at: new Date(),
        updated_at: new Date(),
      });

      return { ...job, executionId };
    });

    if (!claimed) {
      res.status(204).send(); // No job available
      return;
    }

    logger.debug('Job claimed', { jobId: claimed.id, workerId });
    emitEvent(WsEvent.JOB_STATUS_CHANGED, { jobId: claimed.id, status: 'claimed', workerId });

    res.json({ success: true, data: claimed } as ApiResponse);
  } catch (err: any) {
    logger.error('Job claim error', { error: err.message, workerId });
    res.status(500).json({ success: false, error: 'Failed to claim job' } as ApiResponse);
  }
}

// ─── Job Completion ───────────────────────────────────────────

export async function completeJob(req: Request, res: Response): Promise<void> {
  const { workerId, jobId } = req.params;
  const { executionId, result, logs } = req.body;

  try {
    await db.transaction(async (trx) => {
      const now = new Date();

      await trx('jobs').where({ id: jobId, worker_id: workerId }).update({
        status: 'completed',
        completed_at: now,
        updated_at: now,
      });

      // Get started_at to compute duration
      const execution = await trx('job_executions').where({ id: executionId }).first();
      const durationMs = execution ? now.getTime() - new Date(execution.started_at).getTime() : 0;

      await trx('job_executions').where({ id: executionId }).update({
        status: 'completed',
        completed_at: now,
        duration_ms: durationMs,
        result: JSON.stringify(result || {}),
      });

      await trx('workers').where({ id: workerId }).update({
        current_job_count: trx.raw('GREATEST(current_job_count - 1, 0)'),
        last_heartbeat_at: now,
        updated_at: now,
      });

      // Bulk insert logs if provided
      if (logs?.length) {
        await trx('job_logs').insert(
          logs.map((l: any) => ({
            id: uuidv4(),
            job_id: jobId,
            execution_id: executionId,
            level: l.level || 'info',
            message: l.message,
            metadata: JSON.stringify(l.metadata || {}),
            logged_at: l.loggedAt || now,
          }))
        );
      }

      // Check if batch needs update
      const job = await trx('jobs').where({ id: jobId }).first();
      if (job?.batch_id) {
        await updateBatchCounters(trx, job.batch_id);
      }
    });

    emitEvent(WsEvent.JOB_STATUS_CHANGED, { jobId, status: 'completed', workerId });
    res.json({ success: true, message: 'Job completed' } as ApiResponse);
  } catch (err: any) {
    logger.error('Job completion error', { error: err.message, jobId, workerId });
    res.status(500).json({ success: false, error: 'Failed to mark job complete' } as ApiResponse);
  }
}

export async function failJob(req: Request, res: Response): Promise<void> {
  const { workerId, jobId } = req.params;
  const { executionId, errorMessage, errorStack, logs } = req.body;

  try {
    await db.transaction(async (trx) => {
      const now = new Date();
      const job = await trx('jobs').where({ id: jobId }).first();
      if (!job) throw new Error('Job not found');

      const queue = await trx('queues').where({ id: job.queue_id }).first();
      let retryPolicy = null;
      if (queue?.retry_policy_id) {
        retryPolicy = await trx('retry_policies').where({ id: queue.retry_policy_id }).first();
      }

      const shouldRetryJob = job.attempt_count < job.max_attempts;
      let nextStatus: string;
      let nextRunAt: Date | null = null;

      if (shouldRetryJob) {
        nextStatus = 'pending';
        const policy = retryPolicy || {
          strategy: 'exponential', initialDelayMs: 1000,
          maxDelayMs: 300000, multiplier: 2.0, jitter: true
        };
        const { calculateNextRunAt } = await import('../jobs/retry.service');
        nextRunAt = calculateNextRunAt(policy, job.attempt_count);
      } else {
        nextStatus = queue?.dlq_enabled ? 'dead' : 'failed';
      }

      await trx('jobs').where({ id: jobId }).update({
        status: nextStatus,
        failure_reason: errorMessage,
        run_at: nextRunAt || job.run_at,
        worker_id: null,
        updated_at: now,
      });

      const execution = await trx('job_executions').where({ id: executionId }).first();
      const durationMs = execution ? now.getTime() - new Date(execution.started_at).getTime() : 0;

      await trx('job_executions').where({ id: executionId }).update({
        status: 'failed',
        completed_at: now,
        duration_ms: durationMs,
        error_message: errorMessage,
        error_stack: errorStack,
      });

      await trx('workers').where({ id: workerId }).update({
        current_job_count: trx.raw('GREATEST(current_job_count - 1, 0)'),
        last_heartbeat_at: now,
        updated_at: now,
      });

      // Send to DLQ if dead
      if (nextStatus === 'dead' && queue?.dlq_enabled) {
        await trx('dead_letter_queue').insert({
          id: uuidv4(),
          job_id: jobId,
          queue_id: job.queue_id,
          failure_reason: errorMessage || 'Unknown error',
          failure_count: job.attempt_count,
          last_failed_at: now,
          original_payload: job.payload,
          can_retry: true,
        });
        emitEvent(WsEvent.DLQ_ENTRY_CREATED, { jobId, queueId: job.queue_id });
      }

      // Insert logs
      if (logs?.length) {
        await trx('job_logs').insert(
          logs.map((l: any) => ({
            id: uuidv4(),
            job_id: jobId,
            execution_id: executionId,
            level: l.level || 'error',
            message: l.message,
            metadata: JSON.stringify(l.metadata || {}),
            logged_at: l.loggedAt || now,
          }))
        );
      }

      if (job?.batch_id) {
        await updateBatchCounters(trx, job.batch_id);
      }
    });

    emitEvent(WsEvent.JOB_STATUS_CHANGED, { jobId, status: 'failed', workerId });
    res.json({ success: true, message: 'Job failure recorded' } as ApiResponse);
  } catch (err: any) {
    logger.error('Job failure recording error', { error: err.message, jobId });
    res.status(500).json({ success: false, error: 'Failed to record job failure' } as ApiResponse);
  }
}

// ─── Internal Helpers ─────────────────────────────────────────

async function updateBatchCounters(trx: any, batchId: string): Promise<void> {
  const stats = await trx('jobs')
    .where({ batch_id: batchId })
    .groupBy('status')
    .select('status', trx.raw('COUNT(*) as count'));

  const map: Record<string, number> = {};
  stats.forEach((r: any) => { map[r.status] = Number(r.count); });

  const total = Object.values(map).reduce((s, c) => s + c, 0);
  const completed = map.completed || 0;
  const failed = (map.failed || 0) + (map.dead || 0);
  const pending = (map.pending || 0) + (map.running || 0) + (map.claimed || 0);

  let status = 'running';
  if (pending === 0) {
    if (failed === 0) status = 'completed';
    else if (completed === 0) status = 'failed';
    else status = 'partial';
  }

  await trx('job_batches').where({ id: batchId }).update({
    completed_count: completed,
    failed_count: failed,
    pending_count: pending,
    status,
    completed_at: pending === 0 ? new Date() : null,
  });
}
