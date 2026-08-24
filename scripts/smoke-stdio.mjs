import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";

const commandOptionIndex = process.argv.indexOf("--command");
const commandOption = commandOptionIndex >= 0 ? process.argv[commandOptionIndex + 1] : undefined;
if (commandOptionIndex >= 0 && !commandOption) {
  throw new Error("--command requires an executable path");
}

const cliPath = process.argv[2]
  ? resolve(process.argv[2])
  : fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const command = commandOption ? resolve(commandOption) : process.execPath;
const args = commandOption ? [] : [cliPath];
const transport = new StdioClientTransport({
  command,
  args,
  env: {
    ...getDefaultEnvironment(),
    HATENA_ID: "stdio-smoke-user",
    HATENA_API_KEY: "stdio-smoke-key",
  },
  stderr: "pipe",
});
transport.stderr?.pipe(process.stderr);

const client = new Client({ name: "hatena-blog-mcp-stdio-smoke", version: "1.0.0" });
try {
  await client.connect(transport);
  const result = await client.listTools();
  if (result.tools.length !== 13) {
    throw new Error(`Expected 13 tools, got ${result.tools.length}`);
  }

  const createEntry = result.tools.find((tool) => tool.name === "create_entry");
  if (!createEntry?.inputSchema.properties?.eyecatch_image_url) {
    throw new Error("create_entry is missing eyecatch_image_url");
  }
  const createPage = result.tools.find((tool) => tool.name === "create_page");
  if (!createPage?.inputSchema.properties?.updated) {
    throw new Error("create_page is missing updated");
  }
  console.log("stdio smoke: 13 tools, eyecatch_image_url, and create_page.updated are available");
} finally {
  await client.close();
}
