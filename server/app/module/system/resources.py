"""
What the machine this runs on has, and how much of it is in use — for the
admin UI's Resources page.

Read from /proc, which a container shares with its host: the kernel, CPU
count, CPU time, memory and load average are the host's, not this container's
(docker-compose.yml sets no limits on it). That works the same on the
production host (Red Hat) as on a laptop, with no distribution tools and no
Docker socket. Two things come from mounts: the model cache (/models, read
only — what is downloaded, how big, which one is served) and the disks are the
filesystems under it and under this container's own root, which is where
Docker keeps images and containers. llama-server is asked over HTTP, as the
agents ask it.
"""

import asyncio
import os
import re
import shutil
from pathlib import Path
from typing import Any, Optional

import httpx

MODELS_DIR = Path(os.getenv("MODELS_DIR", "/models"))
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://localhost:8080")


def _meminfo() -> dict[str, int]:
    """/proc/meminfo in bytes."""
    out: dict[str, int] = {}
    for line in Path("/proc/meminfo").read_text().splitlines():
        key, _, rest = line.partition(":")
        parts = rest.split()
        if parts:
            out[key] = int(parts[0]) * (1024 if len(parts) > 1 else 1)
    return out


def _cpu_times() -> tuple[int, int]:
    """(total, idle) jiffies across all CPUs since boot. iowait counts as idle."""
    fields = [int(v) for v in Path("/proc/stat").read_text().splitlines()[0].split()[1:]]
    idle = fields[3] + (fields[4] if len(fields) > 4 else 0)
    return sum(fields[:8]), idle


async def _cpu_percent(interval: float = 0.5) -> float:
    total1, idle1 = _cpu_times()
    await asyncio.sleep(interval)
    total2, idle2 = _cpu_times()
    busy = (total2 - total1) - (idle2 - idle1)
    return round(100.0 * busy / max(total2 - total1, 1), 1)


def _cpu_model() -> Optional[str]:
    for line in Path("/proc/cpuinfo").read_text().splitlines():
        key, _, value = line.partition(":")
        if key.strip() in ("model name", "Model", "Hardware") and value.strip():
            return value.strip()
    return None


def _os() -> dict[str, Optional[str]]:
    """The host's kernel; on Red Hat and its rebuilds the release names the
    major.minor version too (…el9_4… is 9.4). /etc/os-release in here would
    be this container's Debian, not the host's."""
    kernel = Path("/proc/sys/kernel/osrelease").read_text().strip()
    m = re.search(r"\.el(\d+)(?:_(\d+))?", kernel)
    name = None
    if m:
        name = f"Red Hat Enterprise Linux {m.group(1)}" + (f".{m.group(2)}" if m.group(2) else "") + " (or a rebuild)"
    return {"name": name, "kernel": kernel}


def _disk(path: Path) -> Optional[dict[str, Any]]:
    try:
        usage = shutil.disk_usage(path)
        return {"path": str(path), "device": os.stat(path).st_dev, "total": usage.total,
                "used": usage.used, "free": usage.free}
    except OSError:
        return None


def _disks() -> list[dict[str, Any]]:
    """The filesystem holding the model cache, and the one holding this
    container's root (Docker's own storage) — once, when they are the same."""
    seen, out = set(), []
    for label, path in (("model cache", MODELS_DIR), ("Docker storage", Path("/"))):
        d = _disk(path)
        if d and d["device"] not in seen:
            seen.add(d["device"])
            d.pop("device")
            out.append({"label": label, **d})
    return out


def _gpus() -> list[str]:
    """NVIDIA GPUs the host's driver reports; none on a CPU-only host."""
    names = []
    for info in sorted(Path("/proc/driver/nvidia/gpus").glob("*/information")):
        for line in info.read_text().splitlines():
            if line.startswith("Model:"):
                names.append(line.split(":", 1)[1].strip())
    return names


def _models() -> dict[str, Any]:
    """What the model cache holds: Hugging Face's layout, models--<org>--<repo>,
    sized by the blobs actually on disk. A *.incomplete blob is a download
    still in progress (or stopped partway, to be resumed)."""
    served_file = MODELS_DIR / "served-model"
    served = served_file.read_text().strip() if served_file.is_file() else None
    served_repo = served.partition(":")[0] if served else None
    items = []
    for d in sorted(MODELS_DIR.glob("models--*")):
        blobs = [p for p in (d / "blobs").glob("*") if p.is_file()]
        items.append({
            "repo": d.name[len("models--"):].replace("--", "/", 1),
            "size": sum(p.stat().st_size for p in blobs),
            "downloading": any(p.name.endswith(".incomplete") for p in blobs),
        })
    for item in items:
        item["served"] = item["repo"] == served_repo
    return {"available": MODELS_DIR.is_dir(), "served": served, "items": items}


from app.module.llm.client import LLM_API_KEY, auth_headers, endpoint_url


async def _llm() -> dict[str, Any]:
    """Check local llama-server (/health + /v1/models) or external OpenAI-compatible API (/models)."""
    headers = auth_headers()
    async with httpx.AsyncClient(timeout=5) as client:
        if LLM_API_KEY:
            try:
                resp = await client.get(endpoint_url("v1/models"), headers=headers)
                if resp.status_code == 200:
                    data = resp.json().get("data") or []
                    model = data[0]["id"] if data else LLM_BASE_URL
                    return {"status": "ok", "model": model}
                return {"status": "down", "model": None}
            except (httpx.HTTPError, ValueError, KeyError, IndexError):
                return {"status": "down", "model": None}

        try:
            health = await client.get(f"{LLM_BASE_URL}/health")
        except httpx.HTTPError:
            return {"status": "down", "model": None}
        model = None
        try:
            models = (await client.get(endpoint_url("v1/models"))).json()
            model = models["data"][0]["id"]
        except (httpx.HTTPError, ValueError, KeyError, IndexError):
            pass
    return {"status": "ok" if health.status_code == 200 else "loading", "model": model}


async def snapshot() -> dict[str, Any]:
    cpu_percent, llm = await asyncio.gather(_cpu_percent(), _llm())
    mem = _meminfo()
    load1, load5, load15 = os.getloadavg()
    return {
        "host": {**_os(), "uptime_seconds": int(float(Path("/proc/uptime").read_text().split()[0]))},
        "cpu": {"model": _cpu_model(), "cores": os.cpu_count(), "percent": cpu_percent,
                "load": [round(load1, 2), round(load5, 2), round(load15, 2)]},
        "memory": {"total": mem.get("MemTotal", 0), "available": mem.get("MemAvailable", 0),
                   "swap_total": mem.get("SwapTotal", 0), "swap_free": mem.get("SwapFree", 0)},
        "disks": _disks(),
        "gpus": _gpus(),
        "llm": llm,
        "models": _models(),
    }
