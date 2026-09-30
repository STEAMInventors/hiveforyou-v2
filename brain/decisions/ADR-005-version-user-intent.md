# ADR-005 — Version User Intent & Q&A

Status: Accepted  
Date: 2026-09-27

## Decision

Questions, answers, and analysis intent are **first-class versioned data**, with explicit flags for canonical vs analysis vs projection effects.

## Why

Auditability, reproducible Engine 2 runs, and clear separation of truth vs emphasis.

## Consequences

- Intent never overwrites document-derived truth without proper provenance.
- Study contexts bind to Q&A versions.
- UI shows question history where relevant.
