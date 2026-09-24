from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel


class InferenceRequestOut(BaseModel):
    id: UUID
    agent_id: UUID
    agent_slug: str
    agent_name: str
    owner_id: UUID
    owner_username: str
    prompt_id: UUID
    prompt_version: int
    model_id: Optional[UUID] = None
    model_name: Optional[str] = None
    user_prompt: str
    assistant_response: Optional[str] = None
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    total_tokens: Optional[int] = None
    latency_ms: Optional[int] = None
    status: str
    error_message: Optional[str] = None
    created_at: datetime


class InferenceRequestListOut(BaseModel):
    items: List[InferenceRequestOut]
    total: int
    limit: int
    offset: int
