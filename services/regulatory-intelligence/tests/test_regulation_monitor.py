"""
NEXUS Regulation Monitor — Test Suite
Tests content change detection, Gemini analysis, and error handling.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.regulation_monitor import RegulationMonitor


class TestRegulationMonitor:
    @pytest.mark.asyncio
    async def test_no_update_when_content_hash_unchanged(self) -> None:
        """If content hash matches cached hash, skip Gemini call."""
        monitor = RegulationMonitor()

        source = {
            "name": "EU AI Act",
            "url": "https://example.com",
            "domains": ["hiring"],
            "jurisdiction": "EU",
        }

        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.text = "Same content as before"
        mock_response.status_code = 200
        mock_client.get = AsyncMock(return_value=mock_response)

        # First call — sets baseline
        result1 = await monitor._check_source(mock_client, source)
        assert result1 is None  # First scan sets baseline, no update

        # Second call — same content hash, should return None
        result2 = await monitor._check_source(mock_client, source)
        assert result2 is None

    @pytest.mark.asyncio
    async def test_gemini_called_when_content_changes(self) -> None:
        """When content hash changes, Gemini analysis should be triggered."""
        monitor = RegulationMonitor()

        source = {
            "name": "US EEOC Guidance",
            "url": "https://example.com",
            "domains": ["hiring"],
            "jurisdiction": "US",
        }

        mock_client = AsyncMock()

        # First call — baseline
        resp1 = MagicMock()
        resp1.text = "Original content version 1"
        resp1.status_code = 200
        mock_client.get = AsyncMock(return_value=resp1)
        await monitor._check_source(mock_client, source)

        # Second call — different content
        resp2 = MagicMock()
        resp2.text = "Updated content version 2 with new AI regulations"
        resp2.status_code = 200
        mock_client.get = AsyncMock(return_value=resp2)

        with patch.object(monitor, "_analyze_with_gemini", new_callable=AsyncMock) as mock_gemini:
            mock_gemini.return_value = {
                "thresholds": [{"metric": "disparate_impact", "value": 0.85}],
                "domains": ["hiring"],
                "effective_date": "2026-06-01",
                "summary": "New threshold update for hiring domain.",
                "urgency": "medium",
            }

            result = await monitor._check_source(mock_client, source)

        assert result is not None
        assert result.source == "US EEOC Guidance"
        assert len(result.thresholds) > 0
        mock_gemini.assert_called_once()

    @pytest.mark.asyncio
    async def test_invalid_gemini_json_response_does_not_crash(self) -> None:
        """Malformed JSON from Gemini should be handled gracefully."""
        monitor = RegulationMonitor()

        # Test the _analyze_with_gemini method directly with a mock
        source = {"name": "Test Source", "url": "https://example.com", "domains": ["hiring"]}

        with patch("app.regulation_monitor.GEMINI_API_KEY", "test-key"):
            with patch("httpx.AsyncClient") as mock_client_cls:
                mock_client = AsyncMock()
                mock_client.__aenter__ = AsyncMock(return_value=mock_client)
                mock_client.__aexit__ = AsyncMock(return_value=False)

                mock_response = MagicMock()
                mock_response.status_code = 200
                mock_response.json.return_value = {
                    "candidates": [{
                        "content": {
                            "parts": [{"text": "This is not valid JSON at all!!!"}]
                        }
                    }]
                }
                mock_client.post = AsyncMock(return_value=mock_response)
                mock_client_cls.return_value = mock_client

                result = await monitor._analyze_with_gemini("test content", source)

        # Should return None on JSON parse failure, not crash
        assert result is None

    @pytest.mark.asyncio
    async def test_run_returns_list_of_updates(self) -> None:
        """Full run() should return a list of RegulatoryUpdate objects."""
        monitor = RegulationMonitor()

        with patch.object(monitor, "_check_source", new_callable=AsyncMock) as mock_check:
            mock_check.return_value = None  # No updates detected

            with patch.object(monitor, "_write_updates", new_callable=AsyncMock):
                updates = await monitor.run()

        assert isinstance(updates, list)
        assert len(updates) == 0
