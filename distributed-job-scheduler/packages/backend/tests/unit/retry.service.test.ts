import { calculateRetryDelay, shouldRetry, RetryPolicyConfig } from '../../src/jobs/retry.service';
import { RetryStrategy } from '@djs/shared';

describe('Retry Service Unit Tests', () => {
  const basePolicy: RetryPolicyConfig = {
    strategy: RetryStrategy.FIXED,
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    multiplier: 2,
    jitter: false,
  };

  describe('calculateRetryDelay', () => {
    it('should return fixed initial delay for FIXED strategy', () => {
      const policy = { ...basePolicy, strategy: RetryStrategy.FIXED };
      expect(calculateRetryDelay(policy, 1)).toBe(1000);
      expect(calculateRetryDelay(policy, 2)).toBe(1000);
      expect(calculateRetryDelay(policy, 3)).toBe(1000);
    });

    it('should return linear delay for LINEAR strategy', () => {
      const policy = { ...basePolicy, strategy: RetryStrategy.LINEAR };
      expect(calculateRetryDelay(policy, 1)).toBe(1000); // 1000 * 1
      expect(calculateRetryDelay(policy, 2)).toBe(2000); // 1000 * 2
      expect(calculateRetryDelay(policy, 3)).toBe(3000); // 1000 * 3
    });

    it('should return exponential delay for EXPONENTIAL strategy', () => {
      const policy = { ...basePolicy, strategy: RetryStrategy.EXPONENTIAL };
      expect(calculateRetryDelay(policy, 1)).toBe(1000); // 1000 * 2^0
      expect(calculateRetryDelay(policy, 2)).toBe(2000); // 1000 * 2^1
      expect(calculateRetryDelay(policy, 3)).toBe(4000); // 1000 * 2^2
      expect(calculateRetryDelay(policy, 4)).toBe(8000); // 1000 * 2^3
    });

    it('should cap delay at maxDelayMs', () => {
      const policy = { 
        ...basePolicy, 
        strategy: RetryStrategy.EXPONENTIAL, 
        initialDelayMs: 2000,
        maxDelayMs: 5000 
      };
      expect(calculateRetryDelay(policy, 1)).toBe(2000); // 2000
      expect(calculateRetryDelay(policy, 2)).toBe(4000); // 4000
      expect(calculateRetryDelay(policy, 3)).toBe(5000); // 8000 capped to 5000
    });

    it('should apply jitter within 25% range if enabled', () => {
      const policy = { ...basePolicy, jitter: true };
      const delay = calculateRetryDelay(policy, 1);
      // initialDelay is 1000. Jitter is +/-25%, so delay should be between 750 and 1250.
      expect(delay).toBeGreaterThanOrEqual(750);
      expect(delay).toBeLessThanOrEqual(1250);
    });
  });

  describe('shouldRetry', () => {
    it('should return true if attemptCount is less than maxAttempts', () => {
      expect(shouldRetry(basePolicy, 1)).toBe(true);
      expect(shouldRetry(basePolicy, 2)).toBe(true);
    });

    it('should return false if attemptCount equals or exceeds maxAttempts', () => {
      expect(shouldRetry(basePolicy, 3)).toBe(false);
      expect(shouldRetry(basePolicy, 4)).toBe(false);
    });
  });
});
