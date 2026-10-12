import { ApiError, getClientIp } from "@/server/utils/api";

/**
 * Lightweight fixed-window rate limiter (per-process memory).
 * Suitable for this single-instance demo deployment; a production system
 * would back this with Redis.
 */
const windows = new Map<string, number[]>();

export interface RateLimitOptions {
  /** Max attempts inside the window. */
  limit: number;
  /** Window length, milliseconds. */
  windowMs: number;
  /** Extra discriminator, e.g. email or user id. */
  scope?: string;
}

export function rateLimitOrThrow(req: Request, bucket: string, opts: RateLimitOptions): void {
  const key = `${bucket}:${opts.scope ?? ""}:${getClientIp(req)}`;
  const now = Date.now();
  const hits = (windows.get(key) ?? []).filter((t) => now - t < opts.windowMs);
  if (hits.length >= opts.limit) {
    windows.set(key, hits);
    const retryAfterSec = Math.max(1, Math.ceil((hits[0]! + opts.windowMs - now) / 1000));
    throw new ApiError(
      429,
      "RATE_LIMITED",
      `Too many attempts. Please wait ${retryAfterSec}s and try again.`,
      { retryAfterSec },
    );
  }
  hits.push(now);
  windows.set(key, hits);

  // Opportunistic cleanup so the map never grows unbounded.
  if (windows.size > 5000) {
    for (const [k, arr] of windows) {
      const kept = arr.filter((t) => now - t < opts.windowMs * 2);
      if (kept.length === 0) windows.delete(k);
      else windows.set(k, kept);
    }
  }
}
