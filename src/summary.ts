import type { CaseResult } from "./run.ts";

const draftLabel = ({ draft, error }: CaseResult) =>
  draft === "none" ? (error ? "failed" : "n/a") : draft;

export function formatSummary(results: CaseResult[]): string[] {
  const idWidth = Math.max(...results.map(({ id }) => id.length), 0);
  const rows = results.map((result) => {
    const writes = result.wrote.length > 0 ? result.wrote.join(", ") : "nothing written";
    return [
      `${result.id.padEnd(idWidth)}  ${(result.category ?? "-").padEnd(7)}`,
      `  HubSpot: ${writes}  |  reply: ${draftLabel(result)}`,
      result.error ? `  |  ERROR: ${result.error}` : "",
    ].join("");
  });

  const count = (predicate: (result: CaseResult) => boolean) =>
    results.filter(predicate).length;
  const totals = [
    `submissions: ${results.length}`,
    `leads: ${count((r) => r.category === "lead")}`,
    `support: ${count((r) => r.category === "support")}`,
    `spam: ${count((r) => r.category === "spam")}`,
    `failed: ${count((r) => r.error !== undefined)}`,
    `replies: ${count((r) => r.draft === "approved")} approved, ${count((r) => r.draft === "rejected")} rejected`,
  ];
  return ["Summary", ...rows, `Totals: ${totals.join(" · ")}`];
}
