from functools import lru_cache
from pathlib import Path
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

STUDY_AGENTS_EXPORT_SCHEMA_VERSION = "study-agents/1"
DEFAULT_DOMAIN_ID = "iep"

DEFAULT_MODEL_MAX_OUTPUT_TOKENS = 16_000
DEFAULT_MODEL_HARVESTER = "gemini/gemini-1.5-flash"
DEFAULT_MODEL_HEAVY_LIFTER = "gpt-4o"


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
    model_config = SettingsConfigDict(
        env_prefix="HIVE_",
        extra="ignore",
        populate_by_name=True,
    )

    agents_json: Path | None = None

    model_max_output_tokens: int = Field(
        default=DEFAULT_MODEL_MAX_OUTPUT_TOKENS,
        validation_alias="MODEL_MAX_OUTPUT_TOKENS",
    )
    litellm_base_url: str | None = Field(default=None, validation_alias="LITELLM_BASE_URL")
    litellm_api_key: str | None = Field(default=None, validation_alias="LITELLM_API_KEY")
    model_harvester: str | None = Field(default=None, validation_alias="MODEL_HARVESTER")
    model_heavy_lifter: str | None = Field(default=None, validation_alias="MODEL_HEAVY_LIFTER")
    anthropic_api_key: str | None = None
    anthropic_workspace_id: str | None = None
    agents_service_token: str | None = None
    agents_allow_nonpersistent_audit: bool = Field(default=False)
    reader_max_request_bytes: int = Field(default=16 * 1024 * 1024, ge=1024)
    reader_experiment_variant: str | None = Field(
        default=None,
        validation_alias="READER_EXPERIMENT_VARIANT",
    )
    reader_architecture_variant: str | None = Field(
        default=None,
        validation_alias="READER_ARCHITECTURE_VARIANT",
    )
    reader_parallel_prompt_variant: str | None = Field(
        default=None,
        validation_alias="READER_PARALLEL_PROMPT_VARIANT",
    )
    reader_parallel_concurrency: int = Field(
        default=8,
        validation_alias="READER_PARALLEL_CONCURRENCY",
    )
    reader_experiment_truncate_verification: bool = Field(
        default=False,
        validation_alias="READER_EXPERIMENT_TRUNCATE_VERIFICATION",
    )
    reader_mode: str | None = Field(
        default=None,
        validation_alias="READER_MODE",
    )
    pack_driven_reader_proposal_json: Path | None = Field(
        default=None,
        validation_alias="PACK_DRIVEN_READER_PROPOSAL_JSON",
    )
    domain_packs_brain_dir: Path | None = Field(
        default=None,
        validation_alias="DOMAIN_PACKS_BRAIN_DIR",
    )
    proposal_pack_snapshots_dir: Path | None = Field(
        default=None,
        validation_alias="PROPOSAL_PACK_SNAPSHOTS_DIR",
    )
    pack_driven_reader_pack_id: str | None = Field(
        default=None,
        validation_alias="PACK_DRIVEN_READER_PACK_ID",
    )
    pack_driven_reader_pack_version: str | None = Field(
        default=None,
        validation_alias="PACK_DRIVEN_READER_PACK_VERSION",
    )
    pack_driven_reader_pack_content_sha256: str | None = Field(
        default=None,
        validation_alias="PACK_DRIVEN_READER_PACK_CONTENT_SHA256",
    )

    @field_validator("reader_experiment_truncate_verification", mode="before")
    @classmethod
    def _parse_reader_experiment_truncate(cls, value: object) -> object:
        if value is None:
            return False
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            normalized = value.strip().lower()
            if not normalized:
                return False
            return normalized in {"1", "true", "yes", "on"}
        return value

    @field_validator("reader_experiment_variant", mode="before")
    @classmethod
    def _normalize_reader_experiment_variant(cls, value: object) -> object:
        if value is None:
            return None
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return value

    @field_validator("reader_architecture_variant", mode="before")
    @classmethod
    def _normalize_reader_architecture_variant(cls, value: object) -> object:
        if value is None:
            return None
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return value

    @field_validator("reader_parallel_prompt_variant", mode="before")
    @classmethod
    def _normalize_reader_parallel_prompt_variant(cls, value: object) -> object:
        if value is None:
            return None
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return value

    @field_validator("reader_mode", mode="before")
    @classmethod
    def _normalize_reader_mode(cls, value: object) -> object:
        if value is None:
            return None
        if isinstance(value, str):
            stripped = value.strip().lower()
            return stripped or None
        return value

    @field_validator("pack_driven_reader_proposal_json", mode="before")
    @classmethod
    def _parse_pack_driven_reader_proposal_json(cls, value: object) -> object:
        if value is None or (isinstance(value, str) and not value.strip()):
            return None
        if isinstance(value, str):
            return Path(value.strip())
        if isinstance(value, Path):
            return value
        raise ValueError("PACK_DRIVEN_READER_PROPOSAL_JSON must be a path string")

    @field_validator("domain_packs_brain_dir", "proposal_pack_snapshots_dir", mode="before")
    @classmethod
    def _parse_optional_path(cls, value: object) -> object:
        if value is None or (isinstance(value, str) and not value.strip()):
            return None
        if isinstance(value, str):
            return Path(value.strip())
        if isinstance(value, Path):
            return value
        raise ValueError("Path env vars must be path strings")

    @field_validator(
        "pack_driven_reader_pack_id",
        "pack_driven_reader_pack_version",
        "pack_driven_reader_pack_content_sha256",
        mode="before",
    )
    @classmethod
    def _strip_optional_pack_identity(cls, value: object) -> object:
        if value is None:
            return None
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return value

    @field_validator("reader_parallel_concurrency", mode="before")
    @classmethod
    def _parse_reader_parallel_concurrency(cls, value: object) -> object:
        if value is None or (isinstance(value, str) and not value.strip()):
            return 8
        if isinstance(value, str):
            parsed = int(value.strip(), 10)
        elif isinstance(value, int):
            parsed = value
        else:
            raise ValueError("READER_PARALLEL_CONCURRENCY must be a positive integer")
        if parsed <= 0:
            raise ValueError("READER_PARALLEL_CONCURRENCY must be a positive integer")
        return parsed

    @field_validator("agents_allow_nonpersistent_audit", mode="before")
    @classmethod
    def _parse_allow_nonpersistent_audit(cls, value: object) -> object:
        if value is None:
            return False
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            normalized = value.strip().lower()
            if not normalized:
                return False
            return normalized in {"1", "true", "yes", "on"}
        return value

    @field_validator(
        "litellm_base_url",
        "litellm_api_key",
        "model_harvester",
        "model_heavy_lifter",
        mode="before",
    )
    @classmethod
    def _strip_optional_litellm(cls, value: object) -> object:
        if value is None:
            return None
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return value

    @field_validator("model_max_output_tokens", mode="before")
    @classmethod
    def _validate_max_output_tokens(cls, value: object) -> object:
        if value is None or (isinstance(value, str) and not value.strip()):
            return DEFAULT_MODEL_MAX_OUTPUT_TOKENS
        if isinstance(value, bool):
            raise ValueError("MODEL_MAX_OUTPUT_TOKENS must be a positive integer")
        if isinstance(value, str):
            parsed = int(value.strip(), 10)
        elif isinstance(value, int):
            parsed = value
        else:
            raise ValueError("MODEL_MAX_OUTPUT_TOKENS must be a positive integer")
        if parsed <= 0:
            raise ValueError("MODEL_MAX_OUTPUT_TOKENS must be a positive integer")
        return parsed

    @field_validator(
        "anthropic_api_key",
        "anthropic_workspace_id",
        "agents_service_token",
        mode="before",
    )
    @classmethod
    def _strip_optional_secret(cls, value: object) -> object:
        if value is None:
            return None
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return value

    def resolved_agents_json_path(self) -> Path:
        if self.agents_json is not None:
            return Path(self.agents_json).expanduser().resolve()
        return default_study_agents_json_path()

    def require_agents_service_token(self) -> str:
        if not self.agents_service_token:
            raise ValueError(
                "HIVE_AGENTS_SERVICE_TOKEN is required for study reader requests."
            )
        return self.agents_service_token

    def reader_model_id(self) -> str:
        return self.model_harvester or DEFAULT_MODEL_HARVESTER

    def writer_model_id(self) -> str:
        return self.model_heavy_lifter or DEFAULT_MODEL_HEAVY_LIFTER

    def validate_lm_env(self) -> None:
        """Fail clearly when LiteLLM gateway env is incomplete."""
        if not self.litellm_base_url:
            raise ValueError("LITELLM_BASE_URL is required for hive-agents model calls")
        if not self.litellm_api_key:
            raise ValueError("LITELLM_API_KEY is required when LITELLM_BASE_URL is set")


@lru_cache
def get_settings() -> Settings:
    return Settings()
