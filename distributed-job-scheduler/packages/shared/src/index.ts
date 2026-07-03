// ============================================================
// Shared TypeScript types for the Distributed Job Scheduler
// ============================================================

// ─── Enums ───────────────────────────────────────────────────

export enum UserRole {
  ADMIN = 'admin',
  MEMBER = 'member',
}

export enum OrgRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
}

export enum JobStatus {
  PENDING = 'pending',
  SCHEDULED = 'scheduled',
  CLAIMED = 'claimed',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  DEAD = 'dead',
  CANCELLED = 'cancelled',
}

export enum ExecutionStatus {
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum WorkerStatus {
  ACTIVE = 'active',
  IDLE = 'idle',
  DRAINING = 'draining',
  OFFLINE = 'offline',
}

export enum RetryStrategy {
  FIXED = 'fixed',
  LINEAR = 'linear',
  EXPONENTIAL = 'exponential',
}

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

export enum BatchStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PARTIAL = 'partial',
}

export enum WorkflowStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

// ─── Core Entities ───────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Project {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  description?: string;
  apiKey: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RetryPolicy {
  id: string;
  strategy: RetryStrategy;
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  jitter: boolean;
}

export interface Queue {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  priority: number;
  concurrencyLimit: number;
  retryPolicyId?: string;
  retryPolicy?: RetryPolicy;
  isPaused: boolean;
  rateLimitPerMinute?: number;
  maxJobAgeDays?: number;
  dlqEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface QueueStats {
  queueId: string;
  pendingCount: number;
  runningCount: number;
  completedCount: number;
  failedCount: number;
  deadCount: number;
  scheduledCount: number;
  totalProcessed: number;
  avgDurationMs: number;
  errorRate: number;
  throughputPerMinute: number;
}

export interface Job {
  id: string;
  queueId: string;
  projectId: string;
  type: string;
  payload: Record<string, unknown>;
  priority: number;
  status: JobStatus;
  scheduledAt?: Date;
  runAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  attemptCount: number;
  maxAttempts: number;
  idempotencyKey?: string;
  batchId?: string;
  workflowId?: string;
  parentJobId?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobExecution {
  id: string;
  jobId: string;
  workerId: string;
  attemptNumber: number;
  status: ExecutionStatus;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  result?: Record<string, unknown>;
  errorMessage?: string;
  errorStack?: string;
  createdAt: Date;
}

export interface JobLog {
  id: string;
  jobId: string;
  executionId?: string;
  level: LogLevel;
  message: string;
  metadata?: Record<string, unknown>;
  loggedAt: Date;
}

export interface Worker {
  id: string;
  hostname: string;
  pid: number;
  queueIds: string[];
  status: WorkerStatus;
  concurrency: number;
  currentJobCount: number;
  lastHeartbeatAt: Date;
  registeredAt: Date;
  version: string;
}

export interface ScheduledJob {
  id: string;
  queueId: string;
  type: string;
  payload: Record<string, unknown>;
  cronExpression?: string;
  nextRunAt: Date;
  lastRunAt?: Date;
  isActive: boolean;
  name: string;
  description?: string;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeadLetterEntry {
  id: string;
  jobId: string;
  queueId: string;
  failureReason: string;
  failureCount: number;
  lastFailedAt: Date;
  originalPayload: Record<string, unknown>;
  canRetry: boolean;
  createdAt: Date;
}

export interface JobBatch {
  id: string;
  name: string;
  queueId: string;
  createdBy: string;
  totalJobs: number;
  pendingCount: number;
  completedCount: number;
  failedCount: number;
  status: BatchStatus;
  options: Record<string, unknown>;
  createdAt: Date;
  completedAt?: Date;
}

// ─── API Request/Response Types ──────────────────────────────

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  meta?: Record<string, unknown>;
}

// ─── WebSocket Event Types ────────────────────────────────────

export enum WsEvent {
  JOB_STATUS_CHANGED = 'job:status_changed',
  JOB_CREATED = 'job:created',
  JOB_LOG = 'job:log',
  WORKER_HEARTBEAT = 'worker:heartbeat',
  WORKER_REGISTERED = 'worker:registered',
  WORKER_OFFLINE = 'worker:offline',
  QUEUE_STATS_UPDATED = 'queue:stats_updated',
  QUEUE_PAUSED = 'queue:paused',
  QUEUE_RESUMED = 'queue:resumed',
  DLQ_ENTRY_CREATED = 'dlq:entry_created',
}

export interface WsMessage<T = unknown> {
  event: WsEvent;
  data: T;
  timestamp: string;
}

// ─── Job Handler Types (Worker) ──────────────────────────────

export interface JobContext {
  jobId: string;
  executionId: string;
  type: string;
  payload: Record<string, unknown>;
  attemptNumber: number;
  log: (level: LogLevel, message: string, metadata?: Record<string, unknown>) => Promise<void>;
}

export type JobHandler = (ctx: JobContext) => Promise<Record<string, unknown> | void>;

// ─── Rate Limiting ───────────────────────────────────────────

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

// ─── Workflow ────────────────────────────────────────────────

export interface WorkflowNode {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  dependsOn: string[];
}

export interface WorkflowDefinition {
  nodes: WorkflowNode[];
}
