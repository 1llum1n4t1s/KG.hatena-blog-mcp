import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ToolContext } from "../../src/mcp/context.js";
import { getImageHandler, uploadImageHandler } from "../../src/mcp/tools/images.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "..", "fixtures");
const entryXml = readFileSync(join(fixtures, "fotolife-entry.xml"), "utf8");

function makeCtx(responses: Response[]): ToolContext {
  let index = 0;
  return {
    credentials: {
      authHeader: `Basic ${btoa("example_user:api-key")}`,
      hatenaId: "example_user",
    },
    retry: { maxRetries: 0, baseDelayMs: 0 },
    fetchImpl: async () => responses[index++] ?? new Response("missing", { status: 500 }),
  };
}

describe("Fotolife MCP tools", () => {
  it("get_imageはblog_syntaxを返す", async () => {
    const result = await getImageHandler(
      { image_id: "20260824010101p" },
      makeCtx([new Response(entryXml, { status: 200 })]),
    );
    expect(result.structuredContent?.blog_syntax).toBe("[f:id:example_user:20260824010101p:plain]");
  });

  it("upload_imageは投稿結果を返す", async () => {
    const result = await uploadImageHandler(
      { title: "Sample", content_type: "image/png", data_base64: "aGVsbG8=" },
      makeCtx([new Response(entryXml, { status: 201 })]),
    );
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent?.image_url).toContain("20260824010101.png");
  });
});
