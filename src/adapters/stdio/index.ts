import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "../../mcp/server.js";
import { credentialsFromEnvironment, type HatenaEnvironment } from "../../utils/auth.js";

export function createStdioServer(env: HatenaEnvironment = process.env): McpServer {
  return createServer({ credentials: credentialsFromEnvironment(env) });
}

export async function runStdioServer(env: HatenaEnvironment = process.env): Promise<void> {
  const server = createStdioServer(env);
  await server.connect(new StdioServerTransport());
}
