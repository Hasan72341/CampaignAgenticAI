"""
Bootstrap module for the hackathon API tool set.

Provides `get_campaign_tools(db)` which returns a ready-to-use list of
LangChain @tool objects for the three hackathon endpoints:
  - get_customer_cohort
  - send_campaign
  - get_report

Falls back to the local openapi.json if the live server is unreachable.
"""
import json
import os
import logging
from pathlib import Path

from sqlalchemy.orm import Session
from tools.openapi_tool_factory import ToolFactory

logger = logging.getLogger(__name__)

_SPEC_PATH = Path(__file__).parent.parent.parent / "openapi.json"


def get_campaign_tools(db: Session) -> list:
    """
    Build and return all hackathon API tools.

    Prefers live spec from {HACKATHON_API_BASE_URL}/openapi.json;
    falls back to the bundled openapi.json on disk.
    """
    base_url = os.environ.get("HACKATHON_API_BASE_URL", "https://campaignx.inxiteout.ai")
    api_key = os.environ.get("HACKATHON_API_KEY", "")

    try:
        factory = ToolFactory.from_url(base_url=base_url, api_key=api_key)
        logger.info("ToolFactory: loaded spec from live server (%s/openapi.json)", base_url)
    except Exception as exc:
        logger.warning(
            "ToolFactory: could not fetch live spec (%s). Falling back to disk: %s",
            exc, _SPEC_PATH,
        )
        factory = ToolFactory.from_file(
            spec_path=str(_SPEC_PATH), base_url=base_url, api_key=api_key
        )

    return factory.build_tools(db)
