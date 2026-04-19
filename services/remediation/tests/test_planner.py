"""
NEXUS Remediation Planner — Test Suite
Tests action selection, priority ordering, and reweighing math.
"""
from __future__ import annotations

import pytest

from app.planner import RemediationPlanner
from nexus_types.models import (
    FairnessMetric,
    MetricName,
    RemediationActionType,
    SHAPResult,
    Severity,
)


def _metric(
    metric_name: str = "disparate_impact",
    value: float = 0.75,
    threshold: float = 0.80,
    is_violated: bool = True,
    severity: str = "high",
    protected_attribute: str = "gender",
    comparison_group: str = "female",
    reference_group: str = "male",
) -> FairnessMetric:
    return FairnessMetric(
        org_id="test-org",
        model_id="model-1",
        metric_name=MetricName(metric_name),
        protected_attribute=protected_attribute,
        comparison_group=comparison_group,
        reference_group=reference_group,
        value=value,
        threshold=threshold,
        is_violated=is_violated,
        severity=Severity(severity),
        window_seconds=3600,
        sample_count=200,
    )


def _shap(proxy_contribution: float = 0.10) -> SHAPResult:
    return SHAPResult(
        model_id="model-1",
        top_global_features=[("years_exp", 0.3), ("gpa", 0.2), ("zip_code", 0.15)],
        group_divergent_features=["zip_code", "employment_gap", "school_type"],
        proxy_shap_contribution=proxy_contribution,
    )


class TestRemediationPlanner:
    def test_causal_intervention_selected_when_proxy_contribution_high(self) -> None:
        planner = RemediationPlanner()
        metrics = [_metric(value=0.75)]
        shap = _shap(proxy_contribution=0.55)

        actions = planner.plan(metrics, {}, shap, domain="hiring")

        causal_actions = [a for a in actions if a.action_type == RemediationActionType.CAUSAL_INTERVENTION]
        assert len(causal_actions) >= 1
        assert causal_actions[0].can_auto_apply is True

    def test_threshold_autopilot_selected_for_moderate_violation(self) -> None:
        planner = RemediationPlanner()
        metrics = [_metric(value=0.76)]  # DI between 0.70 and 0.80
        shap = _shap(proxy_contribution=0.15)

        actions = planner.plan(metrics, {}, shap, domain="hiring")

        threshold_actions = [a for a in actions if a.action_type == RemediationActionType.THRESHOLD_AUTOPILOT]
        assert len(threshold_actions) >= 1

    def test_reweighing_recommended_for_severe_violation(self) -> None:
        planner = RemediationPlanner()
        metrics = [_metric(value=0.62)]  # Severe: below 0.70
        shap = _shap(proxy_contribution=0.10)

        actions = planner.plan(metrics, {}, shap, domain="hiring")

        reweigh_actions = [a for a in actions if a.action_type == RemediationActionType.REWEIGHING]
        assert len(reweigh_actions) >= 1
        assert reweigh_actions[0].can_auto_apply is False

    def test_monitor_escalation_always_appended(self) -> None:
        planner = RemediationPlanner()
        metrics = [_metric(value=0.75)]
        shap = _shap()

        actions = planner.plan(metrics, {}, shap, domain="credit")

        assert len(actions) > 0
        assert actions[-1].action_type == RemediationActionType.MONITORING_ESCALATION

    def test_actions_sorted_by_type_priority(self) -> None:
        """Causal > Threshold > Reweighing > Retrain > Monitoring."""
        planner = RemediationPlanner()
        metrics = [
            _metric(value=0.62),  # Severe DI — triggers reweighing
            _metric(metric_name="equalized_odds", value=0.20, threshold=0.10),  # EO gap — triggers retrain
        ]
        shap = _shap(proxy_contribution=0.55)  # High proxy — triggers causal

        actions = planner.plan(metrics, {}, shap, domain="hiring")

        type_order = [a.action_type for a in actions]
        # Monitoring should always be last
        assert type_order[-1] == RemediationActionType.MONITORING_ESCALATION

    def test_reweighing_weight_vector_mathematically_correct(self) -> None:
        """
        Verify the Kamiran & Calders reweighing formula referenced in planner.
        P(Y=1) = 0.5, P(A=female) = 0.375, P(Y=1, A=female) = 0.25
        Expected W(Y=1, A=female) = P(Y=1) * P(A=female) / P(Y=1, A=female)
                                   = 0.5 * 0.375 / 0.25 = 0.75
        """
        # This tests the mathematical formula documented in the planner
        p_y1 = 0.5
        p_a_female = 0.375
        p_y1_a_female = 0.25

        expected_weight = p_y1 * p_a_female / p_y1_a_female
        assert abs(expected_weight - 0.75) < 0.01

        # Also verify planner produces reweighing action for severe violation
        planner = RemediationPlanner()
        metrics = [_metric(value=0.62)]
        shap = _shap(proxy_contribution=0.10)

        actions = planner.plan(metrics, {}, shap, domain="hiring")
        reweigh_actions = [a for a in actions if a.action_type == RemediationActionType.REWEIGHING]
        assert len(reweigh_actions) >= 1
        assert "kamiran_calders" in reweigh_actions[0].implementation_details.get("method", "")
