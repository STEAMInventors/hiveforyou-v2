from __future__ import annotations

import logging
from typing import Annotated, Any

from fastapi import FastAPI, Header, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from hive_agents.api_models import (
    PackDomainMismatchError,
    StudyReaderAudit,
    StudyReaderRequest,
    StudyReaderResponse,
    resolve_agent_pack_for_domain,
)
from hive_agents.auth import is_authorized
from hive_agents.lm import create_dspy_lm
from hive_agents.reader import (
    ReaderError,
    ReaderLimitsExhausted,
    ReaderMissingPagesError,
    ReaderRunResult,
    ReaderVerifyContext,
    run_reader,
)
from hive_agents.settings import get_settings
from hive_agents.trace_client import (
    ReaderTraceClient,
    ReaderTraceError,
    reader_trace_config_from_env,
)
from hive_agents.reader_diagnostics import ReaderExecutionCounts, completed_audit_payload
from hive_agents.trace_emitter import ReaderTraceContext, ReaderTraceSession
from hive_agents.verifier_client import (
    ReaderVerifierClient,
    ReaderVerifierError,
    reader_verifier_config_from_env,
)


logger = logging.getLogger(__name__)

app = FastAPI(title="Hive Agents")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.on_event("startup")
def _log_pack_path() -> None:
    """Resolve default pack path at startup (no model calls)."""
    _ = get_settings().resolved_agents_json_path()


def _error_body(code: str, message: str) -> dict[str, Any]:
    return {"error": {"code": code, "message": message}}


def _require_service_auth(authorization: str | None) -> None:
    settings = get_settings()
    try:
        expected = settings.require_agents_service_token()
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=_error_body("SERVICE_AUTH_UNAVAILABLE", str(exc)),
        ) from exc
    if not is_authorized(authorization_header=authorization, expected_token=expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_error_body("UNAUTHORIZED", "Missing or invalid bearer token."),
        )


def _require_verifier_client() -> ReaderVerifierClient:
    try:
        config = reader_verifier_config_from_env()
    except ReaderVerifierError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=_error_body("VERIFIER_UNAVAILABLE", str(exc)),
        ) from exc
    if config is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=_error_body(
                "VERIFIER_UNAVAILABLE",
                "HIVE_VERIFIER_TOKEN is required for study reader requests.",
            ),
        )
    return ReaderVerifierClient(config)



def _build_trace_session(
    request: StudyReaderRequest,
    *,
    pack,
    trace_client: ReaderTraceClient | None = None,
) -> ReaderTraceSession | None:
    if trace_client is not None:
        client = trace_client
    else:
        config = reader_trace_config_from_env()
        if config is None:
            return None
        client = ReaderTraceClient(config)
    settings = get_settings()
    source_document_ids = sorted(
        {doc.source_document_id for doc in request.documents}
    )
    context = ReaderTraceContext(
        study_run_id=request.study_run_id,
        attempt_id=request.attempt_id,
        case_id=request.case_id,
        user_id=request.user_id,
        domain_id=request.domain_id,
        domain_pack_id=pack.domainPackId,
        domain_pack_version=pack.domainPackVersion,
        model_id=settings.model_name,
        source_document_ids=source_document_ids,
    )
    return ReaderTraceSession(context=context, client=client)


def _audit_for_request(
    request: StudyReaderRequest,
    *,
    persisted: bool,
    status: str,
    error_code: str | None = None,
) -> StudyReaderAudit:
    return StudyReaderAudit(
        study_run_id=request.study_run_id,
        attempt_id=request.attempt_id,
        persisted=persisted,
        status=status,  # type: ignore[arg-type]
        error_code=error_code,
    )


def execute_study_reader(
    request: StudyReaderRequest,
    *,
    lm_factory=create_dspy_lm,
    verifier_client: ReaderVerifierClient | None = None,
    trace_client: ReaderTraceClient | None = None,
) -> tuple[ReaderRunResult, StudyReaderAudit]:
    pack = resolve_agent_pack_for_domain(request.domain_id)
    pages = request.flattened_pages()
    if not pages:
        raise ReaderMissingPagesError("none", [0])

    client = verifier_client if verifier_client is not None else _require_verifier_client()
    verify_context = ReaderVerifyContext(
        case_id=request.case_id,
        user_id=request.user_id,
    )
    limits = request.limits.to_execution_limits() if request.limits else None

    lm = lm_factory()
    trace_session = _build_trace_session(request, pack=pack, trace_client=trace_client)
    audit_not_configured = _audit_for_request(
        request,
        persisted=False,
        status="not_configured",
    )
    if trace_session is None:
        if not get_settings().agents_allow_nonpersistent_audit:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=_error_body(
                    "AUDIT_UNAVAILABLE",
                    "Reader audit trail is required (set HIVE_AGENT_TRACE_TOKEN or HIVE_VERIFIER_TOKEN).",
                ),
            )
        result = run_reader(
            pack=pack,
            pages=pages,
            lm=lm,
            verifier_client=client,
            verify_context=verify_context,
            limits=limits,
            document_ids=request.document_ids,
            page_numbers_by_document=request.page_numbers_by_document,
            search_queries=request.search_queries,
        )
        return result, audit_not_configured

    import time

    started = time.perf_counter()
    trace_session.emit("STARTED", {"modelId": trace_session.context.model_id})
    try:
        result = run_reader(
            pack=pack,
            pages=pages,
            lm=lm,
            verifier_client=client,
            verify_context=verify_context,
            limits=limits,
            document_ids=request.document_ids,
            page_numbers_by_document=request.page_numbers_by_document,
            search_queries=request.search_queries,
            trace_session=trace_session,
        )
        duration_ms = int((time.perf_counter() - started) * 1000)
        counts = result.execution_counts or ReaderExecutionCounts()
        trace_session.emit(
            "COMPLETED",
            completed_audit_payload(
                counts,
                duration_ms=duration_ms,
                reasoning_steps=result.reasoning_steps,
                tool_calls=result.tool_calls,
                input_tokens=result.model_usage_input_tokens,
                output_tokens=result.model_usage_output_tokens,
                cache_read_input_tokens=result.model_usage_cache_read_input_tokens,
                cache_write_input_tokens=result.model_usage_cache_write_input_tokens,
            ),
        )
        trace_session.flush()
    except ReaderTraceError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=_error_body("TRACE_PERSIST_FAILED", str(exc)),
        ) from exc
    except Exception as exc:
        duration_ms = int((time.perf_counter() - started) * 1000)
        trace_session.emit(
            "FAILED",
            {
                "durationMs": duration_ms,
                "errorCode": exc.__class__.__name__,
            },
        )
        try:
            trace_session.flush()
        except ReaderTraceError:
            raise
        raise

    return result, _audit_for_request(request, persisted=True, status="persisted")


def _study_reader_response(
    request: StudyReaderRequest,
    result: ReaderRunResult,
    *,
    pack_version: str,
    audit: StudyReaderAudit | None = None,
) -> StudyReaderResponse:
    candidate_facts = [
        fact.model_dump(mode="json", by_alias=False) for fact in result.candidate_facts
    ]
    return StudyReaderResponse(
        case_id=request.case_id,
        domain_id=request.domain_id,
        pack_version=pack_version,
        candidate_facts=candidate_facts,
        reasoning_steps=result.reasoning_steps,
        tool_calls=result.tool_calls,
        audit=audit,
    )


async def _parse_study_reader_request(http_request: Request) -> StudyReaderRequest:
    settings = get_settings()
    max_bytes = settings.reader_max_request_bytes
    content_length = http_request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > max_bytes:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=_error_body("PAYLOAD_TOO_LARGE", "Request body exceeds limit."),
                )
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=_error_body("INVALID_CONTENT_LENGTH", "Invalid Content-Length header."),
            ) from exc

    raw = await http_request.body()
    if len(raw) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=_error_body("PAYLOAD_TOO_LARGE", "Request body exceeds limit."),
        )
    try:
        return StudyReaderRequest.model_validate_json(raw)
    except ValidationError as exc:
        raise RequestValidationError(exc.errors()) from exc


@app.exception_handler(HTTPException)
async def _http_exception_handler(
    _request: Request,
    exc: HTTPException,
) -> JSONResponse:
    if isinstance(exc.detail, dict) and "error" in exc.detail:
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content=_error_body("HTTP_ERROR", str(exc.detail)),
    )


@app.exception_handler(RequestValidationError)
async def _validation_exception_handler(
    _request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=_error_body("INVALID_REQUEST", "Request validation failed."),
    )


@app.post("/study/reader", response_model=StudyReaderResponse)
async def study_reader(
    http_request: Request,
    authorization: Annotated[str | None, Header()] = None,
) -> StudyReaderResponse:
    _require_service_auth(authorization)
    request = await _parse_study_reader_request(http_request)

    try:
        pack = resolve_agent_pack_for_domain(request.domain_id)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=_error_body("PACK_NOT_FOUND", "Study agents export not found for domain."),
        ) from exc
    except PackDomainMismatchError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_error_body("PACK_DOMAIN_MISMATCH", str(exc)),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_error_body("PACK_INVALID", str(exc)),
        ) from exc

    try:
        get_settings().validate_lm_env()
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=_error_body("LM_CONFIG_INVALID", str(exc)),
        ) from exc

    try:
        result, audit = execute_study_reader(request)
    except HTTPException:
        raise
    except ReaderVerifierError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=_error_body("VERIFIER_UNAVAILABLE", str(exc)),
        ) from exc
    except ReaderTraceError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=_error_body("TRACE_PERSIST_FAILED", str(exc)),
        ) from exc
    except ReaderLimitsExhausted as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=_error_body("READER_LIMITS_EXCEEDED", str(exc)),
        ) from exc
    except ReaderMissingPagesError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=_error_body("MISSING_PAGES", str(exc)),
        ) from exc
    except ReaderError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_error_body("READER_FAILED", str(exc)),
        ) from exc
    except Exception as exc:
        logger.exception("study reader failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_error_body("READER_FAILED", "Reader execution failed."),
        ) from exc

    return _study_reader_response(
        request,
        result,
        pack_version=pack.domainPackVersion,
        audit=audit,
    )
