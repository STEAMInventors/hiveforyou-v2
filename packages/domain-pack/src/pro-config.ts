export type ProViewWeights = {
  briefBase: number;
  briefPerSignal: number;
  sideBase: number;
  sidePerChange: number;
  trendsPerSeries: number;
  trendsPerGap: number;
  ledgerBase: number;
  ledgerPerFact: number;
};

export type ProExportExample = {
  q: string;
  sql: string;
  kw: string[];
};

export type ProPackConfig = {
  viewWeights: ProViewWeights;
  exportExamples: ProExportExample[];
};

export const DEFAULT_PRO_VIEW_WEIGHTS: ProViewWeights = {
  briefBase: 3,
  briefPerSignal: 1,
  sideBase: 2,
  sidePerChange: 0.5,
  trendsPerSeries: 2,
  trendsPerGap: 1.5,
  ledgerBase: 1,
  ledgerPerFact: 1 / 40,
};

export function genericProConfig(examples: ProExportExample[] = []): ProPackConfig {
  return {
    viewWeights: { ...DEFAULT_PRO_VIEW_WEIGHTS },
    exportExamples: examples,
  };
}
