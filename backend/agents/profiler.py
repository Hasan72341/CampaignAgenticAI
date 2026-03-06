"""
Agent 0: Customer Profiler

Fetches the full 5000-customer cohort via the ToolFactory dynamic tool,
enriches each record with LLM-assigned segment tags, and persists to
the `customer_profiles` PostgreSQL table (upsert on customer_id).

Real cohort fields (verified 2026-03-05):
  customer_id, Full_name, email, Age, Gender, Marital_Status, Family_Size,
  Dependent count, Occupation, Occupation type, Monthly_Income, KYC status,
  City, Kids_in_Household, App_Installed, Existing Customer,
  Credit score, Social_Media_Active
"""
import json
import logging
import os
from datetime import datetime

from langchain_ollama import ChatOllama
from langchain_core.messages import SystemMessage, HumanMessage
from sqlalchemy.orm import Session

from db.models import CustomerProfile, AgentLog, Campaign, CampaignStatus
from tools.campaign_api_tools import get_campaign_tools
from workflows.state import CampaignState

logger = logging.getLogger(__name__)

PROFILER_SYSTEM_PROMPT = """You are the Customer Profiler agent for a digital marketing AI system.

You will receive a JSON array of customer records from our cohort API.
Your job:
1. List every field present in the records (the schema uses additionalProperties:true, 
   so you must discover fields dynamically rather than assume a fixed schema).
2. Based on available demographic, financial, and behavioural fields, assign each customer 
   a concise segment_tag string. Use combinations like:
   - "high_income_tier1_active"
   - "young_female_social_active"
   - "existing_kyc_app_user"
   - "low_income_part_time_inactive"
   Keep tags lowercase, underscore-separated, max 5 words.
3. Return a segment taxonomy JSON summarising the categories you found and their customer counts.

Output format (JSON only, no prose):
{
  "available_fields": ["field1", "field2", ...],
  "segment_taxonomy": {
    "<tag>": {"description": "...", "count": N, "sample_customer_ids": ["CUST0001", ...]}
  },
  "customer_tags": {"CUST0001": "<tag>", "CUST0002": "<tag>", ...}
}"""


def run_profiler(state: CampaignState, db: Session) -> CampaignState:
    """
    LangGraph node: Customer Profiler.
    Fetches cohort, enriches with LLM segment tags, persists to DB.
    """
    campaign_id = state["campaign_id"]
    logger.info("[Profiler] Starting for campaign %s", campaign_id)

    _update_campaign_status(db, campaign_id, CampaignStatus.profiling)

    # ── 1. Fetch cohort via ToolFactory (not hardcoded requests) ──────────────
    tools_map = {t.name: t for t in get_campaign_tools(db)}
    cohort_tool = tools_map.get("get_customer_cohort_api_v1_get_customer_cohort_get")

    if cohort_tool is None:
        raise RuntimeError("Cohort tool not found in ToolFactory — check openapi.json")

    cohort_response = cohort_tool.invoke({
        "body": None,
        "query_params": None,
        "campaign_id_for_log": campaign_id,
    })

    customers: list[dict] = cohort_response.get("data", [])
    total_count = cohort_response.get("total_count", len(customers))
    logger.info("[Profiler] Fetched %d customer records (total_count=%d)", len(customers), total_count)

    # ── 2. Ask LLM to discover fields and assign segment tags ─────────────────
    # Sample first 200 records for the LLM (avoid huge context)
    sample = customers[:200]
    llm = _get_llm()

    messages = [
        SystemMessage(content=PROFILER_SYSTEM_PROMPT),
        HumanMessage(content=f"Here are {len(sample)} customer records (sample of {len(customers)} total):\n"
                             f"{json.dumps(sample, indent=2)}\n\n"
                             f"Campaign brief: {state.get('brief', '')}\n\n"
                             f"Return ONLY valid JSON."),
    ]
    response = llm.invoke(messages)
    raw_content = response.content.strip()

    # Strip markdown code fences if present
    if raw_content.startswith("```"):
        raw_content = raw_content.split("```")[1]
        if raw_content.startswith("json"):
            raw_content = raw_content[4:]

    try:
        llm_output: dict = json.loads(raw_content)
    except json.JSONDecodeError:
        logger.warning("[Profiler] LLM returned invalid JSON. Using empty taxonomy.")
        llm_output = {"available_fields": [], "segment_taxonomy": {}, "customer_tags": {}}

    customer_tags: dict[str, str] = llm_output.get("customer_tags", {})
    segment_taxonomy: dict = llm_output.get("segment_taxonomy", {})

    # ── 3. Upsert all 5000 customers to PostgreSQL ────────────────────────────
    _upsert_customers(db, customers, customer_tags)

    # ── 4. Log LLM reasoning to AgentLog ─────────────────────────────────────
    _write_agent_log(
        db=db,
        campaign_id=campaign_id,
        agent_name="CustomerProfiler",
        step=1,
        input_payload={"total_customers": len(customers), "sample_size": len(sample)},
        output_payload={
            "available_fields": llm_output.get("available_fields", []),
            "segment_count": len(segment_taxonomy),
            "taxonomy": segment_taxonomy,
        },
        llm_reasoning=raw_content,
    )

    # ── 5. Advance state ──────────────────────────────────────────────────────
    _update_campaign_status(db, campaign_id, CampaignStatus.planning)

    # Load enriched profiles from DB for downstream agents
    enriched = [
        {
            "customer_id": r.customer_id,
            "email": r.email,
            "full_name": r.full_name,
            "age": r.age,
            "gender": r.gender,
            "city": r.city,
            "monthly_income": r.monthly_income,
            "credit_score": r.credit_score,
            "kyc_status": r.kyc_status,
            "app_installed": r.app_installed,
            "existing_customer": r.existing_customer,
            "social_media_active": r.social_media_active,
            "occupation": r.occupation,
            "occupation_type": r.occupation_type,
            "marital_status": r.marital_status,
            "family_size": r.family_size,
            "segment_tags": r.segment_tags,
        }
        for r in db.query(CustomerProfile).all()
    ]

    return {
        **state,
        "status": "planning",
        "customer_profiles": enriched,
        "segment_taxonomy": segment_taxonomy,
        "agent_logs": state.get("agent_logs", []) + [{
            "agent": "CustomerProfiler",
            "step": 1,
            "summary": f"Fetched {len(customers)} customers, assigned {len(segment_taxonomy)} segment tags",
        }],
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _upsert_customers(db: Session, customers: list[dict], customer_tags: dict[str, str]):
    """Upsert customer records — safe to re-run (idempotent)."""
    for record in customers:
        cid = record.get("customer_id")
        if not cid:
            continue
        existing = db.query(CustomerProfile).filter(CustomerProfile.customer_id == cid).first()
        if existing is None:
            existing = CustomerProfile(customer_id=cid)
            db.add(existing)

        existing.email              = record.get("email")
        existing.full_name          = record.get("Full_name")
        existing.age                = _safe_int(record.get("Age"))
        existing.gender             = record.get("Gender")
        existing.marital_status     = record.get("Marital_Status")
        existing.family_size        = _safe_int(record.get("Family_Size"))
        existing.dependent_count    = _safe_int(record.get("Dependent count"))
        existing.kids_in_household  = _safe_int(record.get("Kids_in_Household"))
        existing.city               = record.get("City")
        existing.occupation         = record.get("Occupation")
        existing.occupation_type    = record.get("Occupation type")
        existing.monthly_income     = _safe_int(record.get("Monthly_Income"))
        existing.credit_score       = _safe_int(record.get("Credit score"))
        existing.kyc_status         = record.get("KYC status")
        existing.app_installed      = record.get("App_Installed")
        existing.existing_customer  = record.get("Existing Customer")
        existing.social_media_active= record.get("Social_Media_Active")
        existing.raw_data           = record
        existing.segment_tags       = {"tag": customer_tags.get(cid, "unclassified")}

    db.commit()


def _safe_int(val) -> int | None:
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def _update_campaign_status(db: Session, campaign_id: str, status: CampaignStatus):
    db.query(Campaign).filter(Campaign.id == campaign_id).update(
        {"status": status, "updated_at": datetime.utcnow()}
    )
    db.commit()


def _write_agent_log(db, campaign_id, agent_name, step, input_payload, output_payload, llm_reasoning):
    log = AgentLog(
        campaign_id=campaign_id,
        agent_name=agent_name,
        step=step,
        input_payload=input_payload,
        output_payload=output_payload,
        llm_reasoning=llm_reasoning,
    )
    db.add(log)
    db.commit()


def _get_llm():
    return ChatOllama(
        model=os.environ.get("OLLAMA_MODEL", "glm4:latest"),
        base_url=os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434"),
        temperature=0.2,
    )
