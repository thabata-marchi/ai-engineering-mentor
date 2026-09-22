// ============================================================================
//  RateLimiter — SLIDING-WINDOW rate limiter (Step 12 — security)
// ============================================================================
//
//  WHAT IS IT FOR?
//  Protecting your provider QUOTA (remember the free-tier 429s?) and containing an
//  agent that "goes crazy" calling tools in a loop. It's a LOCAL, cheap barrier:
//  before hitting the API, we count how many calls happened in the last time window;
//  if it's over the limit, we refuse with a clear error.
//
//  WHY A "SLIDING WINDOW"?
//  We keep the timestamp of each recent call. On every new call, we drop the ones
//  that already left the window (e.g. older than 60s) and count the rest. It's fairer
//  than "reset every full minute" (which would allow bursts at the boundary).
//
//  DESIGN: it's PURE and deterministic — the "clock" is injectable (`now`), so tests
//  control time without actually waiting. It lives in the core: it knows nothing
//  about the LLM or the network; the adapters' DECORATORS apply it.
// ============================================================================

/** Error thrown when the call limit is exceeded. */
export class RateLimitError extends Error {
  readonly retryAfterMs: number; // how long to wait until it frees up again
  constructor(retryAfterMs: number) {
    super(
      `Rate limit exceeded. Try again in ~${Math.ceil(retryAfterMs / 1000)}s. ` +
        '(protects your provider quota — tune via RATE_LIMIT_MAX/RATE_LIMIT_WINDOW_MS)',
    );
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

export interface RateLimiterConfig {
  readonly max: number; // maximum calls allowed per window
  readonly windowMs: number; // window size in ms
  readonly now?: () => number; // injectable clock (default: Date.now) — eases testing
}

export class RateLimiter {
  private readonly max: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly hits: number[] = []; // timestamps of recent calls (ms)

  constructor(config: RateLimiterConfig) {
    if (config.max <= 0) throw new Error('RateLimiter: max must be > 0');
    if (config.windowMs <= 0) throw new Error('RateLimiter: windowMs must be > 0');
    this.max = config.max;
    this.windowMs = config.windowMs;
    this.now = config.now ?? Date.now;
  }

  /**
   * Records a call if there's room in the window; otherwise throws RateLimitError.
   * It first drops the records that already left the window.
   */
  acquire(): void {
    const nowMs = this.now();
    this.prune(nowMs);
    if (this.hits.length >= this.max) {
      // The window frees up when the OLDEST record expires.
      const oldest = this.hits[0];
      const retryAfterMs = oldest + this.windowMs - nowMs;
      throw new RateLimitError(Math.max(0, retryAfterMs));
    }
    this.hits.push(nowMs);
  }

  /** How many calls still fit in the current window (useful for logs/tests). */
  remaining(): number {
    this.prune(this.now());
    return Math.max(0, this.max - this.hits.length);
  }

  /** Removes the records that already left the sliding window. */
  private prune(nowMs: number): void {
    const cutoff = nowMs - this.windowMs;
    while (this.hits.length > 0 && this.hits[0] <= cutoff) {
      this.hits.shift();
    }
  }
}
