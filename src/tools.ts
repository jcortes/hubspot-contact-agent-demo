import type OpenAI from "openai";
import { z } from "zod";
import type { Submission } from "./cases.ts";
import {
  createContact,
  createNote,
  createTask,
  findContactByEmail,
  updateContact,
} from "./hubspot.ts";

export type Category = "lead" | "support" | "spam";

export interface Draft {
  subject: string;
  body: string;
}

export interface CaseState {
  category?: Category;
  contactId?: string;
  draft?: Draft;
  wrote: string[];
}

const Classify = z.object({
  category: z.enum(["lead", "support", "spam"]),
  reason: z.string().describe("One sentence explaining the classification."),
});

const SaveContact = z.object({
  email: z.string().describe("The sender's email address."),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  company: z.string().optional(),
});

const AddNote = z.object({
  summary: z.string().describe("Short summary of what the person asked."),
});

const CreateTask = z.object({
  subject: z.string().describe("Short follow-up task subject."),
});

const ProposeDraft = z.object({
  subject: z.string(),
  body: z.string(),
});

const definitions = [
  {
    name: "classify",
    description:
      "Record the category of the submission. Call it exactly once, before anything else.",
    schema: Classify,
  },
  {
    name: "save_contact",
    description:
      "Create the contact in HubSpot, or update it if a contact with that email already exists.",
    schema: SaveContact,
  },
  {
    name: "add_note",
    description: "Add a note to the saved contact in HubSpot.",
    schema: AddNote,
  },
  {
    name: "create_task",
    description: "Create a follow-up task for the saved contact. Leads only.",
    schema: CreateTask,
  },
  {
    name: "propose_draft",
    description:
      "Propose a reply for a human to review. Nothing is sent until a human approves it.",
    schema: ProposeDraft,
  },
] as const;

export const tools: OpenAI.Chat.ChatCompletionTool[] = definitions.map(
  ({ name, description, schema }) => {
    const { $schema, ...parameters } = z.toJSONSchema(schema);
    return { type: "function", function: { name, description, parameters } };
  },
);

const nextDay = (date: string) => {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
};

export async function executeTool({
  name,
  input,
  state,
  submission,
}: {
  name: string;
  input: unknown;
  state: CaseState;
  submission: Submission;
}): Promise<{ content: string; isError?: boolean }> {
  const definition = definitions.find((tool) => tool.name === name);
  if (!definition) return { content: `Unknown tool: ${name}`, isError: true };

  const parsed = definition.schema.safeParse(input);
  if (!parsed.success) {
    return { content: `Invalid input: ${parsed.error.message}`, isError: true };
  }
  const args = parsed.data as never;

  if (name === "classify") {
    const { category } = Classify.parse(args);
    state.category = category;
    return { content: `Recorded category: ${category}` };
  }

  if (name === "save_contact") {
    const { email, firstName, lastName, company } = SaveContact.parse(args);
    const existing = await findContactByEmail({ email });
    if (existing) {
      await updateContact({ contactId: existing.id, firstName, lastName, company });
      state.contactId = existing.id;
      state.wrote.push("contact updated");
      return { content: `Updated existing contact ${existing.id}` };
    }
    const { id } = await createContact({
      email,
      firstName,
      lastName,
      company,
      asLead: state.category === "lead",
    });
    state.contactId = id;
    state.wrote.push("contact created");
    return { content: `Created contact ${id}` };
  }

  if (!state.contactId) {
    return { content: "Save the contact first.", isError: true };
  }

  if (name === "add_note") {
    const { summary } = AddNote.parse(args);
    await createNote({
      contactId: state.contactId,
      body: `Contact form (${state.category}) from ${submission.name}:\n${summary}\n\nOriginal message:\n${submission.message}`,
    });
    state.wrote.push("note");
    return { content: "Note added." };
  }

  if (name === "create_task") {
    const { subject } = CreateTask.parse(args);
    await createTask({
      contactId: state.contactId,
      subject,
      dueDate: nextDay(submission.submittedAt),
    });
    state.wrote.push("task");
    return { content: "Task created." };
  }

  const draft = ProposeDraft.parse(args);
  state.draft = draft;
  return { content: "Draft saved for human review. Do not send anything." };
}
