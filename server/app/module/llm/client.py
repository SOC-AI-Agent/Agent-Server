import json
import os
from typing import Any, AsyncGenerator, Optional

import httpx

# In docker-compose, dall-m-server reaches the llama.cpp service by its
# container name; for external OpenAI-compatible APIs set LLM_BASE_URL + LLM_API_KEY.
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://localhost:8080").rstrip("/")
LLM_API_KEY = os.getenv("LLM_API_KEY", "").strip()


def endpoint_url(path: str) -> str:
    """Resolve /v1/... against either a root host URL (http://host:8080) or a
    versioned base URL (https://api.openai.com/v1, .../v1beta/openai)."""
    clean = path.lstrip("/")
    if clean.startswith("v1/") and (LLM_BASE_URL.endswith("/v1") or LLM_BASE_URL.endswith("/openai")):
        clean = clean[len("v1/"):]
    return f"{LLM_BASE_URL}/{clean}"


def auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {LLM_API_KEY}"} if LLM_API_KEY else {}


def _clean_params(gen_params: dict[str, Any]) -> dict[str, Any]:
    if not LLM_API_KEY:
        return gen_params
    # External OpenAI-compatible APIs reject llama.cpp-specific fields.
    return {k: v for k, v in gen_params.items() if k not in ("top_k", "repeat_penalty")}


def _model(model_name: Optional[str]) -> dict:
    """The agent's model, if it has one. llama-server serves one model and
    answers with it whatever is named here, so without one the field is left
    out rather than filled with a guess — which model that is is set in
    llamacpp/preload_models.py only."""
    return {"model": model_name} if model_name else {}


async def stream_chat(
    messages: list[dict],
    model_name: Optional[str] = None,
    **gen_params: Any,
) -> AsyncGenerator[dict, None]:
    """Stream a chat completion. Yields {"delta": str | None, "usage": dict | None} per SSE chunk
    (llama.cpp/OpenAI servers send the usage totals on the final chunk when supported)."""
    payload = {
        **_model(model_name),
        "messages": messages,
        "stream": True,
        "stream_options": {"include_usage": True},
        **_clean_params(gen_params),
    }

    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream(
            "POST",
            endpoint_url("v1/chat/completions"),
            json=payload,
            headers=auth_headers(),
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line or not line.startswith("data: "):
                    continue

                data = line[len("data: "):]
                if data == "[DONE]":
                    break

                chunk = json.loads(data)
                choices = chunk.get("choices") or []
                delta = (choices[0].get("delta") or {}).get("content") if choices else None
                yield {"delta": delta, "usage": chunk.get("usage")}


async def get_chat(
    messages: list[dict],
    model_name: Optional[str] = None,
    **gen_params: Any,
) -> dict:
    """Non-streaming chat completion. Returns {"content": str, "usage": dict | None}."""
    payload = {
        **_model(model_name),
        "messages": messages,
        "stream": False,
        **_clean_params(gen_params),
    }

    async with httpx.AsyncClient(timeout=None) as client:
        response = await client.post(
            endpoint_url("v1/chat/completions"),
            json=payload,
            headers=auth_headers(),
        )
        response.raise_for_status()
        data = response.json()
        return {"content": data["choices"][0]["message"]["content"], "usage": data.get("usage")}


async def stream_chat_completion(prompt: str) -> AsyncGenerator[str, None]:
    """Send a single user prompt to the LLM server and yield response text as it streams in."""
    async for chunk in stream_chat([{"role": "user", "content": prompt}]):
        if chunk["delta"]:
            yield chunk["delta"]


async def get_chat_completion(prompt: str) -> str:
    """Send a single user prompt to the LLM server and return the full answer at once."""
    result = await get_chat([{"role": "user", "content": prompt}])
    return result["content"]
