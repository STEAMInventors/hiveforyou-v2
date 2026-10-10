from __future__ import annotations

from functools import lru_cache
from pathlib import Path

READER_GOLDEN_ADAPTATION_HEADER = """\
## GOLDEN REFERENCE METHODOLOGY (Reader adaptation)

The following is the full certified golden-reference study methodology (`canonical-study-v4.1`).
Apply it to **candidate fact extraction only** — not to a full canonical-study-proposal/4 response.

Reader scope:
- Output a single JSON object in `extraction_json` with key `candidateFacts` (v4-shaped candidates).
- Do not emit `entities`, `conflicts`, `missingInformation`, or `voiceProposal` arrays.
- Do not perform canonical reconciliation or legal conclusions.
- Omit gaps rather than recording missing-information items as established facts.

See `engine/eval/reports/reader-experiment/GOLDEN_REFERENCE_MAP.md` for preserved vs adapted vs delegated sections.
"""


@lru_cache(maxsize=1)
def load_golden_reference_methodology_body() -> str:
    path = Path(__file__).resolve().parent / "golden_reference_canonical_study_v4.1.md"
    return path.read_text(encoding="utf-8").strip()


def golden_reference_methodology_for_reader() -> str:
    return f"{READER_GOLDEN_ADAPTATION_HEADER.strip()}\n\n{load_golden_reference_methodology_body()}"
