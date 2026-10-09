from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

STUDY_AGENTS_EXPORT_SCHEMA_VERSION = "study-agents/1"
DEFAULT_DOMAIN_ID = "iep"


def repo_root_from_module_file(module_file: str | Path) -> Path:
    """Repository root: parent of the ``agents/`` package directory."""
    return Path(module_file).resolve().parents[3]


def default_study_agents_json_path(
    repo_root: Path | None = None,
    domain_id: str = DEFAULT_DOMAIN_ID,
) -> Path:
    """
    Match ``studyAgentsExportOutputPath`` from ``scripts/pack-export.ts``.
    """
    root = repo_root if repo_root is not None else repo_root_from_module_file(__file__)
    return root / "engine" / "domain-packs" / domain_id / "study" / "agents.json"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="HIVE_", extra="ignore")

    agents_json: Path | None = None

    def resolved_agents_json_path(self) -> Path:
        if self.agents_json is not None:
            return Path(self.agents_json).expanduser().resolve()
        return default_study_agents_json_path()


@lru_cache
def get_settings() -> Settings:
    return Settings()
