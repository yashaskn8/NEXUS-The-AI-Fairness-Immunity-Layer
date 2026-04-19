"""
NEXUS Fairness Computer — Computes all five core fairness metrics.
Called by the Pub/Sub consumer every 30 seconds per active (org, model) pair.
"""
from __future__ import annotations

import json
import os
from typing import Any, Optional

import numpy as np
import pandas as pd
import structlog

from nexus_types.models import FairnessMetric, MetricName, Severity

logger = structlog.get_logger(__name__)


def _compute_severity(value: float, threshold: float, metric_name: MetricName) -> Severity:
    """Determine severity based on how far the value is from the threshold."""
    if metric_name == MetricName.DISPARATE_IMPACT:
        if value >= threshold:
            return Severity.NONE
        gap = threshold - value
        if gap < 0.05:
            return Severity.LOW
        if gap < 0.10:
            return Severity.MEDIUM
        if gap < 0.20:
            return Severity.HIGH
        return Severity.CRITICAL
    else:
        # For parity-type metrics (absolute difference)
        if abs(value) <= threshold:
            return Severity.NONE
        gap = abs(value) - threshold
        if gap < 0.03:
            return Severity.LOW
        if gap < 0.05:
            return Severity.MEDIUM
        if gap < 0.10:
            return Severity.HIGH
        return Severity.CRITICAL


class FairnessComputer:
    """Computes all five core fairness metrics for a given dataset."""

    def __init__(self) -> None:
        self._regulatory_standards: dict[str, Any] | None = None

    def demographic_parity(
        self,
        df: pd.DataFrame,
        attr: str,
        ref_group: str,
        window: int,
    ) -> list[FairnessMetric]:
        """
        P(approved|group=A) - P(approved|group=ref). Threshold ±0.1.
        """
        if len(df) < 10:
            return []

        threshold = 0.1
        results: list[FairnessMetric] = []

        if attr not in df.columns:
            return []

        groups = df[attr].unique()
        ref_mask = df[attr] == ref_group
        ref_approval_rate = (df.loc[ref_mask, "decision"] == "approved").mean() if ref_mask.sum() > 0 else 0.5

        for group in groups:
            if group == ref_group:
                continue

            group_mask = df[attr] == group
            group_count = group_mask.sum()
            if group_count < 5:
                continue

            group_approval_rate = (df.loc[group_mask, "decision"] == "approved").mean()
            dp_value = group_approval_rate - ref_approval_rate
            is_violated = abs(dp_value) > threshold
            severity = _compute_severity(dp_value, threshold, MetricName.DEMOGRAPHIC_PARITY)

            results.append(FairnessMetric(
                org_id=str(df["org_id"].iloc[0]) if "org_id" in df.columns else "",
                model_id=str(df["model_id"].iloc[0]) if "model_id" in df.columns else "",
                metric_name=MetricName.DEMOGRAPHIC_PARITY,
                protected_attribute=attr,
                comparison_group=str(group),
                reference_group=ref_group,
                value=round(dp_value, 4),
                threshold=threshold,
                is_violated=is_violated,
                severity=severity,
                window_seconds=window,
                sample_count=int(group_count),
            ))

        return results

    def disparate_impact(
        self,
        df: pd.DataFrame,
        attr: str,
        ref_group: str,
        window: int,
    ) -> list[FairnessMetric]:
        """
        P(approved|minority) / P(approved|majority). Threshold 0.8 (EEOC).
        """
        if len(df) < 10:
            return []

        threshold = 0.8
        results: list[FairnessMetric] = []

        if attr not in df.columns:
            return []

        groups = df[attr].unique()
        ref_mask = df[attr] == ref_group
        ref_approval_rate = (df.loc[ref_mask, "decision"] == "approved").mean() if ref_mask.sum() > 0 else 0.5

        if ref_approval_rate == 0:
            return []

        for group in groups:
            if group == ref_group:
                continue

            group_mask = df[attr] == group
            group_count = group_mask.sum()
            if group_count < 5:
                continue

            group_approval_rate = (df.loc[group_mask, "decision"] == "approved").mean()
            di_value = group_approval_rate / ref_approval_rate
            is_violated = di_value < threshold
            severity = _compute_severity(di_value, threshold, MetricName.DISPARATE_IMPACT)

            results.append(FairnessMetric(
                org_id=str(df["org_id"].iloc[0]) if "org_id" in df.columns else "",
                model_id=str(df["model_id"].iloc[0]) if "model_id" in df.columns else "",
                metric_name=MetricName.DISPARATE_IMPACT,
                protected_attribute=attr,
                comparison_group=str(group),
                reference_group=ref_group,
                value=round(di_value, 4),
                threshold=threshold,
                is_violated=is_violated,
                severity=severity,
                window_seconds=window,
                sample_count=int(group_count),
            ))

        return results

    def equalized_odds(
        self,
        df: pd.DataFrame,
        attr: str,
        ref_group: str,
        window: int,
    ) -> list[FairnessMetric]:
        """
        Max(|TPR_A - TPR_ref|, |FPR_A - FPR_ref|). Threshold 0.1.
        Uses true_label if available; else confidence-based approximation.
        """
        if len(df) < 10:
            return []

        threshold = 0.1
        results: list[FairnessMetric] = []

        if attr not in df.columns:
            return []

        has_true_label = "true_label" in df.columns and df["true_label"].notna().sum() > 0

        # Create binary prediction and truth columns
        df = df.copy()
        df["predicted_positive"] = (df["decision"] == "approved").astype(int)

        if has_true_label:
            df["actual_positive"] = (df["true_label"] == "approved").astype(int)
        else:
            # Confidence-based approximation
            df["actual_positive"] = (df["confidence"].astype(float) > 0.7).astype(int)

        groups = df[attr].unique()

        # Compute TPR and FPR for reference group
        ref_mask = df[attr] == ref_group
        ref_data = df.loc[ref_mask]
        ref_tp = ((ref_data["predicted_positive"] == 1) & (ref_data["actual_positive"] == 1)).sum()
        ref_fn = ((ref_data["predicted_positive"] == 0) & (ref_data["actual_positive"] == 1)).sum()
        ref_fp = ((ref_data["predicted_positive"] == 1) & (ref_data["actual_positive"] == 0)).sum()
        ref_tn = ((ref_data["predicted_positive"] == 0) & (ref_data["actual_positive"] == 0)).sum()

        ref_tpr = ref_tp / (ref_tp + ref_fn) if (ref_tp + ref_fn) > 0 else 0.0
        ref_fpr = ref_fp / (ref_fp + ref_tn) if (ref_fp + ref_tn) > 0 else 0.0

        for group in groups:
            if group == ref_group:
                continue

            group_mask = df[attr] == group
            group_count = group_mask.sum()
            if group_count < 5:
                continue

            group_data = df.loc[group_mask]
            g_tp = ((group_data["predicted_positive"] == 1) & (group_data["actual_positive"] == 1)).sum()
            g_fn = ((group_data["predicted_positive"] == 0) & (group_data["actual_positive"] == 1)).sum()
            g_fp = ((group_data["predicted_positive"] == 1) & (group_data["actual_positive"] == 0)).sum()
            g_tn = ((group_data["predicted_positive"] == 0) & (group_data["actual_positive"] == 0)).sum()

            g_tpr = g_tp / (g_tp + g_fn) if (g_tp + g_fn) > 0 else 0.0
            g_fpr = g_fp / (g_fp + g_tn) if (g_fp + g_tn) > 0 else 0.0

            eo_value = max(abs(g_tpr - ref_tpr), abs(g_fpr - ref_fpr))
            is_violated = eo_value > threshold
            severity = _compute_severity(eo_value, threshold, MetricName.EQUALIZED_ODDS)

            results.append(FairnessMetric(
                org_id=str(df["org_id"].iloc[0]) if "org_id" in df.columns else "",
                model_id=str(df["model_id"].iloc[0]) if "model_id" in df.columns else "",
                metric_name=MetricName.EQUALIZED_ODDS,
                protected_attribute=attr,
                comparison_group=str(group),
                reference_group=ref_group,
                value=round(eo_value, 4),
                threshold=threshold,
                is_violated=is_violated,
                severity=severity,
                window_seconds=window,
                sample_count=int(group_count),
            ))

        return results

    def predictive_parity(
        self,
        df: pd.DataFrame,
        attr: str,
        ref_group: str,
        window: int,
    ) -> list[FairnessMetric]:
        """
        |PPV_A - PPV_ref| where PPV = precision per group. Threshold 0.1.
        Only compute if true_label is available.
        """
        if len(df) < 10:
            return []

        if "true_label" not in df.columns or df["true_label"].isna().all():
            return []

        threshold = 0.1
        results: list[FairnessMetric] = []

        if attr not in df.columns:
            return []

        df = df.copy()
        df["predicted_positive"] = (df["decision"] == "approved").astype(int)
        df["actual_positive"] = (df["true_label"] == "approved").astype(int)

        groups = df[attr].unique()

        # Reference group PPV
        ref_mask = df[attr] == ref_group
        ref_data = df.loc[ref_mask]
        ref_tp = ((ref_data["predicted_positive"] == 1) & (ref_data["actual_positive"] == 1)).sum()
        ref_fp = ((ref_data["predicted_positive"] == 1) & (ref_data["actual_positive"] == 0)).sum()
        ref_ppv = ref_tp / (ref_tp + ref_fp) if (ref_tp + ref_fp) > 0 else 0.0

        for group in groups:
            if group == ref_group:
                continue

            group_mask = df[attr] == group
            group_count = group_mask.sum()
            if group_count < 5:
                continue

            group_data = df.loc[group_mask]
            g_tp = ((group_data["predicted_positive"] == 1) & (group_data["actual_positive"] == 1)).sum()
            g_fp = ((group_data["predicted_positive"] == 1) & (group_data["actual_positive"] == 0)).sum()
            g_ppv = g_tp / (g_tp + g_fp) if (g_tp + g_fp) > 0 else 0.0

            pp_value = abs(g_ppv - ref_ppv)
            is_violated = pp_value > threshold
            severity = _compute_severity(pp_value, threshold, MetricName.PREDICTIVE_PARITY)

            results.append(FairnessMetric(
                org_id=str(df["org_id"].iloc[0]) if "org_id" in df.columns else "",
                model_id=str(df["model_id"].iloc[0]) if "model_id" in df.columns else "",
                metric_name=MetricName.PREDICTIVE_PARITY,
                protected_attribute=attr,
                comparison_group=str(group),
                reference_group=ref_group,
                value=round(pp_value, 4),
                threshold=threshold,
                is_violated=is_violated,
                severity=severity,
                window_seconds=window,
                sample_count=int(group_count),
            ))

        return results

    def individual_fairness_score(
        self,
        df: pd.DataFrame,
        window: int,
        feature_cols: list[str] | None = None,
    ) -> Optional[FairnessMetric]:
        """
        Sample 200 pairs of similar individuals (cosine similarity > 0.95).
        Compute fraction where decisions differ. Threshold 0.05.
        """
        if len(df) < 20:
            return None

        threshold = 0.05

        if feature_cols is None:
            feature_cols = [
                c for c in df.columns
                if c not in ("event_id", "org_id", "model_id", "timestamp",
                             "individual_id", "decision", "confidence", "true_label")
            ]

        if not feature_cols:
            return None

        # Prepare numeric feature matrix
        from sklearn.preprocessing import LabelEncoder
        X = df[feature_cols].copy()
        for col in X.columns:
            if X[col].dtype == object:
                X[col] = LabelEncoder().fit_transform(X[col].astype(str))
        X = X.fillna(0).values

        # Normalize for cosine similarity
        norms = np.linalg.norm(X, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        X_normalized = X / norms

        # Sample pairs
        n = len(X_normalized)
        max_pairs = 200
        pairs_found = 0
        flips = 0

        decisions = df["decision"].values
        rng = np.random.default_rng(42)

        # Random sampling approach for efficiency
        attempts = 0
        max_attempts = 5000

        while pairs_found < max_pairs and attempts < max_attempts:
            i, j = rng.integers(0, n, size=2)
            if i == j:
                attempts += 1
                continue

            # Cosine similarity
            sim = float(np.dot(X_normalized[i], X_normalized[j]))
            if sim > 0.95:
                pairs_found += 1
                if decisions[i] != decisions[j]:
                    flips += 1

            attempts += 1

        if pairs_found == 0:
            return None

        if_score = flips / pairs_found
        is_violated = if_score > threshold
        severity = _compute_severity(if_score, threshold, MetricName.INDIVIDUAL_FAIRNESS)

        return FairnessMetric(
            org_id=str(df["org_id"].iloc[0]) if "org_id" in df.columns else "",
            model_id=str(df["model_id"].iloc[0]) if "model_id" in df.columns else "",
            metric_name=MetricName.INDIVIDUAL_FAIRNESS,
            protected_attribute=None,
            comparison_group=None,
            reference_group=None,
            value=round(if_score, 4),
            threshold=threshold,
            is_violated=is_violated,
            severity=severity,
            window_seconds=window,
            sample_count=pairs_found,
        )

    def get_regulatory_threshold(
        self,
        metric_name: str,
        domain: str,
        jurisdiction: str,
    ) -> float:
        """
        Load threshold from regulatory_standards.json.
        Keys: domain + jurisdiction + metric.
        """
        if self._regulatory_standards is None:
            self._load_regulatory_standards()

        standards = self._regulatory_standards or {}

        domain_data = standards.get(domain, {})
        jurisdiction_data = domain_data.get(jurisdiction, {})
        metric_data = jurisdiction_data.get(metric_name, {})

        return float(metric_data.get("threshold", self._get_default_threshold(metric_name)))

    def _get_default_threshold(self, metric_name: str) -> float:
        """Default thresholds when regulatory standards not available."""
        defaults = {
            "disparate_impact": 0.8,
            "demographic_parity": 0.1,
            "equalized_odds": 0.1,
            "predictive_parity": 0.1,
            "individual_fairness": 0.05,
        }
        return defaults.get(metric_name, 0.1)

    def _load_regulatory_standards(self) -> None:
        """Load regulatory standards from JSON file."""
        try:
            standards_path = os.path.join(
                os.path.dirname(__file__), "regulatory_standards.json"
            )
            with open(standards_path, "r") as f:
                self._regulatory_standards = json.load(f)
            logger.info("Loaded regulatory standards", path=standards_path)
        except (FileNotFoundError, json.JSONDecodeError) as exc:
            logger.warning("Failed to load regulatory standards", error=str(exc))
            self._regulatory_standards = {}
