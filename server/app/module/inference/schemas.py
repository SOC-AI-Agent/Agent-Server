from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel


class InferenceRequestOut(BaseModel):
    id: UUID
    # None once the agent (and with it, the prompt) has been deleted.
    agent_id: Optional[UUID] = None
    agent_slug: str
    agent_name: str
    owner_id: UUID
    owner_username: Optional[str] = None
    prompt_id: Optional[UUID] = None
    prompt_version: int
    system_prompt: str
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
