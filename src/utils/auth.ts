import { Buffer } from "node:buffer";

export interface BasicCredentials {
  /** `Basic base64(user:pass)` — ready to paste into an outbound Authorization header. */
  authHeader: string;
  /** Hatena ID (the username portion of the Basic header). */
  hatenaId: string;
}

export interface HatenaEnvironment {
  HATENA_ID?: string | undefined;
  HATENA_API_KEY?: string | undefined;
}

export class MissingCredentialsError extends Error {
  constructor(message = "HATENA_ID and HATENA_API_KEY environment variables are required") {
    super(message);
    this.name = "MissingCredentialsError";
  }
}

export function createBasicCredentials(
  hatenaIdValue: string | null | undefined,
  apiKeyValue: string | null | undefined,
): BasicCredentials {
  const hatenaId = hatenaIdValue?.trim() ?? "";
  const apiKey = apiKeyValue?.trim() ?? "";
  if (!hatenaId || !apiKey) throw new MissingCredentialsError();

  const encoded = Buffer.from(`${hatenaId}:${apiKey}`, "utf8").toString("base64");
  return { authHeader: `Basic ${encoded}`, hatenaId };
}

export function credentialsFromEnvironment(env: HatenaEnvironment = process.env): BasicCredentials {
  return createBasicCredentials(env.HATENA_ID, env.HATENA_API_KEY);
}
