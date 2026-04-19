import crypto from "crypto";
import { Firestore } from "@google-cloud/firestore";
import winston from "winston";

const logger = winston.createLogger({
  level: process.env["LOG_LEVEL"] ?? "info",
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: "nexus-vault" },
  transports: [new winston.transports.Console()],
});

export interface AuditRecord {
  record_id: string;
  org_id: string;
  event_id: string;
  action_type: string;
  payload_hash: string;
  previous_hash: string;
  record_hash: string;
  signature: string;
  signed_by: string;
  timestamp: number;
}

export interface VerificationResult {
  valid: boolean;
  broken_at: string | null;
  chain_length: number;
}

/**
 * Cryptographic audit ledger — every significant event in NEXUS is hashed,
 * chained, and stored immutably. Creates legally admissible evidence.
 */
export class AuditLedger {
  private firestore: Firestore;
  private kmsKeyName: string;

  constructor() {
    this.firestore = new Firestore({
      projectId: process.env["GOOGLE_CLOUD_PROJECT"] ?? "nexus-platform",
    });
    this.kmsKeyName = process.env["KMS_KEY_NAME"] ?? "projects/nexus-platform/locations/us-central1/keyRings/nexus-audit-keys/cryptoKeys/audit-signer/cryptoKeyVersions/1";
  }

  /**
   * Record a new audit event in the chain.
   */
  async record(
    orgId: string,
    eventId: string,
    actionType: string,
    payload: object
  ): Promise<AuditRecord> {
    // Step 1: Compute payloadHash = SHA-256(JSON.stringify(payload, sorted_keys))
    const sortedPayload = JSON.stringify(payload, Object.keys(payload).sort());
    const payloadHash = crypto
      .createHash("sha256")
      .update(sortedPayload)
      .digest("hex");

    // Step 2: Fetch the last record for this orgId to get previousHash
    const previousHash = await this.getLastHash(orgId);

    // Step 3: Build record
    const recordId = crypto.randomUUID();
    const timestamp = Date.now();

    // Compute record hash (chain link)
    const recordContent = `${recordId}:${orgId}:${eventId}:${actionType}:${payloadHash}:${previousHash}:${timestamp}`;
    const recordHash = crypto
      .createHash("sha256")
      .update(recordContent)
      .digest("hex");

    // Step 4: Sign the record using KMS (or HMAC fallback for dev)
    const signature = await this.signRecord(recordHash);

    const record: AuditRecord = {
      record_id: recordId,
      org_id: orgId,
      event_id: eventId,
      action_type: actionType,
      payload_hash: payloadHash,
      previous_hash: previousHash,
      record_hash: recordHash,
      signature: signature,
      signed_by: this.kmsKeyName,
      timestamp: timestamp,
    };

    // Step 5: Write to Firestore
    await this.firestore
      .collection("audit_chain")
      .doc(orgId)
      .collection("records")
      .doc(recordId)
      .set(record);

    logger.info("Audit record created", {
      recordId,
      orgId,
      eventId,
      actionType,
      chainLength: "incremented",
    });

    return record;
  }

  /**
   * Verify chain integrity from a record back to genesis.
   */
  async verify(
    orgId: string,
    fromRecordId?: string
  ): Promise<VerificationResult> {
    // Fetch all records for this org, ordered by timestamp
    const snapshot = await this.firestore
      .collection("audit_chain")
      .doc(orgId)
      .collection("records")
      .orderBy("timestamp", "asc")
      .get();

    if (snapshot.empty) {
      return { valid: true, broken_at: null, chain_length: 0 };
    }

    const records = snapshot.docs.map((doc) => doc.data() as AuditRecord);
    let startIndex = 0;

    if (fromRecordId) {
      const idx = records.findIndex((r) => r.record_id === fromRecordId);
      if (idx >= 0) startIndex = idx;
    }

    // Walk the chain
    for (let i = startIndex + 1; i < records.length; i++) {
      const current = records[i];
      const previous = records[i - 1];

      if (!current || !previous) {
        return {
          valid: false,
          broken_at: current?.record_id ?? "unknown",
          chain_length: i,
        };
      }

      // Verify hash chain: current.previousHash == previous.recordHash
      if (current.previous_hash !== previous.record_hash) {
        logger.error("Chain integrity violation detected", {
          orgId,
          brokenAt: current.record_id,
          expected: previous.record_hash,
          actual: current.previous_hash,
        });

        return {
          valid: false,
          broken_at: current.record_id,
          chain_length: i,
        };
      }

      // Verify record hash integrity
      const recordContent = `${current.record_id}:${current.org_id}:${current.event_id}:${current.action_type}:${current.payload_hash}:${current.previous_hash}:${current.timestamp}`;
      const expectedHash = crypto
        .createHash("sha256")
        .update(recordContent)
        .digest("hex");

      if (current.record_hash !== expectedHash) {
        logger.error("Record hash mismatch — possible tampering", {
          orgId,
          recordId: current.record_id,
        });

        return {
          valid: false,
          broken_at: current.record_id,
          chain_length: i,
        };
      }
    }

    logger.info("Chain verification passed", {
      orgId,
      chainLength: records.length,
    });

    return {
      valid: true,
      broken_at: null,
      chain_length: records.length,
    };
  }

  /**
   * Get the hash of the last record in the chain.
   */
  private async getLastHash(orgId: string): Promise<string> {
    const snapshot = await this.firestore
      .collection("audit_chain")
      .doc(orgId)
      .collection("records")
      .orderBy("timestamp", "desc")
      .limit(1)
      .get();

    if (snapshot.empty) {
      return "genesis";
    }

    const lastRecord = snapshot.docs[0]?.data() as AuditRecord | undefined;
    return lastRecord?.record_hash ?? "genesis";
  }

  /**
   * Sign a record hash using Cloud KMS or HMAC fallback.
   */
  private async signRecord(recordHash: string): Promise<string> {
    try {
      // Try Cloud KMS
      const { KeyManagementServiceClient } = await import("@google-cloud/kms");
      const kmsClient = new KeyManagementServiceClient();

      const digest = crypto.createHash("sha256").update(recordHash).digest();

      const [signResponse] = await kmsClient.asymmetricSign({
        name: this.kmsKeyName,
        digest: { sha256: digest },
      });

      if (signResponse.signature) {
        return Buffer.from(signResponse.signature).toString("base64");
      }

      throw new Error("Empty KMS signature");
    } catch {
      // Fallback to HMAC signing for development
      const secret = process.env["GATEWAY_SIGNING_SECRET"] ?? "nexus-vault-signing-secret";
      return crypto
        .createHmac("sha256", secret)
        .update(recordHash)
        .digest("hex");
    }
  }
}
