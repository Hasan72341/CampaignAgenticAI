"""
Campaign REST endpoints.

Routes:
  POST /api/campaigns/generate        — kick off a new campaign workflow
  GET  /api/campaigns/{id}/status     — poll current state (every 3s by UI)
  GET  /api/campaigns/{id}/metrics    — live open/click metrics
"""
import os
import logging
from datetime import datetime, date
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import Campaign, CampaignStatus, Segment, Variant, AgentLog, ApiCallLog
from tools.campaign_api_tools import get_campaign_tools
from tools.openapi_tool_factory import quota_key_for_endpoint
from workflows.langgraph_flow import run_campaign_workflow, resume_campaign_workflow

logger = logging.getLogger(__name__)
router = APIRouter()

class GenerateCampaignRequest(BaseModel):
    brief: str

class GenerateCampaignResponse(BaseModel):
    campaign_id: str
    status: str


def _serialize_campaign_status_summary(campaign: Campaign):
    segments = campaign.segments or []
    variants = [v for s in segments for v in (s.variants or [])]
    return {
        "id": campaign.id,
        "status": campaign.status.value,
        "brief": campaign.brief,
        "created_at": campaign.created_at,
        "rejection_feedback": campaign.rejection_feedback,
        "segment_count": len(segments),
        "variant_count": len(variants),
        "has_pending_review": campaign.status == CampaignStatus.pending_approval,
    }

def _serialize_campaign(campaign: Campaign):
    return {
        "id": campaign.id,
        "status": campaign.status.value,
        "brief": campaign.brief,
        "created_at": campaign.created_at,
        "state_checkpoint": campaign.state_checkpoint,
        "rejection_feedback": campaign.rejection_feedback,
        "segments": [
            {
                "id": seg.id,
                "label": seg.label,
                "criteria": seg.criteria,
                "customer_ids": seg.customer_ids,
                "send_time": seg.send_time,
                "predicted_open_rate": seg.predicted_open_rate,
                "predicted_click_rate": seg.predicted_click_rate,
                "variants": [
                    {
                        "id": var.id,
                        "external_campaign_id": var.external_campaign_id,
                        "subject": var.subject,
                        "body": var.body,
                        "has_emoji": var.has_emoji,
                        "has_url": var.has_url,
                        "font_styles": var.font_styles,
                        "sent_count": var.sent_count,
                        "open_count": var.open_count,
                        "click_count": var.click_count,
                    }
                    for var in seg.variants
                ]
            }
            for seg in campaign.segments
        ] if campaign.segments else [],
        "agent_logs": [
            {
                "id": log.id,
                "agent_name": log.agent_name,
                "step": log.step,
                "llm_reasoning": log.llm_reasoning,
                "input_payload": log.input_payload,
                "output_payload": log.output_payload,
                "created_at": log.created_at
            }
            for log in campaign.agent_logs
        ] if campaign.agent_logs else []
    }

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


@router.get("/campaigns")
def list_campaigns(limit: int = 5, db: Session = Depends(get_db)):
    """Return the most recent campaigns for the sidebar list."""
    campaigns = db.query(Campaign).order_by(Campaign.created_at.desc()).limit(limit).all()
    return [_serialize_campaign(c) for c in campaigns]


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


@router.get("/campaigns/{campaign_id}/status-summary")
def get_campaign_status_summary(campaign_id: str, db: Session = Depends(get_db)):
    """Lightweight status payload intended for frequent UI polling."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return _serialize_campaign_status_summary(campaign)


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
def get_campaign_metrics(campaign_id: str, refresh: bool = False, db: Session = Depends(get_db)):
    """
    Return open/click metrics for all variants of a campaign.
    By default this serves cached metrics from DB to avoid exhausting API quota.
    Pass refresh=true to fetch live metrics from the hackathon API.
    """
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    metrics = []
    tools = {t.name: t for t in get_campaign_tools(db)}
    get_report_tool = tools.get("get_report_api_v1_get_report_get")
    report_path = quota_key_for_endpoint("/api/v1/get_report")
    used_row = (
        db.query(ApiCallLog)
        .filter(ApiCallLog.endpoint == report_path, ApiCallLog.date_utc == date.today())
        .first()
    )
    report_calls_used = used_row.call_count if used_row else 0
    quota_exhausted = report_calls_used >= 100
    allow_live_fetch = bool(refresh and get_report_tool and not quota_exhausted)

    dirty = False

    for seg in campaign.segments:
        for variant in seg.variants:
            if not variant.external_campaign_id:
                continue

            total = variant.sent_count or 0
            open_count = variant.open_count or 0
            click_count = variant.click_count or 0
            source = "cached"

            try:
                if allow_live_fetch:
                    report = get_report_tool.invoke({
                        "query_params": {"campaign_id": variant.external_campaign_id},
                        "campaign_id_for_log": campaign_id,
                    })
                    rows = report.get("data", [])
                    open_count  = sum(1 for r in rows if r.get("EO") == "Y")
                    click_count = sum(1 for r in rows if r.get("EC") == "Y")
                    total = report.get("total_rows", len(rows))

                    # Persist refreshed values to DB once per request.
                    variant.sent_count  = total
                    variant.open_count  = open_count
                    variant.click_count = click_count
                    source = "live"
                    dirty = True
            except Exception as exc:
                logger.warning(
                    "Live metrics fetch failed for variant %s, serving cached values instead: %s",
                    variant.id,
                    exc,
                )

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
                "source": source,
            })

    if dirty:
        db.commit()

    return {
        "campaign_id": campaign_id,
        "metrics": metrics,
        "refresh": refresh,
        "live_fetch_enabled": allow_live_fetch,
        "get_report_calls_used_today": report_calls_used,
        "get_report_daily_limit": 100,
    }
