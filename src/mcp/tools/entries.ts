import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AtomPubClient } from "../../atompub/client.js";
import type { ContentType, Entry, EntryWritePayload } from "../../atompub/types.js";
import {
  MAX_CATEGORY_CHARS,
  MAX_CATEGORY_COUNT,
  MAX_CONTENT_CHARS,
  MAX_IDENTIFIER_CHARS,
  MAX_TITLE_CHARS,
} from "../../utils/limits.js";
import { makeClient, type ToolContext, withRequestSignal } from "../context.js";
import { ok, type ToolTextResult, toolError } from "../response.js";

// ---------------------------------------------------------------------------
// Entry view shape (how we present entries back to the MCP client)
// ---------------------------------------------------------------------------

/**
 * Strip internals (atomId, empty strings, optional html) before shipping an
 * entry to the MCP client. Keeps the wire shape stable even if the XML layer
 * grows new fields.
 */
export function entryView(entry: Entry, includeHtml: boolean): Record<string, unknown> {
  const view: Record<string, unknown> = {
    id: entry.id,
    title: entry.title,
    author: entry.authorName,
    content: entry.content,
    content_type: entry.contentType,
    categories: entry.categories,
    draft: entry.control.draft,
    preview: entry.control.preview,
    updated: entry.updated,
  };
  if (entry.control.scheduled !== undefined) view.scheduled = entry.control.scheduled;
  if (entry.published !== undefined) view.published = entry.published;
  if (entry.edited !== undefined) view.edited = entry.edited;
  if (entry.url !== undefined) view.url = entry.url;
  if (entry.customUrl !== undefined) view.custom_url = entry.customUrl;
  if (includeHtml && entry.formattedContent !== undefined) {
    view.formatted_content = entry.formattedContent;
  }
  return view;
}

// ---------------------------------------------------------------------------
// mergeEntry — the heart of update_entry's partial-update semantics
// ---------------------------------------------------------------------------

export interface EntryPatch {
  title?: string;
  content?: string;
  eyecatchImageUrl?: string;
  categories?: string[];
  draft?: boolean;
  preview?: boolean;
  customUrl?: string;
  touchUpdated?: boolean;
}

const AUTO_EYECATCH_START = "<!-- hatena-blog-mcp:auto-eyecatch:start -->";
const AUTO_EYECATCH_END = "<!-- hatena-blog-mcp:auto-eyecatch:end -->";
const AUTO_EYECATCH_BLOCK_PATTERN =
  /^<!-- hatena-blog-mcp:auto-eyecatch:start -->\r?\n[\s\S]*?\r?\n<!-- hatena-blog-mcp:auto-eyecatch:end -->(?:\r?\n){0,2}/;

function parseEyecatchImageUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(
      "eyecatch_image_url must be an http or https image URL that contains no credentials.",
    );
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username !== "" ||
    parsed.password !== ""
  ) {
    throw new Error(
      "eyecatch_image_url must be an http or https image URL that contains no credentials.",
    );
  }
  return parsed;
}

function isSupportedEyecatchImageUrl(value: string): boolean {
  try {
    parseEyecatchImageUrl(value);
    return true;
  } catch {
    return false;
  }
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * Add a visible lead image so Hatena can use its documented first-image
 * fallback for the entry's eyecatch. This does not set Hatena's private
 * eyecatch metadata. A marker pair lets a later call replace our prior block
 * instead of accumulating duplicate lead images.
 */
export function applyAutoEyecatch(content: string, imageUrl: string): string {
  const normalizedUrl = parseEyecatchImageUrl(imageUrl).href;
  const contentWithoutPriorBlock = content.replace(AUTO_EYECATCH_BLOCK_PATTERN, "");
  const block = `${AUTO_EYECATCH_START}\n<p><img src="${escapeHtmlAttribute(normalizedUrl)}" alt=""></p>\n${AUTO_EYECATCH_END}`;
  const result =
    contentWithoutPriorBlock.length === 0 ? block : `${block}\n\n${contentWithoutPriorBlock}`;
  if (result.length > MAX_CONTENT_CHARS) {
    throw new Error(
      `Adding the automatic eyecatch image would push the content over the ${MAX_CONTENT_CHARS}-character limit. Shorten the content.`,
    );
  }
  return result;
}

/**
 * Merge a user-supplied patch onto the existing entry, producing a payload
 * safe to PUT. Unspecified fields fall back to existing values — except for
 * `updated` (omitted unless `touchUpdated` is true) and `customUrl` (only
 * sent if the patch explicitly provides one, since omitting it preserves
 * the existing slug).
 *
 * **content_type MUST be taken from the existing entry** — Hatena will coerce
 * the body's syntax mode to match whatever we send, so changing it silently
 * flips Markdown into plain text (or vice versa).
 */
export function mergeEntry(existing: Entry, patch: EntryPatch): EntryWritePayload {
  const content = patch.content ?? existing.content;
  const payload: EntryWritePayload = {
    title: patch.title ?? existing.title,
    content:
      patch.eyecatchImageUrl === undefined
        ? content
        : applyAutoEyecatch(content, patch.eyecatchImageUrl),
    categories: patch.categories ?? existing.categories,
    control: {
      draft: patch.draft ?? existing.control.draft,
      preview: patch.preview ?? existing.control.preview,
      ...(existing.control.scheduled !== undefined
        ? { scheduled: existing.control.scheduled }
        : {}),
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
// Zod shapes (shared shape fragments keep tool definitions DRY)
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
const eyecatchImageUrlSchema = z
  .string()
  .url()
  .max(MAX_IDENTIFIER_CHARS)
  .refine(isSupportedEyecatchImageUrl, {
    message: "Specify an http or https image URL that contains no credentials.",
  })
  .describe(
    "Inserts an image at the start of the content so Hatena can pick it as the automatic eyecatch candidate. This does not set the official eyecatch field directly.",
  );

// ---------------------------------------------------------------------------
// Handlers (exported for direct unit testing without the MCP framework)
// ---------------------------------------------------------------------------

interface ListEntriesArgs {
  blog_id: string;
  hatena_id?: string | undefined;
  page?: string | undefined;
  include_html?: boolean | undefined;
}

export async function listEntriesHandler(
  args: ListEntriesArgs,
  ctx: ToolContext,
): Promise<ToolTextResult> {
  try {
    const client = makeClient(ctx, args.blog_id, args.hatena_id);
    const listOpts: { page?: string } = {};
    if (args.page !== undefined) listOpts.page = args.page;
    const feed = await client.listEntries(listOpts);
    return ok({
      entries: feed.entries.map((e) => entryView(e, args.include_html ?? false)),
      next_page: feed.nextPage,
    });
  } catch (err) {
    return toolError(err, { operation: "list_entries", requestId: ctx.requestId });
  }
}

interface GetEntryArgs {
  blog_id: string;
  entry_id: string;
  hatena_id?: string | undefined;
  include_html?: boolean | undefined;
}

export async function getEntryHandler(
  args: GetEntryArgs,
  ctx: ToolContext,
): Promise<ToolTextResult> {
  try {
    const client = makeClient(ctx, args.blog_id, args.hatena_id);
    const entry = await client.getEntry(args.entry_id);
    return ok(entryView(entry, args.include_html ?? false));
  } catch (err) {
    return toolError(err, { operation: "get_entry", requestId: ctx.requestId });
  }
}

interface CreateEntryArgs {
  blog_id: string;
  hatena_id?: string | undefined;
  title: string;
  content: string;
  content_type?: ContentType | undefined;
  eyecatch_image_url?: string | undefined;
  categories?: string[] | undefined;
  draft?: boolean | undefined;
  preview?: boolean | undefined;
  scheduled?: boolean | undefined;
  updated?: string | undefined;
  custom_url?: string | undefined;
}

export async function createEntryHandler(
  args: CreateEntryArgs,
  ctx: ToolContext,
): Promise<ToolTextResult> {
  try {
    if (args.scheduled === true && (args.updated === undefined || args.draft !== true)) {
      return toolError(
        new Error(
          "When scheduled=true, also specify draft=true and updated (the ISO 8601 publication date).",
        ),
        { operation: "create_entry", requestId: ctx.requestId },
      );
    }
    const client = makeClient(ctx, args.blog_id, args.hatena_id);
    const payload: EntryWritePayload = {
      title: args.title,
      content:
        args.eyecatch_image_url === undefined
          ? args.content
          : applyAutoEyecatch(args.content, args.eyecatch_image_url),
      control: {
        draft: args.draft ?? false,
        preview: args.preview ?? false,
        scheduled: args.scheduled ?? false,
      },
    };
    if (args.content_type !== undefined) payload.contentType = args.content_type;
    if (args.categories !== undefined) payload.categories = args.categories;
    if (args.updated !== undefined) payload.updated = args.updated;
    if (args.custom_url !== undefined) payload.customUrl = args.custom_url;
    const entry = await client.createEntry(payload);
    return ok(entryView(entry, false));
  } catch (err) {
    return toolError(err, { operation: "create_entry", requestId: ctx.requestId });
  }
}

interface UpdateEntryArgs {
  blog_id: string;
  hatena_id?: string | undefined;
  entry_id: string;
  title?: string | undefined;
  content?: string | undefined;
  eyecatch_image_url?: string | undefined;
  categories?: string[] | undefined;
  draft?: boolean | undefined;
  preview?: boolean | undefined;
  custom_url?: string | undefined;
  touch_updated?: boolean | undefined;
  expected_edited?: string | undefined;
}

export async function updateEntryHandler(
  args: UpdateEntryArgs,
  ctx: ToolContext,
): Promise<ToolTextResult> {
  try {
    const client = makeClient(ctx, args.blog_id, args.hatena_id);
    const existing = await client.getEntry(args.entry_id);
    if (args.expected_edited !== undefined && existing.edited !== args.expected_edited) {
      return toolError(
        new Error(
          "An update conflict was detected. Fetch the latest state with get_entry and try again.",
        ),
        { operation: "update_entry", requestId: ctx.requestId },
      );
    }
    const patch: EntryPatch = {};
    if (args.title !== undefined) patch.title = args.title;
    if (args.content !== undefined) patch.content = args.content;
    if (args.eyecatch_image_url !== undefined) {
      patch.eyecatchImageUrl = args.eyecatch_image_url;
    }
    if (args.categories !== undefined) patch.categories = args.categories;
    if (args.draft !== undefined) patch.draft = args.draft;
    if (args.preview !== undefined) patch.preview = args.preview;
    if (args.custom_url !== undefined) patch.customUrl = args.custom_url;
    if (args.touch_updated !== undefined) patch.touchUpdated = args.touch_updated;
    const payload = mergeEntry(existing, patch);
    const updated = await client.updateEntry(args.entry_id, payload);
    return ok(entryView(updated, false));
  } catch (err) {
    return toolError(err, { operation: "update_entry", requestId: ctx.requestId });
  }
}

interface DeleteEntryArgs {
  blog_id: string;
  hatena_id?: string | undefined;
  entry_id: string;
}

export async function deleteEntryHandler(
  args: DeleteEntryArgs,
  ctx: ToolContext,
): Promise<ToolTextResult> {
  try {
    const client = makeClient(ctx, args.blog_id, args.hatena_id);
    await client.deleteEntry(args.entry_id);
    return ok({ ok: true });
  } catch (err) {
    return toolError(err, { operation: "delete_entry", requestId: ctx.requestId });
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerEntryTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "list_entries",
    {
      description:
        "List blog entries, 7 per page. To get the next page, pass the returned next_page as page.",
      inputSchema: {
        blog_id: blogId,
        hatena_id: hatenaIdOverride,
        page: z
          .string()
          .max(MAX_IDENTIFIER_CHARS)
          .optional()
          .describe("next_page token from a previous response"),
        include_html: z
          .boolean()
          .optional()
          .describe("Include the rendered HTML (hatena:formatted-content) in each entry"),
      },
      annotations: { readOnlyHint: true },
    },
    (args, extra) => listEntriesHandler(args, withRequestSignal(ctx, extra?.signal)),
  );

  server.registerTool(
    "get_entry",
    {
      description: "Get a single entry.",
      inputSchema: {
        blog_id: blogId,
        hatena_id: hatenaIdOverride,
        entry_id: identifier,
        include_html: z.boolean().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    (args, extra) => getEntryHandler(args, withRequestSignal(ctx, extra?.signal)),
  );

  server.registerTool(
    "create_entry",
    {
      description: "Create a new entry.",
      inputSchema: {
        blog_id: blogId,
        hatena_id: hatenaIdOverride,
        title: z.string().min(1).max(MAX_TITLE_CHARS),
        content: z.string().max(MAX_CONTENT_CHARS),
        content_type: contentTypeSchema.optional(),
        eyecatch_image_url: eyecatchImageUrlSchema.optional(),
        categories: z.array(z.string().max(MAX_CATEGORY_CHARS)).max(MAX_CATEGORY_COUNT).optional(),
        draft: z.boolean().optional(),
        preview: z.boolean().optional(),
        scheduled: z.boolean().optional().describe("true requires draft=true and updated."),
        updated: z
          .string()
          .max(MAX_IDENTIFIER_CHARS)
          .optional()
          .describe("ISO-8601. Required when scheduled=true."),
        custom_url: z.string().min(1).max(MAX_IDENTIFIER_CHARS).optional(),
      },
    },
    (args, extra) => createEntryHandler(args, withRequestSignal(ctx, extra?.signal)),
  );

  server.registerTool(
    "update_entry",
    {
      description:
        "Partially update an entry. Only the specified fields are changed; unspecified fields keep their existing values (including the publication date, URL, and content syntax).",
      inputSchema: {
        blog_id: blogId,
        hatena_id: hatenaIdOverride,
        entry_id: identifier,
        title: z.string().min(1).max(MAX_TITLE_CHARS).optional(),
        content: z.string().max(MAX_CONTENT_CHARS).optional(),
        eyecatch_image_url: eyecatchImageUrlSchema.optional(),
        categories: z
          .array(z.string().max(MAX_CATEGORY_CHARS))
          .max(MAX_CATEGORY_COUNT)
          .optional()
          .describe("Pass an empty array [] to clear the categories"),
        draft: z.boolean().optional(),
        preview: z.boolean().optional(),
        custom_url: z.string().min(1).max(MAX_IDENTIFIER_CHARS).optional(),
        touch_updated: z
          .boolean()
          .optional()
          .describe(
            "Only when true, sends the current time as updated (default false = keep the publication date)",
          ),
        expected_edited: z
          .string()
          .max(MAX_IDENTIFIER_CHARS)
          .optional()
          .describe(
            "The edited value returned by get_entry. If it differs from the current value, the update is rejected as a conflict",
          ),
      },
      annotations: { destructiveHint: true },
    },
    (args, extra) => updateEntryHandler(args, withRequestSignal(ctx, extra?.signal)),
  );

  server.registerTool(
    "delete_entry",
    {
      description: "Delete an entry.",
      inputSchema: {
        blog_id: blogId,
        hatena_id: hatenaIdOverride,
        entry_id: identifier,
      },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    (args, extra) => deleteEntryHandler(args, withRequestSignal(ctx, extra?.signal)),
  );
}

// Re-export for convenience when other modules want the same client factory.
export type { AtomPubClient };
