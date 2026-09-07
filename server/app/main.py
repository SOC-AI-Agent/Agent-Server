from fastapi import FastAPI

from app.routers import sse

app = FastAPI(title="DALL-M Server")

app.include_router(sse.router)


@app.get("/")
def health():
    return {"status": "ok"}
