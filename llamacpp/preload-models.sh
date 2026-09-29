#!/usr/bin/env bash
#
# Downloads every model in MODELS into the shared /models volume (LLAMA_CACHE)
# if it is not there yet, then exits. It never serves anything itself — that is
# still dall-m-llamacpp's job, and it still serves only whichever ONE model
# LLAMA_HF_MODEL names. This exists so:
#
#   - switching LLAMA_HF_MODEL to one of these and recreating dall-m-llamacpp
#     (docker compose up -d --force-recreate dall-m-llamacpp) is instant instead
#     of a multi-GB download landing on whoever asks the agent right after;
#   - a second llama.cpp instance added later, to serve a second model at the
#     same time as the first (see docker-compose.yml's note by dall-m-llamacpp),
#     starts from an already-warm shared cache instead of downloading again.
#
# Idempotent by design, not by re-running the download and hoping it no-ops:
# each entry names the exact file llama-server's own downloader writes for that
# repo:quant, checked with `find` (not a fixed path) because LLAMA_CACHE's
# internal layout is llama-server's to change. A model already on disk costs
# one `find` and nothing else — no network call, no process started.
set -euo pipefail

# "<hf-repo>:<quant>|<filename llama-server writes for it, checked once by hand
# against the repo's file listing>". Add a line here to preload another model;
# nothing else in this script or docker-compose.yml needs to change. A repo that
# ships as several shards (…-00001-of-000NN.gguf) is checked by its first shard —
# llama-server fetches every shard before it starts listening, so a completed
# earlier run always leaves the first one behind too.
MODELS=(
  # "ggml-org/gemma-3-12b-it-GGUF:Q4_K_M|gemma-3-12b-it-Q4_K_M.gguf"
  # "Qwen/Qwen2.5-14B-Instruct-GGUF:Q4_K_M|qwen2.5-14b-instruct-q4_k_m-00001-of-00003.gguf"
  # "Qwen/Qwen2.5-7B-Instruct-GGUF:Q4_K_M|qwen2.5-7b-instruct-q4_k_m-00001-of-00002.gguf"
  "ggml-org/gemma-3-1b-it-GGUF|gemma-3-1b-it-Q4_K_M.gguf"
)

# Not published anywhere, not even on dall-m-net — this script is the only thing
# that ever talks to it, to trigger a download and notice when it is done.
PORT=18081
# Overridable for a test with a fake llama-server against a scratch directory.
MODELS_DIR="${MODELS_DIR:-/models}"
# Bounds time with NO progress, not total time — a 9GB model on a slow-but-
# moving link can legitimately take longer than this to finish; a process that
# is still alive but has written nothing new to disk in this long is exactly
# what should fail the pipeline rather than hang the runner or the first boot.
# Override for a link that's slow enough to sit silent this long between
# writes, or in a test with a fake llama-server.
MAX_WAIT_SECONDS="${PRELOAD_MAX_WAIT_SECONDS:-1200}"

already_cached() {
  find "$MODELS_DIR" -iname "$1" 2>/dev/null | grep -q .
}

# KB on disk under MODELS_DIR — polled to tell a download that is merely slow
# from one that has actually stopped moving. du, not find -printf: BusyBox's
# find (this image may or may not be GNU) doesn't reliably support -printf.
dir_size_kb() {
  du -sk "$MODELS_DIR" 2>/dev/null | cut -f1
}

for entry in "${MODELS[@]}"; do
  repo="${entry%%|*}"
  marker="${entry##*|}"

  if already_cached "$marker"; then
    echo "preload: $repo already cached ($marker found under $MODELS_DIR) — skipping"
    continue
  fi

  echo "preload: $repo not cached yet, downloading..."
  /app/llama-server -hf "$repo" --host 127.0.0.1 --port "$PORT" --n-gpu-layers 0 &
  pid=$!

  waited=0
  stalled=0
  ready=0
  last_size="$(dir_size_kb)"
  while [ "$stalled" -lt "$MAX_WAIT_SECONDS" ]; do
    if ! kill -0 "$pid" 2>/dev/null; then
      # Exited on its own — a bad repo name, a network error, anything — before
      # ever opening the port. Waiting out the rest of the timeout for a process
      # that is already gone would only make the failure slower to report.
      break
    fi
    # The model is fully downloaded and loaded by the time llama-server binds
    # its port, so a successful connection here is also the download-done
    # signal — with no dependency on curl or wget being in this image.
    if (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; then
      exec 3>&- 3<&-
      ready=1
      break
    fi
    sleep 5
    waited=$((waited + 5))
    size="$(dir_size_kb)"
    if [ "$size" != "$last_size" ]; then
      stalled=0
      last_size="$size"
    else
      stalled=$((stalled + 5))
    fi
  done

  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true

  if [ "$ready" != 1 ] || ! already_cached "$marker"; then
    echo "preload: $repo — FAILED (no disk-usage progress for ${stalled}s, ${waited}s total; expected $marker under $MODELS_DIR)" >&2
    exit 1
  fi
  echo "preload: $repo done"
done

echo "preload: all models ready"
