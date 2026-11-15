from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class LlmModelCreate(BaseModel):
    name: str
    model_name: str
    provider: Optional[str] = "openai-compatible"
    is_active: bool = True


class LlmModelOut(BaseModel):
    id: UUID
    name: str
    model_name: str
    provider: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
