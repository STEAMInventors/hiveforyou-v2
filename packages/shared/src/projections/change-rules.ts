export type PackChangeRule = {
  construct: string;
  changeDetection: "compare" | "ignore";
};

/** First segment of a construct id or pipe-key. */
export function constructRoot(construct: string): string {
  const trimmed = construct.trim();
  const pipe = trimmed.split("|")[0];
  return (pipe ?? trimmed).trim();
}

export function isConstructIgnoredForChange(construct: string, rules: PackChangeRule[]): boolean {
  const root = constructRoot(construct);
  return rules.some(
    (rule) =>
      rule.changeDetection === "ignore" &&
      (rule.construct === construct ||
        rule.construct === root ||
        construct.startsWith(`${rule.construct}|`)),
  );
}
