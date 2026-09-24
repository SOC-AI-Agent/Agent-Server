from typing import Optional
from uuid import UUID

from app.module.database.connection import get_cursor

HISTORY_COLUMNS = """
    ir.id, ir.agent_id, a.slug AS agent_slug, a.name AS agent_name,
    a.owner_id, u.username AS owner_username,
    ir.prompt_id, ap.version AS prompt_version,
    ir.model_id, lm.name AS model_name,
    ir.user_prompt, ir.assistant_response,
    ir.input_tokens, ir.output_tokens, ir.total_tokens,
    ir.latency_ms, ir.status, ir.error_message, ir.created_at
"""
HISTORY_JOINS = """
    FROM inference_requests ir
    JOIN agents a ON a.id = ir.agent_id
    JOIN users u ON u.id = a.owner_id
    JOIN agent_prompts ap ON ap.id = ir.prompt_id
    LEFT JOIN llm_models lm ON lm.id = ir.model_id
"""


def _history_where(owner_id: Optional[UUID], agent_id: Optional[UUID], status_filter: Optional[str]):
    conditions = []
    params: list = []
    if owner_id is not None:
        conditions.append("a.owner_id = %s")
        params.append(str(owner_id))
    if agent_id is not None:
        conditions.append("ir.agent_id = %s")
        params.append(str(agent_id))
    if status_filter is not None:
        conditions.append("ir.status = %s")
        params.append(status_filter)
    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    return where_clause, params


def list_inference_requests(
    owner_id: Optional[UUID] = None,
    agent_id: Optional[UUID] = None,
    status_filter: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    """List inference log rows, newest first. Pass owner_id to scope to one user's agents."""
    where_clause, params = _history_where(owner_id, agent_id, status_filter)
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT {HISTORY_COLUMNS}
            {HISTORY_JOINS}
            {where_clause}
            ORDER BY ir.created_at DESC
            LIMIT %s OFFSET %s;
            """,
            params + [limit, offset],
        )
        return cur.fetchall()


def count_inference_requests(
    owner_id: Optional[UUID] = None,
    agent_id: Optional[UUID] = None,
    status_filter: Optional[str] = None,
) -> int:
    where_clause, params = _history_where(owner_id, agent_id, status_filter)
    with get_cursor() as cur:
        cur.execute(
            f"SELECT COUNT(*) AS count {HISTORY_JOINS} {where_clause};",
            params,
        )
        return cur.fetchone()["count"]


def log_inference(
    agent_id: UUID,
    prompt_id: UUID,
    model_id: Optional[UUID],
    user_prompt: str,
    assistant_response: Optional[str],
    input_tokens: Optional[int],
    output_tokens: Optional[int],
    total_tokens: Optional[int],
    latency_ms: int,
    status: str,
    error_message: Optional[str] = None,
) -> None:
    with get_cursor(commit=True) as cur:
        cur.execute(
            """
            INSERT INTO inference_requests (
                agent_id, prompt_id, model_id, user_prompt, assistant_response,
                input_tokens, output_tokens, total_tokens, latency_ms, status, error_message
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
            """,
            (
                str(agent_id),
                str(prompt_id),
                str(model_id) if model_id else None,
                user_prompt,
                assistant_response,
                input_tokens,
                output_tokens,
                total_tokens,
                latency_ms,
                status,
                error_message,
            ),
        )
