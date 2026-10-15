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

Two runs of it:

  (no argument)  dall-m-model-preload, on every `docker compose up`: MODEL only,
                 then its name to served-model in the cache. dall-m-llamacpp
                 reads that file for its -hf, and insert_default_model.py
                 registers whatever llama-server reports serving, so nothing
                 else names the model. Kept to the one model on purpose:
                 dall-m-llamacpp waits for this to finish, and a list of large
                 models here once kept the whole stack down for the length of
                 a download.
  --also         dall-m-model-extra, production only (compose profile
                 "production", which the deploy job starts last, in the
                 background): the models in ALSO_DOWNLOAD, each only if the
                 disk has room for it. Nothing waits on it. A laptop never runs
                 it, so these never land on one.
"""

import os
import re
import shutil
import sys
from pathlib import Path

# ── The model ────────────────────────────────────────────────────────────────
# The one place it is chosen. "<org>/<repo>[:quant]" of a Hugging Face repo of
# .gguf files — not an Ollama name like "llama3.1:8b". Change it, deploy, and
# the preload image is rebuilt, the model downloaded, and dall-m-llamacpp
# restarted on it (depends_on ... restart: true in docker-compose.yml).
# llama-server cannot start until it is on disk: the first deploy after a
# change downloads it first (Qwen2.5-7B, ~4.7 GB in 2 shards: about half an
# hour through the office proxy), and prints its progress while it does.
MODEL = "Qwen/Qwen2.5-7B-Instruct-GGUF:Q4_K_M"

# Downloaded as well but not served, same format, on the production host only
# (see --also above): switching MODEL to one of these later is a restart rather
# than a multi-GB download. Sizes are Q4_K_M, roughly.
ALSO_DOWNLOAD: list[str] = [
    "ggml-org/gemma-3-12b-it-GGUF:Q4_K_M",    # ~7.3 GB
    "Qwen/Qwen2.5-14B-Instruct-GGUF:Q4_K_M",  # ~9 GB, 3 shards
]

CACHE = Path(os.environ.get("LLAMA_CACHE", "/models"))
SERVED = CACHE / "served-model"
DEFAULT_QUANT = "Q4_K_M"
# Left free on the disk after a download in --also mode, for everything else on
# the host.
DISK_MARGIN = 5 * 1024**3
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


def gb(n: int) -> str:
    return f"{n / 1024**3:.1f} GB"


def fetch(repo: str, quant: str, check_disk: bool) -> bool:
    """Put repo:quant in the cache unless it is there already. True when it is
    there afterwards; otherwise the reason is printed."""
    have = cached(repo, quant)
    if have:
        print(f"preload: {repo}:{quant} already cached ({', '.join(have)}) — skipping")
        return True

    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    print(f"preload: {repo}:{quant} not cached, downloading "
          f"({'through the proxy' if proxy else 'direct, no proxy set'})...", flush=True)
    try:
        from huggingface_hub import HfApi, hf_hub_download

        info = HfApi().model_info(repo, files_metadata=True)
        sizes = {f.rfilename: f.size or 0 for f in info.siblings or []}
        names = pick(repo, quant, list(sizes))
        if check_disk:
            need, free = sum(sizes[n] for n in names), shutil.disk_usage(CACHE).free
            if need + DISK_MARGIN > free:
                print(f"preload: {repo}:{quant} SKIPPED — needs {gb(need)} and {gb(DISK_MARGIN)} "
                      f"left over, {gb(free)} free under {CACHE}", file=sys.stderr)
                return False
        for name in names:
            # An interrupted download resumes from what is already on disk.
            hf_hub_download(repo, name, cache_dir=str(CACHE))
            print(f"preload:   {name}", flush=True)
    except SystemExit as exc:  # pick(): no such quant, or shards missing
        print(exc, file=sys.stderr)
        return False
    except Exception as exc:  # network, proxy, auth, a repo that does not exist
        print(f"preload: {repo}:{quant} FAILED — {type(exc).__name__}: {exc}", file=sys.stderr)
        return False
    print(f"preload: {repo}:{quant} done")
    return True


def also() -> int:
    served = parse(MODEL)
    specs = list(dict.fromkeys(parse(s) for s in ALSO_DOWNLOAD if s.strip() and parse(s) != served))
    if not specs:
        print("preload --also: ALSO_DOWNLOAD is empty — nothing to download")
        return 0
    print(f"preload --also: {len(specs)} model(s); {gb(shutil.disk_usage(CACHE).free)} free under {CACHE}")
    # Every one is tried, whatever happened to the one before.
    results = [fetch(repo, quant, check_disk=True) for repo, quant in specs]
    if all(results):
        print("preload --also: all downloaded")
        return 0
    print("preload --also: not all downloaded — see above; the next deploy tries again", file=sys.stderr)
    return 1


def main() -> int:
    if "--also" in sys.argv[1:]:
        return also()
    if not MODEL.strip():
        print("preload: MODEL is empty — set it at the top of this file", file=sys.stderr)
        return 1
    if not fetch(*parse(MODEL), check_disk=False):
        return 1

    # As written, quant or not: llama-server reports serving exactly this, and
    # that is the name insert_default_model.py registers. Replaced in one step,
    # so dall-m-llamacpp never reads half a name.
    tmp = SERVED.with_name(SERVED.name + ".tmp")
    tmp.write_text(MODEL.strip() + "\n")
    tmp.replace(SERVED)
    print(f"preload: ready — serving {MODEL.strip()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
