"""
Agent 2: Content Generator

Generates compliant email subject + body for each planned segment,
using the hackathon API content rules strictly.

Content rules (Section 6.4 + API schema):
  subject: text + emojis ONLY, max 200 chars, NO URL, NO HTML
  body:     text + emoji (UTF-8) + URL allowed, 1-5000 chars, NO HTML
  send_time: 'DD:MM:YY HH:MM:SS' IST, must be future
"""
import json
import logging
import os
import re
from datetime import datetime, timezone, timedelta

from langchain_ollama import ChatOllama
from langchain_core.messages import SystemMessage, HumanMessage
from sqlalchemy.orm import Session

from db.models import Variant, Segment, AgentLog, Campaign, CampaignStatus
from ml.engagement_predictor import score_segment
from workflows.state import CampaignState

logger = logging.getLogger(__name__)

GENERATOR_SYSTEM_PROMPT = """You are the Content Generator agent for a digital marketing AI system.

You must create email campaign variants for each customer segment.

STRICT CONTENT RULES (violations cause immediate API rejection):
1. subject: text and emojis ONLY. Max 200 characters. NO URLs. NO HTML tags.
2. body: text, emojis (UTF-8), and one URL allowed. Max 5000 characters. NO HTML tags.
3. The only allowed URL in the body is: https://superbfsi.com/xdeposit/explore/
4. send_time must be 'DD:MM:YY HH:MM:SS' IST and STRICTLY in the future.

CREATIVE GUIDELINES:
- Make the subject line punchy. 30-60 chars is optimal. Include 1-2 emojis.
- Body: be concise (<400 chars), include a clear call-to-action, place the URL near the end.
- Personalise tone based on segment (high-income → premium tone, young → energetic tone).
- Use **bold**, _italic_ for emphasis (plain text markers only, no HTML).

Output JSON only:
{
  "variants": [
    {
      "target_segment_id": "<uuid>",
      "variant_type": "A",
      "subject": "...",
      "body": "...",
      "send_time": "DD:MM:YY HH:MM:SS",
      "has_emoji": true,
      "has_url": true,
      "generation_rationale": "..."
    }
  ]
}"""


def run_generator(state: CampaignState, db: Session) -> CampaignState:
    """LangGraph node: Content Generator."""
    campaign_id = state["campaign_id"]
    logger.info("[Generator] Starting for campaign %s (iteration %d)", campaign_id, state.get("iteration", 1))

    _update_campaign_status(db, campaign_id, CampaignStatus.generating)

    segments = state.get("segments", [])
    next_strategy = state.get("next_strategy", "")
    brief = state.get("brief", "")

    strategy_addendum = ""
    if next_strategy:
        strategy_addendum = f"\n\nOPTIMIZER FEEDBACK (you MUST follow these instructions):\n{next_strategy}"

    # Current IST time for send_time reference
    now_ist = datetime.now(timezone(timedelta(hours=5, minutes=30)))
    now_str = now_ist.strftime("%d:%m:%y %H:%M:%S")

    llm = _get_llm()
    messages = [
        SystemMessage(content=GENERATOR_SYSTEM_PROMPT),
        HumanMessage(content=(
            f"Campaign Brief: {brief}{strategy_addendum}\n\n"
            f"Current IST time: {now_str}\n\n"
            f"Segments to generate content for:\n{json.dumps(segments, indent=2)}\n\n"
            f"For each segment, generate one variant. Return ONLY valid JSON."
        )),
    ]

    response = llm.invoke(messages)
    raw_content = _clean_json(response.content)

    try:
        llm_output: dict = json.loads(raw_content)
    except json.JSONDecodeError:
        logger.error("[Generator] Invalid JSON from LLM: %s", raw_content[:300])
        raise ValueError("Generator LLM returned invalid JSON")

    raw_variants = llm_output.get("variants", [])

    # ── Persist variants + run heuristic predictor ────────────────────────────
    # Clear old variants for this campaign
    for seg in db.query(Segment).filter(Segment.campaign_id == campaign_id).all():
        for v in seg.variants:
            db.delete(v)
    db.commit()

    variant_dicts = []
    customer_profiles = state.get("customer_profiles", [])

    for v_data in raw_variants:
        seg_id = v_data.get("target_segment_id")
        seg_row = db.query(Segment).filter(Segment.id == seg_id).first()
        if not seg_row:
            logger.warning("[Generator] Segment %s not found in DB — skipping", seg_id)
            continue

        subject = _enforce_subject_rules(v_data.get("subject", ""))
        body    = _enforce_body_rules(v_data.get("body", ""))

        variant = Variant(
            segment_id=seg_id,
            subject=subject,
            body=body,
            has_emoji=v_data.get("has_emoji", False),
            has_url=v_data.get("has_url", False),
            font_styles={"bold": True, "italic": False},
        )
        db.add(variant)
        db.flush()

        # Run heuristic predictor for this segment + variant
        seg_customer_ids = set(seg_row.customer_ids or [])
        seg_profiles = [p for p in customer_profiles if p.get("customer_id") in seg_customer_ids]

        send_time = v_data.get("send_time", seg_row.send_time or "")
        prediction = score_segment(
            customer_profiles=seg_profiles or customer_profiles[:100],
            variant={"subject": subject, "body": body, "has_emoji": variant.has_emoji, "has_url": variant.has_url},
            send_time=send_time,
        )

        # Store prediction in Segment row
        seg_row.predicted_open_rate  = prediction["mean_open_rate"]
        seg_row.predicted_click_rate = prediction["mean_click_rate"]
        if not seg_row.send_time:
            seg_row.send_time = send_time

        variant_dicts.append({
            "id":                variant.id,
            "target_segment_id": seg_id,
            "variant_type":      v_data.get("variant_type", "A"),
            "subject":           subject,
            "body":              body,
            "send_time":         send_time,
            "has_emoji":         variant.has_emoji,
            "has_url":           variant.has_url,
            "prediction":        prediction,
        })

    db.commit()

    # ── Log ───────────────────────────────────────────────────────────────────
    _write_agent_log(
        db=db,
        campaign_id=campaign_id,
        agent_name="ContentGenerator",
        step=3,
        input_payload={"segment_count": len(segments), "iteration": state.get("iteration", 1)},
        output_payload={"variant_count": len(variant_dicts)},
        llm_reasoning=raw_content,
    )

    _update_campaign_status(db, campaign_id, CampaignStatus.pending_approval)

    return {
        **state,
        "status": "pending_approval",
        "variants": variant_dicts,
        "agent_logs": state.get("agent_logs", []) + [{
            "agent": "ContentGenerator",
            "step": 3,
            "summary": f"Generated {len(variant_dicts)} variants, scored with heuristic predictor",
        }],
    }


# ── Content rule enforcement ──────────────────────────────────────────────────

_URL_PATTERN = re.compile(r'https?://\S+')

def _enforce_subject_rules(subject: str) -> str:
    """Remove URLs from subject. Truncate to 200 chars."""
    subject = _URL_PATTERN.sub("", subject).strip()
    return subject[:200]


def _enforce_body_rules(body: str) -> str:
    """Remove HTML tags, truncate to 5000 chars."""
    body = re.sub(r'<[^>]+>', '', body).strip()
    return body[:5000]


# ── Helpers ───────────────────────────────────────────────────────────────────

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
        temperature=0.7,  # higher for creative copy
    )
