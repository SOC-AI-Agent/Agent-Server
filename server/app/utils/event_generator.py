import asyncio
import json

from fastapi import Request


async def event_generator(request: Request):
    """Demo SSE stream: emits an incrementing counter every second."""
    count = 0
    while True:
        if await request.is_disconnected():
            break

        count += 1
        payload = json.dumps({"count": count})
        yield f"event: tick\ndata: {payload}\n\n"

        await asyncio.sleep(1)