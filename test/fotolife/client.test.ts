import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FotolifeClient } from "../../src/fotolife/client.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "..", "fixtures");
const entryXml = readFileSync(join(fixtures, "fotolife-entry.xml"), "utf8");
const credentials = {
  authHeader: `Basic ${btoa("example_user:api-key")}`,
  hatenaId: "example_user",
};

describe("FotolifeClient", () => {
  it("getImageは末尾の形式文字を除いたedit URLへアクセスする", async () => {
    let url = "";
    const client = new FotolifeClient({
      credentials,
      retry: { maxRetries: 0, baseDelayMs: 0 },
      fetchImpl: async (input) => {
        url = String(input);
        return new Response(entryXml, { status: 200 });
      },
    });
    await client.getImage("20260824010101p");
    expect(url).toBe("https://f.hatena.ne.jp/atom/edit/20260824010101");
  });

  it("uploadImageはPOSTし、記事用記法を返す", async () => {
    let request: { url: string; init?: RequestInit } | undefined;
    const client = new FotolifeClient({
      credentials,
      fetchImpl: async (url, init) => {
        request = { url: String(url), ...(init ? { init } : {}) };
        return new Response(entryXml, { status: 201 });
      },
    });
    const image = await client.uploadImage({
      title: "Sample image",
      contentType: "image/png",
      dataBase64: "aGVsbG8=",
    });
    expect(request?.url).toBe("https://f.hatena.ne.jp/atom/post");
    expect(request?.init?.method).toBe("POST");
    expect(String(request?.init?.body)).toContain("aGVsbG8=");
    expect(image.blogSyntax).toBe("[f:id:example_user:20260824010101p:plain]");
  });

  it("uploadImageのPOST失敗は再送せずnetwork_errorにする", async () => {
    let calls = 0;
    const client = new FotolifeClient({
      credentials,
      retry: { maxRetries: 3, baseDelayMs: 0 },
      fetchImpl: async () => {
        calls += 1;
        throw new Error("network down");
      },
    });
    await expect(
      client.uploadImage({
        title: "Sample image",
        contentType: "image/png",
        dataBase64: "aGVsbG8=",
      }),
    ).rejects.toMatchObject({ code: "network_error" });
    expect(calls).toBe(1);
  });
});
