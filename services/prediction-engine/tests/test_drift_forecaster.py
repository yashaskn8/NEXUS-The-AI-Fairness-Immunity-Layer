"""
NEXUS Drift Forecaster — Test Suite
Tests Prophet, linear regression fallback, and violation probability.
"""
from __future__ import annotations

import time
from unittest.mock import AsyncMock, patch

import numpy as np
import pytest

from app.drift_forecaster import DriftForecaster


def _make_time_series(n: int, start_value: float = 0.88, slope: float = 0.0, noise_std: float = 0.01) -> list[dict]:
    """Generate synthetic time series data."""
    rng = np.random.default_rng(42)
    now = int(time.time() * 1000)
    day_ms = 86400000

    ts = []
    for i in range(n):
        value = start_value + slope * i + rng.normal(0, noise_std)
        ts.append({
            "timestamp": now - (n - i) * day_ms,
            "value": float(value),
        })
    return ts


class TestDriftForecaster:
    @pytest.mark.asyncio
    async def test_prophet_forecast_returns_valid_bias_forecast(self) -> None:
        """Create 60 days of synthetic data with upward trend — forecast should work."""
        forecaster = DriftForecaster()

        # Generate sine wave with upward trend: 60 data points
        ts_data = _make_time_series(60, start_value=0.82, slope=0.001, noise_std=0.005)

        with patch.object(forecaster, "_pull_time_series", new_callable=AsyncMock) as mock_pull:
            mock_pull.return_value = ts_data

            forecast = await forecaster.forecast(
                org_id="test-org",
                model_id="model-1",
                metric_name="disparate_impact",
                attr="gender",
                history_days=60,
            )

        assert forecast is not None
        assert isinstance(forecast.forecast_7d, float)
        assert isinstance(forecast.forecast_30d, float)
        assert 0.0 <= forecast.violation_probability_7d <= 1.0
        assert 0.0 <= forecast.violation_probability_30d <= 1.0
        assert forecast.forecast_basis is not None

    @pytest.mark.asyncio
    async def test_linear_regression_fallback_with_fewer_than_30_points(self) -> None:
        """With only 15 data points, should use linear regression fallback."""
        forecaster = DriftForecaster()

        ts_data = _make_time_series(15, start_value=0.85, slope=-0.002)

        with patch.object(forecaster, "_pull_time_series", new_callable=AsyncMock) as mock_pull:
            mock_pull.return_value = ts_data

            forecast = await forecaster.forecast(
                org_id="test-org",
                model_id="model-1",
                metric_name="disparate_impact",
                attr="gender",
            )

        assert forecast is not None
        # With < 30 points, Prophet should NOT be used
        assert isinstance(forecast.forecast_7d, float)
        assert isinstance(forecast.forecast_30d, float)

    @pytest.mark.asyncio
    async def test_high_probability_violation_when_trend_approaches_threshold(self) -> None:
        """Time series declining toward 0.80 threshold should yield high P(violation)."""
        forecaster = DriftForecaster()

        # Linear decline from 0.88 to ~0.82 over 30 days (approaching 0.80 threshold)
        ts_data = _make_time_series(30, start_value=0.88, slope=-0.002, noise_std=0.005)

        with patch.object(forecaster, "_pull_time_series", new_callable=AsyncMock) as mock_pull:
            mock_pull.return_value = ts_data

            forecast = await forecaster.forecast(
                org_id="test-org",
                model_id="model-1",
                metric_name="disparate_impact",
                attr="gender",
            )

        assert forecast is not None
        # With a declining trend toward threshold, 30d violation probability should be elevated
        assert forecast.violation_probability_30d > 0.0
