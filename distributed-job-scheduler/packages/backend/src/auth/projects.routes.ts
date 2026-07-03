import { Router } from 'express';
import { body, param } from 'express-validator';
import { validate } from '../middleware/validate';
import { authenticate, requireOrgRole } from './auth.controller';
import * as projectsController from './projects.controller';
import { OrgRole } from '@djs/shared';

const router = Router();

// Organizations
router.get('/orgs', authenticate, projectsController.listOrgs);
router.post(
  '/orgs',
  authenticate,
  [body('name').trim().isLength({ min: 2, max: 100 })],
  validate,
  projectsController.createOrg
);
router.get('/orgs/:orgId', authenticate, projectsController.getOrg);

// Projects (scoped to org)
router.get('/orgs/:orgId/projects', authenticate, projectsController.listProjects);
router.post(
  '/orgs/:orgId/projects',
  authenticate,
  requireOrgRole(OrgRole.OWNER, OrgRole.ADMIN),
  [body('name').trim().isLength({ min: 2, max: 100 })],
  validate,
  projectsController.createProject
);
router.get('/projects/:projectId', authenticate, projectsController.getProject);
router.post('/projects/:projectId/rotate-key', authenticate, projectsController.rotateApiKey);
router.delete('/projects/:projectId', authenticate, projectsController.deleteProject);

export { router as projectsRouter };
