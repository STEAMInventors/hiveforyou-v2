"use client";

import { useCallback, useState } from "react";

import type { ProExportExample } from "@hiveforyou/domain-pack";

import { downloadTextFile } from "@/lib/case-summary/case-summary-pro-presentation";

type ProExportBuilderProps = {
  caseId: string;
  studyRunId: string;
  examples: ProExportExample[];
  caseJson: string;
};

export function ProExportBuilder({ caseId, studyRunId, examples, caseJson }: ProExportBuilderProps) {
  const [request, setRequest] = useState("");
  const [sql, setSql] = useState("");
  const [status, setStatus] = useState<string>("");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);

  const runQuery = useCallback(
    async (querySql: string) => {
      setStatus("Running…");
      const res = await fetch(`/api/case/${caseId}/pro/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studyRunId, sql: querySql }),
      });
      const data = (await res.json()) as {
        columns?: string[];
        rows?: Record<string, unknown>[];
        error?: string;
      };
      if (!res.ok) {
        setStatus(data.error ?? "Query failed");
        setRows([]);
        return;
      }
      setColumns(data.columns ?? []);
      setRows(data.rows ?? []);
      setStatus(`${data.rows?.length ?? 0} row${data.rows?.length === 1 ? "" : "s"}`);
    },
    [caseId, studyRunId],
  );

  const writeQuery = useCallback(async () => {
    const text = request.trim();
    if (!text) {
      return;
    }
    setStatus("Writing query…");
    const res = await fetch(`/api/case/${caseId}/pro/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studyRunId, request: text }),
    });
    const data = (await res.json()) as {
      sql?: string | null;
      unanswerable?: string | null;
      explanation?: string;
    };
    if (data.unanswerable) {
      setStatus(data.unanswerable);
      return;
    }
    if (data.sql) {
      setSql(data.sql);
      setStatus(data.explanation ?? "Query ready");
    }
  }, [caseId, studyRunId, request]);

  const exportCsv = () => {
    if (!rows.length) {
      return;
    }
    const header = columns.join(",");
    const body = rows.map((r) => columns.map((c) => JSON.stringify(r[c] ?? "")).join(",")).join("\n");
    downloadTextFile("hive-export.csv", `${header}\n${body}`, "text/csv");
  };

  const exportJson = () => {
    if (!rows.length) {
      return;
    }
    downloadTextFile("hive-export.json", JSON.stringify(rows, null, 2), "application/json");
  };

  return (
    <section
      id="pro-export-section"
      className="export"
      aria-label="Build an export"
      data-testid="pro-export-section"
    >
      <h2>Build an export</h2>
      <p className="lead">
        Describe the data you need. Hive writes the query, you check it, then run it and download the result.
      </p>
      <div className="askbox">
        <label htmlFor="pro-nl-request" className="sr-only">
          Describe the data you need
        </label>
        <input
          id="pro-nl-request"
          type="text"
          placeholder="Every goal with its target and the page it's on"
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              void writeQuery();
            }
          }}
        />
        <button type="button" className="btn dark" onClick={() => void writeQuery()}>
          Write query
        </button>
      </div>
      <div className="exs">
        {examples.map((ex) => (
          <button
            key={ex.q}
            type="button"
            className="ex"
            onClick={() => {
              setRequest(ex.q);
              setSql(ex.sql);
            }}
          >
            {ex.q}
          </button>
        ))}
      </div>
      {status ? <span className="hint">{status}</span> : null}
      <div className="console">
        <div className="console-top">
          <label htmlFor="pro-sql-editor">Query · read-only, this case only</label>
          <span>Ctrl/⌘ + Enter to run</span>
        </div>
        <textarea
          id="pro-sql-editor"
          spellCheck={false}
          placeholder="SELECT label, display, doc_role, page FROM facts"
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              void runQuery(sql);
            }
          }}
        />
      </div>
      <div className="qrow">
        <span />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn dark" onClick={() => void runQuery(sql)}>
            Run query
          </button>
          <button type="button" className="btn" disabled={!rows.length} onClick={exportCsv}>
            Download CSV
          </button>
          <button type="button" className="btn" disabled={!rows.length} onClick={exportJson}>
            Download JSON
          </button>
        </div>
      </div>
      {rows.length ? (
        <div className="tablewrap res">
          <table>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 100).map((row, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c}>{String(row[c] ?? "")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <details>
        <summary>This case as JSON</summary>
        <pre>{caseJson}</pre>
      </details>
    </section>
  );
}
