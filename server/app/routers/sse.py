import asyncio
import json

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

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
