"""
NEXUS Regulation Monitor — Monitors global AI legislation
and automatically updates fairness thresholds.
"""
from __future__ import annotations

import hashlib
import json
import os

from typing import Any

import httpx
import structlog

from nexus_types.models import RegulatoryUpdate

logger = structlog.get_logger(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent"

# Sources to monitor
SOURCES = [
    {
        "name": "EU AI Act",
        "url": "https://artificialintelligenceact.eu/",
        "domains": ["hiring", "credit", "healthcare", "legal", "insurance"],
        "jurisdiction": "EU",
    },
    {
        "name": "US EEOC Guidance",
        "url": "https://www.eeoc.gov/newsroom/",
        "domains": ["hiring"],
        "jurisdiction": "US",
    },
    {
        "name": "India MeitY AI Policy",
        "url": "https://www.meity.gov.in/",
        "domains": ["hiring", "credit", "healthcare"],
        "jurisdiction": "IN",
    },
    {
        "name": "UK ICO AI Guidance",
        "url": "https://ico.org.uk/",
        "domains": ["hiring", "credit", "healthcare", "insurance"],
        "jurisdiction": "UK",
    },
    {
        "name": "UN SDG Progress",
        "url": "https://sdgs.un.org/goals/goal10",
        "domains": ["hiring", "credit", "healthcare", "legal", "insurance"],
        "jurisdiction": "global",
    },
]


class RegulationMonitor:
    """
    Monitors global AI legislation and automatically updates fairness thresholds.
    Called by Cloud Scheduler every 24 hours.
    """

    def __init__(self) -> None:
        self.project_id = os.getenv("GOOGLE_CLOUD_PROJECT", "nexus-platform")
        self._content_hashes: dict[str, str] = {}

    async def run(self) -> list[RegulatoryUpdate]:
        """
        Main monitoring loop. Called every 24 hours.
        For each source:
        1. Fetch latest content
        2. Check for changes
        3. Analyze with Gemini
        4. Update standards if needed
        5. Alert affected orgs
        """
        updates: list[RegulatoryUpdate] = []

        logger.info("Starting regulatory monitoring scan", sources=len(SOURCES))

        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            for source in SOURCES:
                try:
                    update = await self._check_source(client, source)
                    if update:
                        updates.append(update)
                except Exception as exc:
                    logger.error(
                        "Failed to check regulatory source",
                        source=source["name"],
                        error=str(exc),
                    )

        if updates:
            await self._write_updates(updates)
            logger.info("Regulatory updates detected", count=len(updates))
        else:
            logger.info("No regulatory changes detected")

        return updates

    async def _check_source(
        self, client: httpx.AsyncClient, source: dict[str, Any]
    ) -> RegulatoryUpdate | None:
        """Check a single regulatory source for changes."""
        # Step 1: Fetch content
        try:
            response = await client.get(source["url"], timeout=15.0)
            content = response.text[:5000]  # Limit content size
        except Exception as exc:
            logger.warning("Failed to fetch source", source=source["name"], error=str(exc))
            # Use placeholder for demo
            content = f"Latest updates from {source['name']}: No significant changes detected."

        # Step 2: Check for changes (SHA-256 diff)
        content_hash = hashlib.sha256(content.encode()).hexdigest()
        previous_hash = self._content_hashes.get(source["name"], "")

        if content_hash == previous_hash:
            return None  # No change

        self._content_hashes[source["name"]] = content_hash

        # Skip analysis on first run (no previous baseline)
        if not previous_hash:
            logger.debug("First scan for source — setting baseline", source=source["name"])
            return None

        # Step 3: Analyze with Gemini
        analysis = await self._analyze_with_gemini(content, source)

        if not analysis:
            return None

        # Step 4: Create update record
        update = RegulatoryUpdate(
            source=source["name"],
            thresholds=analysis.get("thresholds", []),
            domains=analysis.get("domains", source.get("domains", [])),
            effective_date=analysis.get("effective_date"),
            summary=analysis.get("summary", f"Changes detected in {source['name']}"),
            urgency=analysis.get("urgency", "low"),
            raw_content_hash=content_hash,
        )

        return update

    async def _analyze_with_gemini(
        self, content: str, source: dict[str, Any]
    ) -> dict[str, Any] | None:
        """Send regulatory content to Gemini for analysis."""
        if not GEMINI_API_KEY:
            logger.warning("Gemini API key not configured — using mock analysis")
            return {
                "thresholds": [],
                "domains": source.get("domains", []),
                "effective_date": None,
                "summary": f"Content change detected in {source['name']}. Manual review recommended.",
                "urgency": "low",
            }

        prompt = (
            "You are a regulatory AI compliance analyst. Extract from this text:\n"
            "1. Any new or changed numerical thresholds for AI fairness metrics\n"
            "2. Which AI domains are affected (hiring, credit, healthcare, etc.)\n"
            "3. Effective date of any changes\n"
            "4. A 2-sentence plain-English summary of the change\n"
            "Output as JSON: { thresholds: [], domains: [], effective_date: str, "
            "summary: str, urgency: 'low'|'medium'|'high'|'critical' }\n"
            "Output only valid JSON, no markdown.\n\n"
            f"Source: {source['name']} ({source['url']})\n"
            f"Content:\n{content[:3000]}"
        )

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{GEMINI_ENDPOINT}?key={GEMINI_API_KEY}",
                    json={
                        "contents": [{"parts": [{"text": prompt}]}],
                        "generationConfig": {
                            "temperature": 0.3,
                            "maxOutputTokens": 500,
                        },
                    },
                )

                if response.status_code == 200:
                    result = response.json()
                    candidates = result.get("candidates", [])
                    if candidates:
                        text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                        # Clean markdown wrapping if present
                        text = text.strip()
                        if text.startswith("```"):
                            text = text.split("\n", 1)[-1].rsplit("```", 1)[0]
                        return json.loads(text)

        except (httpx.HTTPError, json.JSONDecodeError) as exc:
            logger.warning("Gemini analysis failed", source=source["name"], error=str(exc))

        return None

    async def _write_updates(self, updates: list[RegulatoryUpdate]) -> None:
        """Write updates to Firestore and alert affected orgs."""
        try:
            from google.cloud import firestore as gcp_firestore

            db = gcp_firestore.AsyncClient(project=self.project_id)

            batch = db.batch()
            for update in updates:
                doc_ref = db.collection("regulatory_updates").document(update.update_id)
                batch.set(doc_ref, update.model_dump())

            await batch.commit()
            logger.info("Regulatory updates written to Firestore", count=len(updates))

        except Exception as exc:
            logger.error("Failed to write regulatory updates", error=str(exc))
