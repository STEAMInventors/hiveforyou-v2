from __future__ import annotations

import pytest

from hive_agents.reader_mode import (
    assert_reader_mode_compatible,
    resolve_effective_reader_mode,
    resolve_reader_mode,
)
from hive_agents.settings import Settings, get_settings


def test_resolve_reader_mode_defaults_off() -> None:
    get_settings.cache_clear()
    assert resolve_reader_mode(Settings()) is None


def test_pack_driven_incompatible_with_architecture_variant() -> None:
    with pytest.raises(ValueError, match="cannot be combined"):
        assert_reader_mode_compatible(
            Settings(
                reader_mode="pack_driven",
                reader_architecture_variant="case_wide",
            )
        )


def test_request_reader_mode_without_agent_env() -> None:
    get_settings.cache_clear()
    assert resolve_effective_reader_mode(Settings(), "pack_driven") == "pack_driven"


def test_request_reader_mode_selects_pack_driven_on_http_boundary() -> None:
    get_settings.cache_clear()
    assert_reader_mode_compatible(Settings(), "pack_driven")