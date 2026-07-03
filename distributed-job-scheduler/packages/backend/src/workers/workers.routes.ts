import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import { authenticate } from '../auth/auth.controller';
import * as workersController from './workers.controller';

const router = Router();

/**
 * @swagger
 * /api/v1/workers:
 *   post:
 *     tags: [Workers]
 *     summary: Register a new worker
 */
router.post(
  '/workers',
  [
    body('hostname').trim().notEmpty(),
    body('pid').isInt({ min: 1 }),
    body('queueIds').isArray({ min: 1 }),
    body('concurrency').optional().isInt({ min: 1, max: 200 }),
  ],
  validate,
  workersController.registerWorker
);

/**
 * @swagger
 * /api/v1/workers:
 *   get:
 *     tags: [Workers]
 *     summary: List all workers
 *     security:
 *       - bearerAuth: []
 */
router.get('/workers', authenticate, workersController.listWorkers);
router.get('/workers/:workerId', authenticate, workersController.getWorker);
router.delete('/workers/:workerId', authenticate, workersController.deregisterWorker);

/**
 * @swagger
 * /api/v1/workers/{workerId}/heartbeat:
 *   post:
 *     tags: [Workers]
 *     summary: Send worker heartbeat
 */
router.post('/workers/:workerId/heartbeat', workersController.workerHeartbeat);

/**
 * @swagger
 * /api/v1/workers/{workerId}/claim:
 *   post:
 *     tags: [Workers]
 *     summary: Atomically claim a job for execution
 */
router.post(
  '/workers/:workerId/claim',
  [body('queueIds').isArray({ min: 1 })],
  validate,
  workersController.claimJob
);

/**
 * @swagger
 * /api/v1/workers/{workerId}/jobs/{jobId}/complete:
 *   post:
 *     tags: [Workers]
 *     summary: Mark job as completed
 */
router.post(
  '/workers/:workerId/jobs/:jobId/complete',
  [body('executionId').notEmpty()],
  validate,
  workersController.completeJob
);

/**
 * @swagger
 * /api/v1/workers/{workerId}/jobs/{jobId}/fail:
 *   post:
 *     tags: [Workers]
 *     summary: Mark job as failed (triggers retry or DLQ)
 */
router.post(
  '/workers/:workerId/jobs/:jobId/fail',
  [body('executionId').notEmpty()],
  validate,
  workersController.failJob
);

export { router as workersRouter };
