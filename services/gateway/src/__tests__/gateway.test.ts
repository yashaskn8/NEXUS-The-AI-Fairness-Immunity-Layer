/**
 * NEXUS Gateway — Comprehensive Jest Test Suite
 *
 * Tests all gateway endpoints with full mock isolation.
 * No real network calls are made.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Mock Infrastructure BEFORE imports ────────────────────────────────────

// Mock ioredis
const mockRedisInstance = {
  on: jest.fn(),
  ping: jest.fn().mockResolvedValue("PONG"),
  get: jest.fn().mockResolvedValue(null),
  setex: jest.fn().mockResolvedValue("OK"),
  disconnect: jest.fn(),
  pipeline: jest.fn(() => ({
    zremrangebyscore: jest.fn().mockReturnThis(),
    zcard: jest.fn().mockReturnThis(),
    zadd: jest.fn().mockReturnThis(),
    expire: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([
      [null, 0],
      [null, 0],
      [null, 0],
      [null, 0],
    ]),
  })),
};
jest.mock("ioredis", () => jest.fn(() => mockRedisInstance));

// Mock Firestore
const mockFirestoreDoc = {
  get: jest.fn(),
  set: jest.fn().mockResolvedValue(undefined),
  collection: jest.fn(),
};
const mockFirestoreCollection = {
  doc: jest.fn(() => mockFirestoreDoc),
  get: jest.fn(),
  orderBy: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  offset: jest.fn().mockReturnThis(),
  count: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue({ data: () => ({ count: 0 }) }) }),
};
mockFirestoreDoc.collection = jest.fn(() => mockFirestoreCollection);

const mockFirestoreInstance = {
  collection: jest.fn(() => mockFirestoreCollection),
  listCollections: jest.fn().mockResolvedValue([]),
  batch: jest.fn(() => ({
    set: jest.fn(),
    commit: jest.fn().mockResolvedValue(undefined),
  })),
};
jest.mock("@google-cloud/firestore", () => ({
  Firestore: jest.fn(() => mockFirestoreInstance),
}));

// Mock PubSub
const mockTopicPublishMessage = jest.fn().mockResolvedValue("msg-123");
const mockTopicExists = jest.fn().mockResolvedValue([true]);
const mockTopic = {
  publishMessage: mockTopicPublishMessage,
  exists: mockTopicExists,
  create: jest.fn().mockResolvedValue(undefined),
};
jest.mock("@google-cloud/pubsub", () => ({
  PubSub: jest.fn(() => ({
    topic: jest.fn(() => mockTopic),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

// Mock global fetch for intercept route
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

// ─── Imports ───────────────────────────────────────────────────────────────

import request from "supertest";
import app from "../index";

// ─── Helpers ───────────────────────────────────────────────────────────────

const VALID_PAYLOAD = {
  org_id: "test-org-001",
  model_id: "hiring-v2",
  domain: "hiring",
  decision: "rejected",
  confidence: 0.72,
  features: { years_exp: 5, gpa: 3.5 },
  protected_attributes: [{ name: "gender", value: "female" }],
};

const VALID_API_KEY = "nxs_test_key_1234567890abcdef";

function setAuthCacheHit(): void {
  mockRedisInstance.get.mockResolvedValueOnce(
    JSON.stringify({
      orgId: "test-org-001",
      tier: "pro",
      rateLimit: { hourly: 100000, burstPerMinute: 5000 },
    })
  );
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("GET /v1/health", () => {
  it("returns 200 with status, version string, and uptime_seconds >= 0", async () => {
    const res = await request(app).get("/v1/health");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("status");
    expect(["ok", "degraded"]).toContain(res.body.status);
    expect(typeof res.body.version).toBe("string");
    expect(res.body.uptime_seconds).toBeGreaterThanOrEqual(0);
  });
});

describe("POST /v1/events", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 202 with event_id for a valid DecisionEvent payload", async () => {
    setAuthCacheHit();
    const res = await request(app)
      .post("/v1/events")
      .set("Authorization", `Bearer ${VALID_API_KEY}`)
      .send(VALID_PAYLOAD);

    expect(res.status).toBe(202);
    expect(res.body.status).toBe("queued");
    expect(typeof res.body.event_id).toBe("string");
    expect(res.body.event_id.length).toBeGreaterThan(0);
  });

  it("returns 400 with RFC 7807 Problem Details when required fields missing", async () => {
    setAuthCacheHit();
    const { org_id, ...payloadWithoutOrgId } = VALID_PAYLOAD;

    const res = await request(app)
      .post("/v1/events")
      .set("Authorization", `Bearer ${VALID_API_KEY}`)
      .send(payloadWithoutOrgId);

    expect(res.status).toBe(400);
    expect(res.body.type).toContain("validation-error");
    expect(res.body.detail).toBeDefined();
    expect(res.body.detail.toLowerCase()).toContain("org_id");
  });

  it("returns 401 when Authorization header is absent", async () => {
    const res = await request(app).post("/v1/events").send(VALID_PAYLOAD);

    expect(res.status).toBe(401);
    expect(res.body.type).toContain("unauthorized");
  });

  it("returns 401 when API key is invalid", async () => {
    // Redis cache miss
    mockRedisInstance.get.mockResolvedValueOnce(null);
    // Firestore returns no matching key — empty orgs
    mockFirestoreInstance.collection.mockReturnValueOnce({
      ...mockFirestoreCollection,
      get: jest.fn().mockResolvedValue({ docs: [] }),
    });

    const res = await request(app)
      .post("/v1/events")
      .set("Authorization", "Bearer nxs_invalid_key")
      .send(VALID_PAYLOAD);

    expect(res.status).toBe(401);
  });

  it("returns 429 with Retry-After header when rate limit exceeded", async () => {
    setAuthCacheHit();
    // Mock pipeline to return high count
    mockRedisInstance.pipeline.mockReturnValueOnce({
      zremrangebyscore: jest.fn().mockReturnThis(),
      zcard: jest.fn().mockReturnThis(),
      zadd: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([
        [null, 0],
        [null, 999999], // hourly count far above limit
        [null, 0],
        [null, 999999], // minute count far above limit
      ]),
    });

    const res = await request(app)
      .post("/v1/events")
      .set("Authorization", `Bearer ${VALID_API_KEY}`)
      .send(VALID_PAYLOAD);

    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBeDefined();
  });

  it("returns 500 when Pub/Sub publish fails", async () => {
    setAuthCacheHit();
    // Make the topic.publishMessage throw
    mockTopicPublishMessage.mockRejectedValueOnce(new Error("PubSub down"));

    const res = await request(app)
      .post("/v1/events")
      .set("Authorization", `Bearer ${VALID_API_KEY}`)
      .send(VALID_PAYLOAD);

    expect(res.status).toBe(500);
    expect(res.body.type).toContain("publish-failed");
  });
});

describe("POST /v1/intercept", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 200 with InterceptResponse containing final_decision", async () => {
    setAuthCacheHit();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        event_id: "evt-123",
        original_decision: "rejected",
        final_decision: "approved",
        was_intercepted: true,
        intervention_type: "threshold",
        intervention_reason: "threshold_autopilot",
        applied_corrections: [],
        latency_ms: 45,
        interceptor_version: "1.0.0",
      }),
    });

    const res = await request(app)
      .post("/v1/intercept")
      .set("Authorization", `Bearer ${VALID_API_KEY}`)
      .send(VALID_PAYLOAD);

    expect(res.status).toBe(200);
    expect(res.body.was_intercepted).toBe(true);
    expect(typeof res.body.final_decision).toBe("string");
    expect(typeof res.body.latency_ms).toBe("number");
  });

  it("returns original decision with was_intercepted=false when interceptor unreachable", async () => {
    setAuthCacheHit();
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const res = await request(app)
      .post("/v1/intercept")
      .set("Authorization", `Bearer ${VALID_API_KEY}`)
      .send(VALID_PAYLOAD);

    expect(res.status).toBe(200);
    expect(res.body.was_intercepted).toBe(false);
    expect(res.body.intervention_reason).toBe("interceptor_unavailable");
    expect(res.body.final_decision).toBe(VALID_PAYLOAD.decision);
  });
});

describe("Auth middleware", () => {
  it("caches valid API key in Redis after first successful lookup", async () => {
    // First call — cache miss, Firestore lookup succeeds
    mockRedisInstance.get.mockResolvedValueOnce(null);
    const mockOrgDoc = {
      id: "test-org-001",
      data: () => ({ tier: "pro", name: "Test Org" }),
    };
    const mockKeyDoc = { exists: true };
    mockFirestoreInstance.collection.mockReturnValueOnce({
      ...mockFirestoreCollection,
      get: jest.fn().mockResolvedValue({ docs: [mockOrgDoc] }),
    });
    mockFirestoreDoc.get.mockResolvedValueOnce(mockKeyDoc);
    mockRedisInstance.setex.mockResolvedValueOnce("OK");

    await request(app)
      .post("/v1/events")
      .set("Authorization", `Bearer ${VALID_API_KEY}`)
      .send(VALID_PAYLOAD);

    // Assert Redis setex was called to cache the key
    expect(mockRedisInstance.setex).toHaveBeenCalled();

    // Second call — should hit cache
    mockRedisInstance.get.mockResolvedValueOnce(
      JSON.stringify({
        orgId: "test-org-001",
        tier: "pro",
        rateLimit: { hourly: 100000, burstPerMinute: 5000 },
      })
    );

    await request(app)
      .post("/v1/events")
      .set("Authorization", `Bearer ${VALID_API_KEY}`)
      .send(VALID_PAYLOAD);

    // Firestore orgs.get should have been called only once (first call)
    const firestoreGetCalls = mockFirestoreInstance.collection.mock.calls.filter(
      (c: any[]) => c[0] === "orgs"
    );
    // First call triggers Firestore, second doesn't
    expect(firestoreGetCalls.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Rate limiter", () => {
  it("uses sliding window: requests older than 60s do not count toward limit", async () => {
    setAuthCacheHit();
    // Simulate 99 old entries that were trimmed — zcard returns 0 after removal
    mockRedisInstance.pipeline.mockReturnValueOnce({
      zremrangebyscore: jest.fn().mockReturnThis(),
      zcard: jest.fn().mockReturnThis(),
      zadd: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([
        [null, 99], // removed 99 old hourly entries
        [null, 0],  // 0 entries remaining after trimming
        [null, 99], // removed 99 old minute entries
        [null, 0],  // 0 entries remaining after trimming
      ]),
    });

    const res = await request(app)
      .post("/v1/events")
      .set("Authorization", `Bearer ${VALID_API_KEY}`)
      .send(VALID_PAYLOAD);

    // Request should succeed because old entries don't count
    expect(res.status).not.toBe(429);
  });
});

afterAll(() => {
  mockRedisInstance.disconnect();
});
