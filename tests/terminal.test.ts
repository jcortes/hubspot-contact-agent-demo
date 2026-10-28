import { fileURLToPath } from "node:url";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { loadCases } from "../src/cases.ts";
import { terminalApprove } from "../src/terminal.ts";

const draft = {
  caseId: "case-01",
  name: "Marta Quiroga",
  email: "marta@harborcoffee.example.com",
  category: "lead" as const,
  subject: "Your website redesign",
  body: "Hi Marta, could we set up a short call?",
};

// Answers each prompt as it appears, the way a person at the keyboard would.
const session = (answers: string[]) => {
  const input = new PassThrough();
  const output = new PassThrough();
  let shown = "";
  const pending = [...answers];
  output.on("data", (chunk) => {
    shown += chunk.toString();
    if (chunk.toString().includes("(y/n)")) input.write(`${pending.shift()}\n`);
  });
  return { ...terminalApprove({ input, output }), shown: () => shown };
};

describe("the terminal approval", () => {
  it("shows the draft and approves on yes", async () => {
    const terminal = session(["y"]);

    expect(await terminal.approve(draft)).toBe(true);
    terminal.close();

    const shown = terminal.shown();
    expect(shown).toContain("case-01");
    expect(shown).toContain("Marta Quiroga");
    expect(shown).toContain("Subject: Your website redesign");
    expect(shown).toContain("could we set up a short call?");
    expect(shown).toContain("Nothing is sent either way");
  });

  it("rejects on no", async () => {
    const terminal = session(["n"]);

    expect(await terminal.approve(draft)).toBe(false);
    terminal.close();
  });

  it("asks again until it gets a clear answer", async () => {
    const terminal = session(["maybe", "", "YES"]);

    expect(await terminal.approve(draft)).toBe(true);
    terminal.close();
    expect(terminal.shown().match(/\(y\/n\)/g)).toHaveLength(3);
  });
});

describe("the bundled sample cases", () => {
  it("are valid and tell one story: ten distinct submissions", async () => {
    const cases = await loadCases(
      fileURLToPath(new URL("../cases/contact-forms.json", import.meta.url)),
    );

    expect(cases).toHaveLength(10);
    expect(new Set(cases.map(({ id }) => id)).size).toBe(10);
    expect(new Set(cases.map(({ email }) => email)).size).toBe(10);
    expect(cases.every(({ email }) => email.endsWith(".example.com"))).toBe(true);
  });
});
