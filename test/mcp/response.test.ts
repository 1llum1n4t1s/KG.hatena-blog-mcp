import { describe, expect, it, vi } from "vitest";
import { AtomPubError } from "../../src/atompub/errors.js";
import { toolError } from "../../src/mcp/response.js";

describe("toolError logging", () => {
  it("logs only sanitised structured metadata", () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const secret = "api-key-should-not-appear";
    const error = new AtomPubError(`request failed: ${secret}`, {
      status: 401,
      body: `upstream body ${secret}`,
    });

    const result = toolError(error, { operation: "list_entries", requestId: "ray-123" });

    expect(result.isError).toBe(true);
    expect(errorLog).toHaveBeenCalledOnce();
    const serialized = String(errorLog.mock.calls[0]?.[0]);
    expect(serialized).not.toContain(secret);
    expect(JSON.parse(serialized)).toEqual({
      tag: "tool-error",
      operation: "list_entries",
      category: "unauthorized",
      requestId: "ray-123",
      status: 401,
      errorName: "AtomPubError",
    });
    errorLog.mockRestore();
  });
});
