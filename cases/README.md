# Contact-form cases

`contact-forms.json` holds the sample submissions the agent processes. Every name, company and email is invented; the `.example.com` addresses cannot receive mail.

The file is a JSON array. Each entry is one submission:

| Field | Required | Description |
|---|---|---|
| `id` | yes | Unique label shown in the final summary (for example `case-01`). |
| `name` | yes | Full name of the sender. |
| `email` | yes | Sender's email. It identifies the HubSpot contact, so running the same file twice does not create duplicates. |
| `company` | no | Sender's company, if the form asked for it. |
| `message` | yes | What the sender wrote. The agent treats it as untrusted text. |
| `submittedAt` | yes | Date received, as `YYYY-MM-DD`. A lead's follow-up task is due the next day. |

```json
[
  {
    "id": "case-01",
    "name": "Daniel Ortiz",
    "email": "daniel@ortizbiketours.example.com",
    "company": "Ortiz Bike Tours",
    "message": "We need a modern website with online booking. Could you help?",
    "submittedAt": "2026-10-26"
  }
]
```

The sample file has ten cases: four leads, three support requests from existing contacts, two spam messages and one prompt-injection attempt. Support cases use the same contacts as the MCP demo; if those are not in your HubSpot account the agent simply creates them.
