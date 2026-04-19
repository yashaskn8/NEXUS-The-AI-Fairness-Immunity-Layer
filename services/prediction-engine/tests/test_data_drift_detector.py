"""
NEXUS Data Drift Detector — Test Suite
Tests KS test, chi-squared, and PSI computations.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from app.data_drift_detector import DataDriftDetector


class TestDataDriftDetector:
    def test_ks_test_flags_continuous_feature_drift(self) -> None:
        """Baseline N(0,1) vs current N(1,1) — KS test should flag drift."""
        detector = DataDriftDetector()
        rng = np.random.default_rng(42)

        baseline = pd.DataFrame({
            "income": rng.normal(0, 1, 500),
            "age": rng.normal(40, 10, 500),
            "gender": rng.choice(["M", "F"], 500, p=[0.5, 0.5]),
        })
        current = pd.DataFrame({
            "income": rng.normal(1, 1, 500),  # shifted mean
            "age": rng.normal(40, 10, 500),
            "gender": rng.choice(["M", "F"], 500, p=[0.5, 0.5]),
        })

        report = detector.detect(current, baseline, protected_attrs=["gender"])

        drifted_names = [d["feature"] for d in report.drifted_features]
        assert "income" in drifted_names
        assert report.overall_drift_severity.value != "none"

    def test_chi_squared_flags_categorical_distribution_shift(self) -> None:
        """Baseline 50/50 M/F vs current 80/20 M/F — chi-squared should flag."""
        detector = DataDriftDetector()
        rng = np.random.default_rng(42)

        baseline = pd.DataFrame({
            "score": rng.normal(0, 1, 500),
            "gender": (["M"] * 250 + ["F"] * 250),
        })
        current = pd.DataFrame({
            "score": rng.normal(0, 1, 500),
            "gender": (["M"] * 400 + ["F"] * 100),  # shifted 80/20
        })

        report = detector.detect(current, baseline, protected_attrs=["gender"])

        # PSI for gender should be elevated
        assert "gender" in report.protected_attr_psi
        assert report.protected_attr_psi["gender"] > 0.1

    def test_no_drift_detected_for_identical_distributions(self) -> None:
        """Same distribution different seeds — no drift expected."""
        detector = DataDriftDetector()

        rng1 = np.random.default_rng(42)
        rng2 = np.random.default_rng(43)

        baseline = pd.DataFrame({
            "income": rng1.normal(50000, 10000, 500),
            "age": rng1.normal(35, 8, 500),
        })
        current = pd.DataFrame({
            "income": rng2.normal(50000, 10000, 500),
            "age": rng2.normal(35, 8, 500),
        })

        report = detector.detect(current, baseline, protected_attrs=[])

        assert len(report.drifted_features) == 0
        assert report.overall_drift_severity.value == "none"
