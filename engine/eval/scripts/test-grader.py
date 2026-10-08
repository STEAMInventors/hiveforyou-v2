#!/usr/bin/env python3
"""Acceptance client for the local eval grader (stdlib only). Does not grade."""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_PROPOSAL = (
    REPO_ROOT
    / "engine/eval/golden/_review/l001/l001-golden.v4.json"
)


def main() -> int:
    token = os.environ.get("HIVE_EVAL_TOKEN", "").strip()
    if not token:
        print("HIVE_EVAL_TOKEN is required", file=sys.stderr)
        return 1

    port_raw = os.environ.get("HIVE_EVAL_PORT", "4318").strip()
    try:
        port = int(port_raw)
    except ValueError:
        print(f"Invalid HIVE_EVAL_PORT: {port_raw}", file=sys.stderr)
        return 1

    proposal_path = Path(os.environ.get("HIVE_EVAL_PROPOSAL_PATH", str(DEFAULT_PROPOSAL)))
    if not proposal_path.is_file():
        print(f"Proposal file not found: {proposal_path}", file=sys.stderr)
        return 1

    with proposal_path.open("r", encoding="utf-8") as f:
        proposal = json.load(f)

    body = json.dumps({"caseId": "l001", "proposal": proposal}).encode("utf-8")
    url = f"http://127.0.0.1:{port}/eval/grade"
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        print(f"HTTP {e.code}: {err_body}", file=sys.stderr)
        return 1

    if token in json.dumps(payload):
        print("Response leaked token", file=sys.stderr)
        return 1

    print("score:", payload.get("score"))
    print("metrics:", json.dumps(payload.get("metrics"), sort_keys=True))
    print("feedback:", json.dumps(payload.get("feedback"), sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
