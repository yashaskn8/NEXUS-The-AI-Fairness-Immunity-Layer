"""
NEXUS Regulatory Intelligence — FastAPI Main Application.
Monitors global AI legislation and automatically updates fairness thresholds.
"""
from __future__ import annotations

import os
import time
import structlog
from fastapi import FastAPI
from app.regulation_monitor import RegulationMonitor

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer(),
    ],
)

logger = structlog.get_logger(__name__)

app = FastAPI(
    title="NEXUS Regulatory Intelligence",
    version="1.0.0",
    description="Regulatory monitoring and threshold recommendation service",
)

monitor = RegulationMonitor()
START_TIME = time.time()

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "regulatory-intelligence",
        "uptime_seconds": round(time.time() - START_TIME, 1),
    }

@app.post("/scan")
async def trigger_scan():
    """Trigger a manual scan of regulatory sources."""
    logger.info("Manual regulatory scan triggered")
    updates = await monitor.run()
    return {
        "status": "completed",
        "updates_detected": len(updates),
        "timestamp": int(time.time() * 1000)
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8087")))
