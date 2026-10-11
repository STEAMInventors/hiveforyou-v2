from __future__ import annotations

from hive_agents.settings import Settings, get_settings

PACK_DRIVEN_READER_MODE = "pack_driven"


def resolve_reader_mode(settings: Settings | None = None) -> str | None:
    resolved = settings or get_settings()
    raw = resolved.reader_mode
    if not raw:
        return None
    if raw == PACK_DRIVEN_READER_MODE:
        return PACK_DRIVEN_READER_MODE
    raise ValueError(f"Unsupported HIVE_READER_MODE: {raw!r}")


def resolve_effective_reader_mode(
    settings: Settings | None = None,
    request_reader_mode: str | None = None,
) -> str | None:
    resolved = settings or get_settings()
    env_mode = resolve_reader_mode(resolved)
    normalized_request = request_reader_mode.strip().lower() if request_reader_mode else None
    if normalized_request and normalized_request != PACK_DRIVEN_READER_MODE:
        raise ValueError(f"Unsupported readerMode: {request_reader_mode!r}")
    if normalized_request and env_mode and normalized_request != env_mode:
        raise ValueError("readerMode conflicts with HIVE_READER_MODE")
    return normalized_request or env_mode


def assert_reader_mode_compatible(
    settings: Settings | None = None,
    request_reader_mode: str | None = None,
) -> None:
    resolved = settings or get_settings()
    mode = resolve_effective_reader_mode(resolved, request_reader_mode)
    if mode == PACK_DRIVEN_READER_MODE and resolved.reader_architecture_variant:
        raise ValueError(
            "HIVE_READER_MODE=pack_driven cannot be combined with HIVE_READER_ARCHITECTURE_VARIANT",
        )
