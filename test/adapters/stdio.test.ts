import { describe, expect, it } from "vitest";
import { createStdioServer } from "../../src/adapters/stdio/index.js";
import { MissingCredentialsError } from "../../src/utils/auth.js";

describe("stdio adapter", () => {
  it("環境変数からMCPサーバーを生成する", () => {
    const server = createStdioServer({ HATENA_ID: "user", HATENA_API_KEY: "key" });
    expect(typeof server.connect).toBe("function");
    expect(typeof server.close).toBe("function");
  });

  it("認証用環境変数が欠けている場合は起動しない", () => {
    expect(() => createStdioServer({})).toThrow(MissingCredentialsError);
  });
});
