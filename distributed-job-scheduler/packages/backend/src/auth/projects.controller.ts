import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../auth/auth.controller';
import { ApiResponse, OrgRole } from '@djs/shared';

// ─── Organizations ────────────────────────────────────────────

export async function listOrgs(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const orgs = await db('organization_members as om')
    .join('organizations as o', 'o.id', 'om.org_id')
    .where('om.user_id', user.sub)
    .select('o.*', 'om.role as my_role');

  res.json({ success: true, data: orgs });
}

export async function createOrg(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const { name, description } = req.body;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50);

  try {
    const result = await db.transaction(async (trx) => {
      const existing = await trx('organizations').where({ slug }).first();
      if (existing) {
        throw Object.assign(new Error('Organization slug already taken'), { status: 409 });
      }

      const [org] = await trx('organizations')
        .insert({ id: uuidv4(), name, slug, description })
        .returning('*');

      await trx('organization_members').insert({
        org_id: org.id,
        user_id: user.sub,
        role: OrgRole.OWNER,
      });

      return org;
    });

    res.status(201).json({ success: true, data: result });
  } catch (err: any) {
    if (err.status === 409) {
      res.status(409).json({ success: false, error: err.message });
      return;
    }
    logger.error('Create org error', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to create organization' });
  }
}

export async function getOrg(req: Request, res: Response): Promise<void> {
  const { orgId } = req.params;
  const org = await db('organizations').where({ id: orgId }).first();
  if (!org) {
    res.status(404).json({ success: false, error: 'Organization not found' });
    return;
  }
  res.json({ success: true, data: org });
}

// ─── Projects ─────────────────────────────────────────────────

export async function listProjects(req: Request, res: Response): Promise<void> {
  const { orgId } = req.params;
  const projects = await db('projects')
    .where({ org_id: orgId, is_active: true })
    .select('id', 'org_id', 'name', 'slug', 'description', 'api_key', 'created_at');
  res.json({ success: true, data: projects });
}

export async function createProject(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const { orgId } = req.params;
  const { name, description } = req.body;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50);
  const apiKey = `sk_${uuidv4().replace(/-/g, '')}`;

  try {
    const [project] = await db('projects')
      .insert({
        id: uuidv4(),
        org_id: orgId,
        name,
        slug,
        description,
        api_key: apiKey,
      })
      .returning('*');

    logger.info('Project created', { projectId: project.id, userId: user.sub });
    res.status(201).json({ success: true, data: project });
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ success: false, error: 'Project name already taken in this organization' });
      return;
    }
    res.status(500).json({ success: false, error: 'Failed to create project' });
  }
}

export async function getProject(req: Request, res: Response): Promise<void> {
  const { projectId } = req.params;
  const project = await db('projects').where({ id: projectId, is_active: true }).first();
  if (!project) {
    res.status(404).json({ success: false, error: 'Project not found' });
    return;
  }
  res.json({ success: true, data: project });
}

export async function rotateApiKey(req: Request, res: Response): Promise<void> {
  const { projectId } = req.params;
  const newApiKey = `sk_${uuidv4().replace(/-/g, '')}`;
  await db('projects').where({ id: projectId }).update({ api_key: newApiKey });
  res.json({ success: true, data: { apiKey: newApiKey } });
}

export async function deleteProject(req: Request, res: Response): Promise<void> {
  const { projectId } = req.params;
  await db('projects').where({ id: projectId }).update({ is_active: false });
  res.json({ success: true, message: 'Project deactivated' });
}
