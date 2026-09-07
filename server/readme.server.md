# DALL-M Server

FastAPI server with a Server-Sent Events (SSE) endpoint. Minimal skeleton for now — more routes/logic will be added incrementally.

## Structure

```
server/
  app/
    main.py                    # FastAPI app entrypoint
    routers/
      sse.py                    # SSE routes (GET /sse/stream)
    utils/
      event_generator.py        # SSE event generator
  requirements.txt
  Dockerfile
```

## Run locally

```bash
cd server
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Run with Docker

From the project root (uses the `dall-m-server` service in `docker-compose.yml`):

```bash
docker compose up -d --build dall-m-server
```

This builds the image from `server/Dockerfile` and starts it on the same
`dall-m-net` network as `dall-m-db`, so the server can reach the database at
host `dall-m-db`, port `5432`. The API is exposed on the host at
`http://localhost:8000`.

To run the whole stack (db + server):

```bash
docker compose up -d --build
```

## Usage

- Health check: `GET http://localhost:8000/`
- SSE stream: `GET http://localhost:8000/sse/stream`
- Non-streaming response: `GET http://localhost:8000/sse/once`

Test the SSE stream with curl:

```bash
curl -N http://localhost:8000/sse/stream
```

You should see a `tick` event with an incrementing counter every second:

```d
event: tick
data: {"count": 1}

event: tick
data: {"count": 2}
```

Test the plain (non-streaming) response:

```bash
curl http://localhost:8000/sse/once
```

Returns a single JSON response immediately, no streaming:

```json
{"count": 1}
```

Interactive API docs: `http://localhost:8000/docs`
