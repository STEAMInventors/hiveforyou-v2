#!/usr/bin/env python3
"""Assemble architecture prompts, verify §5-only diff, write prompt-hashes.json (no model calls)."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT / "agents" / "src") not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT / "agents" / "src"))

from hive_agents.pack_loader import load_agent_pack
from hive_agents.reader import reader_instructions_from_pack
from hive_agents.reader_prompt.assemble import assemble_reader_architecture_prompt
from hive_agents.reader_prompt.constants import PROMPT_VERSION, READER_ARCHITECTURE_VARIANTS
from hive_agents.reader_prompt.golden_reference import golden_reference_methodology_for_reader
from hive_agents.reader_prompt.sections_shared import (
    SECTION_1_ROLE,
    SECTION_2_OBJECTIVE,
    SECTION_3_TRUSTED_CONTEXT,
    SECTION_4_BOUNDARIES,
    shared_sections_after_checklist,
    shared_sections_before_golden_methodology,
)


def shared_stable_prefix_without_section_five(pack) -> str:
    pack_reader = reader_instructions_from_pack(pack)
    pack_header = (
        f"Domain pack: domainId={pack.domainId} "
        f"domainPackId={pack.domainPackId} domainPackVersion={pack.domainPackVersion}\n\n"
        f"## Domain pack reader instructions\n\n{pack_reader.strip()}"
    )
    return "\n\n".join(
        [
            pack_header,
            SECTION_1_ROLE.strip(),
            SECTION_2_OBJECTIVE.strip(),
            SECTION_3_TRUSTED_CONTEXT.strip(),
            SECTION_4_BOUNDARIES.strip(),
            golden_reference_methodology_for_reader(),
            shared_sections_after_checklist(architecture="parallel_document"),
        ]
    )


def main() -> int:
    pack_path = _REPO_ROOT / "engine" / "domain-packs" / "iep" / "study" / "agents.json"
    pack = load_agent_pack(pack_path)

    assembled_case = assemble_reader_architecture_prompt("case_wide", pack=pack)
    assembled_parallel = assemble_reader_architecture_prompt("parallel_document", pack=pack)

    if assembled_case.prompt_sha256 == assembled_parallel.prompt_sha256:
        raise SystemExit("case_wide and parallel_document stable prefixes must differ (section 5 only)")

    shared_prefix = shared_stable_prefix_without_section_five(pack)
    shared_prompt_sha256 = hashlib.sha256(shared_prefix.encode("utf-8")).hexdigest()

    out_dir = _REPO_ROOT / "engine" / "eval" / "reports" / "reader-experiment"
    out_dir.mkdir(parents=True, exist_ok=True)

    hashes_payload = {
        "promptVersion": PROMPT_VERSION,
        "sharedPromptSha256": shared_prompt_sha256,
        "case_wide_sha256": assembled_case.prompt_sha256,
        "parallel_document_sha256": assembled_parallel.prompt_sha256,
    }
    hashes_path = out_dir / "prompt-hashes.json"
    hashes_path.write_text(json.dumps(hashes_payload, indent=2) + "\n", encoding="utf-8")

    # Variant A baseline (pre–§6): same composer without the §6 checklist block.
    pack_reader = reader_instructions_from_pack(pack)
    pack_header = (
        f"Domain pack: domainId={pack.domainId} "
        f"domainPackId={pack.domainPackId} domainPackVersion={pack.domainPackVersion}\n\n"
        f"## Domain pack reader instructions\n\n{pack_reader.strip()}"
    )
    baseline_prefix = "\n\n".join(
        [
            pack_header,
            shared_sections_before_golden_methodology(architecture="case_wide"),
            golden_reference_methodology_for_reader(),
            shared_sections_after_checklist(architecture="case_wide"),
        ]
    )
    baseline_chars = len(baseline_prefix)
    a2_chars = len(assembled_case.stable_system_prefix)
    baseline_tokens_est = baseline_chars // 4
    a2_tokens_est = a2_chars // 4

    review_path = out_dir / "PROMPT_REVIEW.md"
    review_path.write_text(
        "\n".join(
            [
                "# T3.9 Reader architecture experiment — prompt review",
                "",
                "No document text or student information in this file.",
                "",
                f"- Prompt version: `{PROMPT_VERSION}`",
                f"- Shared prefix (§1–4 + full golden v4.1 + §7–11 parallel §10) SHA-256: `{shared_prompt_sha256}`",
                f"- Variant A baseline (`case_wide` without §6) stable prefix: **{baseline_chars}** chars (~**{baseline_tokens_est}** tokens)",
                f"- Variant A2 (`case_wide` with §6) stable prefix: **{a2_chars}** chars (~**{a2_tokens_est}** tokens); Δ **{a2_chars - baseline_chars}** chars",
                f"- Variant A2 (`case_wide`) SHA-256: `{assembled_case.prompt_sha256}`",
                f"- Variant B (`parallel_document`) SHA-256: `{assembled_parallel.prompt_sha256}`",
                "",
                "Architectures differ in §5 workflow; case_wide adds §6 domain-aware coverage checklist and §10 supplement.",
                "`parallel_document` stable prefix is unchanged when only §6 (case_wide) edits.",
                "",
                f"Golden methodology map: `engine/eval/reports/reader-experiment/GOLDEN_REFERENCE_MAP.md`",
                "",
            ]
        ),
        encoding="utf-8",
    )

    per_arch = {v: assemble_reader_architecture_prompt(v, pack=pack).prompt_sha256 for v in sorted(READER_ARCHITECTURE_VARIANTS)}
    print(json.dumps({"hashesPath": str(hashes_path), "reviewPath": str(review_path), **hashes_payload, "verified": per_arch}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
