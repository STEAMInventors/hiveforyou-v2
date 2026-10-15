"use client";

import type {
  CanonicalStudyReportCustomerBody,
  CanonicalStudyReportFactLine,
} from "@hiveforyou/shared/canonical-study-report-projection";

import { CanonicalStudyReportEvidenceChip } from "./CanonicalStudyReportEvidenceChip";

function assertionLabel(kind: CanonicalStudyReportFactLine["assertionKind"]): string {
  switch (kind) {
    case "derived":
      return "Derived";
    case "classified":
      return "Classified (not verified quote)";
    case "unresolved":
      return "Unresolved";
    default:
      return "Verified quote";
  }
}

function FactRow({ fact }: { fact: CanonicalStudyReportFactLine }) {
  return (
    <li className="rounded-lg border border-customerHive-border bg-white px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-customerHive-on-surface">
            {fact.recordTypeId}.{fact.fieldId}
          </p>
          <p className="mt-1 text-sm text-customerHive-on-surface-variant">{fact.displayText}</p>
        </div>
        <span className="rounded-full bg-customerHive-surface-low px-2 py-0.5 text-xs text-customerHive-on-surface-muted">
          {assertionLabel(fact.assertionKind)}
        </span>
      </div>
      {fact.evidence.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {fact.evidence.map((chip, index) => (
            <CanonicalStudyReportEvidenceChip key={`${chip.claimRef.fieldKey}-${index}`} chip={chip} />
          ))}
        </div>
      ) : null}
    </li>
  );
}

export function CanonicalStudyCustomerReportView({ body }: { body: CanonicalStudyReportCustomerBody }) {
  return (
    <div className="space-y-10" data-testid="canonical-study-customer-report">
      <section>
        <h2 className="mb-4 text-xl font-semibold text-customerHive-on-surface">Your story</h2>
        <div className="space-y-6">
          {body.storySections.map((section) => (
            <article key={section.id} className="rounded-xl border border-customerHive-border bg-customerHive-surface-lowest p-5">
              <h3 className="text-lg font-semibold text-customerHive-on-surface">{section.title}</h3>
              {section.facts.length === 0 ? (
                <p className="mt-2 text-sm text-customerHive-on-surface-muted">
                  No verified quoted facts for this document in the canonical study.
                </p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {section.facts.map((fact) => (
                    <FactRow key={fact.claimRef.fieldKey} fact={fact} />
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      </section>

      {body.importantFacts.length > 0 ? (
        <section>
          <h2 className="mb-4 text-xl font-semibold text-customerHive-on-surface">Important facts</h2>
          <ul className="space-y-3">
            {body.importantFacts.map((fact) => (
              <FactRow key={`important-${fact.claimRef.fieldKey}`} fact={fact} />
            ))}
          </ul>
        </section>
      ) : null}

      {body.changes.length > 0 ? (
        <section>
          <h2 className="mb-4 text-xl font-semibold text-customerHive-on-surface">Changes</h2>
          <ul className="space-y-4">
            {body.changes.map((change) => (
              <li key={change.relationId} className="rounded-lg border border-customerHive-border bg-white p-4">
                <p className="text-sm font-medium text-customerHive-on-surface">
                  {change.fieldId} changed ({change.entityId})
                </p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <FactRow fact={change.left} />
                  <FactRow fact={change.right} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {body.supports.length > 0 ? (
        <section>
          <h2 className="mb-4 text-xl font-semibold text-customerHive-on-surface">Supports & alignment</h2>
          <ul className="space-y-3">
            {body.supports.map((row) => (
              <li key={row.relationId} className="rounded-lg border border-customerHive-border bg-white p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-customerHive-on-surface-muted">
                  {row.label}
                </p>
                <div className="mt-2 grid gap-3 md:grid-cols-2">
                  <FactRow fact={row.left} />
                  <FactRow fact={row.right} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {body.openQuestions.length > 0 ? (
        <section>
          <h2 className="mb-4 text-xl font-semibold text-customerHive-on-surface">Open questions</h2>
          <ul className="space-y-3">
            {body.openQuestions.map((question) => (
              <li key={question.id} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm font-medium text-amber-950">{question.title}</p>
                <p className="mt-1 text-sm text-amber-900">{question.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
