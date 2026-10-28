const BASE_URL = "https://api.hubapi.com";

const CONTACT_PROPERTIES = ["firstname", "lastname", "email", "company"];

const NOTE_TO_CONTACT = 202;
const TASK_TO_CONTACT = 204;

export class HubspotError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`HubSpot request failed with status ${status}`);
    this.status = status;
  }
}

export interface ContactFields {
  firstName?: string;
  lastName?: string;
  company?: string;
}

interface HubspotObject {
  id: string;
  properties: Record<string, string | null | undefined>;
}

async function hubspotFetch<T>(
  path: string,
  { method = "GET", body }: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.HUBSPOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new HubspotError(response.status);
  return (await response.json()) as T;
}

const toProperties = ({ firstName, lastName, company }: ContactFields) => ({
  ...(firstName ? { firstname: firstName } : {}),
  ...(lastName ? { lastname: lastName } : {}),
  ...(company ? { company } : {}),
});

export async function findContactByEmail({
  email,
}: {
  email: string;
}): Promise<{ id: string } | undefined> {
  const { results } = await hubspotFetch<{ results: HubspotObject[] }>(
    "/crm/v3/objects/contacts/search",
    {
      method: "POST",
      body: {
        filterGroups: [
          { filters: [{ propertyName: "email", operator: "EQ", value: email }] },
        ],
        limit: 1,
        properties: CONTACT_PROPERTIES,
      },
    },
  );
  return results[0] ? { id: results[0].id } : undefined;
}

export async function createContact({
  email,
  asLead,
  ...fields
}: ContactFields & { email: string; asLead: boolean }): Promise<{ id: string }> {
  const { id } = await hubspotFetch<{ id: string }>("/crm/v3/objects/contacts", {
    method: "POST",
    body: {
      properties: {
        email,
        ...toProperties(fields),
        ...(asLead ? { lifecyclestage: "lead" } : {}),
      },
    },
  });
  return { id };
}

export async function updateContact({
  contactId,
  ...fields
}: ContactFields & { contactId: string }): Promise<void> {
  const properties = toProperties(fields);
  if (Object.keys(properties).length === 0) return;
  await hubspotFetch(`/crm/v3/objects/contacts/${encodeURIComponent(contactId)}`, {
    method: "PATCH",
    body: { properties },
  });
}

const associateWith = ({
  contactId,
  typeId,
}: {
  contactId: string;
  typeId: number;
}) => [
  {
    to: { id: contactId },
    types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: typeId }],
  },
];

export async function createNote({
  contactId,
  body,
}: {
  contactId: string;
  body: string;
}): Promise<{ id: string }> {
  const { id } = await hubspotFetch<{ id: string }>("/crm/v3/objects/notes", {
    method: "POST",
    body: {
      properties: {
        hs_timestamp: new Date().toISOString(),
        hs_note_body: body,
      },
      associations: associateWith({ contactId, typeId: NOTE_TO_CONTACT }),
    },
  });
  return { id };
}

export async function createTask({
  contactId,
  subject,
  dueDate,
}: {
  contactId: string;
  subject: string;
  dueDate: string;
}): Promise<{ id: string }> {
  const { id } = await hubspotFetch<{ id: string }>("/crm/v3/objects/tasks", {
    method: "POST",
    body: {
      properties: {
        hs_timestamp: `${dueDate}T09:00:00.000Z`,
        hs_task_subject: subject,
        hs_task_status: "NOT_STARTED",
      },
      associations: associateWith({ contactId, typeId: TASK_TO_CONTACT }),
    },
  });
  return { id };
}
