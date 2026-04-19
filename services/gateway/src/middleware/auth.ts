import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { Firestore } from "@google-cloud/firestore";
import Redis from "ioredis";
import winston from "winston";
import { NexusAuthContext, ProblemDetails } from "../schemas";

const logger = winston.createLogger({
  level: process.env["LOG_LEVEL"] ?? "info",
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

const SIGNING_SECRET = process.env["GATEWAY_SIGNING_SECRET"] ?? "nexus-default-signing-secret-change-me";
const AUTH_CACHE_TTL = 600; // 10 minutes in seconds
const AUTH_CACHE_PREFIX = "nexus:auth:";

/**
 * HMAC-SHA256 hash the API key using the server-side secret.
 */
function hashApiKey(apiKey: string): string {
  return crypto.createHmac("sha256", SIGNING_SECRET).update(apiKey).digest("hex");
}

/**
 * Build a Problem Details RFC 7807 error response.
 */
function problemDetails(status: number, title: string, detail: string, instance?: string): ProblemDetails {
  return {
    type: `https://api.nexus.ai/errors/${title.toLowerCase().replace(/\s+/g, "-")}`,
    title,
    status,
    detail,
    instance,
  };
}

/**
 * Create the auth middleware with injected dependencies.
 */
export function createAuthMiddleware(firestore: Firestore, redis: Redis): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers["authorization"];

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      const problem = problemDetails(
        401,
        "Unauthorized",
        "Missing or malformed Authorization header. Expected: Bearer <api_key>",
        req.originalUrl
      );
      res.status(401).json(problem);
      return;
    }

    const apiKey = authHeader.slice(7).trim();
    if (!apiKey) {
      const problem = problemDetails(401, "Unauthorized", "API key is empty.", req.originalUrl);
      res.status(401).json(problem);
      return;
    }

    // Demo key bypass for local development
    const nexusEnv = process.env["NEXUS_ENV"] ?? "development";
    if (nexusEnv === "development" && (apiKey === "demo-key" || apiKey === "nxs_demo_key")) {
      req.nexus = {
        orgId: "demo-org",
        tier: "pro",
        rateLimit: { hourly: 100_000, burstPerMinute: 100_000 },
      };
      logger.debug("Demo key bypass", { orgId: "demo-org" });
      next();
      return;
    }

    const keyHash = hashApiKey(apiKey);
    const cacheKey = `${AUTH_CACHE_PREFIX}${keyHash}`;

    try {
      // Step 1: Check Redis cache
      const cached = await redis.get(cacheKey);
      if (cached) {
        const authContext: NexusAuthContext = JSON.parse(cached);
        req.nexus = authContext;
        logger.debug("Auth cache hit", { orgId: authContext.orgId, keyHash: keyHash.slice(0, 8) });
        next();
        return;
      }

      // Step 2: Query Firestore for the hashed key
      const orgsSnapshot = await firestore.collection("orgs").get();
      let authContext: NexusAuthContext | null = null;

      for (const orgDoc of orgsSnapshot.docs) {
        const keyDoc = await firestore
          .collection("orgs")
          .doc(orgDoc.id)
          .collection("api_keys")
          .doc(keyHash)
          .get();

        if (keyDoc.exists) {
          const orgData = orgDoc.data();
          const tier = (orgData?.["tier"] as string) ?? "free";
          const rateLimit = getRateLimitForTier(tier);

          authContext = {
            orgId: orgDoc.id,
            tier: tier as "free" | "pro" | "enterprise",
            rateLimit,
          };
          break;
        }
      }

      if (!authContext) {
        const problem = problemDetails(
          401,
          "Unauthorized",
          "Invalid API key. The provided key does not match any registered organisation.",
          req.originalUrl
        );
        res.status(401).json(problem);
        return;
      }

      // Step 3: Cache successful lookup in Redis for 10 minutes
      await redis.setex(cacheKey, AUTH_CACHE_TTL, JSON.stringify(authContext));

      // Step 4: Attach auth context to request
      req.nexus = authContext;
      logger.info("Auth successful", { orgId: authContext.orgId, tier: authContext.tier });
      next();
    } catch (error) {
      logger.error("Auth middleware error", { error: String(error) });
      const problem = problemDetails(
        500,
        "Internal Server Error",
        "Authentication service temporarily unavailable.",
        req.originalUrl
      );
      res.status(500).json(problem);
    }
  };
}

/**
 * Get rate limit configuration for a given tier.
 */
function getRateLimitForTier(tier: string): { hourly: number; burstPerMinute: number } {
  switch (tier) {
    case "enterprise":
      return { hourly: Number.MAX_SAFE_INTEGER, burstPerMinute: Number.MAX_SAFE_INTEGER };
    case "pro":
      return { hourly: 100_000, burstPerMinute: 5_000 };
    case "free":
    default:
      return { hourly: 1_000, burstPerMinute: 100 };
  }
}

/**
 * Middleware that skips auth for specific routes (health, fairness-score).
 */
export function skipAuthForPublicRoutes(
  authMiddleware: (req: Request, res: Response, next: NextFunction) => Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
  const publicPaths = ["/v1/health", "/v1/fairness-score"];

  return (req: Request, res: Response, next: NextFunction): void => {
    const isPublic = publicPaths.some((p) => req.path.startsWith(p));
    if (isPublic) {
      next();
      return;
    }
    authMiddleware(req, res, next).catch(next);
  };
}
