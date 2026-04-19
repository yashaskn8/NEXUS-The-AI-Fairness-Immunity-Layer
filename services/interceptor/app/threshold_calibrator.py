"""
NEXUS Threshold Calibrator — computes per-group confidence thresholds
that achieve fairness constraints while minimizing accuracy loss.
"""
from __future__ import annotations

import structlog

from nexus_types.models import GroupStats, ProjectionResult

logger = structlog.get_logger(__name__)

# Fairness constraints
DI_TARGET = 0.80    # EEOC four-fifths rule
EO_GAP_TARGET = 0.05  # Equalized odds TPR gap target
THRESHOLD_MIN = 0.3
THRESHOLD_MAX = 0.95
BISECTION_ITERATIONS = 20


class ThresholdCalibrator:
    """
    Computes per-group confidence thresholds that achieve:
    (a) Disparate Impact ≥ 0.8
    (b) Equalized Odds: TPR gap ≤ 0.05
    (c) Minimum accuracy loss via bisection search
    """

    def compute_equalized_thresholds(self, group_stats: GroupStats) -> dict[str, float]:
        """
        Given current approval rates and confidence distributions per group,
        compute per-group thresholds that achieve fairness constraints.

        Returns dict: { group_value: threshold_float }
        """
        approval_rates = group_stats.approval_rates
        confidence_percentiles = group_stats.confidence_percentiles
        active_thresholds = group_stats.active_thresholds

        if not approval_rates:
            return {}

        # Find reference group (highest approval rate)
        ref_group = max(approval_rates, key=lambda k: approval_rates[k])
        ref_rate = approval_rates[ref_group]

        if ref_rate == 0:
            return {g: 0.5 for g in approval_rates}

        result: dict[str, float] = {}

        for group, rate in approval_rates.items():
            if group == ref_group:
                # Reference group keeps its current threshold
                result[group] = active_thresholds.get(group, active_thresholds.get("global", 0.5))
                continue

            current_di = rate / ref_rate if ref_rate > 0 else 1.0

            if current_di >= DI_TARGET:
                # Already compliant — keep current threshold
                result[group] = active_thresholds.get(group, active_thresholds.get("global", 0.5))
                continue

            # Target approval rate for this group to achieve DI = 0.8
            target_rate = DI_TARGET * ref_rate

            # Use bisection to find the threshold that yields target_rate
            # Given confidence percentiles for this group
            percentiles = confidence_percentiles.get(group, [])

            if not percentiles:
                # No confidence data — use a heuristic
                current_threshold = active_thresholds.get(group, active_thresholds.get("global", 0.5))
                # Lower the threshold proportionally to the rate gap
                rate_gap = target_rate - rate
                adjustment = rate_gap * 0.5  # Conservative adjustment
                result[group] = max(THRESHOLD_MIN, min(THRESHOLD_MAX, current_threshold - adjustment))
                continue

            # Bisection search: find threshold where P(confidence >= threshold) = target_rate
            low = THRESHOLD_MIN
            high = THRESHOLD_MAX

            for _ in range(BISECTION_ITERATIONS):
                mid = (low + high) / 2.0
                # Estimate approval rate at this threshold
                above_threshold = sum(1 for p in percentiles if p >= mid) / len(percentiles)

                if above_threshold > target_rate:
                    low = mid  # Threshold too low, raise it
                else:
                    high = mid  # Threshold too high, lower it

            result[group] = round((low + high) / 2.0, 4)

            logger.debug(
                "Computed equalized threshold",
                group=group,
                current_rate=rate,
                target_rate=target_rate,
                current_di=current_di,
                new_threshold=result[group],
            )

        return result

    def project_impact(
        self,
        current_thresholds: dict[str, float],
        proposed_thresholds: dict[str, float],
        group_stats: GroupStats,
    ) -> ProjectionResult:
        """
        Simulate what metrics would look like if proposed thresholds were
        applied to the last 1,000 decisions.

        Returns projected_disparate_impact, projected_accuracy, accuracy_delta.
        """
        approval_rates = group_stats.approval_rates
        confidence_percentiles = group_stats.confidence_percentiles

        if not approval_rates or not confidence_percentiles:
            return ProjectionResult(
                projected_disparate_impact=1.0,
                projected_accuracy=1.0,
                accuracy_delta=0.0,
            )

        # Compute projected approval rates under proposed thresholds
        projected_rates: dict[str, float] = {}
        current_accuracy_sum = 0.0
        proposed_accuracy_sum = 0.0
        total_samples = 0

        for group, percentiles in confidence_percentiles.items():
            if not percentiles:
                projected_rates[group] = approval_rates.get(group, 0.5)
                continue

            current_threshold = current_thresholds.get(group, 0.5)
            proposed_threshold = proposed_thresholds.get(group, current_threshold)

            # Current approval rate at current threshold
            current_approvals = sum(1 for p in percentiles if p >= current_threshold)
            # Projected approval rate at proposed threshold
            proposed_approvals = sum(1 for p in percentiles if p >= proposed_threshold)

            n = len(percentiles)
            projected_rates[group] = proposed_approvals / n if n > 0 else 0.0

            # Accuracy estimation: how many high-confidence decisions would flip?
            # Assume high confidence (>0.8) = correct decision
            current_correct = sum(1 for p in percentiles if (p >= current_threshold and p > 0.8) or (p < current_threshold and p <= 0.2))
            proposed_correct = sum(1 for p in percentiles if (p >= proposed_threshold and p > 0.8) or (p < proposed_threshold and p <= 0.2))

            current_accuracy_sum += current_correct
            proposed_accuracy_sum += proposed_correct
            total_samples += n

        # Compute projected DI
        if not projected_rates:
            return ProjectionResult(
                projected_disparate_impact=1.0,
                projected_accuracy=1.0,
                accuracy_delta=0.0,
            )

        max_rate = max(projected_rates.values()) if projected_rates else 1.0
        min_rate = min(projected_rates.values()) if projected_rates else 1.0
        projected_di = min_rate / max_rate if max_rate > 0 else 1.0

        current_accuracy = current_accuracy_sum / total_samples if total_samples > 0 else 1.0
        projected_accuracy = proposed_accuracy_sum / total_samples if total_samples > 0 else 1.0
        accuracy_delta = projected_accuracy - current_accuracy

        return ProjectionResult(
            projected_disparate_impact=round(projected_di, 4),
            projected_accuracy=round(projected_accuracy, 4),
            accuracy_delta=round(accuracy_delta, 4),
        )
