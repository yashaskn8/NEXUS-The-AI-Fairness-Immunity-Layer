export function normaliseMetric(raw: Record<string, unknown>) {
  return {
    metric_id:           String(raw.metric_id         ?? raw.metricId         ?? raw.id  ?? ""),
    org_id:              String(raw.org_id             ?? raw.orgId            ?? "demo-org"),
    model_id:            String(raw.model_id           ?? raw.modelId          ?? ""),
    metric_name:         String(raw.metric_name        ?? raw.metricName       ?? ""),
    protected_attribute: String(raw.protected_attribute?? raw.protectedAttribute ?? ""),
    value:               Number(raw.value              ?? 0),
    threshold:           Number(raw.threshold          ?? 0.8),
    is_violated:         Boolean(raw.violated ?? raw.is_violated ?? false),
    severity:            String(raw.severity           ?? "ok"),
    window:              String(raw.window             ?? "5m"),
    sample_size:         Number(raw.sample_size        ?? raw.sampleSize ?? 0),
    computed_at_ms:      Number(
      raw.computed_at_ms ?? raw.computedAtMs ??
      (raw.computed_at as { toMillis?: () => number })?.toMillis?.() ??
      Date.now()
    ),
  };
}

export function normaliseIntercept(raw: Record<string, unknown>) {
  return {
    event_id:             String(raw.event_id            ?? raw.eventId            ?? raw.id ?? ""),
    model_id:             String(raw.model_id            ?? raw.modelId            ?? ""),
    org_id:               String(raw.org_id              ?? raw.orgId              ?? "demo-org"),
    domain:               String(raw.domain              ?? "hiring"),
    original_decision:    String(raw.original_decision   ?? raw.originalDecision   ?? ""),
    final_decision:       String(raw.final_decision      ?? raw.finalDecision      ?? ""),
    was_intercepted:      Boolean(raw.was_intercepted ?? raw.wasIntercepted ?? false),
    intervention_reason:  String(raw.intervention_reason ?? raw.interventionReason ?? "none"),
    latency_ms:           Number(raw.latency_ms          ?? raw.latencyMs          ?? 0),
    protected_attributes: (raw.protected_attributes ?? raw.protectedAttributes ?? {}) as Record<string, string>,
    confidence:           Number(raw.confidence          ?? 0),
    timestamp_ms:         Number(
      raw.timestamp_ms ?? raw.timestampMs ?? raw.timestamp ??
      (raw.created_at as { toMillis?: () => number })?.toMillis?.() ??
      Date.now()
    ),
  };
}

export function normaliseVaultRecord(raw: Record<string, unknown>) {
  const hash = String(raw.payload_hash ?? raw.payloadHash ?? "");
  const prev = String(raw.previous_hash ?? raw.previousHash ?? "0".repeat(64));
  return {
    record_id:     String(raw.record_id    ?? raw.recordId     ?? raw.id ?? ""),
    event_id:      String(raw.event_id     ?? raw.eventId      ?? "—"),
    org_id:        String(raw.org_id       ?? raw.orgId        ?? "—"),
    action_type:   String(raw.action_type  ?? raw.actionType   ?? "UNKNOWN"),
    payload_hash:  hash.length === 64 ? hash : "(pending)",
    previous_hash: prev,
    record_hash:   String(raw.record_hash  ?? raw.recordHash   ?? ""),
    signature:     String(raw.signature    ?? ""),
    signed_by:     String(raw.signed_by    ?? raw.signedBy     ?? "nexus-vault-v1"),
    timestamp_ms:  Number(
      raw.timestamp_ms ?? raw.timestampMs ?? raw.timestamp ??
      (raw.created_at as { toMillis?: () => number })?.toMillis?.() ?? 0
    ),
  };
}

export function normaliseInsight(raw: Record<string, unknown>) {
  return {
    insight_id:    String(raw.insight_id   ?? raw.id ?? ""),
    severity:      String(raw.severity     ?? "info"),
    headline:      String(raw.headline     ?? ""),
    summary:       String(raw.summary      ?? ""),
    icon_type:     String(raw.icon_type    ?? raw.insight_type ?? "info"),
    insight_type:  String(raw.insight_type ?? ""),
    org_id:        String(raw.org_id       ?? "demo-org"),
    created_at_ms: Number(
      raw.created_at_ms ?? raw.createdAtMs ??
      (raw.created_at as { toMillis?: () => number })?.toMillis?.() ??
      Date.now()
    ),
  };
}
