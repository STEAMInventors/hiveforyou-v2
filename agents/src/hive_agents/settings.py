from functools import lru_cache
from pathlib import Path
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

STUDY_AGENTS_EXPORT_SCHEMA_VERSION = "study-agents/1"
DEFAULT_DOMAIN_ID = "iep"

DEFAULT_MODEL_PROVIDER = "anthropic"
DEFAULT_MODEL_NAME = "claude-opus-5-5"
DEFAULT_MODEL_MAX_OUTPUT_TOKENS = 16_000

SUPPORTED_MODEL_PROVIDERS = frozenset({"anthropic"})


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

    model_provider: str = Field(
        default=DEFAULT_MODEL_PROVIDER,
        validation_alias="MODEL_PROVIDER",
    )
    model_name: str = Field(
        default=DEFAULT_MODEL_NAME,
        validation_alias="MODEL_NAME",
    )
    model_max_output_tokens: int = Field(
        default=DEFAULT_MODEL_MAX_OUTPUT_TOKENS,
        validation_alias="MODEL_MAX_OUTPUT_TOKENS",
    )
    anthropic_api_key: str | None = None
    anthropic_workspace_id: str | None = None
    agents_service_token: str | None = None
    agents_allow_nonpersistent_audit: bool = Field(default=False)
    reader_max_request_bytes: int = Field(default=16 * 1024 * 1024, ge=1024)

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

    @field_validator("model_provider", mode="before")
    @classmethod
    def _normalize_model_provider(cls, value: object) -> object:
        if value is None:
            return DEFAULT_MODEL_PROVIDER
        if isinstance(value, str):
            normalized = value.strip().lower()
            if not normalized:
                return DEFAULT_MODEL_PROVIDER
            if normalized not in SUPPORTED_MODEL_PROVIDERS:
                raise ValueError(
                    f'MODEL_PROVIDER must be "anthropic" (got "{value}")'
                )
            return normalized
        raise ValueError("MODEL_PROVIDER must be a string")

    @field_validator("model_name", mode="before")
    @classmethod
    def _normalize_model_name(cls, value: object) -> object:
        if value is None:
            return DEFAULT_MODEL_NAME
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or DEFAULT_MODEL_NAME
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

    def validate_lm_env(self) -> None:
        """Fail clearly when LM env is incomplete or unsupported."""
        if self.model_provider not in SUPPORTED_MODEL_PROVIDERS:
            raise ValueError(
                f'MODEL_PROVIDER must be "anthropic" (got "{self.model_provider}")'
            )
        if not self.anthropic_api_key:
            raise ValueError(
                "HIVE_ANTHROPIC_API_KEY is required when MODEL_PROVIDER=anthropic"
            )


@lru_cache
def get_settings() -> Settings:
    return Settings()
