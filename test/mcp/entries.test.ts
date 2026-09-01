import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import type { Entry } from "../../src/atompub/types.js";
import type { ToolContext } from "../../src/mcp/context.js";
import {
  applyAutoEyecatch,
  createEntryHandler,
  deleteEntryHandler,
  entryView,
  getEntryHandler,
  listEntriesHandler,
  mergeEntry,
  registerEntryTools,
  updateEntryHandler,
} from "../../src/mcp/tools/entries.js";
import { MAX_CONTENT_CHARS } from "../../src/utils/limits.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, "../fixtures");
const readFixture = (name: string) => readFileSync(resolve(fixturesDir, name), "utf-8");

const creds = {
  authHeader: "Basic ZXhhbXBsZV91c2VyOnNlY3JldA==",
  hatenaId: "example_user",
};

type RecordedCall = { url: string; method: string; body?: string };

function makeCtx(plan: Array<Response | Error>): { ctx: ToolContext; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  let i = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const body = typeof init?.body === "string" ? init.body : undefined;
    calls.push({
      url,
      method: init?.method ?? "GET",
      ...(body !== undefined ? { body } : {}),
    });
    const step = plan[i];
    i += 1;
    if (!step) throw new Error(`fetchSpy exhausted (call ${i})`);
    if (step instanceof Error) throw step;
    return step;
  };
  return {
    ctx: { credentials: creds, fetchImpl, retry: { maxRetries: 0, baseDelayMs: 0 } },
    calls,
  };
}

const baseEntry: Entry = {
  id: "3000000000000000010",
  atomId: "tag:...",
  title: "元タイトル",
  authorName: "example_user",
  content: "元本文",
  contentType: "text/x-markdown",
  categories: ["技術"],
  control: { draft: false, preview: false, scheduled: false },
  updated: "2026-04-18T10:15:00+09:00",
  published: "2026-04-18T10:15:00+09:00",
  edited: "2026-04-18T10:15:00+09:00",
  url: "https://example_user.hatenablog.com/entry/2026/04/18/101500",
  customUrl: "oldslug",
};

describe("applyAutoEyecatch", () => {
  it("本文先頭に識別済みの画像ブロックを追加する", () => {
    const result = applyAutoEyecatch(
      "本文",
      "https://example.com/cover.png?width=1200&format=webp",
    );

    expect(result).toContain("<!-- hatena-blog-mcp:auto-eyecatch:start -->");
    expect(result).toContain('src="https://example.com/cover.png?width=1200&amp;format=webp"');
    expect(result.endsWith("本文")).toBe(true);
  });

  it("再指定時は以前追加した画像ブロックを置換する", () => {
    const first = applyAutoEyecatch("本文", "https://example.com/first.png");
    const second = applyAutoEyecatch(first, "https://example.com/second.png");

    expect(second).not.toContain("first.png");
    expect(second).toContain("second.png");
    expect(second.match(/hatena-blog-mcp:auto-eyecatch:start/g)).toHaveLength(1);
    expect(second.endsWith("本文")).toBe(true);
  });

  it("HTTP(S)以外と認証情報入りURLを拒否する", () => {
    expect(() => applyAutoEyecatch("本文", "data:image/png;base64,AAAA")).toThrow(
      "http または https",
    );
    expect(() => applyAutoEyecatch("本文", "https://user:secret@example.com/cover.png")).toThrow(
      "認証情報を含まない",
    );
  });

  it("画像ブロック追加後の本文上限を検証する", () => {
    expect(() =>
      applyAutoEyecatch("x".repeat(MAX_CONTENT_CHARS), "https://example.com/cover.png"),
    ).toThrow("本文が最大");
  });
});

describe("mergeEntry", () => {
  it("categoriesのみを更新しても他のフィールドは既存値を保持する (DoD)", () => {
    const payload = mergeEntry(baseEntry, { categories: ["新カテゴリ"] });
    expect(payload.title).toBe("元タイトル");
    expect(payload.content).toBe("元本文");
    expect(payload.categories).toEqual(["新カテゴリ"]);
    expect(payload.contentType).toBe("text/x-markdown");
    expect(payload.control).toEqual({ draft: false, preview: false, scheduled: false });
    // updated は touch_updated=true のときだけ送る
    expect(payload.updated).toBeUndefined();
    // customUrl は patch で明示しない限り送らない (既存slugを保つため)
    expect(payload.customUrl).toBeUndefined();
  });

  it("content_typeは常に既存エントリの値を使う (patch側では指定できない)", () => {
    const entry: Entry = { ...baseEntry, contentType: "text/x-hatena-syntax" };
    const payload = mergeEntry(entry, { title: "改題" });
    expect(payload.contentType).toBe("text/x-hatena-syntax");
  });

  it("touch_updated=true のときだけ updated を現在時刻で送る", () => {
    const before = Date.now();
    const payload = mergeEntry(baseEntry, { touchUpdated: true });
    const after = Date.now();
    expect(payload.updated).toBeDefined();
    const ts = Date.parse(payload.updated as string);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("custom_url を明示したときのみ customUrl を送る", () => {
    const without = mergeEntry(baseEntry, {});
    expect(without.customUrl).toBeUndefined();
    const withSlug = mergeEntry(baseEntry, { customUrl: "newslug" });
    expect(withSlug.customUrl).toBe("newslug");
  });

  it("空配列のcategoriesで明示的にカテゴリを空にできる", () => {
    const payload = mergeEntry(baseEntry, { categories: [] });
    expect(payload.categories).toEqual([]);
  });

  it("draft/preview は既存値にマージされる", () => {
    const payload = mergeEntry(baseEntry, { draft: true });
    expect(payload.control?.draft).toBe(true);
    expect(payload.control?.preview).toBe(false);
    expect(payload.control?.scheduled).toBe(false);
  });

  it("GETにscheduledがない場合はfalseを補わず更新payloadでも省略する", () => {
    const { scheduled: _scheduled, ...control } = baseEntry.control;
    const payload = mergeEntry({ ...baseEntry, control }, { title: "改題" });

    expect(payload.control).toEqual({ draft: false, preview: false });
    expect(payload.control?.scheduled).toBeUndefined();
  });

  it("eyecatchImageUrl だけでも既存本文へ先頭画像を追加する", () => {
    const payload = mergeEntry(baseEntry, {
      eyecatchImageUrl: "https://example.com/cover.png",
    });

    expect(payload.content).toContain("hatena-blog-mcp:auto-eyecatch:start");
    expect(payload.content).toContain("https://example.com/cover.png");
    expect(payload.content).toContain("元本文");
  });
});

describe("entryView", () => {
  it("include_html=false のとき formatted_content を含めない", () => {
    const entry: Entry = { ...baseEntry, formattedContent: "<p>rendered</p>" };
    const view = entryView(entry, false);
    expect(view.formatted_content).toBeUndefined();
    expect(view.content).toBe("元本文");
  });

  it("include_html=true のとき formatted_content を含める", () => {
    const entry: Entry = { ...baseEntry, formattedContent: "<p>rendered</p>" };
    const view = entryView(entry, true);
    expect(view.formatted_content).toBe("<p>rendered</p>");
  });

  it("atomIdやeditUrlはビューに含まれない (内部フィールド)", () => {
    const view = entryView(baseEntry, false);
    expect(view.atomId).toBeUndefined();
    expect(view.editUrl).toBeUndefined();
  });
});

describe("listEntriesHandler", () => {
  it("ブログIDでURLを組み立てフィードを返す", async () => {
    const { ctx, calls } = makeCtx([new Response(readFixture("entry-list.xml"), { status: 200 })]);
    const res = await listEntriesHandler({ blog_id: "example_user.hatenablog.com" }, ctx);
    expect(res.isError).toBeUndefined();
    expect(res.structuredContent?.entries).toBeDefined();
    expect(calls[0]?.url).toContain("/atom/entry");
  });

  it("page トークンを渡すとクエリに付与される", async () => {
    const { ctx, calls } = makeCtx([new Response(readFixture("entry-list.xml"), { status: 200 })]);
    await listEntriesHandler({ blog_id: "example_user.hatenablog.com", page: "1377584217" }, ctx);
    expect(calls[0]?.url).toContain("?page=1377584217");
  });

  it("AtomPubエラーは isError:true で日本語メッセージを返す", async () => {
    const { ctx } = makeCtx([new Response("nope", { status: 401 })]);
    const res = await listEntriesHandler({ blog_id: "example_user.hatenablog.com" }, ctx);
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toContain("認証");
  });
});

describe("getEntryHandler", () => {
  it("エントリを1件取得する", async () => {
    const { ctx } = makeCtx([new Response(readFixture("entry-single.xml"), { status: 200 })]);
    const res = await getEntryHandler(
      { blog_id: "example_user.hatenablog.com", entry_id: "3000000000000000010" },
      ctx,
    );
    expect(res.isError).toBeUndefined();
    expect(res.structuredContent?.id).toBe("3000000000000000010");
  });

  it("取得エラーをisErrorへ変換する", async () => {
    const { ctx } = makeCtx([new Response("missing", { status: 404 })]);
    const res = await getEntryHandler(
      { blog_id: "example_user.hatenablog.com", entry_id: "missing" },
      ctx,
    );
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toContain("見つかりません");
  });
});

describe("createEntryHandler", () => {
  it("scheduled=true かつ updated 未指定はエラー", async () => {
    const { ctx } = makeCtx([]);
    const res = await createEntryHandler(
      {
        blog_id: "example_user.hatenablog.com",
        title: "x",
        content: "y",
        scheduled: true,
      },
      ctx,
    );
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toContain("updated");
  });

  it("scheduled=true は updated があっても draft=true でなければ拒否する", async () => {
    const { ctx } = makeCtx([]);
    const res = await createEntryHandler(
      {
        blog_id: "example_user.hatenablog.com",
        title: "x",
        content: "y",
        scheduled: true,
        updated: "2026-08-25T09:00:00+09:00",
      },
      ctx,
    );
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toContain("draft=true");
  });

  it("POSTで新規投稿しエントリを返す", async () => {
    const { ctx, calls } = makeCtx([
      new Response(readFixture("entry-single.xml"), { status: 201 }),
    ]);
    const res = await createEntryHandler(
      {
        blog_id: "example_user.hatenablog.com",
        title: "新規",
        content: "body",
        content_type: "text/x-markdown",
        categories: ["技術"],
      },
      ctx,
    );
    expect(res.isError).toBeUndefined();
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.body).toContain("<title>新規</title>");
    expect(calls[0]?.body).not.toContain("hatena-blog-mcp:auto-eyecatch");
  });

  it("eyecatch_image_url 指定時だけ本文先頭画像をPOSTする", async () => {
    const { ctx, calls } = makeCtx([
      new Response(readFixture("entry-single.xml"), { status: 201 }),
    ]);
    const res = await createEntryHandler(
      {
        blog_id: "example_user.hatenablog.com",
        title: "自動アイキャッチ付き",
        content: "body",
        eyecatch_image_url: "https://example.com/cover.png",
      },
      ctx,
    );

    expect(res.isError).toBeUndefined();
    expect(calls[0]?.body).toContain("hatena-blog-mcp:auto-eyecatch:start");
    expect(calls[0]?.body).toContain("https://example.com/cover.png");
  });
});

describe("updateEntryHandler", () => {
  it("GET→PUT で部分更新する (DoD)", async () => {
    const { ctx, calls } = makeCtx([
      new Response(readFixture("entry-single.xml"), { status: 200 }),
      new Response(readFixture("entry-single.xml"), { status: 200 }),
    ]);
    const res = await updateEntryHandler(
      {
        blog_id: "example_user.hatenablog.com",
        entry_id: "3000000000000000010",
        categories: ["新カテゴリ"],
      },
      ctx,
    );
    expect(res.isError).toBeUndefined();
    expect(calls[0]?.method).toBe("GET");
    expect(calls[1]?.method).toBe("PUT");
    const body = calls[1]?.body ?? "";
    // 送信XMLは既存タイトル・本文を保持しつつカテゴリのみ変わる
    expect(body).toContain("<title>MCPサーバーをCloudflare Workersで書く</title>");
    expect(body).toContain('<category term="新カテゴリ" />');
    expect(body).not.toContain('<category term="技術" />');
    // 部分更新は updated を送らない
    expect(body).not.toContain("<updated>");
    // content_type は既存値を保持
    expect(body).toContain('type="text/x-markdown"');
    expect(body).not.toContain("hatena-blog-mcp:auto-eyecatch");
  });

  it("eyecatch_image_url だけを指定して既存本文へ先頭画像を追加する", async () => {
    const { ctx, calls } = makeCtx([
      new Response(readFixture("entry-single.xml"), { status: 200 }),
      new Response(readFixture("entry-single.xml"), { status: 200 }),
    ]);
    const res = await updateEntryHandler(
      {
        blog_id: "example_user.hatenablog.com",
        entry_id: "3000000000000000010",
        eyecatch_image_url: "https://example.com/updated-cover.png",
      },
      ctx,
    );

    expect(res.isError).toBeUndefined();
    const body = calls[1]?.body ?? "";
    expect(body).toContain("hatena-blog-mcp:auto-eyecatch:start");
    expect(body).toContain("https://example.com/updated-cover.png");
    expect(body).toContain("Cloudflare Workers");
    expect(body).toContain('type="text/x-markdown"');
  });

  it("touch_updated=true のときのみ updated を送る", async () => {
    const { ctx, calls } = makeCtx([
      new Response(readFixture("entry-single.xml"), { status: 200 }),
      new Response(readFixture("entry-single.xml"), { status: 200 }),
    ]);
    await updateEntryHandler(
      {
        blog_id: "example_user.hatenablog.com",
        entry_id: "3000000000000000010",
        title: "新タイトル",
        touch_updated: true,
      },
      ctx,
    );
    expect(calls[1]?.body).toContain("<updated>");
  });

  it("expected_edited が現在値と異なる場合はPUTせず競合エラーを返す", async () => {
    const { ctx, calls } = makeCtx([
      new Response(readFixture("entry-single.xml"), { status: 200 }),
    ]);
    const res = await updateEntryHandler(
      {
        blog_id: "example_user.hatenablog.com",
        entry_id: "3000000000000000010",
        title: "競合する変更",
        expected_edited: "2026-04-18T09:00:00+09:00",
      },
      ctx,
    );
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toContain("更新競合");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("GET");
  });

  it("expected_edited が現在値と一致する場合はPUTする", async () => {
    const { ctx, calls } = makeCtx([
      new Response(readFixture("entry-single.xml"), { status: 200 }),
      new Response(readFixture("entry-single.xml"), { status: 200 }),
    ]);
    const res = await updateEntryHandler(
      {
        blog_id: "example_user.hatenablog.com",
        entry_id: "3000000000000000010",
        title: "競合なし",
        expected_edited: "2026-04-18T10:15:00+09:00",
      },
      ctx,
    );
    expect(res.isError).toBeUndefined();
    expect(calls[1]?.method).toBe("PUT");
  });
});

describe("deleteEntryHandler", () => {
  it("DELETE を送信し ok:true を返す", async () => {
    const { ctx, calls } = makeCtx([new Response(null, { status: 204 })]);
    const res = await deleteEntryHandler(
      { blog_id: "example_user.hatenablog.com", entry_id: "3000000000000000010" },
      ctx,
    );
    expect(res.isError).toBeUndefined();
    expect(res.structuredContent?.ok).toBe(true);
    expect(calls[0]?.method).toBe("DELETE");
  });
});

describe("registerEntryTools", () => {
  it("登録した5ツールのコールバックを各ハンドラへ接続する", async () => {
    type ToolCallback = (args: Record<string, unknown>) => Promise<unknown>;
    type StringSchema = { safeParse(value: unknown): { success: boolean } };
    type ToolDefinition = {
      inputSchema?: {
        title?: StringSchema;
        content?: StringSchema;
        custom_url?: StringSchema;
        eyecatch_image_url?: StringSchema;
      };
    };
    const callbacks = new Map<string, ToolCallback>();
    const definitions = new Map<string, ToolDefinition>();
    const server = {
      registerTool(name: string, definition: ToolDefinition, callback: ToolCallback) {
        definitions.set(name, definition);
        callbacks.set(name, callback);
      },
    } as unknown as McpServer;
    const { ctx, calls } = makeCtx([
      new Response(readFixture("entry-list.xml"), { status: 200 }),
      new Response(readFixture("entry-single.xml"), { status: 200 }),
      new Response(readFixture("entry-single.xml"), { status: 201 }),
      new Response(readFixture("entry-single.xml"), { status: 200 }),
      new Response(readFixture("entry-single.xml"), { status: 200 }),
      new Response(null, { status: 204 }),
    ]);

    registerEntryTools(server, ctx);

    expect([...callbacks.keys()]).toEqual([
      "list_entries",
      "get_entry",
      "create_entry",
      "update_entry",
      "delete_entry",
    ]);
    const eyecatchSchema = definitions.get("create_entry")?.inputSchema?.eyecatch_image_url;
    expect(eyecatchSchema?.safeParse("https://example.com/cover.png").success).toBe(true);
    expect(eyecatchSchema?.safeParse("not-a-url").success).toBe(false);
    const createSchema = definitions.get("create_entry")?.inputSchema;
    expect(createSchema?.custom_url?.safeParse("").success).toBe(false);
    const updateSchema = definitions.get("update_entry")?.inputSchema;
    expect(updateSchema?.title?.safeParse("").success).toBe(false);
    expect(updateSchema?.custom_url?.safeParse("").success).toBe(false);
    expect(updateSchema?.content?.safeParse("").success).toBe(true);
    await callbacks.get("list_entries")?.({ blog_id: "example_user.hatenablog.com" });
    await callbacks.get("get_entry")?.({
      blog_id: "example_user.hatenablog.com",
      entry_id: "3000000000000000010",
    });
    await callbacks.get("create_entry")?.({
      blog_id: "example_user.hatenablog.com",
      title: "登録経路テスト",
      content: "本文",
    });
    await callbacks.get("update_entry")?.({
      blog_id: "example_user.hatenablog.com",
      entry_id: "3000000000000000010",
      title: "更新経路テスト",
    });
    await callbacks.get("delete_entry")?.({
      blog_id: "example_user.hatenablog.com",
      entry_id: "3000000000000000010",
    });

    expect(calls.map(({ method }) => method)).toEqual([
      "GET",
      "GET",
      "POST",
      "GET",
      "PUT",
      "DELETE",
    ]);
  });
});
