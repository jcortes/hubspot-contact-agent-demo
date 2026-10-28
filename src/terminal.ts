import { createInterface } from "node:readline/promises";
import type { Approve } from "./run.ts";

const YES = new Set(["y", "yes"]);
const NO = new Set(["n", "no"]);

export function terminalApprove({
  input,
  output,
}: {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
}): { approve: Approve; close: () => void } {
  const rl = createInterface({ input, output });
  const say = (text: string) => output.write(`${text}\n`);

  const approve: Approve = async (draft) => {
    say("");
    say(`--- Draft for ${draft.caseId} (${draft.category}) to ${draft.name} <${draft.email}> ---`);
    say(`Subject: ${draft.subject}`);
    say("");
    say(draft.body);
    say("");
    for (;;) {
      const answer = (await rl.question("Approve this reply? Nothing is sent either way. (y/n) "))
        .trim()
        .toLowerCase();
      if (YES.has(answer)) return true;
      if (NO.has(answer)) return false;
    }
  };

  return { approve, close: () => rl.close() };
}
