import asyncio
import json
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import StreamingResponse

from app.module.llm.client import get_chat_completion, stream_chat_completion
from app.utils.event_generator import event_generator

router = APIRouter(prefix="/sse", tags=["sse"])

@router.get("/stream")
async def stream(request: Request):
    return StreamingResponse(
        event_generator(request),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@router.get("/once")
async def once():
    """Demo non-streaming response: same shape as /stream, sent once."""
    return {"count": 1}


@router.get("/test-run-llm")
async def test_run_llm(request: Request, prompt: str, mode: Literal["stream", "answer"] = "stream"):
    """Run a prompt through the LLM.

    mode=stream (default): SSE, tokens arrive as they're generated.
    mode=answer: waits for the full response and returns it as plain JSON, no streaming.
    """

    if mode == "answer":
        try:
            content = await get_chat_completion(prompt)
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
        return {"content": content}

    async def generate():
        try:
            async for token in stream_chat_completion(prompt):
                if await request.is_disconnected():
                    break
                yield f"event: token\ndata: {json.dumps({'content': token})}\n\n"
        except httpx.HTTPError as exc:
            yield f"event: error\ndata: {json.dumps({'message': str(exc)})}\n\n"
            return

        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )
