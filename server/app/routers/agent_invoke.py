import json
import logging
import time
from typing import Any, Optional

import httpx
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse

from app.module.agent import crud as agent_crud
from app.module.agent.schemas import AgentChatRequest, AgentChatResponse
from app.module.inference import crud as inference_crud
from app.module.llm.client import get_chat, stream_chat
from app.module.logs import preview
from app.module.models import crud as models_crud

log = logging.getLogger("dall_m.invoke")

# Public inference surface for *using* an agent (as opposed to /restful, which
# manages agent resources and requires a logged-in session). Not gated behind
# auth for now — there is no API-client/key system yet (see inference_requests.
# api_client_id in the ERD, reserved for that future work).
router = APIRouter(prefix="/v1/agents", tags=["agent-invoke"])


def _build_gen_params(config: Optional[dict]) -> dict[str, Any]:
    """Map an agent_configs row onto llama.cpp / OpenAI-compatible chat completion params."""
    if not config:
        return {}

    params: dict[str, Any] = {}
    if config.get("temperature") is not None:
        params["temperature"] = float(config["temperature"])
    if config.get("max_tokens") is not None:
        params["max_tokens"] = config["max_tokens"]
    if config.get("top_p") is not None:
        params["top_p"] = float(config["top_p"])
    if config.get("top_k") is not None:
        params["top_k"] = config["top_k"]
    if config.get("repetition_penalty") is not None:
        params["repeat_penalty"] = float(config["repetition_penalty"])
    if config.get("seed") is not None:
        params["seed"] = config["seed"]
    if config.get("extra_config"):
        params.update(config["extra_config"])
    return params


def _resolve(slug: str, version: Optional[int]):
    agent = agent_crud.get_agent_by_slug(slug)
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    if not agent["is_active"]:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Agent is inactive")

    if version is not None:
        prompt = agent_crud.get_prompt_by_version(agent["id"], version)
        if prompt is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Prompt version {version} not found for this agent",
            )
    else:
        prompt = agent_crud.get_active_prompt(agent["id"])
        if prompt is None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Agent has no active prompt version")

    model = models_crud.get_model(agent["model_id"]) if agent["model_id"] else None
    config = agent_crud.get_config(agent["id"])
    return agent, prompt, model, config


def _record(
    agent: dict,
    prompt: dict,
    model_name: Optional[str],
    stream: bool,
    message: str,
    response_text: Optional[str],
    usage: dict,
    latency_ms: int,
    error: Optional[str] = None,
) -> None:
    """Write the history row and the log line for one call, success or not."""
    inference_crud.log_inference(
        agent, prompt, message, response_text,
        usage.get("prompt_tokens"), usage.get("completion_tokens"), usage.get("total_tokens"),
        latency_ms, "error" if error else "success", error,
    )
    head = "agent=%s v%d model=%s stream=%s in_chars=%d"
    args = (agent["slug"], prompt["version"], model_name or "-", stream, len(message))
    if error:
        log.error(head + " -> error after %dms: %s", *args, latency_ms, error)
    else:
        log.info(
            head + " -> success %dms tokens in=%s out=%s",
            *args, latency_ms, usage.get("prompt_tokens"), usage.get("completion_tokens"),
        )
    log.debug("agent=%s message=%s response=%s", agent["slug"], preview(message), preview(response_text))


async def _chat(slug: str, version: Optional[int], payload: AgentChatRequest):
    try:
        agent, prompt, model, config = _resolve(slug, version)
    except HTTPException as exc:
        # The usual reason a caller like AI-Service gets nothing back.
        log.warning("agent=%s version=%s rejected: %s", slug, version or "active", exc.detail)
        raise
    messages = [
        {"role": "system", "content": prompt["system_prompt"]},
        {"role": "user", "content": payload.message},
    ]
    gen_params = _build_gen_params(config)
    model_name = model["model_name"] if model else None

    if not payload.stream:
        start = time.perf_counter()
        try:
            result = await get_chat(messages, model_name=model_name, **gen_params)
        except httpx.HTTPError as exc:
            latency_ms = int((time.perf_counter() - start) * 1000)
            _record(agent, prompt, model_name, False, payload.message, None, {}, latency_ms, str(exc) or type(exc).__name__)
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"LLM server error: {exc}")

        latency_ms = int((time.perf_counter() - start) * 1000)
        usage = result.get("usage") or {}
        _record(agent, prompt, model_name, False, payload.message, result["content"], usage, latency_ms)
        return AgentChatResponse(
            agent=agent["slug"],
            prompt_version=prompt["version"],
            content=result["content"],
            input_tokens=usage.get("prompt_tokens"),
            output_tokens=usage.get("completion_tokens"),
            total_tokens=usage.get("total_tokens"),
            latency_ms=latency_ms,
        )

    async def generate():
        start = time.perf_counter()
        full_text: list[str] = []
        usage_info: dict = {}
        try:
            async for chunk in stream_chat(messages, model_name=model_name, **gen_params):
                if chunk["usage"]:
                    usage_info = chunk["usage"]
                if chunk["delta"]:
                    full_text.append(chunk["delta"])
                    yield f"event: token\ndata: {json.dumps({'content': chunk['delta']})}\n\n"
        except httpx.HTTPError as exc:
            latency_ms = int((time.perf_counter() - start) * 1000)
            _record(
                agent, prompt, model_name, True, payload.message, "".join(full_text) or None,
                {}, latency_ms, str(exc) or type(exc).__name__,
            )
            yield f"event: error\ndata: {json.dumps({'message': str(exc)})}\n\n"
            return

        latency_ms = int((time.perf_counter() - start) * 1000)
        _record(agent, prompt, model_name, True, payload.message, "".join(full_text), usage_info, latency_ms)
        yield f"event: done\ndata: {json.dumps({'latency_ms': latency_ms, **usage_info})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@router.post("/{slug}/chat")
async def chat_with_agent(slug: str, payload: AgentChatRequest):
    """Chat with an agent's currently active prompt version."""
    return await _chat(slug, None, payload)


@router.post("/{slug}/versions/{version}/chat")
async def chat_with_agent_version(slug: str, version: int, payload: AgentChatRequest):
    """Chat with a specific, pinned prompt version of an agent."""
    return await _chat(slug, version, payload)
