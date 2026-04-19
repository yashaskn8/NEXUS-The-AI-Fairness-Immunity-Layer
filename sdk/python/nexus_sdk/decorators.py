"""
NEXUS SDK Decorators — @intercept_decision and @monitor_decision.
Wrap any model function to add bias monitoring or interception.
"""
from __future__ import annotations

import functools
import os
from typing import Any, Callable, Optional

from nexus_sdk.client import NexusClient


def intercept_decision(
    api_key: Optional[str] = None,
    org_id: Optional[str] = None,
    model_id: Optional[str] = None,
    domain: str = "hiring",
    base_url: str = "https://api.nexus.ai",
) -> Callable[..., Any]:
    """
    @intercept_decision decorator.
    Wraps f(features, protected_attributes) -> (decision, confidence).
    In intercept mode: returns NEXUS's fair decision, not the raw model output.
    """
    _api_key = api_key or os.getenv("NEXUS_API_KEY", "")
    _org_id = org_id or os.getenv("NEXUS_ORG_ID", "")
    _model_id = model_id or os.getenv("NEXUS_MODEL_ID", "")

    client = NexusClient(
        api_key=_api_key,
        org_id=_org_id,
        model_id=_model_id,
        domain=domain,
        mode="intercept",
        base_url=base_url,
    )

    def decorator(func: Callable[..., tuple[str, float]]) -> Callable[..., tuple[str, float]]:
        @functools.wraps(func)
        def wrapper(
            features: dict[str, Any],
            protected_attributes: Optional[dict[str, str]] = None,
            **kwargs: Any,
        ) -> tuple[str, float]:
            # Call the original function
            decision, confidence = func(features, protected_attributes, **kwargs)

            # Intercept with NEXUS
            result = client.log_decision(
                decision=decision,
                confidence=confidence,
                features=features,
                protected_attributes=protected_attributes,
            )

            if result and result.was_intercepted:
                return result.final_decision, confidence
            return decision, confidence

        wrapper._nexus_client = client  # type: ignore
        return wrapper

    return decorator


def monitor_decision(
    api_key: Optional[str] = None,
    org_id: Optional[str] = None,
    model_id: Optional[str] = None,
    domain: str = "hiring",
    base_url: str = "https://api.nexus.ai",
) -> Callable[..., Any]:
    """
    @monitor_decision decorator.
    Wraps f(features, protected_attributes) -> (decision, confidence).
    Logs asynchronously. Returns original decision unchanged.
    """
    _api_key = api_key or os.getenv("NEXUS_API_KEY", "")
    _org_id = org_id or os.getenv("NEXUS_ORG_ID", "")
    _model_id = model_id or os.getenv("NEXUS_MODEL_ID", "")

    client = NexusClient(
        api_key=_api_key,
        org_id=_org_id,
        model_id=_model_id,
        domain=domain,
        mode="async",
        base_url=base_url,
    )

    def decorator(func: Callable[..., tuple[str, float]]) -> Callable[..., tuple[str, float]]:
        @functools.wraps(func)
        def wrapper(
            features: dict[str, Any],
            protected_attributes: Optional[dict[str, str]] = None,
            **kwargs: Any,
        ) -> tuple[str, float]:
            # Call the original function
            decision, confidence = func(features, protected_attributes, **kwargs)

            # Log asynchronously (fire-and-forget)
            client.log_decision(
                decision=decision,
                confidence=confidence,
                features=features,
                protected_attributes=protected_attributes,
            )

            # Return original decision unchanged
            return decision, confidence

        wrapper._nexus_client = client  # type: ignore
        return wrapper

    return decorator
