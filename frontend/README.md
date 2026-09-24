# DALL-M Frontend

Next.js 16 (Pages Router) admin UI for managing agents, prompts, users,
models, and reviewing call history. See the [project root readme](../readme.md)
for the full setup (this app is one of four services in `docker-compose.yml`).

## Run with Docker (recommended)

From the project root:

```bash
docker compose up -d dall-m-frontend
```

Runs on [http://localhost:7100](http://localhost:7100), with the `frontend/`
folder bind-mounted in for hot reload — no separate `npm run dev` needed.

## Run standalone

```bash
cp .env.example .env.local   # only if you haven't already
npm install
npm run dev   # http://localhost:7100
```

Requires the API (`dall-m-server`, port 8000) to be reachable — start it via
`docker compose up -d dall-m-server` first, or point `NEXT_PUBLIC_BASE_URL`
in `.env.local` at wherever it's running.

## Structure

```
src/
├── pages/       # login, agents (list/detail/new), users, history
├── comps/        # shared components: layout, forms, agent test chat, ...
└── utils/         # API clients (utils/api/), auth token storage
```
