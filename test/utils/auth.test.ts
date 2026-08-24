import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  createBasicCredentials,
  credentialsFromEnvironment,
  MissingCredentialsError,
} from "../../src/utils/auth.js";

describe("createBasicCredentials", () => {
  it("環境変数の値から上流API用Basic認証を生成する", () => {
    const credentials = createBasicCredentials(" example_user ", " abc:123 ");
    expect(credentials.hatenaId).toBe("example_user");
    expect(Buffer.from(credentials.authHeader.slice(6), "base64").toString("utf8")).toBe(
      "example_user:abc:123",
    );
  });

  it.each([
    [undefined, "key"],
    ["user", undefined],
    ["", "key"],
    ["user", "   "],
  ])("必須値が欠けている場合は拒否する", (hatenaId, apiKey) => {
    expect(() => createBasicCredentials(hatenaId, apiKey)).toThrow(MissingCredentialsError);
  });

  it("返却オブジェクトへAPIキーの平文を保持しない", () => {
    const credentials = createBasicCredentials("user", "super-secret");
    expect(JSON.stringify(credentials)).not.toContain("super-secret");
  });
});

describe("credentialsFromEnvironment", () => {
  it("HATENA_IDとHATENA_API_KEYを読む", () => {
    const credentials = credentialsFromEnvironment({
      HATENA_ID: "env-user",
      HATENA_API_KEY: "env-key",
    });
    expect(credentials.hatenaId).toBe("env-user");
  });
});
