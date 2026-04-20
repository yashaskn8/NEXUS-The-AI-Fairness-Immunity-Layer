import { Router, Request, Response } from "express";
import https from "https";
import http from "http";
import winston from "winston";
import { InterceptRequestSchema, ProblemDetails } from "../schemas";
import { PubSubService } from "../services/pubsub";

const logger = winston.createLogger({
  level: process.env["LOG_LEVEL"] ?? "info",
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

const INTERCEPTOR_URL = process.env["INTERCEPTOR_URL"] ?? "http://localhost:8081";
const INTERCEPTOR_TIMEOUT_MS = 500; // Allow enough time under high concurrency

/**
 * HTTP agent with keep-alive for connection reuse (simulates HTTP/2 keep-alive).
 */
const keepAliveAgent = INTERCEPTOR_URL.startsWith("https")
  ? new https.Agent({ keepAlive: true, maxSockets: 200 })
  : new http.Agent({ keepAlive: true, maxSockets: 200 });

/**
 * Forward request to interceptor service with timeout.
 */
async function forwardToInterceptor(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const url = new URL(`${INTERCEPTOR_URL}/intercept`);
    
    const options: http.RequestOptions = {
      method: "POST",
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
      agent: keepAliveAgent,
      timeout: INTERCEPTOR_TIMEOUT_MS,
    };

    const req = (INTERCEPTOR_URL.startsWith("https") ? https : http).request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error("Failed to parse interceptor response"));
          }
        } else {
          reject(new Error(`Interceptor responded with ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Interceptor request timed out"));
    });

    req.write(body);
    req.end();
  });
}

/**
 * Create the intercept router.
 * The /v1/intercept endpoint is the most performance-critical path.
 */
export function createInterceptRouter(pubsubService: PubSubService): Router {
  const router = Router();

  router.post("/", async (req: Request, res: Response): Promise<void> => {
    const startTime = performance.now();

    // Step 1: Validate payload (Zod schema) — target max 5ms
    const parseResult = InterceptRequestSchema.safeParse(req.body);
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

    try {
      // Step 2: Forward to interceptor service via keep-alive connection — target 100ms
      const interceptResult = await forwardToInterceptor({
        ...event,
        org_id: orgId,
        event_id: event.event_id ?? crypto.randomUUID(),
        timestamp: event.timestamp ?? Date.now(),
      });

      const latencyMs = performance.now() - startTime;

      // Step 3: Log the round-trip to Pub/Sub asynchronously (fire-and-forget)
      pubsubService.publishInterceptLog(orgId, {
        event_id: event.event_id,
        org_id: orgId,
        model_id: event.model_id,
        original_decision: event.decision,
        intercept_result: interceptResult,
        latency_ms: latencyMs,
        timestamp: Date.now(),
      });

      // Step 4: Return InterceptResponse to caller within 200ms SLA
      const response = {
        ...interceptResult,
        latency_ms: Math.round(latencyMs * 100) / 100,
      };

      logger.info("Intercept completed", {
        orgId,
        modelId: event.model_id,
        wasIntercepted: interceptResult["was_intercepted"],
        latencyMs: latencyMs.toFixed(2),
      });

      res.status(200).json(response);
    } catch (error) {
      const latencyMs = performance.now() - startTime;

      // Step 5: If interceptor is unreachable, return original decision
      // with was_intercepted: false — NEVER block the caller
      const fallbackResponse = {
        event_id: event.event_id ?? crypto.randomUUID(),
        original_decision: event.decision,
        final_decision: event.decision,
        was_intercepted: false,
        intervention_type: "none",
        intervention_reason: "interceptor_unavailable",
        applied_corrections: [],
        latency_ms: Math.round(latencyMs * 100) / 100,
        interceptor_version: "1.0.0",
      };

      logger.warn("Interceptor unavailable — returning original decision", {
        orgId,
        modelId: event.model_id,
        error: error instanceof Error ? error.message : String(error),
        latencyMs: latencyMs.toFixed(2),
      });

      // Still log the fallback to Pub/Sub
      pubsubService.publishInterceptLog(orgId, {
        event_id: event.event_id,
        org_id: orgId,
        model_id: event.model_id,
        original_decision: event.decision,
        intercept_result: fallbackResponse,
        latency_ms: latencyMs,
        fallback: true,
        timestamp: Date.now(),
      });

      res.status(200).json(fallbackResponse);
    }
  });

  return router;
}
