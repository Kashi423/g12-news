/**
 * Limits failed sign-in attempts per client (in memory: fine for one server process, and a restart
 * only forgives, never locks anybody out). scrypt already makes every guess cost ~50 ms; this stops
 * a script from making thousands of them.
 */
export interface Limiter {
  /** How many milliseconds until `key` may try again (0 = allowed now). */
  wait(key: string, now?: number): number;
  fail(key: string, now?: number): void;
  reset(key: string): void;
}

export function createLimiter({ maxFailures, windowMs, lockMs }: { maxFailures: number; windowMs: number; lockMs: number }): Limiter {
  const state = new Map<string, { failures: number[]; lockedUntil: number }>();
  return {
    wait(key, now = Date.now()) {
      const entry = state.get(key);
      if (!entry) return 0;
      if (entry.lockedUntil > now) return entry.lockedUntil - now;
      entry.failures = entry.failures.filter((t) => now - t < windowMs);
      if (entry.failures.length === 0) state.delete(key);
      return 0;
    },
    fail(key, now = Date.now()) {
      const entry = state.get(key) ?? { failures: [], lockedUntil: 0 };
      entry.failures = entry.failures.filter((t) => now - t < windowMs);
      entry.failures.push(now);
      if (entry.failures.length >= maxFailures) {
        entry.lockedUntil = now + lockMs;
        entry.failures = [];
      }
      state.set(key, entry);
      // Keep the map from growing without bound under a scan from many addresses.
      if (state.size > 1000) for (const [k, v] of state) if (v.lockedUntil < now && v.failures.every((t) => now - t >= windowMs)) state.delete(k);
    },
    reset(key) {
      state.delete(key);
    },
  };
}
