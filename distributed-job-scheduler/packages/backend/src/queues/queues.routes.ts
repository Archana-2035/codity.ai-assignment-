import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { validate } from '../middleware/validate';
import { authenticate } from '../auth/auth.controller';
import * as queuesController from './queues.controller';

const router = Router();

/**
 * @swagger
 * /api/v1/projects/{projectId}/queues:
 *   get:
 *     tags: [Queues]
 *     summary: List all queues in a project
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 */
router.get('/projects/:projectId/queues', authenticate, queuesController.listQueues);

/**
 * @swagger
 * /api/v1/projects/{projectId}/queues:
 *   post:
 *     tags: [Queues]
 *     summary: Create a new queue
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/projects/:projectId/queues',
  authenticate,
  [
    body('name').trim().isLength({ min: 1, max: 100 }).matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage('Queue name must only contain letters, numbers, hyphens, or underscores'),
    body('priority').optional().isInt({ min: 1, max: 10 }),
    body('concurrencyLimit').optional().isInt({ min: 1, max: 1000 }),
    body('rateLimitPerMinute').optional().isInt({ min: 1 }),
    body('dlqEnabled').optional().isBoolean(),
  ],
  validate,
  queuesController.createQueue
);

router.get('/queues/:queueId', authenticate, queuesController.getQueue);
router.patch('/queues/:queueId', authenticate, queuesController.updateQueue);
router.delete('/queues/:queueId', authenticate, queuesController.deleteQueue);
router.post('/queues/:queueId/pause', authenticate, queuesController.pauseQueue);
router.post('/queues/:queueId/resume', authenticate, queuesController.resumeQueue);
router.get('/queues/:queueId/stats', authenticate, queuesController.getQueueStats);
router.get('/queues/:queueId/metrics', authenticate, queuesController.getQueueMetricsHistory);

// Retry Policies
router.get('/retry-policies', authenticate, queuesController.listRetryPolicies);
router.post(
  '/retry-policies',
  authenticate,
  [
    body('name').trim().isLength({ min: 1, max: 100 }),
    body('strategy').isIn(['fixed', 'linear', 'exponential']),
    body('maxAttempts').isInt({ min: 1, max: 100 }),
    body('initialDelayMs').isInt({ min: 100 }),
  ],
  validate,
  queuesController.createRetryPolicy
);

export { router as queuesRouter };
