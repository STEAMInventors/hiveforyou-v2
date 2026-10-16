from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

from hive_agents.writer_errors import WriterModelError


@dataclass(frozen=True)
class HiveWriterAnthropicContract:
    schema_version: str
    schema_name: str
    proposal_schema_version: str
    schema_sha256: str
    anthropic_constrained_supported: bool
    unsupported_reason: str | None
    response_format: dict[str, Any] | None

    def require_constrained_response_format(self) -> dict[str, Any]:
        if not self.anthropic_constrained_supported or self.response_format is None:
            raise WriterModelError(
                "WRITER_PROVIDER_SCHEMA_UNSUPPORTED",
                message=(
                    "Hive Writer response schema is not compatible with Anthropic constrained "
                    f"json_schema ({self.unsupported_reason or 'unsupported'})."
                ),
            )
        return dict(self.response_format)


def _contract_path() -> Path:
    return Path(__file__).resolve().parent / "contracts" / "hive-writer-anthropic-response-format.json"


@lru_cache(maxsize=1)
def load_hive_writer_anthropic_contract() -> HiveWriterAnthropicContract:
    path = _contract_path()
    if not path.is_file():
        raise WriterModelError(
            "WRITER_PROVIDER_SCHEMA_UNSUPPORTED",
            message=f"Missing Writer Anthropic contract artifact at {path.name}.",
        )
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise WriterModelError("WRITER_PROVIDER_SCHEMA_UNSUPPORTED", message="Invalid Writer contract JSON.")
    return HiveWriterAnthropicContract(
        schema_version=str(raw.get("schemaVersion", "")),
        schema_name=str(raw.get("schemaName", "")),
        proposal_schema_version=str(raw.get("proposalSchemaVersion", "")),
        schema_sha256=str(raw.get("schemaSha256", "")),
        anthropic_constrained_supported=raw.get("anthropicConstrainedSupported") is True,
        unsupported_reason=(
            str(raw["unsupportedReason"]) if raw.get("unsupportedReason") is not None else None
        ),
        response_format=(
            dict(raw["responseFormat"]) if isinstance(raw.get("responseFormat"), dict) else None
        ),
    )