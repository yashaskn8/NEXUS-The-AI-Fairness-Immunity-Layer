"""
NEXUS Gemini Narrator — Human-readable bias explanations powered by Gemini 1.5 Pro.
"""
from __future__ import annotations

import hashlib
import json
import os
import time
from typing import Any

import httpx
import structlog

from nexus_types.models import FairnessMetric, RemediationAction

logger = structlog.get_logger(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent"
MAX_RETRIES = 3
CACHE_TTL_HOURS = 1


class GeminiNarrator:
    """
    Generates human-readable explanations of bias violations using Gemini API.
    Caches responses for 1 hour to avoid redundant API calls.
    """

    def __init__(self) -> None:
        self._cache: dict[str, tuple[float, str]] = {}

    async def narrate_violation(
        self,
        metric: FairnessMetric,
        causal_data: dict[str, Any],
        shap_data: dict[str, Any],
        actions: list[RemediationAction],
    ) -> str:
        """
        Generate a 3-paragraph executive narrative about a bias violation.
        """
        # Check cache
        cache_key = self._make_cache_key(metric, causal_data)
        cached = self._check_cache(cache_key)
        if cached:
            return cached

        # Build causal chain description
        causal_chain = self._format_causal_chain(causal_data)
        top_features = self._format_top_features(shap_data)
        auto_actions = self._format_auto_actions(actions)

        prompt = (
            "You are a fairness compliance officer briefing a non-technical executive.\n"
            "Write exactly 3 short paragraphs (max 4 sentences each):\n"
            "Paragraph 1: What this bias means in human terms. Be concrete: "
            "describe a real person who would be harmed by this decision pattern.\n"
            "Paragraph 2: The technical root cause, explained without jargon. "
            f"Use the causal chain: {causal_chain}.\n"
            "Paragraph 3: What NEXUS is doing automatically, and what the projected "
            "outcome is. Be specific about numbers.\n"
            f"Context: {metric.metric_name.value} violation. "
            f"{metric.protected_attribute}: {metric.comparison_group} "
            f"approval rate {metric.value:.3f} vs {metric.reference_group} rate "
            f"{metric.threshold:.3f}.\n"
            f"Threshold: {metric.threshold}. Domain: related to AI decisions.\n"
            f"Top causal features: {top_features}.\n"
            f"Auto-applying: {auto_actions}.\n"
            "Do not use headers. Output only the three paragraphs."
        )

        narrative = await self._call_gemini(prompt)

        if narrative:
            self._set_cache(cache_key, narrative)

        return narrative or self._fallback_narrative(metric, actions)

    async def narrate_global_insight(
        self,
        insight_type: str,
        data: dict[str, Any],
    ) -> str:
        """
        Generate narrative for global federated insights.
        Used for the "AI Conscience Feed" in the dashboard.
        """
        cache_key = f"global:{insight_type}:{hashlib.md5(json.dumps(data, sort_keys=True).encode()).hexdigest()}"
        cached = self._check_cache(cache_key)
        if cached:
            return cached

        prompt = (
            "You are a fairness AI analyst writing for the NEXUS AI Conscience Feed.\n"
            "Write a 2-paragraph insight for AI ethics officers.\n"
            f"Insight type: {insight_type}\n"
            f"Data: {json.dumps(data, default=str)}\n"
            "Paragraph 1: What this means for the industry (2-3 sentences).\n"
            "Paragraph 2: What organisations should do about it (2-3 sentences).\n"
            "Tone: authoritative but accessible. No headers."
        )

        narrative = await self._call_gemini(prompt)

        if narrative:
            self._set_cache(cache_key, narrative)

        return narrative or f"Global insight: {insight_type}. {json.dumps(data, default=str)}"

    async def _call_gemini(self, prompt: str) -> str | None:
        """Call Gemini API with exponential backoff retry."""
        if not GEMINI_API_KEY:
            logger.warning("Gemini API key not configured")
            return None

        backoff_seconds = [1, 2, 4]

        async with httpx.AsyncClient(timeout=30.0) as client:
            for attempt in range(MAX_RETRIES):
                try:
                    response = await client.post(
                        f"{GEMINI_ENDPOINT}?key={GEMINI_API_KEY}",
                        json={
                            "contents": [{
                                "parts": [{"text": prompt}]
                            }],
                            "generationConfig": {
                                "temperature": 0.7,
                                "maxOutputTokens": 500,
                            },
                        },
                    )

                    if response.status_code == 200:
                        result = response.json()
                        candidates = result.get("candidates", [])
                        if candidates:
                            content = candidates[0].get("content", {})
                            parts = content.get("parts", [])
                            if parts:
                                return parts[0].get("text", "")
                        return None

                    logger.warning(
                        "Gemini API error",
                        status=response.status_code,
                        attempt=attempt + 1,
                    )

                except Exception as exc:
                    logger.warning(
                        "Gemini API call failed",
                        error=str(exc),
                        attempt=attempt + 1,
                    )

                if attempt < MAX_RETRIES - 1:
                    import asyncio
                    await asyncio.sleep(backoff_seconds[attempt])

        return None

    def _make_cache_key(self, metric: FairnessMetric, causal_data: dict[str, Any]) -> str:
        """Generate a cache key from metric data."""
        key_parts = f"{metric.metric_name.value}:{metric.protected_attribute}:{metric.comparison_group}:{metric.value:.2f}"
        return hashlib.md5(key_parts.encode()).hexdigest()

    def _check_cache(self, key: str) -> str | None:
        """Check if a valid cached response exists."""
        if key in self._cache:
            timestamp, value = self._cache[key]
            if time.time() - timestamp < CACHE_TTL_HOURS * 3600:
                return value
            del self._cache[key]
        return None

    def _set_cache(self, key: str, value: str) -> None:
        """Cache a response."""
        self._cache[key] = (time.time(), value)

    def _format_causal_chain(self, causal_data: dict[str, Any]) -> str:
        """Format causal chain for the prompt."""
        if not causal_data:
            return "No causal graph data available"
        proxies = causal_data.get("proxies", [])
        if proxies:
            return f"Proxy features [{', '.join(proxies[:3])}] → protected attribute → biased outcome"
        return "Direct feature → outcome relationship detected"

    def _format_top_features(self, shap_data: dict[str, Any]) -> str:
        """Format top SHAP features for the prompt."""
        if not shap_data:
            return "Not available"
        top = shap_data.get("top_global_features", [])
        if top:
            return ", ".join(f"{f[0]} ({f[1]:.3f})" for f in top[:3])
        return "Not available"

    def _format_auto_actions(self, actions: list[RemediationAction]) -> str:
        """Format auto-apply actions for the prompt."""
        auto = [a for a in actions if a.can_auto_apply]
        if not auto:
            return "No automatic actions"
        return "; ".join(a.action_type.value for a in auto)

    def _fallback_narrative(
        self, metric: FairnessMetric, actions: list[RemediationAction]
    ) -> str:
        """Fallback narrative when Gemini is unavailable."""
        auto_actions = [a for a in actions if a.can_auto_apply]

        return (
            f"A {metric.metric_name.value} violation has been detected for "
            f"{metric.protected_attribute} (group: {metric.comparison_group}). "
            f"The current value is {metric.value:.3f}, which is "
            f"{'below' if metric.metric_name.value == 'disparate_impact' else 'above'} "
            f"the regulatory threshold of {metric.threshold}. "
            f"This means that certain individuals may be receiving unfair outcomes based on their "
            f"demographic characteristics.\n\n"
            f"NEXUS has identified the root cause and is applying {len(auto_actions)} "
            f"automatic remediation action(s). The system will continue monitoring this metric "
            f"at increased frequency until compliance is restored."
        )
