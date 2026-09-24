import json
import os
from typing import Any, AsyncGenerator, Optional

import httpx

# In docker-compose, dall-m-server reaches the llama.cpp service by its
# container name; for local (non-docker) runs it falls back to localhost.
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://localhost:8080")
LLM_MODEL = os.getenv("LLAMA_HF_MODEL", "ggml-org/gemma-3-1b-it-GGUF")


async def stream_chat(
    messages: list[dict],
    model_name: Optional[str] = None,
    **gen_params: Any,
) -> AsyncGenerator[dict, None]:
    """Stream a chat completion. Yields {"delta": str | None, "usage": dict | None} per SSE chunk
    (llama.cpp/OpenAI servers send the usage totals on the final chunk when supported)."""
    payload = {
        "model": model_name or LLM_MODEL,
        "messages": messages,
        "stream": True,
        "stream_options": {"include_usage": True},
        **gen_params,
    }

    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream("POST", f"{LLM_BASE_URL}/v1/chat/completions", json=payload) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line or not line.startswith("data: "):
                    continue

                data = line[len("data: "):]
                if data == "[DONE]":
                    break

                chunk = json.loads(data)
                choices = chunk.get("choices") or []
                delta = choices[0]["delta"].get("content") if choices else None
                yield {"delta": delta, "usage": chunk.get("usage")}


async def get_chat(
    messages: list[dict],
    model_name: Optional[str] = None,
    **gen_params: Any,
) -> dict:
    """Non-streaming chat completion. Returns {"content": str, "usage": dict | None}."""
    payload = {
        "model": model_name or LLM_MODEL,
        "messages": messages,
        "stream": False,
        **gen_params,
    }

    async with httpx.AsyncClient(timeout=None) as client:
        response = await client.post(f"{LLM_BASE_URL}/v1/chat/completions", json=payload)
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
