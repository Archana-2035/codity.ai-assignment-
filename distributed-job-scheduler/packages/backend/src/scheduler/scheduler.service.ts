import db from '../db';
import { getRedis, acquireLock, releaseLock } from '../utils/redis';
import { logger } from '../utils/logger';
import { JobStatus } from '@djs/shared';
import { v4 as uuidv4 } from 'uuid';
import { emitEvent } from '../websocket/ws.service';
import { WsEvent } from '@djs/shared';

const SCHEDULER_LOCK_KEY = 'scheduler:lock';
const SCHEDULER_LOCK_TTL = 25000; // 25s (runs every 10s, lock lasts 25s)
const SCHEDULER_INTERVAL = 10000; // 10s

let schedulerTimer: NodeJS.Timeout | null = null;
let metricsTimer: NodeJS.Timeout | null = null;

export function startScheduler(): void {
  logger.info('Starting scheduler service');

  // Scheduled job dispatcher
  schedulerTimer = setInterval(async () => {
    const token = await acquireLock(SCHEDULER_LOCK_KEY, SCHEDULER_LOCK_TTL);
    if (!token) {
      logger.debug('Scheduler: another instance holds the lock, skipping');
      return;
    }

    try {
      await dispatchScheduledJobs();
      await promoteScheduledStatusJobs();
    } finally {
      await releaseLock(SCHEDULER_LOCK_KEY, token);
    }
  }, SCHEDULER_INTERVAL);

  // Metrics snapshot collection (every minute)
  metricsTimer = setInterval(async () => {
    await collectQueueMetrics();
  }, 60000);

  // Also trigger metrics on start
  collectQueueMetrics().catch((err) => logger.error('Metrics collection error', { error: err.message }));
}

export function stopScheduler(): void {
  if (schedulerTimer) { clearInterval(schedulerTimer); schedulerTimer = null; }
  if (metricsTimer) { clearInterval(metricsTimer); metricsTimer = null; }
  logger.info('Scheduler stopped');
}

/**
 * Dispatch scheduled jobs whose next_run_at has passed.
 * Creates actual job entries and updates next_run_at for cron jobs.
 */
async function dispatchScheduledJobs(): Promise<void> {
  try {
    const dueJobs = await db('scheduled_jobs')
      .where({ is_active: true })
      .where('next_run_at', '<=', new Date())
      .select('*');

    if (!dueJobs.length) return;

    logger.info(`Dispatching ${dueJobs.length} scheduled jobs`);

    for (const scheduledJob of dueJobs) {
      try {
        await db.transaction(async (trx) => {
          // Create the actual job
          await trx('jobs').insert({
            id: uuidv4(),
            queue_id: scheduledJob.queue_id,
            project_id: (await trx('queues').where({ id: scheduledJob.queue_id }).select('project_id').first())?.project_id,
            type: scheduledJob.type,
            payload: scheduledJob.payload,
            status: JobStatus.PENDING,
            priority: 5,
            run_at: new Date(),
            max_attempts: scheduledJob.max_attempts || 3,
          });

          // Calculate next run time for cron jobs
          if (scheduledJob.cron_expression) {
            const cronParser = require('cron-parser');
            const interval = cronParser.parseExpression(scheduledJob.cron_expression, {
              tz: scheduledJob.timezone || 'UTC',
            });
            const nextRunAt = interval.next().toDate();

            await trx('scheduled_jobs').where({ id: scheduledJob.id }).update({
              last_run_at: new Date(),
              next_run_at: nextRunAt,
              updated_at: new Date(),
            });
          } else {
            // One-time scheduled job: deactivate after dispatch
            await trx('scheduled_jobs').where({ id: scheduledJob.id }).update({
              is_active: false,
              last_run_at: new Date(),
              updated_at: new Date(),
            });
          }
        });
      } catch (err) {
        logger.error('Failed to dispatch scheduled job', {
          scheduledJobId: scheduledJob.id,
          error: (err as Error).message,
        });
      }
    }
  } catch (err) {
    logger.error('Scheduler dispatch error', { error: (err as Error).message });
  }
}

/**
 * Promote jobs with status=scheduled where run_at has passed to pending.
 */
async function promoteScheduledStatusJobs(): Promise<void> {
  try {
    const promoted = await db('jobs')
      .where({ status: JobStatus.SCHEDULED })
      .where('run_at', '<=', new Date())
      .update({ status: JobStatus.PENDING, updated_at: new Date() })
      .returning('id');

    if (promoted.length > 0) {
      logger.info(`Promoted ${promoted.length} scheduled jobs to pending`);
    }
  } catch (err) {
    logger.error('Job promotion error', { error: (err as Error).message });
  }
}

/**
 * Collect queue metrics snapshots for time-series charts.
 */
async function collectQueueMetrics(): Promise<void> {
  try {
    const queues = await db('queues').select('id');

    for (const queue of queues) {
      const statusCounts = await db('jobs')
        .where({ queue_id: queue.id })
        .groupBy('status')
        .select('status', db.raw('COUNT(*) as count'));

      const map: Record<string, number> = {};
      statusCounts.forEach((r: any) => { map[r.status] = Number(r.count); });

      const perf = await db('job_executions as je')
        .join('jobs as j', 'j.id', 'je.job_id')
        .where('j.queue_id', queue.id)
        .where('je.status', 'completed')
        .where('je.started_at', '>', db.raw("NOW() - INTERVAL '1 hour'"))
        .select(
          db.raw('AVG(je.duration_ms) as avg_duration_ms'),
          db.raw('COUNT(*) as count')
        )
        .first();

      await db('queue_metrics').insert({
        id: uuidv4(),
        queue_id: queue.id,
        pending_count: map.pending || 0,
        running_count: (map.running || 0) + (map.claimed || 0),
        completed_count: map.completed || 0,
        failed_count: (map.failed || 0) + (map.dead || 0),
        avg_duration_ms: Number(perf?.avg_duration_ms || 0),
        throughput_per_minute: Number(perf?.count || 0) / 60,
      });

      // Emit stats update event
      emitEvent(WsEvent.QUEUE_STATS_UPDATED, {
        queueId: queue.id,
        stats: { pending: map.pending || 0, running: map.running || 0 },
      });
    }
  } catch (err) {
    logger.error('Metrics collection error', { error: (err as Error).message });
  }
}
