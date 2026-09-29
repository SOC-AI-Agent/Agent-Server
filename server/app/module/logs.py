import logging
import os


def setup_logging() -> None:
    """Everything under the "dall_m" logger, with timestamps; LOG_LEVEL=DEBUG adds health checks and payload previews."""
    log = logging.getLogger("dall_m")
    if log.handlers:
        return
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)-7s %(name)s: %(message)s"))
    log.addHandler(handler)
    log.setLevel(os.getenv("LOG_LEVEL", "INFO").upper())
    log.propagate = False


def preview(text: str | None, limit: int = 200) -> str:
    if not text:
        return "''"
    flat = " ".join(text.split())
    return repr(flat if len(flat) <= limit else flat[:limit] + "…")
