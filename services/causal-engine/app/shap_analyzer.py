"""
NEXUS SHAP Analyzer — Feature attribution analysis for bias detection.
"""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
import structlog
from scipy.stats import ks_2samp

from nexus_types.models import SHAPResult, SingleExplanation

logger = structlog.get_logger(__name__)


class SHAPAnalyzer:
    """
    Analyzes feature contributions to decisions using SHAP values.
    Trains LightGBM surrogate and computes TreeExplainer values.
    """

    def analyze(
        self,
        events_df: pd.DataFrame,
        model_id: str,
        protected_attributes: list[str] | None = None,
    ) -> SHAPResult:
        """
        Full SHAP analysis:
        1. Train LightGBM surrogate on features → decision
        2. Compute SHAP TreeExplainer values
        3. Identify group-divergent features
        4. Calculate proxy SHAP contribution
        """
        if protected_attributes is None:
            protected_attributes = []

        feature_cols = [
            c for c in events_df.columns
            if c not in protected_attributes
            and c not in ("event_id", "org_id", "model_id", "timestamp", "individual_id", "decision", "confidence", "true_label")
        ]

        if not feature_cols or len(events_df) < 10:
            return SHAPResult(
                model_id=model_id,
                top_global_features=[],
                group_divergent_features=[],
                proxy_shap_contribution=0.0,
            )

        # Encode target
        from sklearn.preprocessing import LabelEncoder
        le = LabelEncoder()
        y = le.fit_transform(events_df["decision"].astype(str))

        # Prepare feature matrix
        X = events_df[feature_cols].copy()
        # Handle categoricals
        for col in X.columns:
            if X[col].dtype == object:
                X[col] = LabelEncoder().fit_transform(X[col].astype(str))
        X = X.fillna(0).values

        try:
            import lightgbm as lgb
            import shap

            # Step 1: Train surrogate
            surrogate = lgb.LGBMClassifier(
                n_estimators=100,
                max_depth=5,
                verbose=-1,
                random_state=42,
            )
            surrogate.fit(X, y)

            # Step 2: SHAP TreeExplainer
            explainer = shap.TreeExplainer(surrogate)
            shap_values = explainer.shap_values(X)

            # Handle multi-class output
            if isinstance(shap_values, list):
                shap_values = shap_values[1] if len(shap_values) > 1 else shap_values[0]

            shap_array = np.array(shap_values)

            # Step 3: Top global features (by mean absolute SHAP)
            mean_abs_shap = np.mean(np.abs(shap_array), axis=0)
            top_indices = np.argsort(mean_abs_shap)[::-1][:5]
            top_global_features = [
                (feature_cols[i], round(float(mean_abs_shap[i]), 4))
                for i in top_indices
            ]

            # Step 4: Group-divergent features
            group_divergent_features: list[str] = []
            total_shap = float(np.sum(mean_abs_shap))

            for pa in protected_attributes:
                if pa not in events_df.columns:
                    continue

                groups = events_df[pa].unique()
                if len(groups) < 2:
                    continue

                for i, feat in enumerate(feature_cols):
                    group_shaps: list[np.ndarray] = []
                    for group in groups:
                        mask = events_df[pa].values == group
                        group_shap = shap_array[mask, i]
                        if len(group_shap) > 5:
                            group_shaps.append(group_shap)

                    # KS test between groups
                    if len(group_shaps) >= 2:
                        stat, p_val = ks_2samp(group_shaps[0], group_shaps[1])
                        if p_val < 0.05:
                            group_divergent_features.append(feat)

            # Step 5: Proxy SHAP contribution
            # Identify proxy features (those correlated with protected attributes)
            proxy_contribution = 0.0
            for pa in protected_attributes:
                if pa not in events_df.columns:
                    continue
                for i, feat in enumerate(feature_cols):
                    try:
                        corr = abs(events_df[feat].astype(float).corr(
                            events_df[pa].astype(float) if events_df[pa].dtype != object
                            else pd.Series(LabelEncoder().fit_transform(events_df[pa]))
                        ))
                        if corr > 0.3:  # Proxy threshold
                            proxy_contribution += float(mean_abs_shap[i])
                    except (ValueError, TypeError):
                        pass

            proxy_shap_pct: float | None = proxy_contribution / total_shap if total_shap > 0 else 0.0

            # Step 6: Bootstrap Confidence Intervals & Stability
            shap_ci_lower: dict[str, float] = {}
            shap_ci_upper: dict[str, float] = {}
            result_stability = "high"
            max_width = 0.0
            
            n_samples = len(X)
            if n_samples >= 10:
                n_boot = 50
                subsample_size = max(5, int(n_samples * 0.5))
                feature_means: dict[str, list[float]] = {feat: [] for feat in feature_cols}
                
                rng = np.random.default_rng(42)
                for _ in range(n_boot):
                    indices = rng.choice(n_samples, size=subsample_size, replace=True)
                    X_sub = X[indices]
                    shap_sub = explainer.shap_values(X_sub)
                    if isinstance(shap_sub, list):
                        shap_sub = shap_sub[1] if len(shap_sub) > 1 else shap_sub[0]
                    sub_mean_abs = np.mean(np.abs(np.array(shap_sub)), axis=0)
                    for i, feat in enumerate(feature_cols):
                        feature_means[feat].append(sub_mean_abs[i])
                
                for i, feat in enumerate(feature_cols):
                    p5 = float(np.percentile(feature_means[feat], 5))
                    p95 = float(np.percentile(feature_means[feat], 95))
                    shap_ci_lower[feat] = round(p5, 4)
                    shap_ci_upper[feat] = round(p95, 4)
                    width = p95 - p5
                    if width > max_width:
                        max_width = width
                
                if max_width > 0.15:
                    result_stability = "low"
                elif max_width > 0.05:
                    result_stability = "medium"
            else:
                result_stability = "low"
            
            if result_stability == "low":
                logger.warning(
                    "SHAP results unstable (insufficient data) — zeroing proxy contribution to prevent false intervention",
                    model_id=model_id,
                    max_width=max_width if n_samples >= 10 else -1
                )
                proxy_shap_pct = None

            result = SHAPResult(
                model_id=model_id,
                top_global_features=top_global_features,
                group_divergent_features=list(set(group_divergent_features)),
                proxy_shap_contribution=round(proxy_shap_pct, 4) if proxy_shap_pct is not None else None,
                shap_ci_lower=shap_ci_lower,
                shap_ci_upper=shap_ci_upper,
                result_stability=result_stability
            )

            logger.info(
                "SHAP analysis complete",
                model_id=model_id,
                top_features=[f[0] for f in top_global_features],
                divergent_count=len(group_divergent_features),
                proxy_contribution=round(proxy_shap_pct, 4) if proxy_shap_pct is not None else None,
                stability=result_stability
            )

            return result

        except ImportError:
            logger.warning("LightGBM/SHAP not available — using correlation fallback")
            # Fallback: use correlation-based feature importance
            correlations = []
            for col in feature_cols:
                try:
                    corr = abs(events_df[col].astype(float).corr(pd.Series(y)))
                    correlations.append((col, round(float(corr), 4)))
                except (ValueError, TypeError):
                    correlations.append((col, 0.0))

            correlations.sort(key=lambda x: x[1], reverse=True)
            return SHAPResult(
                model_id=model_id,
                top_global_features=correlations[:5],
                group_divergent_features=[],
                proxy_shap_contribution=0.0,
            )

    def explain_single(
        self,
        event_features: dict[str, Any],
        feature_cols: list[str],
        surrogate_model: Any,
    ) -> SingleExplanation:
        """SHAP values for one event. Used by counterfactual simulator."""
        try:
            import shap

            X = np.array([[event_features.get(f, 0) for f in feature_cols]])
            explainer = shap.TreeExplainer(surrogate_model)
            shap_values = explainer.shap_values(X)

            if isinstance(shap_values, list):
                shap_values = shap_values[1] if len(shap_values) > 1 else shap_values[0]

            shap_dict = {feat: round(float(val), 4) for feat, val in zip(feature_cols, shap_values[0])}

            # Top features by absolute SHAP
            sorted_features = sorted(shap_dict.items(), key=lambda x: abs(x[1]), reverse=True)

            return SingleExplanation(
                event_id="",
                shap_values=shap_dict,
                top_features=sorted_features[:5],
            )
        except Exception as exc:
            logger.warning("Single explanation failed", error=str(exc))
            return SingleExplanation(event_id="", shap_values={}, top_features=[])
