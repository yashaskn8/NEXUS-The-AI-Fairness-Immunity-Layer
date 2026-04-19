"""
NEXUS Drift Forecaster — Bias forecasting using Prophet and linear regression.
"You WILL be biased in 7 days if current trends continue."
"""
from __future__ import annotations

import os
import time
from typing import Any, Optional

import numpy as np
import structlog

from nexus_types.models import BiasForecast, MetricName

logger = structlog.get_logger(__name__)


class DriftForecaster:
    """
    Forecasts future bias metric values using time series analysis.
    Uses Prophet when sufficient data is available, falls back to linear regression.
    """

    async def forecast(
        self,
        org_id: str,
        model_id: str,
        metric_name: str,
        attr: str,
        history_days: int = 90,
    ) -> Optional[BiasForecast]:
        """
        Forecast 7-day and 30-day bias metric values.

        Steps:
        1. Pull metric time series from data store
        2. Fit Prophet model (or linear regression fallback)
        3. Forecast future values
        4. Compute P(violation)
        5. Identify trend driver
        """
        # Step 1: Pull time series (from Firestore in this implementation)
        ts_data = await self._pull_time_series(org_id, model_id, metric_name, attr, history_days)

        if not ts_data or len(ts_data) < 5:
            return None

        timestamps = [d["timestamp"] for d in ts_data]
        values = [d["value"] for d in ts_data]

        current_value = values[-1]

        # Determine threshold
        threshold = self._get_threshold(metric_name)

        # Step 2 & 3: Fit model and forecast
        use_prophet = len(ts_data) >= 30
        forecast_result: dict[str, Any]

        if use_prophet:
            forecast_result = self._prophet_forecast(timestamps, values)
        else:
            forecast_result = self._linear_regression_forecast(timestamps, values, threshold)

        forecast_7d = forecast_result["forecast_7d"]
        forecast_30d = forecast_result["forecast_30d"]
        upper_7d = forecast_result.get("upper_7d", forecast_7d * 1.1)
        lower_7d = forecast_result.get("lower_7d", forecast_7d * 0.9)
        upper_30d = forecast_result.get("upper_30d", forecast_30d * 1.1)
        lower_30d = forecast_result.get("lower_30d", forecast_30d * 0.9)

        # Step 4: Compute P(violation)
        p_violation_7d = forecast_result.get("p_violation_7d", 0.0)
        p_violation_30d = forecast_result.get("p_violation_30d", 0.0)

        # Step 5: Identify trend driver
        trend_driver, forecast_basis = self._identify_driver(timestamps, values)

        return BiasForecast(
            org_id=org_id,
            model_id=model_id,
            metric_name=MetricName(metric_name),
            protected_attribute=attr,
            current_value=round(current_value, 4),
            forecast_7d=round(forecast_7d, 4),
            forecast_30d=round(forecast_30d, 4),
            violation_probability_7d=round(p_violation_7d, 4),
            violation_probability_30d=round(p_violation_30d, 4),
            threshold=threshold,
            forecast_basis=forecast_basis,
            trend_driver=trend_driver,
            upper_bound_7d=round(upper_7d, 4),
            lower_bound_7d=round(lower_7d, 4),
            upper_bound_30d=round(upper_30d, 4),
            lower_bound_30d=round(lower_30d, 4),
        )

    def _prophet_forecast(
        self, timestamps: list[float], values: list[float]
    ) -> dict[str, Any]:
        """Forecast using Facebook Prophet."""
        try:
            import pandas as pd
            from prophet import Prophet

            df = pd.DataFrame({
                "ds": pd.to_datetime(timestamps, unit="ms"),
                "y": values,
            })

            model = Prophet(
                yearly_seasonality=False,
                weekly_seasonality=True,
                daily_seasonality=True,
                changepoint_prior_scale=0.05,
            )
            model.fit(df)

            future = model.make_future_dataframe(periods=30, freq="D")
            forecast = model.predict(future)

            n = len(df)
            forecast_7d = float(forecast.iloc[n + 6]["yhat"])
            forecast_30d = float(forecast.iloc[n + 29]["yhat"])
            upper_7d = float(forecast.iloc[n + 6]["yhat_upper"])
            lower_7d = float(forecast.iloc[n + 6]["yhat_lower"])
            upper_30d = float(forecast.iloc[n + 29]["yhat_upper"])
            lower_30d = float(forecast.iloc[n + 29]["yhat_lower"])

            # P(violation) using uncertainty interval
            threshold = self._get_threshold_for_direction(values)
            p_violation_7d = self._compute_p_violation_prophet(
                forecast.iloc[n:n + 7], threshold
            )
            p_violation_30d = self._compute_p_violation_prophet(
                forecast.iloc[n:n + 30], threshold
            )

            return {
                "forecast_7d": forecast_7d,
                "forecast_30d": forecast_30d,
                "upper_7d": upper_7d,
                "lower_7d": lower_7d,
                "upper_30d": upper_30d,
                "lower_30d": lower_30d,
                "p_violation_7d": p_violation_7d,
                "p_violation_30d": p_violation_30d,
            }

        except ImportError:
            logger.warning("Prophet not available, falling back to linear regression")
            return self._linear_regression_forecast(timestamps, values, self._get_threshold_for_direction(values))

    def _linear_regression_forecast(
        self, timestamps: list[float], values: list[float], threshold: float
    ) -> dict[str, Any]:
        """Fallback forecast using linear regression with bootstrap."""
        x = np.array(range(len(values)), dtype=float)
        y = np.array(values, dtype=float)

        # Fit linear regression
        n = len(x)
        x_mean = x.mean()
        y_mean = y.mean()
        ss_xx = np.sum((x - x_mean) ** 2)
        ss_xy = np.sum((x - x_mean) * (y - y_mean))

        slope = ss_xy / ss_xx if ss_xx != 0 else 0.0
        intercept = y_mean - slope * x_mean

        # Points per day (estimate)
        if len(timestamps) > 1:
            avg_interval_ms = (timestamps[-1] - timestamps[0]) / (len(timestamps) - 1)
            points_per_day = 86400000 / max(avg_interval_ms, 1)
        else:
            points_per_day = 48  # ~30 min intervals

        forecast_7d = float(intercept + slope * (n + 7 * points_per_day))
        forecast_30d = float(intercept + slope * (n + 30 * points_per_day))

        # Residual std for uncertainty
        residuals = y - (slope * x + intercept)
        residual_std = float(np.std(residuals)) if len(residuals) > 2 else 0.05

        upper_7d = forecast_7d + 2 * residual_std
        lower_7d = forecast_7d - 2 * residual_std
        upper_30d = forecast_30d + 2 * residual_std * np.sqrt(30 / 7)
        lower_30d = forecast_30d - 2 * residual_std * np.sqrt(30 / 7)

        # Bootstrap P(violation)
        rng = np.random.default_rng(42)
        violations_7d = 0
        violations_30d = 0
        n_bootstrap = 1000

        for _ in range(n_bootstrap):
            noise_7 = rng.normal(0, residual_std)
            noise_30 = rng.normal(0, residual_std * np.sqrt(30 / 7))

            if forecast_7d + noise_7 < threshold:
                violations_7d += 1
            if forecast_30d + noise_30 < threshold:
                violations_30d += 1

        return {
            "forecast_7d": forecast_7d,
            "forecast_30d": forecast_30d,
            "upper_7d": upper_7d,
            "lower_7d": lower_7d,
            "upper_30d": upper_30d,
            "lower_30d": lower_30d,
            "p_violation_7d": violations_7d / n_bootstrap,
            "p_violation_30d": violations_30d / n_bootstrap,
        }

    def _compute_p_violation_prophet(self, forecast_df: Any, threshold: float) -> float:
        """Compute P(violation) from Prophet uncertainty interval."""
        violations = 0
        for _, row in forecast_df.iterrows():
            if row["yhat_lower"] < threshold:
                violations += 1
        return violations / max(len(forecast_df), 1)

    def _identify_driver(
        self, timestamps: list[float], values: list[float]
    ) -> tuple[str, str]:
        """Identify the dominant trend driver using simple decomposition."""
        y = np.array(values, dtype=float)

        if len(y) < 7:
            return "trend", "Insufficient data for decomposition. Using linear trend analysis."

        # Simple trend: linear regression slope
        x = np.arange(len(y))
        slope = np.polyfit(x, y, 1)[0]

        # Seasonality: look for weekly pattern
        if len(y) >= 14:
            # Compute autocorrelation at lag 7
            y_centered = y - y.mean()
            autocorr_7 = np.correlate(y_centered[7:], y_centered[:-7])[0] / (np.var(y_centered) * len(y_centered))
            has_weekly = abs(autocorr_7) > 0.3
        else:
            has_weekly = False

        # Sudden change: look for recent shift
        if len(y) >= 10:
            recent_mean = y[-5:].mean()
            prior_mean = y[-10:-5].mean()
            shift = abs(recent_mean - prior_mean) / max(abs(prior_mean), 0.01)
            has_shift = shift > 0.15
        else:
            has_shift = False

        if has_shift:
            return "sudden_change", (
                f"A sudden shift in the metric was detected in the last 5 data points. "
                f"This suggests a data distribution change rather than gradual drift. "
                f"Recent mean: {y[-5:].mean():.3f}, prior mean: {y[-10:-5].mean():.3f}."
            )
        elif has_weekly:
            return "seasonality", (
                f"A weekly seasonal pattern was detected in the data. "
                f"The metric shows regular fluctuations with a 7-day cycle. "
                f"Overall trend slope: {slope:.4f} per period."
            )
        else:
            direction = "declining" if slope < 0 else "increasing"
            return "trend", (
                f"The dominant driver is a gradual {direction} trend. "
                f"Slope: {slope:.4f} per period. This suggests concept drift "
                f"rather than sudden distribution shift."
            )

    def _get_threshold(self, metric_name: str) -> float:
        """Get default threshold for the metric."""
        thresholds = {
            "disparate_impact": 0.8,
            "demographic_parity": 0.1,
            "equalized_odds": 0.1,
            "predictive_parity": 0.1,
            "individual_fairness": 0.05,
        }
        return thresholds.get(metric_name, 0.8)

    def _get_threshold_for_direction(self, values: list[float]) -> float:
        """Determine threshold based on value range."""
        avg = np.mean(values) if values else 0.5
        return 0.8 if avg > 0.5 else 0.1

    async def _pull_time_series(
        self,
        org_id: str,
        model_id: str,
        metric_name: str,
        attr: str,
        history_days: int,
    ) -> list[dict[str, float]]:
        """Pull metric time series from Firestore."""
        try:
            from google.cloud import firestore as gcp_firestore

            db = gcp_firestore.AsyncClient(
                project=os.getenv("GOOGLE_CLOUD_PROJECT", "nexus-platform")
            )

            cutoff_ms = int((time.time() - history_days * 86400) * 1000)

            query = (
                db.collection("orgs").document(org_id)
                .collection("fairness_metrics")
                .where("model_id", "==", model_id)
                .where("metric_name", "==", metric_name)
                .where("protected_attribute", "==", attr)
                .where("computed_at_ms", ">=", cutoff_ms)
                .order_by("computed_at_ms")
            )

            docs = query.stream()
            results: list[dict[str, float]] = []

            async for doc in docs:
                data = doc.to_dict()
                if data:
                    results.append({
                        "timestamp": data.get("computed_at_ms", 0),
                        "value": data.get("value", 0),
                    })

            return results

        except Exception as exc:
            logger.warning("Failed to pull time series", error=str(exc))
            return []

    async def run_all(self, org_id: str) -> list[BiasForecast]:
        """
        Run forecasts for all (model_id, metric_name, protected_attr) triples.
        Called every 6 hours via Cloud Scheduler.
        """
        forecasts: list[BiasForecast] = []

        try:
            from google.cloud import firestore as gcp_firestore

            db = gcp_firestore.AsyncClient(
                project=os.getenv("GOOGLE_CLOUD_PROJECT", "nexus-platform")
            )

            # Get distinct (model_id, metric_name, protected_attribute) triples
            metrics_ref = db.collection("orgs").document(org_id).collection("fairness_metrics")
            docs = metrics_ref.order_by("computed_at_ms", direction="DESCENDING").limit(100).stream()

            seen_triples: set[tuple[str, str, str]] = set()
            async for doc in docs:
                data = doc.to_dict()
                if data:
                    triple = (
                        data.get("model_id", ""),
                        data.get("metric_name", ""),
                        data.get("protected_attribute", ""),
                    )
                    if triple[0] and triple[1]:
                        seen_triples.add(triple)

            for model_id, metric_name, attr in seen_triples:
                forecast = await self.forecast(
                    org_id=org_id,
                    model_id=model_id,
                    metric_name=metric_name,
                    attr=attr,
                )
                if forecast:
                    forecasts.append(forecast)

                    # Write to Firestore
                    doc_ref = db.collection("orgs").document(org_id).collection("forecasts").document(forecast.forecast_id)
                    await doc_ref.set(forecast.model_dump())

            logger.info(
                "Forecast run complete",
                org_id=org_id,
                forecast_count=len(forecasts),
            )

        except Exception as exc:
            logger.error("Forecast run_all failed", org_id=org_id, error=str(exc))

        return forecasts
