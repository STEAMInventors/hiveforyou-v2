from __future__ import annotations

import hashlib
from typing import Any, Mapping

from hive_agents.reader import (
    CandidateFact,
    ClaimModality,
    ClaimValue,
    ClaimValueKind,
    ConstructParts,
    SourceEvidence,
)


def _read_non_empty_string(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    return stripped if stripped else None


def pack_value_to_claim_value(value_kind: str, value: object) -> ClaimValue | None:
    if value is None:
        return None

    if isinstance(value, dict) and isinstance(value.get("kind"), str):
        kind = str(value["kind"])
        return ClaimValue(
            kind=kind,  # type: ignore[arg-type]
            textValue=value.get("textValue") if isinstance(value.get("textValue"), str) else None,
            dateValue=value.get("dateValue") if isinstance(value.get("dateValue"), str) else None,
            codeValue=value.get("codeValue") if isinstance(value.get("codeValue"), str) else None,
            entityId=value.get("entityId") if isinstance(value.get("entityId"), str) else None,
            booleanValue=value.get("booleanValue") if isinstance(value.get("booleanValue"), bool) else None,
            numberValue=value.get("numberValue") if isinstance(value.get("numberValue"), (int, float)) else None,
            unit=value.get("unit") if isinstance(value.get("unit"), str) else None,
            periodStart=value.get("periodStart") if isinstance(value.get("periodStart"), str) else None,
            periodEnd=value.get("periodEnd") if isinstance(value.get("periodEnd"), str) else None,
        )

    match value_kind:
        case "text":
            text_value = value if isinstance(value, str) else _read_non_empty_string(
                (value or {}).get("textValue") if isinstance(value, dict) else None
            )
            return ClaimValue(kind="text", textValue=text_value) if text_value else None
        case "date":
            date_value = value if isinstance(value, str) else _read_non_empty_string(
                (value or {}).get("dateValue") if isinstance(value, dict) else None
            )
            return ClaimValue(kind="date", dateValue=date_value) if date_value else None
        case "code":
            code_value = value if isinstance(value, str) else _read_non_empty_string(
                (value or {}).get("codeValue") if isinstance(value, dict) else None
            )
            return ClaimValue(kind="code", codeValue=code_value) if code_value else None
        case "entity_ref":
            entity_id = value if isinstance(value, str) else _read_non_empty_string(
                (value or {}).get("entityId") if isinstance(value, dict) else None
            )
            return ClaimValue(kind="entity_ref", entityId=entity_id) if entity_id else None
        case "boolean":
            if isinstance(value, bool):
                return ClaimValue(kind="boolean", booleanValue=value)
            return None
        case "quantity":
            if isinstance(value, (int, float)) and float(value).is_integer():
                return ClaimValue(kind="quantity", numberValue=float(value), unit=None)
            if isinstance(value, dict):
                number = value.get("numberValue")
                if isinstance(number, (int, float)):
                    unit = value.get("unit")
                    return ClaimValue(
                        kind="quantity",
                        numberValue=float(number),
                        unit=unit if isinstance(unit, str) else None,
                    )
            return None
        case "period":
            if not isinstance(value, dict):
                return None
            period_start = _read_non_empty_string(value.get("periodStart"))
            period_end = _read_non_empty_string(value.get("periodEnd"))
            if period_start and period_end:
                return ClaimValue(
                    kind="period",
                    periodStart=period_start,
                    periodEnd=period_end,
                )
            return None
        case "unknown":
            return ClaimValue(kind="unknown")
        case _:
            return None


def _candidate_id(parts: list[str]) -> str:
    digest = hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()[:12]
    return f"pdr-{digest}"


def pack_extraction_to_candidate_facts(
    *,
    source_document_id: str,
    record_instances: list[Mapping[str, Any]],
) -> list[CandidateFact]:
    out: list[CandidateFact] = []
    for record in record_instances:
        record_type_id = str(record.get("recordTypeId", ""))
        instance_index = record.get("instanceIndex")
        fields = record.get("fields")
        if not isinstance(fields, list):
            continue
        for field in fields:
            if not isinstance(field, dict):
                continue
            missing_state = field.get("missingState")
            evidence_raw = field.get("evidence")
            if missing_state is not None or not isinstance(evidence_raw, dict):
                continue
            value_kind = str(field.get("valueKind", "text"))
            claim_value = pack_value_to_claim_value(value_kind, field.get("value"))
            if claim_value is None:
                continue
            quote = evidence_raw.get("quote")
            page = evidence_raw.get("page")
            ev_doc = evidence_raw.get("sourceDocumentId")
            if not isinstance(quote, str) or not isinstance(page, int) or not isinstance(ev_doc, str):
                continue
            field_id = str(field.get("fieldId", ""))
            measure = f"{record_type_id}.{field_id}"
            fact_id = _candidate_id(
                [
                    source_document_id,
                    record_type_id,
                    str(instance_index),
                    field_id,
                    quote[:80],
                ]
            )
            modality_raw = str(field.get("modality", "observed"))
            modality: ClaimModality = modality_raw  # type: ignore[assignment]
            out.append(
                CandidateFact(
                    id=fact_id,
                    construct=ConstructParts(measure=measure, task=None, administration=None),
                    value=claim_value,
                    modality=modality,
                    evidence=[
                        SourceEvidence(
                            sourceDocumentId=ev_doc,
                            page=page,
                            quote=quote,
                        )
                    ],
                )
            )
    return out
