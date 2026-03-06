"""
Agent 1: Campaign Planner

Uses the enriched CustomerProfile data in PostgreSQL to plan
2-3 A/B test segments with optimal send times and target audiences.
Does NOT re-call the external API (quota conservation).
"""
import json
import logging
import os
from datetime import datetime, timedelta, timezone

from langchain_ollama import ChatOllama
from langchain_core.messages import SystemMessage, HumanMessage
from sqlalchemy.orm import Session

from db.models import Segment, Campaign, CampaignStatus, CustomerProfile
from workflows.state import CampaignState

logger = logging.getLogger(__name__)

# IST = UTC+5:30
IST_OFFSET = timezone(timedelta(hours=5, minutes=30))

PLANNER_SYSTEM_PROMPT = """You are the Campaign Planner agent for a digital marketing AI system.

You have access to enriched customer profiles with 17 demographic and behavioural fields.
Your task: parse the campaign brief and build an A/B test strategy with 2-3 distinct segments.

Rules:
- Read the segment taxonomy carefully to understand available audience clusters.
- Each segment must have: a label, filter criteria, list of customer_ids, send_time, and variant_type.
- send_time MUST be in format 'DD:MM:YY HH:MM:SS' (IST) and MUST be in the future.
  Use the current IST time provided to you as reference.
- Optimal send windows (IST): 08:00-09:00, 12:00-13:00, 18:00-20:00.
- Use 2 segments minimum, 3 maximum. Each should cover a meaningfully different audience slice.
- If the brief mentions inactive/low-engagement users, create a dedicated re-engagement segment.
- Assign "variant_type": "A", "B", or "C" to each segment.
- Use the available fields (App_Installed, Existing Customer, KYC status, etc.) for targeting.

Output JSON only:
{
  "strategy_rationale": "...",
  "segments": [
    {
      "label": "Segment A – High-Value Existing",
      "variant_type": "A",
      "criteria": {"existing_customer": "Y", "kyc_status": "Y"},
      "customer_ids": ["CUST0001", "CUST0003", ...],
      "send_time": "DD:MM:YY HH:MM:SS",
      "rationale": "..."
    }
  ]
}"""


def run_planner(state: CampaignState, db: Session) -> CampaignState:
    """LangGraph node: Campaign Planner."""
    campaign_id = state["campaign_id"]
    logger.info("[Planner] Starting for campaign %s", campaign_id)

    _update_campaign_status(db, campaign_id, CampaignStatus.planning)

    # ── Load enriched profiles from DB (NOT external API) ─────────────────────
    profile_rows = db.query(CustomerProfile).all()
    profiles_summary = [
        {
            "customer_id":       r.customer_id,
            "age":               r.age,
            "gender":            r.gender,
            "city":              r.city,
            "monthly_income":    r.monthly_income,
            "credit_score":      r.credit_score,
            "kyc_status":        r.kyc_status,
            "app_installed":     r.app_installed,
            "existing_customer": r.existing_customer,
            "social_media_active": r.social_media_active,
            "occupation_type":   r.occupation_type,
            "segment_tag":       (r.segment_tags or {}).get("tag", "unclassified"),
        }
        for r in profile_rows
    ]  

    segment_taxonomy = state.get("segment_taxonomy", {})
    brief = state.get("brief", "")
    rejection_feedback = ""

    # Inject rejection feedback if this is a re-plan
    campaign_row = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if campaign_row and campaign_row.rejection_feedback:
        rejection_feedback = f"\n\nHUMAN FEEDBACK (must be addressed): {campaign_row.rejection_feedback}"

    # Current IST time for send_time reference
    now_ist = datetime.now(IST_OFFSET)
    now_str  = now_ist.strftime("%d:%m:%y %H:%M:%S")

    llm = _get_llm()
    messages = [
        SystemMessage(content=PLANNER_SYSTEM_PROMPT),
        HumanMessage(content=(
            f"Campaign Brief: {brief}{rejection_feedback}\n\n"
            f"Current IST time: {now_str}\n\n"
            f"Segment taxonomy from Profiler:\n{json.dumps(segment_taxonomy, indent=2)}\n\n"
            f"Total customers: {len(profiles_summary)}\n"
            f"Sample profiles (first 100):\n{json.dumps(profiles_summary[:100], indent=2)}\n\n"
            f"Return ONLY valid JSON."
        )),
    ]

    response = llm.invoke(messages)
    raw_content = _clean_json(response.content)

    try:
        llm_output: dict = json.loads(raw_content)
    except json.JSONDecodeError:
        logger.error("[Planner] LLM returned invalid JSON: %s", raw_content[:300])
        raise ValueError("Planner LLM returned invalid JSON — check OLLAMA_BASE_URL/OLLAMA_MODEL and prompt")

    planned_segments = llm_output.get("segments", [])

    # ── Persist Segment rows to PostgreSQL ────────────────────────────────────
    # Clear old segments from previous iterations
    old_segments = db.query(Segment).filter(Segment.campaign_id == campaign_id).all()
    for osg in old_segments:
        db.delete(osg)
    db.commit()

    segment_dicts = []
    for seg_data in planned_segments:
        seg = Segment(
            campaign_id=campaign_id,
            label=seg_data.get("label", "Unnamed"),
            criteria=seg_data.get("criteria", {}),
            customer_ids=seg_data.get("customer_ids", []),
            send_time=seg_data.get("send_time"),
        )
        db.add(seg)
        db.flush()  # get seg.id

        segment_dicts.append({
            "id":           seg.id,
            "label":        seg.label,
            "variant_type": seg_data.get("variant_type", "A"),
            "criteria":     seg.criteria,
            "customer_ids": seg.customer_ids,
            "send_time":    seg.send_time,
            "rationale":    seg_data.get("rationale", ""),
        })

    db.commit()

    # ── Log ───────────────────────────────────────────────────────────────────
    _write_agent_log(
        db=db,
        campaign_id=campaign_id,
        agent_name="CampaignPlanner",
        step=2,
        input_payload={"brief": brief, "total_profiles": len(profiles_summary)},
        output_payload={
            "strategy_rationale": llm_output.get("strategy_rationale", ""),
            "segment_count": len(segment_dicts),
        },
        llm_reasoning=raw_content,
    )

    _update_campaign_status(db, campaign_id, CampaignStatus.generating)

    return {
        **state,
        "status": "generating",
        "segments": segment_dicts,
        "agent_logs": state.get("agent_logs", []) + [{
            "agent": "CampaignPlanner",
            "step": 2,
            "summary": f"Planned {len(segment_dicts)} segments",
            "rationale": llm_output.get("strategy_rationale", ""),
        }],
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _update_campaign_status(db: Session, campaign_id: str, status: CampaignStatus):
    db.query(Campaign).filter(Campaign.id == campaign_id).update(
        {"status": status, "updated_at": datetime.utcnow()}
    )
    db.commit()


def _write_agent_log(db, campaign_id, agent_name, step, input_payload, output_payload, llm_reasoning):
    from db.models import AgentLog
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
        temperature=0.3,
    )
