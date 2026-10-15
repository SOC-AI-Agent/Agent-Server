# DALL-M

DALL-M is an internal platform for defining, versioning, and serving LLM-backed **agents**.
Each agent has its own system prompt (with full version history), generation
parameters (temperature, top-p, max tokens, ...), and a default model. Every
call to an agent is logged — prompt, response, token usage, latency, and
status — for auditing and debugging. A Next.js admin UI sits on top for
managing users, models, agents, and reviewing call history.

```
Browser ── Next.js frontend ──► FastAPI server ──► llama.cpp (LLM inference)
 :7100         :7100                :8000                :8080
                                      │
                                      ▼
                                 PostgreSQL
                                   :5497
```

## Tech stack

| Layer      | Technology                                                   |
| ---------- | -------------------------------------------------------------- |
| Frontend   | Next.js 16 (Pages Router), React 19, TypeScript, Tailwind CSS 4 |
| Backend    | FastAPI (Python 3.12), JWT auth, Server-Sent Events for streaming |
| Database   | PostgreSQL 18                                                   |
| Inference  | [llama.cpp server](https://github.com/ggml-org/llama.cpp/blob/master/docs/docker.md) (OpenAI-compatible API + built-in chat WebUI) |
| Orchestration | Docker Compose                                               |

## Project structure

```
DALL-M/
├── docker-compose.yml       # db + server + frontend + llama.cpp, one network
├── .env.example             # copy to .env — see "Configuration" below
├── data/                    # bind-mounted volumes: Postgres data, downloaded .gguf models
├── script/                  # one-time DB bootstrap scripts, run from the host
│   ├── create_db.py           # creates the schema (see readme.database.md)
│   ├── add_admin_user.py      # creates/updates the admin user
│   └── insert_default_model.py# registers the default llama.cpp model in llm_models
├── server/                  # FastAPI backend — see server/readme.server.md
│   └── app/
│       ├── main.py
│       ├── routers/           # restful.py (CRUD + auth), agent_invoke.py (public chat API), sse.py
│       └── module/             # agent, auth, database, inference, llm, models, users
└── frontend/                 # Next.js admin UI — see frontend/README.md
    └── src/
        ├── pages/              # login, agents, users, history
        ├── comps/               # shared components (layout, forms, agent test chat, ...)
        └── utils/                # API clients, auth token storage
```

Schema reference: [`readme.database.md`](readme.database.md).

## Prerequisites

- Docker Engine + Docker Compose v2
- Python 3.9+ with `pip` — only for the one-time database bootstrap scripts in `script/` (the app itself runs entirely in containers)

## Quick start

### 1. Clone and configure

```bash
git clone <repo-url>
cd DALL-M
cp .env.example .env
```

The defaults in `.env.example` work out of the box for local development —
no edits required to get running. See [Configuration](#configuration) below
if you need to change anything (ports, model, secrets).

### 2. Start the stack

```bash
docker compose up -d
```

This builds and starts all four services: PostgreSQL, the FastAPI server, the
Next.js frontend, and llama.cpp (which auto-downloads its default model on
first start — this can take a few minutes depending on your connection; see
[LLM inference](#llm-inference-llamacpp)).

| Service      | URL                                              |
| ------------ | ------------------------------------------------- |
| Frontend     | http://localhost:7100                             |
| API          | http://localhost:8001 (interactive docs at `/docs`) |
| llama.cpp WebUI / API | http://localhost:8080                    |
| PostgreSQL   | localhost:5497                                    |

### 3. Bootstrap the database

The schema and seed data are created by one-time Python scripts run from the
host (not part of the container startup):

```bash
pip install -r script/requirements.txt

python script/create_db.py            # creates all tables
python script/insert_default_model.py # registers the default llama.cpp model
python script/add_admin_user.py       # creates the admin user
```

`add_admin_user.py` defaults to username `admin`, email `admin@example.com`,
password `admin123`. Override with flags:

```bash
python script/add_admin_user.py --username admin --email admin@example.com --password mypassword
```

> **Note:** passwords are currently stored as plain text (no hashing yet) —
> this is a known limitation, not an oversight. Don't reuse a real password
> for the admin account.

### 4. Log in

Open http://localhost:7100 and sign in with the admin credentials from step
3. From there you can register a model, create an agent, add a system
prompt, and test it directly from the agent's "ทดสอบ Agent" tab.

## Configuration

All configuration lives in two env files, both covered by committed
`.env.example` templates:

**Root `.env`** (read by `docker-compose.yml` and by the scripts in `script/`
via `python-dotenv`):

| Variable                | Default                          | Used by                        |
| ------------------------ | --------------------------------- | -------------------------------- |
| `DB_HOST` / `DB_PORT`    | `localhost` / `5497`               | host-side scripts only (the server container connects to `dall-m-db:5432` internally) |
| `DB_USER` / `DB_PASSWORD` / `DB_NAME` | `dall-m-db` / `password123` / `dall-m-db` | Postgres container + server + scripts |
| `JWT_SECRET`             | `dev-secret-change-me`            | server — signs auth tokens; **change before any non-local deployment** |
| `JWT_EXPIRE_MINUTES`     | `1440`                            | server — session length |
| `NEXT_PUBLIC_BASE_URL` / `NEXT_PUBLIC_BASE_PATH` / `NEXT_PUBLIC_LLM_BASE_URL` | `http://localhost:8001` / `/restful` / `http://localhost:8080` | frontend container (browser-facing, see below) |

**`frontend/.env.local`** (only needed if you run the frontend standalone
with `npm run dev` instead of via `docker compose` — see
[Running the frontend outside Docker](#running-the-frontend-outside-docker)):
copy `frontend/.env.example` and adjust the same `NEXT_PUBLIC_*` variables.

> `NEXT_PUBLIC_*` variables are baked into client-side JavaScript and fetched
> by the *browser*, not by the frontend container. They must point at URLs
> reachable from wherever you open the app — the defaults assume you're
> browsing from the same machine Docker runs on. If you deploy Docker on a
> remote host, change these to that host's address before building.

## Common operations

```bash
# View logs
docker compose logs -f dall-m-server
docker compose logs -f dall-m-frontend

# Stop everything (data in ./data and the Postgres volume is preserved)
docker compose down

# Rebuild a single service after pulling changes
docker compose up -d --build dall-m-server
```

**Frontend hot reload:** the `dall-m-frontend` container runs `next dev` with
the `frontend/` folder bind-mounted in, so editing files on the host
hot-reloads inside the container automatically — no rebuild needed. The mount
is in `docker-compose.override.yml`, which `docker compose` loads by itself;
the deploy job leaves it out and runs the code built into the image.

**Backend hot reload:** the `dall-m-server` container runs a plain
`uvicorn app.main:app` (no `--reload`, no bind mount) — after changing
backend code you must rebuild it for the change to take effect:

```bash
docker compose up -d --build dall-m-server
```

### Running the frontend outside Docker

```bash
cd frontend
cp .env.example .env.local   # only if you haven't already
npm install
npm run dev   # http://localhost:7100
```

Stop the equivalent `dall-m-frontend` container first if it's already
running, since both bind to port 7100.

## LLM inference (llama.cpp)

The `dall-m-llamacpp` service runs the official
[llama.cpp server image](https://github.com/ggml-org/llama.cpp/blob/master/docs/docker.md)
(`ghcr.io/ggml-org/llama.cpp:server`), which exposes an OpenAI-compatible API
(`POST http://localhost:8080/v1/chat/completions`) and a built-in chat WebUI
— no separate WebUI container needed.

**Model weights** are downloaded from Hugging Face by `dall-m-model-preload`
before `dall-m-llamacpp` starts, and cached under
`./data/models` on the host (mounted to `/models`), so they persist across
restarts and aren't re-downloaded. `dall-m-llamacpp` itself runs `--offline`:
it serves only what is in that cache and never downloads. The download is
Python's `huggingface_hub` rather than llama-server's own downloader because
llama-server ignores `HTTPS_PROXY`, and the production host reaches Hugging
Face only through the office proxy (the deploy job exports it; on a laptop it
is empty and the download goes direct). It runs with `--no-mmproj`: the
agents send text only.

**Which model** is set in one place: `MODEL` at the top of
[`llamacpp/preload_models.py`](llamacpp/preload_models.py) — not `.env`, not
`.gitlab-ci.yml`. Format `<hf-user>/<hf-repo>[:quant]` (quant defaults to
`Q4_K_M` if omitted), e.g.:

```python
MODEL = "bartowski/Meta-Llama-3.1-8B-Instruct-GGUF:Q4_K_M"
```

Then rebuild and re-run the seed script so `llm_models` lists it (in
production the deploy job does both):

```bash
docker compose up -d --build
python script/insert_default_model.py
```

The preload image is rebuilt with the new `MODEL`, downloads it, and writes
its name to `./data/models/served-model`; `dall-m-llamacpp` reads that file
for its `-hf` and is restarted after the preload (`depends_on` with
`restart: true`). `insert_default_model.py` asks llama-server what it serves
(`GET /v1/models`), so it needs no name either. Agents that point at the old
model keep working — llama-server answers with the model it has whatever a
request names — but edit them in the admin UI to pick the new one, or their
history keeps the old name.

### Preloading models

`dall-m-model-preload` runs once per `docker compose up`, before
`dall-m-llamacpp`, and downloads `MODEL` into `./data/models`, skipping it when
it is already there — a rerun with nothing missing makes no network call.
For each model it takes the `.gguf` whose name carries the quant (`Q4_K_M`
when none is given) and every shard of it, the same file `-hf` would pick.

`ALSO_DOWNLOAD` (same file, same `<repo>[:quant]` format) lists models fetched
ahead of time, so switching `MODEL` to one is a restart instead of a multi-GB
download. Only the production host fetches them: `dall-m-model-extra` is in the
compose profile `production`, which the deploy job starts last and leaves
running in the background, and a plain `docker compose up` never starts. It
skips a model the disk has no room for (keeping 5 GB free), counting only what
is not on disk yet — an interrupted download resumes — and says how much is
short. Before downloading it deletes from the cache every model neither
`MODEL` nor `ALSO_DOWNLOAD` names (nor the one llama-server is serving), so
taking a model off the list frees its space on the next deploy; to keep an old
`MODEL` around after a change, list it in `ALSO_DOWNLOAD`. The deploy log's
step 6 shows that run's output and, when a model was skipped for space,
`docker system df`. Today the list is gemma-3-12b (~7.3 GB); `MODEL` itself is
Qwen2.5-7B (~4.7 GB), which the first deploy downloads before llama-server
starts — about half an hour through the office proxy, progress in the log.
What the host has and where the cache's disk space goes: the `inspect_host`
job.

If a download fails (no route to Hugging Face, a proxy that refuses, a quant
the repo does not have) the preload exits with the reason and
`dall-m-llamacpp` does not start. It only ever serves one model at a time
(`dall-m-server`'s `LLM_BASE_URL` points at one fixed `host:port`); the
comment beside `dall-m-llamacpp` in `docker-compose.yml` says what serving a
second one concurrently would additionally need.

## Database

Connection settings come from `.env` (see [Configuration](#configuration)
above). Full schema documentation — tables, relationships, and design notes
— is in [`readme.database.md`](readme.database.md); the schema itself is
defined in [`script/create_db.py`](script/create_db.py) (reference ERD at
[`script/draw-erd.txt`](script/draw-erd.txt)).

## API overview

Interactive docs (Swagger UI) are always available at
http://localhost:8001/docs. At a glance:

| Prefix                        | Purpose                                                          |
| -------------------------------- | -------------------------------------------------------------- |
| `POST /restful/auth/login`       | Authenticate, returns a JWT                                     |
| `/restful/users`, `/restful/models`, `/restful/agents`, `/restful/agents/{id}/prompts`, `/restful/agents/{id}/config` | Admin CRUD (requires `Authorization: Bearer <token>`) |
| `GET /restful/inference-requests`| Call history — admins see every agent's requests, other users see only their own agents' |
| `POST /v1/agents/{slug}/chat`, `POST /v1/agents/{slug}/versions/{version}/chat` | Public agent invocation (no auth yet — see below); supports SSE streaming or a single JSON response |
| `GET /sse/stream`                | Example SSE endpoint |

> The public `/v1/agents/...` invocation endpoints have no authentication or
> rate limiting yet — anyone who can reach port 8000 can call any active
> agent. This is a known gap (an `api_client_id` column already exists on
> `inference_requests`, reserved for a future API-key system), not an
> intentional design choice — don't expose port 8000 outside a trusted
> network as-is.

## Used by the SOC stack

AI-Service (`soc-ai`) calls `POST /v1/agents/{slug}/chat` here for every
alert, by URL rather than over a shared Docker network. How that is wired in
production — the URL, which agents must exist, how to check the connection
after a deploy, and which of this stack's ports to close — is in
[AI-Service's README → In production](../AI-Service/README.md#in-production).

## Known limitations

- User passwords are stored in plain text (no hashing).
- The public agent-invocation API has no authentication, rate limiting, or per-client attribution.
- CORS is wide open (`allow_origins=["*"]`) — fine for local development, not for a public deployment.
