import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "./context.js";
import { registerCategoryTools } from "./tools/categories.js";
import { registerEntryTools } from "./tools/entries.js";
import { registerImageTools } from "./tools/images.js";
import { registerPageTools } from "./tools/pages.js";

/**
 * Server metadata reported via the MCP `initialize` handshake.
 *
 * Kept as a constant so the stdio adapter and test harnesses
 * see the same name/version without having to repeat string literals.
 */
export const SERVER_INFO = {
  name: "hatena-blog-mcp",
  version: "1.0.2",
} as const;

/**
 * Build a fresh {@link McpServer} scoped to the supplied credentials.
 *
 * Tool handlers close over `ctx.credentials`. The stdio adapter creates one
 * server per local process, so clients that use different Hatena accounts
 * must start separate processes rather than sharing one credential context.
 */
export function createServer(ctx: ToolContext): McpServer {
  const server = new McpServer(SERVER_INFO, {
    capabilities: {
      tools: {},
    },
  });
  registerEntryTools(server, ctx);
  registerPageTools(server, ctx);
  registerCategoryTools(server, ctx);
  registerImageTools(server, ctx);
  return server;
}
