// A provider may ask us to wait longer than this reference permits.
// Never silently retry earlier than a valid provider Retry-After bound.
export const MAX_RETRY_DELAY_MS = 30_000;

export function parseRetryAfter(value: string | null, nowMs = Date.now()): number | null {
  if (value === null) return null;
  const raw = value.trim();
  if (/^\d+$/.test(raw)) {
    const seconds = Number(raw);
    if (!Number.isFinite(seconds) || seconds > MAX_RETRY_DELAY_MS / 1000)
      return MAX_RETRY_DELAY_MS + 1;
    return seconds * 1000;
  }
  if (!/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(raw))
    return null;
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp) || !Number.isFinite(nowMs)) return null;
  return Math.min(MAX_RETRY_DELAY_MS + 1, Math.max(0, Math.ceil(timestamp - nowMs)));
}

export class HttpError extends Error {
  constructor(readonly status: number, readonly retryAfterMs: number | null = null) {
    super("Downstream HTTP failure");
    this.name = "HttpError";
  }
}
export class TransientError extends Error {
  constructor() { super("Downstream transport failure"); this.name = "TransientError"; }
}
export function isRetryable(error: unknown): boolean {
  return error instanceof TransientError || (error instanceof HttpError &&
    (error.status === 408 || error.status === 429 || (error.status >= 500 && error.status <= 599)) &&
    (error.retryAfterMs === null || error.retryAfterMs <= MAX_RETRY_DELAY_MS));
}
export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: {
    maxAttempts?: number; baseDelayMs?: number;
    sleep?: (ms: number) => Promise<void>; random?: () => number;
    onRetry?: (attempt: number) => void;
  } = {},
): Promise<T> {
  const attempts = options.maxAttempts ?? 3;
  const base = options.baseDelayMs ?? 150;
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 5 ||
      !Number.isFinite(base) || base < 0 || base > 30000) throw new RangeError("Invalid retry options");
  const sleep = options.sleep ?? ((ms) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const random = options.random ?? Math.random;
  for (let attempt = 1; ; attempt++) {
    try { return await operation(attempt); }
    catch (error) {
      if (!isRetryable(error) || attempt >= attempts) throw error;
      const exponential = Math.min(base * 2 ** (attempt - 1), 30000);
      const sample = random();
      if (!Number.isFinite(sample) || sample < 0 || sample >= 1) throw new RangeError("Invalid jitter");
      options.onRetry?.(attempt);
      const jittered = Math.min(MAX_RETRY_DELAY_MS, exponential + Math.floor(exponential * 0.25 * sample));
      // Delay for at least the provider's hint; an over-budget hint has
      // already been classified non-retryable and must not be shortened.
      const providerHint = error instanceof HttpError ? (error.retryAfterMs ?? 0) : 0;
      await sleep(Math.max(jittered, providerHint));
    }
  }
}
