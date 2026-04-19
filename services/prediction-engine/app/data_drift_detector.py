"""
NEXUS Data Drift Detector — Monitors input feature distributions for drift.
Detects drift before it affects fairness metrics.
"""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
import structlog
from scipy.stats import chi2_contingency, ks_2samp

from nexus_types.models import DriftReport, Severity

logger = structlog.get_logger(__name__)

PSI_SIGNIFICANT = 0.2
PSI_WARNING = 0.1


class DataDriftDetector:
    """
    Monitors input feature distributions for drift.
    Uses KS test (continuous) and chi-squared test (categorical).
    Also computes Population Stability Index (PSI) for protected attributes.
    """

    def detect(
        self,
        current_features_df: pd.DataFrame,
        baseline_features_df: pd.DataFrame,
        protected_attrs: list[str],
    ) -> DriftReport:
        """
        Detect data drift between current and baseline feature distributions.
        """
        drifted_features: list[dict[str, Any]] = []
        protected_attr_psi: dict[str, float] = {}

        feature_cols = [
            c for c in current_features_df.columns
            if c not in ("event_id", "org_id", "model_id", "timestamp",
                         "individual_id", "decision", "confidence", "true_label")
        ]

        drift_count = 0

        for col in feature_cols:
            if col not in baseline_features_df.columns:
                continue

            current_vals = current_features_df[col].dropna()
            baseline_vals = baseline_features_df[col].dropna()

            if len(current_vals) < 10 or len(baseline_vals) < 10:
                continue

            is_categorical = current_vals.dtype == object or current_vals.nunique() < 10

            if is_categorical:
                # Chi-squared test
                try:
                    current_counts = current_vals.value_counts()
                    baseline_counts = baseline_vals.value_counts()
                    all_categories = set(current_counts.index) | set(baseline_counts.index)

                    observed = [current_counts.get(c, 0) for c in all_categories]
                    expected = [baseline_counts.get(c, 0) for c in all_categories]

                    # Normalize expected to match observed total
                    total_observed = sum(observed)
                    total_expected = sum(expected)
                    if total_expected > 0:
                        expected = [e * total_observed / total_expected for e in expected]

                    # Add small value to avoid zero division
                    expected = [max(e, 0.01) for e in expected]

                    from scipy.stats import chisquare
                    stat, p_value = chisquare(observed, expected)
                    is_drifted = p_value < 0.01

                    if is_drifted:
                        drift_count += 1
                        drifted_features.append({
                            "feature": col,
                            "test": "chi_squared",
                            "statistic": round(float(stat), 4),
                            "p_value": round(float(p_value), 6),
                            "is_categorical": True,
                        })

                except Exception as exc:
                    logger.debug("Chi-squared test failed", feature=col, error=str(exc))

            else:
                # KS test for continuous
                try:
                    stat, p_value = ks_2samp(
                        current_vals.astype(float),
                        baseline_vals.astype(float),
                    )
                    is_drifted = p_value < 0.01

                    if is_drifted:
                        drift_count += 1
                        drifted_features.append({
                            "feature": col,
                            "test": "kolmogorov_smirnov",
                            "statistic": round(float(stat), 4),
                            "p_value": round(float(p_value), 6),
                            "is_categorical": False,
                        })

                except Exception as exc:
                    logger.debug("KS test failed", feature=col, error=str(exc))

        # PSI for protected attributes
        for attr in protected_attrs:
            if attr not in current_features_df.columns or attr not in baseline_features_df.columns:
                continue

            psi = self._compute_psi(
                current_features_df[attr],
                baseline_features_df[attr],
            )
            protected_attr_psi[attr] = round(psi, 4)

        # Overall severity
        total_features = len(feature_cols)
        drift_ratio = drift_count / max(total_features, 1)
        max_psi = max(protected_attr_psi.values()) if protected_attr_psi else 0.0

        if drift_ratio > 0.3 or max_psi > PSI_SIGNIFICANT:
            overall_severity = Severity.CRITICAL
        elif drift_ratio > 0.15 or max_psi > PSI_WARNING:
            overall_severity = Severity.HIGH
        elif drift_ratio > 0.05:
            overall_severity = Severity.MEDIUM
        elif drift_count > 0:
            overall_severity = Severity.LOW
        else:
            overall_severity = Severity.NONE

        # Predicted fairness impact
        predicted_impact = None
        if max_psi > PSI_WARNING:
            predicted_impact = (
                f"Protected attribute distribution has shifted (PSI={max_psi:.3f}). "
                f"This often precedes fairness metric degradation by 1-2 weeks. "
                f"Recommend increasing monitoring frequency."
            )

        report = DriftReport(
            drifted_features=drifted_features,
            protected_attr_psi=protected_attr_psi,
            overall_drift_severity=overall_severity,
            predicted_fairness_impact=predicted_impact,
        )

        logger.info(
            "Data drift detection complete",
            drifted_count=drift_count,
            total_features=total_features,
            severity=overall_severity.value,
            protected_attr_psi=protected_attr_psi,
        )

        return report

    def _compute_psi(self, current: pd.Series, baseline: pd.Series) -> float:
        """
        Compute Population Stability Index (PSI).
        PSI > 0.2 = significant drift.
        """
        try:
            # Get all categories
            all_cats = set(current.unique()) | set(baseline.unique())

            current_counts = current.value_counts(normalize=True)
            baseline_counts = baseline.value_counts(normalize=True)

            psi = 0.0
            epsilon = 1e-4  # Avoid log(0)

            for cat in all_cats:
                p_current = float(current_counts.get(cat, 0)) + epsilon
                p_baseline = float(baseline_counts.get(cat, 0)) + epsilon

                psi += (p_current - p_baseline) * np.log(p_current / p_baseline)

            return float(psi)

        except Exception as exc:
            logger.debug("PSI computation failed", error=str(exc))
            return 0.0
