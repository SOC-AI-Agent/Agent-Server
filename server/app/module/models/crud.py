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
