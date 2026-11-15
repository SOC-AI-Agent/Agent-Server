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


def update_model(
    model_id: UUID,
    name: Optional[str] = None,
    model_name: Optional[str] = None,
    provider: Optional[str] = None,
    is_active: Optional[bool] = None,
) -> Optional[dict]:
    fields = []
    values = []
    if name is not None:
        fields.append("name = %s")
        values.append(name)
    if model_name is not None:
        fields.append("model_name = %s")
        values.append(model_name)
    if provider is not None:
        fields.append("provider = %s")
        values.append(provider)
    if is_active is not None:
        fields.append("is_active = %s")
        values.append(is_active)

    if not fields:
        return get_model(model_id)

    fields.append("updated_at = now()")
    values.append(str(model_id))
    with get_cursor(commit=True) as cur:
        cur.execute(
            f"UPDATE llm_models SET {', '.join(fields)} WHERE id = %s RETURNING {MODEL_COLUMNS};",
            tuple(values),
        )
        return cur.fetchone()


def delete_model(model_id: UUID) -> bool:
    with get_cursor(commit=True) as cur:
        cur.execute("UPDATE agents SET model_id = NULL, updated_at = now() WHERE model_id = %s;", (str(model_id),))
        cur.execute("DELETE FROM llm_models WHERE id = %s;", (str(model_id),))
        return cur.rowcount > 0
