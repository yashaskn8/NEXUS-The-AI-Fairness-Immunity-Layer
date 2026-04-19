import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import { Firestore } from "@google-cloud/firestore";
import Redis from "ioredis";
import winston from "winston";

import {
  DecisionEventSchema,
  CreateOrgSchema,
  ReportGenerateSchema,
  PaginationSchema,
  ProblemDetails,
  HealthResponse,
} from "./schemas";
import { createAuthMiddleware, skipAuthForPublicRoutes } from "./middleware/auth";
import { createRateLimiter } from "./middleware/rateLimiter";
import { createInterceptRouter } from "./routes/intercept";
import { PubSubService } from "./services/pubsub";

// ═══════════════════════════════════════════════════════
// Logger
// ═══════════════════════════════════════════════════════

const logger = winston.createLogger({
  level: process.env["LOG_LEVEL"] ?? "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: "nexus-gateway" },
  transports: [new winston.transports.Console()],
});

// ═══════════════════════════════════════════════════════
// Infrastructure clients
// ═══════════════════════════════════════════════════════

const firestore = new Firestore({
  projectId: process.env["GOOGLE_CLOUD_PROJECT"] ?? "nexus-platform",
});

const redis = new Redis({
  host: process.env["REDIS_HOST"] ?? "localhost",
  port: parseInt(process.env["REDIS_PORT"] ?? "6379", 10),
  maxRetriesPerRequest: 3,
  retryStrategy(times: number): number | null {
    if (times > 10) return null;
    return Math.min(times * 100, 3000);
  },
});

redis.on("error", (err) => logger.error("Redis connection error", { error: String(err) }));
redis.on("connect", () => logger.info("Connected to Redis"));

const pubsubService = new PubSubService();

// ═══════════════════════════════════════════════════════
// Express App
// ═══════════════════════════════════════════════════════

const app = express();
const PORT = parseInt(process.env["GATEWAY_PORT"] ?? "8080", 10);
const VERSION = "1.0.0";
const startTime = Date.now();

// Global middleware
app.use(helmet());
app.use(cors({
  origin: process.env["GATEWAY_CORS_ORIGIN"] ?? "http://localhost:5173",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json({ limit: "1mb" }));

// Auth middleware (skips public routes)
const authMiddleware = createAuthMiddleware(firestore, redis);
app.use(skipAuthForPublicRoutes(authMiddleware));

// Rate limiter
const rateLimiter = createRateLimiter(redis);
app.use(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (req.path === "/v1/health" || req.path.startsWith("/v1/fairness-score")) {
    next();
    return;
  }
  await rateLimiter(req, res, next);
});

// ═══════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────
// GET /v1/health — Health check (no auth required)
// ─────────────────────────────────────────────────────
app.get("/v1/health", async (_req: Request, res: Response): Promise<void> => {
  let redisStatus: "connected" | "disconnected" = "disconnected";
  let firestoreStatus: "connected" | "disconnected" = "disconnected";
  let pubsubStatus: "connected" | "disconnected" = "connected";

  try {
    await redis.ping();
    redisStatus = "connected";
  } catch {
    /* redis down */
  }

  try {
    await firestore.listCollections();
    firestoreStatus = "connected";
  } catch {
    /* firestore down */
  }

  const allConnected = redisStatus === "connected" && firestoreStatus === "connected";

  res.status(200).json({
    status: allConnected ? "ok" : "degraded",
    version: VERSION,
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
    services: {
      redis: redisStatus,
      pubsub: pubsubStatus,
      firestore: firestoreStatus,
    },
  });
});

// ─────────────────────────────────────────────────────
// POST /v1/events — Async: receive decision event, enqueue to Pub/Sub
// ─────────────────────────────────────────────────────
app.post("/v1/events", async (req: Request, res: Response): Promise<void> => {
  const parseResult = DecisionEventSchema.safeParse(req.body);
  if (!parseResult.success) {
    const problem: ProblemDetails = {
      type: "https://api.nexus.ai/errors/validation-error",
      title: "Validation Error",
      status: 400,
      detail: parseResult.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
      instance: req.originalUrl,
    };
    res.status(400).json(problem);
    return;
  }

  const event = parseResult.data;
  const orgId = req.nexus?.orgId ?? event.org_id;
  const eventId = event.event_id ?? uuidv4();
  const timestamp = event.timestamp ?? Date.now();

  // Hash individual_id for PII protection
  const hashedIndividualId = event.individual_id
    ? crypto.createHash("sha256").update(event.individual_id).digest("hex")
    : undefined;

  try {
    const messageId = await pubsubService.publishDecisionEvent({
      orgId,
      data: {
        ...event,
        event_id: eventId,
        org_id: orgId,
        timestamp,
        individual_id: hashedIndividualId,
      },
    });

    logger.info("Decision event enqueued", { orgId, eventId, modelId: event.model_id, messageId });

    res.status(202).json({
      event_id: eventId,
      status: "queued",
      received_at_ms: timestamp,
    });
  } catch (error) {
    logger.error("Failed to enqueue decision event", {
      orgId,
      eventId,
      error: error instanceof Error ? error.message : String(error),
    });

    const problem: ProblemDetails = {
      type: "https://api.nexus.ai/errors/publish-failed",
      title: "Publish Failed",
      status: 500,
      detail: "Failed to enqueue the decision event. Please retry.",
      instance: req.originalUrl,
    };
    res.status(500).json(problem);
  }
});

// ─────────────────────────────────────────────────────
// POST /v1/intercept — SYNC: decision interception (200ms SLA)
// ─────────────────────────────────────────────────────
app.use("/v1/intercept", createInterceptRouter(pubsubService));

// ─────────────────────────────────────────────────────
// POST /v1/simulate — Counterfactual simulation (proxied to causal engine)
// ─────────────────────────────────────────────────────
app.post("/v1/simulate", async (req: Request, res: Response): Promise<void> => {
  const causalUrl = process.env["CAUSAL_ENGINE_URL"] ?? "http://localhost:8082";

  try {
    const response = await fetch(`${causalUrl}/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });

    if (!response.ok) {
      throw new Error(`Causal engine responded with ${response.status}`);
    }

    const result = await response.json();
    res.status(200).json(result);
  } catch (error) {
    logger.error("Simulate request failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    const problem: ProblemDetails = {
      type: "https://api.nexus.ai/errors/service-unavailable",
      title: "Service Unavailable",
      status: 503,
      detail: "Causal engine is unavailable for simulation.",
      instance: req.originalUrl,
    };
    res.status(503).json(problem);
  }
});

// ─────────────────────────────────────────────────────
// POST /v1/organisations — Create org, generate API keys
// ─────────────────────────────────────────────────────
app.post("/v1/organisations", async (req: Request, res: Response): Promise<void> => {
  const parseResult = CreateOrgSchema.safeParse(req.body);
  if (!parseResult.success) {
    const problem: ProblemDetails = {
      type: "https://api.nexus.ai/errors/validation-error",
      title: "Validation Error",
      status: 400,
      detail: parseResult.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
      instance: req.originalUrl,
    };
    res.status(400).json(problem);
    return;
  }

  const orgData = parseResult.data;
  const orgId = uuidv4();
  const apiKey = `nxs_${crypto.randomBytes(32).toString("hex")}`;
  const signingSecret = process.env["GATEWAY_SIGNING_SECRET"] ?? "nexus-default-signing-secret-change-me";
  const keyHash = crypto.createHmac("sha256", signingSecret).update(apiKey).digest("hex");

  try {
    const batch = firestore.batch();

    // Create organisation document
    const orgRef = firestore.collection("orgs").doc(orgId);
    batch.set(orgRef, {
      name: orgData.name,
      tier: orgData.tier,
      domain: orgData.domain ?? null,
      compliance_contact_email: orgData.compliance_contact_email ?? null,
      created_at_ms: Date.now(),
      models: [],
    });

    // Create API key document (hashed)
    const keyRef = orgRef.collection("api_keys").doc(keyHash);
    batch.set(keyRef, {
      created_at_ms: Date.now(),
      last_used_ms: null,
      active: true,
    });

    await batch.commit();

    logger.info("Organisation created", { orgId, name: orgData.name, tier: orgData.tier });

    res.status(201).json({
      org_id: orgId,
      name: orgData.name,
      tier: orgData.tier,
      api_key: apiKey,
      topic: `nexus-decisions-${orgId}`,
      created_at: new Date().toISOString(),
      message: "Store your API key securely. It will not be shown again.",
    });
  } catch (error) {
    logger.error("Failed to create organisation", {
      error: error instanceof Error ? error.message : String(error),
    });
    const problem: ProblemDetails = {
      type: "https://api.nexus.ai/errors/create-org-failed",
      title: "Organisation Creation Failed",
      status: 500,
      detail: "Failed to create organisation. Please retry.",
      instance: req.originalUrl,
    };
    res.status(500).json(problem);
  }
});

// ─────────────────────────────────────────────────────
// GET /v1/organisations/:orgId/metrics — Live metric snapshot
// ─────────────────────────────────────────────────────
app.get("/v1/organisations/:orgId/metrics", async (req: Request, res: Response): Promise<void> => {
  const { orgId } = req.params;

  if (req.nexus && req.nexus.orgId !== orgId) {
    const problem: ProblemDetails = {
      type: "https://api.nexus.ai/errors/forbidden",
      title: "Forbidden",
      status: 403,
      detail: "You can only access metrics for your own organisation.",
      instance: req.originalUrl,
    };
    res.status(403).json(problem);
    return;
  }

  try {
    const metricsSnapshot = await firestore
      .collection("orgs")
      .doc(orgId!)
      .collection("fairness_metrics")
      .orderBy("computed_at_ms", "desc")
      .limit(50)
      .get();

    const metrics = metricsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json({
      org_id: orgId,
      metrics,
      count: metrics.length,
      as_of: Date.now(),
    });
  } catch (error) {
    logger.error("Failed to fetch metrics", { orgId, error: String(error) });
    const problem: ProblemDetails = {
      type: "https://api.nexus.ai/errors/fetch-failed",
      title: "Fetch Failed",
      status: 500,
      detail: "Failed to retrieve metrics.",
      instance: req.originalUrl,
    };
    res.status(500).json(problem);
  }
});

// ─────────────────────────────────────────────────────
// GET /v1/organisations/:orgId/forecast — Bias forecasts
// ─────────────────────────────────────────────────────
app.get("/v1/organisations/:orgId/forecast", async (req: Request, res: Response): Promise<void> => {
  const { orgId } = req.params;

  try {
    const forecastsSnapshot = await firestore
      .collection("orgs")
      .doc(orgId!)
      .collection("forecasts")
      .orderBy("computed_at_ms", "desc")
      .limit(20)
      .get();

    const forecasts = forecastsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json({
      org_id: orgId,
      forecasts,
      count: forecasts.length,
    });
  } catch (error) {
    logger.error("Failed to fetch forecasts", { orgId, error: String(error) });
    const problem: ProblemDetails = {
      type: "https://api.nexus.ai/errors/fetch-failed",
      title: "Fetch Failed",
      status: 500,
      detail: "Failed to retrieve forecasts.",
      instance: req.originalUrl,
    };
    res.status(500).json(problem);
  }
});

// ─────────────────────────────────────────────────────
// GET /v1/organisations/:orgId/audit — Paginated audit records
// ─────────────────────────────────────────────────────
app.get("/v1/organisations/:orgId/audit", async (req: Request, res: Response): Promise<void> => {
  const { orgId } = req.params;

  const paginationResult = PaginationSchema.safeParse(req.query);
  const { page, limit } = paginationResult.success
    ? paginationResult.data
    : { page: 1, limit: 20 };

  try {
    const offset = (page - 1) * limit;
    const auditSnapshot = await firestore
      .collection("audit_chain")
      .doc(orgId!)
      .collection("records")
      .orderBy("timestamp", "desc")
      .offset(offset)
      .limit(limit)
      .get();

    const records = auditSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Get total count
    const countSnapshot = await firestore
      .collection("audit_chain")
      .doc(orgId!)
      .collection("records")
      .count()
      .get();

    const totalCount = countSnapshot.data().count;

    res.status(200).json({
      org_id: orgId,
      records,
      pagination: {
        page,
        limit,
        total: totalCount,
        total_pages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    logger.error("Failed to fetch audit records", { orgId, error: String(error) });
    const problem: ProblemDetails = {
      type: "https://api.nexus.ai/errors/fetch-failed",
      title: "Fetch Failed",
      status: 500,
      detail: "Failed to retrieve audit records.",
      instance: req.originalUrl,
    };
    res.status(500).json(problem);
  }
});

// ─────────────────────────────────────────────────────
// POST /v1/reports/generate — Trigger PDF report generation
// ─────────────────────────────────────────────────────
app.post("/v1/reports/generate", async (req: Request, res: Response): Promise<void> => {
  const parseResult = ReportGenerateSchema.safeParse(req.body);
  if (!parseResult.success) {
    const problem: ProblemDetails = {
      type: "https://api.nexus.ai/errors/validation-error",
      title: "Validation Error",
      status: 400,
      detail: parseResult.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
      instance: req.originalUrl,
    };
    res.status(400).json(problem);
    return;
  }

  const { org_id, model_id, period_start, period_end } = parseResult.data;
  const reportId = uuidv4();

  try {
    // Trigger report generation asynchronously via Pub/Sub
    const remediationUrl = process.env["REMEDIATION_URL"] ?? "http://localhost:8085";
    const response = await fetch(`${remediationUrl}/generate-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        report_id: reportId,
        org_id,
        model_id,
        period_start,
        period_end,
      }),
    });

    if (!response.ok) {
      throw new Error(`Remediation service responded with ${response.status}`);
    }

    const result = (await response.json()) as Record<string, unknown>;

    logger.info("Report generation triggered", { reportId, orgId: org_id, modelId: model_id });

    res.status(202).json({
      report_id: reportId,
      status: "generating",
      ...result,
    });
  } catch (error) {
    logger.error("Failed to trigger report generation", {
      orgId: org_id,
      error: error instanceof Error ? error.message : String(error),
    });

    // Still return 202 — report generation is async
    res.status(202).json({
      report_id: reportId,
      status: "queued",
      message: "Report generation queued. Check back later.",
    });
  }
});

// ─────────────────────────────────────────────────────
// GET /v1/fairness-score/:orgId/:modelId — Public fairness score (no auth)
// ─────────────────────────────────────────────────────
app.get("/v1/fairness-score/:orgId/:modelId", async (req: Request, res: Response): Promise<void> => {
  const { orgId, modelId } = req.params;

  try {
    // Fetch latest metrics for this model
    const metricsSnapshot = await firestore
      .collection("orgs")
      .doc(orgId!)
      .collection("fairness_metrics")
      .where("model_id", "==", modelId)
      .orderBy("computed_at_ms", "desc")
      .limit(5)
      .get();

    if (metricsSnapshot.empty) {
      res.status(200).json({
        org_id: orgId,
        model_id: modelId,
        fairness_score: null,
        message: "No fairness data available yet.",
      });
      return;
    }

    // Compute a composite fairness score (0-100)
    const metrics = metricsSnapshot.docs.map((doc) => doc.data());
    let totalScore = 0;
    let metricCount = 0;

    for (const metric of metrics) {
      const value = metric["value"] as number;
      const threshold = metric["threshold"] as number;
      const metricName = metric["metric_name"] as string;

      let normalised: number;
      if (metricName === "disparate_impact") {
        normalised = Math.min(value / threshold, 1.0) * 100;
      } else if (metricName === "demographic_parity" || metricName === "equalized_odds" || metricName === "predictive_parity") {
        normalised = Math.max(0, (1 - Math.abs(value) / threshold)) * 100;
      } else {
        normalised = Math.max(0, (1 - value / threshold)) * 100;
      }

      totalScore += normalised;
      metricCount++;
    }

    const fairnessScore = metricCount > 0 ? Math.round(totalScore / metricCount) : null;

    res.status(200).json({
      org_id: orgId,
      model_id: modelId,
      fairness_score: fairnessScore,
      metrics_count: metricCount,
      last_updated: metrics[0]?.["computed_at_ms"] ?? null,
      grade: fairnessScore !== null
        ? fairnessScore >= 90 ? "A" : fairnessScore >= 80 ? "B" : fairnessScore >= 70 ? "C" : fairnessScore >= 60 ? "D" : "F"
        : null,
    });
  } catch (error) {
    logger.error("Failed to compute fairness score", { orgId, modelId, error: String(error) });
    res.status(200).json({
      org_id: orgId,
      model_id: modelId,
      fairness_score: null,
      message: "Unable to compute fairness score at this time.",
    });
  }
});

// ═══════════════════════════════════════════════════════
// Error handler
// ═══════════════════════════════════════════════════════

app.use((err: Error, _req: Request, res: Response, _next: NextFunction): void => {
  logger.error("Unhandled error", { error: err.message, stack: err.stack });
  const problem: ProblemDetails = {
    type: "https://api.nexus.ai/errors/internal-error",
    title: "Internal Server Error",
    status: 500,
    detail: "An unexpected error occurred.",
  };
  res.status(500).json(problem);
});

// ═══════════════════════════════════════════════════════
// Start server
// ═══════════════════════════════════════════════════════

app.listen(PORT, () => {
  logger.info(`NEXUS Gateway started on port ${PORT}`, { version: VERSION });
});

// Graceful shutdown
const shutdown = async (): Promise<void> => {
  logger.info("Shutting down NEXUS Gateway...");
  await pubsubService.shutdown();
  redis.disconnect();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export default app;
