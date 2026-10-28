import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type DraftForApproval, runAgent } from "../src/run.ts";

process.env.OPENROUTER_API_KEY = "openrouter-test-key";
process.env.HUBSPOT_TOKEN = "hubspot-test-token";

const fixture = (name: string) =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

type Call = { url: URL; init: RequestInit };

let modelCalls: Call[] = [];
let hubspotCalls: Call[] = [];
let modelScript: unknown[] = [];
let hubspot: (call: Call) => unknown = () => ({});

const toolUse = (id: string, name: string, input: unknown) => ({
  id,
  type: "function",
  function: { name, arguments: JSON.stringify(input) },
});

const modelReply = (toolCalls: unknown[], text?: string) => ({
  id: "gen-test",
  object: "chat.completion",
  created: 0,
  model: "anthropic/claude-sonnet-5.5",
  choices: [
    {
      index: 0,
      finish_reason: toolCalls.length > 0 ? "tool_calls" : "stop",
      message: {
        role: "assistant",
        content: text ?? null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      },
    },
  ],
  usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
});

const sentBody = (call: Call) => JSON.parse(call.init.body as string);

beforeEach(() => {
  modelCalls = [];
  hubspotCalls = [];
  modelScript = [];
  hubspot = ({ url }) => {
    if (url.pathname.endsWith("/contacts/search")) return { results: [] };
    return { id: "new-id" };
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = new URL(input instanceof Request ? input.url : input);
      const call = { url, init };
      if (url.host === "openrouter.ai") {
        modelCalls.push(call);
        const next = modelScript.shift();
        if (!next) throw new Error("Unexpected extra model call");
        return Response.json(next);
      }
      if (url.host === "api.hubapi.com") {
        hubspotCalls.push(call);
        return Response.json(hubspot(call));
      }
      throw new Error(`Unexpected request to ${url.host}`);
    }),
  );
});

const leadScript = () => [
  modelReply([toolUse("t1", "classify", { category: "lead", reason: "Asks for a redesign." })]),
  modelReply([
    toolUse("t2", "save_contact", {
      email: "marta@harborcoffee.example.com",
      firstName: "Marta",
      lastName: "Quiroga",
      company: "Harbor Coffee",
    }),
  ]),
  modelReply([
    toolUse("t3", "add_note", { summary: "Wants a website redesign before spring." }),
    toolUse("t4", "create_task", { subject: "Call Marta about the redesign" }),
  ]),
  modelReply([
    toolUse("t5", "propose_draft", {
      subject: "Your website redesign",
      body: "Hi Marta, thanks for reaching out. Could we set up a short call?",
    }),
  ]),
  modelReply([], "Done."),
];

describe("a new lead", () => {
  it("is created in HubSpot with a note, a follow-up task and an approved reply", async () => {
    modelScript = leadScript();
    const approvals: DraftForApproval[] = [];

    const results = await runAgent({
      casesPath: fixture("lead.json"),
      approve: async (draft) => {
        approvals.push(draft);
        return true;
      },
    });

    const writes = hubspotCalls.filter((c) => c.init.method !== undefined);
    const paths = writes.map((c) => `${c.init.method} ${c.url.pathname}`);
    expect(paths).toEqual([
      "POST /crm/v3/objects/contacts/search",
      "POST /crm/v3/objects/contacts",
      "POST /crm/v3/objects/notes",
      "POST /crm/v3/objects/tasks",
      "POST /crm/v3/objects/notes",
    ]);

    const contact = sentBody(writes[1]!);
    expect(contact.properties).toMatchObject({
      email: "marta@harborcoffee.example.com",
      firstname: "Marta",
      lastname: "Quiroga",
      company: "Harbor Coffee",
      lifecyclestage: "lead",
    });

    const note = sentBody(writes[2]!);
    expect(note.properties.hs_note_body).toContain("Wants a website redesign");
    expect(note.properties.hs_note_body).toContain("redesign it before spring");
    expect(note.associations[0].to.id).toBe("new-id");
    expect(note.associations[0].types[0].associationTypeId).toBe(202);

    const task = sentBody(writes[3]!);
    expect(task.properties.hs_task_subject).toBe("Call Marta about the redesign");
    expect(task.properties.hs_timestamp).toBe("2026-10-27T09:00:00.000Z");
    expect(task.associations[0].types[0].associationTypeId).toBe(204);

    expect(approvals).toHaveLength(1);
    expect(approvals[0]).toMatchObject({
      caseId: "case-1",
      category: "lead",
      email: "marta@harborcoffee.example.com",
      subject: "Your website redesign",
    });

    const approvedNote = sentBody(writes[4]!);
    expect(approvedNote.properties.hs_note_body).toContain("Approved reply (not sent)");
    expect(approvedNote.properties.hs_note_body).toContain("Could we set up a short call?");

    expect(results).toEqual([
      {
        id: "case-1",
        category: "lead",
        wrote: ["contact created", "note", "task", "approved reply note"],
        draft: "approved",
      },
    ]);
  });

  it("sends the submission to the model as untrusted data, with each service's own credentials", async () => {
    modelScript = leadScript();

    await runAgent({ casesPath: fixture("lead.json"), approve: async () => true });

    const first = sentBody(modelCalls[0]!);
    expect(modelCalls[0]!.url.pathname).toBe("/api/v1/chat/completions");
    expect(first.model).toBe("anthropic/claude-sonnet-5.5");
    expect(first.messages[0].role).toBe("system");
    expect(first.messages[1].role).toBe("user");
    expect(first.messages[1].content).toContain("<submission>");
    expect(first.messages[1].content).toContain("redesign it before spring");
    expect(first.tools.map((t: { function: { name: string } }) => t.function.name)).toEqual([
      "classify",
      "save_contact",
      "add_note",
      "create_task",
      "propose_draft",
    ]);
    expect(new Headers(modelCalls[0]!.init.headers).get("authorization")).toBe(
      "Bearer openrouter-test-key",
    );
    expect(new Headers(hubspotCalls[0]!.init.headers).get("authorization")).toBe(
      "Bearer hubspot-test-token",
    );
  });
});

