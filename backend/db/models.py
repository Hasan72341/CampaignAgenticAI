"""
ORM models for CampaignX.

All 6 tables:
  - CustomerProfile
  - Campaign
  - Segment
  - Variant
  - AgentLog
  - ApiCallLog
"""
import uuid
import enum
from datetime import datetime, date
from sqlalchemy import (
    Column, String, Text, Integer, Float, Boolean, Enum,
    DateTime, Date, ForeignKey, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from db.database import Base


def _uuid():
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Campaign status enum
# ---------------------------------------------------------------------------
class CampaignStatus(str, enum.Enum):
    profiling        = "profiling"
    planning         = "planning"
    generating       = "generating"
    pending_approval = "pending_approval"
    approved         = "approved"
    executing        = "executing"
    monitoring       = "monitoring"
    optimizing       = "optimizing"
    completed        = "completed"
    rejected         = "rejected"


# ---------------------------------------------------------------------------
# CustomerProfile
# ---------------------------------------------------------------------------
class CustomerProfile(Base):
    __tablename__ = "customer_profiles"

    id                 = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    # Core identifier (maps to cohort 'customer_id', e.g. CUST0001)
    customer_id        = Column(String, unique=True, nullable=False, index=True)
    # Contact
    email              = Column(String, nullable=True)   # cohort 'email'
    full_name          = Column(String, nullable=True)   # cohort 'Full_name'
    # Demographics
    age                = Column(Integer, nullable=True)
    gender             = Column(String, nullable=True)
    marital_status     = Column(String, nullable=True)
    family_size        = Column(Integer, nullable=True)
    dependent_count    = Column(Integer, nullable=True)
    kids_in_household  = Column(Integer, nullable=True)
    city               = Column(String, nullable=True)
    # Financial / Behavioural
    occupation         = Column(String, nullable=True)
    occupation_type    = Column(String, nullable=True)   # Full-time / Part-time
    monthly_income     = Column(Integer, nullable=True)
    credit_score       = Column(Integer, nullable=True)
    kyc_status         = Column(String, nullable=True)   # 'Y' | 'N'
    app_installed      = Column(String, nullable=True)   # 'Y' | 'N'
    existing_customer  = Column(String, nullable=True)   # 'Y' | 'N'
    social_media_active= Column(String, nullable=True)   # 'Y' | 'N'
    # Catch-all: full raw cohort object in case schema changes server-side
    raw_data           = Column(JSONB, nullable=True)
    # LLM-assigned segment tags from Profiler agent
    segment_tags       = Column(JSONB, nullable=True)
    created_at         = Column(DateTime, default=datetime.utcnow)


# ---------------------------------------------------------------------------
# Campaign
# ---------------------------------------------------------------------------
class Campaign(Base):
    __tablename__ = "campaigns"

    id               = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    brief            = Column(Text, nullable=False)
    status           = Column(Enum(CampaignStatus), default=CampaignStatus.profiling, nullable=False)
    state_checkpoint = Column(JSONB, nullable=True)   # serialised LangGraph state
    rejection_feedback = Column(Text, nullable=True)
    created_at       = Column(DateTime, default=datetime.utcnow)
    updated_at       = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    segments  = relationship("Segment", back_populates="campaign", cascade="all, delete-orphan")
    agent_logs= relationship("AgentLog", back_populates="campaign", cascade="all, delete-orphan")


# ---------------------------------------------------------------------------
# Segment
# ---------------------------------------------------------------------------
class Segment(Base):
    __tablename__ = "segments"

    id                  = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    campaign_id         = Column(UUID(as_uuid=False), ForeignKey("campaigns.id"), nullable=False, index=True)
    label               = Column(String, nullable=False)         # e.g. "Segment A – High-Value"
    criteria            = Column(JSONB, nullable=True)           # LLM-generated criteria dict
    customer_ids        = Column(JSONB, nullable=True)           # list of customer_id strings
    send_time           = Column(String, nullable=True)          # "DD:MM:YY HH:MM:SS" IST
    predicted_open_rate = Column(Float, nullable=True)
    predicted_click_rate= Column(Float, nullable=True)

    campaign = relationship("Campaign", back_populates="segments")
    variants = relationship("Variant", back_populates="segment", cascade="all, delete-orphan")


# ---------------------------------------------------------------------------
# Variant
# ---------------------------------------------------------------------------
class Variant(Base):
    __tablename__ = "variants"

    id                  = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    segment_id          = Column(UUID(as_uuid=False), ForeignKey("segments.id"), nullable=False, index=True)
    external_campaign_id= Column(String, nullable=True)   # UUID returned by /api/v1/send_campaign
    subject             = Column(Text, nullable=True)     # max 200 chars, text+emojis only
    body                = Column(Text, nullable=False)    # 1–5000 chars
    has_emoji           = Column(Boolean, default=False)
    has_url             = Column(Boolean, default=False)
    font_styles         = Column(JSONB, nullable=True)
    sent_count          = Column(Integer, default=0)
    open_count          = Column(Integer, default=0)      # count(EO='Y')
    click_count         = Column(Integer, default=0)      # count(EC='Y')

    segment = relationship("Segment", back_populates="variants")


# ---------------------------------------------------------------------------
# AgentLog  — every LLM call writes a row
# ---------------------------------------------------------------------------
class AgentLog(Base):
    __tablename__ = "agent_logs"

    id              = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    campaign_id     = Column(UUID(as_uuid=False), ForeignKey("campaigns.id"), nullable=False, index=True)
    agent_name      = Column(String, nullable=False)
    step            = Column(Integer, nullable=True)
    input_payload   = Column(JSONB, nullable=True)
    output_payload  = Column(JSONB, nullable=True)
    llm_reasoning   = Column(Text, nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)

    campaign = relationship("Campaign", back_populates="agent_logs")


# ---------------------------------------------------------------------------
# ApiCallLog  — rate-limit tracker (100 calls/day per endpoint)
# ---------------------------------------------------------------------------
class ApiCallLog(Base):
    __tablename__ = "api_call_logs"

    id         = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    endpoint   = Column(String, nullable=False)
    date_utc   = Column(Date, nullable=False, default=date.today)
    call_count = Column(Integer, default=0, nullable=False)

    __table_args__ = (
        UniqueConstraint("endpoint", "date_utc", name="uq_endpoint_date"),
    )
