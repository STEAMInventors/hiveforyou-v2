"use client";



import type {

  RulebookDocumentExplainerView,

  RulebookExplainerSectionView,

} from "@hiveforyou/core/rulebook-explainers";

import { useCallback, useId, useMemo, useState } from "react";



import {
  shouldShowEvidenceChipLabel,
  type CaseSummaryPanelSpec,
} from "@/lib/case-summary/case-summary-evidence";
import { brand } from "@/lib/brand/paths";

import "./hive-document-explainer.css";

function HdeSourceChipMark() {
  return (
    <span className="hde-chip__mark" aria-hidden>
      <img src={brand.mark} alt="" decoding="async" />
    </span>
  );
}



type DrawerState =

  | { kind: "closed" }

  | {

      kind: "term";

      id: string;

      term: string;

      plain: string;

      abbr: string | null;

    }

  | {

      kind: "rule";

      ref: string;

      title: string;

      plain: string;

      chipLabel: string;

    };



function ChevronDown() {

  return (

    <svg className="hde-chev" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>

      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />

    </svg>

  );

}



function ExplainerSection({

  section,

  open,

  onToggle,

  onTerm,

  onRule,

  onOpenPanel,

}: {

  section: RulebookExplainerSectionView;

  open: boolean;

  onToggle: () => void;

  onTerm: (term: { id: string; term: string; plain: string; abbr: string | null }) => void;

  onRule: (rule: { ref: string; title: string; plain: string; chipLabel: string }) => void;

  onOpenPanel: (spec: CaseSummaryPanelSpec) => void;

}) {

  const statusClass =

    section.status === "found"

      ? "hde-s-found"

      : section.status === "partial"

        ? "hde-s-partial"

        : section.status === "later"

          ? "hde-s-later"

          : section.status === "notcaptured"

            ? "hde-s-notcaptured"

            : "hde-s-notcaptured";



  return (

    <section

      id={`explainer-sec-${section.id}`}

      data-testid={`explainer-section-${section.id}`}

      className={open ? "hde-sec hde-sec-open" : "hde-sec"}

    >

      <button type="button" className="hde-sec-head" aria-expanded={open} onClick={onToggle}>

        <span className={`hde-status ${statusClass}`}>{section.statusLabel}</span>

        <span className="tx">

          <span className="k">{section.parentTitle}</span>

          <span className="t">{section.docTitle}</span>

          <span className="sum">{section.summary}</span>

        </span>

        <ChevronDown />

      </button>

      {open ? (

        <div className="hde-sec-body">

          {section.sayRows.length > 0 ? (

            <div className="hde-block">

              <h4>What the plan says</h4>

              <div className="hde-says">

                {section.sayRows.map((row) => (

                  <div key={`${row.label}-${row.value}-${row.sourceLabel}`} className="row">

                    <span>

                      <strong>{row.label}</strong>{" "}

                      <span className="hde-num">{row.value}</span>

                    </span>

                    {shouldShowEvidenceChipLabel(row.sourceLabel) ? (
                      row.claimId ? (
                        <button
                          type="button"
                          className="hde-chip"
                          onClick={() => onOpenPanel({ t: "one", claimId: row.claimId! })}
                        >
                          <HdeSourceChipMark />
                          {row.sourceLabel}
                        </button>
                      ) : (
                        <span className="hde-chip" style={{ cursor: "default" }}>
                          <HdeSourceChipMark />
                          {row.sourceLabel}
                        </span>
                      )
                    ) : null}

                  </div>

                ))}

              </div>

            </div>

          ) : section.emptyMessage ? (

            <p className={`hde-note ${section.status === "notcaptured" ? "missing" : ""}`}>{section.emptyMessage}</p>

          ) : null}



          {section.rules.length > 0 ? (

            <div className="hde-block">

              <h4>What the rules say</h4>

              <div className="hde-rulebox">

                {section.rules.map((rule) => (

                  <p key={rule.ref}>

                    <strong>{rule.title}</strong> — {rule.plain}{" "}

                    <button type="button" className="hde-chip rule" onClick={() => onRule(rule)}>

                      {rule.chipLabel}

                    </button>

                  </p>

                ))}

              </div>

            </div>

          ) : null}



          {section.terms.length > 0 ? (

            <div className="hde-block">

              <h4>Words in this section</h4>

              <div className="hde-basics">

                {section.terms.map((term) => (

                  <button key={term.id} type="button" className="hde-trow" onClick={() => onTerm(term)}>

                    <span className={term.abbr ? "hde-abbr" : "hde-abbr none"}>{term.abbr ?? "—"}</span>

                    <span className="full">{term.term}</span>

                    <span className="def">{term.plain}</span>

                  </button>

                ))}

              </div>

            </div>

          ) : null}



          {section.questions.length > 0 ? (

            <div className="hde-block">

              <h4>Questions to ask</h4>

              <ul className="hde-qs">

                {section.questions.map((q) => (

                  <li key={q}>{q}</li>

                ))}

              </ul>

            </div>

          ) : null}

        </div>

      ) : null}

    </section>

  );

}



export function HiveCaseDocumentExplainerView({

  explainer,

  onOpenPanel,

}: {

  explainer: RulebookDocumentExplainerView;

  onOpenPanel: (spec: CaseSummaryPanelSpec) => void;

}) {

  const baseId = useId();

  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set(["goals", "services"]));

  const [drawer, setDrawer] = useState<DrawerState>({ kind: "closed" });



  const termCatalog = useMemo(() => {

    const map = new Map<string, { id: string; term: string; plain: string; abbr: string | null }>();

    for (const t of explainer.basics) {

      map.set(t.id, t);

    }

    for (const section of explainer.sections) {

      for (const t of section.terms) {

        map.set(t.id, t);

      }

    }

    return map;

  }, [explainer.basics, explainer.sections]);



  const toggleSection = useCallback((id: string) => {

    setOpenSections((prev) => {

      const next = new Set(prev);

      if (next.has(id)) {

        next.delete(id);

      } else {

        next.add(id);

      }

      return next;

    });

  }, []);



  const jumpToSection = useCallback((id: string) => {

    setOpenSections((prev) => new Set(prev).add(id));

    requestAnimationFrame(() => {

      document.getElementById(`explainer-sec-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

    });

  }, []);



  const closeDrawer = useCallback(() => setDrawer({ kind: "closed" }), []);



  const counts = explainer.sectionCounts;



  return (

    <>

      <article className="hde-root" data-testid={`hive-doc-explainer-${explainer.logicalDocumentId}`}>

        <header>

          <span className="hde-pill">{explainer.meta.domainPill}</span>

          <h1 className="hde-h1">{explainer.pageTitle}</h1>

          <p className="hde-lead">{explainer.intro}</p>

          <div className="hde-meta">

            {explainer.meta.planPeriod ? (

              <span>

                Plan period: <b>{explainer.meta.planPeriod}</b>

              </span>

            ) : null}

            {explainer.meta.documentDate ? (

              <span>

                Document date: <b>{explainer.meta.documentDate}</b>

              </span>

            ) : null}

            {shouldShowEvidenceChipLabel(explainer.meta.primarySourceLabel) ? (
              <span className="hde-chip" style={{ cursor: "default" }}>
                <HdeSourceChipMark />
                {explainer.meta.primarySourceLabel}
              </span>
            ) : null}

          </div>

        </header>



        {explainer.basics.length > 0 ? (

          <section aria-labelledby={`${baseId}-basics`}>

            <h2 className="hde-h2" id={`${baseId}-basics`}>

              Words you&apos;ll see

            </h2>

            <p className="hde-sub">Tap a term for the full definition and where it comes from in the rules.</p>

            <div className="hde-basics">

              {explainer.basics.map((term) => (

                <button

                  key={term.id}

                  type="button"

                  className="hde-trow"

                  onClick={() =>

                    setDrawer({

                      kind: "term",

                      id: term.id,

                      term: term.term,

                      plain: term.plain,

                      abbr: term.abbr,

                    })

                  }

                >

                  <span className={term.abbr ? "hde-abbr" : "hde-abbr none"}>{term.abbr ?? "—"}</span>

                  <span className="full">{term.term}</span>

                  <span className="def">{term.plain}</span>

                </button>

              ))}

            </div>

          </section>

        ) : null}



        {explainer.dates.length > 0 ? (

          <section aria-labelledby={`${baseId}-dates`}>

            <h2 className="hde-h2" id={`${baseId}-dates`}>

              Dates to know

            </h2>

            <p className="hde-sub">From your documents when Hive captured them; estimates marked when noted.</p>

            <div className="hde-dates">

              {explainer.dates.map((d) => (

                <div key={d.id} className="hde-date">

                  <small>{d.label}</small>

                  <b>{d.value ?? (d.isEstimate ? "Estimate — not in documents yet" : "Not captured yet")}</b>

                  {d.ruleChipLabel && d.ruleRef ? (

                    <button

                      type="button"

                      className="hde-chip rule"

                      style={{ alignSelf: "flex-start", marginTop: 4 }}

                      onClick={() =>

                        setDrawer({

                          kind: "rule",

                          ref: d.ruleRef!,

                          title: d.label,

                          plain: "Federal timeline tied to this date.",

                          chipLabel: d.ruleChipLabel!,

                        })

                      }

                    >

                      {d.ruleChipLabel}

                    </button>

                  ) : null}

                </div>

              ))}

            </div>

          </section>

        ) : null}



        <section className="hde-check" aria-labelledby={`${baseId}-checklist`}>

          <div className="hde-check-top">

            <div>

              <h2 className="hde-h2" id={`${baseId}-checklist`}>

                What&apos;s in this plan

              </h2>

              <p className="hde-sub">Jump to a section. Status reflects what Hive read across your documents.</p>

            </div>

            <div className="hde-counts" aria-label="Section status counts">

              <span>

                <span className="hde-dot hde-d-found" /> {counts.found} found

              </span>

              <span>

                <span className="hde-dot hde-d-partial" /> {counts.partial} partial

              </span>

              <span>

                <span className="hde-dot hde-d-notcaptured" /> {counts.notcaptured + counts.notfound} not captured

              </span>

              {counts.later > 0 ? (

                <span>

                  <span className="hde-dot hde-d-later" /> {counts.later} later

                </span>

              ) : null}

            </div>

          </div>

          <div className="hde-grid">

            {explainer.sections.map((section) => (

              <button key={section.id} type="button" className="hde-jump" onClick={() => jumpToSection(section.id)}>

                <span

                  className={`hde-dot ${

                    section.status === "found"

                      ? "hde-d-found"

                      : section.status === "partial"

                        ? "hde-d-partial"

                        : section.status === "later"

                          ? "hde-d-later"

                          : "hde-d-notcaptured"

                  }`}

                />

                {section.docTitle}

              </button>

            ))}

          </div>

        </section>



        <div className="hde-sections">

          {explainer.sections.map((section) => (

            <ExplainerSection

              key={section.id}

              section={section}

              open={openSections.has(section.id)}

              onToggle={() => toggleSection(section.id)}

              onTerm={(term) => setDrawer({ kind: "term", ...term })}

              onRule={(rule) => setDrawer({ kind: "rule", ...rule })}

              onOpenPanel={onOpenPanel}

            />

          ))}

        </div>



        {explainer.rights.length > 0 ? (

          <section aria-labelledby={`${baseId}-rights`}>

            <h2 className="hde-h2" id={`${baseId}-rights`}>

              Your rights

            </h2>

            <p className="hde-sub">Plain-language reminders from the federal rules — tap a citation for detail.</p>

            <div className="hde-rights">

              {explainer.rights.map((right) => (

                <div key={right.title} className="hde-right">

                  <b>{right.title}</b>

                  <p>{right.plain}</p>

                  {right.rules.length > 0 ? (

                    <div className="hde-chips">

                      {right.rules.map((rule) => (

                        <button

                          key={rule.ref}

                          type="button"

                          className="hde-chip rule"

                          onClick={() => setDrawer({ kind: "rule", ...rule })}

                        >

                          {rule.chipLabel}

                        </button>

                      ))}

                    </div>

                  ) : null}

                </div>

              ))}

            </div>

          </section>

        ) : null}



        <p className="hde-disclaim">{explainer.disclaimer}</p>

      </article>



      {drawer.kind !== "closed" ? (

        <>

          <button type="button" className="hde-scrim" aria-label="Close panel" onClick={closeDrawer} />

          <aside className="hde-drawer" role="dialog" aria-modal="true" aria-labelledby={`${baseId}-drawer-title`}>

            <div className="hde-d-head">

              <div>

                <p className="lab">{drawer.kind === "term" ? "Term" : "Regulation"}</p>

                <h3 id={`${baseId}-drawer-title`}>

                  {drawer.kind === "term" ? drawer.term : drawer.title}

                </h3>

              </div>

              <button type="button" className="hde-x" aria-label="Close" onClick={closeDrawer}>

                ✕

              </button>

            </div>

            <div className="hde-d-body">

              {drawer.kind === "term" && drawer.abbr ? (

                <p className="hde-big">{drawer.abbr}</p>

              ) : null}

              {drawer.kind === "rule" ? (

                <p className="hde-big">{drawer.chipLabel}</p>

              ) : null}

              <p>{drawer.plain}</p>

              {drawer.kind === "term" && termCatalog.has(drawer.id) ? (

                <p className="hde-srcnote">Definitions come from the domain rulebook aligned to IDEA Part 300.</p>

              ) : null}

            </div>

          </aside>

        </>

      ) : null}

    </>

  );

}


