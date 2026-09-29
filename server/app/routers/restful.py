import logging
from typing import List, Optional
from uuid import UUID

import psycopg2
from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.module.agent import crud as agent_crud
from app.module.agent.schemas import (
    AgentConfigIn,
    AgentConfigOut,
    AgentCreate,
    AgentOut,
    AgentPromptCreate,
    AgentPromptOut,
    AgentPromptUpdate,
    AgentUpdate,
)
from app.module.auth.dependencies import get_current_user, require_admin
from app.module.auth.schemas import LoginRequest, LoginResponse
from app.module.auth.security import create_access_token
from app.module.inference import crud as inference_crud
from app.module.inference.schemas import InferenceRequestListOut
from app.module.models import crud as models_crud
from app.module.models.schemas import LlmModelOut
from app.module.users import crud as users_crud
from app.module.users.schemas import UserCreate, UserOut, UserUpdate

log = logging.getLogger("dall_m.audit")

# Public — no login required.
auth_router = APIRouter(prefix="/restful/auth", tags=["auth"])

# Everything below requires a valid Bearer token (see get_current_user).
router = APIRouter(prefix="/restful", tags=["restful"], dependencies=[Depends(get_current_user)])


def _audit(user: dict, action: str, **fields) -> None:
    """Who changed what. The request line in main.py has the path; this has the meaning."""
    detail = " ".join(f"{key}={value}" for key, value in fields.items())
    log.info("%s by=%s %s", action, user["username"], detail)


# ========================================
# AUTH
# ========================================

@auth_router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, request: Request):
    client = request.client.host if request.client else "-"
    user = users_crud.get_user_by_username_with_password(payload.username)
    if user is None or user["password"] != payload.password or not user["is_active"]:
        reason = "unknown user" if user is None else "inactive user" if not user["is_active"] else "wrong password"
        log.warning("login.failed username=%s reason=%s client=%s", payload.username, reason, client)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

    request.state.username = user["username"]
    log.info("login.success username=%s admin=%s client=%s", user["username"], user["is_admin"], client)
    token = create_access_token(user)
    user_out = {key: value for key, value in user.items() if key != "password"}
    return {"access_token": token, "token_type": "bearer", "user": user_out}


# ========================================
# USERS
# ========================================

@router.get("/users", response_model=List[UserOut])
def list_users():
    return users_crud.list_users()


@router.get("/users/{user_id}", response_model=UserOut)
def get_user(user_id: UUID):
    user = users_crud.get_user(user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, actor: dict = Depends(require_admin)):
    try:
        user = users_crud.create_user(payload)
    except psycopg2.errors.UniqueViolation:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username or email already exists")
    _audit(actor, "user.create", id=user["id"], username=user["username"], admin=user["is_admin"])
    return user


@router.put("/users/{user_id}", response_model=UserOut)
def update_user(user_id: UUID, payload: UserUpdate, actor: dict = Depends(require_admin)):
    try:
        user = users_crud.update_user(user_id, payload)
    except psycopg2.errors.UniqueViolation:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username or email already exists")
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    # Field names only: one of them may be the password.
    _audit(actor, "user.update", id=user_id, username=user["username"],
           fields=sorted(payload.model_dump(exclude_unset=True)))
    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: UUID, actor: dict = Depends(require_admin)):
    target = users_crud.get_user(user_id)
    deleted = users_crud.delete_user(user_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    _audit(actor, "user.delete", id=user_id, username=target["username"] if target else "?")


# ========================================
# LLM MODELS
# ========================================

@router.get("/models", response_model=List[LlmModelOut])
def list_models():
    return models_crud.list_models()


@router.get("/models/{model_id}", response_model=LlmModelOut)
def get_model(model_id: UUID):
    model = models_crud.get_model(model_id)
    if model is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")
    return model


# ========================================
# AGENTS
# ========================================

@router.get("/agents", response_model=List[AgentOut])
def list_agents(owner_id: Optional[UUID] = None):
    return agent_crud.list_agents(owner_id)


@router.get("/agents/{agent_id}", response_model=AgentOut)
def get_agent(agent_id: UUID):
    agent = agent_crud.get_agent(agent_id)
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return agent


@router.post("/agents", response_model=AgentOut, status_code=status.HTTP_201_CREATED)
def create_agent(payload: AgentCreate, actor: dict = Depends(get_current_user)):
    try:
        agent = agent_crud.create_agent(payload)
    except psycopg2.errors.UniqueViolation:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Agent slug already exists")
    except psycopg2.errors.ForeignKeyViolation:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid owner_id or model_id")
    _audit(actor, "agent.create", id=agent["id"], slug=agent["slug"], model_id=agent["model_id"],
           with_prompt=bool(payload.system_prompt), with_config=payload.config is not None)
    return agent


@router.put("/agents/{agent_id}", response_model=AgentOut)
def update_agent(agent_id: UUID, payload: AgentUpdate, actor: dict = Depends(get_current_user)):
    try:
        agent = agent_crud.update_agent(agent_id, payload)
    except psycopg2.errors.UniqueViolation:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Agent slug already exists")
    except psycopg2.errors.ForeignKeyViolation:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid model_id")
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    _audit(actor, "agent.update", id=agent_id, slug=agent["slug"], changes=payload.model_dump(exclude_unset=True))
    return agent


@router.delete("/agents/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_agent(agent_id: UUID, actor: dict = Depends(get_current_user)):
    agent = agent_crud.get_agent(agent_id)
    if agent is None or not agent_crud.delete_agent(agent_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    _audit(actor, "agent.delete", id=agent_id, slug=agent["slug"], name=repr(agent["name"]))


# ========================================
# AGENT PROMPTS
# ========================================

@router.get("/agents/{agent_id}/prompts", response_model=List[AgentPromptOut])
def list_agent_prompts(agent_id: UUID):
    return agent_crud.list_prompts(agent_id)


@router.post("/agents/{agent_id}/prompts", response_model=AgentPromptOut, status_code=status.HTTP_201_CREATED)
def create_agent_prompt(agent_id: UUID, payload: AgentPromptCreate, actor: dict = Depends(get_current_user)):
    try:
        prompt = agent_crud.create_prompt(agent_id, payload)
    except psycopg2.errors.ForeignKeyViolation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    _audit(actor, "prompt.create", agent_id=agent_id, version=prompt["version"], active=prompt["is_active"],
           chars=len(prompt["system_prompt"]))
    return prompt


@router.put("/agents/{agent_id}/prompts/{prompt_id}", response_model=AgentPromptOut)
def update_agent_prompt(
    agent_id: UUID, prompt_id: UUID, payload: AgentPromptUpdate, actor: dict = Depends(get_current_user),
):
    """Edit the text of an existing prompt version in place (does not create a new version)."""
    prompt = agent_crud.update_prompt(agent_id, prompt_id, payload)
    if prompt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prompt not found")
    _audit(actor, "prompt.edit_in_place", agent_id=agent_id, version=prompt["version"],
           chars=len(prompt["system_prompt"]))
    return prompt


@router.put("/agents/{agent_id}/prompts/{prompt_id}/activate", response_model=AgentPromptOut)
def activate_agent_prompt(agent_id: UUID, prompt_id: UUID, actor: dict = Depends(get_current_user)):
    prompt = agent_crud.activate_prompt(agent_id, prompt_id)
    if prompt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prompt not found")
    _audit(actor, "prompt.activate", agent_id=agent_id, version=prompt["version"])
    return prompt


@router.delete("/agents/{agent_id}/prompts/{prompt_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_agent_prompt(agent_id: UUID, prompt_id: UUID, actor: dict = Depends(get_current_user)):
    if not agent_crud.delete_prompt(agent_id, prompt_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prompt not found")
    _audit(actor, "prompt.delete", agent_id=agent_id, prompt_id=prompt_id)


# ========================================
# AGENT CONFIG
# ========================================

@router.get("/agents/{agent_id}/config", response_model=AgentConfigOut)
def get_agent_config(agent_id: UUID):
    config = agent_crud.get_config(agent_id)
    if config is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Config not found")
    return config


@router.put("/agents/{agent_id}/config", response_model=AgentConfigOut)
def upsert_agent_config(agent_id: UUID, payload: AgentConfigIn, actor: dict = Depends(get_current_user)):
    try:
        config = agent_crud.upsert_config(agent_id, payload)
    except psycopg2.errors.ForeignKeyViolation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    _audit(actor, "config.save", agent_id=agent_id, changes=payload.model_dump(exclude_unset=True))
    return config


@router.delete("/agents/{agent_id}/config", status_code=status.HTTP_204_NO_CONTENT)
def delete_agent_config(agent_id: UUID, actor: dict = Depends(get_current_user)):
    if not agent_crud.delete_config(agent_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Config not found")
    _audit(actor, "config.delete", agent_id=agent_id)


# ========================================
# INFERENCE HISTORY
# ========================================

@router.get("/inference-requests", response_model=InferenceRequestListOut)
def list_inference_requests(
    agent_id: Optional[UUID] = None,
    status_filter: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    current_user: dict = Depends(get_current_user),
):
    """Chat history log. Admins see every agent's requests; regular users see only their own agents'."""
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    owner_id = None if current_user.get("is_admin") else current_user["id"]

    items = inference_crud.list_inference_requests(owner_id, agent_id, status_filter, limit, offset)
    total = inference_crud.count_inference_requests(owner_id, agent_id, status_filter)
    return {"items": items, "total": total, "limit": limit, "offset": offset}
