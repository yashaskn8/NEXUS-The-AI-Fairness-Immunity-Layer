/* ═══════════════════════════════════════════════════════
   NEXUS TypeScript Types — Matching Firestore documents
   ═══════════════════════════════════════════════════════ */

export interface DecisionEvent {
  event_id: string;
  org_id: string;
  model_id: string;
  timestamp: number;
  decision: "approved" | "rejected" | "pending";
  confidence: number;
  features: Record<string, unknown>;
  protected_attributes: { name: string; value: string }[];
  individual_id?: string;
  domain?: "hiring" | "credit" | "healthcare" | "legal" | "insurance";
}

export interface InterceptResponse {
  event_id: string;
  original_decision: string;
  final_decision: string;
  was_intercepted: boolean;
  intervention_type: "none" | "threshold" | "causal";
  intervention_reason: string | null;
  applied_corrections: AppliedCorrection[];
  latency_ms: number;
  interceptor_version: string;
}

export interface AppliedCorrection {
  attribute: string;
  original_threshold: number;
  equalized_threshold: number;
  original_confidence: number;
  adjusted_confidence?: number;
}

export interface FairnessMetric {
  metric_id: string;
  org_id: string;
  model_id: string;
  metric_name: "disparate_impact" | "demographic_parity" | "equalized_odds" | "predictive_parity" | "individual_fairness";
  protected_attribute: string;
  comparison_group: string;
  reference_group: string;
  value: number;
  threshold: number;
  is_violated: boolean;
  severity: "none" | "low" | "medium" | "high" | "critical";
  window_seconds: number;
  sample_count: number;
  computed_at_ms: number;
}

export interface CausalNode {
  id: string;
  label: string;
  type: "feature" | "proxy" | "protected_attr" | "outcome";
  mi_score?: number;
  shap_value?: number;
}

export interface CausalEdge {
  source: string;
  target: string;
  edge_type: "direct" | "proxy" | "interaction";
  causal_strength: number;
}

export interface RemediationAction {
  action_id: string;
  action_type: "causal_intervention" | "threshold_autopilot" | "reweighing" | "full_retrain" | "monitoring_escalation";
  description: string;
  can_auto_apply: boolean;
  projected_improvement: number;
  implementation_details: Record<string, unknown>;
  status: string;
}

export interface BiasForecast {
  forecast_id: string;
  org_id: string;
  model_id: string;
  metric_name: string;
  protected_attribute: string;
  current_value: number;
  forecast_7d: number;
  forecast_30d: number;
  violation_probability_7d: number;
  violation_probability_30d: number;
  threshold: number;
  forecast_basis: string;
  trend_driver: string;
  computed_at_ms: number;
  upper_bound_7d?: number;
  lower_bound_7d?: number;
  upper_bound_30d?: number;
  lower_bound_30d?: number;
}

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

export interface InterceptLogEvent {
  event_id: string;
  org_id: string;
  model_id: string;
  original_decision: string;
  final_decision: string;
  was_intercepted: boolean;
  intervention_reason?: string;
  protected_attribute?: string;
  domain?: string;
  latency_ms: number;
  timestamp: number;
}

export interface GlobalInsight {
  insight_id: string;
  insight_type: string;
  headline: string;
  summary: string;
  full_narrative?: string;
  severity: "none" | "low" | "medium" | "high" | "critical";
  data: Record<string, unknown>;
  created_at_ms: number;
}

export interface RegulatoryUpdate {
  update_id: string;
  source: string;
  thresholds: Record<string, unknown>[];
  domains: string[];
  effective_date?: string;
  summary: string;
  urgency: string;
  detected_at_ms: number;
}

export interface StressTestReport {
  report_id: string;
  org_id: string;
  model_id: string;
  overall_readiness_score: number;
  metric_results: Record<string, Record<string, unknown>>;
  bias_pockets: BiasPocket[];
  deployment_recommendation: "safe" | "conditional" | "blocked";
  recommendation_explanation?: string;
  n_samples: number;
  computed_at_ms: number;
}

export interface BiasPocket {
  feature_combination: Record<string, unknown>;
  group: string;
  approval_rate: number;
  severity: string;
  description?: string;
}

export interface FederatedRound {
  round_id: string;
  participants: string[];
  participant_count: number;
  aggregated_at: number;
  global_model_snapshot: Record<string, number[]>;
}

export interface ModelInfo {
  model_id: string;
  name: string;
  domain: string;
  status: "active" | "inactive" | "monitoring";
  last_event_ms: number;
  severity?: string;
}
