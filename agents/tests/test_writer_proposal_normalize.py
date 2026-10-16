from __future__ import annotations

import pytest

from hive_agents.writer_errors import WriterModelError
from hive_agents.writer_proposal_normalize import normalize_writer_model_proposal_before_validation


def test_normalize_writer_elements_array_to_map() -> None:
    raw = {
        "schemaVersion": "hive-writer-proposal/1",
        "hiveUiTree": {
            "root": "report-root",
            "elements": [
                {"id": "report-root", "type": "ReportRoot", "props": {}, "children": ["a"]},
                {"id": "a", "type": "StorySection", "props": {"sectionId": "intro"}},
            ],
        },
    }
    normalized = normalize_writer_model_proposal_before_validation(raw)
    assert normalized["hiveUiTree"]["elements"] == {
        "report-root": {"type": "ReportRoot", "props": {}, "children": ["a"]},
        "a": {"type": "StorySection", "props": {"sectionId": "intro"}},
    }


def test_normalize_writer_rejects_duplicate_ids() -> None:
    raw = {
        "hiveUiTree": {
            "elements": [
                {"id": "dup", "type": "ReportRoot", "props": {}},
                {"id": "dup", "type": "FactRow", "props": {"claimRef": {"fieldKey": "x"}}},
            ]
        }
    }
    with pytest.raises(WriterModelError) as exc:
        normalize_writer_model_proposal_before_validation(raw)
    assert exc.value.code == "WRITER_PROPOSAL_NORMALIZATION_FAILED"


def test_normalize_writer_passes_map_through() -> None:
    raw = {
        "hiveUiTree": {
            "elements": {"root": {"type": "ReportRoot", "props": {}}},
        }
    }
    assert normalize_writer_model_proposal_before_validation(raw) == raw
