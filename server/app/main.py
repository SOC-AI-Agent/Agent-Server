from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import agent_invoke, restful, sse

app = FastAPI(title="DALL-M Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sse.router)
app.include_router(restful.auth_router)
app.include_router(restful.router)
app.include_router(agent_invoke.router)


@app.get("/")
def health():
    return {"status": "ok"}
