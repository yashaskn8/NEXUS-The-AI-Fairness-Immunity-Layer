import { Request, Response, NextFunction } from "express";
import Redis from "ioredis";
import winston from "winston";
import { ProblemDetails } from "../schemas";

const logger = winston.createLogger({
  level: process.env["LOG_LEVEL"] ?? "info",
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

/**
 * Redis sliding window rate limiter using sorted sets.
 *
 * Free tier: 1,000 req/hour, 100 req/minute burst
 * Pro tier: 100,000 req/hour, 5,000 req/minute burst
 * Enterprise: unlimited
 */
export function createRateLimiter(redis: Redis): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.nexus) {
      next();
      return;
    }

    const { orgId, tier, rateLimit } = req.nexus;

    // Enterprise tier: unlimited
    if (tier === "enterprise") {
      next();
      return;
    }

    const now = Date.now();
    const hourKey = `nexus:ratelimit:hour:${orgId}`;
    const minuteKey = `nexus:ratelimit:minute:${orgId}`;

    try {
      // Check hourly limit using sorted set
      const hourWindowStart = now - 3600_000; // 1 hour ago
      const minuteWindowStart = now - 60_000; // 1 minute ago

      // Use pipeline for atomic operations
      const pipeline = redis.pipeline();

      // Remove old entries and count current entries for hourly window
      pipeline.zremrangebyscore(hourKey, 0, hourWindowStart);
      pipeline.zcard(hourKey);

      // Remove old entries and count current entries for minute window
      pipeline.zremrangebyscore(minuteKey, 0, minuteWindowStart);
      pipeline.zcard(minuteKey);

      const results = await pipeline.exec();
      if (!results) {
        next();
        return;
      }

      const hourCount = (results[1]?.[1] as number | undefined) ?? 0;
      const minuteCount = (results[3]?.[1] as number | undefined) ?? 0;

      // Check hourly limit
      if (hourCount >= rateLimit.hourly) {
        const retryAfterSeconds = Math.ceil((3600_000 - (now - hourWindowStart)) / 1000);
        const problem: ProblemDetails = {
          type: "https://api.nexus.ai/errors/rate-limit-exceeded",
          title: "Rate Limit Exceeded",
          status: 429,
          detail: `Hourly rate limit of ${rateLimit.hourly} requests exceeded for ${tier} tier. Try again in ${retryAfterSeconds} seconds.`,
          instance: req.originalUrl,
        };
        res.set("Retry-After", String(retryAfterSeconds));
        res.status(429).json(problem);
        logger.warn("Hourly rate limit exceeded", { orgId, tier, hourCount, limit: rateLimit.hourly });
        return;
      }

      // Check minute burst limit
      if (minuteCount >= rateLimit.burstPerMinute) {
        const retryAfterSeconds = Math.ceil((60_000 - (now - minuteWindowStart)) / 1000);
        const problem: ProblemDetails = {
          type: "https://api.nexus.ai/errors/rate-limit-exceeded",
          title: "Rate Limit Exceeded",
          status: 429,
          detail: `Burst rate limit of ${rateLimit.burstPerMinute} requests/minute exceeded for ${tier} tier. Try again in ${retryAfterSeconds} seconds.`,
          instance: req.originalUrl,
        };
        res.set("Retry-After", String(retryAfterSeconds));
        res.status(429).json(problem);
        logger.warn("Burst rate limit exceeded", { orgId, tier, minuteCount, limit: rateLimit.burstPerMinute });
        return;
      }

      // Add current request to both sorted sets (score=timestamp, member=unique id)
      const requestId = `${now}:${Math.random().toString(36).slice(2, 10)}`;
      const addPipeline = redis.pipeline();
      addPipeline.zadd(hourKey, now, `h:${requestId}`);
      addPipeline.expire(hourKey, 3600);
      addPipeline.zadd(minuteKey, now, `m:${requestId}`);
      addPipeline.expire(minuteKey, 60);
      await addPipeline.exec();

      // Set rate limit headers
      res.set("X-RateLimit-Limit-Hour", String(rateLimit.hourly));
      res.set("X-RateLimit-Remaining-Hour", String(Math.max(0, rateLimit.hourly - hourCount - 1)));
      res.set("X-RateLimit-Limit-Minute", String(rateLimit.burstPerMinute));
      res.set("X-RateLimit-Remaining-Minute", String(Math.max(0, rateLimit.burstPerMinute - minuteCount - 1)));

      next();
    } catch (error) {
      // On Redis failure, allow the request through (fail open)
      logger.error("Rate limiter Redis error — failing open", { orgId, error: String(error) });
      next();
    }
  };
}
