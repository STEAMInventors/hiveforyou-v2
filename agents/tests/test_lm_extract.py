from __future__ import annotations

import json

from hive_agents.pack_driven_reader.lm_extract import try_parse_json_object


def test_try_parse_json_object_accepts_valid_object() -> None:
    payload = {"documentTypeId": "iep.plan", "recordInstances": []}
    parsed = try_parse_json_object(json.dumps(payload))
    assert parsed == payload


def test_try_parse_json_object_extracts_embedded_object() -> None:
    payload = {"documentTypeId": "iep.plan", "recordInstances": []}
    text = f"Here is JSON:\n{json.dumps(payload)}\nThanks."
    parsed = try_parse_json_object(text)
    assert parsed == payload


def test_try_parse_json_object_returns_none_for_malformed() -> None:
    assert try_parse_json_object("not json at all") is None
    assert try_parse_json_object("[1,2,3]") is None
    assert try_parse_json_object("") is None
