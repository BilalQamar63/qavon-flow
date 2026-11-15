import type { NextFunction, Request, Response } from 'express';

interface Bucket {
  timestamps: number[];
  windowMs: number;
}

const buckets = new Map<string, Bucket>();
const PRUNE_THRESHOLD = 500;
const MAX_BUCKETS = 2000;

function pruneExpiredBuckets(now: number): void {
  for (const [k, bucket] of buckets.entries()) {
    const cutoff = now - bucket.windowMs;
    const active = bucket.timestamps.filter((t) => t > cutoff);
    if (active.length === 0) {
      buckets.delete(k);
    } else {
      bucket.timestamps = active;
    }
  }
  while (buckets.size > MAX_BUCKETS) {
    const oldestKey = buckets.keys().next().value;
    if (oldestKey === undefined) break;
    buckets.delete(oldestKey);
  }
}

export function createRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
  keyResolver?: (req: Request) => string | null;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const customPart = options.keyResolver?.(req);
    const key = customPart ? `${options.keyPrefix}:${ip}:${customPart}` : `${options.keyPrefix}:${ip}`;
    const now = Date.now();
    const cutoff = now - options.windowMs;

    if (buckets.size > PRUNE_THRESHOLD) {
      pruneExpiredBuckets(now);
    }

    const existing = buckets.get(key) || { timestamps: [], windowMs: options.windowMs };
    existing.timestamps = existing.timestamps.filter((t) => t > cutoff);
    existing.windowMs = options.windowMs;

    if (existing.timestamps.length >= options.maxRequests) {
      buckets.set(key, existing);
      res.status(429).json({
        error: 'Too many requests. Please wait a moment before trying again.',
      });
      return;
    }

    existing.timestamps.push(now);
    // Refresh insertion order so active keys aren't evicted before stale ones
    buckets.delete(key);
    buckets.set(key, existing);
    next();
  };
}
