# HubSpot contact-form agent demo

A small agent that triages contact-form submissions for a web design and marketing agency. For each submission it decides whether the sender is a lead, an existing client with a question, or spam. It then creates or updates the contact in HubSpot, leaves a note, adds a follow-up task for leads, and writes a reply draft that a person approves or rejects in the terminal. **The agent never sends anything.**

It is plain TypeScript with a hand-written tool loop: no agent framework. Claude is reached through [OpenRouter](https://openrouter.ai) using the OpenAI SDK.

All data in this demo is fictional. The agency name, people, companies and email addresses are invented (the `.example.com` addresses cannot receive mail), and any resemblance to a real business is a coincidence.

## What happens to each submission

| Category | HubSpot | Reply draft |
| --- | --- | --- |
| **Lead** | Contact created (marked as a lead) or updated, a note with the request, and a follow-up task due the day after the agent runs | Yes, for you to approve |
| **Support** | Contact found by email and updated, or created if unknown, plus a note with the request | Yes, for you to approve |
| **Spam** | Nothing is written | None |

The email address identifies the contact, so running the same file twice does not create duplicates.

In the terminal you see each draft and answer `y` or `n`:

```text
--- Draft for case-01 (lead) to Daniel Ortiz <daniel@ortizbiketours.example.com> ---
Subject: Re: Your website enquiry

Hi Daniel,

Thank you for getting in touch, and for telling us about Ortiz Bike Tours. A modern
website with online booking sounds like a great fit for what we do ...

Approve this reply? Nothing is sent either way. (y/n)
```

An approved draft is saved as a note on the contact, marked "Approved reply (not sent)". A rejected draft leaves no trace. At the end you get a summary:

```text
Summary
case-01  lead     HubSpot: contact created, note, task, approved reply note  |  reply: approved
case-02  support  HubSpot: contact updated, note, approved reply note  |  reply: approved
case-04  spam     HubSpot: nothing written  |  reply: n/a
...
Totals: submissions: 10 · leads: 4 · support: 3 · spam: 3 · failed: 0 · replies: 7 approved, 0 rejected
```

## What the agent can and cannot do

The model only has five tools: `classify`, `save_contact`, `add_note`, `create_task` and `propose_draft`. There is no tool that deletes or edits records destructively, and nothing that sends email.

- **Submissions are untrusted.** The sender's text is passed to the model inside `<submission>` tags, and the agent escapes any attempt to close the tag. The sample file includes a message that tells the agent to ignore its instructions and delete every contact; in testing the model classified it as spam and nothing was written.
- **Rules live in code, not only in the prompt.** Spam can never be written to HubSpot, tasks are only created for leads, and a tool call outside the list is refused without touching HubSpot.
- **One failure does not stop the batch.** If HubSpot or OpenRouter fails on a case, that case is marked as failed and the rest are processed. Credential errors (401/403) say that retrying will not help; temporary ones say to try again.
- **Replies do not invent commitments.** The agent is told not to state prices, timelines or promises. In a test run, the draft for a sender who asked whether their $500 budget was enough proposed a call and stated no price.

## What you need

- Node 24 (tested on 24.1; the agent runs TypeScript directly, with no build step) and [pnpm](https://pnpm.io)
- An [OpenRouter](https://openrouter.ai) account with some credit
- A HubSpot account (the free plan works)

## 1. Set up

```bash
pnpm install
cp .env.example .env.local   # then fill in both values
```

| Variable | Purpose |
| --- | --- |
| `OPENROUTER_API_KEY` | Your OpenRouter API key |
| `HUBSPOT_TOKEN` | A HubSpot service key (next section) |

## 2. HubSpot credential

Create a [service key](https://developers.hubspot.com/blog/hubspot-service-keys-the-right-api-credential-for-data-integrations) in HubSpot (Settings > Integrations > Service Keys) with only these scopes:

| Scope | Used for |
| --- | --- |
| `crm.objects.contacts.read` | finding a contact by email |
| `crm.objects.contacts.write` | creating and updating contacts, and adding notes and tasks to them |

Notes and tasks have no scope of their own in the scope picker. With these two scopes, the full flow worked against a real account: search, create, update, and notes and tasks associated to the contact. The key can still archive records through HubSpot's API, so the agent's protection is that it has no delete tool, not that the key cannot delete.

## 3. Run it

```bash
pnpm start                      # processes cases/contact-forms.json
pnpm start path/to/cases.json   # or your own file
```

This writes contacts, notes and tasks to the HubSpot account that `HUBSPOT_TOKEN` belongs to, and spends OpenRouter credit. In one measured run, the ten sample cases made 36 model calls and cost about $0.19 with Claude Sonnet 5.5; prices change, so check OpenRouter's current rates.

The sample cases are described in [`cases/README.md`](cases/README.md), including the file format. They use the same fictional contacts as the [HubSpot MCP demo](https://github.com/jcortes/hubspot-mcp-demo); load that demo's data first if you want to see existing contacts being updated. If those contacts are not in your account, the agent simply creates them.

The model is set in one place, the `MODEL` constant in `src/agent.ts` (`anthropic/claude-sonnet-5.5`). OpenRouter can route to other models, but this demo was only tested with that one.

## Tests

```bash
pnpm test
pnpm typecheck
```

The tests run the whole agent from its entry point, the same way the terminal command does. The model and HubSpot are both simulated at the network boundary, so they need no internet, no OpenRouter key and no HubSpot account. The model's replies are scripted, so a test can check exactly what the agent sends to HubSpot and what it shows for approval. To add a scenario, script the model's tool calls and assert on the requests that reach HubSpot.

`pnpm manual-check` is the separate check against real accounts: it verifies both credentials and then runs the sample cases with approval in the terminal. `pnpm manual-check --preflight` only verifies the credentials.

## What this demo does not include

- **Sending the reply.** Approving a draft records it in HubSpot; nothing is emailed. Connecting an email provider is the natural next step.
- **A live form.** Submissions come from a JSON file. Receiving them from a real website form (a webhook) and hosting the agent are not included.
- **Editing a draft** before approving it. You approve or reject as written.
- **The Claude Agent SDK.** This demo uses a short hand-written loop. For a larger engagement with more tools and longer tasks, the Agent SDK is an option.

## License

MIT
