from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Protocol

from hive_agents.reader import CandidateFactDraft, SourceEvidence


class ReaderVerifierTransport(Protocol):
    def post_json(
        self,
        *,
        url: str,
        token: str,
        body: dict[str, Any],
        timeout_seconds: float,
    ) -> dict[str, Any]: ...


@dataclass(frozen=True)
class ReaderVerifierConfig:
    base_url: str
    token: str
    timeout_seconds: float = 15.0


@dataclass(frozen=True)
class ReaderVerifierResult:
    accepted: bool
    reasons: list[str]
    verified_evidence: list[dict[str, Any]]


class ReaderVerifierError(Exception):
    """Verifier unavailable or response could not be trusted."""


class UrllibReaderVerifierTransport:
    def post_json(
        self,
        *,
        url: str,
        token: str,
        body: dict[str, Any],
        timeout_seconds: float,
    ) -> dict[str, Any]:
        payload = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=payload,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {token}",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
                raw = resp.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            if exc.code in (401, 403):
                raise ReaderVerifierError("verifier authentication failed") from exc
            raise ReaderVerifierError("verifier HTTP error") from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise ReaderVerifierError("verifier unavailable") from exc

        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ReaderVerifierError("verifier returned malformed JSON") from exc
        if not isinstance(parsed, dict):
            raise ReaderVerifierError("verifier returned malformed response")
        return parsed


def reader_verifier_config_from_env() -> ReaderVerifierConfig | None:
    token = os.environ.get("HIVE_VERIFIER_TOKEN", "").strip()
    if not token:
        return None
    port = os.environ.get("HIVE_VERIFIER_PORT", "4319").strip()
    base = os.environ.get("HIVE_VERIFIER_URL", f"http://127.0.0.1:{port}").strip().rstrip("/")
    timeout_raw = os.environ.get("HIVE_VERIFIER_TIMEOUT_SECONDS", "15").strip()
    try:
        timeout = float(timeout_raw)
    except ValueError as exc:
        raise ReaderVerifierError("invalid HIVE_VERIFIER_TIMEOUT_SECONDS") from exc
    if timeout <= 0:
        raise ReaderVerifierError("invalid HIVE_VERIFIER_TIMEOUT_SECONDS")
    return ReaderVerifierConfig(base_url=base, token=token, timeout_seconds=timeout)


def _evidence_payload(evidence: list[SourceEvidence]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for ev in evidence:
        item: dict[str, Any] = {
            "sourceDocumentId": ev.sourceDocumentId,
            "page": ev.page,
            "quote": ev.quote,
        }
        if ev.spanStart is not None:
            item["spanStart"] = ev.spanStart
        if ev.spanEnd is not None:
            item["spanEnd"] = ev.spanEnd
        out.append(item)
    return out


class ReaderVerifierClient:
    def __init__(
        self,
        config: ReaderVerifierConfig,
        transport: ReaderVerifierTransport | None = None,
    ) -> None:
        self._config = config
        self._transport = transport or UrllibReaderVerifierTransport()

    def verify_fact(
        self,
        *,
        case_id: str,
        user_id: str,
        fact: CandidateFactDraft,
        verification_status: str | None = None,
    ) -> ReaderVerifierResult:
        body = {
            "caseId": case_id,
            "userId": user_id,
            "evidence": _evidence_payload(fact.evidence),
        }
        if verification_status is not None:
            body["verificationStatus"] = verification_status

        url = f"{self._config.base_url}/verifier/reader-fact"
        parsed = self._transport.post_json(
            url=url,
            token=self._config.token,
            body=body,
            timeout_seconds=self._config.timeout_seconds,
        )

        accepted = parsed.get("accepted")
        reasons_raw = parsed.get("reasons")
        verified_raw = parsed.get("verifiedEvidence")

        if not isinstance(accepted, bool) or not isinstance(reasons_raw, list):
            raise ReaderVerifierError("verifier returned malformed response")

        reasons = [str(r) for r in reasons_raw]
        verified: list[dict[str, Any]] = []
        if isinstance(verified_raw, list):
            verified = [item for item in verified_raw if isinstance(item, dict)]

        if accepted and not verified:
            raise ReaderVerifierError("verifier accepted without verified evidence")

        return ReaderVerifierResult(
            accepted=accepted,
            reasons=reasons,
            verified_evidence=verified,
        )
