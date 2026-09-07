import json
import os
from typing import AsyncGenerator

import httpx

# In docker-compose, dall-m-server reaches the llama.cpp service by its
# container name; for local (non-docker) runs it falls back to localhost.
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://localhost:8080")
LLM_MODEL = os.getenv("LLAMA_HF_MODEL", "ggml-org/gemma-3-1b-it-GGUF")


async def stream_chat_completion(prompt: str) -> AsyncGenerator[str, None]:
    """Send a single user prompt to the LLM server and yield response text as it streams in."""
    payload = {
        "model": LLM_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "stream": True,
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
                delta = chunk["choices"][0]["delta"].get("content")
                if delta:
                    yield delta


async def get_chat_completion(prompt: str) -> str:
    """Send a single user prompt to the LLM server and return the full answer at once."""
    payload = {
        "model": LLM_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
    }

    async with httpx.AsyncClient(timeout=None) as client:
        response = await client.post(f"{LLM_BASE_URL}/v1/chat/completions", json=payload)
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]
