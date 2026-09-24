from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, Optional
from uuid import UUID

from pydantic import BaseModel


# ========================================
# AGENT CONFIG
# ========================================

class AgentConfigIn(BaseModel):
    temperature: Optional[Decimal] = None
    max_tokens: Optional[int] = None
    top_p: Optional[Decimal] = None
    top_k: Optional[int] = None
    context_window: Optional[int] = None
    repetition_penalty: Optional[Decimal] = None
    seed: Optional[int] = None
    streaming_enabled: Optional[bool] = None
    extra_config: Optional[Dict[str, Any]] = None


class AgentConfigOut(BaseModel):
    id: UUID
    agent_id: UUID
    temperature: Optional[Decimal] = None
    max_tokens: Optional[int] = None
    top_p: Optional[Decimal] = None
    top_k: Optional[int] = None
    context_window: Optional[int] = None
    repetition_penalty: Optional[Decimal] = None
    seed: Optional[int] = None
    streaming_enabled: bool
    extra_config: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime


# ========================================
# AGENT PROMPTS
# ========================================

class AgentPromptCreate(BaseModel):
    system_prompt: str
    is_active: bool = False


class AgentPromptUpdate(BaseModel):
    system_prompt: str


class AgentPromptOut(BaseModel):
    id: UUID
    agent_id: UUID
    version: int
    system_prompt: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ========================================
# AGENTS
# ========================================

class AgentCreate(BaseModel):
    slug: str
    name: str
    description: Optional[str] = None
    owner_id: UUID
    model_id: Optional[UUID] = None
    is_active: bool = True

    # Optional convenience fields: when provided, create_agent() also creates
    # the first active prompt version and/or the generation config in the
    # same transaction as the agent itself.
    system_prompt: Optional[str] = None
    config: Optional[AgentConfigIn] = None


class AgentUpdate(BaseModel):
    slug: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    model_id: Optional[UUID] = None
    is_active: Optional[bool] = None


class AgentOut(BaseModel):
    id: UUID
    slug: str
    name: str
    description: Optional[str] = None
    owner_id: UUID
    model_id: Optional[UUID] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ========================================
# AGENT INVOCATION
# ========================================

class AgentChatRequest(BaseModel):
    message: str
    stream: bool = True


class AgentChatResponse(BaseModel):
    agent: str
    prompt_version: int
    content: str
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    total_tokens: Optional[int] = None
    latency_ms: int
