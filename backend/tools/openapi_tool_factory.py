"""
ToolFactory: dynamically builds LangChain tools from an OpenAPI spec.

Design:
  - Reads openapi.json either from disk or by fetching {base_url}/openapi.json
  - Iterates every path+method in spec['paths']
  - Creates a typed Python function per operation
  - Wraps with @tool decorator (injects operationId + description as docstring)
  - Enforces 100 calls/day rate limit via ApiCallLog table
  - Logs every invocation to AgentLog table
"""
import json
import os
import inspect
from datetime import date, datetime
from typing import Any

import requests
from langchain_core.tools import tool
from sqlalchemy.orm import Session

from db.models import ApiCallLog, AgentLog

RATE_LIMIT = 100  # calls per endpoint per UTC day


class QuotaExceededException(Exception):
    """Raised when the daily API quota for an endpoint is reached."""
    pass


class ToolFactory:
    """
    Builds LangGraph-compatible tools from an OpenAPI 3.x specification.

    Usage:
        factory = ToolFactory(openapi_spec=spec, base_url=BASE_URL, api_key=API_KEY)
        tools = factory.build_tools(db_session)
    """

    def __init__(self, openapi_spec: dict, base_url: str, api_key: str):
        self.spec: dict = openapi_spec
        self.base_url: str = base_url.rstrip("/")
        self.api_key: str = api_key

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def build_tools(self, db: Session) -> list:
        """Return a list of LangChain @tool-decorated callables."""
        tools = []
        paths = self.spec.get("paths", {})

        for path, methods in paths.items():
            for http_method, operation in methods.items():
                if http_method.lower() not in {"get", "post", "put", "patch", "delete"}:
                    continue
                fn = self._build_tool_fn(path, http_method, operation, db)
                tools.append(fn)

        return tools

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _build_tool_fn(self, path: str, method: str, operation: dict, db: Session):
        """Create a single tool function for one path+method."""
        operation_id = operation.get("operationId", f"{method}_{path.replace('/', '_')}")
        summary = operation.get("summary", "")
        description = operation.get("description", "")
        parameters = operation.get("parameters", [])
        request_body_schema = self._extract_request_body_schema(operation)

        # Build a rich docstring for the LLM
        param_docs = "\n".join(
            f"  - {p['name']} ({p['in']}): {p.get('description', '')} "
            f"[required={p.get('required', False)}]"
            for p in parameters
        )
        tool_docstring = (
            f"{summary}\n\n"
            f"{description}\n\n"
            f"Parameters:\n{param_docs}\n"
            f"Body schema: {json.dumps(request_body_schema, indent=2)}"
        ).strip()

        base_url = self.base_url
        api_key = self.api_key

        # Capture values in closure
        def _invoke(
            body: dict | None = None,
            query_params: dict | None = None,
            campaign_id_for_log: str | None = None,
        ) -> dict:
            """
            Invoke the wrapped hackathon API endpoint.

            Args:
                body:      JSON body for POST/PUT operations.
                query_params: Query-string parameters for GET operations.
                campaign_id_for_log: Optional campaign UUID for AgentLog linkage.
            """
            endpoint_key = quota_key_for_endpoint(path, api_key)

            # ── Rate limit check ──────────────────────────────────────
            _check_and_increment_quota(db, endpoint_key)

            # ── Build request ─────────────────────────────────────────
            url = base_url + path
            headers = {"X-API-Key": api_key, "Content-Type": "application/json"}

            resp = requests.request(
                method=method.upper(),
                url=url,
                params=query_params or {},
                json=body,
                headers=headers,
                timeout=30,
            )

            # ── Log to AgentLog ───────────────────────────────────────
            _write_agent_log(
                db=db,
                campaign_id=campaign_id_for_log,
                agent_name="ToolFactory",
                operation_id=operation_id,
                input_payload={"url": url, "method": method, "body": body, "params": query_params},
                output_payload={
                    "status_code": resp.status_code,
                    "body_snippet": resp.text[:500],
                },
            )

            resp_json: dict = {}
            try:
                resp_json = resp.json()
            except Exception:
                pass

            # ── Granular error handling per apidoc Section 4 ──────────

            if resp.status_code == 429:
                # API-side rate limit (shouldn't normally hit — we pre-check)
                # Roll back the quota increment we just made
                row2 = (
                    db.query(ApiCallLog)
                    .filter(ApiCallLog.endpoint == endpoint_key, ApiCallLog.date_utc == date.today())
                    .first()
                )
                if row2 and row2.call_count > 0:
                    row2.call_count -= 1
                    db.commit()
                raise QuotaExceededException(
                    f"Hackathon API returned 429 Too Many Requests for '{path}'. Daily limit exhausted."
                )

            if resp.status_code == 422:
                # Validation error — surface the full detail array so agents can self-correct
                detail = resp_json.get("detail", resp.text[:500])
                raise ValueError(f"API validation error (422) on '{path}': {json.dumps(detail)}")

            if resp.status_code == 401:
                raise PermissionError("API returned 401 Unauthorized — check HACKATHON_API_KEY in .env")

            if resp.status_code == 403:
                raise PermissionError("API returned 403 Forbidden — key valid but lacks permission")

            if resp.status_code == 404:
                raise LookupError(f"API returned 404 Not Found for path: {path}")

            if not resp.ok:
                raise RuntimeError(
                    f"API error {resp.status_code} on '{path}': {resp.text[:300]}"
                )

            return resp_json if resp_json else resp.json()


        # Rename function so LangChain uses operationId as tool name
        _invoke.__name__ = operation_id
        _invoke.__doc__ = tool_docstring

        # Wrap with LangChain @tool decorator
        return tool(_invoke)

    @staticmethod
    def _extract_request_body_schema(operation: dict) -> dict:
        """Pull JSON schema from requestBody if present."""
        try:
            return (
                operation["requestBody"]["content"]["application/json"]["schema"]
            )
        except (KeyError, TypeError):
            return {}

    # ------------------------------------------------------------------
    # Class-level helpers (no self access needed)
    # ------------------------------------------------------------------

    @classmethod
    def from_url(cls, base_url: str, api_key: str) -> "ToolFactory":
        """Fetch openapi.json from the live server and build a ToolFactory."""
        spec_url = base_url.rstrip("/") + "/openapi.json"
        resp = requests.get(spec_url, timeout=15)
        resp.raise_for_status()
        return cls(openapi_spec=resp.json(), base_url=base_url, api_key=api_key)

    @classmethod
    def from_file(cls, spec_path: str, base_url: str, api_key: str) -> "ToolFactory":
        """Load openapi.json from disk."""
        with open(spec_path, "r") as f:
            spec = json.load(f)
        return cls(openapi_spec=spec, base_url=base_url, api_key=api_key)


# ──────────────────────────────────────────────────────────────────────────────
# Quota helpers
# ──────────────────────────────────────────────────────────────────────────────

def _check_and_increment_quota(db: Session, endpoint: str) -> None:
    """
    Check ApiCallLog for today's count. Increment on success.
    Raises QuotaExceededException if limit reached.
    """
    today = date.today()
    row = (
        db.query(ApiCallLog)
        .filter(ApiCallLog.endpoint == endpoint, ApiCallLog.date_utc == today)
        .first()
    )

    if row is None:
        row = ApiCallLog(endpoint=endpoint, date_utc=today, call_count=0)
        db.add(row)
        db.flush()

    if row.call_count >= RATE_LIMIT:
        raise QuotaExceededException(
            f"Rate limit reached for '{endpoint}': {row.call_count}/{RATE_LIMIT} calls today (UTC)."
        )

    row.call_count += 1
    db.commit()


def quota_key_for_endpoint(endpoint_path: str, api_key: str | None = None) -> str:
    """
    Build a quota key that is scoped by endpoint + API key suffix.
    This prevents one expired/rotated key from blocking new credentials.
    """
    key = api_key if api_key is not None else os.environ.get("HACKATHON_API_KEY", "")
    suffix = (key[-8:] if key else "no_key")
    return f"{endpoint_path}::{suffix}"


def _write_agent_log(
    db: Session,
    campaign_id: str | None,
    agent_name: str,
    operation_id: str,
    input_payload: dict,
    output_payload: dict,
) -> None:
    """Persist a tool invocation to AgentLog."""
    log = AgentLog(
        campaign_id=campaign_id,
        agent_name=agent_name,
        step=None,
        input_payload=input_payload,
        output_payload=output_payload,
        llm_reasoning=f"Tool invoked: {operation_id}",
    )
    db.add(log)
    db.commit()
