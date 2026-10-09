from fastapi import FastAPI

from hive_agents.settings import get_settings

app = FastAPI(title="Hive Agents")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.on_event("startup")
def _log_pack_path() -> None:
    """Resolve default pack path at startup (no model calls)."""
    _ = get_settings().resolved_agents_json_path()
