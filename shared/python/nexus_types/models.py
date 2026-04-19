"""
NEXUS Shared Types — Python Pydantic v2 models used across all services.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


# ═══════════════════════════════════════════════════════
# Enums
# ═══════════════════════════════════════════════════════

class DecisionType(str, Enum):
    APPROVED = "approved"
    REJECTED = "rejected"
    PENDING = "pending"


class MetricName(str, Enum):
    DISPARATE_IMPACT = "disparate_impact"
    DEMOGRAPHIC_PARITY = "demographic_parity"
    EQUALIZED_ODDS = "equalized_odds"
    PREDICTIVE_PARITY = "predictive_parity"
    INDIVIDUAL_FAIRNESS = "individual_fairness"


class Severity(str, Enum):
    NONE = "none"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class InterventionType(str, Enum):
    NONE = "none"
    THRESHOLD = "threshold"
    CAUSAL = "causal"


class DeploymentRecommendation(str, Enum):
    SAFE = "safe"
    CONDITIONAL = "conditional"
    BLOCKED = "blocked"


class ActionType(str, Enum):
    DECISION_LOGGED = "decision_logged"
    METRIC_COMPUTED = "metric_computed"
    INTERVENTION_APPLIED = "intervention_applied"
    THRESHOLD_UPDATED = "threshold_updated"
    REPORT_GENERATED = "report_generated"
    REGULATORY_UPDATE = "regulatory_update"
    FEDERATED_ROUND = "federated_round"
    MODEL_REGISTERED = "model_registered"
    ALERT_RAISED = "alert_raised"


class RemediationActionType(str, Enum):
    CAUSAL_INTERVENTION = "causal_intervention"
    THRESHOLD_AUTOPILOT = "threshold_autopilot"
    REWEIGHING = "reweighing"
    FULL_RETRAIN = "full_retrain"
    MONITORING_ESCALATION = "monitoring_escalation"


class Tier(str, Enum):
    FREE = "free"
    PRO = "pro"
    ENTERPRISE = "enterprise"


class Domain(str, Enum):
    HIRING = "hiring"
    CREDIT = "credit"
    HEALTHCARE = "healthcare"
    LEGAL = "legal"
    INSURANCE = "insurance"


class Jurisdiction(str, Enum):
    US = "US"
    EU = "EU"
    UK = "UK"
    IN = "IN"
    GLOBAL = "global"


# ═══════════════════════════════════════════════════════
# Core Event Models
# ═══════════════════════════════════════════════════════

class ProtectedAttribute(BaseModel):
    name: str = Field(..., description="Name of the protected attribute (e.g., gender, race, age)")
    value: str = Field(..., description="Value of the protected attribute for this individual")


class DecisionEvent(BaseModel):
    event_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    org_id: str
    model_id: str
    timestamp: int = Field(default_factory=lambda: int(datetime.utcnow().timestamp() * 1000))
    decision: DecisionType
    confidence: float = Field(..., ge=0.0, le=1.0)
    features: dict[str, Any]
    protected_attributes: list[ProtectedAttribute] = Field(default_factory=list)
    individual_id: Optional[str] = None
    true_label: Optional[str] = None
    domain: Optional[Domain] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


# ═══════════════════════════════════════════════════════
# Intercept Models
# ═══════════════════════════════════════════════════════

class AppliedCorrection(BaseModel):
    attribute: str
    original_threshold: float
    equalized_threshold: float
    original_confidence: float
    adjusted_confidence: Optional[float] = None


class InterceptResponse(BaseModel):
    event_id: str
    original_decision: DecisionType
    final_decision: DecisionType
    was_intercepted: bool
    intervention_type: InterventionType = InterventionType.NONE
    intervention_reason: Optional[str] = None
    applied_corrections: list[AppliedCorrection] = Field(default_factory=list)
    latency_ms: float
    interceptor_version: str = "1.0.0"


class InterceptDecision(BaseModel):
    final_decision: DecisionType
    was_intercepted: bool
    intervention_type: InterventionType = InterventionType.NONE
    intervention_reason: Optional[str] = None
    applied_corrections: list[AppliedCorrection] = Field(default_factory=list)


# ═══════════════════════════════════════════════════════
# Fairness Metrics Models
# ═══════════════════════════════════════════════════════

class FairnessMetric(BaseModel):
    metric_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    org_id: str
    model_id: str
    metric_name: MetricName
    protected_attribute: Optional[str] = None
    comparison_group: Optional[str] = None
    reference_group: Optional[str] = None
    value: float
    threshold: float
    is_violated: bool
    severity: Severity
    window_seconds: int
    sample_count: int
    computed_at_ms: int = Field(default_factory=lambda: int(datetime.utcnow().timestamp() * 1000))


class GroupStats(BaseModel):
    approval_rates: dict[str, float] = Field(default_factory=dict)
    confidence_percentiles: dict[str, list[float]] = Field(default_factory=dict)
    active_thresholds: dict[str, float] = Field(default_factory=dict)
    last_updated: int = 0


# ═══════════════════════════════════════════════════════
# Causal & SHAP Models
# ═══════════════════════════════════════════════════════

class SHAPResult(BaseModel):
    model_id: str
    top_global_features: list[tuple[str, float]] = Field(default_factory=list)
    group_divergent_features: list[str] = Field(default_factory=list)
    proxy_shap_contribution: Optional[float] = 0.0
    # Bootstrap confidence intervals (5th, 95th percentile)
    shap_ci_lower: dict[str, float] = Field(default_factory=dict)
    shap_ci_upper: dict[str, float] = Field(default_factory=dict)
    # "high" (CI width < 0.05), "medium" (0.05-0.15), "low" (> 0.15)
    result_stability: str = "high"


class SingleExplanation(BaseModel):
    event_id: str
    shap_values: dict[str, float] = Field(default_factory=dict)
    top_features: list[tuple[str, float]] = Field(default_factory=list)


# ═══════════════════════════════════════════════════════
# Forecast Models
# ═══════════════════════════════════════════════════════

class BiasForecast(BaseModel):
    forecast_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    org_id: str
    model_id: str
    metric_name: MetricName
    protected_attribute: str
    current_value: float
    forecast_7d: float
    forecast_30d: float
    violation_probability_7d: float
    violation_probability_30d: float
    threshold: float
    forecast_basis: str
    trend_driver: str
    computed_at_ms: int = Field(default_factory=lambda: int(datetime.utcnow().timestamp() * 1000))
    upper_bound_7d: Optional[float] = None
    lower_bound_7d: Optional[float] = None
    upper_bound_30d: Optional[float] = None
    lower_bound_30d: Optional[float] = None


class DriftReport(BaseModel):
    drifted_features: list[dict[str, Any]] = Field(default_factory=list)
    protected_attr_psi: dict[str, float] = Field(default_factory=dict)
    overall_drift_severity: Severity = Severity.NONE
    predicted_fairness_impact: Optional[str] = None


# ═══════════════════════════════════════════════════════
# Remediation Models
# ═══════════════════════════════════════════════════════

class RemediationAction(BaseModel):
    action_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    action_type: RemediationActionType
    description: str
    can_auto_apply: bool
    projected_improvement: float
    implementation_details: dict[str, Any] = Field(default_factory=dict)
    status: str = "pending"


class ProjectionResult(BaseModel):
    projected_disparate_impact: float
    projected_accuracy: float
    accuracy_delta: float


# ═══════════════════════════════════════════════════════
# Federated Learning Models
# ═══════════════════════════════════════════════════════

class FederatedGradient(BaseModel):
    org_id: str
    round_id: str
    gradient_vector: list[float]
    sample_count: int
    epsilon_spent: float
    delta: float = 1e-5
    protected_attributes: list[str] = Field(default_factory=list)
    timestamp: int = Field(default_factory=lambda: int(datetime.utcnow().timestamp() * 1000))


# ═══════════════════════════════════════════════════════
# Audit / Vault Models
# ═══════════════════════════════════════════════════════

class AuditRecord(BaseModel):
    record_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    org_id: str
    event_id: str
    action_type: str
    payload_hash: str
    previous_hash: str
    record_hash: str
    signature: str
    signed_by: str
    timestamp: int = Field(default_factory=lambda: int(datetime.utcnow().timestamp() * 1000))


class VerificationResult(BaseModel):
    valid: bool
    broken_at: Optional[str] = None
    chain_length: int


# ═══════════════════════════════════════════════════════
# Stress Testing Models
# ═══════════════════════════════════════════════════════

class BiasPocket(BaseModel):
    feature_combination: dict[str, Any]
    group: str
    approval_rate: float
    severity: Severity
    description: Optional[str] = None


class StressTestReport(BaseModel):
    report_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    org_id: str
    model_id: str
    overall_readiness_score: float = Field(..., ge=0.0, le=100.0)
    metric_results: dict[str, dict[str, Any]] = Field(default_factory=dict)
    bias_pockets: list[BiasPocket] = Field(default_factory=list)
    deployment_recommendation: DeploymentRecommendation
    recommendation_explanation: Optional[str] = None
    n_samples: int
    computed_at_ms: int = Field(default_factory=lambda: int(datetime.utcnow().timestamp() * 1000))


# ═══════════════════════════════════════════════════════
# Regulatory Models
# ═══════════════════════════════════════════════════════

class RegulatoryUpdate(BaseModel):
    update_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    source: str
    thresholds: list[dict[str, Any]] = Field(default_factory=list)
    domains: list[str] = Field(default_factory=list)
    effective_date: Optional[str] = None
    summary: str
    urgency: str = "low"
    raw_content_hash: str = ""
    detected_at_ms: int = Field(default_factory=lambda: int(datetime.utcnow().timestamp() * 1000))


# ═══════════════════════════════════════════════════════
# Organisation Models
# ═══════════════════════════════════════════════════════

class Organisation(BaseModel):
    org_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    tier: Tier = Tier.FREE
    domain: Optional[Domain] = None
    created_at_ms: int = Field(default_factory=lambda: int(datetime.utcnow().timestamp() * 1000))
    api_keys: list[str] = Field(default_factory=list)
    models: list[str] = Field(default_factory=list)
    compliance_contact_email: Optional[str] = None


class GlobalInsight(BaseModel):
    insight_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    insight_type: str
    headline: str
    summary: str
    full_narrative: Optional[str] = None
    severity: Severity = Severity.LOW
    data: dict[str, Any] = Field(default_factory=dict)
    created_at_ms: int = Field(default_factory=lambda: int(datetime.utcnow().timestamp() * 1000))
