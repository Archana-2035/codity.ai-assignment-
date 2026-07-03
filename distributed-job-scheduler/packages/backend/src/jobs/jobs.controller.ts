import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../auth/auth.controller';
import { checkRateLimit } from '../utils/redis';
import { calculateNextRunAt, shouldRetry } from './retry.service';
import { JobStatus, ApiResponse, RetryStrategy } from '@djs/shared';
import { getQueueStatsData } from '../queues/queues.controller';
import { emitEvent } from '../websocket/ws.service';
import { WsEvent } from '@djs/shared';

// ─── Job Submission ───────────────────────────────────────────

export async function createJob(req: Request, res: Response): Promise<void> {
  const { queueId } = req.params;
  const user = (req as AuthenticatedRequest).user;
  const {
    type, payload, priority, scheduledAt, runAt, maxAttempts,
    idempotencyKey, batchId, workflowId, parentJobId
  } = req.body;

  try {
    const queue = await db('queues').where({ id: queueId }).first();
    if (!queue) {
      res.status(404).json({ success: false, error: 'Queue not found' } as ApiResponse);
      return;
    }
    if (queue.is_paused) {
      res.status(409).json({ success: false, error: 'Queue is paused' } as ApiResponse);
      return;
    }

    // Rate limiting check
    if (queue.rate_limit_per_minute) {
      const { allowed, remaining, resetAt } = await checkRateLimit(queueId as string, queue.rate_limit_per_minute);
      if (!allowed) {
        res.status(429).json({
          success: false,
          error: 'Queue rate limit exceeded',
          data: { remaining, resetAt },
        } as ApiResponse);
        return;
      }
    }

    // Get retry policy
    let jobMaxAttempts = maxAttempts || 3;
    if (queue.retry_policy_id) {
      const policy = await db('retry_policies').where({ id: queue.retry_policy_id }).first();
      if (policy) jobMaxAttempts = maxAttempts || policy.max_attempts;
    }

    // Determine job status and run_at
    const resolvedRunAt = runAt ? new Date(runAt) : (scheduledAt ? new Date(scheduledAt) : new Date());
    const isScheduled = resolvedRunAt > new Date();
    const status = isScheduled ? JobStatus.SCHEDULED : JobStatus.PENDING;

    const jobId = uuidv4();

    // Handle idempotency: return existing job if key matches
    if (idempotencyKey) {
      const existing = await db('jobs')
        .where({ queue_id: queueId, idempotency_key: idempotencyKey })
        .first();
      if (existing) {
        res.status(200).json({ success: true, data: existing, meta: { idempotent: true } } as ApiResponse);
        return;
      }
    }

    const [job] = await db('jobs')
      .insert({
        id: jobId,
        queue_id: queueId,
        project_id: queue.project_id,
        type,
        payload: JSON.stringify(payload || {}),
        priority: priority ?? queue.priority,
        status,
        scheduled_at: scheduledAt ? new Date(scheduledAt) : null,
        run_at: resolvedRunAt,
        max_attempts: jobMaxAttempts,
        idempotency_key: idempotencyKey,
        batch_id: batchId,
        workflow_id: workflowId,
        parent_job_id: parentJobId,
        created_by: user.sub.startsWith('project:') ? null : user.sub,
      })
      .returning('*');

    logger.info('Job created', { jobId, queueId, type, status });

    // Emit WebSocket event
    emitEvent(WsEvent.JOB_CREATED, { job });

    res.status(201).json({ success: true, data: job } as ApiResponse);
  } catch (err: any) {
    if (err.code === '23505' && err.constraint?.includes('idempotency')) {
      const existing = await db('jobs').where({ queue_id: queueId, idempotency_key: idempotencyKey }).first();
      res.status(200).json({ success: true, data: existing, meta: { idempotent: true } } as ApiResponse);
      return;
    }
    logger.error('Create job error', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to create job' } as ApiResponse);
  }
}

export async function createBatchJobs(req: Request, res: Response): Promise<void> {
  const { queueId } = req.params;
  const user = (req as AuthenticatedRequest).user;
  const { name, jobs, options } = req.body;

  if (!Array.isArray(jobs) || jobs.length === 0) {
    res.status(400).json({ success: false, error: 'Jobs array is required and must not be empty' } as ApiResponse);
    return;
  }

  if (jobs.length > 10000) {
    res.status(400).json({ success: false, error: 'Maximum 10,000 jobs per batch' } as ApiResponse);
    return;
  }

  try {
    const queue = await db('queues').where({ id: queueId }).first();
    if (!queue) {
      res.status(404).json({ success: false, error: 'Queue not found' } as ApiResponse);
      return;
    }

    const result = await db.transaction(async (trx) => {
      const batchId = uuidv4();
      const [batch] = await trx('job_batches')
        .insert({
          id: batchId,
          name: name || `Batch-${Date.now()}`,
          queue_id: queueId,
          created_by: user.sub.startsWith('project:') ? null : user.sub,
          total_jobs: jobs.length,
          pending_count: jobs.length,
          options: JSON.stringify(options || {}),
        })
        .returning('*');

      // Bulk insert jobs in chunks of 1000
      const chunkSize = 1000;
      const insertedJobs = [];
      for (let i = 0; i < jobs.length; i += chunkSize) {
        const chunk = jobs.slice(i, i + chunkSize);
        const jobRows = chunk.map((j: any) => ({
          id: uuidv4(),
          queue_id: queueId,
          project_id: queue.project_id,
          type: j.type || 'default',
          payload: JSON.stringify(j.payload || {}),
          priority: j.priority ?? queue.priority,
          status: JobStatus.PENDING,
          run_at: j.runAt ? new Date(j.runAt) : new Date(),
          max_attempts: j.maxAttempts || 3,
          batch_id: batchId,
          created_by: user.sub.startsWith('project:') ? null : user.sub,
          idempotency_key: j.idempotencyKey,
        }));

        const inserted = await trx('jobs').insert(jobRows).returning('id');
        insertedJobs.push(...inserted);
      }

      return { batch, jobIds: insertedJobs.map((j: any) => j.id || j) };
    });

    logger.info('Batch created', { batchId: result.batch.id, jobCount: jobs.length });
    res.status(201).json({ success: true, data: result } as ApiResponse);
  } catch (err: any) {
    logger.error('Create batch error', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to create batch' } as ApiResponse);
  }
}

export async function createScheduledJob(req: Request, res: Response): Promise<void> {
  const { queueId } = req.params;
  const user = (req as AuthenticatedRequest).user;
  const { name, type, payload, cronExpression, runAt, maxAttempts, description, timezone } = req.body;

  if (!cronExpression && !runAt) {
    res.status(400).json({ success: false, error: 'Either cronExpression or runAt is required' } as ApiResponse);
    return;
  }

  try {
    const queue = await db('queues').where({ id: queueId }).first();
    if (!queue) {
      res.status(404).json({ success: false, error: 'Queue not found' } as ApiResponse);
      return;
    }

    let nextRunAt: Date;
    if (cronExpression) {
      const cronParser = require('cron-parser');
      const interval = cronParser.parseExpression(cronExpression, { tz: timezone || 'UTC' });
      nextRunAt = interval.next().toDate();
    } else {
      nextRunAt = new Date(runAt);
    }

    const [scheduledJob] = await db('scheduled_jobs')
      .insert({
        id: uuidv4(),
        queue_id: queueId,
        type,
        payload: JSON.stringify(payload || {}),
        cron_expression: cronExpression,
        next_run_at: nextRunAt,
        name,
        description,
        timezone: timezone || 'UTC',
        max_attempts: maxAttempts || 3,
        is_active: true,
        created_by: user.sub.startsWith('project:') ? null : user.sub,
      })
      .returning('*');

    res.status(201).json({ success: true, data: scheduledJob } as ApiResponse);
  } catch (err: any) {
    if (err.message?.includes('Invalid cron')) {
      res.status(400).json({ success: false, error: 'Invalid cron expression' } as ApiResponse);
      return;
    }
    logger.error('Create scheduled job error', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to create scheduled job' } as ApiResponse);
  }
}

// ─── Job Queries ──────────────────────────────────────────────

export async function listJobs(req: Request, res: Response): Promise<void> {
  const { queueId } = req.params;
  const {
    page = 1, limit = 20, status, type,
    sortBy = 'created_at', sortDir = 'desc'
  } = req.query as any;
  const offset = (Number(page) - 1) * Number(limit);

  const validSortFields = ['created_at', 'run_at', 'priority', 'attempt_count', 'status'];
  const safeSortBy = validSortFields.includes(sortBy) ? sortBy : 'created_at';
  const safeSortDir = sortDir === 'asc' ? 'asc' : 'desc';

  const baseQuery = db('jobs').where({ queue_id: queueId });
  if (status) baseQuery.where({ status });
  if (type) baseQuery.where({ type });

  const [jobs, [{ count }]] = await Promise.all([
    baseQuery.clone()
      .orderBy(safeSortBy, safeSortDir)
      .limit(Number(limit))
      .offset(offset)
      .select('*'),
    baseQuery.clone().count('id as count'),
  ]);

  res.json({
    success: true,
    data: jobs,
    meta: { total: Number(count), page: Number(page), limit: Number(limit), totalPages: Math.ceil(Number(count) / Number(limit)) },
  } as ApiResponse);
}

export async function getJob(req: Request, res: Response): Promise<void> {
  const { jobId } = req.params;
  const job = await db('jobs').where({ id: jobId }).first();
  if (!job) {
    res.status(404).json({ success: false, error: 'Job not found' } as ApiResponse);
    return;
  }

  const [executions, logs] = await Promise.all([
    db('job_executions').where({ job_id: jobId }).orderBy('attempt_number', 'asc'),
    db('job_logs').where({ job_id: jobId }).orderBy('logged_at', 'asc').limit(500),
  ]);

  res.json({ success: true, data: { ...job, executions, logs } } as ApiResponse);
}

export async function cancelJob(req: Request, res: Response): Promise<void> {
  const { jobId } = req.params;
  const job = await db('jobs').where({ id: jobId }).first();
  if (!job) {
    res.status(404).json({ success: false, error: 'Job not found' } as ApiResponse);
    return;
  }
  if (!['pending', 'scheduled'].includes(job.status)) {
    res.status(409).json({ success: false, error: `Cannot cancel job in ${job.status} status` } as ApiResponse);
    return;
  }
  await db('jobs').where({ id: jobId }).update({ status: JobStatus.CANCELLED, updated_at: new Date() });
  emitEvent(WsEvent.JOB_STATUS_CHANGED, { jobId, status: JobStatus.CANCELLED });
  res.json({ success: true, message: 'Job cancelled' } as ApiResponse);
}

export async function retryJob(req: Request, res: Response): Promise<void> {
  const { jobId } = req.params;
  const job = await db('jobs').where({ id: jobId }).first();
  if (!job) {
    res.status(404).json({ success: false, error: 'Job not found' } as ApiResponse);
    return;
  }
  if (!['failed', 'dead', 'cancelled'].includes(job.status)) {
    res.status(409).json({ success: false, error: 'Only failed/dead/cancelled jobs can be retried' } as ApiResponse);
    return;
  }

  await db('jobs').where({ id: jobId }).update({
    status: JobStatus.PENDING,
    run_at: new Date(),
    attempt_count: 0,
    failure_reason: null,
    updated_at: new Date(),
  });

  emitEvent(WsEvent.JOB_STATUS_CHANGED, { jobId, status: JobStatus.PENDING });
  res.json({ success: true, message: 'Job queued for retry' } as ApiResponse);
}

export async function getJobLogs(req: Request, res: Response): Promise<void> {
  const { jobId } = req.params;
  const { page = 1, limit = 100 } = req.query as any;
  const offset = (Number(page) - 1) * Number(limit);

  const [logs, [{ count }]] = await Promise.all([
    db('job_logs').where({ job_id: jobId })
      .orderBy('logged_at', 'asc')
      .limit(Number(limit))
      .offset(offset),
    db('job_logs').where({ job_id: jobId }).count('id as count'),
  ]);

  res.json({
    success: true,
    data: logs,
    meta: { total: Number(count), page: Number(page), limit: Number(limit) },
  } as ApiResponse);
}

// ─── DLQ ──────────────────────────────────────────────────────

export async function listDlq(req: Request, res: Response): Promise<void> {
  const { queueId } = req.params;
  const { page = 1, limit = 20 } = req.query as any;
  const offset = (Number(page) - 1) * Number(limit);

  const [entries, [{ count }]] = await Promise.all([
    db('dead_letter_queue as dlq')
      .join('jobs as j', 'j.id', 'dlq.job_id')
      .where('dlq.queue_id', queueId)
      .orderBy('dlq.last_failed_at', 'desc')
      .limit(Number(limit))
      .offset(offset)
      .select('dlq.*', 'j.type', 'j.attempt_count'),
    db('dead_letter_queue').where({ queue_id: queueId }).count('id as count'),
  ]);

  res.json({
    success: true,
    data: entries,
    meta: { total: Number(count), page: Number(page), limit: Number(limit) },
  } as ApiResponse);
}

export async function retryDlqEntry(req: Request, res: Response): Promise<void> {
  const { dlqId } = req.params;
  const user = (req as AuthenticatedRequest).user;

  const entry = await db('dead_letter_queue').where({ id: dlqId }).first();
  if (!entry) {
    res.status(404).json({ success: false, error: 'DLQ entry not found' } as ApiResponse);
    return;
  }

  await db.transaction(async (trx) => {
    await trx('jobs').where({ id: entry.job_id }).update({
      status: JobStatus.PENDING,
      run_at: new Date(),
      attempt_count: 0,
      failure_reason: null,
      updated_at: new Date(),
    });

    await trx('dead_letter_queue').where({ id: dlqId }).update({
      retried_at: new Date(),
      retried_by: user.sub.startsWith('project:') ? null : user.sub,
    });
  });

  emitEvent(WsEvent.JOB_STATUS_CHANGED, { jobId: entry.job_id, status: JobStatus.PENDING });
  res.json({ success: true, message: 'Job requeued from DLQ' } as ApiResponse);
}

export async function bulkRetryDlq(req: Request, res: Response): Promise<void> {
  const { queueId } = req.params;
  const user = (req as AuthenticatedRequest).user;

  const entries = await db('dead_letter_queue')
    .where({ queue_id: queueId, can_retry: true })
    .whereNull('retried_at');

  if (entries.length === 0) {
    res.json({ success: true, message: 'No retryable DLQ entries found', data: { count: 0 } });
    return;
  }

  const jobIds = entries.map((e: any) => e.job_id);
  const dlqIds = entries.map((e: any) => e.id);

  await db.transaction(async (trx) => {
    await trx('jobs').whereIn('id', jobIds).update({
      status: JobStatus.PENDING,
      run_at: new Date(),
      attempt_count: 0,
      failure_reason: null,
      updated_at: new Date(),
    });

    await trx('dead_letter_queue').whereIn('id', dlqIds).update({
      retried_at: new Date(),
      retried_by: user.sub.startsWith('project:') ? null : user.sub,
    });
  });

  res.json({ success: true, data: { count: entries.length }, message: `Requeued ${entries.length} jobs` });
}

export async function listScheduledJobs(req: Request, res: Response): Promise<void> {
  const { queueId } = req.params;
  const { page = 1, limit = 20 } = req.query as any;
  const offset = (Number(page) - 1) * Number(limit);

  const [jobs, [{ count }]] = await Promise.all([
    db('scheduled_jobs').where({ queue_id: queueId })
      .orderBy('next_run_at', 'asc')
      .limit(Number(limit))
      .offset(offset),
    db('scheduled_jobs').where({ queue_id: queueId }).count('id as count'),
  ]);

  res.json({
    success: true,
    data: jobs,
    meta: { total: Number(count), page: Number(page), limit: Number(limit) },
  } as ApiResponse);
}

export async function updateScheduledJob(req: Request, res: Response): Promise<void> {
  const { scheduledJobId } = req.params;
  const { isActive, cronExpression, payload } = req.body;
  const updates: Record<string, unknown> = { updated_at: new Date() };
  if (isActive !== undefined) updates.is_active = isActive;
  if (payload !== undefined) updates.payload = JSON.stringify(payload);
  if (cronExpression) {
    const cronParser = require('cron-parser');
    const interval = cronParser.parseExpression(cronExpression);
    updates.cron_expression = cronExpression;
    updates.next_run_at = interval.next().toDate();
  }
  await db('scheduled_jobs').where({ id: scheduledJobId }).update(updates);
  const job = await db('scheduled_jobs').where({ id: scheduledJobId }).first();
  res.json({ success: true, data: job } as ApiResponse);
}

// ─── System-wide stats ────────────────────────────────────────

export async function getSystemStats(req: Request, res: Response): Promise<void> {
  const [jobStats, workerStats, queueCount] = await Promise.all([
    db('jobs')
      .groupBy('status')
      .select('status', db.raw('COUNT(*) as count')),
    db('workers')
      .groupBy('status')
      .select('status', db.raw('COUNT(*) as count')),
    db('queues').count('id as count').first(),
  ]);

  const jobCountMap: Record<string, number> = {};
  jobStats.forEach((r: any) => { jobCountMap[r.status] = Number(r.count); });

  const workerCountMap: Record<string, number> = {};
  workerStats.forEach((r: any) => { workerCountMap[r.status] = Number(r.count); });

  // Throughput last 5 min
  const recentCompleted = await db('job_executions')
    .where('status', 'completed')
    .where('completed_at', '>', db.raw("NOW() - INTERVAL '5 minutes'"))
    .count('id as count')
    .first();

  res.json({
    success: true,
    data: {
      jobs: jobCountMap,
      workers: workerCountMap,
      queues: Number(queueCount?.count || 0),
      throughputLast5Min: Number(recentCompleted?.count || 0),
    },
  } as ApiResponse);
}
