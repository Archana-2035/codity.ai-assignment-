import { RetryStrategy } from '@djs/shared';

export interface RetryPolicyConfig {
  strategy: RetryStrategy;
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  jitter: boolean;
}

/**
 * Calculate the delay before the next retry attempt.
 * Uses the configured strategy with optional jitter to prevent thundering herd.
 */
export function calculateRetryDelay(
  policy: RetryPolicyConfig,
  attemptNumber: number // 1-based attempt number that just failed
): number {
  const { strategy, initialDelayMs, maxDelayMs, multiplier, jitter } = policy;
  let delay: number;

  switch (strategy) {
    case RetryStrategy.FIXED:
      delay = initialDelayMs;
      break;

    case RetryStrategy.LINEAR:
      // delay = initial + (attempt - 1) * initial
      delay = initialDelayMs * attemptNumber;
      break;

    case RetryStrategy.EXPONENTIAL:
    default:
      // delay = initial * multiplier^(attempt-1)
      delay = initialDelayMs * Math.pow(multiplier, attemptNumber - 1);
      break;
  }

  // Cap at max delay
  delay = Math.min(delay, maxDelayMs);

  // Add jitter: ±25% random variance to prevent thundering herd
  if (jitter) {
    const variance = delay * 0.25;
    delay = delay + (Math.random() * variance * 2 - variance);
    delay = Math.max(0, Math.round(delay));
  }

  return Math.round(delay);
}

/**
 * Calculate the absolute timestamp when the job should next be retried
 */
export function calculateNextRunAt(policy: RetryPolicyConfig, attemptNumber: number): Date {
  const delayMs = calculateRetryDelay(policy, attemptNumber);
  return new Date(Date.now() + delayMs);
}

/**
 * Determine if a job should be retried or sent to DLQ
 */
export function shouldRetry(
  policy: RetryPolicyConfig,
  attemptCount: number
): boolean {
  return attemptCount < policy.maxAttempts;
}
