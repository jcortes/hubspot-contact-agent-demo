// Manual check against the real services. Not part of the automated tests.
//
//   pnpm manual-check              checks both credentials, then runs the sample cases
//   pnpm manual-check --preflight  only checks both credentials
//
// Running the cases writes contacts, notes and tasks to the HubSpot account
// that HUBSPOT_TOKEN belongs to, and spends OpenRouter credit.
import { describeError } from "../src/errors.ts";
import { findContactByEmail } from "../src/hubspot.ts";
import { main } from "../src/main.ts";
import { terminalApprove } from "../src/terminal.ts";

const preflightOnly = process.argv.includes("--preflight");

async function checkHubspot(): Promise<void> {
  try {
    await findContactByEmail({ email: "preflight-check@example.com" });
    console.log("HubSpot: the token can read and search contacts.");
  } catch (error) {
    console.error(`HubSpot: ${describeError(error)}`);
    process.exit(1);
  }
}

async function checkOpenRouter(): Promise<void> {
  const response = await fetch("https://openrouter.ai/api/v1/key", {
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
  });
  if (!response.ok) {
    const reason =
      response.status === 401 || response.status === 403
        ? `OpenRouter rejected the API key (status ${response.status}). Check OPENROUTER_API_KEY.`
        : `OpenRouter returned status ${response.status}. Try again in a moment.`;
    console.error(`OpenRouter: ${reason}`);
    process.exit(1);
  }
  const { data } = (await response.json()) as {
    data?: { limit_remaining?: number | null };
  };
  const remaining = data?.limit_remaining;
  console.log(
    remaining == null
      ? "OpenRouter: the API key is valid."
      : `OpenRouter: the API key is valid, $${remaining.toFixed(2)} of its limit remaining.`,
  );
}

const missing = ["OPENROUTER_API_KEY", "HUBSPOT_TOKEN"].filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Missing ${missing.join(" and ")}. Copy .env.example to .env.local and fill it in.`);
  process.exit(1);
}

await checkHubspot();
await checkOpenRouter();

if (!preflightOnly) {
  const { approve, close } = terminalApprove({ input: process.stdin, output: process.stdout });
  try {
    await main({ casesPath: "cases/contact-forms.json", approve, print: console.log });
  } finally {
    close();
  }
}
