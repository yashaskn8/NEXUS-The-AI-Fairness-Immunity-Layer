import { db } from "../firebase";
import { collection, addDoc, setDoc, doc, serverTimestamp, getDocs, limit, query } from "firebase/firestore";

export async function seedFirestoreIfEmpty(orgId: string): Promise<void> {
  try {
    const metricsRef = collection(db, `orgs/${orgId}/fairness_metrics`);
    const snap = await getDocs(query(metricsRef, limit(1)));
    if (!snap.empty) return;

    const now = Date.now();

    const metrics = [
      { metric_name: "disparate_impact", protected_attribute: "gender", value: 0.67, threshold: 0.80, violated: true, is_violated: true, severity: "critical", window: "5m", model_id: "hiring-v1", org_id: orgId, sample_size: 200, computed_at_ms: now },
      { metric_name: "demographic_parity", protected_attribute: "gender", value: -0.24, threshold: 0.10, violated: true, is_violated: true, severity: "critical", window: "5m", model_id: "hiring-v1", org_id: orgId, sample_size: 200, computed_at_ms: now - 60000 },
      { metric_name: "equalized_odds", protected_attribute: "gender", value: 0.17, threshold: 0.10, violated: true, is_violated: true, severity: "high", window: "5m", model_id: "hiring-v1", org_id: orgId, sample_size: 200, computed_at_ms: now - 120000 },
      { metric_name: "disparate_impact", protected_attribute: "age_group", value: 0.74, threshold: 0.80, violated: true, is_violated: true, severity: "warning", window: "5m", model_id: "credit-v2", org_id: orgId, sample_size: 150, computed_at_ms: now - 180000 },
      { metric_name: "disparate_impact", protected_attribute: "gender", value: 0.91, threshold: 0.85, violated: false, is_violated: false, severity: "ok", window: "5m", model_id: "healthcare-v1", org_id: orgId, sample_size: 100, computed_at_ms: now - 240000 },
      { metric_name: "predictive_parity", protected_attribute: "gender", value: 0.05, threshold: 0.10, violated: false, is_violated: false, severity: "ok", window: "5m", model_id: "hiring-v1", org_id: orgId, sample_size: 200, computed_at_ms: now - 300000 },
      { metric_name: "individual_fairness", protected_attribute: "gender", value: 0.08, threshold: 0.10, violated: false, is_violated: false, severity: "ok", window: "5m", model_id: "hiring-v1", org_id: orgId, sample_size: 200, computed_at_ms: now - 360000 },
      // Additional time series for charts
      { metric_name: "disparate_impact", protected_attribute: "gender", value: 0.72, threshold: 0.80, violated: true, is_violated: true, severity: "critical", window: "5m", model_id: "hiring-v1", org_id: orgId, sample_size: 200, computed_at_ms: now - 600000 },
      { metric_name: "disparate_impact", protected_attribute: "gender", value: 0.78, threshold: 0.80, violated: true, is_violated: true, severity: "warning", window: "5m", model_id: "hiring-v1", org_id: orgId, sample_size: 200, computed_at_ms: now - 1200000 },
      { metric_name: "disparate_impact", protected_attribute: "gender", value: 0.82, threshold: 0.80, violated: false, is_violated: false, severity: "ok", window: "5m", model_id: "hiring-v1", org_id: orgId, sample_size: 200, computed_at_ms: now - 1800000 },
      { metric_name: "disparate_impact", protected_attribute: "gender", value: 0.85, threshold: 0.80, violated: false, is_violated: false, severity: "ok", window: "5m", model_id: "hiring-v1", org_id: orgId, sample_size: 200, computed_at_ms: now - 2400000 },
      { metric_name: "disparate_impact", protected_attribute: "gender", value: 0.88, threshold: 0.80, violated: false, is_violated: false, severity: "ok", window: "5m", model_id: "hiring-v1", org_id: orgId, sample_size: 200, computed_at_ms: now - 3000000 },
    ];

    const intercepts = [
      { model_id: "hiring-v1", domain: "hiring", org_id: orgId, original_decision: "rejected", final_decision: "approved", was_intercepted: true, intervention_reason: "threshold_autopilot", latency_ms: 87, confidence: 0.52, protected_attributes: { gender: "female" }, timestamp_ms: now - 120000 },
      { model_id: "hiring-v1", domain: "hiring", org_id: orgId, original_decision: "rejected", final_decision: "approved", was_intercepted: true, intervention_reason: "causal_intervention", latency_ms: 94, confidence: 0.49, protected_attributes: { gender: "female", age_group: "over_45" }, timestamp_ms: now - 240000 },
      { model_id: "credit-v2", domain: "credit", org_id: orgId, original_decision: "rejected", final_decision: "approved", was_intercepted: true, intervention_reason: "threshold_autopilot", latency_ms: 78, confidence: 0.55, protected_attributes: { gender: "female" }, timestamp_ms: now - 360000 },
      { model_id: "healthcare-v1", domain: "healthcare", org_id: orgId, original_decision: "normal_priority", final_decision: "high_priority", was_intercepted: true, intervention_reason: "demographic_bias", latency_ms: 45, confidence: 0.61, protected_attributes: { race: "black" }, timestamp_ms: now - 480000 },
      { model_id: "hiring-v1", domain: "hiring", org_id: orgId, original_decision: "approved", final_decision: "approved", was_intercepted: false, intervention_reason: "none", latency_ms: 12, confidence: 0.91, protected_attributes: { gender: "male" }, timestamp_ms: now - 600000 },
    ];

    const insights = [
      { severity: "critical", headline: "Gender bias spike in hiring pipeline", summary: "ResumeScanner_NLP shows Disparate Impact of 0.67, below EEOC threshold. Threshold Autopilot activated. 47 decisions corrected in the past hour.", icon_type: "alert", insight_type: "bias_detection", org_id: orgId, created_at: serverTimestamp(), created_at_ms: now },
      { severity: "info", headline: "Federated round 142 completed", summary: "35 organisations contributed differentially private gradients. Average DI improvement: 8.4% across the network. Global model updated.", icon_type: "network", insight_type: "compliance_alert", org_id: orgId, created_at: serverTimestamp(), created_at_ms: now - 3600000 },
      { severity: "info", headline: "EU AI Act threshold update applied", summary: "Regulatory Intelligence detected updated guidance. Credit domain DI threshold raised from 0.82 to 0.85. 3 organisations affected.", icon_type: "regulation", insight_type: "regulatory_update", org_id: orgId, created_at: serverTimestamp(), created_at_ms: now - 7200000 },
      { severity: "warning", headline: "Bias drift forecast: CreditRisk-v2", summary: "Prophet model projects 73% probability of DI violation in 9 days. Monitoring frequency increased to 60 seconds.", icon_type: "forecast", insight_type: "bias_detection", org_id: orgId, created_at: serverTimestamp(), created_at_ms: now - 14400000 },
    ];

    const models = [
      { model_id: "hiring-v1", domain: "hiring", org_id: orgId, severity: "critical", last_event_ms: now - 5000 },
      { model_id: "credit-v2", domain: "credit", org_id: orgId, severity: "warning", last_event_ms: now - 30000 },
      { model_id: "healthcare-v1", domain: "healthcare", org_id: orgId, severity: "ok", last_event_ms: now - 90000 },
    ];

    // Deterministic 64-char hex hash generator (stable across refreshes)
    function generateFakeHash(seed: number): string {
      return Array.from({ length: 8 }, (_, i) =>
        ((seed * (i + 1) * 0xDEADBEEF) >>> 0).toString(16).padStart(8, '0')
      ).join('');
    }

    const vaultRecords = [
      { record_id: "rec-001", event_id: "hiring-v1",      org_id: orgId, action_type: "intercept",   payload_hash: generateFakeHash(1),  previous_hash: "0".repeat(64),       signed_by: "nexus-vault-v1", timestamp_ms: now - 120000 },
      { record_id: "rec-002", event_id: "hiring-v1",      org_id: orgId, action_type: "intercept",   payload_hash: generateFakeHash(2),  previous_hash: generateFakeHash(1),  signed_by: "nexus-vault-v1", timestamp_ms: now - 240000 },
      { record_id: "rec-003", event_id: "credit-v2",      org_id: orgId, action_type: "metric",      payload_hash: generateFakeHash(3),  previous_hash: generateFakeHash(2),  signed_by: "nexus-vault-v1", timestamp_ms: now - 360000 },
      { record_id: "rec-004", event_id: "hiring-v1",      org_id: orgId, action_type: "intercept",   payload_hash: generateFakeHash(4),  previous_hash: generateFakeHash(3),  signed_by: "nexus-vault-v1", timestamp_ms: now - 480000 },
      { record_id: "rec-005", event_id: "healthcare-v1",  org_id: orgId, action_type: "remediation", payload_hash: generateFakeHash(5),  previous_hash: generateFakeHash(4),  signed_by: "nexus-vault-v1", timestamp_ms: now - 600000 },
      { record_id: "rec-006", event_id: "credit-v2",      org_id: orgId, action_type: "metric",      payload_hash: generateFakeHash(6),  previous_hash: generateFakeHash(5),  signed_by: "nexus-vault-v1", timestamp_ms: now - 720000 },
      { record_id: "rec-007", event_id: "hiring-v1",      org_id: orgId, action_type: "intercept",   payload_hash: generateFakeHash(7),  previous_hash: generateFakeHash(6),  signed_by: "nexus-vault-v1", timestamp_ms: now - 840000 },
      { record_id: "rec-008", event_id: "credit-v2",      org_id: orgId, action_type: "decision",    payload_hash: generateFakeHash(8),  previous_hash: generateFakeHash(7),  signed_by: "nexus-vault-v1", timestamp_ms: now - 960000 },
      { record_id: "rec-009", event_id: "healthcare-v1",  org_id: orgId, action_type: "metric",      payload_hash: generateFakeHash(9),  previous_hash: generateFakeHash(8),  signed_by: "nexus-vault-v1", timestamp_ms: now - 1080000 },
      { record_id: "rec-010", event_id: "hiring-v1",      org_id: orgId, action_type: "intercept",   payload_hash: generateFakeHash(10), previous_hash: generateFakeHash(9),  signed_by: "nexus-vault-v1", timestamp_ms: now - 1200000 },
    ];

    await Promise.all([
      ...metrics.map(m => addDoc(collection(db, `orgs/${orgId}/fairness_metrics`), m)),
      ...intercepts.map(i => addDoc(collection(db, `orgs/${orgId}/intercept_log`), i)),
      // FIX 4: Use deterministic IDs for insights to prevent duplicates on re-seed
      ...insights.map((g, idx) => {
        const deterministicId = `insight-${(g.headline || '').replace(/\s+/g, '-').toLowerCase().slice(0, 40)}-${idx}`;
        return setDoc(doc(db, `orgs/${orgId}/global_insights`, deterministicId), g, { merge: true });
      }),
      ...models.map(mo => setDoc(doc(db, `orgs/${orgId}/models`, mo.model_id), mo, { merge: true })),
      ...vaultRecords.map(v => setDoc(doc(db, `audit_chain/${orgId}/records`, v.record_id), v, { merge: true })),
    ]);

    console.log("[NEXUS] Firestore seeded with synthetic data.");
  } catch (err) {
    console.warn("[NEXUS] Seed skipped (Firestore may be unavailable):", err);
  }
}
