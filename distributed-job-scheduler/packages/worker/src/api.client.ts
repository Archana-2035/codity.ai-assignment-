import axios from 'axios';
import { logger } from './logger';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3000/api/v1';

const client = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

export interface ClaimedJob {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  priority: number;
  attemptCount: number;
  maxAttempts: number;
  queueId: string;
  projectId: string;
  executionId: string;
}

export async function registerWorker(data: {
  hostname: string;
  pid: number;
  queueIds: string[];
  concurrency: number;
  version: string;
}): Promise<{ id: string }> {
  const response = await client.post('/workers', data);
  return response.data.data;
}

export async function sendHeartbeat(
  workerId: string,
  status: string,
  currentJobCount: number
): Promise<void> {
  await client.post(`/workers/${workerId}/heartbeat`, { status, currentJobCount });
}

export async function claimJob(
  workerId: string,
  queueIds: string[]
): Promise<ClaimedJob | null> {
  const response = await client.post(`/workers/${workerId}/claim`, { queueIds });
  if (response.status === 204) return null;
  return response.data.data;
}

export async function completeJob(
  workerId: string,
  jobId: string,
  executionId: string,
  result: unknown,
  logs: Array<{ level: string; message: string; metadata?: unknown; loggedAt?: Date }>
): Promise<void> {
  await client.post(`/workers/${workerId}/jobs/${jobId}/complete`, {
    executionId,
    result,
    logs,
  });
}

export async function failJob(
  workerId: string,
  jobId: string,
  executionId: string,
  errorMessage: string,
  errorStack: string,
  logs: Array<{ level: string; message: string; metadata?: unknown; loggedAt?: Date }>
): Promise<void> {
  await client.post(`/workers/${workerId}/jobs/${jobId}/fail`, {
    executionId,
    errorMessage,
    errorStack,
    logs,
  });
}

export async function deregisterWorker(workerId: string): Promise<void> {
  await client.delete(`/workers/${workerId}`);
}
