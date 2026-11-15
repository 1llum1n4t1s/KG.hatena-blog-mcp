import { AtomPubError } from "../atompub/errors.js";

export interface ToolTextResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export interface ToolErrorMeta {
  operation: string;
  requestId?: string | undefined;
}

/**
 * Wrap a JSON-serialisable payload as an MCP tool result.
 *
 * `structuredContent` is the machine-readable channel; the text content
 * carries the same JSON so clients that don't support structuredContent yet
 * (or that display tool output as plain text) still show something useful.
 */
export function ok(payload: Record<string, unknown>): ToolTextResult {
  const text = JSON.stringify(payload, null, 2);
  return {
    content: [{ type: "text", text }],
    structuredContent: payload,
  };
}

/**
 * Map an AtomPubError to a user-facing Japanese message (as specified in the
 * tool spec). The raw response body and stack trace are intentionally dropped
 * from the client-facing result and logs. Operators receive only structured,
 * sanitised metadata suitable for correlation.
 */
export function toolError(
  err: unknown,
  meta: ToolErrorMeta = { operation: "unknown" },
): ToolTextResult {
  const log: Record<string, unknown> = {
    tag: "tool-error",
    operation: meta.operation,
    category: err instanceof AtomPubError ? err.code : "unexpected",
  };
  if (meta.requestId !== undefined) log.requestId = meta.requestId;
  if (err instanceof AtomPubError && err.status > 0) log.status = err.status;
  if (err instanceof Error) log.errorName = err.name;
  console.error(JSON.stringify(log));

  const message = formatErrorMessage(err);
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

function formatErrorMessage(err: unknown): string {
  if (err instanceof AtomPubError) {
    switch (err.code) {
      case "unauthorized":
        return "Authentication failed. Check your API key.";
      case "forbidden":
        return "The operation is not permitted (403).";
      case "not_found":
        return "The resource was not found (404).";
      case "rate_limited":
        return "Rate limit reached. Wait a while and try again.";
      case "server_error":
        return `The Hatena API returned a server error (${err.status}).`;
      case "bad_request":
        return `The request is invalid (${err.status}).`;
      case "parse_error":
        return "Failed to parse the AtomPub response.";
      case "network_error":
        return "Could not connect to the Hatena API.";
      default:
        return `The Hatena API returned an error (${err.status}).`;
    }
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
