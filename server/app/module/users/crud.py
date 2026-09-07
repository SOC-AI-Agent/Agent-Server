from typing import Optional
from uuid import UUID

from app.module.database.connection import get_cursor
from app.module.users.schemas import UserCreate, UserUpdate

RETURNING_COLUMNS = "id, username, email, is_active, created_at, updated_at"


def list_users() -> list[dict]:
    with get_cursor() as cur:
        cur.execute(f"SELECT {RETURNING_COLUMNS} FROM users ORDER BY created_at DESC;")
        return cur.fetchall()


def get_user(user_id: UUID) -> Optional[dict]:
    with get_cursor() as cur:
        cur.execute(f"SELECT {RETURNING_COLUMNS} FROM users WHERE id = %s;", (str(user_id),))
        return cur.fetchone()


def create_user(data: UserCreate) -> dict:
    with get_cursor(commit=True) as cur:
        cur.execute(
            f"""
            INSERT INTO users (username, email, password, is_active)
            VALUES (%s, %s, %s, %s)
            RETURNING {RETURNING_COLUMNS};
            """,
            (data.username, data.email, data.password, data.is_active),
        )
        return cur.fetchone()


def update_user(user_id: UUID, data: UserUpdate) -> Optional[dict]:
    fields = data.model_dump(exclude_unset=True)
    if not fields:
        return get_user(user_id)

    set_clause = ", ".join(f"{column} = %s" for column in fields)
    values = list(fields.values()) + [str(user_id)]

    with get_cursor(commit=True) as cur:
        cur.execute(
            f"""
            UPDATE users
            SET {set_clause}, updated_at = now()
            WHERE id = %s
            RETURNING {RETURNING_COLUMNS};
            """,
            values,
        )
        return cur.fetchone()


def delete_user(user_id: UUID) -> bool:
    with get_cursor(commit=True) as cur:
        cur.execute("DELETE FROM users WHERE id = %s RETURNING id;", (str(user_id),))
        return cur.fetchone() is not None
