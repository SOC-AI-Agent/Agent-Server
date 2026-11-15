from typing import Optional
from uuid import UUID

from app.module.database.connection import get_cursor

MODEL_COLUMNS = "id, name, model_name, provider, is_active, created_at, updated_at"


def list_models() -> list[dict]:
    with get_cursor() as cur:
        cur.execute(f"SELECT {MODEL_COLUMNS} FROM llm_models ORDER BY created_at DESC;")
        return cur.fetchall()


def get_model(model_id: UUID) -> Optional[dict]:
    with get_cursor() as cur:
        cur.execute(f"SELECT {MODEL_COLUMNS} FROM llm_models WHERE id = %s;", (str(model_id),))
        return cur.fetchone()


def upsert_model(name: str, model_name: str, provider: Optional[str], is_active: bool = True) -> dict:
    with get_cursor(commit=True) as cur:
        cur.execute("SELECT id FROM llm_models WHERE model_name = %s;", (model_name,))
        existing = cur.fetchone()
        if existing:
            cur.execute(
                f"""
                UPDATE llm_models
                SET name = %s, provider = %s, is_active = %s, updated_at = now()
                WHERE id = %s
                RETURNING {MODEL_COLUMNS};
                """,
                (name, provider, is_active, str(existing["id"])),
            )
        else:
            cur.execute(
                f"""
                INSERT INTO llm_models (name, model_name, provider, is_active)
                VALUES (%s, %s, %s, %s)
                RETURNING {MODEL_COLUMNS};
                """,
                (name, model_name, provider, is_active),
            )
        return cur.fetchone()


def delete_model(model_id: UUID) -> bool:
    with get_cursor(commit=True) as cur:
        cur.execute("DELETE FROM llm_models WHERE id = %s;", (str(model_id),))
        return cur.rowcount > 0
