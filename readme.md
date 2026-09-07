# DALL-M

## Prerequisites

- Docker / Docker Compose
- Python 3.9+

## Setup

1. Start the PostgreSQL database:

   ```bash
   docker compose up -d
   ```

2. Install Python dependencies:

   ```bash
   pip install -r script/requirements.txt
   ```

3. Create the database schema (tables from `script/draw-erd.txt`):

   ```bash
   python script/create_db.py
   ```

4. Create the admin user (password is stored as plain text, no hashing):

   ```bash
   python script/add_admin_user.py
   ```

   Defaults: username `admin`, email `admin@example.com`, password `admin123`.
   Override with flags:

   ```bash
   python script/add_admin_user.py --username admin --email admin@example.com --password mypassword
   ```

## llama.cpp (LLM inference + WebUI)

The `dall-m-llamacpp` service runs the official [llama.cpp server image](https://github.com/ggml-org/llama.cpp/blob/master/docs/docker.md) (`ghcr.io/ggml-org/llama.cpp:server`). `llama-server` ships with a built-in chat WebUI, so no separate WebUI container is needed. It is defined in `docker-compose.yml` but is not called by any other service yet — it's just available to use.

### Run it

```bash
docker compose up -d dall-m-llamacpp
```

Open the WebUI at [http://localhost:8080](http://localhost:8080).

### Model weights

By default the container auto-downloads a small model (`ggml-org/gemma-3-1b-it-GGUF`) from Hugging Face on first start, via the `-hf` flag. Downloaded `.gguf` files are cached in `./data/models` on the host (mounted to `/models`, `LLAMA_CACHE=/models`), so they persist across restarts and aren't re-downloaded.

To use a different model, set `LLAMA_HF_MODEL` in `.env` before starting the container, e.g.:

```
LLAMA_HF_MODEL=bartowski/Meta-Llama-3.1-8B-Instruct-GGUF:Q4_K_M
```

Format is `<hf-user>/<hf-repo>[:quant]` (quant defaults to `Q4_K_M` if omitted). Then:

```bash
docker compose up -d --force-recreate dall-m-llamacpp
```

Alternatively, drop a `.gguf` file you already have directly into `./data/models` and point `LLAMA_HF_MODEL`'s command at it by editing the `command:` in `docker-compose.yml` to use `-m /models/<your-file>.gguf` instead of `-hf`.

### API

`llama-server` also exposes an OpenAI-compatible API (e.g. `POST http://localhost:8080/v1/chat/completions`), which the `server/` FastAPI app can call once it's wired up.

## Database connection

Connection settings come from `.env` (used by both `docker-compose.yml` and the scripts):

| Variable      | Value               |
| ------------- | ------------------- |
| `DB_HOST`     | localhost            |
| `DB_PORT`     | 5497                 |
| `DB_USER`     | dall-m-db            |
| `DB_PASSWORD` | password123          |
| `DB_NAME`     | dall-m-db            |
