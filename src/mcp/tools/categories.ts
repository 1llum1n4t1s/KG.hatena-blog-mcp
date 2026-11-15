import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MAX_IDENTIFIER_CHARS } from "../../utils/limits.js";
import { makeClient, type ToolContext, withRequestSignal } from "../context.js";
import { ok, type ToolTextResult, toolError } from "../response.js";

interface ListCategoriesArgs {
  blog_id: string;
  hatena_id?: string | undefined;
}

export async function listCategoriesHandler(
  args: ListCategoriesArgs,
  ctx: ToolContext,
): Promise<ToolTextResult> {
  try {
    const client = makeClient(ctx, args.blog_id, args.hatena_id);
    const doc = await client.listCategories();
    return ok({ categories: doc.categories, fixed: doc.fixed });
  } catch (err) {
    return toolError(err, { operation: "list_categories", requestId: ctx.requestId });
  }
}

export function registerCategoryTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "list_categories",
    {
      description:
        "List the blog's categories. When fixed=true, adding new categories is not allowed.",
      inputSchema: {
        blog_id: z
          .string()
          .min(1)
          .max(MAX_IDENTIFIER_CHARS)
          .describe("Blog ID, e.g. example.hatenablog.com"),
        hatena_id: z
          .string()
          .min(1)
          .max(MAX_IDENTIFIER_CHARS)
          .optional()
          .describe("Override the Hatena ID supplied through HATENA_ID"),
      },
      annotations: { readOnlyHint: true },
    },
    (args, extra) => listCategoriesHandler(args, withRequestSignal(ctx, extra?.signal)),
  );
}
