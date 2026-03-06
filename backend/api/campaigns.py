"""
Campaign REST endpoints.

Routes:
  POST /api/campaigns/generate        — kick off a new campaign workflow
  GET  /api/campaigns/{id}/status     — poll current state (every 3s by UI)
  GET  /api/campaigns/{id}/metrics    — live open/click metrics
"""
import os
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import Campaign, CampaignStatus, Segment, Variant, AgentLog
from tools.campaign_api_tools import get_campaign_tools
from workflows.langgraph_flow import run_campaign_workflow, resume_campaign_workflow


# ── Workflow runner ───────────────────────────────────────────────────────────

def _run_campaign_workflow(campaign_id: str, brief: str):
    """Background task: runs the real 5-agent LangGraph workflow."""
    try:
        run_campaign_workflow(campaign_id=campaign_id, brief=brief)
    except Exception as exc:
        logger.error("Workflow failed for campaign %s: %s", campaign_id, exc)


def _resume_workflow_async(campaign_id: str):
    """Background task: resumes LangGraph execution."""
    try:
        resume_campaign_workflow(campaign_id)
    except Exception as exc:
        logger.error("Workflow resumption failed for campaign %s: %s", campaign_id, exc)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/campaigns/generate", response_model=GenerateCampaignResponse)
def generate_campaign(
    req: GenerateCampaignRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Accept a natural-language brief and kick off the AI campaign workflow.
    Returns campaign_id immediately; frontend polls /status every 3 s.
    """
    campaign = Campaign(brief=req.brief, status=CampaignStatus.profiling)
    db.add(campaign)
    db.commit()
    db.refresh(campaign)

    background_tasks.add_task(_run_campaign_workflow, campaign.id, req.brief)

    return GenerateCampaignResponse(campaign_id=campaign.id, status=campaign.status.value)


@router.get("/campaigns/{campaign_id}/status")
def get_campaign_status(campaign_id: str, db: Session = Depends(get_db)):
    """
    Return full campaign state including segments, variants, agent logs,
    and ML predictions. Polled by the frontend every 3 seconds.
    """
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return _serialize_campaign(campaign)


@router.post("/campaigns/{campaign_id}/optimize")
def optimize_campaign(
    campaign_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Trigger the optimization loop (Agent 4: Optimizer).
    Resumes LangGraph from the Analyst/Optimizer nodes.
    """
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    background_tasks.add_task(_resume_workflow_async, campaign_id)
    return {"campaign_id": campaign_id, "status": "optimizing", "message": "Optimization loop started."}


@router.get("/campaigns/{campaign_id}/metrics")
def get_campaign_metrics(campaign_id: str, db: Session = Depends(get_db)):
    """
    Return live open/click metrics for all variants of a campaign.
    Fetches from the hackathon API via the ToolFactory GET /get_report tool.
    """
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    metrics = []
    tools = {t.name: t for t in get_campaign_tools(db)}
    get_report_tool = tools.get("get_report_api_v1_get_report_get")

    for seg in campaign.segments:
        for variant in seg.variants:
            if not variant.external_campaign_id:
                continue
            try:
                if get_report_tool:
                    report = get_report_tool.invoke({
                        "query_params": {"campaign_id": variant.external_campaign_id},
                        "campaign_id_for_log": campaign_id,
                    })
                    rows = report.get("data", [])
                    open_count  = sum(1 for r in rows if r.get("EO") == "Y")
                    click_count = sum(1 for r in rows if r.get("EC") == "Y")
                    total = report.get("total_rows", len(rows))
                    # Persist to DB
                    variant.sent_count  = total
                    variant.open_count  = open_count
                    variant.click_count = click_count
                    db.commit()
                    metrics.append({
                        "variant_id": variant.id,
                        "external_campaign_id": variant.external_campaign_id,
                        "segment_label": seg.label,
                        "total_sent": total,
                        "open_count": open_count,
                        "click_count": click_count,
                        "open_rate": round(open_count / total * 100, 2) if total else 0,
                        "click_rate": round(click_count / total * 100, 2) if total else 0,
                        "weighted_score": round(
                            (click_count / total * 100 * 0.70) + (open_count / total * 100 * 0.30), 2
                        ) if total else 0,
                    })
            except Exception as exc:
                logger.error("Failed to fetch metrics for variant %s: %s", variant.id, exc)
                metrics.append({"variant_id": variant.id, "error": str(exc)})

    return {"campaign_id": campaign_id, "metrics": metrics}
