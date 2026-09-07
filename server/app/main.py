from fastapi import FastAPI

from app.routers import restful, sse

app = FastAPI(title="DALL-M Server")

app.include_router(sse.router)
app.include_router(restful.router)


@app.get("/")
def health():
    return {"status": "ok"}
