"""Agents this server always has.

`soc-spl-writer` writes the SPL for the SOC platform's Splunk lookups (text to
SPL). The platform calls it by this slug, so the slug is fixed here: the agent is
created when it is missing and cannot be deleted, renamed or switched off. Its
model, prompt versions and config stay editable like any other agent's.
"""
import logging
import os
from typing import Optional

from app.module.agent import crud as agent_crud
from app.module.agent.schemas import AgentConfigIn, AgentCreate
from app.module.database.connection import get_cursor

log = logging.getLogger("dall_m.builtin")

SPL_WRITER_SLUG = "soc-spl-writer"
# The model it is created with when that model is registered; else the first active one.
SPL_WRITER_MODEL = os.environ.get("SPL_WRITER_MODEL", "google/gemini-2.5-flash")

BUILTIN_AGENTS = {
    SPL_WRITER_SLUG: {
        "description": "Text to SPL: one read-only Splunk search per requirement (built in)",
        # Short on purpose: the request and its ANSWER FORMAT arrive in every message.
        "system_prompt": (
            "You write Splunk SPL for a SOC. Each message is one search request followed by an "
            "ANSWER FORMAT. Reply with exactly one ```spl code block holding one search, and "
            "nothing else — no explanation, no alternatives.\n\n"
            "Use only the index, sourcetype, field names, values and time range the request "
            "gives. Never invent a field name or a value. Copy values verbatim."
        ),
        "config": {"temperature": 0, "max_tokens": 1024, "context_window": 4096, "streaming_enabled": False},
        "model": SPL_WRITER_MODEL,
    },
}


def is_builtin(slug: Optional[str]) -> bool:
    return slug in BUILTIN_AGENTS


def _owner_id() -> Optional[str]:
    with get_cursor() as cur:
        cur.execute(
            "SELECT id FROM users WHERE is_active ORDER BY is_admin DESC, created_at ASC LIMIT 1;"
        )
        row = cur.fetchone()
        return str(row["id"]) if row else None


def _model_id(wanted: str) -> Optional[str]:
    with get_cursor() as cur:
        cur.execute(
            "SELECT id FROM llm_models WHERE is_active ORDER BY (model_name = %s) DESC, created_at ASC LIMIT 1;",
            (wanted,),
        )
        row = cur.fetchone()
        return str(row["id"]) if row else None


def ensure_builtin_agents() -> None:
    """Create whichever built-in agent is missing. Never raises: before the first
    user exists there is no owner to give it, and the next call tries again."""
    for slug, spec in BUILTIN_AGENTS.items():
        try:
            if agent_crud.get_agent_by_slug(slug) is not None:
                continue
            owner_id = _owner_id()
            if owner_id is None:
                continue
            agent_crud.create_agent(AgentCreate(
                slug=slug,
                name=slug,
                description=spec["description"],
                owner_id=owner_id,
                model_id=_model_id(spec["model"]),
                is_active=True,
                system_prompt=spec["system_prompt"],
                config=AgentConfigIn(**spec["config"]),
            ))
            log.info("built-in agent created: %s", slug)
        except Exception as exc:  # a missing table, or another worker created it first
            log.warning("built-in agent %s not ensured: %s", slug, exc)
