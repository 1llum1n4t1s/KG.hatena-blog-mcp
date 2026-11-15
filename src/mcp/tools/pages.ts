import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ContentType, Page, PageWritePayload } from "../../atompub/types.js";
import { MAX_CONTENT_CHARS, MAX_IDENTIFIER_CHARS, MAX_TITLE_CHARS } from "../../utils/limits.js";
import { makeClient, type ToolContext, withRequestSignal } from "../context.js";
import { ok, type ToolTextResult, toolError } from "../response.js";

// ---------------------------------------------------------------------------
// Page view
// ---------------------------------------------------------------------------

export function pageView(page: Page, includeHtml: boolean): Record<string, unknown> {
  const view: Record<string, unknown> = {
    id: page.id,
    title: page.title,
    author: page.authorName,
    content: page.content,
    content_type: page.contentType,
    draft: page.control.draft,
    preview: page.control.preview,
    updated: page.updated,
  };
  if (page.published !== undefined) view.published = page.published;
  if (page.edited !== undefined) view.edited = page.edited;
  if (page.url !== undefined) view.url = page.url;
  if (page.customUrl !== undefined) view.custom_url = page.customUrl;
  if (includeHtml && page.formattedContent !== undefined) {
    view.formatted_content = page.formattedContent;
  }
  return view;
}

// ---------------------------------------------------------------------------
// mergePage — same shape as mergeEntry but without categories/scheduled
// ---------------------------------------------------------------------------

export interface PagePatch {
  title?: string;
  content?: string;
  draft?: boolean;
  preview?: boolean;
  customUrl?: string;
  touchUpdated?: boolean;
}

export function mergePage(existing: Page, patch: PagePatch): PageWritePayload {
  const payload: PageWritePayload = {
    title: patch.title ?? existing.title,
    content: patch.content ?? existing.content,
    control: {
      draft: patch.draft ?? existing.control.draft,
      preview: patch.preview ?? existing.control.preview,
    },
  };
  if (existing.contentType !== undefined) payload.contentType = existing.contentType;
  if (existing.authorName) payload.authorName = existing.authorName;
  if (patch.customUrl !== undefined) {
    payload.customUrl = patch.customUrl;
  }
  if (patch.touchUpdated === true) {
    payload.updated = new Date().toISOString();
  }
  return payload;
}

// ---------------------------------------------------------------------------
// Zod shapes
// ---------------------------------------------------------------------------

const identifier = z.string().min(1).max(MAX_IDENTIFIER_CHARS);
const blogId = identifier.describe("Blog ID, e.g. example.hatenablog.com");
const hatenaIdOverride = z
  .string()
  .min(1)
  .max(MAX_IDENTIFIER_CHARS)
  .optional()
  .describe("Override the Hatena ID supplied through HATENA_ID");
const contentTypeSchema = z
  .enum(["text/x-markdown", "text/x-hatena-syntax", "text/html"])
  .describe("Body syntax. Omit on create to use the blog's default.");

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

interface ListPagesArgs {
  blog_id: string;
  hatena_id?: string | undefined;
  page?: string | undefined;
  include_html?: boolean | undefined;
}

export async function listPagesHandler(
  args: ListPagesArgs,
  ctx: ToolContext,
): Promise<ToolTextResult> {
  try {
    const client = makeClient(ctx, args.blog_id, args.hatena_id);
    const listOpts: { page?: string } = {};
    if (args.page !== undefined) listOpts.page = args.page;
    const feed = await client.listPages(listOpts);
    return ok({
      pages: feed.pages.map((p) => pageView(p, args.include_html ?? false)),
      next_page: feed.nextPage,
    });
  } catch (err) {
    return toolError(err, { operation: "list_pages", requestId: ctx.requestId });
  }
}

interface GetPageArgs {
  blog_id: string;
  page_id: string;
  hatena_id?: string | undefined;
  include_html?: boolean | undefined;
}

export async function getPageHandler(args: GetPageArgs, ctx: ToolContext): Promise<ToolTextResult> {
  try {
    const client = makeClient(ctx, args.blog_id, args.hatena_id);
    const page = await client.getPage(args.page_id);
    return ok(pageView(page, args.include_html ?? false));
  } catch (err) {
    return toolError(err, { operation: "get_page", requestId: ctx.requestId });
  }
}

interface CreatePageArgs {
  blog_id: string;
  hatena_id?: string | undefined;
  title: string;
  content: string;
  content_type?: ContentType | undefined;
  draft?: boolean | undefined;
  preview?: boolean | undefined;
  updated?: string | undefined;
  custom_url: string;
}

export async function createPageHandler(
  args: CreatePageArgs,
  ctx: ToolContext,
): Promise<ToolTextResult> {
  try {
    const client = makeClient(ctx, args.blog_id, args.hatena_id);
    const payload: PageWritePayload = {
      title: args.title,
      content: args.content,
      customUrl: args.custom_url,
      control: {
        draft: args.draft ?? false,
        preview: args.preview ?? false,
      },
    };
    if (args.content_type !== undefined) payload.contentType = args.content_type;
    if (args.updated !== undefined) payload.updated = args.updated;
    const page = await client.createPage(payload);
    return ok(pageView(page, false));
  } catch (err) {
    return toolError(err, { operation: "create_page", requestId: ctx.requestId });
  }
}

interface UpdatePageArgs {
  blog_id: string;
  hatena_id?: string | undefined;
  page_id: string;
  title?: string | undefined;
  content?: string | undefined;
  draft?: boolean | undefined;
  preview?: boolean | undefined;
  custom_url?: string | undefined;
  touch_updated?: boolean | undefined;
  expected_edited?: string | undefined;
}

export async function updatePageHandler(
  args: UpdatePageArgs,
  ctx: ToolContext,
): Promise<ToolTextResult> {
  try {
    const client = makeClient(ctx, args.blog_id, args.hatena_id);
    const existing = await client.getPage(args.page_id);
    if (args.expected_edited !== undefined && existing.edited !== args.expected_edited) {
      return toolError(
        new Error(
          "An update conflict was detected. Fetch the latest state with get_page and try again.",
        ),
        { operation: "update_page", requestId: ctx.requestId },
      );
    }
    const patch: PagePatch = {};
    if (args.title !== undefined) patch.title = args.title;
    if (args.content !== undefined) patch.content = args.content;
    if (args.draft !== undefined) patch.draft = args.draft;
    if (args.preview !== undefined) patch.preview = args.preview;
    if (args.custom_url !== undefined) patch.customUrl = args.custom_url;
    if (args.touch_updated !== undefined) patch.touchUpdated = args.touch_updated;
    const payload = mergePage(existing, patch);
    const updated = await client.updatePage(args.page_id, payload);
    return ok(pageView(updated, false));
  } catch (err) {
    return toolError(err, { operation: "update_page", requestId: ctx.requestId });
  }
}

interface DeletePageArgs {
  blog_id: string;
  hatena_id?: string | undefined;
  page_id: string;
}

export async function deletePageHandler(
  args: DeletePageArgs,
  ctx: ToolContext,
): Promise<ToolTextResult> {
  try {
    const client = makeClient(ctx, args.blog_id, args.hatena_id);
    await client.deletePage(args.page_id);
    return ok({ ok: true });
  } catch (err) {
    return toolError(err, { operation: "delete_page", requestId: ctx.requestId });
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerPageTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "list_pages",
    {
      description: "List fixed pages. To get the next page, pass the returned next_page as page.",
      inputSchema: {
        blog_id: blogId,
        hatena_id: hatenaIdOverride,
        page: z
          .string()
          .max(MAX_IDENTIFIER_CHARS)
          .optional()
          .describe("next_page token from a previous response"),
        include_html: z.boolean().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    (args, extra) => listPagesHandler(args, withRequestSignal(ctx, extra?.signal)),
  );

  server.registerTool(
    "get_page",
    {
      description: "Get a single fixed page.",
      inputSchema: {
        blog_id: blogId,
        hatena_id: hatenaIdOverride,
        page_id: identifier,
        include_html: z.boolean().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    (args, extra) => getPageHandler(args, withRequestSignal(ctx, extra?.signal)),
  );

  server.registerTool(
    "create_page",
    {
      description: "Create a new fixed page. custom_url is the page slug and is required.",
      inputSchema: {
        blog_id: blogId,
        hatena_id: hatenaIdOverride,
        title: z.string().min(1).max(MAX_TITLE_CHARS),
        content: z.string().max(MAX_CONTENT_CHARS),
        content_type: contentTypeSchema.optional(),
        draft: z.boolean().optional(),
        preview: z.boolean().optional(),
        updated: z
          .string()
          .max(MAX_IDENTIFIER_CHARS)
          .optional()
          .describe("Publication date in ISO 8601. When omitted, Hatena's current time is used."),
        custom_url: z
          .string()
          .min(1)
          .max(MAX_IDENTIFIER_CHARS)
          .describe("Page slug (for example: about)"),
      },
    },
    (args, extra) => createPageHandler(args, withRequestSignal(ctx, extra?.signal)),
  );

  server.registerTool(
    "update_page",
    {
      description:
        "Partially update a fixed page. Only the specified fields are changed; unspecified fields keep their existing values (including the publication date, URL, and content syntax).",
      inputSchema: {
        blog_id: blogId,
        hatena_id: hatenaIdOverride,
        page_id: identifier,
        title: z.string().min(1).max(MAX_TITLE_CHARS).optional(),
        content: z.string().max(MAX_CONTENT_CHARS).optional(),
        draft: z.boolean().optional(),
        preview: z.boolean().optional(),
        custom_url: z.string().min(1).max(MAX_IDENTIFIER_CHARS).optional(),
        touch_updated: z
          .boolean()
          .optional()
          .describe("Only when true, sends the current time as updated (default false)"),
        expected_edited: z
          .string()
          .max(MAX_IDENTIFIER_CHARS)
          .optional()
          .describe(
            "The edited value returned by get_page. If it differs from the current value, the update is rejected as a conflict",
          ),
      },
      annotations: { destructiveHint: true },
    },
    (args, extra) => updatePageHandler(args, withRequestSignal(ctx, extra?.signal)),
  );

  server.registerTool(
    "delete_page",
    {
      description: "Delete a fixed page.",
      inputSchema: {
        blog_id: blogId,
        hatena_id: hatenaIdOverride,
        page_id: identifier,
      },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    (args, extra) => deletePageHandler(args, withRequestSignal(ctx, extra?.signal)),
  );
}
