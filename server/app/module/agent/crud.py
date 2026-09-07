from typing import Optional
from uuid import UUID

import psycopg2.extras
from psycopg2.extras import Json

from app.module.database.connection import get_connection, get_cursor
from app.module.agent.schemas import AgentConfigIn, AgentCreate, AgentPromptCreate, AgentUpdate

AGENT_COLUMNS = "id, slug, name, description, owner_id, model_id, is_active, created_at, updated_at"
PROMPT_COLUMNS = "id, agent_id, version, system_prompt, is_active, created_at, updated_at"
CONFIG_COLUMNS = (
    "id, agent_id, temperature, max_tokens, top_p, top_k, context_window, "
    "repetition_penalty, seed, streaming_enabled, extra_config, created_at, updated_at"
)


# ========================================
# AGENTS
# ========================================

def list_agents(owner_id: Optional[UUID] = None) -> list[dict]:
    with get_cursor() as cur:
        if owner_id:
            cur.execute(
                f"SELECT {AGENT_COLUMNS} FROM agents WHERE owner_id = %s ORDER BY created_at DESC;",
                (str(owner_id),),
            )
        else:
            cur.execute(f"SELECT {AGENT_COLUMNS} FROM agents ORDER BY created_at DESC;")
        return cur.fetchall()


def get_agent(agent_id: UUID) -> Optional[dict]:
    with get_cursor() as cur:
        cur.execute(f"SELECT {AGENT_COLUMNS} FROM agents WHERE id = %s;", (str(agent_id),))
        return cur.fetchone()


def create_agent(data: AgentCreate) -> dict:
    """Create the agent, and optionally its first prompt version / config, atomically."""
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                f"""
                INSERT INTO agents (slug, name, description, owner_id, model_id, is_active)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING {AGENT_COLUMNS};
                """,
                (
                    data.slug,
                    data.name,
                    data.description,
                    str(data.owner_id),
                    str(data.model_id) if data.model_id else None,
                    data.is_active,
                ),
            )
            agent = cur.fetchone()

            if data.system_prompt:
                cur.execute(
                    """
                    INSERT INTO agent_prompts (agent_id, version, system_prompt, is_active)
                    VALUES (%s, 1, %s, true);
                    """,
                    (agent["id"], data.system_prompt),
                )

            if data.config is not None:
                sql, params = _config_upsert_sql(agent["id"], data.config)
                cur.execute(sql, params)

        conn.commit()
        return agent
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def update_agent(agent_id: UUID, data: AgentUpdate) -> Optional[dict]:
    fields = data.model_dump(exclude_unset=True)
    if "model_id" in fields and fields["model_id"] is not None:
        fields["model_id"] = str(fields["model_id"])
    if not fields:
        return get_agent(agent_id)

    set_clause = ", ".join(f"{column} = %s" for column in fields)
    values = list(fields.values()) + [str(agent_id)]

    with get_cursor(commit=True) as cur:
        cur.execute(
            f"""
            UPDATE agents
            SET {set_clause}, updated_at = now()
            WHERE id = %s
            RETURNING {AGENT_COLUMNS};
            """,
            values,
        )
        return cur.fetchone()


def delete_agent(agent_id: UUID) -> bool:
    with get_cursor(commit=True) as cur:
        cur.execute("DELETE FROM agents WHERE id = %s RETURNING id;", (str(agent_id),))
        return cur.fetchone() is not None


# ========================================
# AGENT PROMPTS
# ========================================

def list_prompts(agent_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            f"SELECT {PROMPT_COLUMNS} FROM agent_prompts WHERE agent_id = %s ORDER BY version DESC;",
            (str(agent_id),),
        )
        return cur.fetchall()


def create_prompt(agent_id: UUID, data: AgentPromptCreate) -> dict:
    """Insert the next version for this agent; if marked active, deactivate the others."""
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM agent_prompts WHERE agent_id = %s;",
                (str(agent_id),),
            )
            next_version = cur.fetchone()["next_version"]

            if data.is_active:
                cur.execute(
                    """
                    UPDATE agent_prompts SET is_active = false, updated_at = now()
                    WHERE agent_id = %s AND is_active = true;
                    """,
                    (str(agent_id),),
                )

            cur.execute(
                f"""
                INSERT INTO agent_prompts (agent_id, version, system_prompt, is_active)
                VALUES (%s, %s, %s, %s)
                RETURNING {PROMPT_COLUMNS};
                """,
                (str(agent_id), next_version, data.system_prompt, data.is_active),
            )
            prompt = cur.fetchone()

        conn.commit()
        return prompt
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def activate_prompt(agent_id: UUID, prompt_id: UUID) -> Optional[dict]:
    """Mark one prompt version active for the agent and deactivate every other version."""
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                UPDATE agent_prompts SET is_active = false, updated_at = now()
                WHERE agent_id = %s AND is_active = true;
                """,
                (str(agent_id),),
            )
            cur.execute(
                f"""
                UPDATE agent_prompts
                SET is_active = true, updated_at = now()
                WHERE id = %s AND agent_id = %s
                RETURNING {PROMPT_COLUMNS};
                """,
                (str(prompt_id), str(agent_id)),
            )
            prompt = cur.fetchone()

        conn.commit()
        return prompt
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def delete_prompt(agent_id: UUID, prompt_id: UUID) -> bool:
    with get_cursor(commit=True) as cur:
        cur.execute(
            "DELETE FROM agent_prompts WHERE id = %s AND agent_id = %s RETURNING id;",
            (str(prompt_id), str(agent_id)),
        )
        return cur.fetchone() is not None


# ========================================
# AGENT CONFIG
# ========================================

def _config_upsert_sql(agent_id: UUID, data: AgentConfigIn):
    fields = data.model_dump(exclude_unset=True)
    if fields.get("extra_config") is not None:
        fields["extra_config"] = Json(fields["extra_config"])
    fields["agent_id"] = str(agent_id)

    columns = list(fields.keys())
    set_parts = [f"{column} = EXCLUDED.{column}" for column in columns if column != "agent_id"]
    set_parts.append("updated_at = now()")

    sql = f"""
        INSERT INTO agent_configs ({", ".join(columns)})
        VALUES ({", ".join(["%s"] * len(columns))})
        ON CONFLICT (agent_id) DO UPDATE
        SET {", ".join(set_parts)}
        RETURNING {CONFIG_COLUMNS};
    """
    return sql, list(fields.values())


def get_config(agent_id: UUID) -> Optional[dict]:
    with get_cursor() as cur:
        cur.execute(f"SELECT {CONFIG_COLUMNS} FROM agent_configs WHERE agent_id = %s;", (str(agent_id),))
        return cur.fetchone()


def upsert_config(agent_id: UUID, data: AgentConfigIn) -> dict:
    sql, params = _config_upsert_sql(agent_id, data)
    with get_cursor(commit=True) as cur:
        cur.execute(sql, params)
        return cur.fetchone()


def delete_config(agent_id: UUID) -> bool:
    with get_cursor(commit=True) as cur:
        cur.execute("DELETE FROM agent_configs WHERE agent_id = %s RETURNING id;", (str(agent_id),))
        return cur.fetchone() is not None
