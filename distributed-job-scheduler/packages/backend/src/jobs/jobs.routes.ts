import { Router } from 'express';
import { body, query, param } from 'express-validator';
import { validate } from '../middleware/validate';
import { authenticate } from '../auth/auth.controller';
import * as jobsController from './jobs.controller';

const router = Router();

// ─── Job Submission ───────────────────────────────────────────

/**
 * @swagger
 * /api/v1/queues/{queueId}/jobs:
 *   post:
 *     tags: [Jobs]
 *     summary: Submit a job (immediate or delayed)
 *     security:
 *       - bearerAuth: []
 *       - apiKey: []
 */
router.post(
  '/queues/:queueId/jobs',
  authenticate,
  [
    body('type').trim().isLength({ min: 1, max: 100 }),
    body('payload').optional().isObject(),
    body('priority').optional().isInt({ min: 1, max: 10 }),
    body('maxAttempts').optional().isInt({ min: 1, max: 100 }),
    body('runAt').optional().isISO8601(),
    body('scheduledAt').optional().isISO8601(),
    body('idempotencyKey').optional().isString().isLength({ max: 255 }),
  ],
  validate,
  jobsController.createJob
);

/**
 * @swagger
 * /api/v1/queues/{queueId}/jobs:
 *   get:
 *     tags: [Jobs]
 *     summary: List jobs in a queue
 */
router.get(
  '/queues/:queueId/jobs',
  authenticate,
  [
    query('status').optional().isIn(['pending', 'scheduled', 'claimed', 'running', 'completed', 'failed', 'dead', 'cancelled']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  validate,
  jobsController.listJobs
);

/**
 * @swagger
 * /api/v1/queues/{queueId}/batch:
 *   post:
 *     tags: [Jobs]
 *     summary: Submit a batch of jobs
 */
router.post(
  '/queues/:queueId/batch',
  authenticate,
  [
    body('jobs').isArray({ min: 1, max: 10000 }),
    body('name').optional().isString(),
  ],
  validate,
  jobsController.createBatchJobs
);

/**
 * @swagger
 * /api/v1/queues/{queueId}/scheduled:
 *   post:
 *     tags: [Jobs]
 *     summary: Create a scheduled (cron or one-time delayed) job definition
 */
router.post(
  '/queues/:queueId/scheduled',
  authenticate,
  [
    body('name').trim().isLength({ min: 1, max: 255 }),
    body('type').trim().isLength({ min: 1, max: 100 }),
    body('payload').optional().isObject(),
  ],
  validate,
  jobsController.createScheduledJob
);

router.get(
  '/queues/:queueId/scheduled',
  authenticate,
  jobsController.listScheduledJobs
);

// ─── Individual Job Operations ────────────────────────────────

/**
 * @swagger
 * /api/v1/jobs/{jobId}:
 *   get:
 *     tags: [Jobs]
 *     summary: Get job details with execution history and logs
 */
router.get('/jobs/:jobId', authenticate, jobsController.getJob);
router.delete('/jobs/:jobId', authenticate, jobsController.cancelJob);
router.post('/jobs/:jobId/retry', authenticate, jobsController.retryJob);
router.get('/jobs/:jobId/logs', authenticate, jobsController.getJobLogs);

// ─── Scheduled Job Management ─────────────────────────────────
router.patch('/scheduled-jobs/:scheduledJobId', authenticate, jobsController.updateScheduledJob);

// ─── DLQ ─────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/queues/{queueId}/dlq:
 *   get:
 *     tags: [DLQ]
 *     summary: List Dead Letter Queue entries for a queue
 */
router.get('/queues/:queueId/dlq', authenticate, jobsController.listDlq);
router.post('/dlq/:dlqId/retry', authenticate, jobsController.retryDlqEntry);
router.post('/queues/:queueId/dlq/retry-all', authenticate, jobsController.bulkRetryDlq);

// ─── System Stats ─────────────────────────────────────────────
router.get('/stats', authenticate, jobsController.getSystemStats);

// ─── Project Jobs ─────────────────────────────────────────────
router.get(
  '/projects/:projectId/jobs',
  authenticate,
  [
    query('status').optional().isIn(['pending', 'scheduled', 'claimed', 'running', 'completed', 'failed', 'dead', 'cancelled']),
    query('queueId').optional().isUUID(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  validate,
  jobsController.listProjectJobs
);

export { router as jobsRouter };
