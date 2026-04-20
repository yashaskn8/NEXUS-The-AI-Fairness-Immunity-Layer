"""
NEXUS Federated Aggregator — FastAPI Main Application.
Aggregates local gradient updates from participating orgs with differential privacy.
"""
from __future__ import annotations

import os
import time
import structlog
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from app.federated_coordinator import FederatedCoordinator
from nexus_types.models import FederatedGradient

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer(),
    ],
)

logger = structlog.get_logger(__name__)

app = FastAPI(
    title="NEXUS Federated Aggregator",
    version="1.0.0",
    description="Differentially private federated learning aggregator",
)

coordinator = FederatedCoordinator()
START_TIME = time.time()

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "federated-aggregator",
        "uptime_seconds": round(time.time() - START_TIME, 1),
    }

@app.post("/gradients")
async def register_gradient(gradient: FederatedGradient):
    """Register a new gradient update from an organization."""
    result = coordinator.register_gradient(gradient)
    if not result.get("accepted"):
        # Return flat JSON so test script can read data.get("rejection_reason")
        return JSONResponse(
            status_code=400,
            content={"rejection_reason": result.get("reason", "Unknown rejection"), "accepted": False}
        )
    return result

@app.post("/aggregate")
async def trigger_aggregation():
    """Force an aggregation round."""
    return coordinator.aggregate()

@app.get("/global-model")
async def get_global_model():
    """Return the current global fairness model."""
    return {
        "round_id": coordinator.round_id,
        "global_model": coordinator.global_model,
        "participants_count": len(coordinator.participating_orgs),
        "hiring_di_threshold": coordinator.global_model.get("gender", [0.80])[0] if "gender" in coordinator.global_model else 0.80
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8083")))
