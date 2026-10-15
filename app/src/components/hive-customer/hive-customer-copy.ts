export function hivePossessiveTitle(subjectFirstName: string | null, suffix: string): string {
  const trimmed = subjectFirstName?.trim();
  if (trimmed) {
    return `${trimmed}'s ${suffix}`;
  }
  return `Your ${suffix}`;
}

export function hiveBuildingHeadline(subjectFirstName: string | null): string {
  const trimmed = subjectFirstName?.trim();
  if (trimmed) {
    return `Building ${trimmed}'s hive`;
  }
  return "Building your hive";
}
