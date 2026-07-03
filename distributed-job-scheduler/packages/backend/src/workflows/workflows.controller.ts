import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../auth/auth.controller';
import { ApiResponse } from '@djs/shared';
import { emitEvent } from '../websocket/ws.service';
import { WsEvent } from '@djs/shared';

// ─── Create Workflow ──────────────────────────────────────────
/**
 * Creates a workflow definition (DAG).
 * Body: { name, projectId, definition: { steps: [{id, jobType, queueId, dependsOn: [...stepIds]}] } }
 */
export async function createWorkflow(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const { projectId } = req.params;
  const { name, definition } = req.body;

  if (!name || !definition?.steps?.length) {
    res.status(400).json({ success: false, error: 'name and definition.steps are required' } as ApiResponse);
    return;
  }

  // Validate DAG: no cycles (topological sort)
  const steps: { id: string; dependsOn?: string[] }[] = definition.steps;
  const ids = new Set(steps.map((s) => s.id));
  for (const step of steps) {
    for (const dep of step.dependsOn || []) {
      if (!ids.has(dep)) {
        res.status(400).json({ success: false, error: `Step "${step.id}" depends on unknown step "${dep}"` } as ApiResponse);
        return;
      }
    }
  }

  // Detect cycles using DFS
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const adj: Record<string, string[]> = {};
  for (const step of steps) {
    adj[step.id] = step.dependsOn || [];
  }
  function hasCycle(node: string): boolean {
    if (inStack.has(node)) return true;
    if (visited.has(node)) return false;
    visited.add(node);
    inStack.add(node);
    for (const dep of adj[node] || []) {
      if (hasCycle(dep)) return true;
    }
    inStack.delete(node);
    return false;
  }
  for (const step of steps) {
    if (hasCycle(step.id)) {
      res.status(400).json({ success: false, error: 'Workflow definition contains a circular dependency (cycle detected)' } as ApiResponse);
      return;
    }
  }

  try {
    const [workflow] = await db('workflows')
      .insert({
        id: uuidv4(),
        name,
        project_id: projectId,
        status: 'pending',
        definition: JSON.stringify(definition),
        created_by: user.sub,
      })
      .returning('*');

    logger.info('Workflow created', { workflowId: workflow.id, projectId });
    res.status(201).json({ success: true, data: workflow } as ApiResponse);
  } catch (err: any) {
    logger.error('Create workflow error', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to create workflow' } as ApiResponse);
  }
}

// ─── List Workflows ───────────────────────────────────────────
export async function listWorkflows(req: Request, res: Response): Promise<void> {
  const { projectId } = req.params;
  const { page = 1, limit = 20, status } = req.query as any;
  const offset = (Number(page) - 1) * Number(limit);

  const baseQuery = db('workflows').where({ project_id: projectId });
  if (status) baseQuery.where({ status });

  const [workflows, [{ count }]] = await Promise.all([
    baseQuery.clone().orderBy('created_at', 'desc').limit(Number(limit)).offset(offset),
    baseQuery.clone().count('id as count'),
  ]);

  res.json({
    success: true,
    data: workflows,
    meta: { total: Number(count), page: Number(page), limit: Number(limit) },
  } as ApiResponse);
}

// ─── Get Workflow ─────────────────────────────────────────────
export async function getWorkflow(req: Request, res: Response): Promise<void> {
  const { workflowId } = req.params;
  const workflow = await db('workflows').where({ id: workflowId }).first();
  if (!workflow) {
    res.status(404).json({ success: false, error: 'Workflow not found' } as ApiResponse);
    return;
  }

  // Get jobs linked to this workflow
  const jobs = await db('jobs').where({ workflow_id: workflowId }).orderBy('created_at', 'asc').select('id', 'type', 'status', 'attempt_count', 'run_at', 'created_at');

  res.json({ success: true, data: { ...workflow, jobs } } as ApiResponse);
}

// ─── Run / Trigger Workflow ───────────────────────────────────
/**
 * Starts a workflow by creating the first wave of jobs (steps with no dependencies).
 */
export async function triggerWorkflow(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const { workflowId } = req.params;

  const workflow = await db('workflows').where({ id: workflowId }).first();
  if (!workflow) {
    res.status(404).json({ success: false, error: 'Workflow not found' } as ApiResponse);
    return;
  }
  if (workflow.status !== 'pending') {
    res.status(409).json({ success: false, error: `Workflow is already ${workflow.status}` } as ApiResponse);
    return;
  }

  try {
    const definition = typeof workflow.definition === 'string' ? JSON.parse(workflow.definition) : workflow.definition;
    const steps = definition.steps as { id: string; jobType: string; queueId: string; payload?: object; dependsOn?: string[] }[];

    // Find root steps (no dependencies)
    const rootSteps = steps.filter((s) => !s.dependsOn || s.dependsOn.length === 0);
    if (rootSteps.length === 0) {
      res.status(400).json({ success: false, error: 'No root steps found (all steps have dependencies)' } as ApiResponse);
      return;
    }

    await db.transaction(async (trx) => {
      // Mark workflow running
      await trx('workflows').where({ id: workflowId }).update({ status: 'running', updated_at: new Date() });

      // Create jobs for root steps
      for (const step of rootSteps) {
        const queue = await trx('queues').where({ id: step.queueId }).first();
        if (!queue) throw new Error(`Queue ${step.queueId} not found for step ${step.id}`);

        await trx('jobs').insert({
          id: uuidv4(),
          queue_id: step.queueId,
          project_id: queue.project_id,
          type: step.jobType,
          payload: JSON.stringify({ ...step.payload, _workflow: { workflowId, stepId: step.id } }),
          status: 'pending',
          run_at: new Date(),
          max_attempts: 3,
          workflow_id: workflowId,
          created_by: user.sub,
        });
      }
    });

    emitEvent(WsEvent.JOB_CREATED, { workflowId, message: `Workflow triggered, ${rootSteps.length} root steps queued` });
    res.json({ success: true, message: `Workflow started. ${rootSteps.length} root job(s) queued.` } as ApiResponse);
  } catch (err: any) {
    logger.error('Trigger workflow error', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to trigger workflow' } as ApiResponse);
  }
}

// ─── AI Failure Summary ───────────────────────────────────────
/**
 * Generates an AI-powered failure analysis for a failed job.
 * Falls back to a rule-based analysis if the Gemini API key is not configured.
 */
export async function generateAiFailureSummary(req: Request, res: Response): Promise<void> {
  const { jobId } = req.params;

  try {
    const job = await db('jobs').where({ id: jobId }).first();
    if (!job) {
      res.status(404).json({ success: false, error: 'Job not found' } as ApiResponse);
      return;
    }

    const executions = await db('job_executions')
      .where({ job_id: jobId })
      .orderBy('attempt_number', 'desc')
      .limit(5);

    const logs = await db('job_logs')
      .where({ job_id: jobId })
      .where('level', 'error')
      .orderBy('logged_at', 'desc')
      .limit(20);

    const lastError = executions[0]?.error_message || job.failure_reason || 'Unknown error';
    const errorStack = executions[0]?.error_stack || '';
    const attemptCount = job.attempt_count;
    const maxAttempts = job.max_attempts;
    const jobType = job.type;

    let summary: string;
    let rootCause: string;
    let recommendation: string;
    let severity: string;

    // Try Gemini API if key exists
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (geminiApiKey) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [{
                  text: `You are a DevOps AI assistant analyzing a failed background job. Provide a concise failure analysis in JSON format with fields: summary (1-2 sentences), rootCause (likely cause), recommendation (action to fix), severity (low/medium/high/critical).
                  
Job Type: ${jobType}
Attempts: ${attemptCount}/${maxAttempts}
Error: ${lastError}
Stack Trace (truncated): ${errorStack.slice(0, 500)}
Recent Error Logs: ${logs.map((l: any) => l.message).join('; ').slice(0, 300)}

Respond ONLY with valid JSON.`
                }]
              }]
            })
          }
        );
        if (response.ok) {
          const data = await response.json() as any;
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const parsed = JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
          summary = parsed.summary;
          rootCause = parsed.rootCause;
          recommendation = parsed.recommendation;
          severity = parsed.severity;
        } else {
          throw new Error('Gemini API returned non-OK response');
        }
      } catch {
        // Fall through to rule-based
        ({ summary, rootCause, recommendation, severity } = ruleBasedAnalysis(lastError, errorStack, attemptCount, maxAttempts, jobType));
      }
    } else {
      ({ summary, rootCause, recommendation, severity } = ruleBasedAnalysis(lastError, errorStack, attemptCount, maxAttempts, jobType));
    }

    res.json({
      success: true,
      data: {
        jobId,
        jobType,
        attemptCount,
        maxAttempts,
        lastError,
        summary,
        rootCause,
        recommendation,
        severity,
        generatedAt: new Date().toISOString(),
        aiPowered: !!geminiApiKey,
      },
    } as ApiResponse);
  } catch (err: any) {
    logger.error('AI summary error', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to generate failure summary' } as ApiResponse);
  }
}

function ruleBasedAnalysis(
  error: string,
  stack: string,
  attempts: number,
  maxAttempts: number,
  jobType: string
): { summary: string; rootCause: string; recommendation: string; severity: string } {
  const errorLower = error.toLowerCase();

  if (errorLower.includes('timeout') || errorLower.includes('timed out') || errorLower.includes('econnreset')) {
    return {
      summary: `Job "${jobType}" failed after ${attempts} attempts due to a network timeout.`,
      rootCause: 'Network connectivity issue or downstream service timeout.',
      recommendation: 'Check network conditions, increase timeout settings, or add circuit breaker logic.',
      severity: 'medium',
    };
  }
  if (errorLower.includes('econnrefused') || errorLower.includes('connection refused')) {
    return {
      summary: `Job "${jobType}" could not connect to a required service after ${attempts} attempts.`,
      rootCause: 'A downstream dependency (database, API, or cache) is unreachable.',
      recommendation: 'Verify that all required services are running and accessible from the worker nodes.',
      severity: 'high',
    };
  }
  if (errorLower.includes('out of memory') || errorLower.includes('heap')) {
    return {
      summary: `Job "${jobType}" crashed due to an out-of-memory condition.`,
      rootCause: 'The job payload may be too large or the worker node has insufficient memory.',
      recommendation: 'Increase worker memory limits or split the job into smaller batch jobs.',
      severity: 'critical',
    };
  }
  if (errorLower.includes('permission denied') || errorLower.includes('access denied') || errorLower.includes('unauthorized')) {
    return {
      summary: `Job "${jobType}" failed due to an authorization or permissions error.`,
      rootCause: 'The worker lacks the required credentials or permissions to access a resource.',
      recommendation: 'Review and update API keys, IAM roles, or database permissions for the worker service.',
      severity: 'high',
    };
  }
  if (errorLower.includes('syntax') || errorLower.includes('parse') || errorLower.includes('invalid json')) {
    return {
      summary: `Job "${jobType}" encountered a data format error.`,
      rootCause: 'The job payload or an upstream API response contains invalid or malformed data.',
      recommendation: 'Validate job payload schemas before submission and add input sanitization.',
      severity: 'medium',
    };
  }
  if (attempts >= maxAttempts) {
    return {
      summary: `Job "${jobType}" exhausted all ${maxAttempts} retry attempts and was moved to the Dead Letter Queue.`,
      rootCause: 'Persistent failure across all attempts suggests a systematic error rather than a transient issue.',
      recommendation: 'Review error logs in detail, fix the underlying issue, and use the DLQ retry feature to reprocess.',
      severity: 'high',
    };
  }
  return {
    summary: `Job "${jobType}" failed with an unrecognized error after ${attempts} attempt(s).`,
    rootCause: error || 'Unknown error — check execution logs for details.',
    recommendation: 'Review the execution logs and error stack trace for detailed information.',
    severity: 'medium',
  };
}
