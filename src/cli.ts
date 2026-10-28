import { main } from "./main.ts";
import { terminalApprove } from "./terminal.ts";

const casesPath = process.argv[2] ?? "cases/contact-forms.json";

const missing = ["OPENROUTER_API_KEY", "HUBSPOT_TOKEN"].filter(
  (name) => !process.env[name],
);
if (missing.length > 0) {
  console.error(`Missing ${missing.join(" and ")}. Copy .env.example to .env.local and fill it in.`);
  process.exit(1);
}

const { approve, close } = terminalApprove({
  input: process.stdin,
  output: process.stdout,
});

try {
  await main({ casesPath, approve, print: console.log });
} catch (error) {
  console.error(`Could not run the agent: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
} finally {
  close();
}
