import OpenAI from "openai";
import { triage } from "./agent.ts";
import { loadCases, type Submission } from "./cases.ts";
import { createNote } from "./hubspot.ts";
import type { Category, Draft } from "./tools.ts";

export type DraftOutcome = "approved" | "rejected" | "none";

export interface CaseResult {
  id: string;
  category?: Category;
  wrote: string[];
  draft: DraftOutcome;
  error?: string;
}

export interface DraftForApproval extends Draft {
  caseId: string;
  name: string;
  email: string;
  category: Category;
}

export type Approve = (draft: DraftForApproval) => Promise<boolean>;

async function processCase({
  client,
  submission,
  approve,
}: {
  client: OpenAI;
  submission: Submission;
  approve: Approve;
}): Promise<CaseResult> {
  const state = await triage({ client, submission });
  const result: CaseResult = {
    id: submission.id,
    category: state.category,
    wrote: state.wrote,
    draft: "none",
  };
  if (!state.draft || !state.contactId || !state.category) return result;

  const approved = await approve({
    ...state.draft,
    caseId: submission.id,
    name: submission.name,
    email: submission.email,
    category: state.category,
  });
  if (!approved) return { ...result, draft: "rejected" };

  await createNote({
    contactId: state.contactId,
    body: `Approved reply (not sent)\nSubject: ${state.draft.subject}\n\n${state.draft.body}`,
  });
  return { ...result, wrote: [...result.wrote, "approved reply note"], draft: "approved" };
}

export async function runAgent({
  casesPath,
  approve,
}: {
  casesPath: string;
  approve: Approve;
}): Promise<CaseResult[]> {
  const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
  });
  const results: CaseResult[] = [];
  for (const submission of await loadCases(casesPath)) {
    results.push(await processCase({ client, submission, approve }));
  }
  return results;
}
