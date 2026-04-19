/**
 * NEXUS Vault — AuditLedger Jest Test Suite
 *
 * Tests cryptographic chain integrity, Firestore writes, and KMS signing.
 * All external dependencies are mocked.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import crypto from "crypto";

// ─── Mock KMS ──────────────────────────────────────────────────────────────

const mockAsymmetricSign = jest.fn().mockResolvedValue([
  { signature: Buffer.from("mock-kms-signature-bytes") },
]);

jest.mock("@google-cloud/kms", () => ({
  KeyManagementServiceClient: jest.fn(() => ({
    asymmetricSign: mockAsymmetricSign,
  })),
}));

// ─── Mock Firestore ────────────────────────────────────────────────────────

const mockFirestoreSet = jest.fn().mockResolvedValue(undefined);
const mockFirestoreGet = jest.fn();
const mockOrderBy = jest.fn().mockReturnThis();
const mockLimit = jest.fn().mockReturnThis();

const mockRecordsCollection = {
  doc: jest.fn(() => ({ set: mockFirestoreSet })),
  orderBy: mockOrderBy,
  limit: mockLimit,
  get: mockFirestoreGet,
};

const mockOrgDoc = {
  collection: jest.fn(() => mockRecordsCollection),
};

const mockAuditChainCollection = {
  doc: jest.fn(() => mockOrgDoc),
};

jest.mock("@google-cloud/firestore", () => ({
  Firestore: jest.fn(() => ({
    collection: jest.fn((name: string) => {
      if (name === "audit_chain") return mockAuditChainCollection;
      return mockAuditChainCollection;
    }),
  })),
}));

// ─── Import after mocks ───────────────────────────────────────────────────

import { AuditLedger, AuditRecord } from "../ledger";

// ─── Helpers ───────────────────────────────────────────────────────────────

function buildChain(n: number, orgId: string = "test-org"): AuditRecord[] {
  const chain: AuditRecord[] = [];
  let previousHash = "genesis";

  for (let i = 0; i < n; i++) {
    const recordId = crypto.randomUUID();
    const eventId = `event-${i}`;
    const actionType = "decision_logged";
    const payloadHash = crypto.createHash("sha256").update(`payload-${i}`).digest("hex");
    const timestamp = Date.now() + i;

    const recordContent = `${recordId}:${orgId}:${eventId}:${actionType}:${payloadHash}:${previousHash}:${timestamp}`;
    const recordHash = crypto.createHash("sha256").update(recordContent).digest("hex");

    const signature = crypto.createHmac("sha256", "nexus-vault-signing-secret").update(recordHash).digest("hex");

    const record: AuditRecord = {
      record_id: recordId,
      org_id: orgId,
      event_id: eventId,
      action_type: actionType,
      payload_hash: payloadHash,
      previous_hash: previousHash,
      record_hash: recordHash,
      signature,
      signed_by: "test-key",
      timestamp,
    };

    chain.push(record);
    previousHash = recordHash;
  }

  return chain;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("AuditLedger.record()", () => {
  let ledger: AuditLedger;

  beforeEach(() => {
    jest.clearAllMocks();
    ledger = new AuditLedger();
  });

  it("produces a record with non-empty payloadHash and links previousHash correctly", async () => {
    // First record — no previous
    mockFirestoreGet.mockResolvedValueOnce({ empty: true });

    const record1 = await ledger.record("org-1", "evt-1", "decision_logged", { score: 0.7 });

    expect(record1.payload_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(record1.previous_hash).toBe("genesis");
    expect(record1.record_hash).toMatch(/^[a-f0-9]{64}$/);

    // Second record — links to first
    mockFirestoreGet.mockResolvedValueOnce({
      empty: false,
      docs: [{ data: () => record1 }],
    });

    const record2 = await ledger.record("org-1", "evt-2", "decision_logged", { score: 0.8 });

    expect(record2.previous_hash).toBe(record1.record_hash);
  });

  it("first record in a chain has previousHash of 'genesis'", async () => {
    mockFirestoreGet.mockResolvedValueOnce({ empty: true });

    const record = await ledger.record("org-new", "evt-1", "decision_logged", { test: true });

    expect(record.previous_hash).toBe("genesis");
  });

  it("writes to Firestore with the correct collection path", async () => {
    mockFirestoreGet.mockResolvedValueOnce({ empty: true });

    const record = await ledger.record("org-path-test", "evt-1", "metric_computed", { di: 0.85 });

    // Firestore was called: audit_chain > orgId > records > recordId
    expect(mockAuditChainCollection.doc).toHaveBeenCalledWith("org-path-test");
    expect(mockOrgDoc.collection).toHaveBeenCalledWith("records");
    expect(mockRecordsCollection.doc).toHaveBeenCalledWith(record.record_id);
    expect(mockFirestoreSet).toHaveBeenCalledWith(record);
  });

  it("includes a non-empty signature and signed_by field", async () => {
    mockFirestoreGet.mockResolvedValueOnce({ empty: true });

    const record = await ledger.record("org-sig", "evt-1", "intervention_applied", {});

    expect(record.signature.length).toBeGreaterThan(0);
    expect(record.signed_by.length).toBeGreaterThan(0);
  });
});

describe("AuditLedger.verify()", () => {
  let ledger: AuditLedger;

  beforeEach(() => {
    jest.clearAllMocks();
    ledger = new AuditLedger();
  });

  it("returns { valid: true } for an intact chain of 5 records", async () => {
    const chain = buildChain(5, "org-verify");

    mockFirestoreGet.mockResolvedValueOnce({
      empty: false,
      docs: chain.map((r) => ({ data: () => r })),
    });

    const result = await ledger.verify("org-verify");

    expect(result.valid).toBe(true);
    expect(result.chain_length).toBe(5);
    expect(result.broken_at).toBeNull();
  });

  it("returns { valid: false, broken_at: recordId } when chain is tampered", async () => {
    const chain = buildChain(5, "org-tampered");

    // Tamper with record 3's record_hash — breaks record 4's previousHash link
    chain[2]!.record_hash = "0000000000000000000000000000000000000000000000000000000000000000";

    mockFirestoreGet.mockResolvedValueOnce({
      empty: false,
      docs: chain.map((r) => ({ data: () => r })),
    });

    const result = await ledger.verify("org-tampered");

    expect(result.valid).toBe(false);
    // Record 3 (index 2) is where the tampered record_hash is detected
    expect(result.broken_at).toBe(chain[2]!.record_id);
  });

  it("returns { valid: true } for an empty chain", async () => {
    mockFirestoreGet.mockResolvedValueOnce({ empty: true });

    const result = await ledger.verify("org-empty");

    expect(result.valid).toBe(true);
    expect(result.chain_length).toBe(0);
  });
});
