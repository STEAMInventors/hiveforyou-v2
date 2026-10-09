from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from hive_agents.settings import (
    STUDY_AGENTS_EXPORT_SCHEMA_VERSION,
    get_settings,
)

STUDY_AGENT_ROLES = ("intake", "reader", "investigator", "writer")


class StudyAgentInstructions(BaseModel):
    model_config = ConfigDict(extra="forbid")

    intake: str
    reader: str
    investigator: str
    writer: str

    @model_validator(mode="after")
    def _non_empty_roles(self) -> StudyAgentInstructions:
        for role in STUDY_AGENT_ROLES:
            value = getattr(self, role)
            if not isinstance(value, str) or not value.strip():
                raise ValueError(f"agents.{role} must be a non-empty string.")
        return self


class AgentPack(BaseModel):
    """Phase 2 ``StudyAgentsExportArtifact`` (``scripts/pack-export.ts``)."""

    model_config = ConfigDict(extra="forbid")

    schemaVersion: Literal["study-agents/1"] = Field(
        alias="schemaVersion",
    )
    domainId: str
    domainPackId: str
    domainPackVersion: str
    agents: StudyAgentInstructions

    @field_validator("schemaVersion")
    @classmethod
    def _schema_version(cls, value: str) -> str:
        if value != STUDY_AGENTS_EXPORT_SCHEMA_VERSION:
            raise ValueError(
                f'Unsupported schemaVersion "{value}"; expected '
                f'"{STUDY_AGENTS_EXPORT_SCHEMA_VERSION}".'
            )
        return value


def load_agent_pack(path: Path | None = None) -> AgentPack:
    """
    Load and minimally validate the exported study agents JSON artifact.
    """
    resolved = path if path is not None else get_settings().resolved_agents_json_path()
    resolved = Path(resolved).resolve()

    if not resolved.is_file():
        raise FileNotFoundError(f"Study agents export not found: {resolved}")

    try:
        raw_text = resolved.read_text(encoding="utf-8")
    except OSError as exc:
        raise OSError(f"Unable to read study agents export at {resolved}: {exc}") from exc

    try:
        data = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"Malformed JSON in study agents export at {resolved}: {exc.msg}"
        ) from exc

    if not isinstance(data, dict):
        raise ValueError(
            f"Study agents export at {resolved} must be a JSON object, got {type(data).__name__}."
        )

    try:
        return AgentPack.model_validate(data)
    except Exception as exc:
        raise ValueError(
            f"Study agents export at {resolved} failed contract validation: {exc}"
        ) from exc
