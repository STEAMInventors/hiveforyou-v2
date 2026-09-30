# Intelligence Flywheel

Hive’s moat is **accumulated structured intelligence**, not one model call.

## Three layers

### Case Intelligence (private to case)

Documents, user answers, intent, entities, claims, measurements, relationships, chronology, provenance, conflicts, missingness, derived facts, projections.

### Domain Intelligence (per domain pack)

Concepts, predicates, relationships, expected documents, question patterns, identity/interpretation/currentness/conflict rules, report importance, professional decision templates.

Production cases may produce **Domain Learning Candidates** → review/test/certify → enter pack. **No silent pack mutation from production.**

## V2-001E.1 — Case → observation trail

Every completed study run now also emits **Domain Learning Observations** (structured, de-identified metadata) alongside private Case Intelligence:

```text
Cases → Domain Learning Observations → Learning Candidates → Human Review/Test → Certification → Domain Pack
```

The **question**, **why it was asked** (trigger), **answer version**, **study document set**, and **intelligence lineage** are persisted as first-class history. Observations never directly change certified Domain Packs.

### Hive Intelligence (generic)

When questions are needed, ambiguity representation, evidence/provenance patterns, generic identity resolution, visualization patterns, confidence/validation behavior — **must not become hidden domain logic**.

## Flywheel

```text
More cases
  → more observed patterns
  → more learning candidates
  → stronger certified Domain Packs
  → better questions
  → better canonical analysis
  → better customer/pro experiences
  → more cases
```

Persist and reuse intelligence ([ADR-004](../decisions/ADR-004-persist-intelligence.md)). Keep the frontier model **replaceable**.
