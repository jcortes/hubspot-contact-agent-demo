import OpenAI from "openai";
import { HubspotError } from "./hubspot.ts";

const isCredentialStatus = (status: number) => status === 401 || status === 403;

export function describeError(error: unknown): string {
  if (error instanceof HubspotError) {
    return isCredentialStatus(error.status)
      ? `HubSpot rejected the credentials (status ${error.status}). Check HUBSPOT_TOKEN and its scopes; retrying will not help.`
      : `HubSpot could not be reached or returned an error (status ${error.status}). Try again in a moment.`;
  }
  if (error instanceof OpenAI.APIError) {
    const { status } = error;
    if (status !== undefined && isCredentialStatus(status)) {
      return `OpenRouter rejected the API key (status ${status}). Check OPENROUTER_API_KEY; retrying will not help.`;
    }
    if (status === 402) {
      return "OpenRouter reports insufficient credits (status 402). Add credits to the account; retrying will not help.";
    }
    if (status === 429) {
      return "OpenRouter rate limit reached (status 429). Try again in a moment.";
    }
    return status === undefined
      ? "OpenRouter could not be reached. Try again in a moment."
      : `OpenRouter returned an error (status ${status}). Try again in a moment.`;
  }
  return error instanceof Error ? error.message : String(error);
}
