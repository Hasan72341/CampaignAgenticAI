"""
Agent 3: Performance Analyst

Fetches real open/click data from the hackathon GET /api/v1/get_report
endpoint via ToolFactory, computes weighted performance score, identifies
winner variants, and produces a structured analysis report.

EO and EC are STRING flags 'Y'|'N' — NOT booleans.
"""
import json
import logging
import os
from datetime import datetime

from langchain_ollama import ChatOllama
from langchain_core.messages import SystemMessage, HumanMessage
from sqlalchemy.orm import Session

from db.models import Variant, Segment, AgentLog, Campaign, CampaignStatus
from tools.campaign_api_tools import get_campaign_tools
from workflows.state import CampaignState

logger = logging.getLogger(__name__)

ANALYST_SYSTEM_PROMPT = """You are the Performance Analyst agent for a digital marketing AI system.

You will receive campaign performance data (open/click metrics per variant).
Your tasks:
1. Identify the winning variant per segment (highest weighted score: click*0.70 + open*0.30).
2. List specific weaknesses of each variant (e.g. "low click rate despite good open rate").
3. Produce actionable recommendations for the Optimizer agent.

Output JSON only:
{
  "analysis_summary": "...",
  "segment_results": {
    "<segment_id>": {
      "winner_variant_id": "...",
      "open_rate": 0.0,
      "click_rate": 0.0,
      "weighted_score": 0.0,
      "weaknesses": ["...", "..."],
      "recommendations": ["...", "..."]
    }
  }
}"""


def run_analyst(state: CampaignState, db: Session) -> CampaignState:
    """LangGraph node: Performance Analyst."""
    campaign_id = state["campaign_id"]
    logger.info("[Analyst] Starting for campaign %s", campaign_id)

    _update_campaign_status(db, campaign_id, CampaignStatus.monitoring)

    tools_map = {t.name: t for t in get_campaign_tools(db)}
    report_tool = tools_map.get("get_report_api_v1_get_report_get")

    # ── Fetch metrics for all variants ────────────────────────────────────────
    metrics_by_segment: dict[str, dict] = {}

    for seg in db.query(Segment).filter(Segment.campaign_id == campaign_id).all():
        for variant in seg.variants:
            if not variant.external_campaign_id:
                logger.info("[Analyst] Variant %s has no external_campaign_id — skipping", variant.id)
                continue

            try:
                report = report_tool.invoke({
                    "body": None,
                    "query_params": {"campaign_id": variant.external_campaign_id},
                    "campaign_id_for_log": campaign_id,
                })
                rows = report.get("data", [])
                total = report.get("total_rows", len(rows))

                # EO and EC are STRING flags 'Y'|'N'
                open_count  = sum(1 for r in rows if r.get("EO") == "Y")
                click_count = sum(1 for r in rows if r.get("EC") == "Y")

                open_rate   = round(open_count / total, 4) if total else 0.0
                click_rate  = round(click_count / total, 4) if total else 0.0
                weighted    = round(click_rate * 0.70 + open_rate * 0.30, 4)

                # Persist to Variant row
                variant.sent_count  = total
                variant.open_count  = open_count
                variant.click_count = click_count
                db.commit()

                seg_key = str(seg.id)
                if seg_key not in metrics_by_segment:
                    metrics_by_segment[seg_key] = {
                        "segment_label": seg.label,
                        "variants": [],
                    }

                metrics_by_segment[seg_key]["variants"].append({
                    "variant_id":          str(variant.id),
                    "external_campaign_id": variant.external_campaign_id,
                    "total_sent":          total,
                    "open_count":          open_count,
                    "click_count":         click_count,
                    "open_rate":           open_rate,
                    "click_rate":          click_rate,
                    "weighted_score":      weighted,
                    "subject_preview":     (variant.subject or "")[:80],
                })

            except Exception as exc:
                logger.error("[Analyst] Failed to fetch report for variant %s: %s", variant.id, exc)

    # ── LLM analysis ──────────────────────────────────────────────────────────
    llm = _get_llm()
    messages = [
        SystemMessage(content=ANALYST_SYSTEM_PROMPT),
        HumanMessage(content=(
            f"Campaign: {campaign_id}\n"
            f"Brief: {state.get('brief', '')}\n\n"
            f"Performance metrics:\n{json.dumps(metrics_by_segment, indent=2)}\n\n"
            f"Return ONLY valid JSON."
        )),
    ]

    response = llm.invoke(messages)
    raw_content = _clean_json(response.content)

    try:
        llm_output: dict = json.loads(raw_content)
    except json.JSONDecodeError:
        # Fallback: build minimal analysis from raw metrics
        llm_output = _build_fallback_analysis(metrics_by_segment)

    # ── Log ───────────────────────────────────────────────────────────────────
    _write_agent_log(
        db=db,
        campaign_id=campaign_id,
        agent_name="PerformanceAnalyst",
        step=4,
        input_payload={"segment_count": len(metrics_by_segment)},
        output_payload=llm_output,
        llm_reasoning=raw_content,
    )

    _update_campaign_status(db, campaign_id, CampaignStatus.optimizing)

    return {
        **state,
        "status": "optimizing",
        "api_metrics": {**metrics_by_segment, "analysis": llm_output},
        "agent_logs": state.get("agent_logs", []) + [{
            "agent": "PerformanceAnalyst",
            "step": 4,
            "summary": f"Analysed {len(metrics_by_segment)} segments",
            "summary_text": llm_output.get("analysis_summary", ""),
        }],
    }


def _build_fallback_analysis(metrics: dict) -> dict:
    """Simple rule-based fallback if LLM fails."""
    results = {}
    for seg_id, seg_data in metrics.items():
        best = max(seg_data["variants"], key=lambda v: v["weighted_score"], default=None)
        if best:
            results[seg_id] = {
                "winner_variant_id": best["variant_id"],
                "open_rate":         best["open_rate"],
                "click_rate":        best["click_rate"],
                "weighted_score":    best["weighted_score"],
                "weaknesses":        ["Automated analysis unavailable"],
                "recommendations":   ["Review manually"],
            }
    return {"analysis_summary": "Fallback analysis", "segment_results": results}


def _update_campaign_status(db: Session, campaign_id: str, status: CampaignStatus):
    db.query(Campaign).filter(Campaign.id == campaign_id).update(
        {"status": status, "updated_at": datetime.utcnow()}
    )
    db.commit()


def _write_agent_log(db, campaign_id, agent_name, step, input_payload, output_payload, llm_reasoning):
    log = AgentLog(
        campaign_id=campaign_id, agent_name=agent_name, step=step,
        input_payload=input_payload, output_payload=output_payload,
        llm_reasoning=llm_reasoning,
    )
    db.add(log)
    db.commit()


def _clean_json(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        parts = text.split("```")
        text = parts[1] if len(parts) > 1 else text
        if text.startswith("json"):
            text = text[4:]
    return text.strip()


def _get_llm():
    return ChatOllama(
        model=os.environ.get("OLLAMA_MODEL", "glm4:latest"),
        base_url=os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434"),
        temperature=0.1,
    )
