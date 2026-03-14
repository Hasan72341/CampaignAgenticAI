"""
FastAPI application entry point for CampaignX.

Features:
    - CORS configured for localhost and OrbStack frontend hosts
    - GET /health — checks DB connectivity
    - Mounts campaign and approval routers
"""
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from db.database import engine
from api import campaigns, approval, analytics


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    # Verify DB connection on startup
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    yield
    engine.dispose()


app = FastAPI(
    title="CampaignX Backend",
    description="AI multi-agent campaign automation system",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_origin_regex=".*",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(campaigns.router, prefix="/api", tags=["campaigns"])
app.include_router(approval.router, prefix="/api", tags=["approval"])
app.include_router(analytics.router, prefix="/api", tags=["analytics"])


# ── Health check ─────────────────────────────────────────────────────────────
@app.get("/health", tags=["health"])
def health_check():
    """Returns 200 OK with DB connectivity status."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception as exc:
        db_status = f"error: {exc}"
    return {"status": "ok", "db": db_status}
