# ADR-004 — Persist Intelligence

Status: Accepted  
Date: 2026-09-27

## Decision

Store validated Case Intelligence and reuse it. Do not re-invoke models for reopen, navigation, view changes, or Pro unlock alone.

## Why

Cost, latency, consistency, and moat (accumulated intelligence).

## Consequences

- Projections read from canonical store.
- Reprocessing requires explicit triggers (new evidence, new answers, requested analysis).
- Processing runs are versioned for audit.
