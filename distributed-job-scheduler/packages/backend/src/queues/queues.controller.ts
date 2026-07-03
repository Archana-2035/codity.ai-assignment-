import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../auth/auth.controller';
import { ApiResponse } from '@djs/shared';

// ─── Retry Policies ──────────────────────────────────────────

export async function listRetryPolicies(req: Request, res: Response): Promise<void> {
  const policies = await db('retry_policies').orderBy('created_at', 'desc');
  res.json({ success: true, data: policies } as ApiResponse);
}

export async function createRetryPolicy(req: Request, res: Response): Promise<void> {
  const { name, strategy, maxAttempts, initialDelayMs, maxDelayMs, multiplier, jitter } = req.body;
  const [policy] = await db('retry_policies')
    .insert({
      id: uuidv4(),
      name,
      strategy,
      max_attempts: maxAttempts ?? 3,
      initial_delay_ms: initialDelayMs ?? 1000,
      max_delay_ms: maxDelayMs ?? 300000,
      multiplier: multiplier ?? 2.0,
      jitter: jitter ?? true,
    })
    .returning('*');
  res.status(201).json({ success: true, data: policy } as ApiResponse);
}

// ─── Queues ────────────────────────────────────────────────────

export async function listQueues(req: Request, res: Response): Promise<void> {
  const { projectId } = req.params;
  const { page = 1, limit = 20 } = req.query as any;
  const offset = (Number(page) - 1) * Number(limit);

  const [queues, [{ count }]] = await Promise.all([
    db('queues as q')
      .leftJoin('retry_policies as rp', 'rp.id', 'q.retry_policy_id')
      .where('q.project_id', projectId)
      .select(
        'q.*',
        db.raw(`json_build_object(
          'id', rp.id, 'strategy', rp.strategy, 'maxAttempts', rp.max_attempts,
          'initialDelayMs', rp.initial_delay_ms
        ) as retry_policy`)
      )
      .limit(Number(limit))
      .offset(offset)
      .orderBy('q.priority', 'asc'),
    db('queues').where({ project_id: projectId }).count('id as count'),
  ]);

  // Enrich with live stats
  const enriched = await Promise.all(queues.map(async (q) => {
    const stats = await getQueueStatsData(q.id);
    return { ...q, stats };
  }));

  res.json({
    success: true,
    data: enriched,
    meta: { total: Number(count), page: Number(page), limit: Number(limit) },
  } as ApiResponse);
}

export async function createQueue(req: Request, res: Response): Promise<void> {
  const { projectId } = req.params;
  const {
    name, description, priority, concurrencyLimit, retryPolicyId,
    rateLimitPerMinute, maxJobAgeDays, dlqEnabled, shardCount
  } = req.body;

  try {
    const [queue] = await db('queues')
      .insert({
        id: uuidv4(),
        project_id: projectId,
        name,
        description,
        priority: priority ?? 5,
        concurrency_limit: concurrencyLimit ?? 10,
        retry_policy_id: retryPolicyId,
        rate_limit_per_minute: rateLimitPerMinute,
        max_job_age_days: maxJobAgeDays,
        dlq_enabled: dlqEnabled ?? true,
        shard_count: shardCount ?? 1,
      })
      .returning('*');

    logger.info('Queue created', { queueId: queue.id, projectId });
    res.status(201).json({ success: true, data: queue } as ApiResponse);
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ success: false, error: 'Queue name already exists in this project' } as ApiResponse);
      return;
    }
    res.status(500).json({ success: false, error: 'Failed to create queue' } as ApiResponse);
  }
}

export async function getQueue(req: Request, res: Response): Promise<void> {
  const { queueId } = req.params;
  const queue = await db('queues as q')
    .leftJoin('retry_policies as rp', 'rp.id', 'q.retry_policy_id')
    .where('q.id', queueId)
    .select('q.*', db.raw(`row_to_json(rp.*) as retry_policy`))
    .first();

  if (!queue) {
    res.status(404).json({ success: false, error: 'Queue not found' } as ApiResponse);
    return;
  }

  const stats = await getQueueStatsData(queueId as string);
  res.json({ success: true, data: { ...queue, stats } } as ApiResponse);
}

export async function updateQueue(req: Request, res: Response): Promise<void> {
  const { queueId } = req.params;
  const allowed = [
    'description', 'priority', 'concurrency_limit', 'retry_policy_id',
    'rate_limit_per_minute', 'max_job_age_days', 'dlq_enabled', 'shard_count'
  ];

  // Map camelCase body to snake_case
  const updates: Record<string, unknown> = {};
  const fieldMap: Record<string, string> = {
    concurrencyLimit: 'concurrency_limit',
    retryPolicyId: 'retry_policy_id',
    rateLimitPerMinute: 'rate_limit_per_minute',
    maxJobAgeDays: 'max_job_age_days',
    dlqEnabled: 'dlq_enabled',
    shardCount: 'shard_count',
  };

  for (const [key, val] of Object.entries(req.body)) {
    const dbKey = fieldMap[key] || key;
    if (allowed.includes(dbKey)) updates[dbKey] = val;
  }

  if (!Object.keys(updates).length) {
    res.status(400).json({ success: false, error: 'No valid fields to update' } as ApiResponse);
    return;
  }

  await db('queues').where({ id: queueId }).update({ ...updates, updated_at: new Date() });
  const queue = await db('queues').where({ id: queueId }).first();
  res.json({ success: true, data: queue } as ApiResponse);
}

export async function pauseQueue(req: Request, res: Response): Promise<void> {
  const { queueId } = req.params;
  await db('queues').where({ id: queueId }).update({ is_paused: true });
  res.json({ success: true, message: 'Queue paused' } as ApiResponse);
}

export async function resumeQueue(req: Request, res: Response): Promise<void> {
  const { queueId } = req.params;
  await db('queues').where({ id: queueId }).update({ is_paused: false });
  res.json({ success: true, message: 'Queue resumed' } as ApiResponse);
}

export async function deleteQueue(req: Request, res: Response): Promise<void> {
  const { queueId } = req.params;
  // Check for active jobs
  const activeJobs = await db('jobs')
    .where({ queue_id: queueId })
    .whereIn('status', ['pending', 'claimed', 'running'])
    .count('id as count')
    .first();

  if (Number(activeJobs?.count) > 0) {
    res.status(409).json({
      success: false,
      error: 'Cannot delete queue with active jobs. Drain the queue first.',
    } as ApiResponse);
    return;
  }

  await db('queues').where({ id: queueId }).delete();
  res.json({ success: true, message: 'Queue deleted' } as ApiResponse);
}

export async function getQueueStats(req: Request, res: Response): Promise<void> {
  const { queueId } = req.params;
  const stats = await getQueueStatsData(queueId as string);
  res.json({ success: true, data: stats } as ApiResponse);
}

export async function getQueueMetricsHistory(req: Request, res: Response): Promise<void> {
  const { queueId } = req.params;
  const { hours = 24 } = req.query as any;

  const metrics = await db('queue_metrics')
    .where('queue_id', queueId)
    .where('captured_at', '>', db.raw(`NOW() - INTERVAL '${Number(hours)} hours'`))
    .orderBy('captured_at', 'asc')
    .select('*');

  res.json({ success: true, data: metrics } as ApiResponse);
}

// ─── Internal helper ──────────────────────────────────────────

export async function getQueueStatsData(queueId: string) {
  const statusCounts = await db('jobs')
    .where({ queue_id: queueId })
    .groupBy('status')
    .select('status', db.raw('COUNT(*) as count'));

  const countMap: Record<string, number> = {};
  statusCounts.forEach((r) => { countMap[r.status] = Number(r.count); });

  const perf = await db('job_executions as je')
    .join('jobs as j', 'j.id', 'je.job_id')
    .where('j.queue_id', queueId)
    .where('je.status', 'completed')
    .where('je.started_at', '>', db.raw("NOW() - INTERVAL '1 hour'"))
    .select(
      db.raw('AVG(je.duration_ms) as avg_duration_ms'),
      db.raw('COUNT(*) as completed_last_hour')
    )
    .first();

  const failedLastHour = await db('job_executions as je')
    .join('jobs as j', 'j.id', 'je.job_id')
    .where('j.queue_id', queueId)
    .where('je.status', 'failed')
    .where('je.started_at', '>', db.raw("NOW() - INTERVAL '1 hour'"))
    .count('je.id as count')
    .first();

  const completedLastHour = Number(perf?.completed_last_hour || 0);
  const failedCount = Number(failedLastHour?.count || 0);
  const totalLastHour = completedLastHour + failedCount;
  const errorRate = totalLastHour > 0 ? (failedCount / totalLastHour) * 100 : 0;
  const throughputPerMinute = completedLastHour / 60;

  return {
    queueId,
    pendingCount: countMap.pending || 0,
    scheduledCount: countMap.scheduled || 0,
    runningCount: countMap.running || 0,
    completedCount: countMap.completed || 0,
    failedCount: countMap.failed || 0,
    deadCount: countMap.dead || 0,
    cancelledCount: countMap.cancelled || 0,
    avgDurationMs: Math.round(Number(perf?.avg_duration_ms || 0)),
    errorRate: Math.round(errorRate * 100) / 100,
    throughputPerMinute: Math.round(throughputPerMinute * 100) / 100,
  };
}
