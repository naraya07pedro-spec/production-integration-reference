export class HttpError extends Error {
  constructor(readonly status: number) {
    super("Downstream HTTP failure");
    this.name = "HttpError";
  }
}
export class TransientError extends Error {
  constructor() { super("Downstream transport failure"); this.name = "TransientError"; }
}
export function isRetryable(error: unknown): boolean {
  return error instanceof TransientError || (error instanceof HttpError &&
    (error.status === 408 || error.status === 429 || (error.status >= 500 && error.status <= 599)));
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
      await sleep(Math.min(30000, exponential + Math.floor(exponential * 0.25 * sample)));
    }
  }
}
