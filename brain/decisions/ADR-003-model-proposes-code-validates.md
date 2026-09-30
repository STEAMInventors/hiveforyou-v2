# ADR-003 — Model Proposes, Code Validates

Status: Accepted  
Date: 2026-09-27

## Decision

LLM output is always a **proposal**. **Pack defines** allowed structure; **code validates**; **professionals decide** where human judgment is required.

## Why

Models are replaceable and fallible; validation and packs are the safety layer.

## Consequences

- No direct persistence of raw model JSON as truth.
- Tests target validators and pack rules.
- Professional-decision questions are first-class.
