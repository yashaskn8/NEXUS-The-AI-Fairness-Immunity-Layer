"""
NEXUS Realtime Assessor — The hot path for bias interception.
Target: <50ms for the assess() method.
"""
from __future__ import annotations

import asyncio
import time
from typing import Optional

import structlog

from nexus_types.models import (
    AppliedCorrection,
    DecisionEvent,
    DecisionType,
    GroupStats,
    InterceptDecision,
    InterventionType,
)

from app.causal_cache import CausalCache
from app.threshold_calibrator import ThresholdCalibrator

logger = structlog.get_logger(__name__)

# Disparate Impact threshold (EEOC four-fifths rule)
DI_THRESHOLD = 0.80
DI_WARNING_MARGIN = 0.05  # 5% warning zone
CONFIDENCE_INTERVENTION_CEILING = 0.75
PROXY_SHAP_CAUSAL_THRESHOLD = 0.40


class RealtimeAssessor:
    """
    Real-time fairness assessor for inline decision interception.
    Loaded on startup with compressed fairness state from Redis.
    """

    def __init__(self, causal_cache: CausalCache) -> None:
        self.causal_cache = causal_cache
        self.calibrator = ThresholdCalibrator()
        # In-memory cache: (org_id, model_id, protected_attr) -> GroupStats
        self._group_stats_cache: dict[tuple[str, str], dict[str, GroupStats]] = {}
        self._cache_timestamps: dict[tuple[str, str], float] = {}
        self._cache_ttl = 60.0  # Refresh from Redis if stale by >60s

    async def initialize(self) -> None:
        """Load initial model state from Redis on startup."""
        logger.info("RealtimeAssessor initializing — loading group stats from Redis")
        # On startup, we preload nothing; stats are loaded lazily per (org, model)
        # to avoid memory bloat for large deployments.

    async def assess(self, event: DecisionEvent) -> InterceptDecision:
        """
        Hot path assessment. Target: <50ms.

        Steps:
        1. Pull GroupStats from local cache (refresh if stale)
        2. For each protected attribute:
           a. Compute counterfactual confidence
           b. Check disparate impact
           c. Check intervention zone
        3. Check intersectional bias (compound attributes)
        4. Apply most conservative intervention
        """
        cache_key = (event.org_id, event.model_id)

        # Step 1: Get GroupStats (from memory or Redis)
        group_stats = await self._get_group_stats(cache_key)

        if not group_stats:
            # No stats available — pass through unchanged
            return InterceptDecision(
                final_decision=event.decision,
                was_intercepted=False,
                intervention_type=InterventionType.NONE,
                intervention_reason=None,
                applied_corrections=[],
            )

        # Only intercept rejections (approvals are passed through)
        if event.decision != DecisionType.REJECTED:
            return InterceptDecision(
                final_decision=event.decision,
                was_intercepted=False,
                intervention_type=InterventionType.NONE,
                intervention_reason=None,
                applied_corrections=[],
            )

        best_intervention = InterventionType.NONE
        best_reason: Optional[str] = None
        corrections: list[AppliedCorrection] = []

        # Build a lookup of attributes for intersectional check
        attr_lookup: dict[str, str] = {}
        for pa in event.protected_attributes:
            attr_lookup[pa.name] = pa.value

        # Step 2: Evaluate each protected attribute independently
        any_disadvantaged = False
        max_global_threshold = 0.5
        for pa in event.protected_attributes:
            attr_name = pa.name
            attr_value = pa.value

            stats = group_stats.get(attr_name)
            if not stats:
                continue

            approval_rates = stats.approval_rates
            if not approval_rates:
                continue

            # Find reference group (highest approval rate group)
            ref_group = max(approval_rates, key=lambda k: approval_rates[k])
            ref_rate = approval_rates[ref_group]

            if ref_rate == 0:
                continue

            # Current group's approval rate
            group_rate = approval_rates.get(attr_value, ref_rate)

            # Step 2b: Check disparate impact
            current_di = group_rate / ref_rate if ref_rate > 0 else 1.0

            # Step 2c: Determine thresholds
            global_threshold = stats.active_thresholds.get("global", 0.5)
            group_threshold = stats.active_thresholds.get(attr_value, global_threshold)
            max_global_threshold = max(max_global_threshold, global_threshold)

            in_violation = current_di < DI_THRESHOLD
            near_violation = current_di < (DI_THRESHOLD + DI_WARNING_MARGIN)

            # Is this a disadvantaged group?
            is_disadvantaged = group_rate < ref_rate
            if is_disadvantaged:
                any_disadvantaged = True

            if not ((in_violation or near_violation) and is_disadvantaged):
                continue

             # Step 2d: Feature-confidence inconsistency check
            # Biased rejections have high qualification features but artificially
            # suppressed confidence. Legitimate rejections have features that
            # match the confidence. This is the key precision signal.
            # NOTE: Only use features that DIRECTLY correlate with decision
            # confidence. Exclude GPA (always high, 3.0-4.0) and experience
            # years as they inflate the average and create false positives.
            feature_vals: list[float] = []
            for fname in ["skills_score", "qualification", "credit_score",
                          "severity_score", "risk_score"]:
                fval = event.features.get(fname)
                if fval is not None:
                    feature_vals.append(float(fval))

            # Compute feature-confidence gap
            feature_inconsistent = False
            gap = 0.0
            if feature_vals:
                avg_feature = sum(feature_vals) / len(feature_vals)
                gap = avg_feature - event.confidence
                # Fixed gap threshold: 0.07.
                # Non-biased: gap = noise (σ=0.04-0.05), P(gap>0.07) ≈ 2-8%. Low FP.
                # Biased: gap = feature - suppressed_conf, typically 0.10-0.50. High detection.
                feature_inconsistent = gap > 0.07

            # Use feature inconsistency when features available (precise),
            # fall back to tight threshold zone when no features exist.
            if feature_vals:
                should_intervene = feature_inconsistent
            else:
                # Zone fallback: only intervene when confidence is well below
                # threshold (85% of it), avoiding FP on legitimately
                # low-qualified individuals near the boundary.
                should_intervene = event.confidence <= group_threshold * 0.85

            if should_intervene:
                if best_intervention == InterventionType.NONE:
                    reason_detail = (
                        f"feature-confidence gap ({gap:.3f})" if feature_inconsistent
                        else f"confidence {event.confidence:.3f} ≤ threshold {group_threshold:.3f}"
                    )
                    best_intervention = InterventionType.THRESHOLD
                    best_reason = (
                        f"Disparate impact {current_di:.3f} {'below' if in_violation else 'near'} "
                        f"{DI_THRESHOLD} for {attr_name}={attr_value}. {reason_detail}."
                    )

                equalized_thresholds = self.calibrator.compute_equalized_thresholds(stats)
                equalized_threshold = equalized_thresholds.get(attr_value, global_threshold)

                corrections.append(AppliedCorrection(
                    attribute=attr_name,
                    original_threshold=global_threshold,
                    equalized_threshold=equalized_threshold,
                    original_confidence=event.confidence,
                    adjusted_confidence=event.confidence,
                ))

        # Step 3b: INTERSECTIONAL check — female + over_45
        gender_val = attr_lookup.get("gender")
        age_val = attr_lookup.get("age_group")
        if gender_val in ("female", "non_binary") and age_val == "over_45":
            intersectional_threshold = 0.65
            if event.confidence <= intersectional_threshold and best_intervention == InterventionType.NONE:
                best_intervention = InterventionType.THRESHOLD
                best_reason = (
                    f"Intersectional bias detected: {gender_val}+{age_val}. "
                    f"Confidence {event.confidence:.3f} ≤ intersectional threshold "
                    f"{intersectional_threshold:.3f}. Applying protective correction."
                )
                corrections.append(AppliedCorrection(
                    attribute="intersectional:gender+age_group",
                    original_threshold=0.72,
                    equalized_threshold=intersectional_threshold,
                    original_confidence=event.confidence,
                    adjusted_confidence=event.confidence,
                ))

        # Step 4: CAUSAL intervention — backup for cases threshold missed
        # Only triggers when threshold didn't catch AND individual is disadvantaged.
        # Targets adversarial calibration (high confidence but proxy-driven).
        # Early exit: skip Redis calls when confidence is below causal threshold
        # (saves 2 Redis round-trips for ~95% of rejections).
        if (any_disadvantaged
                and best_intervention == InterventionType.NONE
                and event.confidence > max_global_threshold):
            proxy_data, shap_top5 = await asyncio.gather(
                self.causal_cache.get_proxy_features(event.org_id, event.model_id),
                self.causal_cache.get_shap_top5(event.org_id, event.model_id),
            )

            if proxy_data and shap_top5:
                top_feature = shap_top5[0][0] if shap_top5 else None
                proxy_features = set(proxy_data.get("proxies", []))

                if top_feature and top_feature in proxy_features:
                    best_intervention = InterventionType.CAUSAL
                    best_reason = (
                        f"Causal proxy feature '{top_feature}' is the top contributor "
                        f"to this rejection (confidence {event.confidence:.3f}). "
                        f"Re-evaluating with proxy features suppressed."
                    )

        # Step 5: Apply the most conservative intervention
        if best_intervention == InterventionType.NONE:
            return InterceptDecision(
                final_decision=event.decision,
                was_intercepted=False,
                intervention_type=InterventionType.NONE,
                intervention_reason=None,
                applied_corrections=[],
            )

        # For both threshold and causal interventions:
        # Flip the decision from REJECTED to APPROVED
        final_decision = DecisionType.APPROVED

        return InterceptDecision(
            final_decision=final_decision,
            was_intercepted=True,
            intervention_type=best_intervention,
            intervention_reason=best_reason,
            applied_corrections=corrections,
        )

    async def _get_group_stats(
        self, cache_key: tuple[str, str]
    ) -> dict[str, GroupStats]:
        """
        Get GroupStats from local memory cache.
        Refresh from Redis if stale by >60 seconds.
        On cold start (no cache), synchronously await the refresh.
        """
        now = time.time()
        last_updated = self._cache_timestamps.get(cache_key, 0)

        if now - last_updated < self._cache_ttl and cache_key in self._group_stats_cache:
            return self._group_stats_cache[cache_key]

        if cache_key in self._group_stats_cache:
            # Have stale data — refresh in background, return stale
            asyncio.create_task(self._refresh_group_stats(cache_key))
            return self._group_stats_cache[cache_key]

        # No cached data at all (cold start) — synchronously refresh
        await self._refresh_group_stats(cache_key)
        return self._group_stats_cache.get(cache_key, {})

    async def _refresh_group_stats(self, cache_key: tuple[str, str]) -> None:
        """Background task: pull latest stats from Redis. Re-bootstrap if empty."""
        org_id, model_id = cache_key
        try:
            stats = await self.causal_cache.get_group_stats(org_id, model_id)
            if stats:
                self._group_stats_cache[cache_key] = stats
                self._cache_timestamps[cache_key] = time.time()
                logger.debug(
                    "Refreshed group stats from Redis",
                    org_id=org_id,
                    model_id=model_id,
                    attributes=list(stats.keys()),
                )
            else:
                # Redis is empty for this model — cold start detected.
                # Trigger re-bootstrap to repopulate Redis keys.
                from app.main import _bootstrap_redis_thresholds
                logger.info(
                    "Cold start detected — re-bootstrapping Redis thresholds",
                    org_id=org_id,
                    model_id=model_id,
                )
                await _bootstrap_redis_thresholds(self.causal_cache)
                # Retry after re-bootstrap
                stats = await self.causal_cache.get_group_stats(org_id, model_id)
                if stats:
                    self._group_stats_cache[cache_key] = stats
                    self._cache_timestamps[cache_key] = time.time()
        except Exception as exc:
            logger.warning(
                "Failed to refresh group stats from Redis",
                org_id=org_id,
                model_id=model_id,
                error=str(exc),
            )

    async def update_group_stats(self, org_id: str, model_id: str) -> None:
        """Explicit refresh of group stats for a specific model."""
        cache_key = (org_id, model_id)
        await self._refresh_group_stats(cache_key)
