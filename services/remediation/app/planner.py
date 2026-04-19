"""
NEXUS Remediation Planner — Auto-remediation decision logic.
Determines the appropriate intervention for fairness violations.
"""
from __future__ import annotations

from typing import Any

import numpy as np
import structlog

from nexus_types.models import (
    FairnessMetric,
    RemediationAction,
    RemediationActionType,
    SHAPResult,
)

logger = structlog.get_logger(__name__)


class RemediationPlanner:
    """
    Plans remediation actions for fairness violations.
    Actions are prioritized: Causal > Threshold > Reweighing > Retrain > Escalation.
    """

    def plan(
        self,
        metrics: list[FairnessMetric],
        causal_graph: dict[str, Any],
        shap_result: SHAPResult,
        domain: str,
    ) -> list[RemediationAction]:
        """
        Generate remediation actions based on the violation severity.
        """
        actions: list[RemediationAction] = []

        violated_metrics = [m for m in metrics if m.is_violated]
        if not violated_metrics:
            return actions

        # Compute key indicators
        proxy_contribution = shap_result.proxy_shap_contribution
        max_di_violation = 0.0
        max_eo_gap = 0.0

        for metric in violated_metrics:
            if metric.metric_name.value == "disparate_impact":
                violation_mag = metric.threshold - metric.value
                max_di_violation = max(max_di_violation, violation_mag)
            elif metric.metric_name.value == "equalized_odds":
                max_eo_gap = max(max_eo_gap, metric.value)

        # Priority 1: CAUSAL INTERVENTION (can_auto_apply=True)
        if proxy_contribution > 0.40:
            proxy_features = shap_result.group_divergent_features[:5]
            projected_improvement = 0.7 * proxy_contribution * max_di_violation

            actions.append(RemediationAction(
                action_type=RemediationActionType.CAUSAL_INTERVENTION,
                description=(
                    f"Proxy features are driving {proxy_contribution:.0%} of the model's outcome. "
                    f"NEXUS will suppress proxy features ({', '.join(proxy_features)}) at inference time. "
                    f"This is the highest-priority intervention because the bias is caused by "
                    f"features that act as demographic proxies."
                ),
                can_auto_apply=True,
                projected_improvement=round(projected_improvement * 100, 1),
                implementation_details={
                    "proxy_features": proxy_features,
                    "proxy_contribution": proxy_contribution,
                    "suppression_method": "zero_out_at_inference",
                    "affected_metrics": ["disparate_impact", "demographic_parity"],
                },
            ))

        # Priority 2: THRESHOLD AUTOPILOT (can_auto_apply=True)
        di_metrics = [m for m in violated_metrics if m.metric_name.value == "disparate_impact"]
        for metric in di_metrics:
            if 0.7 <= metric.value < 0.8:
                projected_improvement = ((0.8 - metric.value) / 0.1) * 100

                actions.append(RemediationAction(
                    action_type=RemediationActionType.THRESHOLD_AUTOPILOT,
                    description=(
                        f"Disparate Impact for {metric.protected_attribute} "
                        f"({metric.comparison_group} vs {metric.reference_group}) is {metric.value:.3f}, "
                        f"just below the EEOC threshold of {metric.threshold}. "
                        f"NEXUS will compute equalized per-group thresholds and apply them in real-time."
                    ),
                    can_auto_apply=True,
                    projected_improvement=round(projected_improvement, 1),
                    implementation_details={
                        "current_di": metric.value,
                        "target_di": 0.8,
                        "attribute": metric.protected_attribute,
                        "comparison_group": metric.comparison_group,
                        "reference_group": metric.reference_group,
                        "method": "per_group_threshold_calibration",
                    },
                ))

        # Priority 3: REWEIGHING (requires human approval)
        severe_di = [m for m in di_metrics if m.value < 0.7]
        if severe_di:
            for metric in severe_di:
                actions.append(RemediationAction(
                    action_type=RemediationActionType.REWEIGHING,
                    description=(
                        f"Disparate Impact for {metric.protected_attribute} is {metric.value:.3f}, "
                        f"well below the threshold. Recommend Reweighing preprocessing "
                        f"(Kamiran & Calders, 2012) on your training data. "
                        f"NEXUS will compute a weight vector: "
                        f"W(x) = P(Y=1) × P(A=a) / P(Y=1, A=a)."
                    ),
                    can_auto_apply=False,
                    projected_improvement=round((0.8 - metric.value) * 100, 1),
                    implementation_details={
                        "method": "kamiran_calders_reweighing",
                        "formula": "W(x) = P(Y=1) * P(A=a) / P(Y=1, A=a)",
                        "attribute": metric.protected_attribute,
                        "current_di": metric.value,
                        "requires": "Retraining with weighted samples",
                    },
                ))

        # Priority 4: FULL RETRAIN FLAG
        if max_eo_gap > 0.15:
            actions.append(RemediationAction(
                action_type=RemediationActionType.FULL_RETRAIN,
                description=(
                    f"Equalized Odds gap is {max_eo_gap:.3f}, exceeding the critical threshold. "
                    f"The model requires full retraining with fairness constraints. "
                    f"Recommend Adversarial Debiasing using a fairness-constrained loss function: "
                    f"L = L_task + λ × L_adversarial, where the adversary tries to predict "
                    f"the protected attribute from the model's predictions."
                ),
                can_auto_apply=False,
                projected_improvement=75.0,
                implementation_details={
                    "method": "adversarial_debiasing",
                    "loss_function": "L = L_task + λ * L_adversarial",
                    "equalized_odds_gap": max_eo_gap,
                    "platform": "Vertex AI Custom Training",
                    "estimated_time": "2-4 hours",
                },
            ))

        # Priority 5: MONITORING ESCALATION (always appended for violations)
        actions.append(RemediationAction(
            action_type=RemediationActionType.MONITORING_ESCALATION,
            description=(
                f"Increasing metric computation frequency to every 60 seconds for this model. "
                f"Compliance contact will be alerted. "
                f"Domain: {domain}. Violations detected in {len(violated_metrics)} metric(s)."
            ),
            can_auto_apply=True,
            projected_improvement=0.0,
            implementation_details={
                "new_frequency_seconds": 60,
                "violated_metrics": [m.metric_name.value for m in violated_metrics],
                "domain": domain,
                "alert_method": "email_and_pubsub",
            },
        ))

        logger.info(
            "Remediation plan created",
            total_actions=len(actions),
            auto_apply_count=sum(1 for a in actions if a.can_auto_apply),
            human_approval_count=sum(1 for a in actions if not a.can_auto_apply),
        )

        return actions
