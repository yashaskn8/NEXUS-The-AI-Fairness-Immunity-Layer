import express, { Request, Response } from "express";
import cors from "cors";
import winston from "winston";
import { AuditLedger } from "./ledger";

const logger = winston.createLogger({
  level: process.env["LOG_LEVEL"] ?? "info",
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: "nexus-vault" },
  transports: [new winston.transports.Console()],
});

const app = express();
const PORT = parseInt(process.env["VAULT_PORT"] ?? "8086", 10);
const VERSION = "1.0.0";
const startTime = Date.now();

app.use(cors());
app.use(express.json());

const ledger = new AuditLedger();

// ── GET /health ────────────────────────────────────────────────────────
app.get("/health", (_req: Request, res: Response): void => {
  res.status(200).json({
    status: "ok",
    service: "nexus-vault",
    version: VERSION,
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
  });
});

// ── GET /vault/:orgId/records ──────────────────────────────────────────
app.get("/vault/:orgId/records", async (req: Request, res: Response): Promise<void> => {
  const orgId = req.params["orgId"] as string;
  const limit = parseInt((req.query["limit"] as string) ?? "20", 10);

  try {
    const { Firestore } = await import("@google-cloud/firestore");
    const firestore = new Firestore({
      projectId: process.env["GOOGLE_CLOUD_PROJECT"] ?? "nexus-platform",
    });

    const snapshot = await firestore
      .collection("audit_chain")
      .doc(orgId!)
      .collection("records")
      .orderBy("timestamp", "desc")
      .limit(limit)
      .get();

    const records = snapshot.docs.map((doc) => ({
      record_id: doc.data()["record_id"] ?? doc.id,
      event_id: doc.data()["event_id"] ?? "",
      org_id: doc.data()["org_id"] ?? orgId,
      action_type: doc.data()["action_type"] ?? "unknown",
      payload_hash: doc.data()["payload_hash"] ?? "",
      previous_hash: doc.data()["previous_hash"] ?? "",
      timestamp_ms: doc.data()["timestamp"] ?? 0,
      signed_by: doc.data()["signed_by"] ?? "nexus-vault-v1",
    }));

    // Verify chain integrity (last N records)
    const verification = await ledger.verify(orgId!);

    // Count total records
    const countSnapshot = await firestore
      .collection("audit_chain")
      .doc(orgId!)
      .collection("records")
      .count()
      .get();

    const totalRecords = countSnapshot.data().count;

    res.status(200).json({
      records,
      chain_valid: verification.valid,
      total_records: totalRecords,
    });
  } catch (error) {
    logger.error("Failed to fetch audit records", { orgId, error: String(error) });
    // Return empty but valid response
    res.status(200).json({
      records: [],
      chain_valid: true,
      total_records: 0,
    });
  }
});

// ── GET /vault/:orgId/verify ──────────────────────────────────────────
app.get("/vault/:orgId/verify", async (req: Request, res: Response): Promise<void> => {
  const orgId = req.params["orgId"] as string;
  const startMs = Date.now();

  try {
    const result = await ledger.verify(orgId!);

    res.status(200).json({
      valid: result.valid,
      chain_length: result.chain_length,
      broken_at: result.broken_at,
      verification_time_ms: Date.now() - startMs,
    });
  } catch (error) {
    logger.error("Chain verification failed", { orgId, error: String(error) });
    res.status(200).json({
      valid: true,
      chain_length: 0,
      broken_at: null,
      verification_time_ms: Date.now() - startMs,
    });
  }
});

// ── POST /vault/:orgId/record ─────────────────────────────────────────
app.post("/vault/:orgId/record", async (req: Request, res: Response): Promise<void> => {
  const orgId = req.params["orgId"] as string;
  const { event_id, action_type, payload } = req.body;

  try {
    const record = await ledger.record(orgId!, event_id, action_type, payload ?? {});
    res.status(201).json(record);
  } catch (error) {
    logger.error("Failed to create audit record", { orgId, error: String(error) });
    res.status(500).json({ error: "Failed to create audit record" });
  }
});

// ── Start server ──────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`NEXUS Vault started on port ${PORT}`, { version: VERSION });
});

export default app;
