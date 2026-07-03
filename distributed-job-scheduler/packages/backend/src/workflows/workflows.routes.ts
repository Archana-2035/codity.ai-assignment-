import { Router } from 'express';
import { body, query } from 'express-validator';
import { validate } from '../middleware/validate';
import { authenticate } from '../auth/auth.controller';
import * as workflowsController from './workflows.controller';

const router = Router();

/**
 * @swagger
 * /api/v1/projects/{projectId}/workflows:
 *   post:
 *     tags: [Workflows]
 *     summary: Create a new workflow (DAG of jobs)
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/projects/:projectId/workflows',
  authenticate,
  [
    body('name').trim().isLength({ min: 1, max: 255 }),
    body('definition').isObject(),
    body('definition.steps').isArray({ min: 1 }),
  ],
  validate,
  workflowsController.createWorkflow
);

/**
 * @swagger
 * /api/v1/projects/{projectId}/workflows:
 *   get:
 *     tags: [Workflows]
 *     summary: List workflows in a project
 */
router.get(
  '/projects/:projectId/workflows',
  authenticate,
  [
    query('status').optional().isIn(['pending', 'running', 'completed', 'failed', 'cancelled']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  validate,
  workflowsController.listWorkflows
);

/**
 * @swagger
 * /api/v1/workflows/{workflowId}:
 *   get:
 *     tags: [Workflows]
 *     summary: Get workflow details with linked jobs
 */
router.get('/workflows/:workflowId', authenticate, workflowsController.getWorkflow);

/**
 * @swagger
 * /api/v1/workflows/{workflowId}/trigger:
 *   post:
 *     tags: [Workflows]
 *     summary: Trigger (start) a workflow
 */
router.post('/workflows/:workflowId/trigger', authenticate, workflowsController.triggerWorkflow);

/**
 * @swagger
 * /api/v1/jobs/{jobId}/ai-summary:
 *   get:
 *     tags: [Jobs]
 *     summary: Generate an AI-powered failure summary for a failed job
 */
router.get('/jobs/:jobId/ai-summary', authenticate, workflowsController.generateAiFailureSummary);

export { router as workflowsRouter };
