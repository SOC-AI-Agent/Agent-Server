import logging
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.module.logs import setup_logging
from app.routers import agent_invoke, restful, sse

setup_logging()
log = logging.getLogger("dall_m.http")

app = FastAPI(title="DALL-M Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """One line per request, in place of uvicorn's access log (started with --no-access-log)."""
    start = time.perf_counter()
    path = request.url.path + (f"?{request.url.query}" if request.url.query else "")
    client = request.client.host if request.client else "-"
    try:
        response = await call_next(request)
    except Exception:
        ms = int((time.perf_counter() - start) * 1000)
        log.exception("%s %s -> unhandled error after %dms client=%s", request.method, path, ms, client)
        raise

    # For a streamed reply this is time to first byte; agent_invoke logs the full latency.
    ms = int((time.perf_counter() - start) * 1000)
    if request.url.path == "/":
        # AI-Service polls this every few seconds.
        level = logging.DEBUG
    elif response.status_code >= 500:
        level = logging.ERROR
    elif response.status_code >= 400:
        level = logging.WARNING
    else:
        level = logging.INFO
    user = getattr(request.state, "username", "-")
    log.log(level, "%s %s -> %d %dms user=%s client=%s", request.method, path, response.status_code, ms, user, client)
    return response


app.include_router(sse.router)
app.include_router(restful.auth_router)
app.include_router(restful.router)
app.include_router(agent_invoke.router)


@app.get("/")
def health():
    return {"status": "ok"}
