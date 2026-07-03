import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import db from '../db';
import { logger } from '../utils/logger';
import { ApiResponse, UserRole, OrgRole } from '@djs/shared';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production-32chars-min';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '15m';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'refresh-secret-change-me-32chars';
const REFRESH_EXPIRES = process.env.REFRESH_EXPIRES || '7d';
const BCRYPT_ROUNDS = 12;

// ─── Token Generation ─────────────────────────────────────────

export interface JwtPayload {
  sub: string;  // user id
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

export function signAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES } as jwt.SignOptions);
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId }, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export function verifyRefreshToken(token: string): { sub: string } {
  return jwt.verify(token, REFRESH_SECRET) as { sub: string };
}

// ─── Auth Controller ──────────────────────────────────────────

export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { email, password, orgName } = req.body;

    // Check duplicate email
    const existing = await db('users').where({ email }).first();
    if (existing) {
      res.status(409).json({ success: false, error: 'Email already registered' } as ApiResponse);
      return;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const userId = uuidv4();

    await db.transaction(async (trx) => {
      // Create user
      await trx('users').insert({
        id: userId,
        email,
        password_hash: passwordHash,
        role: UserRole.ADMIN, // First user is admin
        is_active: true,
      });

      // Create default organization
      const orgSlug = orgName
        ? orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)
        : `org-${userId.slice(0, 8)}`;

      const [org] = await trx('organizations')
        .insert({
          id: uuidv4(),
          name: orgName || `${email.split('@')[0]}'s Organization`,
          slug: orgSlug,
        })
        .returning('*');

      // Add user as owner
      await trx('organization_members').insert({
        org_id: org.id,
        user_id: userId,
        role: OrgRole.OWNER,
      });
    });

    const user = await db('users').where({ id: userId }).first();
    const accessToken = signAccessToken({ sub: userId, email, role: UserRole.ADMIN });
    const refreshToken = signRefreshToken(userId);

    // Store refresh token
    await db('refresh_tokens').insert({
      id: uuidv4(),
      user_id: userId,
      token: refreshToken,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    logger.info('User registered', { userId, email });

    res.status(201).json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      },
    } as ApiResponse);
  } catch (err) {
    logger.error('Register error', { error: (err as Error).message });
    res.status(500).json({ success: false, error: 'Registration failed' } as ApiResponse);
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;

    const user = await db('users').where({ email, is_active: true }).first();
    if (!user) {
      res.status(401).json({ success: false, error: 'Invalid credentials' } as ApiResponse);
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ success: false, error: 'Invalid credentials' } as ApiResponse);
      return;
    }

    const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role });
    const refreshToken = signRefreshToken(user.id);

    // Rotate refresh token: delete old, insert new
    await db('refresh_tokens').where({ user_id: user.id }).delete();
    await db('refresh_tokens').insert({
      id: uuidv4(),
      user_id: user.id,
      token: refreshToken,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    logger.info('User logged in', { userId: user.id, email });

    res.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: { id: user.id, email: user.email, role: user.role },
      },
    } as ApiResponse);
  } catch (err) {
    logger.error('Login error', { error: (err as Error).message });
    res.status(500).json({ success: false, error: 'Login failed' } as ApiResponse);
  }
}

export async function refreshTokens(req: Request, res: Response): Promise<void> {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(401).json({ success: false, error: 'Refresh token required' } as ApiResponse);
      return;
    }

    let payload: { sub: string };
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      res.status(401).json({ success: false, error: 'Invalid refresh token' } as ApiResponse);
      return;
    }

    const stored = await db('refresh_tokens')
      .where({ token: refreshToken, is_revoked: false })
      .where('expires_at', '>', new Date())
      .first();

    if (!stored) {
      res.status(401).json({ success: false, error: 'Refresh token expired or revoked' } as ApiResponse);
      return;
    }

    const user = await db('users').where({ id: payload.sub, is_active: true }).first();
    if (!user) {
      res.status(401).json({ success: false, error: 'User not found' } as ApiResponse);
      return;
    }

    const newAccessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role });
    const newRefreshToken = signRefreshToken(user.id);

    await db('refresh_tokens').where({ id: stored.id }).update({
      token: newRefreshToken,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    res.json({
      success: true,
      data: { accessToken: newAccessToken, refreshToken: newRefreshToken },
    } as ApiResponse);
  } catch (err) {
    logger.error('Token refresh error', { error: (err as Error).message });
    res.status(500).json({ success: false, error: 'Token refresh failed' } as ApiResponse);
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await db('refresh_tokens').where({ token: refreshToken }).update({ is_revoked: true });
    }
    res.json({ success: true, message: 'Logged out successfully' } as ApiResponse);
  } catch (err) {
    res.status(500).json({ success: false, error: 'Logout failed' } as ApiResponse);
  }
}

export async function getProfile(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.sub;
    const user = await db('users').where({ id: userId }).first();
    const orgs = await db('organization_members as om')
      .join('organizations as o', 'o.id', 'om.org_id')
      .where('om.user_id', userId)
      .select('o.id', 'o.name', 'o.slug', 'om.role');

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        role: user.role,
        organizations: orgs,
      },
    } as ApiResponse);
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to get profile' } as ApiResponse);
  }
}

// ─── Auth Middleware ──────────────────────────────────────────

export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const apiKey = req.headers['x-api-key'] as string;

  // API Key authentication (for programmatic access)
  if (apiKey) {
    db('projects').where({ api_key: apiKey, is_active: true })
      .join('organizations as o', 'o.id', 'projects.org_id')
      .select('projects.*')
      .first()
      .then((project) => {
        if (!project) {
          res.status(401).json({ success: false, error: 'Invalid API key' } as ApiResponse);
          return;
        }
        // Attach a synthetic user for project API key auth
        (req as AuthenticatedRequest).user = {
          sub: `project:${project.id}`,
          email: `api-key:${project.id}`,
          role: UserRole.MEMBER,
        };
        (req as Request & { projectId?: string }).projectId = project.id;
        next();
      })
      .catch(() => {
        res.status(500).json({ success: false, error: 'Authentication error' } as ApiResponse);
      });
    return;
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Authorization header required' } as ApiResponse);
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = verifyAccessToken(token);
    (req as AuthenticatedRequest).user = payload;
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token' } as ApiResponse);
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as AuthenticatedRequest).user;
    if (!roles.includes(user.role)) {
      res.status(403).json({ success: false, error: 'Insufficient permissions' } as ApiResponse);
      return;
    }
    next();
  };
}

export function requireOrgRole(...roles: OrgRole[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = (req as AuthenticatedRequest).user;
    const orgId = req.params.orgId;

    if (!orgId) {
      next();
      return;
    }

    try {
      const membership = await db('organization_members')
        .where({ org_id: orgId, user_id: user.sub })
        .first();

      if (!membership || !roles.includes(membership.role)) {
        res.status(403).json({ success: false, error: 'Insufficient organization permissions' } as ApiResponse);
        return;
      }
      next();
    } catch {
      res.status(500).json({ success: false, error: 'Authorization check failed' } as ApiResponse);
    }
  };
}
