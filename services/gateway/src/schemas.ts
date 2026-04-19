import { z } from "zod";

// ═══════════════════════════════════════════════════════
// Shared Zod Schemas for NEXUS Gateway
// ═══════════════════════════════════════════════════════

export const ProtectedAttributeSchema = z.object({
  name: z.string().min(1),
  value: z.string().min(1),
});

export const DecisionEventSchema = z.object({
  event_id: z.string().uuid().optional(),
  org_id: z.string().min(1),
  model_id: z.string().min(1),
  timestamp: z.number().int().positive().optional(),
  decision: z.enum(["approved", "rejected", "pending"]),
  confidence: z.number().min(0).max(1),
  features: z.record(z.string(), z.unknown()),
  protected_attributes: z.array(ProtectedAttributeSchema).optional().default([]),
  individual_id: z.string().optional(),
  true_label: z.string().optional(),
  domain: z.enum(["hiring", "credit", "healthcare", "legal", "insurance"]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

export const InterceptRequestSchema = DecisionEventSchema;

export const AppliedCorrectionSchema = z.object({
  attribute: z.string(),
  original_threshold: z.number(),
  equalized_threshold: z.number(),
  original_confidence: z.number(),
  adjusted_confidence: z.number().optional(),
});

export const InterceptResponseSchema = z.object({
  event_id: z.string(),
  original_decision: z.enum(["approved", "rejected", "pending"]),
  final_decision: z.enum(["approved", "rejected", "pending"]),
  was_intercepted: z.boolean(),
  intervention_type: z.enum(["none", "threshold", "causal"]).default("none"),
  intervention_reason: z.string().nullable().optional(),
  applied_corrections: z.array(AppliedCorrectionSchema).default([]),
  latency_ms: z.number(),
  interceptor_version: z.string().default("1.0.0"),
});

export const CreateOrgSchema = z.object({
  name: z.string().min(1).max(200),
  tier: z.enum(["free", "pro", "enterprise"]).default("free"),
  domain: z.enum(["hiring", "credit", "healthcare", "legal", "insurance"]).optional(),
  compliance_contact_email: z.string().email().optional(),
});

export const ReportGenerateSchema = z.object({
  org_id: z.string().min(1),
  model_id: z.string().min(1),
  period_start: z.number().int().positive(),
  period_end: z.number().int().positive(),
});

export const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ═══════════════════════════════════════════════════════
// TypeScript types derived from Zod schemas
// ═══════════════════════════════════════════════════════

export type DecisionEvent = z.infer<typeof DecisionEventSchema>;
export type InterceptRequest = z.infer<typeof InterceptRequestSchema>;
export type InterceptResponse = z.infer<typeof InterceptResponseSchema>;
export type CreateOrgRequest = z.infer<typeof CreateOrgSchema>;
export type ReportGenerateRequest = z.infer<typeof ReportGenerateSchema>;
export type ProtectedAttribute = z.infer<typeof ProtectedAttributeSchema>;
export type AppliedCorrection = z.infer<typeof AppliedCorrectionSchema>;

// ═══════════════════════════════════════════════════════
// Problem Details RFC 7807
// ═══════════════════════════════════════════════════════

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
}

// ═══════════════════════════════════════════════════════
// Auth Context
// ═══════════════════════════════════════════════════════

export interface NexusAuthContext {
  orgId: string;
  tier: "free" | "pro" | "enterprise";
  rateLimit: { hourly: number; burstPerMinute: number };
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      nexus?: NexusAuthContext;
    }
  }
}

// ═══════════════════════════════════════════════════════
// Health Response
// ═══════════════════════════════════════════════════════

export interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  version: string;
  uptime_seconds: number;
  services_status: Record<string, "up" | "down" | "unknown">;
}
