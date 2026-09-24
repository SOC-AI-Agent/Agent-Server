from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class LlmModelOut(BaseModel):
    id: UUID
    name: str
    model_name: str
    provider: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
