import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildWsseHeaders } from "../../src/fotolife/wsse.js";

describe("buildWsseHeaders", () => {
  it("Nonce + Created + APIキーのSHA-1でX-WSSEを生成する", async () => {
    const nonce = Uint8Array.from({ length: 20 }, (_, index) => index + 1);
    const created = "2026-08-24T00:00:00Z";
    const apiKey = "api:key";
    const headers = await buildWsseHeaders(
      {
        authHeader: `Basic ${btoa(`example_user:${apiKey}`)}`,
        hatenaId: "example_user",
      },
      { nonce, created },
    );
    const expectedDigest = createHash("sha1")
      .update(Buffer.concat([Buffer.from(nonce), Buffer.from(created + apiKey, "utf8")]))
      .digest("base64");

    expect(headers.Authorization).toBe('WSSE profile="UsernameToken"');
    expect(headers["X-WSSE"]).toContain('Username="example_user"');
    expect(headers["X-WSSE"]).toContain(`PasswordDigest="${expectedDigest}"`);
    expect(headers["X-WSSE"]).toContain(`Nonce="${Buffer.from(nonce).toString("base64")}"`);
    expect(headers["X-WSSE"]).toContain(`Created="${created}"`);
  });
});
