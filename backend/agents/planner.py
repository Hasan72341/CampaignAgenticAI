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

You have access to enriched customer profiles.
Your task: parse the campaign brief and build an A/B test strategy with 2-3 distinct segments.

SCORING CRITICAL RULE:
- You will define segments using "criteria" (key-value pairs matching customer fields).
- DO NOT return "customer_ids" in your JSON. The system will assign IDs in Python based on your criteria.
- Reach 100% of the cohort by defining broad or complementary segments.

General Rules:
- Read the segment taxonomy carefully.
- Each segment must have: a label, criteria (dictionary of field:value filters), send_time, and variant_type.
- send_time MUST be in format 'DD:MM:YY HH:MM:SS' (IST) and MUST be in the future.
- Use 2 segments minimum, 3 maximum.
- Assign "variant_type": "A", "B", or "C" to each segment.
- IMPORTANT: DO NOT use "Infinity" in JSON. If a range has no upper bound, use null or a very large number (999999999).

Output JSON only:
{
  "strategy_rationale": "...",
  "segments": [
    {
      "label": "Segment A – High-Value",
      "variant_type": "A",
      "criteria": {"existing_customer": "Y", "kyc_status": "Y", "monthly_income": [100000, null]},
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

    # ── Load enriched profiles from DB ────────────────────────────────────────
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
            f"Sample profiles (first 5):\n{json.dumps(profiles_summary[:5], indent=2)}\n\n"
            f"Return ONLY valid JSON dictionary following the schema."
        )),
    ]

    response = llm.invoke(messages)
    raw_content = _clean_json(response.content)

    try:
        llm_output: dict = json.loads(raw_content)
    except json.JSONDecodeError:
        logger.error("[Planner] Invalid JSON from LLM: %s", raw_content[:300])
        raise ValueError("Planner LLM returned invalid JSON")

    planned_segments = llm_output.get("segments", [])

    # ── 100% Coverage Logic (Python side) ─────────────────────────────────────
    assigned_ids = set()
    segment_dicts = []

    # Prepare segments in DB
    old_segments = db.query(Segment).filter(Segment.campaign_id == campaign_id).all()
    for osg in old_segments:
        db.delete(osg)
    db.commit()

    for idx, seg_data in enumerate(planned_segments):
        criteria = seg_data.get("criteria", {})
        
        # Apply filters
        seg_ids = []
        for p in profiles_summary:
            if p["customer_id"] in assigned_ids:
                continue
            
            # Match all criteria (supporting ranges [min, max])
            matches = True
            for k, v in criteria.items():
                p_val = p.get(k)
                
                # Support range [min, max]
                if isinstance(v, list) and len(v) == 2:
                    low, high = v
                    # Handle None/Infinity in low
                    if low is not None and p_val is not None and p_val < low:
                        matches = False
                        break
                    # Handle None/Infinity in high
                    if high is not None and p_val is not None and p_val > high:
                        matches = False
                        break
                    if p_val is None: # if we have a range but no value, it can't match
                        matches = False
                        break
                else:
                    # Default equality
                    if str(p_val).lower() != str(v).lower():
                        matches = False
                        break
            
            if matches:
                seg_ids.append(p["customer_id"])
                assigned_ids.add(p["customer_id"])

        # If it's the LAST segment, grab any remaining customers to ensure 100% coverage
        if idx == len(planned_segments) - 1:
            for p in profiles_summary:
                if p["customer_id"] not in assigned_ids:
                    seg_ids.append(p["customer_id"])
                    assigned_ids.add(p["customer_id"])

        seg = Segment(
            campaign_id=campaign_id,
            label=seg_data.get("label", "Unnamed"),
            criteria=_sanitize_criteria(criteria),
            customer_ids=seg_ids,
            send_time=seg_data.get("send_time"),
        )
        db.add(seg)
        db.flush()

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

def _sanitize_criteria(criteria: dict) -> dict:
    """Recursively replace Infinity/-Infinity with None for JSON compliance."""
    if not isinstance(criteria, dict):
        return criteria
    
    clean = {}
    for k, v in criteria.items():
        if isinstance(v, float) and (v == float('inf') or v == float('-inf')):
            clean[k] = None
        elif isinstance(v, list):
            clean[k] = [None if isinstance(x, float) and (x == float('inf') or x == float('-inf')) else x for x in v]
        elif isinstance(v, dict):
            clean[k] = _sanitize_criteria(v)
        else:
            clean[k] = v
    return clean


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
        num_predict=4096,
    )
