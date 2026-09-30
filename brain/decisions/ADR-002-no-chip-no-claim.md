# ADR-002 — No Chip → No Claim

Status: Accepted  
Date: 2026-09-27

## Decision

A claim may enter canonical truth only when linked to appropriate evidence (evidence chip or explicit **USER_RESPONSE** provenance where allowed). **No chip → no claim.**

## Why

Prevents hallucinated facts in Customer and Pro experiences.

## Consequences

- Validation rejects orphan claims.
- UX must not render unvalidated assertions as facts.
- User answers are typed provenance, not fake document chips.
