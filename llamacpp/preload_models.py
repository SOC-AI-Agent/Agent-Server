"""
Download the GGUF files llama-server will serve into its cache, then exit.

dall-m-model-preload runs this once, before dall-m-llamacpp, which starts with
--offline and reads only what is here. The download is huggingface_hub rather
than llama-server's own downloader because llama-server ignores HTTPS_PROXY,
and the production host reaches Hugging Face only through the office proxy.
Files land in the layout llama-server reads:
models--<org>--<repo>/snapshots/<commit>/<file>.

Which files, for "<org>/<repo>[:quant]" — the choice llama-server makes for
-hf: the .gguf whose name carries the quant (Q4_K_M when none is given), and
every shard of it when the model is split. No mmproj: dall-m-llamacpp runs
with --no-mmproj, the agents send text only.

Last, MODEL is written to served-model in the cache. dall-m-llamacpp reads
that file for its -hf, and insert_default_model.py registers whatever
llama-server reports serving, so nothing else names the model.
"""

import os
import re
import sys
from pathlib import Path

# ── The model ────────────────────────────────────────────────────────────────
# The one place it is chosen. "<org>/<repo>[:quant]" of a Hugging Face repo of
# .gguf files, e.g. "bartowski/Meta-Llama-3.1-8B-Instruct-GGUF:Q4_K_M" — not
# an Ollama name like "llama3.1:8b". Change it, deploy, and the preload image
# is rebuilt, the model downloaded, and dall-m-llamacpp restarted on it
# (depends_on ... restart: true in docker-compose.yml).
MODEL = "ggml-org/gemma-3-1b-it-GGUF"

# Downloaded as well but not served, same format: switching MODEL to one of
# these later is a restart rather than a multi-GB download.
ALSO_DOWNLOAD: list[str] = []

CACHE = Path(os.environ.get("LLAMA_CACHE", "/models"))
SERVED = CACHE / "served-model"
DEFAULT_QUANT = "Q4_K_M"
SHARD = re.compile(r"-(\d{5})-of-(\d{5})\.gguf$", re.IGNORECASE)


def parse(spec: str) -> tuple[str, str]:
    repo, _, quant = spec.strip().partition(":")
    return repo, quant or DEFAULT_QUANT


def carries(name: str, quant: str) -> bool:
    """The quant as a whole word: Q4_K_M, not the tail of IQ4_K_M."""
    pattern = rf"(?<![a-z0-9]){re.escape(quant)}(?![a-z0-9])"
    return re.search(pattern, Path(name).name, re.IGNORECASE) is not None


def is_model(name: str) -> bool:
    base = Path(name).name.lower()
    return base.endswith(".gguf") and not base.startswith("mmproj")


def complete(names: list[str]) -> bool:
    """A split model counts only with every shard present."""
    shards = [m for m in (SHARD.search(n) for n in names) if m]
    if not shards:
        return bool(names)
    return len({m.group(1) for m in shards}) >= int(shards[0].group(2))


def pick(repo: str, quant: str, files: list[str]) -> list[str]:
    chosen = sorted(f for f in files if is_model(f) and carries(f, quant))
    if not chosen:
        quants = sorted({Path(f).name for f in files if is_model(f)})
        raise SystemExit(f"preload: {repo} has no .gguf for quant {quant} — files: {', '.join(quants) or 'none'}")
    if not complete(chosen):
        raise SystemExit(f"preload: {repo}:{quant} lists only some of its shards: {', '.join(chosen)}")
    return chosen


def cached(repo: str, quant: str) -> list[str]:
    """What the cache already holds for this model, without a network call."""
    root = CACHE / f"models--{repo.replace('/', '--')}"
    ref = root / "refs" / "main"
    if not ref.is_file():
        return []
    snapshot = root / "snapshots" / ref.read_text().strip()
    # exists() follows the snapshot's symlink, so a link to a blob that never
    # finished downloading does not count.
    names = sorted(p.name for p in snapshot.glob("**/*.gguf")
                   if p.exists() and is_model(p.name) and carries(p.name, quant))
    return names if complete(names) else []


def main() -> int:
    if not MODEL.strip():
        print("preload: MODEL is empty — set it at the top of this file", file=sys.stderr)
        return 1
    models = list(dict.fromkeys(parse(s) for s in [MODEL, *ALSO_DOWNLOAD] if s.strip()))

    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    for repo, quant in models:
        have = cached(repo, quant)
        if have:
            print(f"preload: {repo}:{quant} already cached ({', '.join(have)}) — skipping")
            continue

        print(f"preload: {repo}:{quant} not cached, downloading "
              f"({'through the proxy' if proxy else 'direct, no proxy set'})...", flush=True)
        try:
            from huggingface_hub import HfApi, hf_hub_download

            files = HfApi().list_repo_files(repo)
            for name in pick(repo, quant, files):
                hf_hub_download(repo, name, cache_dir=str(CACHE))
                print(f"preload:   {name}", flush=True)
        except SystemExit:
            raise
        except Exception as exc:  # network, proxy, auth, a repo that does not exist
            print(f"preload: {repo}:{quant} FAILED — {type(exc).__name__}: {exc}", file=sys.stderr)
            return 1
        print(f"preload: {repo}:{quant} done")

    # As written, quant or not: llama-server reports serving exactly this, and
    # that is the name insert_default_model.py registers. Replaced in one step,
    # so dall-m-llamacpp never reads half a name.
    tmp = SERVED.with_name(SERVED.name + ".tmp")
    tmp.write_text(MODEL.strip() + "\n")
    tmp.replace(SERVED)
    print(f"preload: all models ready — serving {MODEL.strip()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
