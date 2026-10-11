# Pack-driven Reader prompt preview (offline)

packId: iep
packVersion: 0.3.0-proposed

## iep.plan

- selectedRecordTypes (17): document_header, student, meeting, meeting_participant, eligibility, present_level, measurement, goal, short_term_objective, service, accommodation, placement, assessment_participation, transition, transfer_of_rights, extended_school_year, parent_request
- selectedFieldCount: 91
- packContentSha256: c2baa0439d32496a3110f5388f6048395a9f4c8fdce79b3d0cec36ae6b9a7775
- promptVersion: hive-pack-driven-reader/0.1.0
- outputSchema.topLevelRequired: schemaVersion, packId, packVersion, documentTypeId, sourceDocumentId, recordInstances
- outputSchema.recordTypeIds: document_header, student, meeting, meeting_participant, eligibility, present_level, measurement, goal, short_term_objective, service, accommodation, placement, assessment_participation, transition, transfer_of_rights, extended_school_year, parent_request

### Block A (universal excerpt)
You are a document extraction assistant for HiveForYou Engine 2.

Rules (non-negotiable):
- You receive exactly one source document's page text for evidence. Other documents may appear only as manifest metadata; do not treat them as readable content.
- Extract only what is supported by verbatim quotes on the supplied pages for quoted fields.
- Never invent values, identities, relationships, or leg…

### Block B (pack definition excerpt)
## Domain pack definition (declarative snapshot)
packId: iep
packVersion: 0.3.0-proposed
packContentSha256: c2baa0439d32496a3110f5388f6048395a9f4c8fdce79b3d0cec36ae6b9a7775
promptCompilerVersion: hive-pack-driven-reader/0.1.0
Pack snapshot (requirements, insight checks, plain explainers, vocabulary JSON, and legal conclusions are intentionally omitted from extraction):
{
  "schemaVersion": "hive.domain-pack.proposal/0.3.0",
  "status": "REVIEW_DRAFT_NOT_RUNTIME_COMPATIBLE",
  "manifest": {
    "id": "iep",
    "version": "0.3.0-proposed",
    "name": "Special Education / IEP",
    "jurisdictio…

### Block D (checklist catalog excerpt)
## Document classification and checklist
documentTypeId: iep.plan
resolution: classified
checklistPolicy: look_for_all_listed; never_invent_if_absent; extract_other_pack_records_if_found
unclassifiedPolicy: Unknown documents are read with the generic checklist, never forced into a type, and never counted toward requirements.
checklistRecordTypes (17 records, 91 fields): document_header, student, meeting, meeting_participant, eligibility, present_level, measurement, goal, short_term_objective, service, accommodation, placement, assessment_participation, transition, transfer_of_rights, extended_school_year, parent_request
### Global reading notes
Extract every record in this document type's checklist, including repeats. One table row or one goal is one record. Quote the source text that hold…

### Full stable system prefix length
15249

### Full case user content length
41556

---

## iep.progress

- selectedRecordTypes (4): document_header, student, progress_entry, measurement
- selectedFieldCount: 31
- packContentSha256: c2baa0439d32496a3110f5388f6048395a9f4c8fdce79b3d0cec36ae6b9a7775
- promptVersion: hive-pack-driven-reader/0.1.0
- outputSchema.topLevelRequired: schemaVersion, packId, packVersion, documentTypeId, sourceDocumentId, recordInstances
- outputSchema.recordTypeIds: document_header, student, progress_entry, measurement

### Block A (universal excerpt)
You are a document extraction assistant for HiveForYou Engine 2.

Rules (non-negotiable):
- You receive exactly one source document's page text for evidence. Other documents may appear only as manifest metadata; do not treat them as readable content.
- Extract only what is supported by verbatim quotes on the supplied pages for quoted fields.
- Never invent values, identities, relationships, or leg…

### Block B (pack definition excerpt)
## Domain pack definition (declarative snapshot)
packId: iep
packVersion: 0.3.0-proposed
packContentSha256: c2baa0439d32496a3110f5388f6048395a9f4c8fdce79b3d0cec36ae6b9a7775
promptCompilerVersion: hive-pack-driven-reader/0.1.0
Pack snapshot (requirements, insight checks, plain explainers, vocabulary JSON, and legal conclusions are intentionally omitted from extraction):
{
  "schemaVersion": "hive.domain-pack.proposal/0.3.0",
  "status": "REVIEW_DRAFT_NOT_RUNTIME_COMPATIBLE",
  "manifest": {
    "id": "iep",
    "version": "0.3.0-proposed",
    "name": "Special Education / IEP",
    "jurisdictio…

### Block D (checklist catalog excerpt)
## Document classification and checklist
documentTypeId: iep.progress
resolution: classified
checklistPolicy: look_for_all_listed; never_invent_if_absent; extract_other_pack_records_if_found
unclassifiedPolicy: Unknown documents are read with the generic checklist, never forced into a type, and never counted toward requirements.
checklistRecordTypes (4 records, 31 fields): document_header, student, progress_entry, measurement
### Global reading notes
Extract every record in this document type's checklist, including repeats. One table row or one goal is one record. Quote the source text that holds the record; every quoted field value must appear in that quote. Do not infer absent numbers, identities, relationships or legal conclusions. Report a labelled but empty field as field_present_but_…

### Full stable system prefix length
15249

### Full case user content length
15498

---

## iep.amendment

- selectedRecordTypes (12): document_header, student, amendment_change, present_level, goal, short_term_objective, service, accommodation, placement, assessment_participation, transition, extended_school_year
- selectedFieldCount: 70
- packContentSha256: c2baa0439d32496a3110f5388f6048395a9f4c8fdce79b3d0cec36ae6b9a7775
- promptVersion: hive-pack-driven-reader/0.1.0
- outputSchema.topLevelRequired: schemaVersion, packId, packVersion, documentTypeId, sourceDocumentId, recordInstances
- outputSchema.recordTypeIds: document_header, student, amendment_change, present_level, goal, short_term_objective, service, accommodation, placement, assessment_participation, transition, extended_school_year

### Block A (universal excerpt)
You are a document extraction assistant for HiveForYou Engine 2.

Rules (non-negotiable):
- You receive exactly one source document's page text for evidence. Other documents may appear only as manifest metadata; do not treat them as readable content.
- Extract only what is supported by verbatim quotes on the supplied pages for quoted fields.
- Never invent values, identities, relationships, or leg…

### Block B (pack definition excerpt)
## Domain pack definition (declarative snapshot)
packId: iep
packVersion: 0.3.0-proposed
packContentSha256: c2baa0439d32496a3110f5388f6048395a9f4c8fdce79b3d0cec36ae6b9a7775
promptCompilerVersion: hive-pack-driven-reader/0.1.0
Pack snapshot (requirements, insight checks, plain explainers, vocabulary JSON, and legal conclusions are intentionally omitted from extraction):
{
  "schemaVersion": "hive.domain-pack.proposal/0.3.0",
  "status": "REVIEW_DRAFT_NOT_RUNTIME_COMPATIBLE",
  "manifest": {
    "id": "iep",
    "version": "0.3.0-proposed",
    "name": "Special Education / IEP",
    "jurisdictio…

### Block D (checklist catalog excerpt)
## Document classification and checklist
documentTypeId: iep.amendment
resolution: classified
checklistPolicy: look_for_all_listed; never_invent_if_absent; extract_other_pack_records_if_found
unclassifiedPolicy: Unknown documents are read with the generic checklist, never forced into a type, and never counted toward requirements.
checklistRecordTypes (12 records, 70 fields): document_header, student, amendment_change, present_level, goal, short_term_objective, service, accommodation, placement, assessment_participation, transition, extended_school_year
### Global reading notes
Extract every record in this document type's checklist, including repeats. One table row or one goal is one record. Quote the source text that holds the record; every quoted field value must appear in that quote. Do …

### Full stable system prefix length
15249

### Full case user content length
31949

---

## iep.evaluation.academic

- selectedRecordTypes (4): document_header, student, measurement, evaluation_finding
- selectedFieldCount: 24
- packContentSha256: c2baa0439d32496a3110f5388f6048395a9f4c8fdce79b3d0cec36ae6b9a7775
- promptVersion: hive-pack-driven-reader/0.1.0
- outputSchema.topLevelRequired: schemaVersion, packId, packVersion, documentTypeId, sourceDocumentId, recordInstances
- outputSchema.recordTypeIds: document_header, student, measurement, evaluation_finding

### Block A (universal excerpt)
You are a document extraction assistant for HiveForYou Engine 2.

Rules (non-negotiable):
- You receive exactly one source document's page text for evidence. Other documents may appear only as manifest metadata; do not treat them as readable content.
- Extract only what is supported by verbatim quotes on the supplied pages for quoted fields.
- Never invent values, identities, relationships, or leg…

### Block B (pack definition excerpt)
## Domain pack definition (declarative snapshot)
packId: iep
packVersion: 0.3.0-proposed
packContentSha256: c2baa0439d32496a3110f5388f6048395a9f4c8fdce79b3d0cec36ae6b9a7775
promptCompilerVersion: hive-pack-driven-reader/0.1.0
Pack snapshot (requirements, insight checks, plain explainers, vocabulary JSON, and legal conclusions are intentionally omitted from extraction):
{
  "schemaVersion": "hive.domain-pack.proposal/0.3.0",
  "status": "REVIEW_DRAFT_NOT_RUNTIME_COMPATIBLE",
  "manifest": {
    "id": "iep",
    "version": "0.3.0-proposed",
    "name": "Special Education / IEP",
    "jurisdictio…

### Block D (checklist catalog excerpt)
## Document classification and checklist
documentTypeId: iep.evaluation.academic
resolution: classified
checklistPolicy: look_for_all_listed; never_invent_if_absent; extract_other_pack_records_if_found
unclassifiedPolicy: Unknown documents are read with the generic checklist, never forced into a type, and never counted toward requirements.
checklistRecordTypes (4 records, 24 fields): document_header, student, measurement, evaluation_finding
### Global reading notes
Extract every record in this document type's checklist, including repeats. One table row or one goal is one record. Quote the source text that holds the record; every quoted field value must appear in that quote. Do not infer absent numbers, identities, relationships or legal conclusions. Report a labelled but empty field as fie…

### Full stable system prefix length
15249

### Full case user content length
12301

---
