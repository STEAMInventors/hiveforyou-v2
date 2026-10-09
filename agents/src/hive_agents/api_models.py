from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator, model_validator

from hive_agents.pack_loader import AgentPack, load_agent_pack
from hive_agents.reader import DocumentPage, PageWord, ReaderExecutionLimits
from hive_agents.settings import default_study_agents_json_path, get_settings

STUDY_READER_API_SCHEMA_VERSION: Literal["study-reader/1"] = "study-reader/1"

DEFAULT_MAX_DOCUMENTS = 64
DEFAULT_MAX_PAGES = 512
DEFAULT_MAX_WORDS_PER_PAGE = 20_000


class PageWordInput(BaseModel):
    model_config = ConfigDict(extra="ignore")

    seq: int
    text: str


class DocumentPageInput(BaseModel):
    """Wire page shape compatible with engine ``PageModel`` (text fields only)."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    document_id: str = Field(
        validation_alias=AliasChoices("documentId", "sourceDocumentId"),
    )
    page_number: int = Field(validation_alias=AliasChoices("pageNumber", "page"))
    words: list[PageWordInput] = Field(default_factory=list)

    @field_validator("document_id")
    @classmethod
    def _non_empty_document_id(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("documentId must be non-empty.")
        return stripped

    @field_validator("page_number")
    @classmethod
    def _positive_page(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("pageNumber must be a positive integer.")
        return value

    def to_document_page(self) -> DocumentPage:
        return DocumentPage(
            documentId=self.document_id,
            pageNumber=self.page_number,
            words=[PageWord(seq=word.seq, text=word.text) for word in self.words],
        )


class StudyReaderDocumentInput(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    source_document_id: str = Field(
        validation_alias=AliasChoices("sourceDocumentId", "documentId"),
    )
    pages: list[DocumentPageInput] = Field(min_length=1)

    @field_validator("source_document_id")
    @classmethod
    def _non_empty_source(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("sourceDocumentId must be non-empty.")
        return stripped

    @model_validator(mode="before")
    @classmethod
    def _default_page_document_ids(cls, data: object) -> object:
        if not isinstance(data, dict):
            return data
        source = data.get("sourceDocumentId") or data.get("documentId")
        pages = data.get("pages")
        if not source or not isinstance(pages, list):
            return data
        normalized_pages: list[object] = []
        for page in pages:
            if isinstance(page, dict):
                page_copy = dict(page)
                if not page_copy.get("documentId") and not page_copy.get("sourceDocumentId"):
                    page_copy["documentId"] = source
                normalized_pages.append(page_copy)
            else:
                normalized_pages.append(page)
        updated = dict(data)
        updated["pages"] = normalized_pages
        return updated

    @model_validator(mode="after")
    def _align_page_document_ids(self) -> StudyReaderDocumentInput:
        for page in self.pages:
            if page.document_id != self.source_document_id:
                raise ValueError(
                    "Each page documentId must match its parent sourceDocumentId."
                )
        return self


class ReaderLimitsInput(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    max_reasoning_steps: int | None = Field(
        default=None,
        validation_alias=AliasChoices("maxReasoningSteps", "max_reasoning_steps"),
        ge=1,
    )
    max_tool_calls: int | None = Field(
        default=None,
        validation_alias=AliasChoices("maxToolCalls", "max_tool_calls"),
        ge=1,
    )

    def to_execution_limits(self) -> ReaderExecutionLimits | None:
        if self.max_reasoning_steps is None and self.max_tool_calls is None:
            return None
        kwargs: dict[str, int] = {}
        if self.max_reasoning_steps is not None:
            kwargs["max_reasoning_steps"] = self.max_reasoning_steps
        if self.max_tool_calls is not None:
            kwargs["max_tool_calls"] = self.max_tool_calls
        return ReaderExecutionLimits(**kwargs)


class StudyReaderRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    case_id: str = Field(validation_alias=AliasChoices("caseId"))
    user_id: str = Field(validation_alias=AliasChoices("userId"))
    domain_id: str = Field(validation_alias=AliasChoices("domainId"))
    study_run_id: str = Field(validation_alias=AliasChoices("studyRunId"))
    attempt_id: str = Field(validation_alias=AliasChoices("attemptId"))
    documents: list[StudyReaderDocumentInput] = Field(min_length=1)
    limits: ReaderLimitsInput | None = None
    document_ids: list[str] | None = Field(
        default=None,
        validation_alias=AliasChoices("documentIds", "document_ids"),
    )
    page_numbers_by_document: dict[str, list[int]] | None = Field(
        default=None,
        validation_alias=AliasChoices("pageNumbersByDocument", "page_numbers_by_document"),
    )
    search_queries: list[str] | None = Field(
        default=None,
        validation_alias=AliasChoices("searchQueries", "search_queries"),
    )

    @field_validator("case_id", "user_id", "domain_id", "study_run_id", "attempt_id")
    @classmethod
    def _non_empty_ids(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("caseId, userId, domainId, studyRunId, and attemptId must be non-empty.")
        return stripped

    @model_validator(mode="after")
    def _validate_collection_bounds(self) -> StudyReaderRequest:
        if len(self.documents) > DEFAULT_MAX_DOCUMENTS:
            raise ValueError(f"At most {DEFAULT_MAX_DOCUMENTS} documents are allowed.")
        page_count = sum(len(doc.pages) for doc in self.documents)
        if page_count > DEFAULT_MAX_PAGES:
            raise ValueError(f"At most {DEFAULT_MAX_PAGES} pages are allowed.")
        for doc in self.documents:
            for page in doc.pages:
                if len(page.words) > DEFAULT_MAX_WORDS_PER_PAGE:
                    raise ValueError(
                        f"At most {DEFAULT_MAX_WORDS_PER_PAGE} words per page are allowed."
                    )
        return self

    def flattened_pages(self) -> list[DocumentPage]:
        pages: list[DocumentPage] = []
        for document in self.documents:
            for page in document.pages:
                pages.append(page.to_document_page())
        return pages


class StudyReaderAudit(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True, serialize_by_alias=True)

    study_run_id: str = Field(serialization_alias="studyRunId")
    attempt_id: str = Field(serialization_alias="attemptId")
    persisted: bool
    status: Literal["persisted", "not_configured", "failed"] = "not_configured"
    error_code: str | None = Field(default=None, serialization_alias="errorCode")


class StudyReaderResponse(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
        serialize_by_alias=True,
    )

    schema_version: Literal["study-reader/1"] = Field(
        serialization_alias="schemaVersion",
        default=STUDY_READER_API_SCHEMA_VERSION,
    )
    case_id: str = Field(serialization_alias="caseId")
    domain_id: str = Field(serialization_alias="domainId")
    pack_version: str = Field(serialization_alias="packVersion")
    candidate_facts: list[dict[str, object]] = Field(serialization_alias="candidateFacts")
    reasoning_steps: int = Field(serialization_alias="reasoningSteps")
    tool_calls: int = Field(serialization_alias="toolCalls")
    audit: StudyReaderAudit | None = None


class PackDomainMismatchError(ValueError):
    pass


def resolve_agent_pack_for_domain(domain_id: str) -> AgentPack:
    settings = get_settings()
    if settings.agents_json is not None:
        path = settings.resolved_agents_json_path()
    else:
        path = default_study_agents_json_path(domain_id=domain_id)
    pack = load_agent_pack(Path(path))
    if pack.domainId != domain_id:
        raise PackDomainMismatchError(
            f'Pack domainId "{pack.domainId}" does not match request domainId "{domain_id}".'
        )
    return pack
