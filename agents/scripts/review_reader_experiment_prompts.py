#!/usr/bin/env python3
"""Stage 1: assemble A/B prompts, verify shared sections, write prompt-hashes.json (no model calls)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT / "agents" / "src") not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT / "agents" / "src"))

from hive_agents.pack_loader import load_agent_pack
from hive_agents.reader_prompt.assemble import assemble_reader_experiment_prompt
from hive_agents.reader_prompt.constants import PROMPT_VERSION
from hive_agents.reader_prompt.section6_existing_reader import SECTION_6_EXISTING_READER
from hive_agents.reader_prompt.section6_golden_inspired import SECTION_6_GOLDEN_INSPIRED
from hive_agents.reader_prompt.sections_shared import (
    shared_sections_after_checklist,
    shared_sections_before_checklist,
)


def main() -> int:
    pack_path = _REPO_ROOT / "engine" / "domain-packs" / "iep" / "study" / "agents.json"
    pack = load_agent_pack(pack_path)

    assembled_a = assemble_reader_experiment_prompt("golden_inspired", pack=pack)
    assembled_b = assemble_reader_experiment_prompt("existing_reader_structured", pack=pack)

    shared_before = shared_sections_before_checklist()
    shared_after = shared_sections_after_checklist()
    for label, assembled, section_6 in (
        ("A", assembled_a, SECTION_6_GOLDEN_INSPIRED.strip()),
        ("B", assembled_b, SECTION_6_EXISTING_READER.strip()),
    ):
        body = assembled.stable_system_prefix
        if shared_before not in body or shared_after not in body:
            raise SystemExit(f"{label}: missing shared sections in stable prefix")
        if section_6 not in body:
            raise SystemExit(f"{label}: missing section 6 in stable prefix")

    if assembled_a.stable_system_prefix == assembled_b.stable_system_prefix:
        raise SystemExit("A and B stable prefixes must differ (section 6 only)")

    out_dir = _REPO_ROOT / "engine" / "eval" / "reports" / "reader-experiment"
    out_dir.mkdir(parents=True, exist_ok=True)

    hashes_path = out_dir / "prompt-hashes.json"
    hashes_payload = {
        "promptVersion": PROMPT_VERSION,
        "golden_inspired": assembled_a.prompt_sha256,
        "existing_reader_structured": assembled_b.prompt_sha256,
    }
    hashes_path.write_text(json.dumps(hashes_payload, indent=2) + "\n", encoding="utf-8")

    review_path = out_dir / "PROMPT_REVIEW.md"
    review_path.write_text(
        "\n".join(
            [
                "# T3.9 Reader experiment — prompt review",
                "",
                "No document text or student information in this file.",
                "",
                f"- Prompt version: `{PROMPT_VERSION}`",
                f"- Variant A hash: `{assembled_a.prompt_sha256}`",
                f"- Variant B hash: `{assembled_b.prompt_sha256}`",
                "",
                "## Shared sections (1–5, 7–11)",
                "",
                "Byte-identical across A and B (verified by review script).",
                "",
                "## Section 6 — A (golden_inspired)",
                "",
                "```text",
                SECTION_6_GOLDEN_INSPIRED.strip(),
                "```",
                "",
                "## Section 6 — B (existing_reader_structured)",
                "",
                "```text",
                SECTION_6_EXISTING_READER.strip(),
                "```",
                "",
            ]
        ),
        encoding="utf-8",
    )

    print(json.dumps({"hashesPath": str(hashes_path), "reviewPath": str(review_path)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
