# ADR-001 — Domain Packs

Status: Accepted  
Date: 2026-09-27

## Decision

All domain-specific knowledge lives in **Domain Packs**. Hive Core remains domain-agnostic.

## Why

Prevents core bloat, enables independent pack certification, and keeps the intelligence flywheel domain-scoped.

## Consequences

- New domains ship as packs, not core forks.
- Core APIs must be pack-driven for validation and vocabulary.
- Learning candidates flow into packs through review, not ad-hoc core edits.
