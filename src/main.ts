import { type Approve, runAgent } from "./run.ts";
import { formatSummary } from "./summary.ts";

export async function main({
  casesPath,
  approve,
  print,
}: {
  casesPath: string;
  approve: Approve;
  print: (line: string) => void;
}): Promise<void> {
  const results = await runAgent({ casesPath, approve });
  print("");
  for (const line of formatSummary(results)) print(line);
}
