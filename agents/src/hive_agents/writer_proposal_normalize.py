from __future__ import annotations

from typing import Any

from hive_agents.writer_errors import WriterModelError


def normalize_writer_model_proposal_before_validation(value: Any) -> Any:
    """
    Convert Writer model output (hiveUiTree.elements array with stable ids) into
    canonical hive-ui-tree/1 (elements map). Map-shaped elements pass through.
    """
    if not isinstance(value, dict):
        return value
    hive_ui_tree = value.get("hiveUiTree")
    if not isinstance(hive_ui_tree, dict):
        return value
    elements = hive_ui_tree.get("elements")
    if not isinstance(elements, list):
        return value

    element_map: dict[str, Any] = {}
    for raw in elements:
        if not isinstance(raw, dict):
            raise WriterModelError(
                "WRITER_PROPOSAL_NORMALIZATION_FAILED",
                message="Writer element entry must be an object.",
            )
        element_id = raw.get("id")
        if not isinstance(element_id, str) or not element_id.strip():
            raise WriterModelError(
                "WRITER_PROPOSAL_NORMALIZATION_FAILED",
                message="Writer element entry requires a non-empty id.",
            )
        if element_id in element_map:
            raise WriterModelError(
                "WRITER_PROPOSAL_NORMALIZATION_FAILED",
                message=f"Duplicate Writer element id {element_id}.",
            )
        element_type = raw.get("type")
        if not isinstance(element_type, str) or not element_type.strip():
            raise WriterModelError(
                "WRITER_PROPOSAL_NORMALIZATION_FAILED",
                message=f"Writer element {element_id} requires type.",
            )
        props = raw.get("props")
        if not isinstance(props, dict):
            raise WriterModelError(
                "WRITER_PROPOSAL_NORMALIZATION_FAILED",
                message=f"Writer element {element_id} requires props object.",
            )
        children = raw.get("children")
        if children is not None:
            if not isinstance(children, list) or any(not isinstance(child, str) for child in children):
                raise WriterModelError(
                    "WRITER_PROPOSAL_NORMALIZATION_FAILED",
                    message=f"Writer element {element_id} children must be string ids when present.",
                )
        canonical_element: dict[str, Any] = {"type": element_type, "props": props}
        if children is not None:
            canonical_element["children"] = children
        element_map[element_id] = canonical_element

    normalized_tree = dict(hive_ui_tree)
    normalized_tree["elements"] = element_map
    normalized = dict(value)
    normalized["hiveUiTree"] = normalized_tree
    return normalized
